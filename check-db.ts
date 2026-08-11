import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
dotenv.config();

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

async function check() {
  const activePlannerSnap = await db.collection('induction_planners')
      .where('status', 'in', ['PUBLISHED', 'ROLLED_BACK'])
      .limit(1)
      .get();
  const plannerId = activePlannerSnap.docs[0].data().plannerId;
  const rooms = await db.collection('induction_room_allocations').where('plannerId', '==', plannerId).get();
  const roomsData = rooms.docs.map(d=>d.data());

  const studentSnap = await db.collection('students').doc('123456789').get();
  const student = studentSnap.data()!;
  
  const schoolCode = (student.department_id || '').toLowerCase().trim();
  const course = (student.course || '').toLowerCase().trim();
  const programme = (student.branch || student.programme || '').toLowerCase().trim();

  const mappingKey = `${schoolCode}|${course}|${programme}`;

  const roomAllocation = roomsData.find((r: any) => r.mappingKey === mappingKey)
      || roomsData.find((r: any) => r.schoolCode === schoolCode && (!r.programme || r.programme === ''))
      || roomsData.find((r: any) => r.schoolCode === schoolCode)
      || null;

  console.log({ schoolCode, course, programme, mappingKey, roomAllocation });
}
check().catch(console.error);
