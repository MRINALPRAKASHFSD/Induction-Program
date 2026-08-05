import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar, Clock, MapPin, ArrowLeft,
  Map as MapIcon, Users, CheckCircle2,
  GraduationCap, FileText, BookOpen, User, Mic,
  Flag, School,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { localDb } from "@/lib/local-db";
import { getSchoolDays, getSchoolSessions, getAllSchoolDays, getAllSchoolSessions } from "@/lib/students.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/firebase/config";

export const Route = createLazyFileRoute("/schedule")({
  component: SchedulePage,
});

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  if (auth.currentUser) return auth.currentUser.getIdToken();
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      unsub();
      if (u) resolve(await u.getIdToken());
      else resolve(null);
    });
    setTimeout(() => { unsub(); resolve(null); }, 2000);
  });
}

async function fetchPlannerDay(day: number, master: boolean = false, prof: any = null) {
  try {
    const token = await getAuthToken();
    if (!token) return null;
    const p = prof || localDb.getStudentProfile();
    const dept  = encodeURIComponent(p?.department_id || p?.school_code || '');
    const course = encodeURIComponent(p?.course || '');
    const prog  = encodeURIComponent(p?.branch || p?.programme || '');
    const res = await fetch(
      `/api/planner-day-schedule?day=${day}&master=${master ? '1' : '0'}&dept=${dept}&course=${course}&prog=${prog}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Day helpers ─────────────────────────────────────────────────────────────

/**
 * Induction dates: Day 1 = 24 Aug 2026, Day 2 = 25 Aug 2026, …
 */
function getDayDate(dayNum: number): Date {
  const base = new Date('2026-08-24T00:00:00');
  base.setDate(base.getDate() + (dayNum - 1));
  return base;
}

function getDayDateLabel(dayNum: number): { date: string; dayLabel: string; fullDate: string } {
  const dates: Record<number, { date: string; dayLabel: string; fullDate: string }> = {
    1: { date: "24 AUG", dayLabel: "DAY 1", fullDate: "24 August" },
    2: { date: "25 AUG", dayLabel: "DAY 2", fullDate: "25 August" },
    3: { date: "26 AUG", dayLabel: "DAY 3", fullDate: "26 August" },
    4: { date: "27 AUG", dayLabel: "DAY 4", fullDate: "27 August" },
    5: { date: "28 AUG", dayLabel: "DAY 5", fullDate: "28 August" },
  };
  return dates[dayNum] || { date: `DAY ${dayNum}`, dayLabel: `DAY ${dayNum}`, fullDate: `Day ${dayNum}` };
}

// ─── Status helpers (CRITICAL: compare full date + time) ─────────────────────

function parseTimeMinutes(timeStr?: string, isoStr?: string): number | null {
  if (timeStr && typeof timeStr === 'string') {
    const clean = timeStr.trim().toUpperCase();
    const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3];
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      if (!ampm && hours < 8) hours += 12;
      return hours * 60 + minutes;
    }
  }
  if (isoStr && typeof isoStr === 'string') {
    const d = new Date(isoStr);
    if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  }
  return null;
}

/**
 * Build a full Date from a day number + HH:MM string.
 * e.g. dayNum=1, timeStr="11:45" → 2026-08-24T11:45:00
 */
function buildSessionDateTime(dayNum: number, timeStr: string | undefined, isoFallback?: string): Date | null {
  const minutesFromMidnight = parseTimeMinutes(timeStr, isoFallback);
  if (minutesFromMidnight === null) return null;
  const dayDate = getDayDate(dayNum);
  dayDate.setHours(Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60, 0, 0);
  return dayDate;
}

type SessionStatus = 'completed' | 'live' | 'upcoming';

function getSessionStatus(s: any, idx: number, activeDayNum: number): SessionStatus {
  // Honour server-provided status if it's already one of our known values
  if (s.status === 'completed' || s.status === 'live' || s.status === 'upcoming') {
    return s.status;
  }

  const now = new Date();

  // Build full Date objects for session start/end on the correct induction date
  const dayDate = getDayDate(activeDayNum);

  // Midnight of the session day
  const sessionDayStart = new Date(dayDate);
  sessionDayStart.setHours(0, 0, 0, 0);
  const sessionDayEnd = new Date(dayDate);
  sessionDayEnd.setHours(23, 59, 59, 999);

  // If the selected day is entirely in the future → all upcoming
  if (sessionDayStart > now) return 'upcoming';

  // If the selected day is entirely in the past → all completed
  if (sessionDayEnd < now) return 'completed';

  // Selected day === today → check time windows
  const startMins = parseTimeMinutes(s.startTime, s.starts_at) ?? (540 + idx * 60);
  const endMins   = parseTimeMinutes(s.endTime,   s.ends_at)   ?? (startMins + 60);

  const sessionStart = buildSessionDateTime(activeDayNum, s.startTime, s.starts_at) ?? (() => {
    const d = new Date(dayDate);
    d.setHours(Math.floor(startMins / 60), startMins % 60, 0, 0);
    return d;
  })();
  const sessionEnd = buildSessionDateTime(activeDayNum, s.endTime, s.ends_at) ?? (() => {
    const d = new Date(dayDate);
    d.setHours(Math.floor(endMins / 60), endMins % 60, 0, 0);
    return d;
  })();

  if (now >= sessionEnd)   return 'completed';
  if (now >= sessionStart) return 'live';
  return 'upcoming';
}

/** Returns true only when activeDayNum is today's induction day. */
function isTodaySelected(activeDayNum: number): boolean {
  const now      = new Date();
  const dayDate  = getDayDate(activeDayNum);
  return (
    now.getFullYear() === dayDate.getFullYear() &&
    now.getMonth()    === dayDate.getMonth()    &&
    now.getDate()     === dayDate.getDate()
  );
}

// ─── Countdown (only shown when today === session date) ──────────────────────

function formatCountdown(session: any, isLive: boolean, idx: number, activeDayNum: number): string {
  if (!isTodaySelected(activeDayNum)) return 'Scheduled';

  const now          = new Date();
  const nowMins      = now.getHours() * 60 + now.getMinutes();
  const startMins    = parseTimeMinutes(session?.startTime, session?.starts_at) ?? (540 + idx * 60);
  const endMins      = parseTimeMinutes(session?.endTime,   session?.ends_at)   ?? (startMins + 60);

  if (isLive) {
    const rem  = Math.max(endMins - nowMins, 1);
    const hrs  = Math.floor(rem / 60);
    const mins = rem % 60;
    return hrs > 0
      ? `Ends in ${String(hrs).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m`
      : `Ends in ${String(mins).padStart(2,'0')} min`;
  } else {
    const diff = startMins - nowMins;
    if (diff > 0) {
      const hrs  = Math.floor(diff / 60);
      const mins = diff % 60;
      return hrs > 0
        ? `Starts in ${String(hrs).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m`
        : `Starts in ${String(mins).padStart(2,'0')} min`;
    }
    return 'Starting soon';
  }
}

// ─── Icon map (one family, consistent stroke) ─────────────────────────────────

function getSessionIcon(session: any, idx: number, isLast: boolean) {
  if (isLast && idx > 0) return CheckCircle2;
  const t = (session.sessionName || session.title || session.category || '').toLowerCase();
  if (/registration|check.?in|welcome|report|venue/.test(t))                          return MapPin;
  if (/orientation|induction|address|dean|academic|talk|convocation/.test(t))         return GraduationCap;
  if (/mentor|interaction|club|group|alumni|student/.test(t))                         return Users;
  if (/workshop|activity|hack|lab|training|session/.test(t))                          return BookOpen;
  if (/doc|form|verif|pass|id |kit/.test(t))                                          return FileText;
  if (/tour|visit|campus|walk|sports/.test(t))                                        return MapPin;
  return Clock;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * Clean Apple-style timeline node: filled circle for completed, ring for others.
 */
function TimelineNode({ status }: { status: SessionStatus }) {
  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      {status === 'completed' ? (
        <div className="w-[18px] h-[18px] rounded-full bg-[#8a4a22] flex items-center justify-center shadow-sm">
          <div className="w-[6px] h-[6px] rounded-full bg-white" />
        </div>
      ) : status === 'live' ? (
        <div className="w-[18px] h-[18px] rounded-full border-2 border-[#8a4a22] bg-[#8a4a22]/15 flex items-center justify-center">
          <div className="w-[6px] h-[6px] rounded-full bg-[#8a4a22] animate-pulse" />
        </div>
      ) : (
        <div className="w-[18px] h-[18px] rounded-full border-2 border-[#8a4a22]/30 bg-white dark:bg-zinc-900" />
      )}
    </div>
  );
}

function TimelineConnector({ completed }: { completed: boolean }) {
  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      <div className={`w-[2px] h-8 rounded-full ${completed ? 'bg-[#8a4a22]/50' : 'bg-[#8a4a22]/15'}`} />
    </div>
  );
}

/**
 * Thin progress bar — no glow, no gradient, just clean.
 */
function DayProgressBar({ progressPercentage, activeDayNum }: { progressPercentage: number; activeDayNum: number }) {
  const isToday = isTodaySelected(activeDayNum);
  return (
    <div className="rounded-2xl p-4 mb-6 bg-white dark:bg-zinc-900/80 border border-[#8a4a22]/10 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[#8a4a22] flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {isToday ? 'Today\'s Progress' : `Day ${activeDayNum} Progress`}
        </span>
        <span className="text-xs font-semibold text-secondary">{progressPercentage}% Complete</span>
      </div>
      <div className="relative w-full h-[3px] bg-[#8a4a22]/12 rounded-full overflow-visible">
        <div
          className="absolute top-0 left-0 h-full bg-[#8a4a22] rounded-full transition-all duration-700"
          style={{ width: `${progressPercentage}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#8a4a22] border-2 border-white shadow-sm transition-all duration-700"
          style={{ left: `${Math.min(Math.max(progressPercentage, 3), 97)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function SchedulePage() {
  const [profile, setProfile]           = useState<any>(null);
  const [days, setDays]                 = useState<number[]>([]);
  const [activeDay, setActiveDay]       = useState<number | null>(null);
  const [sessions, setSessions]         = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [isMasterView, setIsMasterView] = useState(false);
  const [plannerActive, setPlannerActive] = useState(false);

  useEffect(() => {
    const p = localDb.getStudentProfile();
    if (p) setProfile(p);

    fetchPlannerDay(1, false, p).then(data => {
      if (data && data.plannerActive) {
        setPlannerActive(true);
        setDays([1, 2, 3, 4, 5]);
        setActiveDay(1);
        setSessions(data.sessions || []);
        setLoading(false);
      } else if (p) {
        fetchDays(p.department_id!, isMasterView);
      } else {
        setLoading(false);
      }
    });
  }, []);

  const fetchDays = async (department_id: string, master: boolean) => {
    setLoading(true);
    try {
      const res: any = master
        ? await getAllSchoolDays()
        : await getSchoolDays({ data: { department_id } });
      if (res.days) {
        setDays(res.days);
        if (res.days.length > 0) {
          const firstDay = res.days[0];
          setActiveDay(firstDay);
          fetchSessions(department_id, firstDay, master);
        } else {
          setDays([]);
          setSessions([]);
          setLoading(false);
        }
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const fetchSessions = async (department_id: string, day_number: number, master: boolean) => {
    setLoading(true);
    try {
      if (plannerActive) {
        const data = await fetchPlannerDay(day_number, master, profile);
        if (data && data.sessions) setSessions(data.sessions);
        return;
      }
      const res: any = master
        ? await getAllSchoolSessions({ data: { day_number } })
        : await getSchoolSessions({ data: { department_id, day_number } });
      if (res.sessions) setSessions(res.sessions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDaySelect = (d: number) => {
    setActiveDay(d);
    fetchSessions(profile?.department_id || '', d, isMasterView);
  };

  const toggleMasterView = (checked: boolean) => {
    setIsMasterView(checked);
    if (plannerActive) {
      fetchSessions(profile?.department_id || '', activeDay || 1, checked);
    } else if (profile) {
      fetchDays(profile.department_id, checked);
    }
  };

  // ── Guard: no profile ──────────────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto px-4 py-16 text-center">
          <div className="empty-state max-w-sm mx-auto">
            <div className="empty-state-icon">
              <Calendar className="h-7 w-7" />
            </div>
            <div className="empty-state-title">Register First</div>
            <div className="empty-state-text">
              Register to see your personalized induction schedule.
            </div>
            <Button asChild variant="liquidGlassMaroon" size="lg" className="rounded-full px-8">
              <Link to="/register">Register Now</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeDayNum    = activeDay || 1;
  const dayInfo         = getDayDateLabel(activeDayNum);
  const isToday         = isTodaySelected(activeDayNum);

  const computedStatuses = sessions.map((s, idx) => getSessionStatus(s, idx, activeDayNum));
  const completedCount  = computedStatuses.filter(st => st === 'completed').length;
  const liveCount       = computedStatuses.filter(st => st === 'live').length;
  const totalSessions   = sessions.length;
  const remainingCount  = totalSessions - completedCount;
  const progressPct     = totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0;

  // Next/Live session only meaningful when today is selected
  const nextOrLive = isToday
    ? (() => {
        const liveIdx = computedStatuses.indexOf('live');
        if (liveIdx !== -1) return { session: sessions[liveIdx], isLive: true, idx: liveIdx };
        const upcomingIdx = computedStatuses.indexOf('upcoming');
        if (upcomingIdx !== -1) return { session: sessions[upcomingIdx], isLive: false, idx: upcomingIdx };
        return null;
      })()
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-12 overflow-x-hidden">
      <SiteHeader />

      {/* Subtle ambient — no blobs, just a very faint warm wash */}
      <div className="pointer-events-none fixed inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#f5ede4] via-transparent to-transparent" aria-hidden="true" />

      <main className="relative container mx-auto max-w-2xl px-4 py-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

          {/* ── Page Header ──────────────────────────────────────────────── */}
          <div className="rounded-2xl p-5 bg-white dark:bg-zinc-900/80 border border-[#8a4a22]/10 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  className="rounded-full bg-[#8a4a22]/6 hover:bg-[#8a4a22]/12 border border-[#8a4a22]/12 shrink-0"
                >
                  <Link to="/my-pass">
                    <ArrowLeft className="h-4 w-4 text-[#5a2c14]" />
                  </Link>
                </Button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">
                    Your Induction Journey
                  </h1>
                  <p className="text-xs text-secondary mt-0.5">
                    Follow your personalized induction timeline.
                  </p>
                </div>
              </div>

              {/* Master toggle */}
              <div className="flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-full bg-[#8a4a22]/6 border border-[#8a4a22]/12">
                <Switch
                  id="master-view"
                  checked={isMasterView}
                  onCheckedChange={toggleMasterView}
                />
                <Label
                  htmlFor="master-view"
                  className="text-[11px] font-semibold cursor-pointer tracking-wide text-[#8a4a22]"
                >
                  Master
                </Label>
              </div>
            </div>
          </div>

          {/* ── Sticky Progress Hero ─────────────────────────────────────── */}
          <div className="sticky top-16 z-30 pt-1 pb-2 bg-background/90 backdrop-blur-md">
            <div className="rounded-2xl p-5 bg-white dark:bg-zinc-900/90 border border-[#8a4a22]/12 shadow-md">

              {/* Row: day label + date */}
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <span className="text-[11px] font-semibold text-[#8a4a22]/70 uppercase tracking-widest">
                    Induction Program
                  </span>
                  <p className="text-base font-bold text-primary mt-0.5">
                    Day {activeDayNum} — {dayInfo.fullDate}
                    {isToday && (
                      <span className="ml-2 text-[10px] font-semibold text-[#8a4a22] bg-[#8a4a22]/8 border border-[#8a4a22]/15 px-2 py-0.5 rounded-full align-middle">
                        Today
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-xs font-semibold text-secondary">
                  {progressPct}% done
                </span>
              </div>

              {/* Progress bar */}
              <div className="relative w-full h-[3px] bg-[#8a4a22]/12 rounded-full mb-5">
                <div
                  className="absolute top-0 left-0 h-full bg-[#8a4a22] rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#8a4a22] border-2 border-white dark:border-zinc-900 shadow-sm transition-all duration-700"
                  style={{ left: `${Math.min(Math.max(progressPct, 3), 97)}%` }}
                />
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {/* Completed */}
                <div className="flex flex-col p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-700/30">
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1">
                    Done
                  </span>
                  <span className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">
                    {completedCount}
                  </span>
                </div>

                {/* Remaining */}
                <div className="flex flex-col p-3 rounded-xl bg-[#8a4a22]/6 border border-[#8a4a22]/15">
                  <span className="text-[10px] font-semibold text-[#8a4a22] uppercase tracking-wider mb-1">
                    Left
                  </span>
                  <span className="text-2xl font-bold text-primary">
                    {remainingCount}
                  </span>
                </div>

                {/* Next / Live */}
                <div className="flex flex-col justify-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/40 col-span-1">
                  {nextOrLive ? (
                    <>
                      <div className="flex items-center gap-1 mb-1">
                        {nextOrLive.isLive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#8a4a22] bg-[#8a4a22]/8 border border-[#8a4a22]/20 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#8a4a22] animate-pulse inline-block" />
                            Live
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-secondary uppercase tracking-wider">
                            Next
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-semibold text-primary leading-snug line-clamp-1">
                        {nextOrLive.session.sessionName || nextOrLive.session.title || 'Session'}
                      </div>
                      <div className="text-[10px] text-secondary mt-0.5">
                        {formatCountdown(nextOrLive.session, nextOrLive.isLive, nextOrLive.idx, activeDayNum)}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] font-semibold text-secondary uppercase tracking-wider mb-1">
                        Status
                      </span>
                      <div className="text-[11px] font-semibold text-primary">
                        {isToday ? 'Day Complete' : (activeDayNum < 1 ? 'Upcoming' : 'Completed')}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Day Selector ─────────────────────────────────────────────── */}
          {days.length > 0 && (
            <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 snap-x hide-scrollbar px-0.5">
              {days.map(d => {
                const dInfo    = getDayDateLabel(d);
                const isSel    = activeDay === d;
                const isTodayD = isTodaySelected(d);
                return (
                  <button
                    key={d}
                    onClick={() => handleDaySelect(d)}
                    className={[
                      'snap-start shrink-0 flex flex-col items-center justify-center px-4 py-3 min-w-[6rem] rounded-2xl',
                      'transition-all duration-150 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a4a22]/40',
                      isSel
                        ? 'bg-[#8a4a22] text-white shadow-md shadow-[#8a4a22]/20 scale-[1.04] border border-[#8a4a22]'
                        : 'bg-white dark:bg-zinc-900/80 text-primary hover:scale-[1.02] hover:shadow-sm border border-[#8a4a22]/12',
                    ].join(' ')}
                  >
                    <span className={`text-[10px] uppercase font-semibold tracking-wider mb-0.5 ${isSel ? 'text-white/75' : 'text-[#8a4a22]/60'}`}>
                      {dInfo.date}
                    </span>
                    <span className={`text-lg font-bold tracking-tight ${isSel ? 'text-white' : 'text-primary'}`}>
                      {dInfo.dayLabel}
                    </span>
                    {isTodayD && (
                      <span className={`text-[9px] font-semibold mt-0.5 px-1.5 py-0.5 rounded-full ${isSel ? 'bg-white/20 text-white' : 'bg-[#8a4a22]/8 text-[#8a4a22]'}`}>
                        Today
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Session Timeline ──────────────────────────────────────────── */}
          <div className="relative py-2 flex flex-col min-h-[40vh]">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="skeleton-glass skeleton-circle w-12 h-12 shrink-0" />
                    <div className="flex-1 skeleton-glass skeleton-card" style={{ minHeight: '120px' }} />
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Calendar className="h-7 w-7" />
                </div>
                <div className="empty-state-title">No Sessions</div>
                <div className="empty-state-text">
                  No sessions scheduled for this day yet. Check back later!
                </div>
              </div>
            ) : (
              <>
                {/* Day progress bar */}
                <DayProgressBar progressPercentage={progressPct} activeDayNum={activeDayNum} />

                <div className="relative z-10">
                  {sessions.map((s, idx) => {
                    const status  = computedStatuses[idx];
                    const isLast  = idx === sessions.length - 1;
                    const IconComp = getSessionIcon(s, idx, isLast);
                    const timeLabel = s.startTime
                      ? `${s.startTime}${s.endTime ? ' – ' + s.endTime : ''}`
                      : s.starts_at
                        ? new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Time TBA';

                    return (
                      <div key={s.id || idx} className="flex gap-3">

                        {/* ── Left column: timeline node + connector ──── */}
                        <div className="flex flex-col items-center pt-5 shrink-0 w-5">
                          <TimelineNode status={status} />
                          {!isLast && <TimelineConnector completed={status === 'completed'} />}
                        </div>

                        {/* ── Right column: session card ──────────────── */}
                        <div className="flex-1 pb-4">
                          <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
                            className={[
                              'rounded-[18px] p-5 border-l-4 border transition-all duration-150',
                              status === 'completed'
                                ? 'bg-white dark:bg-zinc-900/70 border-l-[#8a4a22]/40 border-[#8a4a22]/8 opacity-75 hover:opacity-100 shadow-sm'
                                : status === 'live'
                                  ? 'bg-white dark:bg-zinc-900/90 border-l-[#8a4a22] border-[#8a4a22]/20 shadow-md'
                                  : 'bg-white dark:bg-zinc-900/80 border-l-[#8a4a22]/30 border-[#8a4a22]/8 hover:-translate-y-0.5 hover:shadow-md shadow-sm',
                            ].join(' ')}
                          >
                            {/* Card top: status + time */}
                            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                {/* Status badge */}
                                {status === 'completed' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700/30">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Completed
                                  </span>
                                ) : status === 'live' ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#8a4a22]/8 text-[#8a4a22] border border-[#8a4a22]/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#8a4a22] animate-pulse" />
                                    Live Now
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-500 border border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700/40">
                                    <Clock className="w-3 h-3" />
                                    Upcoming
                                  </span>
                                )}

                                {/* Time chip */}
                                <span className="text-[11px] font-semibold text-secondary bg-zinc-50 dark:bg-zinc-800/50 px-2.5 py-1 rounded-full border border-zinc-200/70 dark:border-zinc-700/40">
                                  {timeLabel}
                                </span>
                              </div>

                              {/* Scope tag */}
                              {s.scope && (
                                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#8a4a22]/6 text-[#8a4a22]/70 border border-[#8a4a22]/12">
                                  {s.scope === 'universal' ? 'All Schools' : (s.scopeKey || s.scope)}
                                </span>
                              )}
                            </div>

                            {/* Session icon + title row */}
                            <div className="flex items-start gap-3 mb-2">
                              <div className={[
                                'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                                status === 'completed'
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700/30'
                                  : status === 'live'
                                    ? 'bg-[#8a4a22]/10 text-[#8a4a22] border border-[#8a4a22]/20'
                                    : 'bg-[#8a4a22]/6 text-[#8a4a22]/70 border border-[#8a4a22]/10',
                              ].join(' ')}>
                                <IconComp className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-base font-semibold text-primary leading-tight">
                                  {s.sessionName || s.title || 'Induction Session'}
                                </h3>
                                {(s.sessionType || s.category) && (
                                  <p className="text-[11px] text-secondary mt-0.5">
                                    {s.sessionType || s.category}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Description */}
                            {(s.specialInstructions || s.description) && (
                              <p className="text-sm text-secondary mb-3 leading-relaxed line-clamp-2 pl-12">
                                {s.specialInstructions || s.description}
                              </p>
                            )}

                            {/* Countdown (only when today is selected and session is upcoming/live) */}
                            {isToday && status !== 'completed' && (
                              <div className="pl-12 mb-3">
                                <span className="text-[11px] font-semibold text-[#8a4a22]">
                                  {formatCountdown(s, status === 'live', idx, activeDayNum)}
                                </span>
                              </div>
                            )}

                            {/* Footer chips */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
                              {(s.venueName || s.venue) && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-zinc-50 dark:bg-zinc-800/50 text-secondary border border-zinc-200/70 dark:border-zinc-700/40">
                                  <MapPin className="w-3 h-3 text-[#8a4a22]/70 shrink-0" />
                                  {s.venueName || s.venue}
                                </span>
                              )}
                              {(s.building || s.block || s.room) && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-zinc-50 dark:bg-zinc-800/50 text-secondary border border-zinc-200/70 dark:border-zinc-700/40">
                                  <School className="w-3 h-3 text-[#8a4a22]/70 shrink-0" />
                                  {[s.building || s.block, s.room].filter(Boolean).join(' · ')}
                                </span>
                              )}
                              {s.floor && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-zinc-50 dark:bg-zinc-800/50 text-secondary border border-zinc-200/70 dark:border-zinc-700/40">
                                  <School className="w-3 h-3 text-[#8a4a22]/70 shrink-0" />
                                  Floor {s.floor}
                                </span>
                              )}
                              {(s.faculty || s.facultyCoordinator) && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-zinc-50 dark:bg-zinc-800/50 text-secondary border border-zinc-200/70 dark:border-zinc-700/40">
                                  <User className="w-3 h-3 text-[#8a4a22]/70 shrink-0" />
                                  {s.faculty || s.facultyCoordinator}
                                </span>
                              )}
                              {s.speaker && s.speaker !== (s.faculty || s.facultyCoordinator) && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-zinc-50 dark:bg-zinc-800/50 text-secondary border border-zinc-200/70 dark:border-zinc-700/40">
                                  <Mic className="w-3 h-3 text-[#8a4a22]/70 shrink-0" />
                                  {s.speaker}
                                </span>
                              )}

                              {/* View Map — right-aligned */}
                              {(s.venueName || s.venue || s.building || s.block) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="ml-auto rounded-full text-[11px] font-semibold text-[#8a4a22] hover:bg-[#8a4a22]/8 border border-[#8a4a22]/15 gap-1 px-3 h-7"
                                  onClick={() => {}}
                                >
                                  <MapIcon className="w-3 h-3" />
                                  Map
                                </Button>
                              )}
                            </div>
                          </motion.div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Journey completion card */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="mt-8 rounded-2xl p-6 text-center bg-white dark:bg-zinc-900/80 border border-[#8a4a22]/12 shadow-sm"
                  >
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#8a4a22]/8 border border-[#8a4a22]/15 text-[#8a4a22] mb-4">
                      <Flag className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-primary mb-1">Day {activeDayNum} Complete</h3>
                    <p className="text-sm text-secondary max-w-xs mx-auto mb-4 leading-relaxed">
                      You've reached the end of today's induction timeline.
                    </p>
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#8a4a22]/6 border border-[#8a4a22]/15 text-[11px] font-semibold text-[#8a4a22] uppercase tracking-wider">
                      Aarambh 2026
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </div>

        </motion.div>
      </main>
    </div>
  );
}
