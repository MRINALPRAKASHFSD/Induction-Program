const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const dotenv = require('dotenv');
dotenv.config();

const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  })
});

const db = getFirestore();

async function run() {
  const snapshot = await db.collection('events').get();
  console.log(`Found ${snapshot.size} events:`);
  snapshot.forEach(doc => {
    console.log(doc.id, '=>', doc.data().title);
  });
}
run();
