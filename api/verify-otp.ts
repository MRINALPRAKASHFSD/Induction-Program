import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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
    const docRef = db.collection('otp_sessions').doc(email.toLowerCase());
    
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

    // OTP is valid. Get or create Firebase Auth user
    const auth = getAuth();
    let uid;
    try {
      const user = await auth.getUserByEmail(email);
      uid = user.uid;
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        const newUser = await auth.createUser({
          email: email.toLowerCase(),
          emailVerified: true
        });
        uid = newUser.uid;
      } else {
        throw error;
      }
    }

    // Generate Custom Token for the client
    const customToken = await auth.createCustomToken(uid);
    
    return res.status(200).json({ success: true, customToken });
  } catch (error: any) {
    console.error("OTP Verify Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
