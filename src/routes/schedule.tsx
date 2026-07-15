import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, MapPin, ArrowLeft, Compass, Footprints, Map as MapIcon } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { localDb } from "@/lib/local-db";
import { getSchoolDays, getSchoolSessions, getAllSchoolDays, getAllSchoolSessions } from "@/lib/students.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/schedule")({
  component: SchedulePage,
});

function SchedulePage() {
  const [profile, setProfile] = useState<any>(null);
  const [days, setDays] = useState<number[]>([]);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMasterView, setIsMasterView] = useState(false);

  useEffect(() => {
    const p = localDb.getStudentProfile();
    if (p) {
      setProfile(p);
      fetchDays(p.department_id!, isMasterView);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchDays = async (department_id: string, master: boolean) => {
    try {
      setLoading(true);
      const res: any = master 
        ? await getAllSchoolDays()
        : await getSchoolDays({ data: { department_id } });
        
      if (res.days && res.days.length > 0) {
        setDays(res.days);
        const dayToFetch = activeDay !== null && res.days.includes(activeDay) ? activeDay : res.days[0];
        setActiveDay(dayToFetch);
        await fetchSessions(department_id, dayToFetch, master);
      } else {
        setDays([]);
        setSessions([]);
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const fetchSessions = async (department_id: string, day_number: number, master: boolean) => {
    setLoading(true);
    try {
      const res: any = master
        ? await getAllSchoolSessions({ data: { day_number } })
        : await getSchoolSessions({ data: { department_id, day_number } });
        
      if (res.sessions) {
        setSessions(res.sessions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDaySelect = (d: number) => {
    setActiveDay(d);
    if (profile) fetchSessions(profile.department_id, d, isMasterView);
  };

  const toggleMasterView = (checked: boolean) => {
    setIsMasterView(checked);
    if (profile) fetchDays(profile.department_id, checked);
  };

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto px-4 py-16 text-center relative">
          <div className="empty-state max-w-sm mx-auto">
            <div className="empty-state-icon">
              <Calendar className="h-7 w-7" />
            </div>
            <div className="empty-state-title">Register First</div>
            <div className="empty-state-text">
              Register to see your personalized induction schedule.
            </div>
            <Button asChild variant="liquidGlassMaroon" size="lg" className="rounded-full px-8">
              <Link to="/register">Register Now</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12 overflow-x-hidden">
      <SiteHeader />
      
      {/* Ambient Background */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
      </div>

      <main className="relative container mx-auto max-w-2xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          
          {/* Header */}
          <div className="glass-premium-v2 rounded-2xl p-4 animate-slide-up stagger-1">
            <div className="flex items-center justify-between gap-3 relative z-10">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" asChild className="rounded-full bg-white/40 hover:bg-white/60 border border-[#8a4a22]/5">
                  <Link to="/my-pass"><ArrowLeft className="h-5 w-5 text-[#5a2c14]" /></Link>
                </Button>
                <div>
                  <h1 className="text-page-heading text-primary font-bold flex items-center gap-2">
                    <Compass className="w-5 h-5 text-[#8a4a22] animate-spin-slow" style={{ animationDuration: '20s' }} />
                    Schedule
                  </h1>
                  <p className="text-label text-secondary uppercase font-bold tracking-wider">{isMasterView ? "Master View" : profile.branch}</p>
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2 glass-premium-v2 rounded-full px-3 py-1.5 border-[#8a4a22]/8">
                  <Switch id="master-view" checked={isMasterView} onCheckedChange={toggleMasterView} />
                  <Label htmlFor="master-view" className="text-caption font-bold cursor-pointer uppercase tracking-wider text-[#8a4a22]/60 relative z-10">Master</Label>
                </div>
              </div>
            </div>
          </div>

          {/* Days Scroller */}
          {days.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-3 pt-1 snap-x hide-scrollbar px-1 animate-slide-up stagger-2">
              {days.map(d => (
                <button
                  key={d}
                  onClick={() => handleDaySelect(d)}
                  className={`snap-start shrink-0 flex flex-col items-center justify-center w-20 h-24 rounded-[1.5rem] transition-all relative overflow-hidden ${
                    activeDay === d 
                    ? "bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] text-white shadow-lg shadow-[#8a4a22]/25" 
                    : "glass-premium-v2 hover:scale-[1.03]"
                  }`}
                  style={{ willChange: 'transform' }}
                >
                  <span className={`text-caption uppercase font-bold tracking-wider mb-0.5 ${activeDay === d ? 'text-white/80' : 'text-[#8a4a22]/50'} relative z-10`}>Day</span>
                  <span className={`text-card-title font-black relative z-10 ${activeDay === d ? '' : 'text-primary'}`}>{d}</span>
                </button>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div className="relative py-4 flex flex-col min-h-[40vh]">
            {loading ? (
              /* Skeleton loading */
              <div className="space-y-4">
                {[1,2,3].map(i => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="skeleton-glass skeleton-circle w-12 h-12 shrink-0" />
                    <div className="flex-1 skeleton-glass skeleton-card" style={{ minHeight: '140px' }} />
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <MapIcon className="h-7 w-7" />
                </div>
                <div className="empty-state-title">No Sessions</div>
                <div className="empty-state-text">
                  No sessions scheduled for this day yet. Check back later!
                </div>
              </div>
            ) : (
              <>
                {/* Timeline line */}
                <div className="absolute left-6 top-4 bottom-4 w-px bg-gradient-to-b from-[#8a4a22]/15 via-[#8a4a22]/10 to-transparent" />

                <div className="space-y-6 relative z-10">
                  {sessions.map((s, idx) => (
                    <motion.div 
                      key={s.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.08, ease: [0.16,1,0.3,1] }}
                      className="relative flex items-start gap-4 group"
                    >
                      {/* Timeline Node */}
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] text-white shadow-md shrink-0 relative z-10">
                        <span className="font-black text-sm">{idx + 1}</span>
                      </div>

                      {/* Session Card */}
                      <div className="flex-1 glass-premium-v2 rounded-2xl p-5 group-hover:shadow-lg transition-shadow">
                        <div className="relative z-10">
                          {/* Time badge */}
                          <div className="flex items-center gap-2 mb-3">
                            <span className="session-badge session-badge-upcoming">
                              <Clock className="h-3 w-3" />
                              {new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          
                          <h3 className="text-section-heading text-primary font-bold leading-tight mb-2">{s.title}</h3>
                          
                          {s.description && (
                            <p className="text-body-secondary text-[#7a4020]/70 mb-4 line-clamp-2 leading-relaxed">{s.description}</p>
                          )}
                          
                          <div className="flex items-center gap-2 text-label text-[#8a4a22] font-semibold glass-premium-v2 rounded-xl px-3 py-2 border-[#8a4a22]/6">
                            <MapPin className="h-4 w-4 shrink-0 relative z-10" />
                            <span className="relative z-10">{s.venue}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </div>

        </motion.div>
      </main>
    </div>
  );
}
