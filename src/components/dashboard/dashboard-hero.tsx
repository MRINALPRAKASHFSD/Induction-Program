import { type LocalStudent } from "@/lib/local-db";
import { CheckCircle2, MapPin, Calendar, Check } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";

interface DashboardHeroProps {
  profile: LocalStudent | null;
  plannerReady: boolean;
}

export function DashboardHero({ profile, plannerReady }: DashboardHeroProps) {
  const firstName = profile?.full_name?.split(" ")[0] || "Student";
  
  // Calculate days until induction
  const daysUntil = useMemo(() => {
    const target = new Date("2024-09-02T00:00:00+05:30"); // Adjust as needed
    const now = new Date();
    const diff = target.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  }, []);

  const [greeting, setGreeting] = useState("Good Morning");
  const [greetingIcon, setGreetingIcon] = useState("☀️");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      setGreeting("Good Morning");
      setGreetingIcon("☀️");
    } else if (hour >= 12 && hour < 17) {
      setGreeting("Good Afternoon");
      setGreetingIcon("🌤️");
    } else if (hour >= 17 && hour < 21) {
      setGreeting("Good Evening");
      setGreetingIcon("🌇");
    } else {
      setGreeting("Good Evening");
      setGreetingIcon("🌙");
    }
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 mb-[var(--dashboard-gap)] mt-4 p-8 rounded-[var(--dashboard-radius)] overflow-hidden border border-black/5 dark:border-white/5 shadow-sm"
    >
      {/* Premium Hero Backgrounds */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50/40 to-transparent dark:from-amber-950/20 dark:to-transparent backdrop-blur-[var(--dashboard-glass-blur)] -z-10" />
      <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none -z-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }} />
      
      {/* Ambient Blobs */}
      <motion.div 
        animate={{ 
          scale: [1, 1.05, 1],
          opacity: [0.3, 0.4, 0.3]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-[80px] -z-10 pointer-events-none" 
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.03, 1],
          opacity: [0.2, 0.3, 0.2]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute -bottom-32 -right-32 w-96 h-96 bg-orange-500/5 rounded-full blur-[80px] -z-10 pointer-events-none" 
      />

      <div className="flex flex-col gap-3 max-w-2xl relative z-10">
        <h3 className="text-xs font-bold tracking-widest uppercase text-muted-foreground/80">
          Dashboard
        </h3>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-[1.1]">
          {greeting}, {firstName} <span className="inline-block">{greetingIcon}</span>
        </h1>
        <p className="text-xl sm:text-2xl text-muted-foreground font-medium mt-4 leading-relaxed">
          {daysUntil > 0 ? (
            <>Your induction journey begins in <strong className="text-foreground">{daysUntil} Days</strong>.</>
          ) : (
            <>Your induction journey has <strong className="text-foreground">begun</strong>.</>
          )}
          <br className="hidden sm:block" />
          Everything you need for Aarambh is available below.
        </p>
      </div>

      <div className="flex flex-wrap lg:flex-col items-start lg:items-end gap-3 w-full lg:w-auto mt-4 lg:mt-0 relative z-10">
        <StatusChip icon={<CheckCircle2 className="w-4 h-4 text-green-500" />} label="Verified Student" active={!!profile} delay={0} />
        <StatusChip icon={<MapPin className="w-4 h-4 text-orange-500" />} label={profile?.room_no ? `Room Allocated` : 'Room Pending'} active={!!profile?.room_no} delay={0.2} />
        <StatusChip icon={<Calendar className="w-4 h-4 text-blue-500" />} label={plannerReady ? "Planner Ready" : "Planner Syncing"} active={plannerReady} delay={0.4} />
        <StatusChip icon={<Check className="w-4 h-4 text-purple-500" />} label="Attendance Enabled" active={!!profile} delay={0.6} />
      </div>
    </motion.div>
  );
}

function StatusChip({ icon, label, active, delay }: { icon: React.ReactNode; label: string; active: boolean; delay: number }) {
  return (
    <motion.div 
      animate={{ y: [-1, 1, -1] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay }}
      className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-colors duration-300 ${
      active 
        ? "bg-white/80 dark:bg-zinc-800/80 text-foreground shadow-sm border border-black/5 dark:border-white/5" 
        : "bg-black/5 dark:bg-white/5 text-muted-foreground border border-transparent"
    } backdrop-blur-md`}
    >
      <div className={`flex items-center justify-center ${!active && "opacity-50 grayscale"}`}>
        {icon}
      </div>
      <span>{label}</span>
    </motion.div>
  );
}
