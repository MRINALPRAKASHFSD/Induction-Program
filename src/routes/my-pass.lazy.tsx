import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  User, Award, CalendarDays, Zap, ArrowRight, ShieldCheck, Bell, Check,
  Copy, TrendingUp, Percent, Trophy, Flame, Star, MapPin, Users, Clock,
  Wallet, ScanLine, ChevronRight, Compass, Sunrise, Handshake, Globe, Landmark, Library
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { localDb, type LocalStudent } from "@/lib/local-db";
import { lookupStudent } from "@/lib/students.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

          {/* ── Streak + Points Row ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 animate-slide-up stagger-3">
            {/* Attendance Streak */}
            <div className="glass-premium-v2 rounded-2xl p-4 flex flex-col justify-between items-start relative overflow-hidden group hover:scale-[1.02] transition-transform">
              <div className="flex items-center justify-between w-full relative z-10">
                <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-600 mb-2">
                  <Flame className="w-4 h-4" />
                </div>
              </div>
              <div className="relative z-10">
                <div className="text-hero-heading text-primary">3</div>
                <div className="text-label text-tertiary">Day Streak</div>
              </div>
            </div>
            
            {/* Reward Points */}
            <div className="glass-premium-v2 rounded-2xl p-4 flex flex-col justify-between items-start relative overflow-hidden group hover:scale-[1.02] transition-transform">
              <div className="flex items-center justify-between w-full relative z-10">
                <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-600 mb-2">
                  <Star className="w-4 h-4" />
                </div>
              </div>
              <div className="relative z-10">
                <div className="text-hero-heading text-primary">{livePoints !== null ? livePoints : "..."}</div>
                <div className="text-label text-tertiary">Points</div>
              </div>
            </div>
          </div>

          {/* ── KPI Stats Grid ──────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "—", label: "Attendance", icon: Percent, color: "text-emerald-600", bg: "bg-emerald-500/10" },
              { value: "—", label: "Events Done", icon: Zap, color: "text-purple-600", bg: "bg-purple-500/10" },
              { value: "Soon", label: "Global Rank", icon: Trophy, color: "text-blue-600", bg: "bg-blue-500/10" },
              { value: "Soon", label: "Dept Rank", icon: TrendingUp, color: "text-yellow-600", bg: "bg-yellow-500/10" },
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
                {BADGES.filter(b => b.unlocked).length}/{BADGES.length}
              </p>
            </div>
            
            <div className="grid grid-cols-3 gap-2.5">
              {BADGES.map((badge) => (
                <div
                  key={badge.id}
                  className={`glass-premium-v2 p-3 rounded-2xl flex flex-col items-center text-center transition-all ${badge.unlocked ? 'hover:scale-[1.04]' : 'opacity-60 grayscale'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${badge.unlocked ? badge.bg : 'bg-black/5 dark:bg-white/5'} ${badge.unlocked ? badge.color : 'text-tertiary'}`}>
                    <badge.icon className="w-5 h-5" />
                  </div>
                  <div className="text-[11px] font-bold text-primary leading-tight mb-0.5">{badge.name}</div>
                  <div className="text-[9px] text-tertiary leading-tight line-clamp-2">{badge.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Rankings ────────────────────────────────────────── */}
          <div className="space-y-2.5 pt-2">
            <p className="text-label text-tertiary px-1">Rankings</p>
            {[
              { label: "Global Rank", value: "Available after induction", icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Department Rank", value: "Available after induction", icon: Landmark, color: "text-rose-500", bg: "bg-rose-500/10" },
              { label: "Semester Rank", value: "Available after induction", icon: Library, color: "text-purple-500", bg: "bg-purple-500/10" },
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
