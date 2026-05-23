import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { QrCode, Users, Calendar, Sparkles, ArrowRight, Activity } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { useLiveCount } from "@/hooks/use-live-count";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KRMU Induction — Scan, Register, Belong" },
      {
        name: "description",
        content:
          "Real-time QR-based attendance and registration for K.R. Mangalam University's 5-day student induction.",
      },
    ],
  }),
  component: Landing,
});

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border bg-card-soft p-4 text-center shadow-sm">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Landing() {
  const students = useLiveCount("students");
  const scans = useLiveCount("attendance");
  const clubs = useLiveCount("club_registrations");

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-hero-premium absolute inset-0 opacity-95" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj4KICA8ZmlsdGVyIGlkPSJub2lzZSI+CiAgICA8ZmVDb2xvck1hdHJpeCB0eXBlPSJtYXRyaXgiIHZhbHVlcz0iMSAwIDAgMCAwICAwIDEgMCAwIDAgIDAgMCAxIDAgMCAgMCAwIDAgMSAwIiAvPgogICAgPGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuODUiIG51bU9jdGF2ZXM9IjMiIHN0aXRjaFRpbGVzPSJzdGl0Y2giIC8+CiAgICA8ZmVDb2xvck1hdHJpeCB0eXBlPSJtYXRyaXgiIHZhbHVlcz0iMSAwIDAgMCAwICAwIDEgMCAwIDAgIDAgMCAxIDAgMCAgMCAwIDAgMC4xNSAwIiAvPgogIDwvZmlsdGVyPgogIDxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNub2lzZSkiIC8+Cjwvc3ZnPg==')] opacity-30 mix-blend-overlay pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,white_0%,transparent_50%)] opacity-10" />
        
        <div className="container relative mx-auto max-w-6xl px-4 py-20 sm:py-28 text-primary-foreground">
          <motion.div 
            className="max-w-2xl"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.15 }
              }
            }}
          >
            <motion.div variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.8 } }
            }}>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest backdrop-blur border border-white/20 shadow-sm">
                <Sparkles className="h-4 w-4 animate-sparkle text-accent" /> KRMU Induction 2026
              </div>
            </motion.div>

            <motion.h1 
              className="mt-6 text-5xl font-extrabold tracking-tight leading-[1.1] sm:text-7xl"
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.8 } }
              }}
            >
              10,000 Students.<br />
              5 Days of Discovery.<br />
              <span className="highlight">One Seamless Journey.</span>
            </motion.h1>

            <motion.p 
              className="mt-6 max-w-xl text-base text-primary-foreground/90 sm:text-lg leading-relaxed font-medium"
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.8 } }
              }}
            >
              Skip the queues. Scan your personalized QR, secure your boarding pass in 30 seconds, and check into sessions effortlessly.
            </motion.p>

            <motion.div 
              className="mt-10 flex flex-wrap gap-4"
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.8 } }
              }}
            >
              <Button size="lg" asChild className="btn-hover-arrow btn-hover-scale bg-white text-primary hover:bg-white/95 shadow-elegant h-12 px-7 rounded-full font-semibold">
                <Link to="/register">
                  Register now <ArrowRight className="ml-1.5 h-4 w-4 hover-arrow" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="btn-hover-scale border-white/30 bg-white/10 text-white hover:bg-white/20 h-12 px-7 rounded-full font-medium backdrop-blur">
                <Link to="/attendance">
                  <QrCode className="mr-2 h-4 w-4" />
                  Self-Attendance
                </Link>
              </Button>
              {/* Optional quick link for Admins to scan student passes */}
              <Button size="lg" variant="ghost" asChild className="btn-hover-scale text-white hover:bg-white/10 hover:text-white h-12 px-7 rounded-full font-medium">
                <Link to="/admin/scanner">
                  Admin Scanner
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Live counters */}
      <section className="container mx-auto -mt-10 max-w-6xl px-4 relative z-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Students registered" value={students ?? "—"} />
          <Stat label="Live QR scans" value={scans ?? "—"} />
          <Stat label="Club joins" value={clubs ?? "—"} />
          <Stat label="Days of induction" value={5} />
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Built for the rush.</h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to onboard thousands of students without lines, paper, or chaos.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { icon: QrCode, title: "Instant QR attendance", body: "Scan a poster, mark attendance in under a second. Duplicates blocked automatically." },
            { icon: Activity, title: "Realtime dashboards", body: "Admins watch registrations flow in live — no refresh, no waiting." },
            { icon: Users, title: "Clubs in one tap", body: "Browse 30+ clubs and societies. Join your tribe before classes start." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card-soft p-6 shadow-sm transition hover:shadow-elegant">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t bg-muted/30 py-8">
        <div className="container mx-auto max-w-6xl px-4 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" /> K.R. Mangalam University · Induction 2026
          </div>
          <Link to="/admin/login" className="hover:text-foreground">Admin sign in</Link>
        </div>
      </footer>
    </div>
  );
}
