import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { extractBearerToken, verifyFirebaseIdToken } from '../server/verify-id-token.js';

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
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let decodedToken;
    try {
      decodedToken = await verifyFirebaseIdToken(token);
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const uid = decodedToken.uid;

    if (decodedToken.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden. Super Admin access required.' });
    }

    const { action, payload } = req.body;
    if (!action) {
      return res.status(400).json({ error: 'Missing action' });
    }

    const db = getFirestore();
    const announcementsRef = db.collection('announcements');
    const auditLogsRef = db.collection('audit_logs');
    
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const country = req.headers['x-vercel-ip-country'] || 'unknown';

    const logAudit = async (actionName: string, targetId: string) => {
      await auditLogsRef.add({
        action: actionName,
        user: uid,
        email: decodedToken.email,
        time: FieldValue.serverTimestamp(),
        ip: ip,
        device: userAgent,
        country: country,
        targetId: targetId
      });
    };

    let resultData = {};

    switch (action) {
      case 'PUBLISH': {
        const { title, content, isImportant, targetAudience, expiresAt } = payload;
        if (!title || !content || !targetAudience) {
          return res.status(400).json({ error: 'Missing required announcement fields' });
        }

        const newDoc = await announcementsRef.add({
          title,
          content,
          isImportant: !!isImportant,
          targetAudience,
          expiresAt: expiresAt || null,
          status: 'active',
          createdBy: uid,
          createdByEmail: decodedToken.email || 'unknown',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        
        await logAudit('ANNOUNCEMENT_PUBLISH', newDoc.id);
        resultData = { id: newDoc.id };
        break;
      }
      
      case 'EDIT': {
        const { id, title, content, isImportant, targetAudience, expiresAt } = payload;
        if (!id || !title || !content || !targetAudience) {
          return res.status(400).json({ error: 'Missing required announcement fields' });
        }

        await announcementsRef.doc(id).update({
          title,
          content,
          isImportant: !!isImportant,
          targetAudience,
          expiresAt: expiresAt || null,
          updatedAt: new Date().toISOString(),
        });
        
        await logAudit('ANNOUNCEMENT_EDIT', id);
        resultData = { id };
        break;
      }

      case 'ARCHIVE': {
        const { id } = payload;
        if (!id) return res.status(400).json({ error: 'Missing announcement ID' });

        await announcementsRef.doc(id).update({
          status: 'archived',
          updatedAt: new Date().toISOString(),
        });
        
        await logAudit('ANNOUNCEMENT_ARCHIVE', id);
        resultData = { id };
        break;
      }

      case 'RESTORE': {
        const { id } = payload;
        if (!id) return res.status(400).json({ error: 'Missing announcement ID' });

        await announcementsRef.doc(id).update({
          status: 'active',
          updatedAt: new Date().toISOString(),
        });
        
        await logAudit('ANNOUNCEMENT_RESTORE', id);
        resultData = { id };
        break;
      }

      case 'DELETE': {
        const { id } = payload;
        if (!id) return res.status(400).json({ error: 'Missing announcement ID' });

        // Soft delete implementation: mark as 'archived' status and set deletedAt/deletedBy as per requirements
        await announcementsRef.doc(id).update({
          status: 'archived',
          deletedAt: new Date().toISOString(),
          deletedBy: uid,
          updatedAt: new Date().toISOString(),
        });
        
        await logAudit('ANNOUNCEMENT_DELETE', id);
        resultData = { id };
        break;
      }

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(200).json({ success: true, data: resultData });

  } catch (error: any) {
    console.error("Announcements API Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
