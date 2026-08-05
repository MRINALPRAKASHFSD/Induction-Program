/**
 * server/qr-token.ts
 *
 * Opaque QR token generation for the Aarambh 2026 attendance system.
 *
 * Architecture (v2 — Token Model):
 *   - QR contains ONLY a short opaque token: att_<22 Base62 chars>
 *   - Token is cryptographically random (192-bit entropy)
 *   - Token→session mapping is stored exclusively in Redis with TTL
 *   - Redis TTL = qr_rotation_interval_seconds (token self-expires)
 *
 * Security guarantees:
 *   - Impossible to guess: 62^22 ≈ 2^131 combinations (192-bit effective entropy)
 *   - Replay prevention: Redis TTL — expired tokens produce no Redis hit
 *   - Freshness: token does not exist in Redis after rotation interval
 *   - No cryptographic work on the scan hot path (pure Redis GET)
 *
 * QR payload comparison:
 *   v1 (HMAC): ~260 bytes of Base64url → large QR matrix, slow autofocus
 *   v2 (Token): ~26 bytes              → version M1, fast scan
 *
 * Token alphabet: Base62 — [A-Za-z0-9] only.
 *   No hyphens or underscores. Cleaner in logs, clipboard, debugging.
 *   Scanners treat alphanumeric tokens uniformly across all devices.
 */

import crypto from 'crypto';

/** Fixed prefix for all QR tokens — makes them instantly identifiable in logs */
export const QR_TOKEN_PREFIX = 'att_';

/** Base62 alphabet: uppercase + lowercase + digits (no special chars) */
const BASE62_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ALPHABET_LENGTH = BASE62_ALPHABET.length; // 62
const TOKEN_CHARS = 22; // 22 Base62 chars → log2(62^22) ≈ 131 bits; with prefix total string is 26 chars

/**
 * Regex for validating token format on the server-side hot path.
 * Rejects anything that doesn't match before hitting Redis.
 */
export const QR_TOKEN_REGEX = /^att_[A-Za-z0-9]{22}$/;

/**
 * Generate a cryptographically secure opaque QR token.
 *
 * Uses rejection sampling over a uniform random byte stream to avoid
 * modulo bias in the Base62 encoding.
 *
 * @returns Token string: att_<22 alphanumeric chars>
 */
export function generateQrToken(): string {
  let result = '';
  // Over-sample random bytes to account for rejection: 22 chars need ~22 bytes
  // but rejection sampling may discard some. 64 bytes is a comfortable buffer.
  const randomBytes = crypto.randomBytes(64);
  let byteIndex = 0;

  while (result.length < TOKEN_CHARS) {
    if (byteIndex >= randomBytes.length) {
      // Extremely unlikely but safe: refill if buffer exhausted
      const extra = crypto.randomBytes(32);
      byteIndex = 0;
      extra.copy(randomBytes, 0, 0, Math.min(32, randomBytes.length));
    }
    const byte = randomBytes[byteIndex++];
    // Reject bytes that would introduce modulo bias: 256 / 62 = 4 remainder 8
    // Accept range: 0..247 (248 values → 4 * 62 = 248, perfectly divisible)
    if (byte < 248) {
      result += BASE62_ALPHABET[byte % ALPHABET_LENGTH];
    }
  }

  return QR_TOKEN_PREFIX + result;
}

/**
 * Validate token format before querying Redis.
 * Fast regex check — O(1) string length validation.
 */
export function isValidQrTokenFormat(token: string): boolean {
  return QR_TOKEN_REGEX.test(token);
}

/**
 * Redis key for a QR token.
 * Key pattern: attendance:qr:<token>
 */
export function qrTokenRedisKey(token: string): string {
  return `attendance:qr:${token}`;
}

/**
 * Payload stored in Redis for each active QR token.
 * TTL = qr_rotation_interval_seconds (set via SETEX).
 * Expires automatically — no cleanup jobs required.
 */
export interface QrTokenRedisValue {
  sessionId: string;
  eventId: string;
  rotationId: number;   // Monotonically incrementing per session — useful for audit/fraud analysis
  generatedAt: number;  // Unix ms — allows server to compute scan latency vs token age in logs
  expiresAt: number;    // Unix ms — informational; Redis TTL is the authoritative expiry
}
