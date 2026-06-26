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

    if (decodedToken.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { filePath, documentId } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const bucket = getStorage().bucket();
    const file = bucket.file(filePath);

    // Generate a 30-second signed URL
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 30 * 1000, // 30 seconds
    });

    // Audit Log Creation
    const db = getFirestore();
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    await db.collection('audit_logs').add({
      action: 'VIEW_DOCUMENT',
      user: 'Super Admin',
      time: FieldValue.serverTimestamp(),
      ip: ip,
      device: userAgent,
      document: documentId || filePath,
    });

    return res.status(200).json({ url });

  } catch (error: any) {
    console.error("Download Error:", error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
