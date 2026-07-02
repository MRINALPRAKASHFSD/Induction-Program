import { initializeApp, getApps, cert } from 'firebase-admin/app';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!firebaseInitialized) {
    return res.status(500).json({ error: `Backend configuration error: ${firebaseInitError}` });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Manually verify Firebase ID token to avoid firebase-admin/auth native bindings crash on Vercel
    const keysRes = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    const keys = await keysRes.json();
    const decodedHeader = jwt.decode(token, { complete: true }) as any;
    const kid = decodedHeader?.header?.kid;
    if (!kid || !keys[kid]) {
      return res.status(401).json({ error: 'Invalid token signature' });
    }
    
    const decodedToken = jwt.verify(token, keys[kid], { algorithms: ['RS256'] }) as any;

    if (decodedToken.role !== 'coordinator' && decodedToken.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden. Only authorized personnel can upload.' });
    }

    const { filename, fileSize, fileHash, category, uploadType = 'Document', imageLocation } = req.body;

    if (!filename || !fileSize || !fileHash || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let maxSize = 10 * 1024 * 1024; // 10MB default
    if (category === 'Reports') {
      maxSize = 100 * 1024 * 1024; // 100MB
    } else if (uploadType === 'Image') {
      maxSize = 50 * 1024 * 1024; // 50MB
    }

    if (fileSize > maxSize) {
      const mbSize = maxSize / (1024 * 1024);
      return res.status(400).json({ error: `File size exceeds ${mbSize}MB limit for this category/type` });
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

    // 3. Generate Signed Upload URL manually using V2 signature to avoid Vercel native binding crashes
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || 'krmu-induction-app-d3591.firebasestorage.app';
    const year = new Date().getFullYear();
    const timestamp = Date.now();
    const safeCategory = category.toLowerCase().replace(/\s+/g, '-');
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

    let filePath: string;
    if (uploadType === 'Image') {
      const geoFolder = imageLocation === 'Geo-tagged' ? 'geo-tagged' : 'non-geo-tagged';
      filePath = `images/${geoFolder}/${year}/${safeCategory}/${timestamp}_${safeFilename}`;
    } else {
      filePath = `documents/${year}/${safeCategory}/${timestamp}_${safeFilename}`;
    }

    const contentType = req.body.contentType || 'application/octet-stream';
    const expiresUnixSec = Math.floor(Date.now() / 1000) + 15 * 60; // 15 mins
    const method = 'PUT';

    // V2 Signed URL generation
    const canonicalizedResource = `/${bucketName}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
    const stringToSign = `${method}\n\n${contentType}\n${expiresUnixSec}\n${canonicalizedResource}`;
    
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(stringToSign);
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');
    const signature = sign.sign(privateKey, 'base64');
    
    const queryParams = new URLSearchParams({
      GoogleAccessId: process.env.FIREBASE_CLIENT_EMAIL!,
      Expires: expiresUnixSec.toString(),
      Signature: signature,
    });
    
    const url = `https://storage.googleapis.com${canonicalizedResource}?${queryParams.toString()}`;

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
      fileHash: fileHash,
      uploadType: uploadType,
      ...(uploadType === 'Image' && imageLocation ? { imageLocation } : {})
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
