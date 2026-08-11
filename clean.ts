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

async function clean() {
  const pSnap = await db.collection('induction_participants').doc('KRMU23567').get();
  const email = pSnap.exists ? pSnap.data().email : null;
  
  const batch = db.batch();
  batch.delete(db.collection('students').doc('KRMU23567'));
  batch.delete(db.collection('studentid_index').doc('KRMU23567'));
  if (email) batch.delete(db.collection('email_index').doc(email));
  
  await batch.commit();
  console.log("Cleanup done for KRMU23567");
}

clean().catch(console.error);
