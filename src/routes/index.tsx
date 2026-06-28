import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { QrCode, Users, Calendar, ArrowRight, Activity, Clock, ShieldCheck, ScanLine, BarChart3, UsersRound, Map, Zap } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

import { useState, useEffect } from "react";
import { localDb } from "@/lib/local-db";

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

function Countdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const target = new Date(targetDate).getTime();

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const difference = target - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      }
    };

    calculateTimeLeft(); // Initial call
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className="flex items-center gap-4 sm:gap-6">
      {[
        { value: timeLeft.days, label: "Days" },
        { value: timeLeft.hours, label: "Hours" },
        { value: timeLeft.minutes, label: "Mins" },
        { value: timeLeft.seconds, label: "Secs" },
      ].map((s) => (
        <div key={s.label} className="text-center min-w-[48px] sm:min-w-[56px]">
          <div className="text-[#2c1208] font-bold text-xl sm:text-2xl tabular-nums leading-none">
            {s.value.toString().padStart(2, "0")}
          </div>
          <div className="text-[#8a4a22]/60 text-[0.6rem] sm:text-[0.65rem] uppercase tracking-widest mt-1.5">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function Landing() {
  const [stats, setStats] = useState<{ students: number | null, attendance: number | null, clubs: number | null }>({
    students: null,
    attendance: null,
    clubs: null
  });

  useEffect(() => {
    function computeStats() {
      const students = localDb.getStudents().length;
      const attendance = localDb.getAllAttendance().length;
      const clubs = localDb.getClubRegistrations().length;
      setStats({ students, attendance, clubs });
    }

    computeStats();
    // Re-compute when localStorage changes (e.g. admin scans someone)
    const handler = () => computeStats();
    window.addEventListener("local-db-update", handler);
    window.addEventListener("storage", handler);
    const interval = setInterval(computeStats, 15000);
    return () => {
      window.removeEventListener("local-db-update", handler);
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, []);

  const students = stats.students;
  const scans = stats.attendance;
  const clubs = stats.clubs;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden min-h-[92svh] flex items-center">
        {/* Gradient base */}
        <div className="bg-hero-premium absolute inset-0" />

        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
          <div className="orb orb-4" />
          
          <div className="hero-ring hero-ring-1" />
          <div className="hero-ring hero-ring-2" />
          <div className="hero-ring hero-ring-3" />
          
          <div className="hero-particle hp1" /><div className="hero-particle hp2" />
          <div className="hero-particle hp3" /><div className="hero-particle hp4" />
          <div className="hero-particle hp5" /><div className="hero-particle hp6" />
          <div className="hero-particle hp7" /><div className="hero-particle hp8" />
          <div className="hero-particle hp9" /><div className="hero-particle hp10" />
        </div>

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
              <Button variant="liquidGlassDark" size="lg" asChild className="h-12 px-7 rounded-full font-medium">
                <Link to="/attendance">
                  <QrCode className="mr-2 h-4 w-4" />
                  Lodge Attendance
                </Link>
              </Button>
            </motion.div>

            {/* Countdown timer */}
            <motion.div
              className="mt-12 glass-card-hero px-6 py-4 inline-flex items-center flex-wrap gap-x-6 gap-y-3"
              variants={{ hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.9, delay: 0.15 } } }}
            >
              <div className="flex items-center gap-3 pr-4 sm:pr-6 border-r border-[#8a4a22]/20">
                <div className="bg-[#8a4a22]/10 p-2 rounded-full hidden sm:block">
                  <Clock className="h-5 w-5 text-[#8a4a22]/70" />
                </div>
                <span className="text-[#8a4a22]/80 text-[0.65rem] font-bold uppercase tracking-[0.2em] leading-tight text-left">
                  Induction<br/>Begins In
                </span>
              </div>
              <Countdown targetDate="2026-08-24T09:00:00+05:30" />
            </motion.div>
          </motion.div>
        </div>
      </section>



      {/* Live Stats Section */}
      <section className="container mx-auto max-w-5xl px-4 py-16 pt-24">
        <div className="glass-card-hero p-8 sm:p-12 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="max-w-md text-center md:text-left">
            <h2 className="text-2xl font-bold sm:text-3xl text-[#2c1208]">Live Impact</h2>
            <p className="mt-3 text-[#7a4020]/70 leading-relaxed text-sm sm:text-base">
              Watch our community grow in real-time as new students register, scan in, and join clubs across campus.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 sm:gap-x-12 gap-y-8">
            {[
              { value: students ?? "—", label: "Registered" },
              { value: scans ?? "—",   label: "QR Scans"   },
              { value: clubs ?? "—",   label: "Club Joins" },
              { value: "5",            label: "Days"       },
            ].map((s) => (
              <div key={s.label} className="text-center min-w-[72px]">
                <div className="text-[#2c1208] font-bold text-4xl sm:text-5xl tabular-nums leading-none">{s.value}</div>
                <div className="text-[#8a4a22]/60 text-xs uppercase tracking-[0.15em] mt-3">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center mb-14">
          <h2 className="text-3xl font-bold sm:text-4xl text-[#2c1208] tracking-tight">Built for the rush.</h2>
          <p className="mt-4 text-[#7a4020]/80 text-lg">
            Everything you need to onboard thousands of students without lines, paper, or chaos.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: ScanLine, title: "Instant QR attendance", body: "Scan a poster, mark attendance in under a second. Duplicates blocked automatically." },
            { icon: BarChart3, title: "Realtime dashboards", body: "Admins watch registrations flow in live — no refresh, no waiting." },
            { icon: UsersRound, title: "Clubs in one tap", body: "Browse 30+ clubs and societies. Join your tribe before classes start." },
          ].map((f) => (
            <div key={f.title} className="rounded-[1.5rem] border border-[#8a4a22]/15 bg-white/60 p-8 shadow-sm transition-all duration-300 hover:shadow-elegant hover:-translate-y-1">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#8a4a22]/5 text-[#8a4a22] shadow-sm ring-1 ring-inset ring-[#8a4a22]/20 mb-6">
                <f.icon className="h-7 w-7 stroke-[1.5]" />
              </div>
              <h3 className="text-lg font-bold text-[#2c1208]">{f.title}</h3>
              <p className="mt-2 text-sm text-[#7a4020]/75 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-white/80 border-t border-[#8a4a22]/10 pt-16 pb-8 mt-16 relative overflow-hidden backdrop-blur-xl">
        <div className="container mx-auto max-w-6xl px-4 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8 lg:gap-12 mb-16">
            
            {/* Branding & Privacy */}
            <div className="md:col-span-5 lg:col-span-6 flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-[#8a4a22]/20">
                  A
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-[#2c1208] tracking-tight leading-none">Aarambh</span>
                  <span className="text-[0.7rem] font-bold text-[#8a4a22] uppercase tracking-[0.2em] mt-1.5">Induction 2026</span>
                </div>
              </div>
              
              <p className="text-sm text-[#7a4020]/70 leading-relaxed max-w-md">
                The official student induction platform for K.R. Mangalam University. Simplifying onboarding, scheduling, and community building for the incoming class of 2026.
              </p>

              <div className="flex items-start gap-3 bg-[#8a4a22]/5 p-4 rounded-xl border border-[#8a4a22]/10 mt-2 max-w-md">
                <ShieldCheck className="h-5 w-5 text-[#8a4a22] shrink-0 mt-0.5" />
                <p className="text-xs text-[#5a2c14] leading-relaxed">
                  <strong className="block mb-1 text-[#2c1208]">Enterprise Security</strong> 
                  End-to-end encrypted and strictly for university onboarding. We never track location or share data.
                </p>
              </div>
            </div>

            {/* Quick Links */}
            <div className="md:col-span-3 lg:col-span-3 md:col-start-7 lg:col-start-8 flex flex-col gap-4 mt-2 md:mt-0">
              <h4 className="text-sm font-bold text-[#2c1208] uppercase tracking-wider mb-2">Platform</h4>
              <nav className="flex flex-col gap-3.5">
                <Link to="/attendance" className="text-sm text-[#7a4020]/70 hover:text-[#8a4a22] transition-colors inline-flex items-center gap-2.5">
                  <QrCode className="h-4 w-4" /> Attendance
                </Link>
                <Link to="/schedule" className="text-sm text-[#7a4020]/70 hover:text-[#8a4a22] transition-colors inline-flex items-center gap-2.5">
                  <Calendar className="h-4 w-4" /> Schedule
                </Link>
                <Link to="/announcements" className="text-sm text-[#7a4020]/70 hover:text-[#8a4a22] transition-colors inline-flex items-center gap-2.5">
                  <Activity className="h-4 w-4" /> Announcements
                </Link>
              </nav>
            </div>

            {/* Support / Legal */}
            <div className="md:col-span-3 lg:col-span-2 flex flex-col gap-4 mt-2 md:mt-0">
              <h4 className="text-sm font-bold text-[#2c1208] uppercase tracking-wider mb-2">Resources</h4>
              <nav className="flex flex-col gap-3.5">
                <Link to="/help" className="text-sm text-[#7a4020]/70 hover:text-[#8a4a22] transition-colors">Help Center</Link>
                <Link to="/privacy" className="text-sm text-[#7a4020]/70 hover:text-[#8a4a22] transition-colors">Privacy Policy</Link>
                <Link to="/terms" className="text-sm text-[#7a4020]/70 hover:text-[#8a4a22] transition-colors">Terms of Service</Link>
                <Link to="/admin/login" className="mt-2 flex items-center justify-between bg-[#8a4a22]/5 border border-[#8a4a22]/10 rounded-xl p-3 hover:bg-[#8a4a22]/10 transition-colors group">
                  <span className="text-xs font-bold text-[#5a2c14] leading-tight">Admin<br />Portal</span>
                  <ArrowRight className="h-4 w-4 text-[#8a4a22] group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </nav>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-8 border-t border-[#8a4a22]/10">
            <div className="text-xs text-[#7a4020]/60 font-medium tracking-wide flex items-center">
              &copy; 2024 EOZKA. <span className="mx-2 text-[#7a4020]/30">•</span> All rights reserved.
            </div>
            <a href="https://eozka.com" target="_blank" rel="noreferrer" className="flex items-center gap-5 bg-white border border-[#8a4a22]/15 rounded-full px-8 py-3 hover:shadow-md hover:border-[#8a4a22]/30 transition-all">
              <span className="text-[15px] font-bold text-[#7a4020]/80 uppercase tracking-[0.12em] leading-none">Engineered & Co-powered by</span>
              <div className="w-[2px] h-7 bg-[#8a4a22]/20"></div>
              <img src="/eozka-logo.jpg" alt="eOzka" className="h-14 w-auto mix-blend-multiply object-contain scale-[1.1]" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
