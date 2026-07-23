/**
 * scripts/backfill-indexes.ts
 *
 * ONE-TIME MIGRATION — run ONCE before going live with the new auth flow.
 *
 * What this does:
 *   Reads every existing student document from Firestore, fetches their
 *   private/contact sub-document (for email + phone), then creates the
 *   three index documents that the new auth flow depends on:
 *     - email_index/{email}       → { enrollment_no, created_at }
 *     - studentid_index/{id}      → { email, created_at }
 *     - phone_index/{phone}       → { enrollment_no, created_at }
 *
 * This ensures existing students are recognised as "already registered"
 * when they log in via the new Email + OTP flow and are sent directly
 * to their dashboard without being asked to register again.
 *
 * Usage:
 *   npx ts-node --esm scripts/backfill-indexes.ts
 *   OR with tsx:
 *   npx tsx scripts/backfill-indexes.ts
 *
 * Prerequisites:
 *   Set these environment variables (same as your API server):
 *     FIREBASE_PROJECT_ID
 *     FIREBASE_CLIENT_EMAIL
 *     FIREBASE_PRIVATE_KEY
 *
 * Safety:
 *   - Only creates index docs. Never reads, updates, or deletes student docs.
 *   - Skips students where private/contact doesn't exist (no email on file).
 *   - Skips students where index docs already exist (idempotent).
 *   - Writes in batches of 400 to stay within Firestore's 500-op batch limit.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, WriteBatch } from "firebase-admin/firestore";

// ── Init ────────────────────────────────────────────────────────────────────
if (!getApps().length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.error("❌  Missing env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY");
    process.exit(1);
  }
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  privateKey.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

// ── Helpers ──────────────────────────────────────────────────────────────────
async function commitBatch(batch: WriteBatch, count: number) {
  if (count === 0) return;
  await batch.commit();
  console.log(`  ✓ Committed batch of ${count} ops`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Starting index backfill for existing students...\n");

  const studentsSnap = await db.collection("students").get();
  console.log(`Found ${studentsSnap.size} student documents.\n`);

  let batch      = db.batch();
  let batchCount = 0;
  let processed  = 0;
  let skipped    = 0;
  let errors     = 0;

  const BATCH_LIMIT = 400; // each student = up to 3 ops; stay well under 500

  for (const studentDoc of studentsSnap.docs) {
    const enrollmentNo = studentDoc.id; // document ID is always enrollment_no

    try {
      // Fetch private contact info
      const contactSnap = await db
        .collection("students")
        .doc(enrollmentNo)
        .collection("private")
        .doc("contact")
        .get();

      if (!contactSnap.exists) {
        console.warn(`  ⚠  ${enrollmentNo}: no private/contact doc — skipping`);
        skipped++;
        continue;
      }

      const { email, phone } = contactSnap.data() as { email?: string; phone?: string };

      if (!email) {
        console.warn(`  ⚠  ${enrollmentNo}: no email in private/contact — skipping`);
        skipped++;
        continue;
      }

      const emailKey = email.toLowerCase().trim();
      const idKey    = enrollmentNo.toUpperCase().trim();
      const now      = new Date().toISOString();

      // Check if index docs already exist (idempotent)
      const [emailIdx, idIdx] = await Promise.all([
        db.collection("email_index").doc(emailKey).get(),
        db.collection("studentid_index").doc(idKey).get(),
      ]);

      if (emailIdx.exists && idIdx.exists) {
        // Already backfilled — skip silently
        skipped++;
        continue;
      }

      // email_index
      if (!emailIdx.exists) {
        batch.set(db.collection("email_index").doc(emailKey), {
          enrollment_no: idKey,
          created_at:    now,
        });
        batchCount++;
      }

      // studentid_index
      if (!idIdx.exists) {
        batch.set(db.collection("studentid_index").doc(idKey), {
          email:      emailKey,
          created_at: now,
        });
        batchCount++;
      }

      // phone_index (only if phone is present and non-empty)
      if (phone && phone.trim().length >= 10) {
        const phoneKey = phone.trim();
        const phoneIdx = await db.collection("phone_index").doc(phoneKey).get();
        if (!phoneIdx.exists) {
          batch.set(db.collection("phone_index").doc(phoneKey), {
            enrollment_no: idKey,
            created_at:    now,
          });
          batchCount++;
        }
      }

      processed++;
      console.log(`  ✓ ${enrollmentNo} → ${emailKey}`);

      // Commit when batch is full
      if (batchCount >= BATCH_LIMIT) {
        await commitBatch(batch, batchCount);
        batch      = db.batch();
        batchCount = 0;
      }
    } catch (err) {
      console.error(`  ✗ ${enrollmentNo}: ${(err as Error).message}`);
      errors++;
    }
  }

  // Commit remaining ops
  await commitBatch(batch, batchCount);

  console.log("\n─────────────────────────────────────────");
  console.log(`✅ Backfill complete`);
  console.log(`   Processed : ${processed}`);
  console.log(`   Skipped   : ${skipped}`);
  console.log(`   Errors    : ${errors}`);
  console.log("─────────────────────────────────────────\n");

  if (errors > 0) {
    console.warn("⚠  Some students had errors. Re-run the script to retry — it is safe to run multiple times.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
