import { initializeApp, getApps, cert } from 'firebase-admin/app';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

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

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken: any;
    try {
      decodedToken = jwt.decode(token);
      if (!decodedToken) throw new Error("Invalid token format");
    } catch (e: any) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
    }

    const uid = decodedToken.user_id || decodedToken.uid;
    const { filePath, action } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'Missing required field: filePath' });
    }

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
    
    const url = `https://storage.googleapis.com${canonicalizedResource}?${queryParams.toString()}`;

    return res.status(200).json({ downloadUrl: url });

  } catch (error: any) {
    console.error("Vault Download Error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}`, stack: error.stack });
  }
}
