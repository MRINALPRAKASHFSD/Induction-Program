import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays, Zap, ArrowRight, ShieldCheck, Bell, Check,
  Copy, TrendingUp, Percent, Trophy, Star, Users, Clock,
  Wallet, ScanLine, Compass, Sunrise, Handshake, Globe, Landmark, Library,
  MessageCircle, Lock, CheckCircle2, History, BookOpen, MapPin, ChevronRight
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { localDb, type LocalStudent } from "@/lib/local-db";
import { lookupStudent } from "@/lib/students.functions";
import { listClubs, listClubRegistrations } from "@/lib/admin.functions";
import { CLUB_REGISTRATION_OPEN_DATE, isClubRegistrationOpen } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { auth } from "@/lib/firebase/config";

// ── Planner API helper ────────────────────────────────────────────────────────
async function fetchPlannerDashboard() {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/planner-student-dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Time helpers ──────────────────────────────────────────────────────────────
function timeToMin(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function nowISTMinutes(): number {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.getHours() * 60 + ist.getMinutes();
}
function formatTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2,'0')} ${period}`;
}
function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });
}

export const Route = createLazyFileRoute("/my-pass")({
  // @ts-expect-error - Route type options do not include head in this version
  head: () => ({
    meta: [
      { title: "Student Wallet · KRMU Induction" },
      { name: "description", content: "Your KRMU Induction Student Wallet — ID, attendance, rewards, and achievements." },
    ],
  }),
  component: MyPassPage,
});

/* ─── Mouse Tilt Hook (GPU-only, no layout thrash) ───────────────── */
function useTilt(ref: React.RefObject<HTMLDivElement | null>) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateX = (0.5 - y) * 8;
    const rotateY = (x - 0.5) * 8;
    setStyle({
      transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`,
      transition: 'transform 0.1s ease-out',
    });
  }, [ref]);

  const onLeave = useCallback(() => {
    setStyle({
      transform: 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
      transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
  }, []);

  return { style, onMove, onLeave };
}

/* ─── Badge Data (UI shells — connect to backend later) ──────────── */
const BADGES = [
  { id: "explorer", name: "Explorer", icon: Compass, color: "text-blue-500", bg: "bg-blue-500/10", desc: "Visit 3 campus zones", unlocked: false },
  { id: "early-bird", name: "Early Bird", icon: Sunrise, color: "text-amber-500", bg: "bg-amber-500/10", desc: "First scan of the day", unlocked: true },
  { id: "social", name: "Social Butterfly", icon: Users, color: "text-purple-500", bg: "bg-purple-500/10", desc: "Join 3+ clubs", unlocked: false },
  { id: "perfect", name: "Perfect Week", icon: Star, color: "text-yellow-500", bg: "bg-yellow-500/10", desc: "100% attendance", unlocked: false },
  { id: "helper", name: "Helping Hand", icon: Handshake, color: "text-emerald-500", bg: "bg-emerald-500/10", desc: "Help a peer register", unlocked: false },
  { id: "champion", name: "Champion", icon: Trophy, color: "text-rose-500", bg: "bg-rose-500/10", desc: "Top 10 leaderboard", unlocked: false },
];

function MyPassPage() {
  const [profile, setProfile] = useState<LocalStudent | null>(null);
  const [livePoints, setLivePoints] = useState<number | null>(null);
  const [liveRoomAssignment, setLiveRoomAssignment] = useState<any | null>(null);
  const [liveStudent, setLiveStudent] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [clubs, setClubs] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [planner, setPlanner] = useState<any | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(true);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const tilt = useTilt(cardRef);

  useEffect(() => {
    const p = localDb.getStudentProfile();
    const savedStudentId = localStorage.getItem("krmu_verified_student_id");
    const enrollmentNo = p?.enrollment_no || savedStudentId;

    if (enrollmentNo) {
      if (!p) {
        lookupStudent({ data: { enrollment_no: enrollmentNo } })
          .then((res: any) => {
            if (res?.student) {
              setProfile({
                id: res.student.id,
                full_name: res.student.name || "Student",
                enrollment_no: res.student.enrollment_no || enrollmentNo,
                course: res.student.course || "KRMU",
                branch: res.student.department || "General",
                semester: res.student.semester || "1st",
                year: res.student.year || 1,
              } as any);
            }
          })
          .catch(console.error);
      } else {
        setProfile(p);
      }

      // Fetch live points + room assignment from server
      lookupStudent({ data: { enrollment_no: enrollmentNo } })
        .then((res: any) => {
          if (res.student) {
            setLiveStudent(res.student);
            setLivePoints(res.student.points || 0);
            // Set the full room assignment object
            const ra = res.student.roomAssignment;
            if (ra) {
              setLiveRoomAssignment(ra);
            } else if (res.student.room_no || p?.room_no) {
              // Fallback for older records
              setLiveRoomAssignment({
                allocationStatus: 'allocated',
                roomNumber: res.student.room_no || p?.room_no,
                block: res.student.block || (p as any)?.block || '?',
                capacity: '?'
              });
            } else {
              setLiveRoomAssignment({ allocationStatus: 'pending' });
            }
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));

      // Fetch clubs and registrations
      Promise.all([
        listClubs().catch(() => ({ clubs: [] })),
        listClubRegistrations().catch(() => []),
      ]).then(([clubsRes, allRegs]: [any, any[]]) => {
        const allClubs = Array.isArray(clubsRes?.clubs) ? clubsRes.clubs : [];
        setClubs(allClubs);
        if (enrollmentNo && Array.isArray(allRegs)) {
          const myRegs = allRegs.filter(
            (r: any) =>
              r.enrollment_no === enrollmentNo ||
              r.student_id === enrollmentNo ||
              (liveStudent && r.student_id === liveStudent.id)
          );
          setRegistrations(myRegs);
        }
      });
    } else {
      setLoading(false);
    }

    // Fetch planner dashboard (independent of student lookup)
    fetchPlannerDashboard()
      .then(data => setPlanner(data))
      .catch(() => setPlanner(null))
      .finally(() => setPlannerLoading(false));
  }, []);

  const copyEnrollment = useCallback(() => {
    if (!profile?.enrollment_no) return;
    navigator.clipboard.writeText(profile.enrollment_no).then(() => {
      setCopied(true);
      toast.success("Student ID copied!");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error("Failed to copy");
    });
  }, [profile]);

  const userInitial = profile?.full_name?.[0]?.toUpperCase() || "?";

  /* ── Not Registered State ─────────────────────────────────────── */
  if (!profile && !loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        
        <div className="ambient-bg" aria-hidden="true">
          <div className="ambient-blob ambient-blob-1" />
          <div className="ambient-blob ambient-blob-2" />
        </div>

        <main className="container mx-auto max-w-md px-4 py-16 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="empty-state">
              <div className="empty-state-icon">
                <Wallet className="h-7 w-7" />
              </div>
              <div className="empty-state-title">Student Wallet</div>
              <div className="empty-state-text">
                Register to unlock your Digital Student Wallet — your ID, achievements, attendance, and rewards all in one place.
              </div>
              <Button asChild variant="liquidGlassMaroon" size="lg" className="rounded-full px-8">
                <Link to="/register">Register Now</Link>
              </Button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  /* ── Loading State ────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="skeleton-glass skeleton-line-lg w-40 mx-auto" />
            <div className="skeleton-glass skeleton-line w-28 mx-auto" />
          </div>
          <div className="skeleton-glass skeleton-card" style={{ minHeight: '220px' }} />
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="skeleton-glass skeleton-card" style={{ minHeight: '100px' }} />)}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <SiteHeader />
      
      {/* Ambient Background */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
        <div className="ambient-blob ambient-blob-3" />
        <div className="watermark">AARAMBH 2026</div>
      </div>

      <main className="relative container mx-auto max-w-md px-4 py-8">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="space-y-8"
        >
          {/* Page header */}
          <div className="text-center space-y-1.5 animate-slide-up stagger-1">
            <h1 className="text-hero-heading text-primary font-bold">Student Wallet</h1>
            <p className="text-label text-secondary uppercase font-bold tracking-wider mt-0">Aarambh 2026 · K.R. Mangalam University</p>
          </div>

          {/* ── Apple Wallet Card ────────────────────────────────── */}
          <div
            ref={cardRef}
            className="wallet-card animate-slide-up stagger-2"
            style={tilt.style}
            onMouseMove={tilt.onMove}
            onMouseLeave={tilt.onLeave}
          >
            {/* Top row: Avatar + Name + Verified */}
            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="wallet-avatar relative">
                  {userInitial}
                  <span className="wallet-verified">
                    <Check strokeWidth={3} />
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-[#2c1208] tracking-tight truncate">
                    {profile?.full_name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="font-mono text-xs font-semibold text-[#8a4a22]/80 flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {profile?.enrollment_no}
                    </p>
                    <button
                      className="copy-btn"
                      onClick={copyEnrollment}
                      aria-label="Copy student ID"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
              {/* University mark */}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <div className="text-[0.5rem] font-bold text-[#8a4a22]/40 uppercase tracking-[0.2em]">KRMU</div>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#8a4a22]/8 to-[#8a4a22]/4 flex items-center justify-center">
                  <span className="text-[#8a4a22]/60 text-xs font-bold">A</span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="my-5 h-px bg-gradient-to-r from-transparent via-[#8a4a22]/10 to-transparent relative z-10" />

            {/* Info fields */}
            <div className="space-y-3 relative z-10">
              <div className="wallet-field">
                <span className="wallet-field-label">Program</span>
                <span className="wallet-field-value">{profile?.branch}</span>
              </div>
              <div className="wallet-field">
                <span className="wallet-field-label">Semester</span>
                <span className="wallet-field-value">{profile?.semester}</span>
              </div>
              {profile?.room_no && (
                <div className="wallet-field">
                  <span className="wallet-field-label">Room</span>
                  <span className="wallet-field-value">{profile.room_no}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Planner Room Card (sticky) + Points Row ────────────── */}
          <div className="grid grid-cols-2 gap-3 animate-slide-up stagger-3">
            {/* Room card — shows planner room if active, else legacy room */}
            {(() => {
              const plannerRoom = planner?.plannerActive && planner?.room;
              const legacyRoom  = liveRoomAssignment?.allocationStatus === 'allocated' && liveRoomAssignment?.roomNumber;
              return (
                <div className="glass-premium-v2 rounded-2xl p-4 flex flex-col justify-between items-start relative overflow-hidden group hover:scale-[1.02] transition-transform">
                  <div className="w-8 h-8 rounded-full bg-[#8a4a22]/10 flex items-center justify-center text-[#8a4a22] mb-2">
                    <Landmark className="w-4 h-4" />
                  </div>
                  {plannerRoom ? (
                    <>
                      <div className="text-4xl text-primary font-bold tracking-tight">{plannerRoom.roomNumber}</div>
                      <div className="text-label text-tertiary mt-1">
                        Block {plannerRoom.block}{plannerRoom.floor ? ` · ${plannerRoom.floor}` : ''}
                      </div>
                      <div className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full mt-2 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Induction Room
                      </div>
                    </>
                  ) : legacyRoom ? (
                    <>
                      <div className="text-4xl text-primary font-bold tracking-tight">{liveRoomAssignment.roomNumber}</div>
                      <div className="text-label text-tertiary mt-1">Block {liveRoomAssignment.block}</div>
                    </>
                  ) : plannerLoading ? (
                    <>
                      <div className="h-8 w-16 bg-black/5 rounded-lg animate-pulse mb-1" />
                      <div className="h-3 w-20 bg-black/5 rounded animate-pulse" />
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-primary font-bold leading-tight mt-1 mb-1">Allocation<br/>Pending</div>
                      <div className="text-label text-tertiary">Check back later</div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Reward Points */}
            <div className="glass-premium-v2 rounded-2xl p-4 flex flex-col justify-between items-start relative overflow-hidden group hover:scale-[1.02] transition-transform">
              <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-600 mb-2">
                <Star className="w-4 h-4" />
              </div>
              <div className="text-hero-heading text-primary">{livePoints !== null ? livePoints : "..."}</div>
              <div className="text-label text-tertiary">Points</div>
            </div>
          </div>

          {/* ── Your Induction Journey ───────────────────────────────── */}
          {planner?.plannerActive && (
            <div className="space-y-3 pt-2 animate-slide-up stagger-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-label text-secondary uppercase font-bold tracking-wider mt-0">Your Induction Journey</p>
                <Link to="/schedule" className="text-[10px] font-bold text-[#8a4a22]/60 hover:text-[#8a4a22] flex items-center gap-1 uppercase tracking-wider">
                  Full Schedule <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Today's Sessions */}
              {planner.today?.sessions?.length > 0 ? (
                <div className="glass-premium-v2 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-black/5 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-[#8a4a22]" />
                    <span className="text-xs font-bold text-primary">Today · {formatDate(planner.today.date)}</span>
                  </div>
                  <div className="divide-y divide-black/5">
                    {planner.today.sessions.slice(0, 4).map((s: any, i: number) => {
                      const nowMin   = nowISTMinutes();
                      const startMin = timeToMin(s.startTime);
                      const endMin   = timeToMin(s.endTime);
                      const ongoing  = nowMin >= startMin && nowMin < endMin;
                      const past     = nowMin >= endMin;
                      return (
                        <div key={i} className={`px-4 py-3 flex items-start gap-3 ${ongoing ? 'bg-emerald-500/5' : ''}`}>
                          <div className="flex-shrink-0 w-1 mt-1 rounded-full h-10"
                            style={{ background: ongoing ? '#10b981' : past ? '#d1d5db' : '#8a4a22' }} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-primary truncate">{s.sessionName}</div>
                            <div className="text-[10px] text-tertiary mt-0.5">
                              {formatTime(s.startTime)} – {formatTime(s.endTime)}
                              {s.venueName && ` · ${s.venueName}`}
                            </div>
                          </div>
                          {ongoing && (
                            <span className="shrink-0 text-[9px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">LIVE</span>
                          )}
                        </div>
                      );
                    })}
                    {planner.today.sessions.length > 4 && (
                      <div className="px-4 py-2 text-[10px] text-tertiary text-center">
                        +{planner.today.sessions.length - 4} more sessions today
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="glass-premium-v2 rounded-2xl p-4 text-center">
                  <CalendarDays className="w-6 h-6 mx-auto mb-2 text-tertiary opacity-50" />
                  <p className="text-xs text-tertiary">No sessions scheduled for today</p>
                </div>
              )}

              {/* Next Session */}
              {planner.nextSession && (
                <div className="glass-premium-v2 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#8a4a22]/10 flex items-center justify-center text-[#8a4a22] shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-0.5">Next Up</div>
                    <div className="text-sm font-bold text-primary truncate">{planner.nextSession.sessionName}</div>
                    <div className="text-[11px] text-tertiary">
                      {formatDate(planner.nextSession.date)} · {formatTime(planner.nextSession.startTime)}
                      {planner.nextSession.venueName && ` · ${planner.nextSession.venueName}`}
                    </div>
                  </div>
                </div>
              )}

              {/* Documentation Day */}
              {planner.documentationDay && (
                <div className="glass-premium-v2 rounded-2xl p-4 flex items-center gap-3 border border-amber-400/30">
                  <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Documentation Day</div>
                    <div className="text-sm font-bold text-primary">{formatDate(planner.documentationDay.date)}</div>
                    <div className="text-[11px] text-tertiary">Bring all required documents</div>
                  </div>
                </div>
              )}

              {/* 5-Day Schedule Summary */}
              {planner.scheduleSummary?.length > 0 && (
                <div className="glass-premium-v2 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-black/5">
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">5-Day Overview</p>
                  </div>
                  <div className="grid grid-cols-5 divide-x divide-black/5">
                    {planner.scheduleSummary.map((day: any) => (
                      <Link
                        key={day.day}
                        to="/schedule"
                        className="flex flex-col items-center py-3 gap-0.5 hover:bg-black/[0.02] transition-colors"
                      >
                        <span className="text-[10px] font-bold text-tertiary uppercase">D{day.day}</span>
                        <span className="text-sm font-bold text-primary">{day.sessions}</span>
                        <span className="text-[9px] text-tertiary">sessions</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── KPI Stats Grid ──────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: liveStudent?.attendance_count || 0, label: "Attendance", icon: Percent, color: "text-emerald-600", bg: "bg-emerald-500/10" },
              { value: liveStudent?.events_count || 0, label: "Events Done", icon: Zap, color: "text-purple-600", bg: "bg-purple-500/10" },
              { value: liveStudent?.global_rank || "Unranked", label: "Global Rank", icon: Trophy, color: "text-blue-600", bg: "bg-blue-500/10" },
              { value: liveStudent?.dept_rank || "Unranked", label: "Dept Rank", icon: TrendingUp, color: "text-yellow-600", bg: "bg-yellow-500/10" },
            ].map((kpi, i) => (
              <div
                key={kpi.label}
                className={`glass-premium-v2 p-3.5 rounded-2xl flex flex-col items-start hover:scale-[1.02] transition-transform animate-slide-up stagger-${i + 3}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center mb-2 ${kpi.bg} ${kpi.color}`}>
                  <kpi.icon className="w-3.5 h-3.5" />
                </div>
                <div className="text-card-title text-primary font-bold">{kpi.value}</div>
                <div className="text-caption text-secondary font-medium">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* ── Achievement Badges ──────────────────────────────── */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-label text-secondary uppercase font-bold tracking-wider mt-0">Achievements</p>
              <p className="text-[10px] font-bold text-[#8a4a22]/40 uppercase tracking-wider">
                {BADGES.filter(b => liveStudent?.badges?.includes(b.id) || b.unlocked).length}/{BADGES.length}
              </p>
            </div>
            
            <div className="grid grid-cols-3 gap-2.5">
              {BADGES.map((badge) => {
                const isUnlocked = liveStudent?.badges?.includes(badge.id) || badge.unlocked;
                return (
                  <div
                    key={badge.id}
                    className={`glass-premium-v2 p-3 rounded-2xl flex flex-col items-center text-center transition-all ${isUnlocked ? 'hover:scale-[1.04]' : 'opacity-60 grayscale'}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${isUnlocked ? badge.bg : 'bg-black/5 dark:bg-white/5'} ${isUnlocked ? badge.color : 'text-tertiary'}`}>
                      <badge.icon className="w-5 h-5" />
                    </div>
                    <div className="text-[11px] font-bold text-primary leading-tight mb-0.5">{badge.name}</div>
                    <div className="text-[9px] text-tertiary leading-tight line-clamp-2">{badge.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── My Clubs & Societies (Max 2 Selections) ─────────────── */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-label text-secondary uppercase font-bold tracking-wider mt-0">My Clubs & Societies</p>
              <p className="text-[10px] font-bold text-[#8a4a22]/40 uppercase tracking-wider">
                {registrations.filter(r => r.status !== 'cancelled').length}/2 Selections
              </p>
            </div>

            {registrations.filter(r => r.status !== 'cancelled').length === 0 ? (
              <div className="glass-premium-v2 p-5 rounded-2xl text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-[#8a4a22]/10 flex items-center justify-center text-[#8a4a22] mx-auto">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-primary">No Active Selections</h3>
                  <p className="text-xs text-tertiary mt-0.5">
                    Explore and register for up to 2 student clubs & societies.
                  </p>
                </div>
                <Button asChild variant="liquidGlassMaroon" size="sm" className="rounded-full px-5 text-xs">
                  <Link to="/clubs">Explore Clubs</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {registrations.filter(r => r.status !== 'cancelled').slice(0, 2).map((reg) => {
                  const club = clubs.find((c: any) => c.id === reg.club_id) || {
                    id: reg.club_id,
                    title: reg.club_name || "Student Club",
                    category: "General",
                    capacity: 50,
                    registeredCount: 0,
                    whatsapp_group_link: "",
                  };
                  const isOpen = isClubRegistrationOpen();
                  const remainingSlots = Math.max(0, (club.capacity || 50) - (club.registeredCount || 0));

                  return (
                    <div
                      key={reg.id || reg.club_id}
                      className="glass-premium-v2 p-4 rounded-2xl space-y-3 border border-white/40 dark:border-white/10"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-md bg-[#8a4a22]/10 text-[#8a4a22] text-[10px] font-semibold uppercase tracking-wider mb-1">
                            {club.category || "Society"}
                          </span>
                          <h4 className="text-sm font-bold text-primary">{club.title}</h4>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          Active
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/5 text-xs text-secondary">
                        <span>Remaining Slots: <strong className="text-primary">{remainingSlots}</strong></span>
                        {isOpen ? (
                          <a
                            href={club.whatsapp_group_link || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Join WhatsApp Group
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground font-semibold text-xs cursor-not-allowed">
                            <Lock className="w-3.5 h-3.5" />
                            Available from Aug 22
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Club Registration History ────────────────────────────── */}
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-label text-secondary uppercase font-bold tracking-wider mt-0">Registration History</p>
              <History className="w-4 h-4 text-tertiary" />
            </div>

            {registrations.length === 0 ? (
              <div className="glass-premium-v2 p-4 rounded-2xl text-center text-xs text-tertiary">
                No club registration records found.
              </div>
            ) : (
              <div className="glass-premium-v2 rounded-2xl overflow-hidden divide-y divide-black/5 dark:divide-white/5">
                {registrations.map((reg, idx) => {
                  const club = clubs.find((c: any) => c.id === reg.club_id);
                  const status = (reg.status || "active").toLowerCase();
                  const badgeColor =
                    status === "cancelled"
                      ? "bg-rose-500/10 text-rose-600"
                      : status === "waitlisted"
                      ? "bg-amber-500/10 text-amber-600"
                      : status === "completed"
                      ? "bg-blue-500/10 text-blue-600"
                      : "bg-emerald-500/10 text-emerald-600";

                  const statusLabel =
                    status === "cancelled"
                      ? "Cancelled"
                      : status === "waitlisted"
                      ? "Waitlisted"
                      : status === "completed"
                      ? "Completed"
                      : "Active";

                  return (
                    <div key={reg.id || idx} className="p-3.5 flex items-center justify-between hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-primary truncate">
                          {club?.title || reg.club_name || "Student Club"}
                        </div>
                        <div className="text-[10px] text-tertiary mt-0.5">
                          {reg.created_at
                            ? new Date(reg.created_at).toLocaleDateString()
                            : "Registered"}
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Rankings ────────────────────────────────────────── */}
          <div className="space-y-2.5 pt-2">
            <p className="text-label text-tertiary px-1">Rankings</p>
            {[
              { label: "Global Rank", value: liveStudent?.global_rank || "Unranked", icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Department Rank", value: liveStudent?.dept_rank || "Unranked", icon: Landmark, color: "text-rose-500", bg: "bg-rose-500/10" },
              { label: "Semester Rank", value: liveStudent?.semester_rank || "Unranked", icon: Library, color: "text-purple-500", bg: "bg-purple-500/10" },
            ].map((rank) => (
              <div key={rank.label} className="glass-premium-v2 p-4 rounded-2xl flex items-center justify-between hover:scale-[1.01] transition-transform">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${rank.bg} ${rank.color}`}>
                    <rank.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-primary">{rank.label}</div>
                  </div>
                </div>
                <div className="text-xs font-semibold text-tertiary text-right max-w-[40%] leading-tight">{rank.value}</div>
              </div>
            ))}
          </div>

          {/* ── Quick Actions ───────────────────────────────────── */}
          <div className="space-y-2.5 pt-2">
            <p className="text-label text-secondary uppercase font-bold tracking-wider mt-0 px-1">Quick Actions</p>
            
            {[
              { to: "/attendance", icon: ScanLine, title: "Scan Attendance", subtitle: "Lodge your session scan" },
              { to: "/schedule", icon: CalendarDays, title: "My Schedule", subtitle: "View upcoming sessions" },
              { to: "/clubs", icon: Users, title: "Explore Clubs", subtitle: "Join your community" },
              { to: "/announcements", icon: Bell, title: "Announcements", subtitle: "Latest updates" },
            ].map((action, i) => (
              <Link
                key={action.to}
                to={action.to}
                className={`action-card animate-slide-up stagger-${i + 3}`}
              >
                <div className="action-card-icon">
                  <action.icon className="w-5 h-5" />
                </div>
                <div className="action-card-content">
                  <div className="action-card-title">{action.title}</div>
                  <div className="action-card-subtitle">{action.subtitle}</div>
                </div>
                <ArrowRight className="w-4 h-4 action-card-arrow" />
              </Link>
            ))}
          </div>

        </motion.div>
      </main>
    </div>
  );
}
