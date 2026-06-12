import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

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

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    const db = getFirestore();
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits

    // Store in Firestore with a 5 minute expiration
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000));
    console.log(`Attempting to write OTP to Firestore for: ${email.toLowerCase()}`);
    await db.collection('otp_sessions').doc(email.toLowerCase()).set({
      otp,
      expiresAt,
      attempts: 0
    });
    console.log(`Successfully wrote OTP to Firestore for: ${email.toLowerCase()}`);

    // Setup Nodemailer
    let transporter;
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_PORT === "465",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    } else {
      console.warn("No SMTP_HOST found. Using Ethereal Email for testing.");
      console.log(`\n=========================================`);
      console.log(`\n\n🔥🔥🔥 DEVELOPMENT MODE: USE THIS OTP IN THE APP: ${otp} 🔥🔥🔥\n\n`);
      console.log(`=========================================\n`);
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    }

    const mailOptions = {
      from: '"KRMU Induction" <noreply@krmangalam.edu.in>',
      to: email,
      subject: "Your Registration OTP - KRMU Induction",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px;">
          <h2 style="color: #6a0b22; text-align: center; font-size: 24px; margin-bottom: 20px;">KRMU Induction</h2>
          <p style="font-size: 16px; color: #333;">Hello,</p>
          <p style="font-size: 16px; color: #333;">Use the following 6-digit One Time Password (OTP) to verify your email and complete your registration for the KRMU Induction program.</p>
          <div style="background-color: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center; margin: 30px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #6a0b22;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #666; margin-top: 30px;">This code will expire in 5 minutes. If you did not request this code, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">© 2026 KR Mangalam University. All rights reserved.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    if (!process.env.SMTP_HOST) {
      console.log("Preview OTP Email URL: %s", nodemailer.getTestMessageUrl(info));
    }

    return res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error: any) {
    console.error("OTP Send Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
