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

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { IdentityPanel } from "@/components/dashboard/identity-panel";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { ScheduleTimeline } from "@/components/dashboard/schedule-timeline";
import { QuickStatus } from "@/components/dashboard/quick-status";
import { AttendanceCard } from "@/components/dashboard/attendance-card";
import { RoomCard } from "@/components/dashboard/room-card";
import { InductionProgress } from "@/components/dashboard/induction-progress";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { LayoutDashboard } from "lucide-react";


// ── Planner API helper ────────────────────────────────────────────────────────
async function fetchPlannerDashboard() {
  const user = await new Promise<any>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      unsubscribe();
      resolve(u);
    });
  });
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/event-schedule?type=orientation', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    
    if (!data.plannerActive) return null;

    // Use current date for "today"
    const now = new Date();
    // Assuming browser local time is close enough, or we just format to YYYY-MM-DD
    const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    let todaySessions = (data.sessions || []).filter((s: any) => s.date === todayStr);
    
    todaySessions = todaySessions.map((s: any) => {
      const start = timeToMin(s.startTime);
      const end = timeToMin(s.endTime);
      let status = 'upcoming';
      if (nowMin >= start && nowMin < end) status = 'current';
      else if (nowMin >= end) status = 'past';
      
      return {
        id: s.id || (s.sessionTitle + s.startTime),
        startTime: s.startTime,
        sessionName: s.sessionTitle,
        venueName: s.venue,
        status
      };
    });
    
    todaySessions.sort((a: any, b: any) => timeToMin(a.startTime) - timeToMin(b.startTime));
    const nextSession = todaySessions.find((s: any) => s.status === 'upcoming' || s.status === 'current');

    return {
      plannerActive: true,
      today: {
        date: todayStr,
        sessions: todaySessions
      },
      nextSession: nextSession || null
    };
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
      { title: "Student Dashboard · KRMU Induction" },
      { name: "description", content: "Your KRMU Induction Student Dashboard — ID, attendance, rewards, and achievements." },
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
            // Check for flat room properties first (newer schema) or nested (older schema)
            const ra = res.student.roomAssignment;
            if (res.student.roomNumber && res.student.allocationStatus) {
              setLiveRoomAssignment({
                allocationStatus: res.student.allocationStatus,
                roomNumber: res.student.roomNumber,
                block: res.student.block || '?',
                capacity: res.student.capacity || '?',
                plannerId: res.student.plannerId,
              });
            } else if (ra) {
              setLiveRoomAssignment(ra);
            } else if (res.student.room_no || p?.room_no) {
              // Fallback for older records
              setLiveRoomAssignment({
                allocationStatus: 'ALLOCATED',
                roomNumber: res.student.room_no || p?.room_no,
                block: res.student.block || (p as any)?.block || '?',
                capacity: res.student.capacity || '?'
              });
            } else {
              setLiveRoomAssignment({ allocationStatus: 'PENDING' });
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
      <DashboardShell>
        <SiteHeader />
        
        <main className="container mx-auto max-w-md px-4 py-16 text-center relative flex-1 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="empty-state bg-white/50 dark:bg-black/50 p-8 rounded-[var(--dashboard-radius)] backdrop-blur-[var(--dashboard-glass-blur)] border border-black/5 dark:border-white/5 shadow-[var(--dashboard-shadow)]">
              <div className="w-16 h-16 rounded-2xl bg-[#8a4a22]/10 text-[#8a4a22] flex items-center justify-center mx-auto mb-6">
                <LayoutDashboard className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-3">Student Dashboard</h2>
              <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
                Register to unlock your Digital Student Dashboard — your ID, achievements, attendance, and schedule all in one place.
              </p>
              <Button asChild className="bg-[#8a4a22] hover:bg-[#6c3a1b] text-white rounded-xl px-8 h-12 font-semibold">
                <Link to="/register">Register Now</Link>
              </Button>
            </div>
          </motion.div>
        </main>
      </DashboardShell>
    );
  }

  /* ── Loading State ────────────────────────────────────────────── */
  if (loading) {
    return (
      <DashboardShell>
        <SiteHeader />
        <main className="container mx-auto max-w-4xl px-4 py-8 space-y-6 flex-1 flex flex-col items-center justify-center">
          <div className="text-center space-y-2 mb-8 animate-pulse">
            <div className="h-10 w-48 bg-black/10 dark:bg-white/10 rounded-full mx-auto" />
            <div className="h-4 w-32 bg-black/5 dark:bg-white/5 rounded-full mx-auto" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            <div className="h-64 bg-black/5 dark:bg-white/5 rounded-[var(--dashboard-radius)] md:col-span-2 animate-pulse" />
            <div className="h-64 bg-black/5 dark:bg-white/5 rounded-[var(--dashboard-radius)] md:col-span-1 animate-pulse" />
          </div>
        </main>
      </DashboardShell>
    );
  }

  return (
    <>
      <SiteHeader />
      <DashboardShell>
        <DashboardHero profile={profile} plannerReady={!!planner?.plannerActive} />
        <AnnouncementBanner />
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--dashboard-gap)]">
          {/* Main Content Column (Left - 2/3) */}
          <div className="lg:col-span-2 flex flex-col gap-[var(--dashboard-gap)]">
            <IdentityPanel 
              profile={profile} 
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--dashboard-gap)]">
              <ScheduleTimeline planner={planner} isLoading={plannerLoading} />
              
              <div className="flex flex-col gap-[var(--dashboard-gap)]">
                <RoomCard 
                  roomAssignment={liveRoomAssignment} 
                  plannerRoom={planner?.plannerActive && planner?.room ? planner.room : null} 
                  isLoading={plannerLoading} 
                />
                <AttendanceCard 
                  points={livePoints} 
                  attendanceCount={liveStudent?.attendance_count || 0} 
                />
              </div>
            </div>

            {/* My Clubs & Societies */}
            <div className="space-y-3 pt-4">
              <div className="flex items-center justify-between px-1">
                <p className="text-sm text-muted-foreground uppercase font-bold tracking-wider mt-0">My Clubs & Societies</p>
                <p className="text-[10px] font-bold text-[#8a4a22]/40 uppercase tracking-wider">
                  {registrations.filter(r => r.status !== 'cancelled').length}/2 Selections
                </p>
              </div>

              {registrations.filter(r => r.status !== 'cancelled').length === 0 ? (
                <div className="rounded-[var(--dashboard-radius)] p-6 bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-[#8a4a22]/10 flex items-center justify-center text-[#8a4a22] mx-auto">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-primary">No Active Selections</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Explore and register for up to 2 student clubs & societies.
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="rounded-full px-5 text-xs">
                    <Link to="/clubs">Explore Clubs</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--dashboard-gap)]">
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
                        className="rounded-2xl p-4 bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] space-y-3"
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

                        <div className="flex flex-col gap-2 pt-2 border-t border-black/5 dark:border-white/5">
                          <span className="text-xs text-muted-foreground">Remaining Slots: <strong className="text-foreground">{remainingSlots}</strong></span>
                          {isOpen ? (
                            <a
                              href={club.whatsapp_group_link || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors w-full"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              Join WhatsApp Group
                            </a>
                          ) : (
                            <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-muted-foreground font-semibold text-xs cursor-not-allowed w-full">
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

            {/* Registration History */}
            {registrations.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm text-muted-foreground uppercase font-bold tracking-wider mt-0">Registration History</p>
                  <History className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="rounded-[var(--dashboard-radius)] overflow-hidden bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] divide-y divide-black/5 dark:divide-white/5">
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
                    const statusLabel = status === "cancelled" ? "Cancelled" : status === "waitlisted" ? "Waitlisted" : status === "completed" ? "Completed" : "Active";
                    return (
                      <div key={reg.id || idx} className="p-3.5 flex items-center justify-between hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-foreground truncate">
                            {club?.title || reg.club_name || "Student Club"}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
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
              </div>
            )}
          </div>

          {/* Sidebar Column (Right - 1/3) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:flex lg:flex-col gap-[var(--dashboard-gap)]">
            <QuickStatus profile={profile} />
            <QuickActions />
            <InductionProgress />
            
            {/* Rankings */}
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground uppercase font-bold tracking-wider px-1">Rankings</p>
              <div className="flex flex-col gap-2">
                {[
                  { label: "Global Rank", value: liveStudent?.global_rank || "Unranked", icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10" },
                  { label: "Department Rank", value: liveStudent?.dept_rank || "Unranked", icon: Landmark, color: "text-rose-500", bg: "bg-rose-500/10" },
                  { label: "Semester Rank", value: liveStudent?.semester_rank || "Unranked", icon: Library, color: "text-purple-500", bg: "bg-purple-500/10" },
                ].map((rank) => (
                  <div key={rank.label} className="rounded-2xl p-4 bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] flex items-center justify-between hover:scale-[1.01] transition-transform">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${rank.bg} ${rank.color}`}>
                        <rank.icon className="w-4 h-4" />
                      </div>
                      <div className="text-sm font-bold text-foreground">{rank.label}</div>
                    </div>
                    <div className="text-xs font-semibold text-muted-foreground text-right max-w-[40%] leading-tight">{rank.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardShell>
    </>
  );
}
