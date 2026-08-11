import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

export default async function handler(req: any, res: any) {
  try {
    if (!getApps().length) {
      const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      initializeApp({ credential: cert(serviceAccount) });
    }
    const db = getFirestore();

    const plannerId = req.query.plannerId || 'planner_2026_v5';
    const mappings = await db.collection('induction_room_allocations')
      .get();
      
    const results = mappings.docs.map(d => d.data());

    const participants = await db.collection('induction_participants').limit(10).get();
    const students = await db.collection('students').limit(20).get();

    res.status(200).json({ 
      participants: participants.docs.map(d => ({id: d.id, ...d.data()})),
      students: students.docs.map(d => ({id: d.id, ...d.data()}))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
