import { Link } from "@tanstack/react-router";
import { ScanLine, CalendarDays, Users, Bell, ArrowRight } from "lucide-react";

export function QuickActions() {
  const actions = [
    { to: "/attendance", icon: ScanLine, title: "Scan Attendance", subtitle: "Lodge your session scan", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
    { to: "/schedule", icon: CalendarDays, title: "My Schedule", subtitle: "View upcoming sessions", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
    { to: "/clubs", icon: Users, title: "Explore Clubs", subtitle: "Join your community", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
    { to: "/announcements", icon: Bell, title: "Announcements", subtitle: "Latest updates", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1">
        Quick Actions
      </h3>
      
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="group relative flex flex-col p-4 rounded-2xl bg-[var(--dashboard-card-bg)] border border-black/5 dark:border-white/5 shadow-sm hover:shadow-md hover:-translate-y-1 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-all duration-300"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 mb-3 ${action.bg} ${action.color} group-hover:scale-105 transition-transform duration-300`}>
              <action.icon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-end">
              <h4 className="font-bold text-[15px] text-foreground tracking-tight">{action.title}</h4>
              <p className="text-[11px] font-medium text-muted-foreground truncate mt-0.5">{action.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
