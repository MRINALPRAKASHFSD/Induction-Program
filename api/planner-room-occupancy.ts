import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getRedis } from '../server/redis.js';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';

try {
  if (!getApps().length) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Missing Firebase Admin env vars.');
    }
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
} catch (e) {
  console.error('Firebase Admin init error:', e);
}

async function validateAdmin(req: any): Promise<boolean> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return false;
  try {
    const decoded = await verifyFirebaseIdToken(token);
    return !!decoded.uid;
  } catch (err) {
    return false;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const isAdmin = await validateAdmin(req);
  if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });

  const db = getFirestore();
  const redis = getRedis();

  try {
    // 1. Get active planner
    let plannerId = await redis.get('planner_active');
    if (!plannerId) {
      const plannerSnap = await db.collection('induction_planners')
        .where('status', '==', 'PUBLISHED')
        .limit(1)
        .get();
      if (!plannerSnap.empty) {
        plannerId = plannerSnap.docs[0].id;
        await redis.setex('planner_active', 60, plannerId);
      }
    }

    if (!plannerId) {
      return res.json({ ok: true, rooms: [], message: 'No active planner published.' });
    }

    // 2. Fetch all mappings for this planner
    const allocationsSnap = await db.collection('induction_room_allocations')
      .where('plannerId', '==', plannerId)
      .get();
      
    // Group mappings by room
    const mappingsByRoom: Record<string, any[]> = {};
    for (const doc of allocationsSnap.docs) {
      const mapping = doc.data();
      if (!mappingsByRoom[mapping.roomNumber]) {
        mappingsByRoom[mapping.roomNumber] = [];
      }
      mappingsByRoom[mapping.roomNumber].push(mapping);
    }

    // 3. Fetch runtime state of all rooms
    const roomsSnap = await db.collection('rooms').get();
    
    // 4. Merge and format
    const results = [];
    for (const doc of roomsSnap.docs) {
      const roomData = doc.data();
      
      // We can filter to only include mapped rooms or include all. We'll include all, but attach mapping if exists.
      const roomMappings = mappingsByRoom[doc.id] || [];
      
      results.push({
        ...roomData,
        roomNumber: doc.id, // guarantee roomNumber is the doc ID
        isMappedInPlanner: roomMappings.length > 0,
        plannerId,
        mappedProgrammes: roomMappings.map(m => m.programme).filter(Boolean),
        mappedCourses: roomMappings.map(m => m.course).filter(Boolean),
        mappedSchools: roomMappings.map(m => m.school).filter(Boolean),
      });
    }

    return res.json({ ok: true, rooms: results, plannerId });
  } catch (err: any) {
    console.error('[planner-room-occupancy]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
