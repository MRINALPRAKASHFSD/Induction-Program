/**
 * scripts/validate-deeksharambh-json.ts
 *
 * Validates the deeksharambh_2026_schedule.json before any migration.
 * Run this first. If it exits with code 1, do NOT proceed with migration.
 *
 * Usage: npx tsx scripts/validate-deeksharambh-json.ts
 */
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const JSON_PATH = path.join(os.homedir(), 'Downloads', 'deeksharambh_2026_schedule.json');

interface ValidationError {
  type: 'ROOM' | 'SESSION';
  id: string | number;
  field: string;
  message: string;
}

function validateJson(): { errors: ValidationError[]; warnings: string[] } {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(JSON_PATH)) {
    console.error(`FATAL: JSON file not found at ${JSON_PATH}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

  // ── 1. Validate Rooms ────────────────────────────────────────────────────────
  const rooms = data.rooms || {};
  const roomKeys = Object.keys(rooms);
  console.log(`\nValidating ${roomKeys.length} rooms...`);

  for (const key of roomKeys) {
    const r = rooms[key];
    if (!r.room_id)    errors.push({ type: 'ROOM', id: key, field: 'room_id',    message: 'Missing room_id' });
    if (!r.block)      errors.push({ type: 'ROOM', id: key, field: 'block',      message: 'Missing block' });
    if (!r.capacity)   errors.push({ type: 'ROOM', id: key, field: 'capacity',   message: 'Missing capacity' });
    if (!r.program)    errors.push({ type: 'ROOM', id: key, field: 'program',    message: 'Missing program' });
    if (!r.school_code) errors.push({ type: 'ROOM', id: key, field: 'school_code', message: 'Missing school_code' });

    if (r.capacity && typeof r.capacity !== 'number') {
      warnings.push(`Room ${key}: capacity is not a number (got ${typeof r.capacity})`);
    }
  }

  // ── 2. Validate Sessions ─────────────────────────────────────────────────────
  const sessions = data.sessions || [];
  console.log(`Validating ${sessions.length} sessions...`);

  for (const s of sessions) {
    const id = s.session_id || '?';
    if (!s.date)         errors.push({ type: 'SESSION', id, field: 'date',         message: 'Missing date' });
    if (!s.start_time)   errors.push({ type: 'SESSION', id, field: 'start_time',   message: 'Missing start_time' });
    if (!s.end_time)     errors.push({ type: 'SESSION', id, field: 'end_time',     message: 'Missing end_time' });
    if (!s.session_name) errors.push({ type: 'SESSION', id, field: 'session_name', message: 'Missing session_name' });
    if (!s.room_id)      errors.push({ type: 'SESSION', id, field: 'room_id',      message: 'Missing room_id' });

    // Verify session room_id exists in rooms
    if (s.room_id && !rooms[s.room_id]) {
      warnings.push(`Session ${id}: room_id "${s.room_id}" not found in rooms dictionary`);
    }

    // Validate date format
    if (s.date && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
      errors.push({ type: 'SESSION', id, field: 'date', message: `Invalid date format: ${s.date}` });
    }

    // Validate time format
    if (s.start_time && !/^\d{2}:\d{2}$/.test(s.start_time)) {
      errors.push({ type: 'SESSION', id, field: 'start_time', message: `Invalid time format: ${s.start_time}` });
    }
  }

  return { errors, warnings };
}

function main() {
  console.log('=== Deeksharambh 2026 JSON Validation ===\n');
  const { errors, warnings } = validateJson();

  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    warnings.forEach(w => console.log(`   - ${w}`));
  }

  if (errors.length > 0) {
    console.error(`\n❌ VALIDATION FAILED — ${errors.length} error(s) found:\n`);
    errors.forEach(e => {
      console.error(`   [${e.type}] id=${e.id} | field=${e.field} | ${e.message}`);
    });
    console.error('\nDo NOT run migration until all errors are resolved.');
    process.exit(1);
  }

  console.log('\n✅ Validation PASSED — JSON is structurally complete. Safe to run migration.\n');
  process.exit(0);
}

main();
