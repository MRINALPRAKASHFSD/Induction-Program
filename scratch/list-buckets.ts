import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })
});

async function listBuckets() {
  try {
    const storage = getStorage();
    const [buckets] = await storage.bucket('dummy').storage.getBuckets();
    console.log('Buckets:');
    buckets.forEach(b => console.log(b.name));
  } catch (e) {
    console.error(e);
  }
}

listBuckets();
