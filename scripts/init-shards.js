import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * scripts/init-shards.js
 * 
 * Utility script to initialize distributed counter shards for a specific attendance session.
 * Usage:
 *   node scripts/init-shards.js <sessionId> [numShards]
 */

const sessionId = process.argv[2];
const numShards = parseInt(process.argv[3] || '64', 10);

if (!sessionId) {
  console.error('Usage: node scripts/init-shards.js <sessionId> [numShards]');
  process.exit(1);
}

if (!process.env.FIREBASE_PROJECT_ID) {
  console.error('Missing FIREBASE_PROJECT_ID environment variable.');
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

async function initShards() {
  console.log(`Initializing ${numShards} shards for session: ${sessionId}`);
  const sessionRef = db.collection('attendance_sessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();

  if (!sessionDoc.exists) {
    console.error(`Error: Session ${sessionId} does not exist.`);
    process.exit(1);
  }

  const batch = db.batch();
  for (let i = 0; i < numShards; i++) {
    const shardId = i.toString();
    const shardRef = sessionRef.collection('attendance_stats').doc(shardId);
    batch.set(shardRef, { count: 0 }, { merge: true });
  }

  // Update the session doc with the configured shard count
  batch.update(sessionRef, {
    shard_count: numShards
  });

  await batch.commit();
  console.log(`Successfully initialized ${numShards} shards for ${sessionId}.`);
}

initShards().catch(console.error);
