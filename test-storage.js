import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import * as dotenv from 'dotenv';
dotenv.config();

const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/^'|'$/g, '').replace(/\\n/g, '\n');

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
});

const bucket = getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET || 'krmu-induction-app-d3591.firebasestorage.app');

async function test() {
  const [url] = await bucket.file('documents/test.pdf').getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000,
    responseDisposition: 'attachment; filename="test.pdf"',
  });
  console.log(url);
}

test().catch(console.error);
