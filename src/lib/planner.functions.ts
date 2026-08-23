import { auth } from "@/lib/firebase/config";

// ── Time helpers ──────────────────────────────────────────────────────────────
export function timeToMin(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function nowISTMinutes(): number {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.getHours() * 60 + ist.getMinutes();
}

export function formatTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2,'0')} ${period}`;
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });
}

// ── Planner API helper ────────────────────────────────────────────────────────
export async function fetchPlannerDashboard() {
  const user = await new Promise<any>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      unsubscribe();
      resolve(u);
    });
  });
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/planner-student-dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    
    if (!data.plannerActive) return null;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    let todaySessions = (data.today?.sessions || []).map((s: any) => {
      const start = timeToMin(s.startTime);
      const end = timeToMin(s.endTime);
      let status = 'upcoming';
      if (nowMin >= start && nowMin < end) status = 'current';
      else if (nowMin >= end) status = 'past';
      
      return {
        id: s.id || (s.sessionName || s.sessionTitle) + '-' + (s.startTime || '') + '-' + (s.venueName || s.venue || Math.random().toString(36).slice(2, 6)),
        startTime: s.startTime,
        sessionName: s.sessionName || s.sessionTitle,
        venueName: s.venue,
        status
      };
    });
    
    // Sort just in case
    todaySessions.sort((a: any, b: any) => timeToMin(a.startTime) - timeToMin(b.startTime));
    const nextSession = todaySessions.find((s: any) => s.status === 'upcoming' || s.status === 'current');

    return {
      plannerActive: true,
      room: data.room || null,
      today: {
        date: data.today?.date,
        sessions: todaySessions
      },
      nextSession: nextSession || data.nextSession || null,
      scheduleSummary: data.scheduleSummary || []
    };
  } catch {
    return null;
  }
}
