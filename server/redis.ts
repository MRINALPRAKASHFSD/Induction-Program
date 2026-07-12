import { Redis } from '@upstash/redis';

/**
 * Upstash Redis singleton.
 *
 * Used for:
 *  1. Rate limiting  — key: `ratelimit:attendance:{enrollmentNo}` (TTL: 60s, max 5 req/min)
 *  2. Pre-flight dedup — key: `attended:{eventId}:{enrollmentNo}` (TTL: 24h)
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL   — from Upstash dashboard → Redis → REST API
 *   UPSTASH_REDIS_REST_TOKEN — from Upstash dashboard → Redis → REST API
 *
 * All callers use try/catch so a Redis outage NEVER blocks attendance (fail-open).
 */

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error('Upstash Redis credentials not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
  }

  _redis = new Redis({ url, token });
  return _redis;
}
