import { Trophy, Percent, Star, Target } from "lucide-react";
import { motion } from "framer-motion";

interface AttendanceCardProps {
  points: number | null;
  attendanceCount: number;
}

export function AttendanceCard({ points, attendanceCount }: AttendanceCardProps) {
  // Assuming a max of 20 sessions for now for the visual ring
  const maxSessions = 20;
  const percentage = Math.min(100, Math.round(((attendanceCount || 0) / maxSessions) * 100));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="rounded-[24px] p-6 bg-gradient-to-br from-[#1a1714] to-[#2a2520] text-white shadow-xl relative overflow-hidden flex flex-col justify-between">
      
      {/* Background patterns */}
      <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }} />
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl" />
      
      <div className="flex items-center justify-between mb-8 relative z-10">
        <div>
          <h3 className="font-serif font-bold text-xl text-white">Performance</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mt-1">Points & Attendance</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/10 shadow-inner">
          <Trophy className="w-5 h-5 text-amber-400" />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-6 relative z-10">
        
        {/* Points Side */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative mb-2">
            <div className="w-24 h-24 rounded-full border-4 border-white/5 flex items-center justify-center relative">
              <Star className="absolute top-0 right-0 w-6 h-6 text-amber-400 -mt-2 -mr-2 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse" />
              <div className="text-3xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-br from-amber-200 to-amber-500">
                {points !== null ? points : "..."}
              </div>
            </div>
          </div>
          <div className="text-[10px] font-bold text-white/60 uppercase tracking-widest flex items-center justify-center gap-1.5 mt-2">
            Aarambh Points
          </div>
        </div>
        
        {/* Attendance Ring */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative w-24 h-24 mb-2">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-white/10 fill-none"
                strokeWidth="8"
              />
              <motion.circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-emerald-500 fill-none"
                strokeWidth="8"
                strokeLinecap="round"
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                style={{ strokeDasharray: circumference }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-serif font-bold text-emerald-400">{attendanceCount}</span>
            </div>
          </div>
          <div className="text-[10px] font-bold text-white/60 uppercase tracking-widest flex items-center justify-center gap-1.5 mt-2">
            <Target className="w-3.5 h-3.5" />
            Sessions
          </div>
        </div>
        
      </div>
    </div>
  );
}
