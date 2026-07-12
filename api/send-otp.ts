import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';

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
const fromEmail = process.env.EMAIL_FROM || 'Aarambh Induction <induction@mrinalprakash.com>';

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
        replyTo: 'induction@mrinalprakash.com',
        subject: 'Your Verification Code — Aarambh 2026',
        text: `Your Verification Code is: ${otp}\n\nExpires in 5 minutes.\nDo not share this code.`,
        html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html dir="ltr" lang="en"><head><meta content="text/html; charset=UTF-8" http-equiv="Content-Type"/><meta name="x-apple-disable-message-reformatting"/></head><body style="background-color:#f8f4ef;padding:0"><!--\$--><!--html--><!--head--><div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0" data-skip-in-text="true">Your Verification Code — Aarambh 2026<div> ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿</div></div><!--body--><table border="0" width="100%" cellPadding="0" cellSpacing="0" role="presentation" align="center"><tbody><tr><td style="background-color:#f8f4ef;font-family:&#x27;Segoe UI&#x27;,Roboto,Arial,sans-serif;padding:40px 16px"><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="max-width:520px;margin:0 auto;width:100%"><tbody><tr style="width:100%"><td><div style="height:6px;background:linear-gradient(90deg,#5a1018,#8b2c1a,#c87038,#d4a254);border-radius:8px 8px 0 0"></div><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="background-color:#ffffff;padding:40px 36px 36px;border-left:1px solid #ede4d8;border-right:1px solid #ede4d8"><tbody><tr><td><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="text-align:center"><tbody><tr><td><h1 style="font-family:&#x27;Georgia&#x27;,serif;font-size:28px;font-weight:700;color:#5a1018;letter-spacing:2px;margin:0;padding-bottom:8px">AARAMBH</h1><p style="font-size:11px;line-height:24px;letter-spacing:3px;text-transform:uppercase;color:#b08850;font-weight:600;margin:0;padding-bottom:28px;margin-top:0;margin-bottom:0;margin-left:0;margin-right:0">KR Mangalam University • 2026</p></td></tr></tbody></table><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="text-align:center;padding-bottom:28px"><tbody><tr><td><div style="width:60px;height:2px;background:linear-gradient(90deg,transparent,#c87038,transparent);margin:0 auto"></div></td></tr></tbody></table><p style="font-size:16px;line-height:1.7;color:#2d0d12;margin:0;padding-bottom:12px;margin-top:0;margin-bottom:0;margin-left:0;margin-right:0">Hello there,</p><p style="font-size:15px;line-height:1.7;color:#555;margin:0;padding-bottom:32px;margin-top:0;margin-bottom:0;margin-left:0;margin-right:0">Use the code below to verify your email and complete your registration for the KRMU Induction program.</p><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="text-align:center;padding-bottom:32px"><tbody><tr><td><div style="background:linear-gradient(135deg,#5a1018 0%,#7b2018 50%,#5a1018 100%);border-radius:16px;padding:28px 48px;display:inline-block"><p style="font-size:42px;line-height:24px;font-weight:800;letter-spacing:14px;color:#ffffff;font-family:&#x27;SF Mono&#x27;,&#x27;Fira Code&#x27;,&#x27;Courier New&#x27;,monospace;text-shadow:0 2px 8px rgba(0,0,0,0.3);margin:0;margin-top:0;margin-bottom:0;margin-left:0;margin-right:0">${otp}</p></div></td></tr></tbody></table><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="padding-bottom:28px"><tbody><tr><td><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation"><tbody style="width:100%"><tr style="width:100%"><td data-id="__react-email-column" style="width:16px;padding-right:8px"><div style="width:8px;height:8px;border-radius:50%;background-color:#c87038;display:inline-block;margin-top:4px"></div></td><td data-id="__react-email-column"><p style="font-size:13px;line-height:24px;color:#888;margin:0;margin-top:0;margin-bottom:0;margin-left:0;margin-right:0">This code expires in <span style="color:#5a1018;font-weight:600">5 minutes</span></p></td></tr></tbody></table></td></tr></tbody></table><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="background-color:#fdf8f2;border:1px solid #ede4d8;border-radius:12px;padding:16px 20px"><tbody><tr><td><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation"><tbody style="width:100%"><tr style="width:100%"><td data-id="__react-email-column" style="width:20px;vertical-align:top;padding-right:12px"><p style="font-size:16px;line-height:24px;margin:0;margin-top:0;margin-bottom:0;margin-left:0;margin-right:0">🔒</p></td><td data-id="__react-email-column"><p style="font-size:12px;line-height:1.6;color:#8c6239;margin:0;margin-top:0;margin-bottom:0;margin-left:0;margin-right:0">If you didn&#x27;t request this code, you can safely ignore this email. Someone may have entered your email by mistake.</p></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="background-color:#2d0d12;padding:24px 36px;border-radius:0 0 8px 8px;text-align:center"><tbody><tr><td><p style="font-size:13px;line-height:24px;color:#d4a254;font-weight:600;letter-spacing:1px;margin:0;padding-bottom:8px;margin-top:0;margin-bottom:0;margin-left:0;margin-right:0">KRMU Induction 2026</p><p style="font-size:11px;line-height:1.6;color:#8b6e55;margin:0;margin-top:0;margin-bottom:0;margin-left:0;margin-right:0">KR Mangalam University, Sohna Road, Gurugram, Haryana<br/>© 2026 All rights reserved</p></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table><!--/\$--></body></html>
`,
      });
      emailPromise = emailPromise.then((res: any) => {
        if (res.error) {
          console.error("Resend API Error:", res.error);
          throw new Error(res.error.message);
        }
        return res.data;
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
