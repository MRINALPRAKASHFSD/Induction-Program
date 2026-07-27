const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env from parent dir
dotenv.config({ path: '../.env' });

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

const db = getFirestore();
const eventId = 'cFeZO1ljj1MD86wL7mg';
const applicationNumber = 'KRMU2643589';

async function check() {
  console.log('Checking event:', eventId);
  const eventDoc = await db.collection('events').doc(eventId).get();
  console.log('Event exists?', eventDoc.exists);
  if (eventDoc.exists) {
    console.log('Event Data:', eventDoc.data());
  }
  
  const participantDocId = `${eventId}_${applicationNumber}`;
  const participantDoc = await db.collection('event_participants').doc(participantDocId).get();
  console.log('Participant exists?', participantDoc.exists);
  if (participantDoc.exists) {
    console.log('Participant Data:', participantDoc.data());
  }
}

check().catch(console.error);
