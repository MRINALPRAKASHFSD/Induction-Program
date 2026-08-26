/**
 * server/event-attendance.config.ts
 *
 * Single source of truth for all Event Attendance configuration.
 * Changing one value here updates all behavior across every API and UI hook.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT: This file is for the EVENT attendance system ONLY.
 * It has ZERO relationship to the induction attendance system.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const EVENT_ATTENDANCE_CONFIG = {
  // ── Attendance Window ──────────────────────────────────────────────────────
  /** How many ms BEFORE starts_at a student can begin marking attendance. */
  windowBeforeStartMs: 15 * 60 * 1000,       // 15 minutes
  /** How many ms AFTER ends_at the window stays open. */
  windowAfterEndMs: 15 * 60 * 1000,          // 15 minutes
  /** (DEPRECATED) How many ms after starts_at a student is considered 'late' vs 'present'. */
  lateThresholdMs: 30 * 60 * 1000,           // 30 minutes
  /** The final X minutes of the event are considered 'late'. */
  lateWindowMinutes: 10,

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  rateLimitIp: { max: 20000, windowSec: 60 },
  rateLimitEnrollment: { max: 1000, windowSec: 300 },
  rateLimitEvent: { max: 50000, windowSec: 60 },
  /** How many failures before triggering exponential backoff. */
  failureLockoutAfter: 3,
  /** Base lockout duration in seconds (exponential: 30, 60, 120…). */
  failureLockoutBaseSec: 30,

  // ── Pagination ────────────────────────────────────────────────────────────
  defaultPageSize: 50,
  maxPageSize: 200,

  // ── Redis Cache TTLs (seconds) ────────────────────────────────────────────
  metricsRedisTtlSec: 30,
  totalCountRedisTtlSec: 10,
  timelineRedisTtlSec: 86_400,               // 24h

  // ── Analytics ─────────────────────────────────────────────────────────────
  /** Window for calculating attendance velocity (minutes). */
  velocityWindowMinutes: 5,

  // ── Admin UI Polling ──────────────────────────────────────────────────────
  adminPollingIntervalMs: 15_000,

  // ── QR Versioning ─────────────────────────────────────────────────────────
  qrVersion: 1,

  // ── Enrollment / Application Number Validation ───────────────────────────
  /** Regex for a valid enrollment number. Adjust if institution format changes. */
  enrollmentPattern: /^[A-Z0-9\-]{3,40}$/,
  /** Alias — used by event-attendance-mark (application numbers use the same pattern). */
  applicationNumberPattern: /^[A-Z0-9\-]{3,40}$/,
  /** Alias of rateLimitEnrollment — used by event-attendance-mark. */
  rateLimitApplication: { max: 1000, windowSec: 300 },

  // ── Event Schema Defaults ─────────────────────────────────────────────────
  qrEnabledDefault: true,
  allowOverflowDefault: false,
} as const;

export type AttendanceStatus     = 'present' | 'late' | 'manual' | 'excused';
export type VerificationMethod   = 'QR' | 'MANUAL' | 'ADMIN_OVERRIDE';
export type AuditLogAction       =
  | 'marked'
  | 'duplicate'
  | 'rejected_not_found'
  | 'rejected_suspended'
  | 'rejected_qr_disabled'
  | 'rejected_outside_window'
  | 'rejected_capacity_full'
  | 'rate_limited'
  | 'ratelimit_skipped';

export const RESPONSE_CODES = {
  SUCCESS:         'SUCCESS',
  DUPLICATE:       'DUPLICATE',
  INVALID_INPUT:   'INVALID_INPUT',
  NOT_FOUND:       'NOT_FOUND',
  SUSPENDED:       'SUSPENDED',
  QR_DISABLED:     'QR_DISABLED',
  OUTSIDE_WINDOW:  'OUTSIDE_WINDOW',
  CAPACITY_FULL:   'CAPACITY_FULL',
  RATE_LIMITED:    'RATE_LIMITED',
  SERVER_ERROR:    'SERVER_ERROR',
} as const;

export type ResponseCode = typeof RESPONSE_CODES[keyof typeof RESPONSE_CODES];
