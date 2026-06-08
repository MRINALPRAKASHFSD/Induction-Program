import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, MapPin, ArrowLeft } from "lucide-react";
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
    <div className="min-h-screen bg-background pb-12">
      <SiteHeader />
      
      {/* Decorative background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-20 right-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <main className="relative container mx-auto max-w-md px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild className="rounded-full bg-muted/50">
                <Link to="/my-pass"><ArrowLeft className="h-5 w-5" /></Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
                <p className="text-sm text-muted-foreground">{isMasterView ? "Master Schedule" : profile.branch}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <Switch id="master-view" checked={isMasterView} onCheckedChange={toggleMasterView} />
                <Label htmlFor="master-view" className="text-xs font-medium cursor-pointer">Master View</Label>
              </div>
            </div>
          </div>

          {/* Days Scroller */}
          {days.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x hide-scrollbar">
              {days.map(d => (
                <button
                  key={d}
                  onClick={() => handleDaySelect(d)}
                  className={`snap-start shrink-0 flex flex-col items-center justify-center w-20 h-24 rounded-2xl transition-all ${
                    activeDay === d 
                    ? "bg-hero text-primary-foreground shadow-elegant scale-105" 
                    : "bg-card border hover:bg-muted"
                  }`}
                >
                  <span className="text-xs uppercase font-medium opacity-80 mb-1">Day</span>
                  <span className="text-3xl font-black">{d}</span>
                </button>
              ))}
            </div>
          )}

          {/* Timeline / Sessions */}
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
            {loading ? (
              <div className="text-center py-10"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground bg-card rounded-3xl border border-dashed">No sessions scheduled for this day.</div>
            ) : (
              sessions.map((s, idx) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  transition={{ delay: idx * 0.05 }}
                  key={s.id} 
                  className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary text-primary-foreground shadow shrink-0 z-10 font-bold text-xs">
                    {idx + 1}
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-5 rounded-3xl bg-card border shadow-sm group-hover:border-primary/50 transition-colors">
                    <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-2 bg-primary/10 w-fit px-2.5 py-1 rounded-full">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <h3 className="font-bold text-lg leading-tight mb-2">{s.title}</h3>
                    {s.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{s.description}</p>}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium bg-muted/40 p-2 rounded-xl">
                      <MapPin className="h-4 w-4 shrink-0 text-primary/60" />
                      {s.venue}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>

        </motion.div>
      </main>
    </div>
  );
}
