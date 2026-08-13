import { useState } from "react";
import { ShieldCheck, CircleCheck, GraduationCap } from "lucide-react";
import { type LocalStudent } from "@/lib/local-db";
import { motion } from "framer-motion";

interface IdentityPanelProps {
  profile: LocalStudent | null;
}

const SCHOOL_MAP: Record<string, string> = {
  soet: "School of Engineering & Technology",
  soad: "School of Architecture & Design",
  smas: "School of Management & Commerce",
  semce: "School of Engineering, Media & Creative Education",
  sbas: "School of Basic & Applied Sciences",
  sola: "School of Liberal Arts",
  sols: "School of Legal Studies",
  somc: "School of Mass Communication",
  soed: "School of Education",
  sprs: "School of Pharmaceutical Sciences"
};

function getSchoolName(code: string | undefined): string {
  if (!code) return "";
  const normalized = code.toLowerCase().trim();
  return SCHOOL_MAP[normalized] || code;
}

export function IdentityPanel({ profile }: IdentityPanelProps) {
  const userInitial = profile?.full_name?.[0]?.toUpperCase() || "?";
  const fullName = profile?.full_name?.toUpperCase() || "STUDENT";
  const enrollmentNo = profile?.enrollment_no || "AWAITING ID";
  const course = profile?.course || "Undergraduate Programme";
  const school = getSchoolName(profile?.department_id || profile?.branch) || "K.R. Mangalam University";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className="relative overflow-hidden rounded-[24px] p-8"
      style={{
        background: "var(--dashboard-card-bg)",
        border: "var(--dashboard-border)",
        boxShadow: "0 8px 30px rgb(0,0,0,0.04)",
        backdropFilter: "blur(var(--dashboard-glass-blur))",
        WebkitBackdropFilter: "blur(var(--dashboard-glass-blur))",
      }}
    >
      {/* Texture & Gradients */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#f8f5f2]/80 to-transparent dark:from-[#1a1714]/80 dark:to-transparent pointer-events-none -z-10" />
      <div className="absolute inset-0 opacity-[0.02] mix-blend-multiply dark:mix-blend-overlay pointer-events-none -z-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }} />
      
      {/* Watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-15deg] select-none pointer-events-none z-0">
        <span className="text-[140px] font-serif font-bold text-black/[0.02] dark:text-white/[0.02] tracking-tighter whitespace-nowrap">
          AARAMBH
        </span>
      </div>
      
      <div className="relative z-10">
        {/* Top Header */}
        <div className="flex justify-between items-center border-b border-black/5 dark:border-white/5 pb-4 mb-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GraduationCap className="w-5 h-5 text-amber-600/80" />
            <span className="text-xs font-bold tracking-widest uppercase">Digital University ID</span>
          </div>
          <span className="text-xs font-mono font-bold tracking-widest uppercase text-amber-600 dark:text-amber-500">
            2026–27
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 text-white flex items-center justify-center text-4xl font-serif font-bold shadow-lg shadow-amber-600/20 ring-4 ring-white dark:ring-[#1a1714]">
              {userInitial}
            </div>
          </div>
          
          {/* Details */}
          <div className="flex flex-col items-center sm:items-start w-full space-y-4">
            
            <div className="text-center sm:text-left space-y-1">
              <h2 className="text-3xl font-serif font-bold text-foreground tracking-tight">
                {fullName}
              </h2>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-500/10 px-3 py-1 rounded-full uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Student
              </div>
            </div>
            
            <div className="w-full h-px bg-black/5 dark:bg-white/5" />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 w-full gap-4 sm:gap-8 text-center sm:text-left">
              <div>
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">
                  Application Number
                </p>
                <p className="text-lg font-mono font-bold text-foreground">
                  {enrollmentNo}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">
                  Programme
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {course}
                </p>
              </div>
            </div>

            <div className="w-full text-center sm:text-left">
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">
                School
              </p>
              <p className="text-sm font-semibold text-foreground">
                {school}
              </p>
            </div>

          </div>
        </div>
      </div>
    </motion.div>
  );
}
