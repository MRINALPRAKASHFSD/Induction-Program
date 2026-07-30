import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
dotenv.config();

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

const db = getFirestore();

(async () => {
  const snap = await db.collection('media_assets').where('status', '==', 'PROCESSING').get();
  let count = 0;
  for (const doc of snap.docs) {
    await doc.ref.update({ status: 'READY' });
    count++;
  }
  console.log(`Fixed ${count} stuck assets.`);
  process.exit(0);
})();
