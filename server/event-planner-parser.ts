/**
 * server/event-planner-parser.ts
 *
 * Generic schedule parser for non-induction event planners.
 * Supports .xlsx and .csv input.
 *
 * Expected sheet/headers (case-insensitive, trimmed):
 *   Day | Date | Start Time | End Time | Session Title | Venue | Building | Speaker | Coordinator | Description | Sequence
 *
 * Sequences within a day should be unique integers.
 * Returns EventPlannerParseResult with sessions[], days[], validation info.
 */

import * as XLSX from 'xlsx';
import crypto from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlannerSession {
  plannerId:   string; // filled in by engine after doc creation
  plannerType: string;
  dayNumber:   number;
  date:        string;       // "YYYY-MM-DD"
  startTime:   string;       // "HH:MM"
  endTime:     string;       // "HH:MM"
  sessionTitle: string;
  venue:       string;
  building:    string;
  speaker:     string;
  coordinator: string;
  description: string;
  sequence:    number;
  status:      string;       // "DRAFT" | "ACTIVE" | "ARCHIVED"
}

export interface PlannerDay {
  plannerId:    string;
  plannerType:  string;
  dayNumber:    number;
  date:         string;
  sessionCount: number;
  status:       string;
}

export interface ValidationIssue {
  row:     number;
  field:   string;
  code:    string;
  message: string;
}

export interface EventPlannerParseResult {
  sessions:           PlannerSession[];
  days:               PlannerDay[];
  sessionCount:       number;
  dayCount:           number;
  dateRange:          { start: string; end: string };
  fileChecksum:       string;
  filename:           string;
  plannerYear:        number;
  validationErrors:   ValidationIssue[];
  validationWarnings: ValidationIssue[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normaliseKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function normaliseTime(raw: string | number | undefined, assumePmIfBefore8 = true): string {
  if (raw === undefined || raw === null || raw === '') return '';
  const s = String(raw).trim();
  
  // Try to parse "10:30 AM", "1.15 PM", "1:15"
  const ampmMatch = s.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2];
    const ampm = (ampmMatch[3] || '').toLowerCase().replace(/\./g, '');
    
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    
    // Heuristic: If no AM/PM provided and hour is < 8, assume it's PM (e.g. 1:15 -> 13:15)
    if (!ampm && assumePmIfBefore8 && h < 8 && h > 0) h += 12;

    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // Already HH:MM
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    let [hStr, mStr] = s.split(':');
    let h = parseInt(hStr, 10);
    if (assumePmIfBefore8 && h < 8 && h > 0) h += 12;
    return `${String(h).padStart(2, '0')}:${mStr}`;
  }

  // Excel serial fraction → HH:MM
  const n = parseFloat(s);
  if (!isNaN(n) && n < 1) {
    const totalMin = Math.round(n * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return s;
}

function normaliseDate(raw: string | number | Date | undefined): string {
  if (!raw) return '';
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const n = Number(raw);
  if (!isNaN(n) && n > 1000) {
    // Excel date serial
    const d = XLSX.SSF.parse_date_code(n);
    if (d) {
      const y = d.y;
      const mo = String(d.m).padStart(2, '0');
      const da = String(d.d).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    }
  }
  // Try ISO parse
  const parsed = new Date(String(raw).trim());
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return String(raw).trim();
}

// Map of normalised header keys → canonical field names
const HEADER_MAP: Record<string, keyof PlannerSession | 'time'> = {
  'day':           'dayNumber',
  'day_no':        'dayNumber',
  'day_number':    'dayNumber',
  'date':          'date',
  'start_time':    'startTime',
  'start':         'startTime',
  'end_time':      'endTime',
  'end':           'endTime',
  'time':          'time' as any,
  'session_title': 'sessionTitle',
  'session':       'sessionTitle',
  'title':         'sessionTitle',
  'name':          'sessionTitle',
  'programme':     'sessionTitle',
  'program':       'sessionTitle',
  'venue':         'venue',
  'building':      'building',
  'block':         'building',
  'speaker':       'speaker',
  'speaker_name':  'speaker',
  'faculty':       'speaker',
  'coordinator':   'coordinator',
  'description':   'description',
  'details':       'description',
  'sequence':      'sequence',
  'seq':           'sequence',
  'order':         'sequence',
};

// ── Parse Buffer ───────────────────────────────────────────────────────────────

export function parseEventPlannerBuffer(
  buffer: Buffer,
  filename: string,
): EventPlannerParseResult {
  const fileChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext = filename.toLowerCase().trim();
  const isCsv = ext.endsWith('.csv');

  let workbook: XLSX.WorkBook;

  if (isCsv) {
    const text = buffer.toString('utf-8');
    workbook = XLSX.read(text, { type: 'string', cellDates: true });
  } else {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  }

  // Find the schedule sheet (case-insensitive; prefer 'Schedule')
  const targetSheet =
    workbook.SheetNames.find(n => n.trim().toLowerCase() === 'schedule') ??
    workbook.SheetNames[0];

  if (!targetSheet) {
    return {
      sessions: [],
      days: [],
      sessionCount: 0,
      dayCount: 0,
      dateRange: { start: '', end: '' },
      fileChecksum,
      filename,
      plannerYear: new Date().getFullYear(),
      validationErrors: [{ row: 0, field: 'sheet', code: 'MISSING_SHEET', message: 'No worksheet found in file.' }],
      validationWarnings: [],
    };
  }

  const ws = workbook.Sheets[targetSheet];
  const rowsRaw: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: false,
  });

  const validationErrors: ValidationIssue[] = [];
  const validationWarnings: ValidationIssue[] = [];

  if (rowsRaw.length === 0) {
    validationErrors.push({ row: 0, field: 'file', code: 'EMPTY_FILE', message: 'Schedule sheet is empty.' });
    return {
      sessions: [], days: [], sessionCount: 0, dayCount: 0,
      dateRange: { start: '', end: '' }, fileChecksum, filename,
      plannerYear: new Date().getFullYear(),
      validationErrors, validationWarnings,
    };
  }

  // Build header key map dynamically (scan for row containing valid headers)
  // Find the row with the most header matches (scan up to first 20 rows)
  let maxScore = 0;
  let headerRowIdx = 0;
  let headers: string[] = [];
  
  for (let i = 0; i < Math.min(rowsRaw.length, 20); i++) {
    const rowKeys = rowsRaw[i].map(c => normaliseKey(String(c)));
    let score = 0;
    for (const k of rowKeys) {
      if (HEADER_MAP[k]) score++;
    }
    // We expect at least 2 valid headers to consider it a header row
    if (score > maxScore && score >= 2) {
      maxScore = score;
      headerRowIdx = i;
      headers = rowKeys;
    }
  }

  const headerMap: Record<number, string> = {};
  for (let c = 0; c < headers.length; c++) {
    const norm = headers[c];
    if (HEADER_MAP[norm]) {
      headerMap[c] = HEADER_MAP[norm];
    }
  }

  const hasTime = Object.values(headerMap).includes('time') || Object.values(headerMap).includes('startTime');
  const hasTitle = Object.values(headerMap).includes('sessionTitle');

  if (!hasTime) {
    validationErrors.push({ row: headerRowIdx + 1, field: 'startTime', code: 'MISSING_REQUIRED_COLUMN', message: `Required column "Time" or "Start Time" not found. Check column headers.` });
  }
  if (!hasTitle) {
    validationErrors.push({ row: headerRowIdx + 1, field: 'sessionTitle', code: 'MISSING_REQUIRED_COLUMN', message: `Required column "Programme" or "Session Title" not found. Check column headers.` });
  }

  if (validationErrors.length > 0) {
    return {
      sessions: [], days: [], sessionCount: 0, dayCount: 0,
      dateRange: { start: '', end: '' }, fileChecksum, filename,
      plannerYear: new Date().getFullYear(),
      validationErrors, validationWarnings,
    };
  }

  const sessions: PlannerSession[] = [];
  const dayMap = new Map<number, { date: string; count: number }>();
  const seenSeqPerDay = new Map<number, Set<number>>();
  let autoSeq = 0;

  const defaultDay = 1;
  const defaultDate = new Date().toISOString().slice(0, 10);

  for (let i = headerRowIdx + 1; i < rowsRaw.length; i++) {
    const row = rowsRaw[i];
    const rowNum = i + 1; // 1-indexed

    // Map row to session fields
    const raw: any = {};
    for (const [colIdx, targetField] of Object.entries(headerMap)) {
      raw[targetField] = row[parseInt(colIdx, 10)];
    }

    // Skip fully empty rows
    if (!raw.dayNumber && !raw.sessionTitle && !raw.time && !raw.startTime) continue;

    if (raw.time && !raw.startTime) {
      const parts = String(raw.time).split(/[-–—]/).map(s => s.trim());
      raw.startTime = parts[0] || '';
      raw.endTime = parts[1] || '';
    }

    const dayNum = raw.dayNumber ? parseInt(String(raw.dayNumber), 10) : defaultDay;
    if (isNaN(dayNum) || dayNum < 1) {
      validationErrors.push({ row: rowNum, field: 'dayNumber', code: 'INVALID_DAY', message: `Row ${rowNum}: Day must be a positive integer.` });
      continue;
    }

    const date = raw.date ? normaliseDate(raw.date) : defaultDate;
    const startTime = normaliseTime(raw.startTime);
    const endTime   = normaliseTime(raw.endTime);

    if (!raw.sessionTitle || String(raw.sessionTitle).trim() === '') {
      const timeStr = String(raw.time || raw.startTime || '');
      // If time column contains text but no numbers, it's likely a merged footer row
      if (timeStr && !/\d/.test(timeStr)) {
        continue;
      }
      validationErrors.push({ row: rowNum, field: 'sessionTitle', code: 'MISSING_TITLE', message: `Row ${rowNum}: Session title is required.` });
      continue;
    }

    // Time format validation
    if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
      validationWarnings.push({ row: rowNum, field: 'startTime', code: 'INVALID_TIME_FORMAT', message: `Row ${rowNum}: Start time "${startTime}" may be invalid.` });
    }
    if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) {
      validationWarnings.push({ row: rowNum, field: 'endTime', code: 'INVALID_TIME_FORMAT', message: `Row ${rowNum}: End time "${endTime}" may be invalid.` });
    }

    // Sequence dedup
    autoSeq++;
    const seqRaw = parseInt(String(raw.sequence ?? ''), 10);
    const seq = isNaN(seqRaw) ? autoSeq : seqRaw;
    if (!seenSeqPerDay.has(dayNum)) seenSeqPerDay.set(dayNum, new Set());
    if (seenSeqPerDay.get(dayNum)!.has(seq)) {
      validationWarnings.push({ row: rowNum, field: 'sequence', code: 'DUPLICATE_SEQUENCE', message: `Row ${rowNum}: Duplicate sequence ${seq} on Day ${dayNum}.` });
    }
    seenSeqPerDay.get(dayNum)!.add(seq);

    sessions.push({
      plannerId:    '', // filled in by engine
      plannerType:  '', // filled in by engine
      dayNumber:    dayNum,
      date:         date,
      startTime:    startTime,
      endTime:      endTime,
      sessionTitle: String(raw.sessionTitle).trim(),
      venue:        String(raw.venue ?? '').trim(),
      building:     String(raw.building ?? '').trim(),
      speaker:      String(raw.speaker ?? '').trim(),
      coordinator:  String(raw.coordinator ?? '').trim(),
      description:  String(raw.description ?? '').trim(),
      sequence:     seq,
      status:       'DRAFT',
    });

    // Track day groupings
    if (!dayMap.has(dayNum)) {
      dayMap.set(dayNum, { date, count: 0 });
    }
    dayMap.get(dayNum)!.count++;
  }

  const days: PlannerDay[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([dayNum, info]) => ({
      plannerId:    '',
      plannerType:  '',
      dayNumber:    dayNum,
      date:         info.date,
      sessionCount: info.count,
      status:       'DRAFT',
    }));

  const allDates = sessions.map(s => s.date).filter(Boolean).sort();
  const dateRange = {
    start: allDates[0] ?? '',
    end:   allDates[allDates.length - 1] ?? '',
  };

  const plannerYear = dateRange.start
    ? parseInt(dateRange.start.slice(0, 4), 10)
    : new Date().getFullYear();

  return {
    sessions,
    days,
    sessionCount: sessions.length,
    dayCount:     days.length,
    dateRange,
    fileChecksum,
    filename,
    plannerYear,
    validationErrors,
    validationWarnings,
  };
}
