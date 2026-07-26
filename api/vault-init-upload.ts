import { initializeApp, getApps, cert } from 'firebase-admin/app';
import * as crypto from 'crypto';
import { extractBearerToken, verifyFirebaseIdToken } from '../server/verify-id-token.js';

let firebaseInitialized = false;
let firebaseInitError: string | null = null;

try {
  if (!getApps().length) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error("Missing Firebase Admin credentials in environment variables.");
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/^'|'$/g, '').replace(/\\n/g, '\n'),
      }),
    });
  }
  firebaseInitialized = true;
} catch (error: any) {
  console.error('Firebase Admin Initialization Error:', error);
  firebaseInitError = error.message;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    if (!firebaseInitialized) {
      return res.status(500).json({ error: `Firebase Admin not initialized. Reason: ${firebaseInitError}` });
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    let decodedToken;
    try {
      decodedToken = await verifyFirebaseIdToken(token);
    } catch {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    const uid = decodedToken.uid;
    const { filename, fileSize, fileHash, category, uploadType, imageLocation } = req.body;

    if (!filename || !fileSize || !fileHash || !category || !uploadType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const bucketName = (process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || 'krmu-induction-app-d3591.firebasestorage.app').trim();
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

    const canonicalizedResource = `/${bucketName}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
    const stringToSign = `${method}\n\n${contentType}\n${expiresUnixSec}\n${canonicalizedResource}`;
    
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(stringToSign);
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/^"|"$/g, '').replace(/^'|'$/g, '').replace(/\\n/g, '\n');
    const signature = sign.sign(privateKey, 'base64');
    
    const queryParams = new URLSearchParams({
      GoogleAccessId: process.env.FIREBASE_CLIENT_EMAIL!.trim(),
      Expires: expiresUnixSec.toString(),
      Signature: signature,
    });
    
    const url = `https://storage.googleapis.com${canonicalizedResource}?${queryParams.toString()}`;

    // We removed Firestore from the server side to completely avoid gRPC crashes.
    // The frontend already creates the document via the SDK.
    // We can also skip server-side duplicate check (frontend does it) or do it via REST if needed.

    return res.status(200).json({ 
      uploadUrl: url, 
      filePath: filePath 
    });

  } catch (error: any) {
    console.error("Init Upload Error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}`, stack: error.stack });
  }
}
