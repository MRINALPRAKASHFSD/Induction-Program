
import analyticsActivity from '../server/api-routes/analytics-activity';
import analyticsAttendance from '../server/api-routes/analytics-attendance';
import analyticsClubs from '../server/api-routes/analytics-clubs';
import analyticsEvents from '../server/api-routes/analytics-events';
import analyticsOverview from '../server/api-routes/analytics-overview';
import analyticsQr from '../server/api-routes/analytics-qr';
import analyticsSnapshot from '../server/api-routes/analytics-snapshot';
import analyticsStudents from '../server/api-routes/analytics-students';
import announcements from '../server/api-routes/announcements';
import attendanceExport from '../server/api-routes/attendance-export';
import attendanceMark from '../server/api-routes/attendance-mark';
import attendanceQr from '../server/api-routes/attendance-qr';
import attendanceSession from '../server/api-routes/attendance-session';
import attendanceStats from '../server/api-routes/attendance-stats';
import attendanceWorker from '../server/api-routes/attendance-worker';
import eventAttendanceExport from '../server/api-routes/event-attendance-export';
import eventAttendanceList from '../server/api-routes/event-attendance-list';
import eventAttendanceMark from '../server/api-routes/event-attendance-mark';
import eventDatasetActivate from '../server/api-routes/event-dataset-activate';
import eventDatasetDelete from '../server/api-routes/event-dataset-delete';
import eventDatasetImport from '../server/api-routes/event-dataset-import';
import eventDatasetUpload from '../server/api-routes/event-dataset-upload';
import liveImpact from '../server/api-routes/live-impact';
import register from '../server/api-routes/register';
import sendOtp from '../server/api-routes/send-otp';
import vaultAssignRole from '../server/api-routes/vault-assign-role';
import vaultDownload from '../server/api-routes/vault-download';
import vaultInitUpload from '../server/api-routes/vault-init-upload';
import verifyOtp from '../server/api-routes/verify-otp';


export default async function handler(req: any, res: any) {
  try {
    // Determine the route based on the URL or the query param
    // Vercel rewrites might preserve req.url or we can pass ?route=
    let path = req.url.split('?')[0];
    
    // Extract the part after /api/
    const match = path.match(/\/api\/([^/?]+)/);
    const route = match ? match[1] : null;

    if (!route) {
      return res.status(404).json({ error: 'API route not found' });
    }

    switch (route) {
    case 'analytics-activity': return await analyticsActivity(req, res);
    case 'analytics-attendance': return await analyticsAttendance(req, res);
    case 'analytics-clubs': return await analyticsClubs(req, res);
    case 'analytics-events': return await analyticsEvents(req, res);
    case 'analytics-overview': return await analyticsOverview(req, res);
    case 'analytics-qr': return await analyticsQr(req, res);
    case 'analytics-snapshot': return await analyticsSnapshot(req, res);
    case 'analytics-students': return await analyticsStudents(req, res);
    case 'announcements': return await announcements(req, res);
    case 'attendance-export': return await attendanceExport(req, res);
    case 'attendance-mark': return await attendanceMark(req, res);
    case 'attendance-qr': return await attendanceQr(req, res);
    case 'attendance-session': return await attendanceSession(req, res);
    case 'attendance-stats': return await attendanceStats(req, res);
    case 'attendance-worker': return await attendanceWorker(req, res);
    case 'event-attendance-export': return await eventAttendanceExport(req, res);
    case 'event-attendance-list': return await eventAttendanceList(req, res);
    case 'event-attendance-mark': return await eventAttendanceMark(req, res);
    case 'event-dataset-activate': return await eventDatasetActivate(req, res);
    case 'event-dataset-delete': return await eventDatasetDelete(req, res);
    case 'event-dataset-import': return await eventDatasetImport(req, res);
    case 'event-dataset-upload': return await eventDatasetUpload(req, res);
    case 'live-impact': return await liveImpact(req, res);
    case 'register': return await register(req, res);
    case 'send-otp': return await sendOtp(req, res);
    case 'vault-assign-role': return await vaultAssignRole(req, res);
    case 'vault-download': return await vaultDownload(req, res);
    case 'vault-init-upload': return await vaultInitUpload(req, res);
    case 'verify-otp': return await verifyOtp(req, res);

      default:
        return res.status(404).json({ error: 'API route not mapped' });
    }
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
