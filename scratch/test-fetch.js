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
  const docRef = db.collection('events').doc('cFeZO1ljj1MD86wL7mg');
  const snap = await docRef.get();
  console.log('Exists?', snap.exists);
  if (snap.exists) {
    console.log('Data:', snap.data());
  }
}
run();
