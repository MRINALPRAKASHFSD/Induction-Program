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
        <main className="container mx-auto px-4 py-12 text-center">
          <h1 className="text-2xl font-bold">Please Register First</h1>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12 overflow-x-hidden">
      <SiteHeader />
      
      {/* Decorative Treasure Map Background Elements */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-30" aria-hidden="true">
        <div className="absolute top-20 right-0 h-[40rem] w-[40rem] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-20 left-10 h-[30rem] w-[30rem] rounded-full bg-accent/5 blur-3xl" />
        {/* Subtle topographic or paper texture overlay could go here */}
      </div>

      <main className="relative container mx-auto max-w-2xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          
          <div className="flex items-center justify-between gap-3 bg-card/60 backdrop-blur-md p-4 rounded-3xl border border-primary/10 shadow-sm">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild className="rounded-full bg-muted/80 hover:bg-muted">
                <Link to="/my-pass"><ArrowLeft className="h-5 w-5" /></Link>
              </Button>
              <div>
                <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                  <Compass className="w-6 h-6 text-primary animate-spin-slow" style={{ animationDuration: '20s' }} />
                  Schedule
                </h1>
                <p className="text-sm text-muted-foreground font-medium">{isMasterView ? "Master Map" : profile.branch}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 bg-background/50 px-3 py-1.5 rounded-full border">
                <Switch id="master-view" checked={isMasterView} onCheckedChange={toggleMasterView} />
                <Label htmlFor="master-view" className="text-xs font-bold cursor-pointer uppercase tracking-wider text-primary/80">Master</Label>
              </div>
            </div>
          </div>

          {/* Days Scroller */}
          {days.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="flex gap-4 overflow-x-auto pb-4 pt-2 snap-x hide-scrollbar px-2"
            >
              {days.map(d => (
                <motion.button
                  key={d}
                  whileHover={{ scale: 1.05, rotate: activeDay === d ? 0 : 2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleDaySelect(d)}
                  className={`snap-start shrink-0 flex flex-col items-center justify-center w-20 h-24 rounded-[2rem] transition-all relative overflow-hidden ${
                    activeDay === d 
                    ? "text-primary-foreground shadow-glow border-none" 
                    : "bg-card border-2 border-primary/10 hover:border-primary/30"
                  }`}
                >
                  {activeDay === d && (
                    <motion.div layoutId="activeDayBg" className="absolute inset-0 bg-hero -z-10" />
                  )}
                  <span className="text-xs uppercase font-bold opacity-80 mb-0.5 tracking-wider">Day</span>
                  <span className="text-3xl font-black">{d}</span>
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Treasure Hunt Timeline */}
          <div className="relative py-10 flex flex-col min-h-[50vh]">
            {loading ? (
              <div className="text-center py-20 flex flex-col items-center gap-4">
                <Compass className="h-10 w-10 text-primary/50 animate-spin" />
                <p className="text-muted-foreground font-medium animate-pulse">Unrolling map...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground bg-card/50 backdrop-blur-sm rounded-[3rem] border-2 border-dashed border-primary/20">
                <MapIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No treasures to find on this day.</p>
              </div>
            ) : (
              <>
                {/* Wavy SVG Path Background */}
                <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden z-0">
                  <div className="absolute left-6 md:left-1/2 md:-translate-x-1/2 top-0 bottom-0 w-12 flex justify-center">
                    <svg className="h-full w-32 overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 1000">
                      <motion.path 
                        d="M 50 0 C 110 20, 110 80, 50 100 C -10 120, -10 180, 50 200 C 110 220, 110 280, 50 300 C -10 320, -10 380, 50 400 C 110 420, 110 480, 50 500 C -10 520, -10 580, 50 600 C 110 620, 110 680, 50 700 C -10 720, -10 780, 50 800 C 110 820, 110 880, 50 900 C -10 920, -10 980, 50 1000"
                        fill="none"
                        stroke="var(--color-primary)"
                        strokeWidth="3"
                        strokeDasharray="8 8"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 2.5, ease: "easeOut" }}
                        className="opacity-40"
                      />
                    </svg>
                  </div>
                </div>

                <div className="space-y-12 relative z-10">
                  {sessions.map((s, idx) => (
                    <div key={s.id} className="relative flex items-center justify-start md:justify-center md:odd:flex-row-reverse group">
                      
                      {/* Node Marker */}
                      <motion.div 
                        initial={{ scale: 0, rotate: -180 }}
                        whileInView={{ scale: 1, rotate: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ type: "spring", bounce: 0.5, delay: idx * 0.1 }}
                        className="flex items-center justify-center w-12 h-12 rounded-full border-[3px] border-background bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shrink-0 relative z-20"
                      >
                        <span className="font-black text-lg">{idx + 1}</span>
                        {/* Ping animation for active map points */}
                        <div className="absolute inset-0 rounded-full border-2 border-primary/50 animate-ping opacity-20" style={{ animationDuration: '3s' }} />
                      </motion.div>

                      {/* Map Card */}
                      <motion.div 
                        initial={{ opacity: 0, x: idx % 2 === 0 ? 30 : -30, rotate: idx % 2 === 0 ? 3 : -3 }}
                        whileInView={{ opacity: 1, x: 0, rotate: idx % 2 === 0 ? 1 : -1 }}
                        whileHover={{ scale: 1.02, rotate: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ type: "spring", bounce: 0.4, delay: idx * 0.1 + 0.2 }}
                        className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] ml-4 md:ml-0 p-5 rounded-3xl bg-card/90 backdrop-blur-md border-[3px] border-primary/5 shadow-xl relative overflow-hidden group-hover:border-primary/20 transition-all cursor-pointer"
                      >
                        {/* Decorative background icon */}
                        <div className="absolute -right-4 -bottom-4 text-primary/[0.03] rotate-12 transition-transform group-hover:rotate-6 group-hover:scale-110">
                          {idx % 3 === 0 ? <Compass className="w-32 h-32" /> : idx % 2 === 0 ? <MapIcon className="w-32 h-32" /> : <Footprints className="w-32 h-32" />}
                        </div>

                        <div className="relative z-10">
                          <div className="flex items-center gap-2 text-xs font-bold text-primary mb-3 bg-primary/10 w-fit px-3 py-1.5 rounded-full uppercase tracking-wide">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          
                          <h3 className="font-black text-xl leading-tight mb-2 text-foreground/90">{s.title}</h3>
                          
                          {s.description && (
                            <p className="text-sm text-muted-foreground/80 mb-4 line-clamp-2 font-medium">{s.description}</p>
                          )}
                          
                          <div className="flex items-center gap-2 text-sm text-primary font-bold bg-muted/50 p-2.5 rounded-2xl border border-primary/5">
                            <MapPin className="h-4 w-4 shrink-0" />
                            {s.venue}
                          </div>
                        </div>
                      </motion.div>
                      
                      {/* Desktop alignment spacer */}
                      <div className="hidden md:block md:w-[calc(50%-3rem)]" />
                    </div>
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

