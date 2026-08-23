import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

async function checkStudent(enrollmentNo: string) {
  console.log(`\nChecking for ${enrollmentNo}...`);
  
  const doc = await db.collection('students').doc(enrollmentNo).get();
  if (doc.exists) {
    console.log(`✅ Found in students collection by ID! Name: ${doc.data()?.name || doc.data()?.full_name}`);
    return;
  }
  
  const studentsByField = await db.collection('students').where('enrollment_no', '==', enrollmentNo).get();
  if (!studentsByField.empty) {
    console.log(`✅ Found in students collection by field! ID: ${studentsByField.docs[0].id}`);
    return;
  }

  const usersByField = await db.collection('users').where('enrollment_no', '==', enrollmentNo).get();
  if (!usersByField.empty) {
    console.log(`✅ Found in users collection by field! ID: ${usersByField.docs[0].id}, Name: ${usersByField.docs[0].data()?.full_name || usersByField.docs[0].data()?.name}`);
    return;
  }
  
  console.log(`❌ Not found anywhere in students or users collection.`);
}

async function run() {
  await checkStudent('KRMU2660879');
  await checkStudent('KRMU2670071');
  await checkStudent('KRMU2663860');
  process.exit(0);
}

run();
