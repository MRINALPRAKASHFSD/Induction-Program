import { CheckCircle2, AlertCircle } from "lucide-react";
import { type LocalStudent } from "@/lib/local-db";

interface QuickStatusProps {
  profile: LocalStudent | null;
}

export function QuickStatus({ profile }: QuickStatusProps) {
  if (!profile) return null;

  const isRegistered = !!profile.enrollment_no;

  return (
    <div className="rounded-[var(--dashboard-radius)] p-5 bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)]">
      <div className={`p-3.5 rounded-xl flex items-center gap-3.5 ${isRegistered ? 'bg-green-500/10' : 'bg-orange-500/10'}`}>
        {isRegistered ? (
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-500 flex-shrink-0" />
        ) : (
          <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-500 flex-shrink-0" />
        )}
        <div>
          <h4 className={`text-sm font-bold ${isRegistered ? 'text-green-800 dark:text-green-400' : 'text-orange-800 dark:text-orange-400'}`}>
            {isRegistered ? "Registration Complete" : "Pending Registration"}
          </h4>
          <p className={`text-xs mt-0.5 leading-snug ${isRegistered ? 'text-green-700/80 dark:text-green-500/80' : 'text-orange-700/80 dark:text-orange-500/80'}`}>
            {isRegistered 
              ? "You have successfully completed your induction registration. Your student profile is active."
              : "Please complete your induction registration to unlock all features and view your full schedule."}
          </p>
        </div>
      </div>
    </div>
  );
}
