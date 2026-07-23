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
          geofence_radius_meters = 300,
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
          geofence_radius_meters: Math.max(100, Math.min(1000, Number(geofence_radius_meters))),
          geofence_center: DEFAULT_CAMPUS,
          status: 'pending' as const,
          current_qr_nonce: null,
          current_qr_generated_at: null,
          total_present: 0,
          created_by: decodedToken.uid,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        };

        const batch = db.batch();
        const sessionRef = db.collection('attendance_sessions').doc(sessionId);
        
        // 1. Create the session document
        batch.set(sessionRef, sessionData);

        // 2. Create the cryptographic secret for QR signing
        // This is isolated in a subcollection so rules can deny client access
        const secretRef = sessionRef.collection('secrets').doc('key');
        batch.set(secretRef, {
          session_secret: crypto.randomBytes(32).toString('hex'),
          created_at: FieldValue.serverTimestamp(),
        });

        await batch.commit();

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

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('attendance-session error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
