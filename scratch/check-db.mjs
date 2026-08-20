import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize firebase admin
const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();

async function check() {
  const users = await db.collection('users').limit(1).get();
  users.forEach(doc => {
    console.log(doc.data());
  });
  process.exit(0);
}
check();
