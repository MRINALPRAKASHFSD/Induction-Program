import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import { User, Award, CalendarDays, Zap, ArrowRight, ShieldCheck, Bell } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { localDb, type LocalStudent } from "@/lib/local-db";
import { lookupStudent } from "@/lib/students.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/my-pass")({
  head: () => ({
    meta: [
      { title: "My Digital Pass · KRMU Induction" },
      { name: "description", content: "Your KRMU Induction Digital Pass and Profile." },
    ],
  }),
  component: MyPassPage,
});

function MyPassPage() {
  const [profile, setProfile] = useState<LocalStudent | null>(null);
  const [livePoints, setLivePoints] = useState<number | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const p = localDb.getStudentProfile();
    if (p) {
      setProfile(p);
      
      // Generate QR Code
      QRCode.toDataURL(JSON.stringify({ type: 'student_pass', enrollment_no: p.enrollment_no }), {
        width: 300,
        margin: 2,
        color: { dark: "#2d0d12", light: "#ffffff00" }, // Transparent background
      })
        .then(setQrCodeUrl)
        .catch(console.error);

      // Fetch live points from server
      lookupStudent({ data: { enrollment_no: p.enrollment_no } })
        .then((res: any) => {
          if (res.student) {
            setLivePoints(res.student.points || 0);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (!profile && !loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-hero text-primary-foreground shadow-elegant">
            <User className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-2xl font-bold">Profile Not Found</h1>
          <p className="mt-2 text-muted-foreground">You need to register first to view your Digital Pass.</p>
          <div className="mt-8">
            <Button asChild variant="liquidGlassMaroon" size="lg" className="rounded-full">
              <Link to="/register">Register Now</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <SiteHeader />
      
      {/* Decorative background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[500px] w-[500px] rounded-full bg-accent/10 blur-3xl" />
      </div>

      <main className="relative container mx-auto max-w-md px-4 py-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Digital Pass</h1>
            <p className="text-sm text-muted-foreground">Aarambh 2026</p>
          </div>

          {/* Glassmorphism ID Card */}
          <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-xl isolate">
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/20 via-transparent to-accent/20" />
            
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-foreground drop-shadow-sm">{profile?.full_name}</h2>
                <p className="font-mono text-sm font-medium text-primary mt-1 flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" /> {profile?.enrollment_no}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 backdrop-blur-md">
                <User className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-6 space-y-3 text-sm font-medium text-muted-foreground">
              <div className="flex flex-col bg-white/40 p-3 rounded-xl border border-white/40">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/80">Program</span>
                <span className="text-foreground">{profile?.branch}</span>
              </div>
              <div className="flex flex-col bg-white/40 p-3 rounded-xl border border-white/40">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/80">Semester</span>
                <span className="text-foreground">{profile?.semester}</span>
              </div>
            </div>

            {/* QR Code Section */}
            <div className="mt-8 flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-inner">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="Digital Pass QR" className="h-48 w-48 object-contain mix-blend-multiply" />
              ) : (
                <div className="h-48 w-48 animate-pulse bg-muted rounded-xl" />
              )}
              <p className="mt-3 text-xs font-medium text-muted-foreground text-center">
                Scan at entry points and clubs
              </p>
            </div>
          </div>

          {/* Gamification Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-3xl border bg-card/60 backdrop-blur-md p-5 shadow-sm text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Award className="h-8 w-8 mx-auto text-yellow-500 mb-2 drop-shadow-sm" />
              <div className="text-2xl font-black text-foreground">
                {livePoints !== null ? livePoints : "..."}
              </div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">Total Points</div>
            </div>
            <div className="rounded-3xl border bg-card/60 backdrop-blur-md p-5 shadow-sm text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Zap className="h-8 w-8 mx-auto text-blue-500 mb-2 drop-shadow-sm" />
              <div className="text-2xl font-black text-foreground">
                TBD
              </div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">Global Rank</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-3 pt-4">
            <Button asChild variant="liquidGlassDark" className="w-full h-14 rounded-2xl justify-between px-6 font-medium text-base group">
              <Link to="/schedule">
                <span className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-primary/80" /> My Schedule</span>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            </Button>
            <Button asChild variant="liquidGlassDark" className="w-full h-14 rounded-2xl justify-between px-6 font-medium text-base group">
              <Link to="/clubs">
                <span className="flex items-center gap-3"><Award className="h-5 w-5 text-primary/80" /> Explore Clubs</span>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            </Button>
            <Button asChild variant="liquidGlassDark" className="w-full h-14 rounded-2xl justify-between px-6 font-medium text-base group">
              <Link to="/announcements">
                <span className="flex items-center gap-3"><Bell className="h-5 w-5 text-primary/80" /> Announcements</span>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            </Button>
          </div>

        </motion.div>
      </main>
    </div>
  );
}
