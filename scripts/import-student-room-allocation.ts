import * as dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { normalizeProgramme } from '../config/programme-mapping';

dotenv.config({ path: '.env' });

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

interface NormalizedRoom {
  roomNumber: string;
  schoolCode: string;
  programme: string;
  section: string;
  block: string;
}

interface AllocationReport {
  totalStudents: number;
  allocated: number;
  missingSection: number;
  programmeMismatch: number;
  duplicates: number;
  issues: any[];
}

async function main() {
  const jsonPath = path.join(os.homedir(), 'Downloads', 'deeksharambh_2026_schedule.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`ERROR: JSON file not found at ${jsonPath}`);
    process.exit(1);
  }

  console.log(`Loading planner data from: ${jsonPath}`);
  const scheduleData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const rawRooms = scheduleData.rooms || {};

  const normalizedRooms: NormalizedRoom[] = [];

  // Parse Room Mappings
  for (const key in rawRooms) {
    const r = rawRooms[key];
    const progRaw = (r.program || '').trim();
    let programme = progRaw;
    let section = '';

    // Handle string splits like "B.Tech (CSE) — Section A" or "B.Tech (CSE) - Section A"
    const sectionMatch = progRaw.match(/(.*?)[\s\-\—]+Section\s+([A-Za-z0-9]+)/i);
    if (sectionMatch) {
      programme = sectionMatch[1].trim();
      section = sectionMatch[2].trim();
    }

    normalizedRooms.push({
      roomNumber: r.room_id || '',
      schoolCode: r.school_code || '',
      programme: programme,
      section: section,
      block: r.block || ''
    });
  }

  console.log(`Extracted ${normalizedRooms.length} room rules.`);

  // Fetch Students
  console.log('Fetching students from Firestore...');
  const studentsSnap = await db.collection('students').get();
  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Found ${students.length} students.`);

  const report: AllocationReport = {
    totalStudents: students.length,
    allocated: 0,
    missingSection: 0,
    programmeMismatch: 0,
    duplicates: 0,
    issues: []
  };

  const allocationsToCommit: any[] = [];
  const assignedStudentIds = new Set<string>();

  for (const student of students) {
    const sId = student.id;
    const email = student.email || '';
    
    // Extract fields with fallback logic just in case fields are swapped
    const rawDept = student.department_id || student.schoolCode || student.school || '';
    const rawCourse = student.course || student.programme || '';
    const rawBranch = student.branch_id || '';
    
    let sSchool = rawDept;
    let sProgRaw = rawCourse;
    const sSec = (student.section || '').trim().toUpperCase();

    const allFields = [rawDept, rawCourse, rawBranch];
    const schoolField = allFields.find(f => f.toLowerCase().includes('school of') || f.toLowerCase().includes('faculty of'));
    if (schoolField) {
      sSchool = schoolField;
      sProgRaw = allFields.find(f => f !== schoolField && f !== '') || '';
    } else if (!sSchool && rawCourse && rawBranch) {
      sSchool = rawCourse;
      sProgRaw = rawBranch;
    }

    // Convert school name to shortcode
    let schoolCode = sSchool.toUpperCase();
    if (sSchool.toLowerCase().includes('engineering')) schoolCode = 'SOET';
    else if (sSchool.toLowerCase().includes('legal')) schoolCode = 'SOLS';
    else if (sSchool.toLowerCase().includes('management')) schoolCode = 'SOMC';
    else if (sSchool.toLowerCase().includes('medical') || sSchool.toLowerCase().includes('allied')) schoolCode = 'SMAS';
    else if (sSchool.toLowerCase().includes('architecture')) schoolCode = 'SOAD';
    else if (sSchool.toLowerCase().includes('basic')) schoolCode = 'SBAS';
    else if (sSchool.toLowerCase().includes('liberal')) schoolCode = 'SOLA';
    else if (sSchool.toLowerCase().includes('emerging') || sSchool.toLowerCase().includes('media')) schoolCode = 'SEMCE';
    else if (sSchool.toLowerCase().includes('agri')) schoolCode = 'SOAS';
    else if (sSchool.toLowerCase().includes('physio')) schoolCode = 'SPRS';

    const normalizedProg = normalizeProgramme(sProgRaw);

    // Exact Match Rules (schoolCode + programme + section)
    const exactMatches = normalizedRooms.filter(r => 
      r.schoolCode === schoolCode && 
      r.programme === normalizedProg &&
      (r.section === sSec || (!r.section && !sSec)) // Match section, or both empty
    );

    if (exactMatches.length === 1) {
      const match = exactMatches[0];
      
      // Duplication check
      if (assignedStudentIds.has(sId)) {
        report.duplicates++;
        report.issues.push({ studentId: sId, issue: 'DUPLICATE_ALLOCATION' });
      } else {
        assignedStudentIds.add(sId);
        allocationsToCommit.push({
          id: `planner_2026_v29_${sId}`,
          data: {
            studentId: sId,
            email: email,
            plannerId: 'planner_2026_v29',
            roomNumber: match.roomNumber,
            block: match.block,
            schoolCode: match.schoolCode,
            programme: match.programme,
            section: match.section || null, // null if no section was required
            source: 'json_import',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        });
        report.allocated++;
      }
      continue;
    }

    // Programme Match Only Check (Missing Section)
    const progMatches = normalizedRooms.filter(r => 
      r.schoolCode === schoolCode && 
      r.programme === normalizedProg
    );

    if (progMatches.length > 0) {
      report.missingSection++;
      report.issues.push({
        studentId: sId,
        email: email,
        programme: normalizedProg,
        issue: 'SECTION_REQUIRED',
        possibleRooms: progMatches.map(r => r.roomNumber)
      });
      continue;
    }

    // No Match
    report.programmeMismatch++;
    report.issues.push({
      studentId: sId,
      email: email,
      schoolCode: schoolCode,
      programme: normalizedProg,
      issue: 'PROGRAMME_NOT_FOUND'
    });
  }

  // Safety Gate: Stop if duplicates found
  if (report.duplicates > 0) {
    console.error('FATAL ERROR: Duplicate allocations found. Aborting write operation.');
    fs.writeFileSync('allocation-report.json', JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // Commit to Firestore in batches
  console.log(`\nValid allocations: ${allocationsToCommit.length}. Writing to Firestore...`);
  const batchSize = 400;
  for (let i = 0; i < allocationsToCommit.length; i += batchSize) {
    const chunk = allocationsToCommit.slice(i, i + batchSize);
    const batch = db.batch();
    
    for (const alloc of chunk) {
      const docRef = db.collection('induction_student_room_allocations').doc(alloc.id);
      batch.set(docRef, alloc.data, { merge: true });
    }
    
    await batch.commit();
    console.log(`Batched ${i + chunk.length} / ${allocationsToCommit.length}`);
  }

  fs.writeFileSync('allocation-report.json', JSON.stringify(report, null, 2));
  console.log('\nMigration complete! Generated allocation-report.json');
  console.log(`Total: ${report.totalStudents} | Allocated: ${report.allocated} | Missing Section: ${report.missingSection} | Mismatch: ${report.programmeMismatch}`);
}

main().catch(console.error);
