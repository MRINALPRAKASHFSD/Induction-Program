import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import * as React from 'react';
import { OtpEmail } from '../src/components/emails/otp-email';

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



// Initialize Resend ONCE at module level
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromEmail = process.env.EMAIL_FROM || 'KRMU Induction <onboarding@resend.dev>';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!firebaseInitialized) {
    return res.status(500).json({ error: `Backend configuration error: ${firebaseInitError}` });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    const db = getFirestore();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Run Firestore write and email send IN PARALLEL for speed
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000));
    
    const firestorePromise = db.collection('otp_sessions').doc(email.toLowerCase()).set({
      otp,
      expiresAt,
      attempts: 0
    });

    let emailPromise: Promise<any>;
    if (resend) {
      emailPromise = resend.emails.send({
        from: fromEmail,
        to: email,
        subject: 'Your Verification Code — Aarambh 2026',
        react: React.createElement(OtpEmail, { otp }),
      });
    } else {
      console.log(`\n=========================================`);
      console.log(`\n🔥 DEV MODE OTP for ${email}: ${otp}\n`);
      console.log(`=========================================\n`);
      emailPromise = Promise.resolve();
    }

    await Promise.all([firestorePromise, emailPromise]);
    console.log(`OTP sent to ${email}`);

    return res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error: any) {
    console.error("OTP Send Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
