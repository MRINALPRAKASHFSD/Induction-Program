import { initializeApp, getApps, cert } from 'firebase-admin/app';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

let firebaseInitialized = false;
let firebaseInitError = null;

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

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Manually verify Firebase ID token
    const keysRes = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    const keys = await keysRes.json();
    const decodedHeader = jwt.decode(token, { complete: true }) as any;
    const kid = decodedHeader?.header?.kid;
    if (!kid || !keys[kid]) {
      return res.status(401).json({ error: 'Invalid token signature' });
    }
    
    const decodedToken = jwt.verify(token, keys[kid], { algorithms: ['RS256'] }) as any;

    if (decodedToken.role !== 'coordinator' && decodedToken.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden. Only authorized personnel can download.' });
    }

    const { filePath, documentId, fileName, forceDownload } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Generate Signed Download URL manually using V2 signature to avoid Vercel native binding crashes
    const bucketName = (process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || 'krmu-induction-app-d3591.firebasestorage.app').trim();
    const expiresUnixSec = Math.floor(Date.now() / 1000) + 15 * 60; // 15 mins
    const method = 'GET';
    const contentType = ''; // No content-type for GET

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
    
    // Add Response Content-Disposition to force download with correct filename if requested
    if (forceDownload) {
      queryParams.set('response-content-disposition', `attachment; filename="${fileName}"`);
    } else {
      queryParams.set('response-content-disposition', `inline; filename="${fileName}"`);
    }
    
    const url = `https://storage.googleapis.com${canonicalizedResource}?${queryParams.toString()}`;

    // Generate Audit Log
    const db = getFirestore();
    try {
      db.settings({ preferRest: true });
    } catch (e) {
      // ignore if already set
    }
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    await db.collection('audit_logs').add({
      action: forceDownload ? 'DOWNLOAD_DOCUMENT' : 'VIEW_DOCUMENT',
      user: 'Super Admin',
      time: FieldValue.serverTimestamp(),
      ip: ip,
      device: userAgent,
      document: documentId || filePath,
    });

    return res.status(200).json({ url });

  } catch (error: any) {
    console.error("Vault Download Error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}`, stack: error.stack });
  }
}
