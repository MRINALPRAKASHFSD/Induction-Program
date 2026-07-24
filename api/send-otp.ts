import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { getRedis } from '../server/redis.js';

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

  const { email, type } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const emailKey = email.toLowerCase().trim();

  // ── Check if email exists for Login / Register restrictions ──────────────
  try {
    const db = getFirestore();
    if (type === 'login' || type === 'register') {
      const emailSnap = await db.collection('email_index').doc(emailKey).get();
      const userExists = emailSnap.exists;

      if (type === 'login' && !userExists) {
        return res.status(404).json({ error: 'This email is not registered. Please register first.' });
      }

      if (type === 'register' && userExists) {
        return res.status(409).json({ error: 'This email is already registered. Kindly login instead.' });
      }
    }
  } catch (err: any) {
    console.error("Firestore email check error:", err);
  }

  // ── Rate limiting: 5 OTP requests per email per 10 minutes ───────────────
  // Prevents email flooding attacks. Fails OPEN if Redis is unavailable so
  // legitimate users are never blocked due to a Redis outage.
  try {
    const redis = getRedis();
    const rateLimitKey = `ratelimit:otp:${emailKey}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) await redis.expire(rateLimitKey, 600); // 10-minute window
    if (attempts > 5) {
      return res.status(429).json({
        error: 'Too many verification requests. Please wait 10 minutes before requesting another code.',
      });
    }
  } catch (redisErr: any) {
    // Fail open — Redis outage should not prevent logins
    console.warn(`[send-otp] Redis rate limit check failed (fail-open): ${redisErr.message}`);
  }

  try {
    const db = getFirestore();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Run Firestore write and email send IN PARALLEL for speed
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000));
    
    const firestorePromise = db.collection('otp_sessions').doc(emailKey).set({
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
        subject: 'Your AARAMBH 2026 Verification Code',
        text: `We received a request to verify your email for AARAMBH 2026.

Your Verification Code is: ${otp}

This code expires in 5 minutes. Never share this code. Our team will never ask for it.
If this wasn't you, you can safely ignore this email.

AARAMBH 2026
K.R. Mangalam University • Student Induction Platform
`,
        html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
<head>
<meta content="text/html; charset=UTF-8" http-equiv="Content-Type"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Your AARAMBH 2026 Verification Code</title>
<style>
  @media only screen and (max-width: 600px) {
    .container { width: 100% !important; padding: 24px 16px !important; }
    .inner-card { padding: 32px 24px !important; }
    .otp-container { padding: 24px 16px !important; }
    .otp-text { font-size: 36px !important; letter-spacing: 12px !important; }
  }
</style>
</head>
<body style="background-color:#16090B; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; margin:0; padding:0; -webkit-text-size-adjust:none;">

<!-- Preheader -->
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0" data-skip-in-text="true">
Your verification code is ready. Valid for 5 minutes.
&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>

<table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center" style="background-color:#16090B;">
  <tr>
    <td align="center" style="padding:64px 16px;">
      
      <!-- Main Content Card -->
      <table class="container" border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center" style="max-width:520px; width:100%; background-color:#ffffff; border:1px solid #331A1E; border-radius:16px; box-shadow:0 24px 48px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2);">
        
        <!-- Gradient Top Accent -->
        <tr>
          <td>
            <div style="height:8px; background:linear-gradient(90deg, #5A1018, #8B2C1A, #C87038, #E2B9A1); border-radius:16px 16px 0 0; width:100%;"></div>
          </td>
        </tr>

        <tr>
          <td class="inner-card" style="padding:48px 40px 40px;">
            
            <!-- Header -->
            <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="text-align:center;">
              <tr>
                <td>
                  <h1 style="font-family:'Georgia', serif; font-size:32px; font-weight:700; color:#5A1018; letter-spacing:4px; margin:0 0 4px 0;">AARAMBH</h1>
                  <p style="font-size:11px; line-height:1.5; letter-spacing:3px; text-transform:uppercase; color:#C87038; font-weight:700; margin:0 0 32px 0;">Student Induction Portal &bull; 2026</p>
                </td>
              </tr>
            </table>

            <!-- Elegant Divider -->
            <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:32px;">
              <tr>
                <td align="center">
                  <div style="width:64px; height:2px; background:linear-gradient(90deg, transparent, #DDA7A5, transparent);"></div>
                </td>
              </tr>
            </table>

            <!-- Body -->
            <p style="font-size:18px; line-height:1.6; color:#5A1018; font-weight:600; margin:0 0 16px 0;">Hello,</p>
            <p style="font-size:16px; line-height:1.6; color:#4A4A4A; margin:0 0 36px 0;">
              We received a request to verify your email for AARAMBH 2026. Use the verification code below to securely access your account.
            </p>

            <!-- OTP Hero Card (Ticket Style) -->
            <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:36px;">
              <tr>
                <td align="center">
                  <div class="otp-container" style="background-color:#FDFBF7; border:2px dashed #DDA7A5; border-radius:12px; padding:32px 24px; text-align:center; box-shadow:inset 0 4px 12px rgba(90, 16, 24, 0.03);">
                    <p style="font-size:11px; text-transform:uppercase; letter-spacing:3px; color:#8B2C1A; font-weight:700; margin:0 0 16px 0;">Verification Code</p>
                    <p class="otp-text" style="font-family:'SF Mono', 'Fira Code', 'Courier New', monospace; font-size:48px; font-weight:800; letter-spacing:18px; color:#5A1018; margin:0 0 0 18px; display:inline-block; text-shadow: 0 2px 4px rgba(90, 16, 24, 0.1);">${otp}</p>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Security Info Card -->
            <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#FFF9F7; border:1px solid #F4EFE6; border-radius:12px; padding:20px;">
              <tr>
                <td width="32" style="vertical-align:top; padding-right:12px;">
                  <div style="width:24px; height:24px; border-radius:12px; background-color:#8B2C1A; color:white; text-align:center; line-height:24px; font-weight:bold; font-size:14px;">!</div>
                </td>
                <td style="vertical-align:top;">
                  <p style="font-size:13px; line-height:1.6; color:#8B2C1A; font-weight:700; margin:0 0 4px 0;">Security Information</p>
                  <p style="font-size:13px; line-height:1.6; color:#6B4E47; margin:0;">
                    This code expires in <strong>5 minutes</strong>. Never share this code. Our team will never ask for it. If this wasn't you, you can safely ignore this email.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

      <!-- Footer -->
      <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center" style="max-width:520px; width:100%; margin-top:32px; text-align:center;">
        <tr>
          <td>
            <p style="font-family:'Georgia', serif; font-size:16px; line-height:1.6; color:#DDA7A5; font-weight:600; letter-spacing:1px; margin:0 0 8px 0;">AARAMBH 2026</p>
            <p style="font-size:12px; line-height:1.6; color:#A88D8F; margin:0 0 16px 0;">K.R. Mangalam University &bull; Student Induction Platform</p>
            <p style="font-size:11px; line-height:1.6; color:#785A5E; margin:0 0 4px 0;">This is an automated email. Please do not reply.</p>
            <p style="font-size:11px; line-height:1.6; color:#785A5E; margin:0 0 16px 0;">
              Need help? Contact <a href="mailto:induction@mrinalprakash.com" style="color:#C87038; text-decoration:none; font-weight:500;">Support</a> or visit our <a href="https://mrinalprakash.com" style="color:#C87038; text-decoration:none; font-weight:500;">Official Website</a>.
            </p>
            <p style="font-size:11px; line-height:1.6; color:#5D4448; margin:0;">&copy; 2026 K.R. Mangalam University. All rights reserved.</p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`,
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
