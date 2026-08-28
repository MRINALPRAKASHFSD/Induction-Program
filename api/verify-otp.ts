import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

let firebaseInitialized = false;
let firebaseInitError = "";

try {
  if (!getApps().length) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error("Missing Firebase Admin credentials in environment variables.");
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
  console.error("Firebase Admin Initialization Error:", e);
  firebaseInitError = e.message;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!firebaseInitialized) {
    return res.status(500).json({ error: `Backend configuration error: ${firebaseInitError}` });
  }

  const { email, otp } = req.body || {};
  if (!email || !otp || typeof email !== 'string' || typeof otp !== 'string') {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  try {
    const db = getFirestore();
    const emailKey = email.toLowerCase().trim();
    const docRef = db.collection('otp_sessions').doc(emailKey);
    
    // We use a transaction to prevent brute-forcing
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) {
        return { ok: false, error: 'OTP session expired or not found. Please request a new code.' };
      }

      const data = doc.data()!;
      if (data.attempts >= 3) {
        transaction.delete(docRef);
        return { ok: false, error: 'Too many failed attempts. Please request a new code.' };
      }

      if (data.expiresAt.toDate() < new Date()) {
        transaction.delete(docRef);
        return { ok: false, error: 'OTP expired. Please request a new code.' };
      }

      if (data.otp !== otp.trim()) {
        transaction.update(docRef, { attempts: data.attempts + 1 });
        return { ok: false, error: 'Invalid OTP' };
      }

      // Valid OTP! Delete it to prevent reuse
      transaction.delete(docRef);
      return { ok: true };
    });

    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    // ── Generate Firebase Custom Token (for client-side signInWithCustomToken) ──
    const uid = `email:${emailKey}`;
    
    // We generate the custom token manually using jsonwebtoken to avoid the firebase-admin/auth 
    // ESM conflict on Vercel Node 18+ environments which causes HTTP 500 errors.
    const now = Math.floor(Date.now() / 1000);
    const customToken = jwt.sign(
      {
        iss: process.env.FIREBASE_CLIENT_EMAIL,
        sub: process.env.FIREBASE_CLIENT_EMAIL,
        aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        iat: now,
        exp: now + 3600,
        uid: uid,
      },
      process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      { algorithm: 'RS256' }
    );

    // ── Generate a short-lived Firestore-backed registration session token ──────
    // This token is sent in the Authorization header during /api/register
    // and verified by looking it up in Firestore — avoids firebase-admin/auth entirely.
    const regToken = crypto.randomBytes(32).toString('hex');
    const sessionRef = db.collection('registration_sessions').doc(emailKey);
    await sessionRef.set({
      token: regToken,
      email: emailKey,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)), // 10 minutes
    });

    // ── Check if this email belongs to an already-registered student ──────
    const emailIndexSnap = await db.collection('email_index').doc(emailKey).get();
    let userExists = emailIndexSnap.exists;
    let enrollmentNo: string | null = userExists
      ? (emailIndexSnap.data()!.enrollment_no as string || emailIndexSnap.data()!.application_number as string)
      : null;

    if (!userExists) {
      // Fallback: Check if student exists in main collection directly
      const studentQuery = await db.collection('students').where('email', '==', emailKey).limit(1).get();
      if (!studentQuery.empty) {
        userExists = true;
        enrollmentNo = studentQuery.docs[0].id;
      }
    }

    return res.status(200).json({
      success: true,
      customToken,  // for signInWithCustomToken on client
      regToken,     // for /api/register Authorization header
      userExists,
      enrollmentNo,
    });
  } catch (error: any) {
    console.error("OTP Verify Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
