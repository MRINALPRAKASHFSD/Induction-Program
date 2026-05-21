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
        <div className="bg-hero absolute inset-0 opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,white_0%,transparent_50%)] opacity-10" />
        <div className="container relative mx-auto max-w-6xl px-4 py-20 sm:py-28 text-primary-foreground">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> KRMU Induction 2026
            </div>
            <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-6xl">
              Five days. Ten thousand students.
              <br />
              <span className="text-accent">One seamless platform.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-primary-foreground/90 sm:text-lg">
              Scan a QR, register in 30 seconds, and join the clubs that shape your university journey.
              Built for speed, real-time, and zero queues.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild className="bg-white text-primary hover:bg-white/90 shadow-elegant">
                <Link to="/register">
                  Register now <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                <Link to="/clubs">Browse clubs</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Live counters */}
      <section className="container mx-auto -mt-10 max-w-6xl px-4">
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
