/**
 * scripts/tag-test-students.ts
 *
 * Tags known garbage/test student records with environment: "TEST"
 * instead of deleting them, so migration bugs can still be investigated.
 *
 * Usage:
 *   npx ts-node --esm scripts/tag-test-students.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

// ── Heuristic: likely garbage if programme is very short, no spaces, no dots ──
function isLikelyGarbage(student: any): boolean {
  const prog = (student.course || student.programme || student.branch_id || '').trim();
  if (!prog) return true;
  if (prog.length < 4) return true;
  // No spaces AND no dots AND no special chars → gibberish
  if (!/[.\\/&(]/.test(prog) && !/\d/.test(prog) && !prog.includes(' ')) return true;
  return false;
}

async function main() {
  const snap = await db.collection('students').get();
  const batch = db.batch();
  let count = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.environment === 'TEST') continue; // already tagged
    if (isLikelyGarbage(data)) {
      console.log(`Tagging ${doc.id} (programme: "${data.course || data.programme || '?'}")`);
      batch.update(doc.ref, { environment: 'TEST', taggedAt: new Date().toISOString() });
      count++;
    }
  }

  if (count === 0) {
    console.log('No garbage students found to tag.');
    return;
  }

  await batch.commit();
  console.log(`\n✅ Tagged ${count} test/garbage student records with environment="TEST".`);
}

main().catch(err => { console.error(err); process.exit(1); });
