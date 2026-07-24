/**
 * server/event-counter.ts
 *
 * Abstraction layer for the Event Attendance counter.
 *
 * CURRENT IMPLEMENTATION: single `attendance_count` field on the events document,
 * incremented via FieldValue.increment(1) inside a Firestore transaction.
 *
 * FUTURE MIGRATION PATH (when/if needed for high-throughput events):
 *   - Replace the body of `buildCounterIncrement` to write to:
 *     event_counter_shards/{eventId}/shards/{randomShardId}
 *   - Replace `readCount` to aggregate shard totals from Redis cache.
 *   - NO callers need to change. API contracts remain identical.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT: This module is for EVENT attendance ONLY.
 * It has zero relationship to the induction attendance system.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Transaction, DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export interface CounterResult {
  /** The projected count AFTER the increment (used for capacity enforcement UI). */
  projectedCount: number;
}

/**
 * Enqueues a counter increment inside an existing Firestore transaction.
 *
 * Must be called INSIDE a `runTransaction` callback — never standalone.
 *
 * @param transaction  The active Firestore transaction
 * @param eventRef     Reference to the event document
 * @param currentCount The attendance_count read from the event doc earlier in the tx
 * @returns            Projected count after write commits (optimistic, for capacity check)
 */
export function buildCounterIncrement(
  transaction: Transaction,
  eventRef: DocumentReference,
  currentCount: number,
): CounterResult {
  transaction.update(eventRef, {
    attendance_count: FieldValue.increment(1),
    updated_at: FieldValue.serverTimestamp(),
  });

  return { projectedCount: currentCount + 1 };
}

/**
 * Read the current attendance count from an event document snapshot.
 * Defaults to 0 if the field is missing (backward compat — existing events).
 */
export function readCount(eventSnapshot: DocumentSnapshot): number {
  return (eventSnapshot.data()?.attendance_count as number | undefined) ?? 0;
}
