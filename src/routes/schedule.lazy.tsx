import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { m, AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays, Clock, MapPin, Mic2, Calendar, 
  Flag, Users, BookOpen, FileText, CheckCircle2,
  Map as MapIcon, GraduationCap, School, User, Mic,
  Download, RefreshCw, AlertCircle
} from "lucide-react";
import { SiteHeader, NavSpacer } from "@/components/site-header";
import { localDb } from "@/lib/local-db";
import { auth } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createLazyFileRoute("/schedule")({
  component: UnifiedSchedulePage,
});

type ScheduleType = "orientation" | "induction";

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

// ─── ICS Calendar Export ─────────────────────────────────────────────────────

function generateICS(sessions: any[], title: string, eventDateStr: string) {
  let ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Aarambh//Schedule//EN\n";
  const nowStr = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  sessions.forEach(s => {
    try {
      const dateStr = s.date || eventDateStr || new Date().toISOString().slice(0, 10);
      const startT = s.startTime || s.starts_at;
      const endT = s.endTime || s.ends_at || startT;
      if (!startT) return;
      
      const [sh, sm] = startT.split(":").map(Number);
      const [eh, em] = endT.split(":").map(Number);
      
      const startD = new Date(dateStr);
      startD.setHours(sh || 0, sm || 0, 0, 0);
      const endD = new Date(dateStr);
      endD.setHours(eh || 0, em || 0, 0, 0);

      const formatICSDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      
      ics += "BEGIN:VEVENT\n";
      ics += `UID:${Math.random().toString(36).substr(2, 9)}@aarambh\n`;
      ics += `DTSTAMP:${nowStr}\n`;
      ics += `DTSTART:${formatICSDate(startD)}\n`;
      ics += `DTEND:${formatICSDate(endD)}\n`;
      ics += `SUMMARY:${s.sessionTitle || s.sessionName || s.title || "Session"}\n`;
      ics += `DESCRIPTION:${s.description || s.specialInstructions || ""}\n`;
      ics += `LOCATION:${s.venueName || s.venue || ""} ${s.building || s.block || ""}\n`;
      ics += "END:VEVENT\n";
    } catch (e) {
      // ignore parsing errors for individual sessions
    }
  });

  ics += "END:VCALENDAR";
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${title.replace(/\s+/g, "_")}_Schedule.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── Time Helpers ────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  if (!t) return -1;
  const match = t.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/);
  if (!match) return -1;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3];
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (!ampm && h < 8) h += 12;
  return h * 60 + m;
}

function formatTime(t: string): string {
  if (!t) return "";
  try {
    const mins = timeToMinutes(t);
    if (mins < 0) return t;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch { return t; }
}

function getSessionStatus(session: any, dayDateStr: string, now: Date): "live" | "completed" | "upcoming" {
  const sessionDate = session.date || dayDateStr;
  if (!sessionDate) return "upcoming";

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  if (sessionDate !== todayStr) {
    return sessionDate < todayStr ? "completed" : "upcoming";
  }
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const start  = timeToMinutes(session.startTime || session.starts_at);
  const end    = timeToMinutes(session.endTime || session.ends_at) > -1 ? timeToMinutes(session.endTime || session.ends_at) : start + 60;
  
  if (nowMin >= start && nowMin < end) return "live";
  if (nowMin >= end) return "completed";
  return "upcoming";
}

function formatCountdown(session: any, isLive: boolean, now: Date): string {
  const nowMins   = now.getHours() * 60 + now.getMinutes();
  const startMins = timeToMinutes(session.startTime || session.starts_at);
  const endMins   = timeToMinutes(session.endTime || session.ends_at) > -1 ? timeToMinutes(session.endTime || session.ends_at) : startMins + 60;

  if (isLive) {
    const rem  = Math.max(endMins - nowMins, 1);
    const hrs  = Math.floor(rem / 60);
    const mins = rem % 60;
    return hrs > 0 ? `Ends in ${hrs}h ${mins}m` : `Ends in ${mins} min`;
  } else {
    const diff = startMins - nowMins;
    if (diff > 0) {
      const hrs  = Math.floor(diff / 60);
      const mins = diff % 60;
      return hrs > 0 ? `Starts in ${hrs}h ${mins}m` : `Starts in ${mins} min`;
    }
    return 'Starting soon';
  }
}

function getSessionIcon(title: string) {
  const t = (title || "").toLowerCase();
  if (/lunch|break|dinner|breakfast|snack/.test(t)) return "🍴";
  if (/orientation|induction/.test(t)) return "🎓";
  if (/performance|cultural|music/.test(t)) return "🎵";
  if (/award|prize|ceremony/.test(t)) return "🏆";
  if (/network|meet|greet|interact/.test(t)) return "🤝";
  if (/club|expo|fair/.test(t)) return "🎯";
  if (/address|speech|dean|vc|chancellor/.test(t)) return "🎤";
  return null; // fallback to lucide icons
}

function getSessionFallbackIcon(title: string) {
  const t = (title || "").toLowerCase();
  if (/registration|check|welcome|report|venue|tour|visit|campus/.test(t)) return MapPin;
  if (/mentor|interaction|club|group|alumni|student/.test(t)) return Users;
  if (/workshop|activity|hack|lab|training/.test(t)) return BookOpen;
  if (/doc|form|verif|pass/.test(t)) return FileText;
  return Clock;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function UnifiedSchedulePage() {
  const navigate = useNavigate();
  const profileStr = JSON.stringify(localDb.getStudentProfile() || null);
  const profile = useMemo(() => JSON.parse(profileStr), [profileStr]);

  const [scheduleType, setScheduleType] = useState<ScheduleType>("orientation");
  
  // ── Data State ────────────────────────────────────────────────────────────
  const [orientationSessions, setOrientationSessions] = useState<any[]>([]);

  // Induction: precomputed from /api/student-full-schedule
  interface DayData { date: string; dayNumber: number; sessions: any[]; }
  const [inductionDays,     setInductionDays]     = useState<DayData[]>([]);
  const [activeDayDate,     setActiveDayDate]     = useState<string>('');
  const [inductionRoom,     setInductionRoom]     = useState<string | null>(null);
  const [plannerActive,     setPlannerActive]     = useState(false);

  const [loading,     setLoading]     = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [now,         setNow]         = useState(new Date());

  const INDUCTION_START = '2026-08-24';

  // Auto Refresh Time
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // ── Auth helper (defined inside component to avoid re-imports) ────────────
  const getToken = async (): Promise<string | null> => {
    if (auth.currentUser) return auth.currentUser.getIdToken();
    return new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged(async (u) => {
        unsub();
        if (u) resolve(await u.getIdToken());
        else resolve(null);
      });
      setTimeout(() => { unsub(); resolve(null); }, 2000);
    });
  };

  // ── Orientation fetch (unchanged) ─────────────────────────────────────────
  const fetchOrientation = async () => {
    try {
      const token = await getToken();
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch("/api/event-schedule?type=orientation", { headers });
      const data = await res.json();
      if (data.plannerActive || data.sessions) {
        setOrientationSessions(data.sessions || []);
      }
    } catch (e) {
      console.error('[schedule] orientation fetch error:', e);
    }
  };

  // ── Induction fetch: single call to precomputed API ───────────────────────
  const fetchMySchedule = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/student-full-schedule', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok) return;

      setPlannerActive(data.plannerActive ?? false);
      setInductionRoom(data.roomNumber || null);

      const days: DayData[] = (data.days || []).filter((d: DayData) => d.date >= INDUCTION_START);
      setInductionDays(days);

      // Auto-select today or first day
      if (days.length > 0) {
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const todayDay = days.find((d: DayData) => d.date === todayStr);
        const futureDay = days.find((d: DayData) => d.date >= todayStr);
        setActiveDayDate((todayDay || futureDay || days[0]).date);
      }
    } catch (e) {
      console.error('[schedule] induction fetch error:', e);
    }
  };

  const fetchAllData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    await Promise.all([fetchOrientation(), profile ? fetchMySchedule() : Promise.resolve()]);
    setLastFetched(new Date());
    if (!silent) setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchAllData(false);
    const interval = setInterval(() => fetchAllData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  const handleDaySelect = (date: string) => setActiveDayDate(date);


  // ── Current View Data ─────────────────────────────────────────────────────
  const isOrientation = !profile ? true : scheduleType === "orientation";

  // For induction: look up the active day's sessions from precomputed days
  const activeDayData = inductionDays.find(d => d.date === activeDayDate);
  let currentSessions = isOrientation
    ? orientationSessions
    : (activeDayData?.sessions || []);

  // Sort sessions by startTime
  currentSessions = [...currentSessions].sort(
    (a, b) => timeToMinutes(a.startTime || a.starts_at) - timeToMinutes(b.startTime || b.starts_at)
  );

  // Date string for display and status calculation
  const activeDateStr = isOrientation
    ? (() => {
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
        const nextSession = orientationSessions.find(s => s.date && s.date >= todayStr);
        return nextSession?.date || orientationSessions[0]?.date || todayStr;
      })()
    : (activeDayDate || INDUCTION_START);


  const displayDateStr = new Date(activeDateStr).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const computedStatuses = currentSessions.map(s => getSessionStatus(s, activeDateStr, now));
  const completedCount  = computedStatuses.filter(st => st === 'completed').length;
  const liveCount       = computedStatuses.filter(st => st === 'live').length;
  const totalSessions   = currentSessions.length;
  const progressPct     = totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0;
  
  const greeting = now.getHours() < 12 ? "Good Morning" : now.getHours() < 17 ? "Good Afternoon" : "Good Evening";
  
  // Badges Logic
  let badge = "Novice";
  let nextBadge = "Explorer";
  if (completedCount >= 8) { badge = "Explorer"; nextBadge = "Campus Insider"; }
  if (completedCount >= 12) { badge = "Campus Insider"; nextBadge = "Master"; }

  const isCopper = isOrientation;
  const accentColor = isCopper ? "#c27c51" : "#8a4a22"; // Copper vs Maroon

  return (
    <div className="min-h-dvh transition-colors duration-700 relative overflow-x-hidden" style={{ backgroundColor: '#FFFDFC' }}>
      <SiteHeader />
      <NavSpacer />
      
      {/* Dynamic Background Wash */}
      <div 
        className="pointer-events-none fixed inset-0 opacity-[0.15] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-transparent via-transparent transition-colors duration-700" 
        style={{ '--tw-gradient-to': isCopper ? '#f5d9c6' : '#f5ede4' } as any}
        aria-hidden="true" 
      />
      
      {/* ── Aarambh Ambient Background ──────────────────────────────── */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
        <div className="ambient-blob ambient-blob-3" />
        <div className="watermark" aria-hidden="true">AARAMBH</div>
      </div>
      <div className="bg-hero-premium fixed inset-0 -z-10 opacity-40" aria-hidden="true" />

      <main className="relative container mx-auto max-w-2xl px-4 py-6">
        <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

          {/* ── Dynamic Brand Quote Header ───────────────────────────────── */}
          <div className="text-center py-2 space-y-1">
            <h1 className="text-2xl font-bold text-primary tracking-tight">
              {greeting}
            </h1>
            <p className="text-sm text-secondary italic">
              "Stand In. Stand Out. Belong."
            </p>
          </div>

          {/* ── Segmented Control or Pitch ────────────────────────────────────────── */}
          {!profile ? (
            <div className="bg-white border border-[#8B1E2D]/10 rounded-2xl p-5 shadow-sm text-center">
              <h2 className="text-lg font-bold text-primary mb-2">Personalize Your Schedule</h2>
              <p className="text-sm text-secondary mb-4">Complete your registration to unlock your digital pass and personalized Dikshaarambh schedule.</p>
              <Button asChild className="w-full bg-[#8B1E2D] hover:bg-[#6e3a1a] text-white rounded-xl shadow-md transition-transform active:scale-95">
                <Link to="/register">Complete Registration</Link>
              </Button>
            </div>
          ) : (
            <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-xl w-full max-w-sm mx-auto shadow-inner relative">
              <button
                onClick={() => setScheduleType("orientation")}
                className={`flex-1 relative z-10 py-2.5 text-[13px] font-bold rounded-lg transition-colors ${isOrientation ? 'text-white' : 'text-secondary hover:text-primary'}`}
              >
                📍 Orientation
              </button>
              <button
                onClick={() => setScheduleType("induction")}
                className={`flex-1 relative z-10 py-2.5 text-[13px] font-bold rounded-lg transition-colors ${!isOrientation ? 'text-white' : 'text-secondary hover:text-primary'}`}
              >
                🎓 Dikshaarambh
              </button>
              
              {/* Animated Pill */}
              <m.div
                layoutId="schedule-tab-pill"
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-sm"
                style={{ 
                  backgroundColor: accentColor,
                  left: isOrientation ? '4px' : '50%'
                }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            </div>
          )}

          {/* ── Top Bar (Date & Export) ──────────────────────────────────── */}
          <div className="flex items-center justify-between px-2 pt-2">
            <div>
              <h2 className="text-lg font-bold text-primary">{displayDateStr}</h2>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-tertiary mt-0.5">
                <Clock className="w-3 h-3" />
                {lastFetched ? "Updated just now" : "Updating..."}
              </div>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-full h-8 text-[11px] font-semibold"
              onClick={() => generateICS(currentSessions, isOrientation ? "Orientation" : "Dikshaarambh", activeDateStr)}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export
            </Button>
          </div>

          {/* ── Induction Day Selector (date-driven from precomputed schedule) ── */}
          <AnimatePresence mode="wait">
            {!isOrientation && inductionDays.length > 0 && (
              <m.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex gap-2.5 overflow-x-auto pb-2 pt-1 snap-x hide-scrollbar px-0.5"
              >
                {inductionDays.map((day, idx) => {
                  const isSel = activeDayDate === day.date;
                  const label = new Date(day.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                  return (
                    <button
                      key={day.date}
                      onClick={() => handleDaySelect(day.date)}
                      className={[
                        'snap-start shrink-0 flex flex-col items-center justify-center px-4 py-3 min-w-[6rem] rounded-2xl',
                        'transition-all duration-150 relative focus-visible:outline-none focus-visible:ring-2',
                        isSel
                          ? 'text-white shadow-md scale-[1.04]'
                          : 'bg-white dark:bg-zinc-900/80 text-primary hover:scale-[1.02] hover:shadow-sm border border-zinc-200 dark:border-zinc-800',
                      ].join(' ')}
                      style={{ backgroundColor: isSel ? accentColor : undefined }}
                    >
                      <span className="text-xs font-semibold opacity-80">Day {day.dayNumber || idx + 1}</span>
                      <span className="text-base font-bold tracking-tight">{label}</span>
                    </button>
                  );
                })}
              </m.div>
            )}
          </AnimatePresence>

          {/* ── Sticky Progress Bar & Badges ─────────────────────────────── */}
          <div className="sticky top-16 z-30 pt-1 pb-2 bg-background/90 backdrop-blur-md">
            <div className="rounded-2xl p-4 bg-white dark:bg-zinc-900/90 border shadow-md transition-colors duration-500" style={{ borderColor: `${accentColor}20` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: accentColor }}>
                  <Flag className="w-3.5 h-3.5" />
                  Journey Progress
                </span>
                <span className="text-xs font-bold text-secondary">
                  {completedCount} / {totalSessions}
                </span>
              </div>
              
              {/* Gamified Segmented Progress Bar */}
              <div className="flex gap-1 h-2 w-full mb-3">
                {Array.from({ length: totalSessions || 1 }).map((_, i) => (
                  <div 
                    key={i} 
                    className="flex-1 rounded-full transition-all duration-300"
                    style={{ backgroundColor: i < completedCount ? accentColor : `${accentColor}20` }}
                  />
                ))}
              </div>
              
              <div className="flex items-center justify-between text-[11px] font-semibold text-secondary">
                <span className="flex items-center gap-1">
                  🏅 <span className="text-primary">{badge}</span>
                </span>
                {completedCount < totalSessions && (
                  <span>Next: {nextBadge}</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Gamified Timeline ────────────────────────────────────────── */}
          <div className="relative py-2 flex flex-col min-h-[40vh]">
            {loading ? (
              <div className="space-y-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0 mt-6 animate-pulse" />
                    <div className="flex-1 h-28 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : totalSessions === 0 ? (
              <div className="empty-state">
                {!isOrientation && plannerActive && inductionDays.length === 0 ? (
                  <>
                    <div className="empty-state-icon"><AlertCircle className="h-7 w-7 text-amber-500" /></div>
                    <div className="empty-state-title text-amber-500">Schedule unavailable</div>
                    <div className="empty-state-text">
                      Your room has been allocated but no sessions were found. Please contact administration.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="empty-state-icon"><CalendarDays className="h-7 w-7" /></div>
                    <div className="empty-state-title">Not Published Yet</div>
                    <div className="empty-state-text">
                      The {isOrientation ? "Orientation" : "Dikshaarambh"} schedule will be published soon.
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="relative z-10 w-full sm:w-[100%] md:w-full md:pl-0 sm:pl-[18px]">
                {currentSessions.map((s, idx) => {
                  const status = computedStatuses[idx];
                  const isLast = idx === totalSessions - 1;
                  const prevStatus = idx > 0 ? computedStatuses[idx - 1] : "completed";
                  const showNowLine = status === "live" && prevStatus === "completed";
                  const isLive = status === "live";

                  const tLabel = (s.sessionTitle || s.sessionName || s.title || "Session");
                  const isBreak = /lunch|break|dinner|snack/.test(tLabel.toLowerCase());
                  const emojiIcon = getSessionIcon(tLabel);
                  const FallbackIcon = getSessionFallbackIcon(tLabel);
                  
                  const reactKey = s.id || `${s.date}-${s.startTime}-${s.endTime}-${s.sessionName}-${s.school || s.schoolCode || ''}-${s.program || s.programme || ''}-${s.venueName}`;

                  return (
                    <div key={reactKey} className="relative w-full">
                      
                      {/* Current Time Line Indicator */}
                      {showNowLine && (
                        <div className="absolute -top-3 left-0 right-0 flex items-center z-20">
                          <div className="flex-1 border-t-2 border-dashed border-red-500/50" />
                          <div className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold tracking-widest shadow-sm">
                            NOW {formatTime(now.getHours() + ":" + now.getMinutes())}
                          </div>
                          <div className="flex-1 border-t-2 border-dashed border-red-500/50" />
                        </div>
                      )}

                      <div className="flex gap-4 mb-6">
                        {/* ── Left Timeline Column ── */}
                        <div className="flex flex-col items-center pt-6 shrink-0 w-5 relative ml-[18px] md:ml-0">
                          {/* Node */}
                          {status === 'completed' ? (
                            <m.div 
                              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.3 }}
                              className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center z-10 shadow-sm"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            </m.div>
                          ) : status === 'live' ? (
                            <div className="w-5 h-5 rounded-full z-10 flex items-center justify-center" style={{ backgroundColor: `${accentColor}30` }}>
                              <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: accentColor }} />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 bg-white dark:bg-zinc-900 z-10" style={{ borderColor: `${accentColor}40` }} />
                          )}

                          {/* Connector Line */}
                          {!isLast && (
                            <div className="absolute top-10 bottom-[-24px] w-[2px] rounded-full overflow-hidden" style={{ backgroundColor: `${accentColor}15` }}>
                              <m.div 
                                className="w-full h-full origin-top"
                                initial={{ scaleY: 0 }}
                                animate={{ scaleY: status === 'completed' ? 1 : 0 }}
                                transition={{ duration: 0.4 }}
                                style={{ backgroundColor: accentColor }}
                              />
                            </div>
                          )}
                        </div>

                        {/* ── Right Card Column ── */}
                        <div className="flex-1 w-full min-w-0" id={isLive ? "current-live-session" : undefined}>
                          <m.div
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-20px" }}
                            transition={{ duration: 0.4, delay: (idx % 5) * 0.06 }}
                            whileHover={{ y: -4, transition: { duration: 0.18 } }}
                            className={[
                              'rounded-2xl p-4 transition-all w-full border text-left',
                              status === 'completed' ? 'opacity-60 bg-white dark:bg-zinc-900/60 hover:opacity-100 border-zinc-200 dark:border-zinc-800' :
                              status === 'live' ? 'bg-white dark:bg-zinc-900 shadow-xl border-transparent ring-2 z-10' :
                              isBreak ? 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/30' :
                              'bg-white dark:bg-zinc-900/90 shadow-sm border-zinc-200/70 dark:border-zinc-800',
                            ].join(' ')}
                            style={status === 'live' ? { 
                              scale: 1.03, 
                              boxShadow: `0 10px 30px -10px ${accentColor}40`,
                              borderColor: `${accentColor}80`
                            } : {}}
                          >
                            
                            {/* Card Header */}
                            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                              <span className="text-[12px] font-bold font-mono bg-zinc-100 dark:bg-zinc-800/80 px-2 py-1 rounded-md text-secondary tracking-wide">
                                {formatTime(s.startTime || s.starts_at)} {s.endTime || s.ends_at ? `– ${formatTime(s.endTime || s.ends_at)}` : ''}
                              </span>
                              
                              {status === 'live' && (
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full animate-pulse text-white shadow-sm" style={{ backgroundColor: accentColor }}>
                                  Live Now
                                </span>
                              )}
                            </div>

                            {/* Title & Icon */}
                            <div className="flex items-start gap-3 mb-2">
                              {emojiIcon ? (
                                <span className="text-2xl mt-0.5">{emojiIcon}</span>
                              ) : (
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center mt-1" style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
                                  <FallbackIcon className="w-4 h-4" />
                                </div>
                              )}
                              <div>
                                <h3 className="text-base sm:text-lg font-bold text-primary leading-tight">{tLabel}</h3>
                                {isLive && (
                                  <p className="text-[11px] font-semibold mt-1" style={{ color: accentColor }}>
                                    {formatCountdown(s, true, now)}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Details Chips */}
                            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
                              {(s.venue || s.venueName) && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-zinc-50 dark:bg-zinc-800/50 text-secondary">
                                  📍 {(s.venue || s.venueName)} {s.building || s.block ? `· ${s.building || s.block}` : ''}
                                </span>
                              )}
                              {(s.speaker || s.faculty || s.coordinator) && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-zinc-50 dark:bg-zinc-800/50 text-secondary">
                                  👤 {s.speaker || s.faculty || s.coordinator}
                                </span>
                              )}
                            </div>

                          </m.div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Celebration */}
                {totalSessions > 0 && completedCount === totalSessions && (
                  <m.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: "spring", duration: 0.8 }}
                    className="mt-8 rounded-3xl p-8 text-center bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-900/20 dark:to-zinc-900 border border-emerald-100 dark:border-emerald-900/30 shadow-lg relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5" />
                    <div className="text-5xl mb-4 animate-bounce">🎉</div>
                    <h3 className="text-xl font-bold text-primary mb-2">Congratulations!</h3>
                    <p className="text-sm text-secondary font-medium max-w-[250px] mx-auto">
                      You completed today's {isOrientation ? "Orientation" : "Dikshaarambh"}. See you tomorrow!
                    </p>
                  </m.div>
                )}

              </div>
            )}
          </div>
        </m.div>
      </main>
      
      {/* Auto Scroll script injected via effect */}
      <AutoScrollToLive sessionsHash={currentSessions.map(s => s.id).join(',')} />
    </div>
  );
}

// ── Auto Scroll component ──
function AutoScrollToLive({ sessionsHash }: { sessionsHash: string }) {
  useEffect(() => {
    const el = document.getElementById("current-live-session");
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500); // Wait for animations
    }
  }, [sessionsHash]);
  return null;
}
