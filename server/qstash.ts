import { Client } from '@upstash/qstash';

/**
 * Upstash QStash — serverless-compatible message queue.
 *
 * Replaces RabbitMQ for the Vercel deployment:
 *   - Publish from API function (serverless)
 *   - QStash delivers the message to the worker endpoint with retries
 *   - Worker endpoint is another Vercel function (api/attendance-worker.ts)
 *
 * Required env vars:
 *   QSTASH_TOKEN               — from Upstash dashboard → QStash → API Keys
 *   QSTASH_CURRENT_SIGNING_KEY — for verifying messages in the worker
 *   QSTASH_NEXT_SIGNING_KEY    — for key rotation in the worker
 *   APP_URL                    — your production URL e.g. https://aarambh.vercel.app
 */

export interface AttendanceJobPayload {
  sessionId: string;
  studentId: string;
  enrollmentNo: string;
  studentName: string;
  school: string;
  department: string;
  programme: string;
  semester: string;
  section: string;
  email: string;
  scanTimeIso: string;
  qrVersion: number;
  scannerDeviceId: string;
  ipAddress: string;
  userAgent: string;
  verificationResult: string;
  gpsMode: 'disabled' | 'log_only' | 'strict';
  attendanceMode: 'verified' | 'manual';
  locationLat: number | null;
  locationLng: number | null;
  locationAccuracy: number | null;
  distanceFromCampus: number | null;
  manualOverrideReason?: string;
}

let _client: Client | null = null;

function getQStash(): Client {
  if (_client) return _client;

  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    throw new Error('QStash token not configured. Set QSTASH_TOKEN.');
  }

  _client = new Client({ token });
  return _client;
}

/**
 * Publishes an attendance job to the queue.
 * The worker at /api/attendance-worker will process it asynchronously:
 *   - Write to attendance_logs
 *   - Increment distributed counter shards
 *
 * Throws if QStash is misconfigured. Callers should catch and fail-open.
 */
export async function publishAttendanceJob(payload: AttendanceJobPayload): Promise<void> {
  const client = getQStash();

  const baseUrl =
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  await client.publishJSON({
    url: `${baseUrl}/api/attendance-worker`,
    body: payload,
    retries: 3,
  });
}
