/**
 * server/event-redis-monitor.ts
 *
 * Structured Redis observability for the Event Attendance system.
 *
 * Every Redis failure in any event-attendance API must call logRedisFailure().
 * Output is structured JSON — parseable by Vercel log drains, Axiom, Datadog, etc.
 *
 * The system ALWAYS fails open on Redis errors. This module only handles logging.
 */

export interface RedisFailureContext {
  /** API endpoint name, e.g. 'event-attendance-mark' */
  endpoint:  string;
  /** Firestore event document ID, or 'GLOBAL' for system-wide analytics */
  event_id?: string;
  /** What Redis operation failed, e.g. 'rate_limit_pipeline', 'zadd_timeline' */
  operation: string;
  /** Error message from the caught exception */
  reason:    string;
}

/**
 * Log a structured Redis failure warning.
 * Never throws. Safe to call in any catch block.
 */
export function logRedisFailure(ctx: RedisFailureContext): void {
  try {
    console.warn(JSON.stringify({
      level:     'WARN',
      system:    'event_attendance_redis',
      timestamp: new Date().toISOString(),
      endpoint:  ctx.endpoint,
      event_id:  ctx.event_id,
      operation: ctx.operation,
      reason:    ctx.reason,
      action:    'fail_open',
    }));
  } catch {
    // If even JSON.stringify fails (circular ref etc.), log raw
    console.warn(`[event_attendance_redis] WARN endpoint=${ctx.endpoint} event=${ctx.event_id} op=${ctx.operation}`);
  }
}

/**
 * Log a successful rate-limit skip (when Redis is down, rate limiting is bypassed).
 * Keeps a record for post-incident analysis.
 */
export function logRateLimitSkip(endpoint: string, event_id: string, reason: string): void {
  logRedisFailure({ endpoint, event_id, operation: 'rate_limit_check', reason });
}
