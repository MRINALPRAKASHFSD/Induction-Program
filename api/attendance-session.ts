/**
 * api/attendance-session.ts
 *
 * Admin-only CRUD for attendance sessions.
 *
 * Endpoints (via method + action body param):
 *   POST   { action: "create", ...fields }  → Create new attendance session
 *   POST   { action: "update_status", sessionId, status }  → Start/Pause/Resume/End/Lock
 *   POST   { action: "list" }               → List all sessions with stats
 *   POST   { action: "get", sessionId }     → Get single session details
 *
 * All operations require admin JWT (super_admin or coordinator role).
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import crypto from 'crypto';

// ── Firebase Admin singleton ──────────────────────────────────────────────────
let firebaseInitialized = false;

try {
  if (!getApps().length) {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
  }
  firebaseInitialized = true;
} catch (e: any) {
  console.error('Firebase Admin Init Error (attendance-session):', e.message);
}

// ── Valid status transitions ──────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['active'],
  active: ['paused', 'ended', 'locked'],
  paused: ['active', 'ended', 'locked'],
  ended: ['locked'],
  locked: [], // terminal state
};

// ── Default campus geofence center ────────────────────────────────────────────
const DEFAULT_CAMPUS = {
  lat: parseFloat(process.env.CAMPUS_LAT || '28.4089'),
  lng: parseFloat(process.env.CAMPUS_LNG || '77.0420'),
};

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!firebaseInitialized) return res.status(500).json({ error: 'Backend not configured' });

  // ── Auth: Verify admin role ───────────────────────────────────────────────
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let decodedToken;
  try {
    decodedToken = await verifyFirebaseIdToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const role = decodedToken.role;
  if (role !== 'super_admin' && role !== 'coordinator') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const { action } = req.body ?? {};
  const db = getFirestore();

  try {
    switch (action) {
      // ── CREATE ──────────────────────────────────────────────────────────────
      case 'create': {
        const {
          event_id,
          programme_id,
          programme_name,
          venue,
          date,
          starts_at,
          ends_at,
          attendance_window_minutes = 60,
          qr_rotation_interval_seconds = 30,
          geoFencingMode = 'disabled',
          campusLatitude,
          campusLongitude,
          allowedRadius = 300,
        } = req.body;

        if (!event_id || !programme_id || !programme_name || !venue || !starts_at || !ends_at) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        const sessionId = `sess_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const sessionData = {
          event_id,
          programme_id,
          programme_name,
          venue,
          date: date || new Date(starts_at).toISOString().split('T')[0],
          starts_at,
          ends_at,
          attendance_window_minutes: Number(attendance_window_minutes),
          qr_rotation_interval_seconds: Math.max(15, Math.min(120, Number(qr_rotation_interval_seconds))),
          geoFencingMode: ['disabled', 'log_only', 'strict'].includes(geoFencingMode) ? geoFencingMode : 'disabled',
          campusLatitude: campusLatitude ? Number(campusLatitude) : DEFAULT_CAMPUS.lat,
          campusLongitude: campusLongitude ? Number(campusLongitude) : DEFAULT_CAMPUS.lng,
          allowedRadius: Math.max(25, Math.min(1000, Number(allowedRadius))),
          status: 'pending' as const,
          // v2 Token Architecture: QR token is stored in Redis (not Firestore).
          // current_qr_token tracks the most recently issued token reference for admin display.
          // qr_rotation_id increments on every rotation for audit and fraud analysis.
          current_qr_token: null,
          current_qr_generated_at: null,
          qr_rotation_id: 0,
          total_present: 0,
          created_by: decodedToken.uid,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        };

        // Create the session document (single write — no secrets subcollection needed in v2)
        const sessionRef = db.collection('attendance_sessions').doc(sessionId);
        await sessionRef.set(sessionData);

        return res.status(201).json({
          ok: true,
          sessionId,
          session: { id: sessionId, ...sessionData },
        });
      }

      // ── UPDATE STATUS ───────────────────────────────────────────────────────
      case 'update_status': {
        const { sessionId, status: newStatus } = req.body;
        if (!sessionId || !newStatus) {
          return res.status(400).json({ error: 'Missing sessionId or status' });
        }

        const sessionRef = db.collection('attendance_sessions').doc(sessionId);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) {
          return res.status(404).json({ error: 'Session not found' });
        }

        const currentStatus = sessionDoc.data()!.status as string;
        const allowed = VALID_TRANSITIONS[currentStatus] || [];

        if (!allowed.includes(newStatus)) {
          return res.status(400).json({
            error: `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowed.join(', ') || 'none'}`,
          });
        }

        await sessionRef.update({
          status: newStatus,
          updated_at: FieldValue.serverTimestamp(),
        });

        return res.status(200).json({ ok: true, status: newStatus });
      }

      // ── LIST ────────────────────────────────────────────────────────────────
      case 'list': {
        const snap = await db
          .collection('attendance_sessions')
          .orderBy('created_at', 'desc')
          .limit(50)
          .get();

        const sessions = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          created_at: d.data().created_at?.toDate?.()?.toISOString() || null,
          updated_at: d.data().updated_at?.toDate?.()?.toISOString() || null,
        }));

        return res.status(200).json({ ok: true, sessions });
      }

      // ── GET SINGLE ──────────────────────────────────────────────────────────
      case 'get': {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

        const sessionDoc = await db.collection('attendance_sessions').doc(sessionId).get();
        if (!sessionDoc.exists) return res.status(404).json({ error: 'Session not found' });

        return res.status(200).json({
          ok: true,
          session: { id: sessionDoc.id, ...sessionDoc.data() },
        });
      }

      // ── VERIFY STUDENT (MANUAL ATTENDANCE) ──────────────────────────────────
      case 'verify_student': {
        const { enrollment_no } = req.body;
        if (!enrollment_no) return res.status(400).json({ error: 'Missing enrollment_no' });

        const cleanId = enrollment_no.trim().toUpperCase();
        let studentDoc = await db.collection('students').doc(cleanId).get();
        let student = studentDoc.exists ? studentDoc.data() : null;
        let isUnregistered = !studentDoc.exists;
        
        // If not in students, check induction_participants (the entire dataset)
        if (!student) {
          const participantDoc = await db.collection('induction_participants').doc(cleanId).get();
          if (participantDoc.exists) {
            student = participantDoc.data();
            isUnregistered = false; // We found them in the dataset
          }
        }

        return res.status(200).json({
          ok: true,
          student: {
            enrollment_no: cleanId,
            name: student?.full_name || student?.name || student?.student_name || 'Unregistered Student',
            course: student?.course ? (student?.program ? `${student.program} - ${student.course}` : student.course) : (student?.programme || 'Unknown'),
            section: student?.section || 'Unknown',
            photo: student?.photo || null,
            is_unregistered: isUnregistered
          }
        });
      }

      // ── FORCE MARK (MANUAL ATTENDANCE) ──────────────────────────────────────
      case 'force_mark': {
        const { sessionId, enrollment_no, reason } = req.body;
        if (!sessionId || !enrollment_no || !reason) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        const sessionRef = db.collection('attendance_sessions').doc(sessionId);
        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) return res.status(404).json({ error: 'Session not found' });
        
        const sessionStatus = sessionDoc.data()!.status;
        if (sessionStatus !== 'active') return res.status(400).json({ error: 'Session is not active' });

        const cleanId = enrollment_no.trim().toUpperCase();
        let studentDoc = await db.collection('students').doc(cleanId).get();
        let student = studentDoc.exists ? studentDoc.data() : null;
        
        if (!student) {
          const participantDoc = await db.collection('induction_participants').doc(cleanId).get();
          if (participantDoc.exists) {
            student = participantDoc.data();
          }
        }
        
        const logId = `${sessionId}_${cleanId}`;
        const logRef = db.collection('attendance_logs').doc(logId);

        const logDoc = await logRef.get();
        if (logDoc.exists) return res.status(400).json({ error: 'Student already marked present' });

        const studentName = student?.full_name || student?.name || student?.student_name || 'Unknown';
        const studentCourse = student?.course ? (student?.program ? `${student.program} - ${student.course}` : student.course) : (student?.programme || 'Unknown');
        const studentSection = student?.section || 'Unknown';

        await db.runTransaction(async (t) => {
          const sessionDocForTx = await t.get(sessionRef);
          const numShards = sessionDocForTx.exists ? (sessionDocForTx.data()?.num_shards || 64) : 64;

          t.set(logRef, {
            schema_version: 1,
            session_id: sessionId,
            student_id: cleanId,
            enrollment_no: cleanId,
            student_name: studentName,
            school: student?.school || '',
            department: student?.department_id || '',
            programme: student?.programme || student?.program || '',
            semester: student?.semester || '',
            section: studentSection,
            email: student?.email || '',
            scan_time: FieldValue.serverTimestamp(),
            qr_version: 0,
            scanner_device_id: decodedToken.uid,
            ip_address: 'admin_manual',
            user_agent: 'admin_panel',
            verification_result: 'admin_override',
            gps_mode: 'disabled',
            attendance_mode: 'manual',
            location_lat: null,
            location_lng: null,
            location_accuracy: null,
            distance_from_campus: null,
            manual_override_reason: reason,
            created_at: FieldValue.serverTimestamp(),
            marked_by_admin: decodedToken.uid
          });

          const shardId = Math.floor(Math.random() * numShards).toString();
          const shardRef = db.collection('attendance_stats').doc(sessionId).collection('shards').doc(shardId);
          
          t.set(shardRef, {
            total_present: FieldValue.increment(1)
          }, { merge: true });
        });

        return res.status(200).json({ ok: true });
      }

      // ── DELETE SESSION ────────────────────────────────────────────────────────
      case 'delete': {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

        const sessionRef = db.collection('attendance_sessions').doc(sessionId);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) {
          return res.status(404).json({ error: 'Session not found' });
        }

        // Delete associated attendance_logs in batches (Firestore batch limit = 500)
        const BATCH_SIZE = 400;
        let totalDeleted = 0;
        let hasMore = true;

        while (hasMore) {
          const logsSnap = await db.collection('attendance_logs')
            .where('session_id', '==', sessionId)
            .limit(BATCH_SIZE)
            .get();

          if (logsSnap.empty) {
            hasMore = false;
            break;
          }

          const batch = db.batch();
          logsSnap.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          totalDeleted += logsSnap.size;

          if (logsSnap.size < BATCH_SIZE) {
            hasMore = false;
          }
        }

        // Delete associated attendance_stats shards if they exist
        try {
          const statsRef = db.collection('attendance_stats').doc(sessionId);
          const shardsSnap = await statsRef.collection('shards').get();
          if (!shardsSnap.empty) {
            const shardBatch = db.batch();
            shardsSnap.docs.forEach(doc => shardBatch.delete(doc.ref));
            await shardBatch.commit();
          }
          await statsRef.delete();
        } catch { /* stats may not exist for all sessions */ }

        // Delete the session document itself
        await sessionRef.delete();

        console.log(`[attendance-session] Deleted session ${sessionId} and ${totalDeleted} attendance logs.`);

        return res.status(200).json({
          ok: true,
          deleted: { sessionId, attendanceLogs: totalDeleted },
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('attendance-session error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
