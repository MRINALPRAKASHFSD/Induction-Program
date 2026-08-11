import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock, MapPin, CalendarDays, BookOpen, AlertCircle } from "lucide-react";

interface ScheduleTimelineProps {
  planner: any | null;
  isLoading: boolean;
}

export function ScheduleTimeline({ planner, isLoading }: ScheduleTimelineProps) {
  if (isLoading) {
    return (
      <div className="rounded-[var(--dashboard-radius)] p-[var(--dashboard-padding)] bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] animate-pulse">
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
      <div className="rounded-[var(--dashboard-radius)] p-[var(--dashboard-padding)] bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] flex flex-col items-center justify-center text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center mb-2">
          <CalendarDays className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-lg text-foreground">Schedule Not Ready</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Your induction schedule is currently being finalized. Check back later.
        </p>
      </div>
    );
  }

  const todaySessions = planner?.today?.sessions || [];
  const nextSession = planner?.nextSession;

  return (
    <div className="rounded-[var(--dashboard-radius)] p-[var(--dashboard-padding)] bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-foreground leading-none">Today's Journey</h3>
            {planner?.today?.date && (
              <span className="text-xs font-medium text-muted-foreground mt-1 block">
                {new Date(planner.today.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        
        <Link to="/schedule" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 uppercase tracking-wider transition-colors px-3 py-1.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20">
          Full Schedule <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        {todaySessions.length > 0 ? (
          <div className="relative pl-4 space-y-6 before:absolute before:inset-y-2 before:left-[23px] before:w-0.5 before:bg-black/5 dark:before:bg-white/5">
            {todaySessions.slice(0, 4).map((session: any, i: number) => {
              const isPast = session.status === 'past';
              const isCurrent = session.status === 'current';
              const isNext = session.id === nextSession?.id;

              return (
                <div key={session.id || i} className={`relative flex gap-4 ${isPast ? 'opacity-50' : ''}`}>
                  <div className={`
                    absolute left-[-21px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-[var(--dashboard-card-bg)]
                    ${isCurrent ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]' : 
                      isPast ? 'bg-black/10 dark:bg-white/10' : 
                      'bg-black/20 dark:bg-white/20'}
                  `} />
                  
                  <div className="w-16 flex-shrink-0 text-right pt-0.5">
                    <div className={`text-xs font-bold tracking-tight ${isCurrent ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`}>
                      {formatTime(session.startTime)}
                    </div>
                  </div>
                  
                  <div className="flex-1 pb-1">
                    <h4 className={`font-semibold text-[15px] leading-snug mb-0.5 ${isCurrent ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'}`}>
                      {session.sessionName}
                    </h4>
                    {session.venueName && (
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground/80">
                        <MapPin className="w-3 h-3" />
                        <span>{session.venueName}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {todaySessions.length > 4 && (
              <div className="relative flex gap-4 items-center">
                <div className="absolute left-[-21px] w-3 h-3 rounded-full border-2 bg-black/5 dark:bg-white/5 border-transparent flex items-center justify-center">
                  <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                </div>
                <div className="text-xs font-medium text-muted-foreground ml-[72px]">
                  +{todaySessions.length - 4} more sessions
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-3 text-muted-foreground">
              <BookOpen className="w-6 h-6 opacity-50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No sessions scheduled for today
            </p>
          </div>
        )}
      </div>

      {planner?.documentationDay && (
         <div className="mt-6 pt-4 border-t border-black/5 dark:border-white/5">
           <div className="flex items-start gap-3 bg-orange-500/5 rounded-xl p-3 border border-orange-500/10">
             <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
             <div>
               <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-400">Documentation Day</h4>
               <p className="text-xs text-orange-600/80 dark:text-orange-300/80 mt-1">
                 {new Date(planner.documentationDay.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
               </p>
             </div>
           </div>
         </div>
      )}
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
