import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
dotenv.config();

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

async function check() {
  const plannerSnap = await db.collection('induction_planners').where('status', '==', 'PUBLISHED').limit(1).get();
  if (plannerSnap.empty) {
    console.log("No published planner");
    return;
  }
  const plannerId = plannerSnap.docs[0].id;
  console.log("Active Planner:", plannerId);

  const mappings = await db.collection('induction_room_allocations').where('plannerId', '==', plannerId).get();
  const keys = mappings.docs.map(d => d.data().mappingKey);
  console.log("Available mapping keys:");
  keys.forEach(k => console.log(`  "${k}"`));

  const pSnap = await db.collection('induction_participants').doc('KRMU23567').get();
  if (pSnap.exists) {
    const p = pSnap.data();
    console.log("\nParticipant KRMU23567:");
    console.log("School:", p.school);
    console.log("Course:", p.course);
    console.log("Program:", p.program);
    
    function buildMappingKey(schoolCode, course, programme) {
      return `${schoolCode.toLowerCase().trim()}|${course.toLowerCase().trim()}|${(programme || '').toLowerCase().trim()}`;
    }

    const keysToTry = [
      buildMappingKey(p.school || '', p.course || '', p.program || ''),
      buildMappingKey(p.school || '', p.course || '', ''),
      buildMappingKey(p.school || '', '', '')
    ];
    console.log("\nTrying to match keys:");
    keysToTry.forEach(k => {
      console.log(`  "${k}" -> ${keys.includes(k) ? "MATCH" : "NO MATCH"}`);
    });
  } else {
    console.log("Participant KRMU23567 not found");
  }
}

check().catch(console.error);
