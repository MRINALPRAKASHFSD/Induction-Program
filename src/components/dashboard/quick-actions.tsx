import { Link } from "@tanstack/react-router";
import { ScanLine, CalendarDays, Map, LifeBuoy, Bell, FileText, DoorOpen, Users } from "lucide-react";

export function QuickActions() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-1">
        Quick Actions
      </h3>
      
      {/* Large Action: Scan Attendance */}
      <Link
        to="/attendance"
        className="group relative flex flex-col p-6 rounded-[20px] bg-gradient-to-br from-amber-600 to-amber-700 text-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden"
      >
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }} />
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
        
        <div className="relative z-10 flex items-center justify-between">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-300">
            <ScanLine className="w-7 h-7 text-white" />
          </div>
          <div className="w-8 h-8 rounded-full border border-white/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <ScanLine className="w-4 h-4 text-white" />
          </div>
        </div>
        <div className="relative z-10 mt-6">
          <h4 className="font-serif font-bold text-2xl tracking-tight">Scan Attendance</h4>
          <p className="text-sm font-medium text-white/80 mt-1">Lodge your session scan now</p>
        </div>
      </Link>

      {/* Medium Actions Grid */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { to: "/schedule", icon: CalendarDays, title: "Schedule" },
          { to: "/campus", icon: Map, title: "Campus Map" },
          { to: "/help", icon: LifeBuoy, title: "Help Centre" },
          { to: "/announcements", icon: Bell, title: "Updates" },
        ].map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="group relative flex flex-col p-5 rounded-[20px] bg-white/60 dark:bg-zinc-900/60 border border-black/5 dark:border-white/5 shadow-sm hover:shadow-md hover:-translate-y-1 hover:bg-white dark:hover:bg-zinc-800 transition-all duration-300 backdrop-blur-xl"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-500 flex items-center justify-center shrink-0 mb-3 group-hover:scale-110 group-hover:bg-amber-500/20 transition-all duration-300">
              <action.icon className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-foreground tracking-tight">{action.title}</h4>
          </Link>
        ))}
      </div>

      {/* Small Actions Grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { to: "/documents", icon: FileText, title: "Docs" },
          { to: "/room", icon: DoorOpen, title: "Room" },
          { to: "/clubs", icon: Users, title: "Clubs" },
        ].map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="group relative flex flex-col items-center justify-center p-4 rounded-[16px] bg-white/40 dark:bg-zinc-900/40 border border-black/5 dark:border-white/5 hover:bg-white dark:hover:bg-zinc-800 hover:-translate-y-0.5 transition-all duration-200"
          >
            <action.icon className="w-5 h-5 text-muted-foreground group-hover:text-amber-600 transition-colors mb-2" />
            <span className="text-[10px] font-bold tracking-wide uppercase text-muted-foreground group-hover:text-foreground transition-colors">{action.title}</span>
          </Link>
        ))}
      </div>

    </div>
  );
}
