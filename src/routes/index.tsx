import { createFileRoute, Link } from "@tanstack/react-router";
import { m, LazyMotion, domAnimation, AnimatePresence } from "framer-motion";
import { Users, Calendar, Activity, Clock, ShieldCheck, ScanLine, BarChart3, UsersRound, Map, Zap, Megaphone, QrCode, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

import React, { useState, useEffect } from "react";


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

const Countdown = React.memo(function Countdown({ targetDate }: { targetDate: string }) {
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
    <div className="flex items-center gap-3 sm:gap-5">
      {[
        { value: timeLeft.days, label: "Days" },
        { value: timeLeft.hours, label: "Hours" },
        { value: timeLeft.minutes, label: "Mins" },
        { value: timeLeft.seconds, label: "Secs" },
      ].map((s) => (
        <div key={s.label} className="text-center min-w-[56px] sm:min-w-[64px] flex flex-col items-center">
          <div className="bg-white/40 border border-white/50 shadow-sm rounded-xl w-full h-[48px] sm:h-[56px] backdrop-blur-md relative overflow-hidden flex items-center justify-center">
            <AnimatePresence>
              <m.span
                key={s.value}
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-100%", opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="absolute text-[#2c1208] font-black text-2xl sm:text-3xl tabular-nums leading-none"
              >
                {s.value.toString().padStart(2, "0")}
              </m.span>
            </AnimatePresence>
          </div>
          <div className="text-[#8a4a22]/70 text-[0.6rem] sm:text-[0.65rem] font-bold uppercase tracking-widest mt-2">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
});

function Landing() {
  const [stats, setStats] = useState<{ students: number | null, attendance: number | null, clubs: number | null }>({
    students: null,
    attendance: null,
    clubs: null
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/live-impact");
        if (!res.ok) return;
        const data = await res.json();
        setStats({
          students: data.students ?? 0,
          attendance: data.attendance ?? 0,
          clubs: data.clubs ?? 0,
        });
      } catch {
        // silently fail — keep showing previous values
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const students = stats.students;
  const scans = stats.attendance;
  const clubs = stats.clubs;

  return (
    <LazyMotion features={domAnimation}>
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
          <div className="hero-ring hero-ring-4" />
          <div className="hero-ring hero-ring-5" />
          
          <div className="hero-particle hp1" /><div className="hero-particle hp2" />
          <div className="hero-particle hp3" /><div className="hero-particle hp4" />
          <div className="hero-particle hp5" /><div className="hero-particle hp6" />
          <div className="hero-particle hp7" /><div className="hero-particle hp8" />
          <div className="hero-particle hp9" /><div className="hero-particle hp10" />
          <div className="hero-particle hp11" /><div className="hero-particle hp12" />
        </div>

        {/* Subtle noise texture */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj4KICA8ZmlsdGVyIGlkPSJub2lzZSI+CiAgICA8ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44NSIgbnVtT2N0YXZlcz0iMyIgc3RpdGNoVGlsZXM9InN0aXRjaCIgLz4KICAgIDxmZUNvbG9yTWF0cml4IHR5cGU9Im1hdHJpeCIgdmFsdWVzPSIxIDAgMCAwIDAgIDAgMSAwIDAgMCAgMCAwIDEgMCAwICAwIDAgMCAwLjA4IDAiIC8+ICAKICA8L2ZpbHRlcj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2UpIiAvPgo8L3N2Zz4=')] opacity-40 mix-blend-multiply pointer-events-none" />

        <div className="container relative mx-auto max-w-6xl px-4 py-24 sm:py-32">
          <div className="max-w-3xl">
            {/* Eyebrow */}
            <div className="css-animate-fade-in-up">
              <span className="aarambh-year">K.R. Mangalam University · Student Induction</span>
            </div>

            {/* Wordmark with shimmer */}
            <div className="mt-5 css-animate-fade-in-up css-delay-1">
              <div className="aarambh-wordmark-wrap">
                <h1 className="aarambh-wordmark text-[2.75rem] sm:text-[4.8rem] lg:text-[6.2rem]">
                  Aarambh
                </h1>
              </div>
              <p className="aarambh-year mt-2.5 tracking-[0.32em]">2 0 2 6</p>
            </div>

            {/* Divider */}
            <div className="css-animate-scale-x css-delay-1">
              <div className="hero-divider" />
            </div>

            {/* Tagline */}
            <div className="css-animate-fade-in-up css-delay-2">
              <p className="text-[#2c1208] text-lg sm:text-[1.65rem] font-medium leading-snug tracking-wide max-w-lg">
                Your beginning.{" "}
                <span className="aarambh-tagline text-[#1e0c06] font-semibold">Make it count.</span>
              </p>
              <p className="mt-3.5 text-[#7a4020]/70 text-sm sm:text-base font-normal max-w-xs leading-relaxed">
                Scan in. Stand out. Belong.
              </p>
            </div>

            {/* CTA buttons */}
            <div className="mt-10 flex flex-col sm:flex-row flex-wrap gap-3 css-animate-fade-in-up css-delay-2">
              <Button variant="liquidGlassWhite" size="lg" asChild className="btn-hover-arrow h-12 px-7 rounded-full font-semibold w-full sm:w-auto" aria-label="Register Now">
                <Link to="/register">
                  Register now <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1.5 h-4 w-4 hover-arrow"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </Link>
              </Button>
              <Button variant="liquidGlassDark" size="lg" asChild className="h-12 px-7 rounded-full font-medium w-full sm:w-auto" aria-label="Lodge Attendance">
                <Link to="/attendance">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
                  Lodge Attendance
                </Link>
              </Button>
            </div>

            {/* Countdown timer */}
            <div className="mt-12 glass-card-hero px-6 py-5 inline-flex items-center flex-wrap gap-x-6 gap-y-4 rounded-[2rem] css-animate-fade-in-up css-delay-3">
              <div className="flex items-center gap-4 pr-4 sm:pr-6 border-r border-[#8a4a22]/15">
                <div className="relative hidden sm:block">
                  <div className="bg-white/60 p-2.5 rounded-2xl shadow-sm border border-white/50 relative z-10">
                    <m.div 
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
                    >
                      <Clock className="h-6 w-6 text-[#8a4a22]" />
                    </m.div>
                  </div>
                  {/* Subtle pulse ring */}
                  <m.div 
                    className="absolute inset-0 border-2 border-[#8a4a22]/30 rounded-2xl z-0"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0, 0] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                  />
                </div>
                <span className="text-[#8a4a22]/90 text-xs sm:text-sm font-black uppercase tracking-[0.25em] leading-tight text-left">
                  Induction<br/>Begins In
                </span>
              </div>
              <Countdown targetDate="2026-08-24T09:00:00+05:30" />
            </div>
          </div>
        </div>
      </section>



      {/* Live Stats Section */}
      <section className="container mx-auto max-w-5xl px-4 py-16 pt-24">
        <div className="glass-card-hero p-6 sm:p-12 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-8 sm:gap-10 relative overflow-hidden group border-[#8a4a22]/20 hover:border-[#8a4a22]/30 transition-colors">
          <div className="absolute top-0 bottom-0 left-[-100%] w-[100%] bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:left-[100%] transition-all duration-[1500ms] ease-in-out z-0" />
          <div className="max-w-md text-center md:text-left relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#8a4a22]/10 border border-[#8a4a22]/20 mb-5 shadow-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c87038] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#a84a25]"></span>
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a4a22] leading-none mt-[1px]">Live Updates</span>
            </div>
            <h2 className="text-3xl font-bold sm:text-4xl text-[#2c1208] tracking-tight">Real-time Impact</h2>
            <p className="mt-4 text-[#7a4020]/80 leading-relaxed text-base">
              Watch our community grow instantly as new students register, scan in, and join clubs across campus.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 sm:gap-x-14 gap-y-8 sm:gap-y-10 relative z-10">
            {[
              { value: students ?? "—", label: "Registered" },
              { value: scans ?? "—",   label: "QR Scans"   },
              { value: clubs ?? "—",   label: "Club Joins" },
              { value: "5",            label: "Days"       },
            ].map((s) => (
              <div key={s.label} className="text-center min-w-[72px] group/stat">
                <div className="font-black text-4xl sm:text-5xl tabular-nums leading-none bg-gradient-to-br from-[#2c1208] via-[#5a2c14] to-[#8a4a22] bg-clip-text text-transparent group-hover/stat:scale-105 transition-transform origin-bottom">{s.value}</div>
                <div className="text-[#8a4a22]/70 text-[11px] font-bold uppercase tracking-[0.2em] mt-4">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto max-w-6xl px-4 py-24">
        <div className="mx-auto max-w-2xl text-center mb-16 relative">
          <h2 className="text-4xl font-black sm:text-5xl text-[#2c1208] tracking-tight">Built for the rush.</h2>
          <div className="h-1 w-24 bg-gradient-to-r from-[#a84a25] to-[#c87038] mx-auto mt-6 rounded-full opacity-80" />
          <p className="mt-7 text-[#7a4020]/80 text-lg leading-relaxed max-w-xl mx-auto">
            Everything you need to onboard thousands of students without lines, paper, or chaos.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: QrCode, title: "Instant QR attendance", body: "Scan a poster, mark attendance in under a second. Duplicates blocked automatically." },
            { icon: Activity, title: "Realtime dashboards", body: "Admins watch registrations flow in live — no refresh, no waiting." },
            { icon: Users, title: "Clubs in one tap", body: "Browse 30+ clubs and societies. Join your tribe before classes start." },
          ].map((f) => (
            <div key={f.title} className="group relative rounded-[1.5rem] border border-[#8a4a22]/15 bg-white/60 p-8 shadow-sm transition-all duration-700 hover:shadow-elegant hover:-translate-y-2 overflow-hidden backdrop-blur-md">
              <div className="absolute inset-0 bg-gradient-to-br from-[#8a4a22]/[0.05] to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
              <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br from-[#c87038]/30 to-[#a84a25]/0 blur-3xl opacity-0 transition-all duration-700 group-hover:opacity-100 group-hover:scale-150 mix-blend-multiply" />
              <div className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:left-[100%] transition-all duration-1000 ease-in-out z-0" />
              
              <div className="relative z-10">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8a4a22]/10 to-[#8a4a22]/5 text-[#8a4a22] shadow-sm ring-1 ring-inset ring-[#8a4a22]/20 mb-6 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 group-hover:shadow-md group-hover:ring-[#8a4a22]/40">
                  <f.icon className="h-7 w-7 stroke-[1.5]" />
                </div>
                <h3 className="text-lg font-bold text-[#2c1208] transition-colors group-hover:text-[#8a4a22]">{f.title}</h3>
                <p className="mt-2 text-sm text-[#7a4020]/80 leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-white/80 border-t border-[#8a4a22]/15 pt-20 pb-10 mt-16 relative overflow-hidden backdrop-blur-xl">
        <div className="container mx-auto max-w-6xl px-4 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8 lg:gap-12 mb-16">
            
            {/* Branding & Privacy */}
            <div className="md:col-span-5 lg:col-span-6 flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-[#8a4a22]/30">
                  A
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-[#2c1208] tracking-tight leading-none">Aarambh</span>
                  <span className="text-[0.7rem] font-bold text-[#8a4a22] uppercase tracking-[0.2em] mt-1.5">Induction 2026</span>
                </div>
              </div>
              
              <p className="text-sm text-[#7a4020]/80 leading-relaxed max-w-md">
                The official student induction platform for K.R. Mangalam University. Simplifying onboarding, scheduling, and community building for the incoming class of 2026.
              </p>

              <div className="flex items-start gap-4 bg-gradient-to-br from-[#8a4a22]/5 to-transparent p-5 rounded-2xl border border-[#8a4a22]/15 mt-2 max-w-md transition-colors hover:border-[#8a4a22]/30 hover:bg-[#8a4a22]/10">
                <ShieldCheck className="h-6 w-6 text-[#8a4a22] shrink-0 mt-0.5" />
                <p className="text-xs text-[#7a4020] leading-relaxed">
                  <strong className="block mb-1 text-sm text-[#2c1208] tracking-tight">Enterprise Security</strong> 
                  End-to-end encrypted and strictly for university onboarding. We never track location or share data.
                </p>
              </div>
            </div>

            {/* Quick Links */}
            <div className="md:col-span-3 lg:col-span-3 md:col-start-7 lg:col-start-8 flex flex-col gap-5 mt-2 md:mt-0">
              <h4 className="text-sm font-bold text-[#2c1208] uppercase tracking-widest mb-1">Platform</h4>
              <nav className="flex flex-col gap-4">
                <Link to="/attendance" className="group text-sm text-[#7a4020]/80 hover:text-[#8a4a22] transition-all inline-flex items-center gap-3">
                  <QrCode className="h-4 w-4 transition-transform group-hover:scale-110" /> <span className="transition-transform group-hover:translate-x-1">Attendance</span>
                </Link>
                <Link to="/schedule" className="group text-sm text-[#7a4020]/80 hover:text-[#8a4a22] transition-all inline-flex items-center gap-3">
                  <Calendar className="h-4 w-4 transition-transform group-hover:scale-110" /> <span className="transition-transform group-hover:translate-x-1">Schedule</span>
                </Link>
                <Link to="/announcements" className="group text-sm text-[#7a4020]/80 hover:text-[#8a4a22] transition-all inline-flex items-center gap-3">
                  <Megaphone className="h-4 w-4 transition-transform group-hover:scale-110" /> <span className="transition-transform group-hover:translate-x-1">Announcements</span>
                </Link>
              </nav>
            </div>

            {/* Support / Legal */}
            <div className="md:col-span-3 lg:col-span-2 flex flex-col gap-5 mt-2 md:mt-0">
              <h4 className="text-sm font-bold text-[#2c1208] uppercase tracking-widest mb-1">Resources</h4>
              <nav className="flex flex-col gap-4">
                <Link to="/help" className="text-sm text-[#7a4020]/80 hover:text-[#8a4a22] hover:translate-x-1 transition-all">Help Center</Link>
                <Link to="/privacy" className="text-sm text-[#7a4020]/80 hover:text-[#8a4a22] hover:translate-x-1 transition-all">Privacy Policy</Link>
                <Link to="/terms" className="text-sm text-[#7a4020]/80 hover:text-[#8a4a22] hover:translate-x-1 transition-all">Terms of Service</Link>
                <Link to="/admin/login" className="mt-4 flex items-center justify-between bg-gradient-to-r from-[#8a4a22]/5 to-transparent border border-[#8a4a22]/15 rounded-xl p-3.5 hover:bg-[#8a4a22]/10 hover:border-[#8a4a22]/30 transition-all group">
                  <span className="text-[13px] font-bold text-[#5a2c14] leading-tight">Admin<br />Portal</span>
                  <ArrowRight className="h-4 w-4 text-[#8a4a22] group-hover:translate-x-1 transition-transform" />
                </Link>
              </nav>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-10 border-t border-[#8a4a22]/15">
            <div className="text-[13px] text-[#7a4020]/70 font-medium tracking-wide flex flex-wrap justify-center items-center text-center">
              &copy; 2024 EOZKA. <span className="mx-3 text-[#7a4020]/30 hidden sm:inline">•</span><br className="sm:hidden" /> All rights reserved.
            </div>
            <a href="https://eozka.com" target="_blank" rel="noreferrer" className="group flex flex-col sm:flex-row items-center gap-3 sm:gap-5 bg-white border border-[#8a4a22]/20 rounded-2xl sm:rounded-full px-6 sm:px-8 py-3.5 hover:shadow-xl hover:shadow-[#8a4a22]/5 hover:border-[#8a4a22]/40 transition-all text-center">
              <span className="text-[13px] font-bold text-[#7a4020]/90 uppercase tracking-[0.2em] leading-none">Engineered & Co-powered by</span>
              <div className="w-[1px] h-8 bg-[#8a4a22]/20 group-hover:bg-[#8a4a22]/40 transition-colors"></div>
              <img src="/eozka-logo.webp" alt="eOzka" loading="lazy" className="h-10 w-auto mix-blend-multiply object-contain scale-[1.25] group-hover:scale-[1.35] transition-transform" />
            </a>
          </div>
        </div>
      </footer>
      </div>
    </LazyMotion>
  );
}
