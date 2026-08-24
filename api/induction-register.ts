import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getRedis } from '../server/redis.js';
import { allocateRoom } from '../server/room-allocation.js';
import crypto from 'crypto';
import {
  PLANNER_ID,
  getParsedRooms,
  getSessionsByRoom,
  createInMemoryOccupancy,
  allocateStudent as runAllocationEngine,
} from '../services/deeksharambh-allocation-engine.js';

let firebaseInitialized = false;
let firebaseInitError = '';

try {
  if (!getApps().length) {
    if (
      !process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_CLIENT_EMAIL ||
      !process.env.FIREBASE_PRIVATE_KEY
    ) {
      throw new Error('Missing Firebase Admin credentials in environment variables.');
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    getFirestore().settings({ ignoreUndefinedProperties: true });
  }
  firebaseInitialized = true;
} catch (e: any) {
  console.error('[induction-register] Firebase Admin init error:', e.message);
  firebaseInitError = e.message;
}

// Fallback in-memory rate limiter (same pattern as register.ts)
const inMemoryRateLimits = new Map<string, { count: number; resetAt: number }>();

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const ipRaw = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const uaRaw = req.headers['user-agent'] || 'unknown';

  const ipHash = crypto.createHash('sha256').update(ipRaw).digest('hex');
  const deviceHash = crypto.createHash('sha256').update(uaRaw).digest('hex');

  if (!firebaseInitialized) {
    return res.status(500).json({ ok: false, error: `Backend configuration error: ${firebaseInitError}` });
  }

  const request_id = crypto.randomUUID();

  // ── 1. Extract and validate inputs ──────────────────────────────────────────
  const { application_number, email, auth_uid } = req.body;

  if (!application_number || !email) {
    return res.status(400).json({ ok: false, error: 'Missing application_number or email.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Missing token.' });
  }

  const regToken = authHeader.split('Bearer ')[1];

  const normalizedAppNo = application_number.trim().toUpperCase();
  const emailKey        = email.toLowerCase().trim();

  const db = getFirestore();

  // ── 2. Verify registration session token (same mechanism as register.ts) ───
  const sessionRef  = db.collection('registration_sessions').doc(emailKey);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    return res.status(401).json({ ok: false, error: 'Session expired or not found. Please verify your email again.' });
  }

  const sessionData = sessionSnap.data()!;

  if (sessionData.token !== regToken) {
    return res.status(401).json({ ok: false, error: 'Invalid session token.' });
  }

  if (sessionData.expiresAt.toDate() < new Date()) {
    await sessionRef.delete();
    return res.status(401).json({ ok: false, error: 'Session expired. Please verify your email again.' });
  }

  if (sessionData.email !== emailKey) {
    return res.status(403).json({ ok: false, error: 'Forbidden: Email mismatch.' });
  }

  // Single-use: delete session immediately
  await sessionRef.delete();

  // ── 3. Rate limiting (IP + email — same pattern as register.ts) ─────────────
  const windowMs = 60 * 1000;
  const nowMs = Date.now();

  const limits = [
    { key: `ireg:ip:${ipHash}`,       max: 10000 },
    { key: `ireg:email:${emailKey}`, max: 1000 },
  ];

  for (const { key, max } of limits) {
    try {
      const redis = getRedis();
      const current = await redis.incr(key);
      if (current === 1) await redis.expire(key, 60);
      if (current > max) {
        const db = getFirestore();
        db.collection('security_events').add({
          request_id,
          event_type: 'REGISTER_LIMIT',
          severity: 'WARNING',
          ip_hash: ipHash,
          device_hash: deviceHash,
          application_number: normalizedAppNo || null,
          timestamp: FieldValue.serverTimestamp(),
          metadata: { endpoint: '/api/induction-register', reason: 'Redis limit exceeded' }
        }).catch(e => console.error(e));
        return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
      }
    } catch {
      let record = inMemoryRateLimits.get(key);
      if (!record || record.resetAt < nowMs) {
        record = { count: 1, resetAt: nowMs + windowMs };
      } else {
        record.count++;
      }
      inMemoryRateLimits.set(key, record);
      if (record.count > max) {
        const db = getFirestore();
        db.collection('security_events').add({
          request_id,
          event_type: 'REGISTER_LIMIT',
          severity: 'WARNING',
          ip_hash: ipHash,
          device_hash: deviceHash,
          application_number: normalizedAppNo || null,
          timestamp: FieldValue.serverTimestamp(),
          metadata: { endpoint: '/api/induction-register', reason: 'Memory limit exceeded' }
        }).catch(e => console.error(e));
        return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
      }
    }
  }

  // ── 4. Fetch the induction participant record (source of truth) ─────────────
  const participantRef  = db.collection('induction_participants').doc(normalizedAppNo);
  const participantSnap = await participantRef.get();

  if (!participantSnap.exists) {
    return res.status(404).json({ ok: false, error: 'Application number not found in the induction dataset. Please use the standard registration form.' });
  }

  const participant = participantSnap.data()!;

  // Validate the email matches the stored record
  if (participant.email && participant.email.toLowerCase() !== emailKey) {
    return res.status(403).json({ ok: false, error: 'Email does not match the admission record for this Application Number.' });
  }

  // ── 5. Run Firestore transaction (mirrors register.ts structure exactly) ─────
  try {
    const result = await db.runTransaction(async (t) => {
      const emailRef      = db.collection('email_index').doc(emailKey);
      const enrollmentRef = db.collection('studentid_index').doc(normalizedAppNo);
      const phoneRef      = db.collection('phone_index').doc((participant.mobile || '').trim());
      const studentRef    = db.collection('students').doc(normalizedAppNo);

      // Read all uniqueness indexes + student doc
      const [emailSnap, enrollmentSnap, phoneSnap, studentSnap] = await Promise.all([
        t.get(emailRef),
        t.get(enrollmentRef),
        t.get(phoneRef),
        t.get(studentRef),
      ]);

      if (emailSnap.exists) {
        throw { status: 409, code: 'EMAIL_EXISTS', message: 'This email address is already registered. Please sign in instead.' };
      }

      if (enrollmentSnap.exists || studentSnap.exists) {
        const existing = enrollmentSnap.exists ? enrollmentSnap.data() : studentSnap.data();
        if (existing?.auth_uid && existing.auth_uid !== auth_uid) {
          throw { status: 409, code: 'ENROLLMENT_EXISTS', message: 'Your account has already been activated. Please sign in.' };
        }
        if (existing?.auth_uid && existing.auth_uid === auth_uid) {
          // Same device/UID, idempotent
          if (existing?.roomNumber || existing?.room_no) {
             const roomAssignment = {
                roomNumber: existing.roomNumber || existing.room_no,
                roomId: existing.roomId || existing.room_no,
                plannerId: existing.plannerId || null,
                block: existing.block || null,
                school: existing.department_id,
                capacity: existing.capacity || null,
                allocatedAt: existing.allocatedAt || existing.created_at,
                allocationStatus: existing.allocationStatus || 'ALLOCATED'
             };
             return { ok: true, student_id: normalizedAppNo, duplicate: true, roomAssignment };
          }
          db.collection('security_events').add({
            request_id,
            event_type: 'DUPLICATE_ACCOUNT',
            severity: 'INFO',
            ip_hash: ipHash,
            device_hash: deviceHash,
            application_number: normalizedAppNo,
            timestamp: FieldValue.serverTimestamp(),
            metadata: { endpoint: '/api/induction-register', auth_uid }
          }).catch(e => console.error(e));
          return { ok: true, student_id: normalizedAppNo, duplicate: true };
        }
      }

      if (phoneSnap.exists) {
        throw { status: 409, code: 'PHONE_EXISTS', message: 'This phone number is already associated with another account.' };
      }

      const now = new Date().toISOString();

      // ── Room allocation (same as register.ts) ────────────────────────────
      const roomAssignment = await allocateRoom(
        db, t, participant.school || '', participant.course || '', participant.program || '', normalizedAppNo,
      );

      // ── Write student document from induction participant data ────────────
      const studentPayload = Object.fromEntries(
        Object.entries({
          id:             normalizedAppNo,
          enrollment_no:  normalizedAppNo,
          full_name:      participant.student_name,
          department_id:  participant.school || '',
          branch_id:      participant.program || '',
          course:         participant.course || '',
          year:           1,
          points:         0,
          created_at:     now,
          auth_uid,
          
          roomNumber:     roomAssignment.roomNumber,
          roomId:         roomAssignment.roomId,
          plannerId:      roomAssignment.plannerId,
          block:          roomAssignment.block,
          capacity:       roomAssignment.capacity,
          allocatedAt:    roomAssignment.allocatedAt,
          allocationStatus: roomAssignment.allocationStatus,
          
          // Legacy fields for backward compat
          room_no:        roomAssignment.roomNumber ?? null,
          registration_source: 'induction_fast_track',
          registration_metadata: {
            ip_hash: ipHash,
            device_hash: deviceHash,
            user_agent: uaRaw,
            registered_at: now,
            registered_via: 'fast_track',
            dataset_id: participant.dataset_id || null,
            schema_version: '1.0'
          }
        }).filter(([_, v]) => v !== undefined)
      );

      t.set(studentRef, studentPayload, { merge: true });

      // ── Audit log: room_allocations ──────────────────────────────────────
      if (roomAssignment.allocationStatus === 'ALLOCATED') {
        const auditRef = db.collection('room_allocations').doc();
        t.set(auditRef, {
          studentUid:     normalizedAppNo,
          room:           roomAssignment.roomNumber,
          programme:      participant.program || '',
          planner:        roomAssignment.plannerId,
          allocatedBy:    'system',
          allocatedAt:    now,
          // Legacy fields
          application_number: normalizedAppNo,
          student_name:   participant.student_name || '',
          department_id:  participant.school || '',
          room_number:    roomAssignment.roomNumber,
          block:          roomAssignment.block,
          action:         'allocated',
          reason:         'induction_fast_track_registration',
          performed_by:   'system',
          allocated_at:   now,
        });
      }

      // ── Private sub-collection ────────────────────────────────────────────
      const privateRef = studentRef.collection('private').doc('contact');
      t.set(privateRef, { email: emailKey, phone: (participant.mobile || '').trim() });

      // ── Uniqueness indexes ────────────────────────────────────────────────
      t.set(emailRef,      { application_number: normalizedAppNo, created_at: now });
      t.set(enrollmentRef, { email: emailKey, auth_uid: auth_uid || null, created_at: now });
      if ((participant.mobile || '').trim()) {
        t.set(phoneRef, { application_number: normalizedAppNo, created_at: now });
      }

      // ── Update induction_participant registration_status ──────────────────
      t.update(participantRef, {
        registration_status: 'REGISTERED',
        registered_at: FieldValue.serverTimestamp(),
        auth_uid: auth_uid || null,
        registration_metadata: {
          ip_hash: ipHash,
          device_hash: deviceHash,
          user_agent_hash: deviceHash,
          registered_at: now,
          registered_via: 'fast_track',
          dataset_id: participant.dataset_id || null,
          schema_version: '1.0'
        }
      });

      db.collection('security_events').add({
        request_id,
        event_type: 'ACCOUNT_CREATED',
        severity: 'INFO',
        ip_hash: ipHash,
        device_hash: deviceHash,
        application_number: normalizedAppNo,
        timestamp: FieldValue.serverTimestamp(),
        metadata: { endpoint: '/api/induction-register' }
      }).catch(e => console.error(e));

      return { ok: true, student_id: normalizedAppNo, duplicate: false, roomAssignment };
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      action: 'induction_fast_track_registration',
      application_number: normalizedAppNo,
      email: emailKey,
      status: result.duplicate ? 'Duplicate(Idempotent)' : 'Success',
    }));

    // ── Auto-allocate room & schedule (non-blocking) ────────────────────────
    // Fires asynchronously so it NEVER delays or blocks the registration response.
    // If it fails, allocationStatus is updated to PENDING_REVIEW for admin review.
    if (!result.duplicate) {
      (async () => {
        try {
          const rooms          = getParsedRooms();
          const sessionsByRoom = getSessionsByRoom();
          // Per-registration occupancy: read current counts from Firestore
          // so we don't over-allocate relative to batch-migrated students.
          const countsSnap = await db
            .collection('induction_student_room_allocations')
            .where('plannerId', '==', PLANNER_ID)
            .get();
          const occupancy = createInMemoryOccupancy(rooms);
          for (const doc of countsSnap.docs) {
            const roomNum = doc.data().roomNumber;
            if (roomNum) occupancy.increment(roomNum);
          }

          // Build a minimal student object matching what the engine expects
          const studentObj = {
            id:            normalizedAppNo,
            email:         emailKey,
            department_id: participant.school   || '',
            course:        participant.course    || '',
            branch_id:     participant.program  || '',
          };

          const allocationResult = runAllocationEngine(studentObj, occupancy, rooms, sessionsByRoom);

          const allocDb = getFirestore();
          if (allocationResult.allocDoc) {
            // Write room allocation
            await allocDb
              .collection('induction_student_room_allocations')
              .doc(`${PLANNER_ID}_${normalizedAppNo}`)
              .set(allocationResult.allocDoc, { merge: true });

            // Write schedule (single doc per student)
            if (allocationResult.scheduleDoc && allocationResult.scheduleDoc.days.length > 0) {
              await allocDb
                .collection('induction_student_schedule')
                .doc(`${PLANNER_ID}_${normalizedAppNo}`)
                .set(allocationResult.scheduleDoc, { merge: true });
            }

            console.log(`[auto-alloc] ${normalizedAppNo} → ${allocationResult.allocDoc.roomNumber} (${allocationResult.allocDoc.allocationMethod})`);
          } else {
            // No room found — mark for admin review (do not block registration)
            await allocDb
              .collection('induction_student_room_allocations')
              .doc(`${PLANNER_ID}_${normalizedAppNo}`)
              .set({
                studentId:        normalizedAppNo,
                email:            emailKey,
                plannerId:        PLANNER_ID,
                allocationStatus: 'PENDING_REVIEW',
                reason:           allocationResult.reason || 'No matching room',
                updatedAt:        new Date().toISOString(),
              }, { merge: true });
            console.warn(`[auto-alloc] ${normalizedAppNo} could not be allocated: ${allocationResult.reason}`);
          }
        } catch (allocErr: any) {
          console.error('[auto-alloc] allocation failed for', normalizedAppNo, ':', allocErr.message);
        }
      })();
    }

    return res.status(200).json(result);
  } catch (error: any) {
    if (error.status && error.code) {
      return res.status(error.status).json({ ok: false, error: error.message, code: error.code });
    }
    console.error('[induction-register] Transaction error:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error during registration. Please try again.', code: 'SERVER_ERROR' });
  }
}
