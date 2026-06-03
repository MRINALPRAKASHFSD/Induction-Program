import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { QrCode, Users, Calendar, ArrowRight, Activity } from "lucide-react";
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


function Landing() {
  const students = useLiveCount("students");
  const scans = useLiveCount("attendance");
  const clubs = useLiveCount("club_registrations");

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden min-h-[92svh] flex items-center">
        {/* Gradient base */}
        <div className="bg-hero-premium absolute inset-0" />

        {/* Rotating rings */}
        <div className="hero-ring hero-ring-1" />
        <div className="hero-ring hero-ring-2" />
        <div className="hero-ring hero-ring-3" />

        {/* Floating orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        {/* Floating particles */}
        <div className="hero-particle hp1" /><div className="hero-particle hp2" />
        <div className="hero-particle hp3" /><div className="hero-particle hp4" />
        <div className="hero-particle hp5" /><div className="hero-particle hp6" />
        <div className="hero-particle hp7" /><div className="hero-particle hp8" />
        <div className="hero-particle hp9" /><div className="hero-particle hp10" />

        {/* Subtle noise texture */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj4KICA8ZmlsdGVyIGlkPSJub2lzZSI+CiAgICA8ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44NSIgbnVtT2N0YXZlcz0iMyIgc3RpdGNoVGlsZXM9InN0aXRjaCIgLz4KICAgIDxmZUNvbG9yTWF0cml4IHR5cGU9Im1hdHJpeCIgdmFsdWVzPSIxIDAgMCAwIDAgIDAgMSAwIDAgMCAgMCAwIDEgMCAwICAwIDAgMCAwLjA4IDAiIC8+ICAKICA8L2ZpbHRlcj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2UpIiAvPgo8L3N2Zz4=')] opacity-40 mix-blend-multiply pointer-events-none" />

        <div className="container relative mx-auto max-w-6xl px-4 py-24 sm:py-32">
          <motion.div
            className="max-w-3xl"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.2 } },
            }}
          >
            {/* Eyebrow */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.7 } } }}
            >
              <span className="aarambh-year">K.R. Mangalam University · Student Induction</span>
            </motion.div>

            {/* Wordmark with shimmer */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 1.1 } } }}
              className="mt-5"
            >
              <div className="aarambh-wordmark-wrap">
                <h1 className="aarambh-wordmark text-[3rem] sm:text-[4.8rem] lg:text-[6.2rem]">
                  Aarambh
                </h1>
              </div>
              <p className="aarambh-year mt-2.5 tracking-[0.32em]">2 0 2 6</p>
            </motion.div>

            {/* Divider */}
            <motion.div
              variants={{ hidden: { opacity: 0, scaleX: 0 }, visible: { opacity: 1, scaleX: 1, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.9 } } }}
              style={{ transformOrigin: "left" }}
            >
              <div className="hero-divider" />
            </motion.div>

            {/* Tagline */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.9 } } }}
            >
              <p className="text-[#2c1208] text-xl sm:text-[1.65rem] font-medium leading-snug tracking-wide max-w-lg">
                Your beginning.{" "}
                <span className="aarambh-tagline text-[#1e0c06] font-semibold">Make it count.</span>
              </p>
              <p className="mt-3.5 text-[#7a4020]/70 text-sm sm:text-base font-normal max-w-xs leading-relaxed">
                Scan in. Stand out. Belong.
              </p>
            </motion.div>

            {/* CTA buttons */}
            <motion.div
              className="mt-10 flex flex-wrap gap-3"
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.85 } } }}
            >
              <Button variant="liquidGlassWhite" size="lg" asChild className="btn-hover-arrow h-12 px-7 rounded-full font-semibold">
                <Link to="/register">
                  Register now <ArrowRight className="ml-1.5 h-4 w-4 hover-arrow" />
                </Link>
              </Button>
              <Button variant="liquidGlass" size="lg" asChild className="h-12 px-7 rounded-full font-medium">
                <Link to="/attendance">
                  <QrCode className="mr-2 h-4 w-4" />
                  Lodge Attendance
                </Link>
              </Button>
            </motion.div>

            {/* Glass stat strip */}
            <motion.div
              className="mt-12 glass-card-hero px-6 py-4 inline-flex flex-wrap gap-x-8 gap-y-3"
              variants={{ hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.9, delay: 0.15 } } }}
            >
              {[
                { value: students ?? "—", label: "Registered" },
                { value: scans ?? "—",   label: "QR Scans"   },
                { value: clubs ?? "—",   label: "Club Joins" },
                { value: "5",            label: "Days"       },
              ].map((s) => (
                <div key={s.label} className="text-center min-w-[56px]">
                  <div className="text-[#2c1208] font-bold text-xl tabular-nums leading-none">{s.value}</div>
                  <div className="text-[#8a4a22]/60 text-[0.65rem] uppercase tracking-widest mt-1.5">{s.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>
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

      <footer className="panel-liquid-glass py-8">
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
