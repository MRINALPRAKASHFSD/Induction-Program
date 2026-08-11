import { Trophy, Percent } from "lucide-react";

interface AttendanceCardProps {
  points: number | null;
  attendanceCount: number;
}

export function AttendanceCard({ points, attendanceCount }: AttendanceCardProps) {
  return (
    <div className="rounded-[var(--dashboard-radius)] p-[var(--dashboard-padding)] bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg text-foreground">Attendance & Rewards</h3>
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-600 dark:text-yellow-500">
          <Trophy className="w-5 h-5" />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
          <div className="text-3xl font-bold text-primary mb-1">
            {points !== null ? points : "..."}
          </div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Points
          </div>
        </div>
        
        <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
          <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center justify-center gap-1">
            {attendanceCount}
          </div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
            <Percent className="w-3 h-3" />
            Attendance
          </div>
        </div>
      </div>
    </div>
  );
}
