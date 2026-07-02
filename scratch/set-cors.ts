import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET
});

const bucket = getStorage().bucket();

async function configureCors() {
  await bucket.setCorsConfiguration([
    {
      origin: ['*'],
      method: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
      responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'User-Agent', 'x-goog-resumable'],
      maxAgeSeconds: 3600,
    },
  ]);
  console.log('CORS configured successfully');
}

configureCors().catch(console.error);
