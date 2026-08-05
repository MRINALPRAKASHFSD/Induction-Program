/**
 * Planner Parser — Aarambh 2026
 *
 * PURE MODULE — No Firestore, no HTTP, no side effects.
 * Converts a raw Excel (.xlsx) buffer into typed, validated planner data.
 * Fully unit-testable in isolation.
 *
 * Sheet expectations (configurable via PLANNER_COLUMN_MAP below):
 *   "Room Allocation"   — school / programme / course / room / block / floor / capacity
 *   "Schedule"          — day / date / startTime / endTime / session / type / venue /
 *                         building / block / floor / room / faculty / speaker /
 *                         instructions / scope / scopeKey / mandatory / documentationDay
 *   "Venue List"        — venue name / building / block / floor / capacity
 *   "Faculty"           — name (optional standalone sheet — supplementary)
 *
 * Update PLANNER_COLUMN_MAP to match your actual Excel column headers exactly.
 */

import * as XLSX from 'xlsx';
import crypto from 'crypto';

// ── Column Map (update to match your actual Excel headers) ───────────────────

export const PLANNER_COLUMN_MAP = {
  roomAllocation: {
    sheet:       'Room Allocation',
    school:      'School',
    schoolCode:  'School Code',       // e.g. SOET → maps to department_id
    programme:   'Programme',         // matches student.branch
    course:      'Course',            // matches student.course
    roomNumber:  'Room No',
    block:       'Block',
    floor:       'Floor',
    capacity:    'Capacity',
  },
  schedule: {
    sheet:          'Schedule',
    dayNumber:      'Day',
    date:           'Date',           // "24-Aug-26" or "2026-08-24"
    startTime:      'Start Time',     // "09:00" or Excel time serial
    endTime:        'End Time',
    sessionName:    'Session Name',
    sessionType:    'Session Type',
    venueName:      'Venue',
    building:       'Building',
    block:          'Block',
    floor:          'Floor',
    room:           'Room',
    facultyCoordinator: 'Faculty Coordinator',
    speaker:        'Speaker',
    specialInstructions: 'Instructions',
    scope:          'Scope',          // "universal" | "school" | "programme" | "course"
    scopeKey:       'Scope Key',      // e.g. "soet" or "B.Tech CSE"
    isDocumentationDay: 'Documentation Day', // "yes"/"no"
    isMandatory:    'Mandatory',
  },
  venues: {
    sheet:    'Venue List',
    name:     'Venue Name',
    building: 'Building',
    block:    'Block',
    floor:    'Floor',
    capacity: 'Capacity',
  },
} as const;

// ── Known valid blocks (update to match your campus) ─────────────────────────

const KNOWN_BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'AB', 'Admin', 'Library'];

// ── Induction date range ──────────────────────────────────────────────────────

const INDUCTION_START = new Date('2026-08-24');
const INDUCTION_END   = new Date('2026-08-29');

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlannerScope = 'universal' | 'school' | 'programme' | 'course';
export type PlannerStatus = 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED' | 'ROLLED_BACK';

export interface ParsedPlannerRoomAllocation {
  mappingKey:  string;   // "{schoolCode}|{course}|{programme}"  — computed, never stored on student
  school:      string;   // display name
  schoolCode:  string;   // department_id (lowercase) e.g. "soet"
  programme:   string;   // student.branch display name
  course:      string;   // e.g. "B.Tech"
  roomNumber:  string;
  block:       string;
  floor:       string;
  capacity:    number;
  rowIndex:    number;   // original Excel row (1-indexed from data start) for error messages
}

export interface ParsedSession {
  dayNumber:            number;
  date:                 string;   // ISO "2026-08-24"
  startTime:            string;   // "09:00"
  endTime:              string;   // "10:30"
  sessionName:          string;
  sessionType:          string;
  venueName:            string;
  building:             string;
  block:                string;
  floor:                string;
  room:                 string;
  facultyCoordinator:   string;
  speaker:              string;
  specialInstructions:  string;
  scope:                PlannerScope;
  scopeKey:             string;   // "" for universal
  isDocumentationDay:   boolean;
  isMandatory:          boolean;
  rowIndex:             number;
}

export interface ParsedVenue {
  name:      string;
  building:  string;
  block:     string;
  floor:     string;
  capacity:  number | null;
}

export interface ValidationError {
  code:     string;
  severity: 'ERROR' | 'WARNING';
  sheet:    string;
  row:      number;
  field:    string;
  message:  string;
}

export interface PlannerParseResult {
  plannerYear:          number;
  fileChecksum:         string;   // MD5 of raw buffer
  excelFilename:        string;
  roomAllocations:      ParsedPlannerRoomAllocation[];
  sessions:             ParsedSession[];
  venues:               ParsedVenue[];
  mandatorySlots:       ParsedSession[];
  validationErrors:     ValidationError[];    // severity=ERROR  → blocks publish
  validationWarnings:   ValidationError[];    // severity=WARNING → non-blocking
  rowsParsed:           number;
  rowsIgnored:          number;
  summary: {
    schoolCount:      number;
    programmeCount:   number;
    courseCount:      number;
    roomCount:        number;
    sessionCount:     number;
    venueCount:       number;
    facultyCount:     number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise a cell value to a trimmed string from one or more candidate column headers (exact or fuzzy) */
function cell(row: Record<string, any>, ...cols: string[]): string {
  // 1. Exact matches first
  for (const col of cols) {
    if (row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '') {
      return String(row[col]).trim();
    }
  }

  // 2. Normalize row keys (lowercase, remove spaces/underscores/punctuation)
  const normMap = new Map<string, string>();
  for (const k of Object.keys(row)) {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normMap.has(norm)) {
      normMap.set(norm, k);
    }
  }

  // 3. Normalized match
  for (const col of cols) {
    const targetNorm = col.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedKey = normMap.get(targetNorm);
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
      const val = String(row[matchedKey]).trim();
      if (val !== '') return val;
    }
  }

  // 4. Substring / partial header match (e.g. "School Code (SOET)" matches "schoolcode")
  for (const col of cols) {
    const targetNorm = col.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (targetNorm.length < 5) continue;
    for (const [normRowKey, origKey] of normMap.entries()) {
      if (normRowKey.length < 5) continue; // Prevent short headers like "day" matching "docday"
      if (normRowKey.includes(targetNorm) || targetNorm.includes(normRowKey)) {
        if (row[origKey] !== undefined && row[origKey] !== null) {
          const val = String(row[origKey]).trim();
          if (val !== '') return val;
        }
      }
    }
  }

  return '';
}

/** Parse Excel time serial or HH:MM string → "HH:MM" */
function parseTime(raw: string | number): string {
  if (typeof raw === 'number') {
    // Excel time serial: fraction of a day
    const totalMinutes = Math.round(raw * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  // Already HH:MM or H:MM
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    return `${String(parseInt(h, 10)).padStart(2, '0')}:${m}`;
  }
  return s;
}

/** Parse Excel date serial or string → ISO "YYYY-MM-DD" without UTC day shift */
function parseDate(raw: string | number | Date): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const dMonY = s.match(/^(\d{1,2})[-/ ]([a-zA-Z]{3,9})[-/ ](\d{2,4})$/);
  if (dMonY) {
    const day = String(dMonY[1]).padStart(2, '0');
    const monStr = dMonY[2].slice(0, 3).toLowerCase();
    const mon = months[monStr] || '08';
    let yr = dMonY[3];
    if (yr.length === 2) yr = `20${yr}`;
    return `${yr}-${mon}-${day}`;
  }

  const dMy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dMy) {
    const day = String(dMy[1]).padStart(2, '0');
    const mon = String(dMy[2]).padStart(2, '0');
    return `${dMy[3]}-${mon}-${day}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return s;
}

/** Compute "HH:MM" as minutes from midnight — for overlap detection */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Compute mappingKey from schoolCode + course + programme (all lowercase, trimmed) */
function buildMappingKey(schoolCode: string, course: string, programme: string): string {
  return `${schoolCode.toLowerCase().trim()}|${course.toLowerCase().trim()}|${programme.toLowerCase().trim()}`;
}

function isYes(v: string): boolean {
  return ['yes', 'y', '1', 'true'].includes(v.toLowerCase());
}

// ── Main Parser ───────────────────────────────────────────────────────────────

export function parsePlannerExcel(
  buffer: Buffer,
  filename: string,
): PlannerParseResult {
  const cm = PLANNER_COLUMN_MAP;
  const errors: ValidationError[] = [];
  const fileChecksum = crypto.createHash('md5').update(buffer).digest('hex');

  // ── Load workbook ──────────────────────────────────────────────────────────
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const sheetNames = wb.SheetNames;
  let rowsParsed  = 0;
  let rowsIgnored = 0;

  function addError(severity: 'ERROR' | 'WARNING', sheet: string, row: number, field: string, code: string, message: string) {
    errors.push({ code, severity, sheet, row, field, message });
  }

  function findSheet(name: string, fallbackKeywords: string[] = []): { sheetName: string; sheet: XLSX.WorkSheet } | null {
    if (wb.Sheets[name]) {
      return { sheetName: name, sheet: wb.Sheets[name] };
    }
    const target = name.trim().toLowerCase();
    for (const sName of wb.SheetNames) {
      const lower = sName.trim().toLowerCase();
      if (lower === target || lower.includes(target) || target.includes(lower)) {
        return { sheetName: sName, sheet: wb.Sheets[sName] };
      }
    }
    for (const kw of fallbackKeywords) {
      for (const sName of wb.SheetNames) {
        const lower = sName.trim().toLowerCase();
        if (lower.includes(kw.toLowerCase())) {
          return { sheetName: sName, sheet: wb.Sheets[sName] };
        }
      }
    }
    return null;
  }

  function requireSheet(name: string, fallbackKeywords: string[] = []): XLSX.WorkSheet | null {
    const found = findSheet(name, fallbackKeywords);
    if (!found) {
      addError('WARNING', name, 0, 'sheet', 'MISSING_SHEET', `Sheet "${name}" not found in workbook. Found: ${sheetNames.join(', ')}`);
      return null;
    }
    return found.sheet;
  }

  function sheetToRowsWithHeaders(sheet: XLSX.WorkSheet, headerKeywords: string[]): Record<string, any>[] {
    const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!grid || grid.length === 0) return [];

    let bestHeaderRowIndex = 0;
    let maxKeywordMatches = -1;

    for (let r = 0; r < Math.min(grid.length, 15); r++) {
      const rowCells = (grid[r] || []).map(cell => String(cell || '').trim().toLowerCase());
      let matches = 0;
      for (const cellVal of rowCells) {
        if (!cellVal) continue;
        for (const kw of headerKeywords) {
          if (cellVal.includes(kw.toLowerCase())) {
            matches++;
            break;
          }
        }
      }
      if (matches > maxKeywordMatches) {
        maxKeywordMatches = matches;
        bestHeaderRowIndex = r;
      }
    }

    if (maxKeywordMatches <= 0) {
      return XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }

    const headers = (grid[bestHeaderRowIndex] || []).map((h, idx) => String(h || '').trim() || `__EMPTY_${idx}`);
    const result: Record<string, any>[] = [];

    for (let r = bestHeaderRowIndex + 1; r < grid.length; r++) {
      const rowArray = grid[r] || [];
      const isRowEmpty = rowArray.every(val => val === undefined || val === null || String(val).trim() === '');
      if (isRowEmpty) continue;

      const rowObj: Record<string, any> = {};
      for (let c = 0; c < headers.length; c++) {
        rowObj[headers[c]] = rowArray[c] !== undefined ? rowArray[c] : '';
      }
      result.push(rowObj);
    }

    return result;
  }

  // ── Parse Room Allocations ─────────────────────────────────────────────────
  const roomAllocations: ParsedPlannerRoomAllocation[] = [];
  const roomSheet = requireSheet(cm.roomAllocation.sheet, ['room', 'mapping', 'allocation']);

  if (roomSheet) {
    const rows: Record<string, any>[] = sheetToRowsWithHeaders(roomSheet, [
      'school', 'programme', 'program', 'course', 'section', 'room', 'block', 'floor', 'capacity', 'code', 'dept'
    ]);
    rowsParsed += rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i];
      const rowNum = i + 2; // 1-indexed, +1 for header

      const school      = cell(
        row,
        cm.roomAllocation.school,
        'School', 'School Name', 'School (Full Name)', 'School Full Name', 'Faculty', 'School/Faculty', 'Department', 'Dept Name'
      );
      let schoolCodeRaw = cell(
        row,
        cm.roomAllocation.schoolCode,
        'School Code', 'School_Code', 'SchoolCode', 'Dept Code', 'Department Code', 'Department_ID', 'Dept', 'Abbreviation', 'School Abbr', 'Code'
      );
      // Fallback: If no School Code column exists, but School contains a code or is short (e.g. SOET)
      if (!schoolCodeRaw && school) {
        const match = school.match(/\(([A-Z0-9]{2,10})\)/i);
        if (match) {
          schoolCodeRaw = match[1].toUpperCase();
        } else if (school.length <= 8 && /^[A-Z0-9_-]+$/i.test(school)) {
          schoolCodeRaw = school.toUpperCase();
        } else {
          schoolCodeRaw = school.split(/\s+/)[0].toUpperCase();
        }
      }

      let programme     = cell(
        row,
        cm.roomAllocation.programme,
        'Programme', 'Program', 'Programme Name', 'Program Name', 'Branch', 'Stream', 'Specialization',
        'Programme/Branch', 'Programme / Branch', 'Course/Programme', 'Degree/Programme',
        'Programme & Branch', 'Program / Branch', 'Name of Programme', 'Name of Program'
      );
      let course        = cell(
        row,
        cm.roomAllocation.course,
        'Course', 'Course Name', 'Course / Section', 'Course/Section', 'Section', 'Course & Section', 'Course / Branch', 'Degree', 'Degree Name', 'Program/Course', 'Course/Degree', 'Level'
      );
      if (!programme && course) programme = course;
      if (!course && programme) course = programme.split(/\s+/)[0] || programme;

      const roomNumber  = cell(
        row,
        cm.roomAllocation.roomNumber,
        'Room No', 'Room No.', 'Room_No', 'Room Number', 'Room Number(s)', 'Room Number (s)', 'Room Numbers', 'Room(s)', 'Rooms', 'Room Mapping', 'Allocated Room', 'Room', 'Room #', 'Venue', 'Classroom'
      );
      const block       = cell(
        row,
        cm.roomAllocation.block,
        'Block', 'Building Block', 'Block/Building', 'Building'
      );
      const floor       = cell(
        row,
        cm.roomAllocation.floor,
        'Floor', 'Floor No', 'Floor No.', 'Floor Number', 'Level'
      );
      const capacityRaw = row[cm.roomAllocation.capacity] ?? row['Capacity'] ?? row['Cap'] ?? row['Seats'];

      // Skip completely empty rows or unallocated spare rooms (where schoolCode and programme are both empty)
      if (!school && !schoolCodeRaw && !programme) { rowsIgnored++; continue; }

      // Validate required fields (using WARNINGs for school-wide or programme-wide allocations so they do not block publishing)
      if (!schoolCodeRaw) {
        addError('WARNING', cm.roomAllocation.sheet, rowNum, 'School Code',
          'MISSING_SCHOOL_CODE', `Row ${rowNum}: School Code is empty for room "${roomNumber}"`);
      }
      if (!roomNumber) {
        addError('ERROR', cm.roomAllocation.sheet, rowNum, 'Room No',
          'MISSING_ROOM', `Row ${rowNum}: Programme "${programme}" has no room assignment`);
      }
      if (!programme) {
        addError('WARNING', cm.roomAllocation.sheet, rowNum, 'Programme',
          'SCHOOL_WIDE_ROOM', `Row ${rowNum}: Programme is empty — room "${roomNumber}" assigned at School level (${schoolCodeRaw || 'General'})`);
      }

      // Validate block
      if (block && !KNOWN_BLOCKS.some(b => block.toUpperCase().startsWith(b.toUpperCase()))) {
        addError('WARNING', cm.roomAllocation.sheet, rowNum, 'Block',
          'INVALID_BLOCK', `Row ${rowNum}: Block "${block}" is not in the known block list`);
      }

      const schoolCode  = schoolCodeRaw.toLowerCase().trim();
      const capacity    = typeof capacityRaw === 'number' ? capacityRaw : parseInt(String(capacityRaw) || '0', 10);
      const mappingKey  = buildMappingKey(schoolCode, course, programme);

      roomAllocations.push({
        mappingKey, school, schoolCode, programme, course,
        roomNumber, block, floor, capacity, rowIndex: rowNum,
      });
    }
  }

  // Validation Check 1: Duplicate mappingKey → multiple rooms (WARNING because schools can have multiple induction rooms)
  const mappingKeySeen = new Map<string, number[]>();
  for (const a of roomAllocations) {
    const existing = mappingKeySeen.get(a.mappingKey) ?? [];
    existing.push(a.rowIndex);
    mappingKeySeen.set(a.mappingKey, existing);
  }
  for (const [key, rows] of mappingKeySeen.entries()) {
    if (rows.length > 1) {
      addError('WARNING', cm.roomAllocation.sheet, rows[0], 'mappingKey',
        'DUPLICATE_ROOM_MAPPING',
        `Mapping key "${key}" is assigned to ${rows.length} rooms (rows: ${rows.join(', ')})`);
    }
  }

  // ── Parse Schedule(s) ──────────────────────────────────────────────────────
  const sessions: ParsedSession[] = [];
  const knownProgrammesSet = new Set(roomAllocations.map(r => r.programme.toLowerCase()).filter(Boolean));
  const knownCoursesSet = new Set(roomAllocations.map(r => r.course.toLowerCase()).filter(Boolean));

  // Parse all schedule sheets (explicit Schedule sheet or any sheet not in nonScheduleSheets)
  const nonScheduleSheets = new Set([
    cm.roomAllocation.sheet.trim().toLowerCase(),
    'room allocation', 'room allocations', 'rooms', 'allocation', 'room allocate',
    cm.venues.sheet.trim().toLowerCase(),
    'venue list', 'venues', 'venue', 'hall list', 'halls',
    'faculty coordinators', 'faculty coordinator', 'faculty', 'coordinators',
    'summary', 'readme', 'instructions', 'overview', 'index',
  ]);

  const scheduleSheetNames = wb.SheetNames.filter(
    name => !nonScheduleSheets.has(name.trim().toLowerCase())
  );

  if (scheduleSheetNames.length === 0) {
    addError('WARNING', cm.schedule.sheet, 0, 'sheet', 'MISSING_SHEET', `No Schedule sheets found in workbook. Found: ${sheetNames.join(', ')}`);
  }

  for (const sheetName of scheduleSheetNames) {
    const scheduleSheet = wb.Sheets[sheetName];
    if (!scheduleSheet) continue;

    const rows: Record<string, any>[] = sheetToRowsWithHeaders(scheduleSheet, [
      'session', 'activity', 'event', 'title', 'time', 'day', 'date', 'venue', 'room', 'coordinator', 'speaker', 'scope', 'school', 'programme', 'course'
    ]);
    rowsParsed += rows.length;

    const cleanSheetName = sheetName.trim();
    const isUniversalSheet = /mandatory|universal|general/i.test(cleanSheetName);

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i];
      const rowNum = i + 2;

      const dayRaw     = row[cm.schedule.dayNumber] ?? row['Day'] ?? row['Day No'] ?? row['Day Number'] ?? row['Day #'];
      const dateRaw    = row[cm.schedule.date] ?? row['Date'] ?? row['Session Date'] ?? row['Date of Session'];
      let startRaw     = row[cm.schedule.startTime] ?? row['Start Time'] ?? row['Start'] ?? row['From'] ?? row['Time'] ?? row['Timings'] ?? row['Timing'] ?? row['Duration'];
      let endRaw       = row[cm.schedule.endTime] ?? row['End Time'] ?? row['End'] ?? row['To'];
      const sessionName = cell(row, cm.schedule.sessionName, 'Session Name', 'Session', 'Activity', 'Event Name', 'Title', 'Event', 'Subject');
      const sessionType = cell(row, cm.schedule.sessionType, 'Session Type', 'Type', 'Category');
      const venueName  = cell(row, cm.schedule.venueName, 'Venue', 'Venue Name', 'Location', 'Hall', 'Room');
      const building   = cell(row, cm.schedule.building, 'Building', 'Block/Building');
      const block      = cell(row, cm.schedule.block, 'Block', 'Building Block');
      const floor      = cell(row, cm.schedule.floor, 'Floor', 'Floor No', 'Level');
      const room       = cell(row, cm.schedule.room, 'Room', 'Room No', 'Room No.');
      const faculty    = cell(row, cm.schedule.facultyCoordinator, 'Faculty Coordinator', 'Coordinator', 'Faculty', 'In Charge', 'Faculty in Charge');
      const speaker    = cell(row, cm.schedule.speaker, 'Speaker', 'Guest', 'Resource Person', 'Expert');
      const instructions = cell(row, cm.schedule.specialInstructions, 'Special Instructions', 'Instructions', 'Remarks', 'Note', 'Notes');
      const scopeRaw   = cell(row, cm.schedule.scope, 'Scope', 'Level', 'Target Level');
      let scopeKey     = cell(row, cm.schedule.scopeKey, 'Scope Key', 'ScopeKey', 'Target Key', 'School Code', 'Programme', 'Branch', 'School', 'Course', 'Department', 'School Name', 'Course Name');
      const isDocDay   = isYes(cell(row, cm.schedule.isDocumentationDay, 'Documentation Day', 'Is Documentation Day', 'Doc Day')) || /student\s*doc/i.test(sessionName);
      const isMandatory = isUniversalSheet || isYes(cell(row, cm.schedule.isMandatory, 'Mandatory', 'Is Mandatory', 'Required'));

      // Skip empty rows
      if (!sessionName && !dayRaw && !dateRaw && !startRaw) { rowsIgnored++; continue; }

      // Validation Check 11: Empty session name
      if (!sessionName) {
        addError('WARNING', sheetName, rowNum, 'Session Name',
          'EMPTY_SESSION_NAME', `Row ${rowNum}: Session Name is empty in sheet "${cleanSheetName}"`);
        rowsIgnored++; continue;
      }

      const dayNumber = typeof dayRaw === 'number'
        ? dayRaw
        : parseInt(String(dayRaw).replace(/[^0-9]/g, ''), 10);
      const date      = parseDate(dateRaw);

      // Split combined time string e.g. "09:00 - 10:30" or "9:00 AM to 11:00 AM"
      if (startRaw && String(startRaw).match(/(-|to)/i) && !endRaw) {
        const parts = String(startRaw).split(/(-|\bto\b)/i);
        if (parts.length >= 3) {
          startRaw = parts[0].trim();
          endRaw   = parts[parts.length - 1].trim();
        }
      }

      const startTime = parseTime(startRaw ?? '');
      const endTime   = parseTime(endRaw   ?? '');

      // Validation Check 5: Invalid time range
      if (startTime && endTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        addError('WARNING', sheetName, rowNum, 'End Time',
          'INVALID_TIME_RANGE',
          `Row ${rowNum}: End time "${endTime}" is not after start time "${startTime}"`);
      }

      // Validation Check 7: Missing venue
      if (!venueName && !room) {
        addError('WARNING', sheetName, rowNum, 'Venue',
          'MISSING_VENUE', `Row ${rowNum}: Session "${sessionName}" has no venue or room`);
      }

      // Validation Check 12: Outside induction date range
      if (date) {
        const d = new Date(date);
        if (d < INDUCTION_START || d > INDUCTION_END) {
          addError('WARNING', sheetName, rowNum, 'Date',
            'DATE_OUT_OF_RANGE',
            `Row ${rowNum}: Date "${date}" is outside induction range 24–29 Aug 2026`);
        }
      }

      // Determine scope and scopeKey smartly
      let scope: PlannerScope = 'universal';
      if (scopeRaw) {
        scope = (scopeRaw.toLowerCase() as PlannerScope) || 'universal';
      } else if (isUniversalSheet) {
        scope = 'universal';
        scopeKey = '';
      } else if (/course/i.test(cleanSheetName)) {
        scope = 'course';
        if (!scopeKey) scopeKey = cell(row, 'Course Name', 'Course', 'Programme', 'Scope Key');
      } else if (/school/i.test(cleanSheetName)) {
        scope = 'school';
        if (!scopeKey) scopeKey = cell(row, 'School Name', 'School Code', 'School_Code', 'School', 'Department', 'Scope Key');
      } else if (/schedule/i.test(cleanSheetName) && !scopeKey) {
        scope = 'universal';
        scopeKey = '';
      } else {
        // Since this is a school/programme sheet (e.g. SOET, SOLS, SBAS), infer scope
        if (!scopeKey) {
          scope = 'school';
          scopeKey = cleanSheetName;
        } else {
          if (knownProgrammesSet.has(scopeKey.toLowerCase())) {
            scope = 'programme';
          } else if (knownCoursesSet.has(scopeKey.toLowerCase())) {
            scope = 'course';
          } else {
            scope = 'school';
          }
        }
      }

      if (!scopeKey || /^(all|universal|all\s*schools?|general|mandatory|any|-|na|n\/a)$/i.test(scopeKey)) {
        scope = 'universal';
        scopeKey = '';
      }

      // Validation Check 13: Mandatory slot without room
      if (isMandatory && !room && !venueName) {
        addError('WARNING', sheetName, rowNum, 'Room',
          'MANDATORY_NO_ROOM',
          `Row ${rowNum}: Mandatory session "${sessionName}" has no room or venue`);
      }

      sessions.push({
        dayNumber: isNaN(dayNumber) ? 1 : dayNumber,
        date: date || '2026-08-24',
        startTime: startTime || '09:00',
        endTime: endTime || '10:00',
        sessionName, sessionType,
        venueName, building, block, floor, room, facultyCoordinator: faculty,
        speaker, specialInstructions: instructions, scope, scopeKey,
        isDocumentationDay: isDocDay, isMandatory, rowIndex: rowNum,
      });
    }
  }

  // Validation Check 4: Session overlap (same scope + scopeKey + day)
  const sessionGroups = new Map<string, ParsedSession[]>();
  for (const s of sessions) {
    const key = `${s.scope}:${s.scopeKey}:${s.dayNumber}`;
    const group = sessionGroups.get(key) ?? [];
    group.push(s);
    sessionGroups.set(key, group);
  }
  for (const [groupKey, group] of sessionGroups.entries()) {
    const sorted = [...group].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const isParallelActivity = (name: string) =>
        /full\s*day|documentation|feedback|erp|industry|visit/i.test(name);
      if (timeToMinutes(curr.startTime) < timeToMinutes(prev.endTime) &&
          !isParallelActivity(curr.sessionName) &&
          !isParallelActivity(prev.sessionName)) {
        addError('WARNING', cm.schedule.sheet, curr.rowIndex, 'Start Time',
          'SESSION_OVERLAP',
          `Session "${curr.sessionName}" (${curr.startTime}) overlaps with "${prev.sessionName}" (ends ${prev.endTime}) — scope: ${groupKey}`);
      }
    }
  }

  // Validation Check 9: Duplicate documentation day per scope
  const docDaysByScope = new Map<string, ParsedSession[]>();
  for (const s of sessions.filter(s => s.isDocumentationDay)) {
    const key = `${s.scope}:${s.scopeKey}`;
    const arr = docDaysByScope.get(key) ?? [];
    arr.push(s);
    docDaysByScope.set(key, arr);
  }
  for (const [scopeKey, docSessions] of docDaysByScope.entries()) {
    if (docSessions.length > 1) {
      addError('WARNING', cm.schedule.sheet, docSessions[1].rowIndex, 'Documentation Day',
        'DUPLICATE_DOC_DAY',
        `Scope "${scopeKey}" has ${docSessions.length} documentation days (rows: ${docSessions.map(s => s.rowIndex).join(', ')})`);
    }
  }

  // ── Parse Venues ───────────────────────────────────────────────────────────
  const venues: ParsedVenue[] = [];
  const venueSheetObj = findSheet(cm.venues.sheet) || findSheet('Venues') || findSheet('Venue List') || findSheet('Venue');
  const venueSheet = venueSheetObj ? venueSheetObj.sheet : null;

  if (venueSheet) {
    const rows: Record<string, any>[] = sheetToRowsWithHeaders(venueSheet, [
      'venue', 'building', 'block', 'floor', 'capacity', 'hall', 'room', 'name'
    ]);
    rowsParsed += rows.length;

    for (const row of rows) {
      const name     = cell(row, cm.venues.name);
      const building = cell(row, cm.venues.building);
      const block    = cell(row, cm.venues.block);
      const floor    = cell(row, cm.venues.floor);
      const capRaw   = row[cm.venues.capacity];

      if (!name) { rowsIgnored++; continue; }

      venues.push({
        name, building, block, floor,
        capacity: typeof capRaw === 'number' ? capRaw : null,
      });
    }
  }

  // Auto-derive venues if no explicit venue sheet was provided in the workbook
  if (venues.length === 0) {
    const venueMap = new Map<string, ParsedVenue>();
    const addVenue = (nameStr: string, block: string = '', capacity: number = 0) => {
      if (!nameStr) return;
      const parts = nameStr.split(/[,&/]/).map(p => p.trim()).filter(Boolean);
      for (const p of parts) {
        const key = p.toLowerCase();
        if (!venueMap.has(key)) {
          let guessedBlock = block;
          if (!guessedBlock) {
            const blockMatch = p.match(/^([A-Z]+)\b/i) || p.match(/^([A-Z])\d/i);
            if (blockMatch) guessedBlock = `${blockMatch[1].toUpperCase()} Block`;
          }
          venueMap.set(key, {
            name: p,
            building: '',
            block: guessedBlock,
            floor: '',
            capacity: capacity > 0 ? capacity : null,
          });
        }
      }
    };

    for (const r of roomAllocations) {
      addVenue(r.roomNumber, r.block, r.capacity);
    }
    for (const s of sessions) {
      addVenue(s.venueName, s.block);
    }
    venues.push(...Array.from(venueMap.values()));
  }

  // Validation Check 3: Course without parent programme (cross-check)
  const allProgrammes = new Set(roomAllocations.map(r => r.programme.toLowerCase()));
  for (const s of sessions.filter(s => s.scope === 'course')) {
    if (s.scopeKey && !allProgrammes.has(s.scopeKey.toLowerCase())) {
      addError('WARNING', cm.schedule.sheet, s.rowIndex, 'Scope Key',
        'ORPHAN_COURSE_SESSION',
        `Row ${s.rowIndex}: Course-scope session "${s.sessionName}" uses scopeKey "${s.scopeKey}" which has no parent programme in Room Allocation`);
    }
  }

  // ── Build summary ──────────────────────────────────────────────────────────
  const schools    = new Set(roomAllocations.map(r => r.schoolCode));
  const programmes = new Set(roomAllocations.map(r => r.programme.toLowerCase()));
  const courses    = new Set(roomAllocations.map(r => r.course.toLowerCase()));
  const rooms      = new Set(roomAllocations.map(r => r.roomNumber));
  const faculty    = new Set(sessions.map(s => s.facultyCoordinator).filter(Boolean));

  const validationErrors   = errors.filter(e => e.severity === 'ERROR');
  const validationWarnings = errors.filter(e => e.severity === 'WARNING');

  return {
    plannerYear:   2026,
    fileChecksum,
    excelFilename: filename,
    roomAllocations,
    sessions,
    venues,
    mandatorySlots: sessions.filter(s => s.isMandatory),
    validationErrors,
    validationWarnings,
    rowsParsed,
    rowsIgnored,
    summary: {
      schoolCount:    schools.size,
      programmeCount: programmes.size,
      courseCount:    courses.size,
      roomCount:      rooms.size,
      sessionCount:   sessions.length,
      venueCount:     venues.length,
      facultyCount:   faculty.size,
    },
  };
}
