import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock, MapPin, CalendarDays, BookOpen, AlertCircle, Sparkles } from "lucide-react";

interface ScheduleTimelineProps {
  planner: any | null;
  isLoading: boolean;
}

export function ScheduleTimeline({ planner, isLoading }: ScheduleTimelineProps) {
  if (isLoading) {
    return (
      <div className="rounded-[24px] p-8 bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] animate-pulse">
        <div className="h-6 w-32 bg-black/10 dark:bg-white/10 rounded-md mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-black/5 dark:bg-white/5 rounded" />
                <div className="h-3 w-1/2 bg-black/5 dark:bg-white/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!planner?.plannerActive) {
    return (
      <div className="rounded-[24px] p-8 bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] flex flex-col items-center justify-center text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center mb-2">
          <CalendarDays className="w-6 h-6" />
        </div>
        <h3 className="font-serif font-bold text-xl text-foreground">Schedule Not Ready</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Your induction schedule is currently being finalized. Check back later.
        </p>
      </div>
    );
  }

  const todaySessions = planner?.today?.sessions || [];
  const nextSession = planner?.nextSession;

  return (
    <div className="rounded-[24px] p-8 bg-white/60 dark:bg-zinc-900/60 border border-black/5 dark:border-white/5 shadow-sm backdrop-blur-xl flex flex-col h-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="font-serif font-bold text-2xl text-foreground leading-none flex items-center gap-2">
            Today at a Glance
            <Sparkles className="w-5 h-5 text-amber-500" />
          </h3>
          {planner?.today?.date && (
            <span className="text-sm font-medium text-muted-foreground mt-2 block">
              {new Date(planner.today.date).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
          )}
        </div>
        
        <Link to="/schedule" className="text-[10px] font-bold text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 flex items-center gap-1 uppercase tracking-widest transition-colors px-4 py-2 rounded-full bg-amber-500/10 hover:bg-amber-500/20">
          Full Schedule <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-8">
        
        {/* Left Side: Timeline */}
        <div className="flex-1 flex flex-col gap-4">
          {todaySessions.length > 0 ? (
            <div className="relative pl-6 space-y-8 before:absolute before:inset-y-3 before:left-[31px] before:w-px before:bg-gradient-to-b before:from-amber-500/50 before:to-transparent">
              {todaySessions.slice(0, 4).map((session: any, i: number) => {
                const isPast = session.status === 'past';
                const isCurrent = session.status === 'current';

                return (
                  <div key={session.id || i} className={`relative flex gap-6 ${isPast ? 'opacity-40 grayscale' : ''}`}>
                    <div className={`
                      absolute left-[-29px] top-1.5 w-3 h-3 rounded-full ring-4 ring-white dark:ring-zinc-900 z-10
                      ${isCurrent ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)] scale-125' : 
                        isPast ? 'bg-black/20 dark:bg-white/20' : 
                        'bg-amber-200 dark:bg-amber-900/50'}
                    `} />
                    
                    <div className="w-20 flex-shrink-0 text-right pt-0.5">
                      <div className={`text-sm font-mono font-bold tracking-tight ${isCurrent ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}`}>
                        {formatTime(session.startTime)}
                      </div>
                    </div>
                    
                    <div className="flex-1 pb-1">
                      {isCurrent && (
                        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-500 mb-1">
                          Happening Now
                        </div>
                      )}
                      <h4 className={`font-semibold text-base leading-snug mb-1.5 ${isCurrent ? 'text-foreground' : 'text-foreground/80'}`}>
                        {session.sessionName}
                      </h4>
                      {session.venueName && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{session.venueName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {todaySessions.length > 4 && (
                <div className="relative flex gap-6 items-center pt-2">
                  <div className="absolute left-[-25px] w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-[88px]">
                    +{todaySessions.length - 4} more sessions
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4 text-muted-foreground">
                <BookOpen className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-base font-serif text-muted-foreground">
                No sessions scheduled for today
              </p>
            </div>
          )}
        </div>

        {/* Right Side: Mini Info Box */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-4">
          <div className="rounded-[20px] bg-[#1a1714] text-[#f8f5f2] p-6 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 mix-blend-overlay pointer-events-none" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }} />
            
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-4">Quick Stats</h4>
            
            <div className="space-y-4">
              <div>
                <p className="text-3xl font-serif font-bold text-white">{todaySessions.length}</p>
                <p className="text-xs font-medium text-white/60">Sessions Today</p>
              </div>
              
              <div className="w-full h-px bg-white/10" />
              
              <div>
                <p className="text-3xl font-serif font-bold text-white">
                  {todaySessions.filter((s: any) => s.status === 'past').length}
                </p>
                <p className="text-xs font-medium text-white/60">Completed</p>
              </div>
            </div>
          </div>

          {planner?.documentationDay && (
            <div className="rounded-[20px] bg-amber-500/10 border border-amber-500/20 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-700 dark:text-amber-500">Documentation Day</h4>
                  <p className="text-xs font-medium text-amber-600/80 dark:text-amber-400/80 mt-1">
                    {new Date(planner.documentationDay.date).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function formatTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2,'0')} ${period}`;
}
