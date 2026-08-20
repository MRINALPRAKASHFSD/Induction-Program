import { type LocalStudent } from "@/lib/local-db";
import { CheckCircle2, ShieldCheck, BookOpen, Clock, Users, Building } from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface DashboardHeroProps {
  profile: LocalStudent | null;
  liveCourse?: string;
  plannerReady: boolean;
}

export function DashboardHero({ profile, liveCourse, plannerReady }: DashboardHeroProps) {
  const firstName = profile?.full_name?.split(" ")[0] || "Student";
  const fullName = profile?.full_name || "Student";

  const [greeting, setGreeting] = useState("Good Morning");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      setGreeting("Good Morning");
    } else if (hour >= 12 && hour < 17) {
      setGreeting("Good Afternoon");
    } else if (hour >= 17 && hour < 21) {
      setGreeting("Good Evening");
    } else {
      setGreeting("Good Evening");
    }
  }, []);

  // Mock progress data
  const progressPercent = 82;
  const completedSteps = 5;
  const totalSteps = 6;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progressPercent / 100) * circumference;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex flex-col xl:flex-row justify-between items-start gap-12 mb-[var(--dashboard-gap)] mt-4 p-8 sm:p-12 rounded-[24px] overflow-hidden bg-[var(--dashboard-card-bg)] border border-black/5 dark:border-white/5 shadow-sm backdrop-blur-xl"
    >
      {/* Premium Texture & Gradients */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f8f5f2] to-transparent dark:from-[#1a1714] dark:to-transparent -z-10" />
      <div className="absolute inset-0 opacity-[0.02] mix-blend-multiply dark:mix-blend-overlay pointer-events-none -z-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }} />
      
      {/* Ambient Gold Glow */}
      <motion.div 
        animate={{ opacity: [0.4, 0.5, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-[100px] -z-10 pointer-events-none" 
      />

      {/* Left: Editorial Welcome & Snapshot */}
      <div className="flex flex-col gap-6 max-w-2xl relative z-10 w-full xl:w-auto">
        <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground">
          Dashboard
        </h3>
        
        <div className="space-y-1 mt-2">
          <h2 className="text-3xl sm:text-4xl font-serif text-foreground leading-[1.2]">
            {greeting},
          </h2>
          <h1 className="text-4xl sm:text-5xl font-serif font-bold text-foreground leading-[1.1]">
            {fullName}
          </h1>
        </div>

        <p className="text-lg sm:text-xl text-muted-foreground font-serif italic mt-2 leading-relaxed">
          Welcome back to Aarambh 2026. <br className="hidden sm:block" />
          Everything you need for your induction journey is ready below.
        </p>

        {/* Gold Divider */}
        <div className="w-16 h-px bg-amber-500/30 my-4" />

        {/* Student Snapshot Chips */}
        <div className="flex flex-wrap gap-2.5 mt-2">
          <SnapshotChip icon={<Building size={14} />} label={liveCourse || profile?.course || "School Not Assigned"} />
          <SnapshotChip icon={<BookOpen size={14} />} label={profile?.program || "Course Not Assigned"} />
          <SnapshotChip icon={<Clock size={14} />} label={`Semester ${profile?.semester || "I"}`} />
          <SnapshotChip icon={<Users size={14} />} label="Section A" />
          <SnapshotChip icon={<ShieldCheck size={14} />} label="Group 14" />
          <SnapshotChip icon={<CheckCircle2 size={14} />} label="Verified Student" highlight />
        </div>
      </div>

      {/* Right: Orientation Progress Ring */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
        className="flex flex-col sm:flex-row items-center gap-8 bg-white/50 dark:bg-black/20 p-8 rounded-[20px] border border-black/5 dark:border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative z-10 w-full xl:w-auto"
      >
        {/* Ring */}
        <div className="relative flex items-center justify-center w-28 h-28">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              className="text-black/5 dark:text-white/5"
            />
            <motion.circle
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
              cx="40"
              cy="40"
              r={radius}
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={circumference}
              strokeLinecap="round"
              className="text-amber-600 dark:text-amber-500 drop-shadow-sm"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-mono font-bold text-foreground">{progressPercent}%</span>
          </div>
        </div>

        {/* Progress Details */}
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
          <h4 className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-2">
            Orientation Progress
          </h4>
          <div className="text-lg font-bold text-foreground mb-1 font-mono">
            {completedSteps} / {totalSteps}
          </div>
          <p className="text-sm text-muted-foreground font-medium mb-4">
            Steps Completed
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SnapshotChip({ icon, label, highlight = false }: { icon: React.ReactNode; label: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-300 ${
      highlight 
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20" 
        : "bg-black/5 dark:bg-white/5 text-muted-foreground border border-black/5 dark:border-white/5"
    }`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}
