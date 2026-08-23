import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import xlsx from 'xlsx';
import * as fs from 'fs';

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

// Helper to normalize programme names
function normalizeString(str: string): string {
  if (!str) return '';
  let s = str.trim().toLowerCase();
  s = s.replace(/[^a-z0-9]/g, ''); // remove all non-alphanumeric chars for robust matching
  return s;
}

interface RoomRule {
  schoolCode: string;
  programme: string;
  section: string;
  roomNumber: string;
  block: string;
  capacity: number;
  currentAssigned: number;
}

async function main() {
  const filePath = process.argv[2];
  const plannerId = process.argv[3] || 'planner_2026_v29';

  if (!filePath) {
    console.error('Usage: npx tsx scripts/import-room-allocations.ts <path-to-excel-or-csv> [plannerId]');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Loading Mapping Rules from: ${filePath}`);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { range: 2 });

  const roomRules: RoomRule[] = [];

  for (const row of data) {
    const schoolCode = (row['School Code'] || '').toString().trim();
    const progSec = (row['Program / Section'] || '').toString().trim();
    const roomNumber = (row['Room Number'] || '').toString().trim();
    const block = (row['Block'] || '').toString().trim();
    const capacityRaw = (row['Capacity'] || '0').toString().trim();
    const capacity = parseInt(capacityRaw, 10) || 0;

    if (!schoolCode || !progSec || !roomNumber) continue;

    // Split Program / Section. e.g. "B.Tech (CSE) - Section A"
    let programme = progSec;
    let section = '';
    
    // basic splitting logic - adapt as needed based on exact Excel format
    if (progSec.includes(' - ')) {
      const parts = progSec.split(' - ');
      programme = parts[0].trim();
      section = parts[1].trim();
    } else if (progSec.toLowerCase().includes('section')) {
       // regex to extract section
       const secMatch = progSec.match(/(.*?)\\s+section\\s+([a-z0-9]+)/i);
       if (secMatch) {
         programme = secMatch[1].trim();
         section = secMatch[2].trim();
       }
    }

    roomRules.push({
      schoolCode,
      programme,
      section,
      roomNumber,
      block,
      capacity,
      currentAssigned: 0
    });
  }

  console.log(`Loaded ${roomRules.length} room mapping rules.`);

  console.log(`Fetching all students from Firestore...`);
  const studentsSnap = await db.collection('students').get();
  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Found ${students.length} students.`);

  let successCount = 0;
  let failedCount = 0;
  let duplicateCount = 0;
  const failedRecords: any[] = [];

  // Delete existing allocations for this planner to avoid duplicates during re-runs
  // (Optional, but good for idempotency if we are resetting)
  // For safety, we will just rely on allocationKey uniqueness and overwrite/skip.

function mapStudentToExcelProgram(school: string, course: string, rules: RoomRule[]): RoomRule[] {
  let s = school.toLowerCase().trim();
  const c = course.toLowerCase().trim();

  // Normalize long school names to short codes
  if (s.includes('engineering and technology')) s = 'soet';
  else if (s.includes('legal studies')) s = 'sols';
  else if (s.includes('management and commerce')) s = 'somc';
  else if (s.includes('medical and allied sciences')) s = 'smas';
  else if (s.includes('architecture and design')) s = 'soad';
  else if (s.includes('basic and applied sciences')) s = 'sbas';
  else if (s.includes('liberal arts')) s = 'sola';
  else if (s.includes('hotel management')) s = 'shmct';

  // Filter rules by school first
  let schoolRules = rules.filter(r => r.schoolCode.toLowerCase() === s);
  
  if (schoolRules.length === 0) {
    // some students have department_id 'test-dept' or typos, skip them
    return [];
  }

  // Deterministic routing based on school
  let matchedProgram = '';

  if (s === 'soet') {
    if (c.includes('mca')) matchedProgram = 'MCA (Core / AI & ML)';
    else if (c.includes('bca')) matchedProgram = 'BCA (AI & DS)';
    else if (c.includes('bsc') || c.includes('b.sc')) matchedProgram = 'B.Sc. (CS / Cyber / Data Science)';
    else if (c.includes('cyber')) matchedProgram = 'B.Tech (Cyber Security)';
    else if (c.includes('robot')) matchedProgram = 'B.Tech (Robotics)';
    else if ((c.includes('data') && c.includes('science')) || c.includes('ds')) matchedProgram = 'B.Tech (Data Science)';
    else if (c.includes('ai') && (c.includes('ml') || c.includes('machine'))) matchedProgram = 'B.Tech (AI & ML)';
    else if (c.includes('cse') || c.includes('core') || c.includes('btech') || c.includes('b.tech')) matchedProgram = 'B.Tech (CSE)';
  } else if (s === 'sols') {
    if (c.includes('bba') && c.includes('ll')) matchedProgram = 'B.B.A. LL.B. (Hons.) & LL.B. (Hons.) & LL.M.';
    else if (c.includes('ll') && c.includes('m')) matchedProgram = 'B.B.A. LL.B. (Hons.) & LL.B. (Hons.) & LL.M.';
    else if (c.includes('ba') && c.includes('ll')) matchedProgram = 'B.A. LL.B. (Hons.)';
    else if (c.includes('ll')) matchedProgram = 'B.B.A. LL.B. (Hons.) & LL.B. (Hons.) & LL.M.'; // Catch all LLB
  } else if (s === 'somc') {
    if (c.includes('mba')) matchedProgram = 'MBA (DM / Fintech) — overflow';
    else if (c.includes('acca')) matchedProgram = 'BBA (International Accounting & Finance) ACCA–UK';
    else if (c.includes('ey') || c.includes('intelligence')) matchedProgram = 'BBA (Business Intelligence & Analytics) with Knowledge Partner EY';
    else if (c.includes('iide') || c.includes('digital')) matchedProgram = 'BBA (Digital Marketing) with Academic Support of IIDE';
    else if (c.includes('entrepreneurship') || c.includes('gcec')) matchedProgram = 'BBA (Entrepreneurship) with Academic Support of GCEC Global Foundation';
    else if (c.includes('com')) matchedProgram = 'B.Com. (Hons.) / B.Com. (Hons./Hons. with Research)';
    else if (c.includes('bba')) matchedProgram = 'BBA (HR/Marketing/Finance/IB/Travel & Tourism)';
  } else if (s === 'smas') {
    if (c.includes('pharm') && (c.includes('d.') || c.includes('m.'))) matchedProgram = 'D.Pharm & M.Pharm';
    else if (c.includes('pharm') && c.includes('b.')) matchedProgram = 'B.Pharm — Group A'; // fallback
    else if (c.includes('pharm')) matchedProgram = 'B.Pharm — Group A';
    else if (c.includes('cardio') || c.includes('ct')) matchedProgram = 'Allied Health Sciences — Group A (B.Sc. CT)';
    else if (c.includes('emt') || c.includes('rt') || c.includes('health')) matchedProgram = 'Allied Health Sciences — Group B (B.RT & B.EMT)';
    else if (c.includes('physio') || c.includes('bpt')) matchedProgram = 'B.P.T. (Bachelor of Physiotherapy) — Main Room';
  } else if (s === 'soad') {
    if (c.includes('arch') || c.includes('design') || c.includes('bdes')) matchedProgram = 'B.Arch / B.Design / M.Arch / M.Design — Room 1';
  } else if (s === 'sbas') {
    if (c.includes('forensic')) {
       if (c.includes('msc') || c.includes('m.sc')) matchedProgram = 'B.Sc.–M.Sc. Integrated (Forensic Science) & M.Sc. Forensic Science';
       else matchedProgram = 'B.Sc. (Hons.) Forensic Science';
    }
    else if (c.includes('physics') || c.includes('chem') || c.includes('math')) matchedProgram = 'B.Sc. (Hons.) Physics / Chemistry / Maths';
  } else if (s === 'sola') {
    if (c.includes('psychology')) matchedProgram = 'B.A. Psychology (H) & M.A. Psychology (H)';
    else if (c.includes('econ')) matchedProgram = 'B.A. Economics (H)';
    else if (c.includes('english') || c.includes('political')) matchedProgram = 'B.A. Political Science (H) & B.A. English (H)';
  } else if (s === 'shmct') {
    // No specific rules in the excel for SHMCT that are obvious, but just in case
  }

  // If we mapped it to a specific program, find all sections for that program
  if (matchedProgram) {
    return schoolRules.filter(r => {
      // the excel program name might have " — Section A" appended, so we check if it starts with the matched program
      return r.programme.toLowerCase().startsWith(matchedProgram.toLowerCase()) || 
             matchedProgram.toLowerCase().startsWith(r.programme.toLowerCase());
    });
  }

  return [];
}

  console.log('Processing student allocations...');

  const batchSize = 100;
  for (let i = 0; i < students.length; i += batchSize) {
    const batch = students.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (student) => {
      const sId = student.id; // Firebase UID
      const enrollmentNo = student.enrollment_no || '';
      const email = student.email || '';
      
      // Extract raw fields
      const rawDept = student.department_id || student.schoolCode || student.school || '';
      const rawCourse = student.course || student.programme || '';
      const rawBranch = student.branch_id || '';
      
      let sSchool = rawDept;
      let sProg = rawCourse;
      let sSec = student.section || '';

      // Fix swapped registration data based on content
      const allFields = [rawDept, rawCourse, rawBranch];
      
      // Look for the field that contains "school of" or "faculty of"
      const schoolField = allFields.find(f => f.toLowerCase().includes('school of') || f.toLowerCase().includes('faculty of') || f.toLowerCase().includes('institute of'));
      if (schoolField) {
        sSchool = schoolField;
        // The course is whatever field is NOT the school field and is NOT empty
        sProg = allFields.find(f => f !== schoolField && f !== '') || '';
      } else {
         // If we can't find a clear school string, but dept is empty and course + branch are populated
         if (!sSchool && rawCourse && rawBranch) {
            // Assume one is school and one is program. 
            sSchool = rawCourse;
            sProg = rawBranch;
         }
      }

      // If no school or programme, we can't map
      if (!sSchool || !sProg) {
        failedCount++;
        failedRecords.push({ studentId: sId, email, reason: 'Missing school or programme in profile' });
        return;
      }

      // Find candidate rules for this school and programme using deterministic mapping
      const candidates = mapStudentToExcelProgram(sSchool, sProg, roomRules);

      if (candidates.length === 0) {
        failedCount++;
        failedRecords.push({ studentId: sId, email, school: sSchool, programme: sProg, reason: 'No mapping rules found for this school/programme' });
        return;
      }

      let selectedRule: RoomRule | null = null;

      if (candidates.length === 1) {
        // Only one room for this program, easy.
        selectedRule = candidates[0];
      } else {
        // Multiple rooms available. We need to match section or distribute.
        if (sSec) {
          const exactMatch = candidates.find(c => normalizeString(c.section) === normalizeString(sSec));
          if (exactMatch) {
            selectedRule = exactMatch;
          }
        }

        if (!selectedRule) {
          // Section is missing or didn't match. Distribute based on capacity!
          // Find the room with the lowest percentage filled.
          selectedRule = candidates.reduce((prev, curr) => {
            const prevRatio = prev.capacity > 0 ? (prev.currentAssigned / prev.capacity) : 1;
            const currRatio = curr.capacity > 0 ? (curr.currentAssigned / curr.capacity) : 1;
            return prevRatio < currRatio ? prev : curr;
          });
        }
      }

      if (!selectedRule) {
        failedCount++;
        failedRecords.push({ studentId: sId, email, reason: 'Failed to select a room rule' });
        return;
      }

      // Assign to this rule
      selectedRule.currentAssigned++;

      const allocationKey = `${plannerId}_${sId}`;

      try {
        // Instead of reading to check duplicates, just use set(..., {merge: true}) on the allocationKey as document ID
        // This makes the script idempotent and much faster!
        const allocationData = {
          studentId: sId,
          uid: sId, // storing uid explicitly
          enrollmentNo,
          email,
          studentName: student.name || '',
          schoolCode: selectedRule.schoolCode,
          programme: selectedRule.programme,
          section: selectedRule.section || sSec, // store the section they were mapped to
          roomNumber: selectedRule.roomNumber,
          block: selectedRule.block,
          plannerId,
          allocationKey,
          source: 'excel_import_deterministic',
          updatedAt: new Date().toISOString()
        };

        await db.collection('induction_student_room_allocations').doc(allocationKey).set(allocationData, { merge: true });
        successCount++;
      } catch (e: any) {
        failedCount++;
        failedRecords.push({ studentId: sId, email, reason: `Error: ${e.message}` });
      }
    }));
  }

  console.log('\n--- Import Summary ---');
  console.log(`Total Students Processed: ${students.length}`);
  console.log(`Successfully Allocated: ${successCount}`);
  console.log(`Failed Allocations: ${failedCount}`);

  if (failedRecords.length > 0) {
    const failedCsvPath = 'failed_allocations.csv';
    const csvContent = ['Student UID,Email,School,Programme,Reason'];
    for (const record of failedRecords) {
      csvContent.push(`"${record.studentId || ''}","${record.email || ''}","${record.school || ''}","${record.programme || ''}","${record.reason}"`);
    }
    fs.writeFileSync(failedCsvPath, csvContent.join('\n'));
    console.log(`\nWrote ${failedRecords.length} failed records to ${failedCsvPath}`);
  }

  console.log('\n--- Room Utilization Summary ---');
  for (const rule of roomRules) {
    if (rule.currentAssigned > 0) {
      console.log(`[${rule.schoolCode}] ${rule.programme} ${rule.section ? '('+rule.section+')' : ''} -> Room ${rule.roomNumber}: ${rule.currentAssigned}/${rule.capacity} filled`);
    }
  }
}

main().catch(console.error);
