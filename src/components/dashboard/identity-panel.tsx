import { useState } from "react";
import { User, ScanLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type LocalStudent } from "@/lib/local-db";

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
  // Return the mapped name if found, otherwise return the original string capitalized or as-is
  return SCHOOL_MAP[normalized] || code;
}

export function IdentityPanel({ profile }: IdentityPanelProps) {
  const userInitial = profile?.full_name?.[0]?.toUpperCase() || "?";

  return (
    <div
      className="relative overflow-hidden rounded-[var(--dashboard-radius)] p-[var(--dashboard-padding)]"
      style={{
        background: "var(--dashboard-card-bg)",
        border: "var(--dashboard-border)",
        boxShadow: "var(--dashboard-shadow)",
        backdropFilter: "blur(var(--dashboard-glass-blur))",
        WebkitBackdropFilter: "blur(var(--dashboard-glass-blur))",
      }}
    >
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-white/5 opacity-50 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#8a4a22] to-[#c26f39] text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-[#8a4a22]/20">
              {userInitial}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-white dark:bg-zinc-900 rounded-full p-1 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-green-600" />
            </div>
          </div>
          
          {/* Info */}
          <div className="space-y-1.5 flex-1">
            <h2 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
              {profile?.full_name || "Student"}
            </h2>
            
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#8a4a22] dark:text-[#f4a261]">
                <span className="bg-[#8a4a22]/10 px-3 py-1 rounded-full">
                  {profile?.enrollment_no || "Awaiting ID"}
                </span>
              </div>
              
              <div className="text-sm font-medium text-muted-foreground">
                {"Undergraduate Programmes"} 
                {profile?.branch && <span className="mx-2 opacity-50">•</span>}
                {profile?.branch && getSchoolName(profile.department_id || profile.branch)}
              </div>
              
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-500 flex items-center gap-1.5 mt-1">
                <ShieldCheck className="w-4 h-4" />
                Verified Student
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
