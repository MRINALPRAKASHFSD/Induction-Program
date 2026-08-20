import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

const db = getFirestore();

async function check() {
  const emailKey = "ak93159888@gmail.com";
  const emailSnap = await db.collection("email_index").doc(emailKey).get();
  console.log("email_index exists:", emailSnap.exists);
  if (emailSnap.exists) {
    console.log("email_index data:", emailSnap.data());
  }
  
  const studentSnap = await db.collection("students").doc("KRMU2652583").get();
  console.log("students exists:", studentSnap.exists);
  if (studentSnap.exists) {
    console.log("students data:", studentSnap.data());
  }
  
  const studentQuery = await db.collection("students").where("email", "==", emailKey).get();
  console.log("studentQuery by email empty:", studentQuery.empty);
  
  process.exit(0);
}

check();
