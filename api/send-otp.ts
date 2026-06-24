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

function buildOtpEmail(otp: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8f4ef;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f4ef;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <!-- Top accent bar -->
        <tr><td style="height:6px;background:linear-gradient(90deg,#5a1018,#8b2c1a,#c87038,#d4a254);border-radius:8px 8px 0 0;"></td></tr>

        <!-- Main Card -->
        <tr><td style="background-color:#ffffff;padding:40px 36px 36px;border-left:1px solid #ede4d8;border-right:1px solid #ede4d8;">

          <!-- Logo / Brand -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:8px;">
              <div style="font-family:'Georgia',serif;font-size:28px;font-weight:700;color:#5a1018;letter-spacing:2px;">AARAMBH</div>
            </td></tr>
            <tr><td align="center" style="padding-bottom:28px;">
              <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#b08850;font-weight:600;">KR Mangalam University &bull; 2026</div>
            </td></tr>
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:28px;">
              <div style="width:60px;height:2px;background:linear-gradient(90deg,transparent,#c87038,transparent);"></div>
            </td></tr>
          </table>

          <!-- Greeting -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:16px;color:#2d0d12;line-height:1.7;padding-bottom:12px;">
              Hello there,
            </td></tr>
            <tr><td style="font-size:15px;color:#555;line-height:1.7;padding-bottom:32px;">
              Use the code below to verify your email and complete your registration for the KRMU Induction program.
            </td></tr>
          </table>

          <!-- OTP Box -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-radius:16px;overflow:hidden;">
                <tr><td style="background:linear-gradient(135deg,#5a1018 0%,#7b2018 50%,#5a1018 100%);padding:28px 48px;text-align:center;">
                  <div style="font-size:42px;font-weight:800;letter-spacing:14px;color:#ffffff;font-family:'SF Mono','Fira Code','Courier New',monospace;text-shadow:0 2px 8px rgba(0,0,0,0.3);">${otp}</div>
                </td></tr>
              </table>
            </td></tr>
          </table>

          <!-- Timer notice -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:8px;vertical-align:middle;">
                    <div style="width:8px;height:8px;border-radius:50%;background-color:#c87038;"></div>
                  </td>
                  <td style="font-size:13px;color:#888;vertical-align:middle;">
                    This code expires in <span style="color:#5a1018;font-weight:600;">5 minutes</span>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- Warning -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background-color:#fdf8f2;border:1px solid #ede4d8;border-radius:12px;padding:16px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:20px;vertical-align:top;padding-right:12px;">
                    <div style="font-size:16px;">&#128274;</div>
                  </td>
                  <td style="font-size:12px;color:#8c6239;line-height:1.6;">
                    If you didn't request this code, you can safely ignore this email. Someone may have entered your email by mistake.
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#2d0d12;padding:24px 36px;border-radius:0 0 8px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:8px;">
              <div style="font-size:13px;color:#d4a254;font-weight:600;letter-spacing:1px;">KRMU Induction 2026</div>
            </td></tr>
            <tr><td align="center">
              <div style="font-size:11px;color:#8b6e55;line-height:1.6;">
                KR Mangalam University, Sohna Road, Gurugram, Haryana<br/>
                &copy; 2026 All rights reserved
              </div>
            </td></tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Create pooled SMTP transporter ONCE at module level (reuses connections)
let smtpTransporter: any = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: false,
    pool: true,          // Keep connection alive
    maxConnections: 5,
    maxMessages: 100,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
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
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const htmlBody = buildOtpEmail(otp);

    // Run Firestore write and email send IN PARALLEL for speed
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000));
    
    const firestorePromise = db.collection('otp_sessions').doc(email.toLowerCase()).set({
      otp,
      expiresAt,
      attempts: 0
    });

    let emailPromise: Promise<any>;
    if (smtpTransporter) {
      emailPromise = smtpTransporter.sendMail({
        from: `"KRMU Induction" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Your Verification Code — Aarambh 2026',
        html: htmlBody,
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
