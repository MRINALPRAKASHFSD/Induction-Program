import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
    });
  } catch (e) {
    console.error("Firebase Admin Initialization Error:", e);
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);

    if (decodedToken.role !== 'coordinator') {
      return res.status(403).json({ error: 'Forbidden. Only coordinators can upload.' });
    }

    const { filename, fileSize, fileHash, category } = req.body;

    if (!filename || !fileSize || !fileHash || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (fileSize > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 10MB limit' });
    }

    const db = getFirestore();
    const uid = decodedToken.uid;

    // 1. Backend Rate Limiting (Cooldown)
    const rateLimitRef = db.collection('rate_limits').doc(uid);
    const rateLimitDoc = await rateLimitRef.get();
    
    if (rateLimitDoc.exists) {
      const lastUpload = rateLimitDoc.data()?.lastUploadTime?.toMillis() || 0;
      const now = Date.now();
      if (now - lastUpload < 5000) { // 5 seconds cooldown
        return res.status(429).json({ error: 'Too many requests. Please wait 5 seconds between uploads.' });
      }
    }
    await rateLimitRef.set({ lastUploadTime: FieldValue.serverTimestamp() }, { merge: true });

    // 2. Duplicate Check (File Hashing)
    const docsSnapshot = await db.collection('secure_documents')
      .where('fileHash', '==', fileHash)
      .limit(1)
      .get();

    if (!docsSnapshot.empty) {
      return res.status(409).json({ error: 'Duplicate file detected. This exact file has already been uploaded.' });
    }

    // 3. Generate Signed Upload URL
    const bucket = getStorage().bucket();
    const year = new Date().getFullYear();
    const timestamp = Date.now();
    // Path: documents/YYYY/Category/timestamp_filename
    const filePath = `documents/${year}/${category.toLowerCase()}/${timestamp}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const file = bucket.file(filePath);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes to upload
      contentType: req.body.contentType || 'application/octet-stream', // Important to pass content type if validating
    });

    // 4. Enhanced Audit Log Creation
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const country = req.headers['x-vercel-ip-country'] || 'unknown';
    
    await db.collection('audit_logs').add({
      action: 'INITIATE_UPLOAD',
      user: decodedToken.email || 'Coordinator',
      uid: uid,
      time: FieldValue.serverTimestamp(),
      ip: ip,
      device: userAgent,
      country: country,
      filename: filename,
      category: category,
      fileHash: fileHash
    });

    return res.status(200).json({ 
      uploadUrl: url, 
      filePath: filePath 
    });

  } catch (error: any) {
    console.error("Init Upload Error:", error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
