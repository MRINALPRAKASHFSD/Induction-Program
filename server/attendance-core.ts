import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AttendanceJobPayload } from './qstash.js';
import crypto from 'crypto';

export async function processAttendanceFirestoreTransaction(payload: AttendanceJobPayload, messageId?: string) {
  const db = getFirestore();
  const actualMessageId = messageId || crypto.randomUUID();

  await db.runTransaction(async (transaction) => {
    const processedJobRef = db.collection('processed_jobs').doc(actualMessageId);
    const jobDoc = await transaction.get(processedJobRef);
    
    if (jobDoc.exists) {
      console.log(`[attendance-core] Job ${actualMessageId} already processed. Skipping.`);
      return;
    }

    const logId = `${payload.sessionId}_${payload.studentId}`;
    const logRef = db.collection('attendance_logs').doc(logId);
    const logDoc = await transaction.get(logRef);
    
    if (!logDoc.exists) {
      // READS MUST HAPPEN BEFORE WRITES IN FIRESTORE TRANSACTIONS
      const sessionRef = db.collection('attendance_sessions').doc(payload.sessionId);
      const sessionDoc = await transaction.get(sessionRef);
      const numShards = sessionDoc.exists ? (sessionDoc.data()?.num_shards || 64) : 64;
      
      transaction.set(logRef, {
        schema_version: 1,
        session_id: payload.sessionId,
        student_id: payload.studentId,
        enrollment_no: payload.enrollmentNo,
        student_name: payload.studentName,
        school: payload.school,
        department: payload.department,
        programme: payload.programme,
        semester: payload.semester,
        section: payload.section,
        email: payload.email,
        scan_time: FieldValue.serverTimestamp(),
        qr_version: payload.qrVersion,
        scanner_device_id: payload.scannerDeviceId,
        ip_address: payload.ipAddress,
        user_agent: payload.userAgent,
        verification_result: payload.verificationResult,
        gps_mode: payload.gpsMode,
        attendance_mode: payload.attendanceMode,
        location_lat: payload.locationLat,
        location_lng: payload.locationLng,
        location_accuracy: payload.locationAccuracy,
        distance_from_campus: payload.distanceFromCampus,
        manual_override_reason: payload.manualOverrideReason || null,
        created_at: FieldValue.serverTimestamp(),
      });

      const shardId = Math.floor(Math.random() * numShards).toString();
      const shardRef = db.collection('attendance_stats').doc(payload.sessionId).collection('shards').doc(shardId);
      
      transaction.set(shardRef, {
        total_present: FieldValue.increment(1)
      }, { merge: true });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    transaction.set(processedJobRef, {
      processed_at: FieldValue.serverTimestamp(),
      expires_at: expiresAt
    });
  });
}
