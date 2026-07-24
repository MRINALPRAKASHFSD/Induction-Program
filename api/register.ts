import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getRedis } from '../server/redis.js';
import { z } from 'zod';

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

// Fallback in-memory rate limiter if Redis is not configured
const inMemoryRateLimits = new Map<string, { count: number, resetAt: number }>();

const studentSchema = z.object({
  full_name:     z.string().trim().min(2, "Name is too short").max(120),
  enrollment_no: z.string().trim().min(3, "Enrollment number is too short").max(40),
  email:         z.string().trim().email("Invalid email address").max(200),
  phone:         z.string().trim().min(10, "Phone number must be at least 10 digits").max(20),
  department_id: z.string().min(1, "School is required"),
  branch_id:     z.string().nullable().optional(),
  course:        z.string().trim().min(1, "Course is required").max(80),
  year:          z.number().int().min(1).max(6),
  deptName:      z.string().optional(),
  auth_uid:      z.string().optional(),
});

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  const logRequest = (status: string, enrollment?: string, email?: string, msg?: string) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      ip,
      userAgent,
      enrollment: enrollment || 'N/A',
      email: email || 'N/A',
      status,
      message: msg || ''
    }));
  };

  if (!firebaseInitialized) {
    logRequest('Error', undefined, undefined, 'Firebase init failed');
    return res.status(500).json({ error: `Backend configuration error: ${firebaseInitError}` });
  }

  // ── 1. Authentication — Firestore-backed registration session token ──────────
  // We avoid firebase-admin/auth entirely (jwks-rsa/jose ESM conflict on Vercel Node 18+).
  // Instead verify-otp stored a short-lived token in Firestore that we validate here.
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logRequest('Unauthorized', undefined, undefined, 'Missing Bearer token');
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const regToken = authHeader.split('Bearer ')[1];

  // 2. Validate Payload first (to get email for session lookup)
  const parsedResult = studentSchema.safeParse(req.body);
  if (!parsedResult.success) {
    logRequest('BadRequest', undefined, undefined, parsedResult.error.errors[0].message);
    return res.status(400).json({ ok: false, error: parsedResult.error.errors[0].message });
  }
  const parsed = parsedResult.data;

  const enrollmentKey = parsed.enrollment_no.toUpperCase().trim();
  const emailKey      = parsed.email.toLowerCase().trim();
  const phoneKey      = parsed.phone.trim();

  // 3. Verify the registration session token against Firestore
  const db = getFirestore();
  const sessionRef = db.collection('registration_sessions').doc(emailKey);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    logRequest('Unauthorized', enrollmentKey, emailKey, 'No registration session found');
    return res.status(401).json({ error: 'Unauthorized: Session expired or not found. Please verify your email again.' });
  }

  const sessionData = sessionSnap.data()!;
  if (sessionData.token !== regToken) {
    logRequest('Unauthorized', enrollmentKey, emailKey, 'Registration token mismatch');
    return res.status(401).json({ error: 'Unauthorized: Invalid session token.' });
  }

  if (sessionData.expiresAt.toDate() < new Date()) {
    await sessionRef.delete();
    logRequest('Unauthorized', enrollmentKey, emailKey, 'Registration session expired');
    return res.status(401).json({ error: 'Unauthorized: Session expired. Please verify your email again.' });
  }

  if (sessionData.email !== emailKey) {
    logRequest('Unauthorized', enrollmentKey, emailKey, 'Email mismatch in session');
    return res.status(403).json({ error: 'Forbidden: Email mismatch.' });
  }

  // Session is valid — delete it now (single-use)
  await sessionRef.delete();

  // 4. Rate Limiting (IP & Email)
  const windowMs = 60 * 1000; // 1 minute
  const nowMs = Date.now();
  
  const limits = [
    { key: `reg:ip:${ip}`, max: 10 },
    { key: `reg:email:${emailKey}`, max: 5 }
  ];

  for (const { key, max } of limits) {
    try {
      const redis = getRedis();
      const current = await redis.incr(key);
      if (current === 1) await redis.expire(key, 60);
      if (current > max) {
        logRequest('RateLimited', enrollmentKey, emailKey, `Exceeded limit for ${key}`);
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
    } catch {
      // Fail open — Redis outage should not block legitimate registrations
      let record = inMemoryRateLimits.get(key);
      if (!record || record.resetAt < nowMs) {
        record = { count: 1, resetAt: nowMs + windowMs };
      } else {
        record.count++;
      }
      inMemoryRateLimits.set(key, record);
      if (record.count > max) {
        logRequest('RateLimited', enrollmentKey, emailKey, `Exceeded limit for ${key} (fallback)`);
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
    }
  }

  try {
    // 5. Run Transaction for strict concurrency safety and idempotency
    const result = await db.runTransaction(async (t) => {
      const emailRef = db.collection("email_index").doc(emailKey);
      const enrollmentRef = db.collection("studentid_index").doc(enrollmentKey);
      const phoneRef = db.collection("phone_index").doc(phoneKey);
      const studentRef = db.collection("students").doc(enrollmentKey);

      // Read everything first
      const [emailSnap, enrollmentSnap, phoneSnap, studentSnap] = await Promise.all([
        t.get(emailRef),
        t.get(enrollmentRef),
        t.get(phoneRef),
        t.get(studentRef),
      ]);

      if (emailSnap.exists) {
        throw { status: 409, code: "EMAIL_EXISTS", message: "This email address is already registered. Please log in instead." };
      }

      if (enrollmentSnap.exists || studentSnap.exists) {
        const existing = enrollmentSnap.exists ? enrollmentSnap.data() : studentSnap.data();
        if (existing?.auth_uid && existing.auth_uid !== parsed.auth_uid) {
          throw { status: 409, code: "ENROLLMENT_EXISTS", message: "This enrollment number is already registered on another device or email." };
        }
        if (!existing?.auth_uid) {
          // Legacy user claiming their account -> allow update
        } else {
          // Same UID (device switch / spam click) -> safe idempotency bypass
          return { ok: true, student_id: enrollmentKey, duplicate: true };
        }
      }

      if (phoneSnap.exists) {
        throw { status: 409, code: "PHONE_EXISTS", message: "This phone number is already associated with another account." };
      }

      const now = new Date().toISOString();
      const { email, phone, auth_uid, deptName, ...publicData } = parsed;

      // Writes
      if (studentSnap.exists) {
        t.set(studentRef, { ...publicData, auth_uid: auth_uid || null }, { merge: true });
      } else {
        t.set(studentRef, {
          ...publicData,
          id:            enrollmentKey,
          enrollment_no: enrollmentKey,
          auth_uid:      auth_uid || null,
          points:        0,
          created_at:    now,
        });
      }

      const privateRef = studentRef.collection("private").doc("contact");
      t.set(privateRef, { email: emailKey, phone: phoneKey });
      
      t.set(emailRef, { enrollment_no: enrollmentKey, created_at: now });
      t.set(enrollmentRef, { email: emailKey, auth_uid: auth_uid || null, created_at: now });
      t.set(phoneRef, { enrollment_no: enrollmentKey, created_at: now });

      return { ok: true, student_id: enrollmentKey, duplicate: false };
    });

    logRequest(result.duplicate ? 'Duplicate(Idempotent)' : 'Success', enrollmentKey, emailKey);
    return res.status(200).json(result);

  } catch (error: any) {
    if (error.status && error.code) {
      logRequest('Conflict', enrollmentKey, emailKey, error.code);
      return res.status(error.status).json({ ok: false, error: error.message, code: error.code });
    }
    logRequest('ServerError', enrollmentKey, emailKey, error.message);
    console.error("Backend registration error:", error);
    return res.status(500).json({ 
      ok: false, 
      error: "Internal server error during registration. Please try again.",
      code: "SERVER_ERROR"
    });
  }
}
