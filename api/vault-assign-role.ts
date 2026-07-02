import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
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
      return res.status(403).json({ error: 'Forbidden. Only super_admins can assign roles.' });
    }

    const { email, password, name, roles } = req.body;

    // Support both old single-role and new multi-role payloads
    const rolesArray: string[] = Array.isArray(roles) ? roles : (roles ? [roles] : []);

    if (!email || !password || !name || rolesArray.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validRoles = ['coordinator', 'super_admin'];
    if (!rolesArray.every(r => validRoles.includes(r))) {
      return res.status(400).json({ error: 'Invalid role(s) specified' });
    }

    // 1. Create the user in Firebase Auth
    const userRecord = await getAuth().createUser({
      email: email,
      password: password,
      displayName: name,
    });

    // 2. Set Custom Claims
    // Firebase claims support a single primary role. If user has both roles,
    // we set 'super_admin' as primary (higher privilege) and store full list in Firestore.
    // The upload API checks: decodedToken.role === 'coordinator' || 'super_admin'
    // so a super_admin already has full access including upload.
    const primaryRole = rolesArray.includes('super_admin') ? 'super_admin' : 'coordinator';
    await getAuth().setCustomUserClaims(userRecord.uid, { 
      role: primaryRole,
      roles: rolesArray 
    });

    // 3. Add to Firestore users collection
    const db = getFirestore();
    await db.collection('users').doc(userRecord.uid).set({
      name: name,
      email: email,
      role: primaryRole,
      roles: rolesArray,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Audit Log Creation
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const country = req.headers['x-vercel-ip-country'] || 'unknown';
    
    await db.collection('audit_logs').add({
      action: 'ASSIGN_ROLE',
      user: decodedToken.email || 'Super Admin',
      time: FieldValue.serverTimestamp(),
      ip: ip,
      device: userAgent,
      country: country,
      targetUser: email,
      assignedRoles: rolesArray,
      primaryRole: primaryRole,
    });

    return res.status(200).json({ success: true, uid: userRecord.uid, primaryRole, roles: rolesArray });

  } catch (error: any) {
    console.error("Assign Role Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

