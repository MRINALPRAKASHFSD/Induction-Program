import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import * as jwt from 'jsonwebtoken';

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
    const bucket = getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || 'krmu-induction-app-d3591.firebasestorage.app');
    const { filePath, forceDownload, fileName } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'Missing required field: filePath' });
    }

    const options: any = {
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    };

    if (forceDownload) {
      const safeName = (fileName || 'download').replace(/[^a-zA-Z0-9.\-_ ]/g, '_');
      options.responseDisposition = `attachment; filename="${safeName}"`;
    }

    const [url] = await bucket.file(filePath).getSignedUrl(options);

    return res.status(200).json({ downloadUrl: url });

  } catch (error: any) {
    console.error("Vault Download Error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}`, stack: error.stack });
  }
}
