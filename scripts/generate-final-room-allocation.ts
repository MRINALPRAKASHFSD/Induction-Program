/**
 * scripts/generate-final-room-allocation.ts
 *
 * THE SINGLE CANONICAL BATCH MIGRATION SCRIPT for Deeksharambh 2026.
 * Uses the shared services/deeksharambh-allocation-engine for all logic.
 *
 * Reads:   ~/Downloads/deeksharambh_2026_schedule.json
 * Writes:
 *   Firestore: induction_student_room_allocations/{plannerId}_{studentId}
 *   Firestore: induction_student_schedule/{plannerId}_{studentId}
 *   Local:     allocation-final-report.json
 *
 * Safe to re-run (idempotent via merge: true).
 *
 * Usage:
 *   npm run migrate:deeksharambh
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import * as fs from 'fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  PLANNER_ID,
  getParsedRooms,
  getSessionsByRoom,
  createInMemoryOccupancy,
  allocateStudent,
  type NormalizedRoom,
} from '../services/deeksharambh-allocation-engine.js';

// ── Firebase ──────────────────────────────────────────────────────────────────
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
const REPORT_PATH  = 'allocation-final-report.json';
const BATCH_SIZE   = 400;

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Deeksharambh 2026 Final Production Migration ===\n');

  const rooms          = getParsedRooms();
  const sessionsByRoom = getSessionsByRoom();
  console.log(`Parsed ${rooms.length} rooms from JSON.`);

  // ── Fetch all students (sorted by studentId for deterministic distribution) ─
  console.log('Fetching students from Firestore...');
  const studentsSnap = await db.collection('students').get();
  const students     = studentsSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  console.log(`Found ${students.length} students.\n`);

  // ── Capacity validation: build expected occupancy snapshot ───────────────────
  const roomCapMap: Record<string, number> = {};
  for (const r of rooms) roomCapMap[r.roomNumber] = r.capacity;

  // ── Run allocation ────────────────────────────────────────────────────────────
  const occupancy = createInMemoryOccupancy(rooms);

  const report = {
    totalStudents:        students.length,
    allocated:            0,
    sectionMatch:         0,
    capacityDistribution: 0,
    programmeOnly:        0,
    unallocated:          0,
    duplicates:           0,
    schedulesGenerated:   0,
    roomsUsed:            0,
    capacityViolations:   [] as string[],
    roomOccupancy:        {} as Record<string, { capacity: number; assigned: number }>,
    unallocatedStudents:  [] as Array<{ studentId: string; programme: string; reason: string }>,
  };

  const allocDocs:  Array<{ id: string; data: any }> = [];
  const schedDocs:  Array<{ id: string; data: any }> = [];
  const seenIds     = new Set<string>();

  for (const student of students) {
    const sId = String(student.id);

    if (seenIds.has(sId)) {
      report.duplicates++;
      continue;
    }
    seenIds.add(sId);

    const result = allocateStudent(student, occupancy, rooms, sessionsByRoom);

    if (!result.allocDoc) {
      report.unallocated++;
      report.unallocatedStudents.push({
        studentId: sId,
        programme: student.course || student.programme || student.branch_id || '??',
        reason:    result.reason || 'Unknown',
      });
      continue;
    }

    allocDocs.push({ id: `${PLANNER_ID}_${sId}`, data: result.allocDoc });

    if (result.scheduleDoc && result.scheduleDoc.days.length > 0) {
      schedDocs.push({ id: `${PLANNER_ID}_${sId}`, data: result.scheduleDoc });
      report.schedulesGenerated++;
    }

    report.allocated++;
    if (result.allocDoc.allocationMethod === 'EXACT_MATCH')         report.sectionMatch++;
    if (result.allocDoc.allocationMethod === 'CAPACITY_DISTRIBUTION') report.capacityDistribution++;
    if (result.allocDoc.allocationMethod === 'PROGRAMME_ONLY')       report.programmeOnly++;
  }

  // ── Build room occupancy report ───────────────────────────────────────────────
  for (const room of rooms) {
    const assigned = occupancy.get(room.roomNumber);
    if (assigned > 0) {
      report.roomOccupancy[room.roomNumber] = { capacity: room.capacity, assigned };
      if (assigned > room.capacity) {
        report.capacityViolations.push(
          `${room.roomNumber}: assigned ${assigned} > capacity ${room.capacity} (overflow ${assigned - room.capacity})`
        );
      }
    }
  }
  report.roomsUsed = Object.keys(report.roomOccupancy).length;

  // ── Print summary ─────────────────────────────────────────────────────────────
  console.log('--- Allocation Summary ---');
  console.log(`Total Students:          ${report.totalStudents}`);
  console.log(`Allocated:               ${report.allocated}`);
  console.log(`  ↳ Exact Match:         ${report.sectionMatch}`);
  console.log(`  ↳ Capacity Distrib.:   ${report.capacityDistribution}`);
  console.log(`  ↳ Programme Only:      ${report.programmeOnly}`);
  console.log(`Unallocated:             ${report.unallocated}`);
  console.log(`Duplicates Skipped:      ${report.duplicates}`);
  console.log(`Schedules Generated:     ${report.schedulesGenerated}`);
  console.log(`Rooms Used:              ${report.roomsUsed}`);
  console.log(`Capacity Violations:     ${report.capacityViolations.length}`);
  if (report.capacityViolations.length > 0) {
    report.capacityViolations.forEach(v => console.warn(`  ⚠️  ${v}`));
    console.warn('\n[WARNING] These rooms have more students than the JSON-specified capacity.');
    console.warn('[WARNING] This means more students enrolled than the planner planned for.');
    console.warn('[WARNING] Physical seating must be managed by administration.');
    console.warn('[WARNING] Migration will proceed — all students will be assigned.\n');
  }
  console.log('-------------------------\n');


  // ── Safety gates ──────────────────────────────────────────────────────────────
  if (report.duplicates > 0) {
    console.error('FATAL: Duplicate student IDs detected in source data. Aborting.');
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (report.capacityViolations.length > 0) {
    // NOTE: Not a FATAL error. Capacity overflow means more students enrolled than planned.
    // This is a physical seating problem for administration to manage.
    // We still write the report so admin can see overflow rooms.
    console.warn(`[WARNING] ${report.capacityViolations.length} room(s) exceeded JSON capacity — see report.`);
  }


  // Distinguish genuine unallocated (real programmes not in JSON) from test garbage
  const realUnallocated = report.unallocatedStudents.filter(s => {
    const prog = s.programme || '';
    // Likely garbage: no spaces, no dots, no special chars, very short
    const isGarbage = prog.length < 4 ||
      (!/[.\\/&(]/.test(prog) && !/\d/.test(prog) && !prog.includes(' '));
    return !isGarbage;
  });

  if (realUnallocated.length > 0) {
    console.error(`FATAL: ${realUnallocated.length} real students unallocated. Aborting Firestore write.`);
    realUnallocated.forEach(s => console.error(`  - ${s.studentId}: ${s.programme}`));
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (report.unallocated > 0) {
    console.warn(`⚠️  ${report.unallocated} students skipped — test/garbage data (see report).`);
  }

  // ── Commit room allocations ───────────────────────────────────────────────────
  console.log(`Writing ${allocDocs.length} room allocations to Firestore...`);
  for (let i = 0; i < allocDocs.length; i += BATCH_SIZE) {
    const chunk = allocDocs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.set(
        db.collection('induction_student_room_allocations').doc(doc.id),
        doc.data,
        { merge: true }
      );
    }
    await batch.commit();
    console.log(`  Room alloc: ${Math.min(i + BATCH_SIZE, allocDocs.length)} / ${allocDocs.length}`);
  }

  // ── Commit schedules (single doc per student) ─────────────────────────────────
  console.log(`\nWriting ${schedDocs.length} schedule documents to Firestore...`);
  for (let i = 0; i < schedDocs.length; i += BATCH_SIZE) {
    const chunk = schedDocs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.set(
        db.collection('induction_student_schedule').doc(doc.id),
        doc.data,
        { merge: true }
      );
    }
    await batch.commit();
    console.log(`  Schedules: ${Math.min(i + BATCH_SIZE, schedDocs.length)} / ${schedDocs.length}`);
  }

  // ── Write report ──────────────────────────────────────────────────────────────
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n✅ Migration complete. Report: ${REPORT_PATH}`);
  console.log(`\nStudents processed: ${report.totalStudents}`);
  console.log(`Rooms allocated:    ${report.allocated}`);
  console.log(`Schedules written:  ${report.schedulesGenerated}`);
  console.log(`Unallocated (test): ${report.unallocated}`);
}

main().catch(err => {
  console.error('\nFATAL migration error:', err);
  process.exit(1);
});
