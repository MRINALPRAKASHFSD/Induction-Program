import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Firebase Admin Singleton ──────────────────────────────────────────────────
let firebaseInitialized = false;
try {
  if (!getApps().length) {
    if (
      !process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_CLIENT_EMAIL ||
      !process.env.FIREBASE_PRIVATE_KEY
    ) {
      throw new Error('Missing Firebase Admin credentials.');
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  firebaseInitialized = true;
} catch (e: any) {
  console.error('[landing-auth] Firebase Admin init error:', e.message);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!firebaseInitialized) {
    return res.status(500).json({ ok: false, error: 'Firebase Admin not initialized.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Missing or invalid Bearer token.' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let uid: string;

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Invalid token.' });
  }

  const { action, password } = req.body || {};

  if (action === 'lock') {
    try {
      const userRecord = await getAuth().getUser(uid);
      const currentClaims = userRecord.customClaims || {};
      
      // Remove the landing_super_admin claim but keep all others
      if (currentClaims.landing_super_admin !== undefined) {
        delete currentClaims.landing_super_admin;
        await getAuth().setCustomUserClaims(uid, currentClaims);
      }
      
      return res.status(200).json({ ok: true, message: 'Edit mode locked.' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: 'Failed to revoke claim.' });
    }
  }

  if (action === 'unlock') {
    if (!password) {
      return res.status(400).json({ ok: false, error: 'Password required.' });
    }

    const SUPER_PASSWORD = process.env.LANDING_SUPER_PASSWORD;
    if (!SUPER_PASSWORD) {
      return res.status(500).json({ ok: false, error: 'Server misconfiguration: No super password set.' });
    }

    if (password !== SUPER_PASSWORD) {
      return res.status(403).json({ ok: false, error: 'Forbidden: Incorrect password.' });
    }

    try {
      const userRecord = await getAuth().getUser(uid);
      const currentClaims = userRecord.customClaims || {};
      
      // Preserve existing claims and add the new one
      const updatedClaims = {
        ...currentClaims,
        landing_super_admin: true
      };

      await getAuth().setCustomUserClaims(uid, updatedClaims);
      return res.status(200).json({ ok: true, message: 'Edit mode unlocked.' });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: 'Failed to set custom claim.' });
    }
  }

  return res.status(400).json({ ok: false, error: 'Invalid action.' });
}
