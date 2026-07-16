import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  User, Award, CalendarDays, Zap, ArrowRight, ShieldCheck, Bell, Check,
  Copy, TrendingUp, Percent, Trophy, Flame, Star, MapPin, Users, Clock,
  Wallet, ScanLine, ChevronRight,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { localDb, type LocalStudent } from "@/lib/local-db";
import { lookupStudent } from "@/lib/students.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/my-pass")({
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
  { id: "explorer", name: "Explorer", emoji: "🧭", color: "badge-icon-blue", desc: "Visit 3 campus zones", unlocked: false },
  { id: "early-bird", name: "Early Bird", emoji: "🌅", color: "badge-icon-amber", desc: "First scan of the day", unlocked: true },
  { id: "social", name: "Social Butterfly", emoji: "🦋", color: "badge-icon-purple", desc: "Join 3+ clubs", unlocked: false },
  { id: "perfect", name: "Perfect Week", emoji: "⭐", color: "badge-icon-gold", desc: "100% attendance for 5 days", unlocked: false },
  { id: "helper", name: "Helping Hand", emoji: "🤝", color: "badge-icon-emerald", desc: "Help a peer register", unlocked: false },
  { id: "champion", name: "Champion", emoji: "🏆", color: "badge-icon-rose", desc: "Top 10 leaderboard", unlocked: false },
];

/* ─── Activity Data (placeholder — connect to backend later) ─────── */
const ACTIVITY_PLACEHOLDER = [
  { text: "Scanned attendance for Day 1 Session 2", time: "Today, 10:30 AM", dot: "activity-dot-green" },
  { text: "Joined Tech Club", time: "Today, 9:15 AM", dot: "activity-dot-blue" },
  { text: "Earned Early Bird badge", time: "Today, 8:45 AM", dot: "activity-dot-amber" },
  { text: "Registered for Aarambh 2026", time: "Yesterday", dot: "activity-dot-purple" },
];

function MyPassPage() {
  const [profile, setProfile] = useState<LocalStudent | null>(null);
  const [livePoints, setLivePoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const tilt = useTilt(cardRef);

  useEffect(() => {
    const p = localDb.getStudentProfile();
    if (p) {
      setProfile(p);
      
      // Fetch live points from server
      lookupStudent({ data: { enrollment_no: p.enrollment_no } })
        .then((res: any) => {
          if (res.student) {
            setLivePoints(res.student.points || 0);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
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
            <h1 className="heading-xl">Student Wallet</h1>
            <p className="label-premium">Aarambh 2026 · K.R. Mangalam University</p>
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

          {/* ── Streak + Points Row ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 animate-slide-up stagger-3">
            {/* Attendance Streak */}
            <div className="streak-card">
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <div className="streak-value">3</div>
                  <div className="streak-label">Day Streak</div>
                </div>
                <div className="streak-fire">🔥</div>
              </div>
            </div>
            
            {/* Reward Points */}
            <div className="streak-card">
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <div className="streak-value">{livePoints !== null ? livePoints : "..."}</div>
                  <div className="streak-label">Points</div>
                </div>
                <div className="streak-fire">⭐</div>
              </div>
            </div>
          </div>

          {/* ── KPI Stats Grid ──────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "—", label: "Attendance", icon: Percent, variant: "kpi-emerald" },
              { value: "—", label: "Events Done", icon: Zap, variant: "kpi-purple" },
              { value: "TBD", label: "Global Rank", icon: Trophy, variant: "kpi-blue" },
              { value: "TBD", label: "Dept Rank", icon: TrendingUp, variant: "kpi-yellow" },
            ].map((kpi, i) => (
              <div
                key={kpi.label}
                className={`kpi-card ${kpi.variant} animate-slide-up stagger-${i + 3}`}
              >
                <div className="kpi-icon">
                  <kpi.icon className="w-5 h-5" />
                </div>
                <div className="kpi-value">{kpi.value}</div>
                <div className="kpi-label">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* ── Achievement Badges ──────────────────────────────── */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-1">
              <p className="label-premium">Achievements</p>
              <p className="text-[10px] font-bold text-[#8a4a22]/40 uppercase tracking-wider">
                {BADGES.filter(b => b.unlocked).length}/{BADGES.length}
              </p>
            </div>
            
            <div className="grid grid-cols-3 gap-2.5">
              {BADGES.map((badge) => (
                <div
                  key={badge.id}
                  className={`badge-card ${badge.unlocked ? '' : 'locked'}`}
                >
                  <div className={`badge-icon ${badge.color}`}>
                    {badge.emoji}
                  </div>
                  <div className="badge-name">{badge.name}</div>
                  <div className="badge-desc">{badge.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Rankings ────────────────────────────────────────── */}
          <div className="space-y-2.5 pt-2">
            <p className="label-premium px-1">Rankings</p>
            {[
              { label: "Global Rank", value: "TBD", icon: "🌍" },
              { label: "Department Rank", value: "TBD", icon: "🏛️" },
              { label: "Semester Rank", value: "TBD", icon: "📚" },
            ].map((rank) => (
              <div key={rank.label} className="rank-card">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{rank.icon}</span>
                  <div>
                    <div className="rank-label">{rank.label}</div>
                  </div>
                </div>
                <div className="rank-value">{rank.value}</div>
              </div>
            ))}
          </div>

          {/* ── Wallet Activity ─────────────────────────────────── */}
          <div className="space-y-2.5 pt-2">
            <p className="label-premium px-1">Recent Activity</p>
            <div className="glass-premium !rounded-2xl !p-4">
              <div className="relative z-10">
                {ACTIVITY_PLACEHOLDER.map((item, i) => (
                  <div key={i} className="activity-item">
                    <div className={`activity-dot ${item.dot}`} />
                    <div>
                      <div className="activity-text">{item.text}</div>
                      <div className="activity-time">{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Quick Actions ───────────────────────────────────── */}
          <div className="space-y-2.5 pt-2">
            <p className="label-premium px-1">Quick Actions</p>
            
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
