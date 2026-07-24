import { createFileRoute, Link } from "@tanstack/react-router";
import { m, LazyMotion, domAnimation, AnimatePresence } from "framer-motion";
import { Users, Calendar, Activity, Clock, ShieldCheck, ScanLine, UsersRound, Megaphone, QrCode, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

import React, { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";


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
          <div className="glass-premium-v2 rounded-xl w-full h-[48px] sm:h-[56px] flex items-center justify-center !p-0 overflow-hidden border-0">
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
          <div className="text-label text-secondary uppercase font-bold tracking-wider mt-2">
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

  const [isBgLoaded, setIsBgLoaded] = useState(false);
  const isMobile = useIsMobile();
  useEffect(() => {
    const timer = setTimeout(() => {
      // Defer rendering of heavy background elements to prioritize LCP
      setIsBgLoaded(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const students = stats.students;
  const scans = stats.attendance;
  const clubs = stats.clubs;

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Ambient Background */}
      {isBgLoaded && (
        <div className="ambient-bg bg-deferred-fade-in" aria-hidden="true">
          <div className="ambient-blob ambient-blob-1" />
          <div className="ambient-blob ambient-blob-2" />
          <div className="ambient-blob ambient-blob-3" />
          <div className="watermark">AARAMBH 2026</div>
        </div>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden min-h-[80svh] md:min-h-[92svh] flex items-center">
        {/* Gradient base */}
        <div className="bg-hero-premium absolute inset-0" />

        {/* Premium Ambient Stars */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="ambient-particles">
            {Array.from({ length: 30 }).map((_, i) => (
              <div key={`star-${i}`} className={`star-particle sp-${i + 1}`} />
            ))}
          </div>
        </div>

        {/* Decorative Orbit Widgets - Desktop Only */}
        {!isMobile && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <div className="orbit-widget orbit-widget-tl">
              <div className="ow-ring ow-ring-1" />
              <div className="ow-ring ow-ring-2" />
              <div className="ow-ring ow-ring-3" />
            </div>
            <div className="orbit-widget orbit-widget-br">
              <div className="ow-ring ow-ring-1" />
              <div className="ow-ring ow-ring-2" />
            </div>
          </div>
        )}

        {/* Main Orbit System — GPU compositor only, Desktop Only */}
        {isBgLoaded && !isMobile && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none bg-deferred-fade-in" aria-hidden="true">
            <div className="orbit-system">
              <div className="orbit-ring orbit-ring-1"><div className="orbit-node node-1-a orbit-node-trail-cw node-secondary" /><div className="orbit-node node-1-b" /></div>
              <div className="orbit-ring orbit-ring-2"><div className="orbit-node node-2-a orbit-node-trail-ccw node-primary living-node" /><div className="orbit-node node-2-b" /><div className="orbit-node node-2-c" /></div>
              <div className="orbit-ring orbit-ring-3"><div className="orbit-node node-3-a orbit-node-trail-cw node-accent" /></div>
              <div className="orbit-ring orbit-ring-4"><div className="orbit-node node-4-a orbit-node-trail-ccw node-accent living-node" /><div className="orbit-node node-4-b" /></div>
              <div className="orbit-ring orbit-ring-5"><div className="orbit-node node-5-a" /><div className="orbit-node node-5-b" /><div className="orbit-node node-5-c orbit-node-trail-cw node-secondary" /></div>
              <div className="orbit-ring orbit-ring-6"><div className="orbit-node node-6-a orbit-node-trail-ccw node-primary" /></div>
              <div className="orbit-ring orbit-ring-7"><div className="orbit-node node-7-a" /><div className="orbit-node node-7-b" /></div>
              <div className="orbit-ring orbit-ring-8"><div className="orbit-node node-8-a orbit-node-trail-ccw node-secondary living-node" /><div className="orbit-node node-8-b" /><div className="orbit-node node-8-c" /></div>
              <div className="orbit-ring orbit-ring-9"><div className="orbit-node node-9-a orbit-node-trail-cw node-primary" /></div>
              <div className="orbit-ring orbit-ring-10"><div className="orbit-node node-10-a orbit-node-trail-ccw node-primary" /><div className="orbit-node node-10-b" /></div>
              
              {/* Focal center */}
              <div className="orbit-center">
                <div className="orbit-center-halo" />
                <div className="orbit-center-core" />
              </div>
            </div>
          </div>
        )}

        <div className="container relative mx-auto max-w-6xl px-4 py-20 md:py-32">
          <div className="max-w-3xl">
            {/* Eyebrow */}
            <div className="css-animate-fade-in-up">
              <span className="aarambh-year text-[10px] sm:text-xs">K.R. Mangalam University · Student Induction</span>
            </div>

            {/* Wordmark with shimmer */}
            <div className="mt-4 sm:mt-5 css-animate-fade-in-up">
              <div className="aarambh-wordmark-wrap">
                <h1 className="aarambh-wordmark text-[3.25rem] sm:text-[4.8rem] lg:text-[6.2rem]">
                  AARAMBH
                </h1>
              </div>
              <p className="aarambh-year mt-2 sm:mt-2.5 tracking-[0.32em]">2 0 2 6</p>
            </div>

            {/* Divider */}
            <div className="css-animate-scale-x">
              <div className="hero-divider" />
            </div>

            {/* Tagline */}
            <div className="css-animate-fade-in-up mt-8 relative z-20">
              <div className="flex items-baseline flex-wrap text-[#2c1208] leading-none drop-shadow-sm">
                <span className="font-serif text-[1.75rem] sm:text-[2.25rem] md:text-[3rem] font-light tracking-tight opacity-90">Embracing</span>
                <span className="font-['Pinyon_Script',cursive] text-[2.5rem] sm:text-[3.5rem] md:text-[4.5rem] text-[#c87038] -ml-2 -mr-1 z-10 opacity-90 rotate-[-2deg] translate-y-1 sm:translate-y-2">the</span>
                <span className="font-serif text-[1.75rem] sm:text-[2.25rem] md:text-[3rem] font-bold tracking-tight text-[#1e0c06]">Horizons</span>
              </div>
              
              {/* Decorative line below Horizons */}
              <div className="mt-5 flex items-center gap-3 opacity-80">
                <div className="h-[1px] w-12 sm:w-20 bg-gradient-to-r from-transparent to-[#8a4a22]/50" />
                <div className="text-[#c87038] text-[0.65rem] animate-pulse">✦</div>
                <div className="h-[1px] w-32 sm:w-48 bg-gradient-to-l from-[#8a4a22]/50 to-transparent" />
              </div>

              <p className="mt-6 text-[#7a4020]/75 text-[0.95rem] sm:text-base font-normal max-w-xs leading-relaxed">
                Scan in. Stand out. Belong.
              </p>
            </div>

            {/* CTA buttons */}
            <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row flex-wrap gap-5 css-animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <Button variant="liquidGlassWhite" size="lg" asChild className="btn-hover-arrow min-h-[56px] h-14 sm:h-14 px-9 rounded-full font-semibold w-full sm:w-auto shadow-[0_8px_30px_rgb(138,74,34,0.06)] hover:shadow-[0_12px_40px_rgb(138,74,34,0.12)] transition-all duration-500 text-[0.95rem]" aria-label="Register Now">
                <Link to="/register">
                  Register now <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2 h-4 w-4 hover-arrow"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </Link>
              </Button>
              <Button variant="liquidGlassDark" size="lg" asChild className="min-h-[56px] h-14 sm:h-14 px-9 rounded-full font-medium w-full sm:w-auto shadow-[0_8px_30px_rgb(44,18,8,0.15)] hover:shadow-[0_12px_40px_rgb(44,18,8,0.25)] transition-all duration-500 text-[0.95rem]" aria-label="Lodge Attendance">
                <Link to="/attendance">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2.5 h-4 w-4"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
                  Lodge Attendance
                </Link>
              </Button>
            </div>

            {/* Countdown timer */}
            <div className="mt-14 glass-premium-v2 px-7 py-6 inline-flex items-center flex-wrap gap-x-8 gap-y-5 rounded-[2.5rem] css-animate-fade-in-up shadow-[0_15px_40px_rgb(138,74,34,0.06)] border-[#8a4a22]/10" style={{ animationDelay: '0.4s' }}>
              <div className="flex items-center gap-5 pr-5 sm:pr-8 border-r border-[#8a4a22]/10 relative z-10">
                <div className="relative hidden sm:block">
                  <div className="bg-white/80 p-3 rounded-2xl shadow-sm border border-white/60 relative z-10 drop-shadow-sm">
                    <div className="css-spin-slow">
                      <Clock className="h-6 w-6 text-[#8a4a22]/90" />
                    </div>
                  </div>
                  {/* Subtle pulse ring */}
                  <div className="absolute inset-0 border-[1.5px] border-[#8a4a22]/20 rounded-2xl z-0 css-pulse-ring" />
                </div>
                <span className="text-[#8a4a22]/90 text-xs sm:text-[0.95rem] font-bold uppercase tracking-[0.25em] leading-snug text-left relative z-10">
                  Induction<br/>Begins In
                </span>
              </div>
              <Countdown targetDate="2026-08-24T09:00:00+05:30" />
            </div>
          </div>
        </div>
      </section>



      {/* Live Stats — Animated KPI Cards */}
      <section className="container mx-auto max-w-5xl px-4 py-16 pt-24">
        {/* Section header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#8a4a22]/8 border border-[#8a4a22]/12 mb-5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c87038] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#a84a25]"></span>
            </span>
            <span className="text-label text-[#8a4a22] uppercase font-bold tracking-wider mt-0">Live Updates</span>
          </div>
          <h2 className="text-hero-heading text-primary font-bold">Real-time Impact</h2>
          <p className="text-body-primary text-secondary mt-4 max-w-lg mx-auto">
            Watch our community grow instantly as new students register, scan in, and join clubs.
          </p>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { value: students ?? "—", label: "Registered", icon: Users, variant: "kpi-yellow" },
            { value: scans ?? "—", label: "QR Scans", icon: ScanLine, variant: "kpi-emerald" },
            { value: clubs ?? "—", label: "Club Joins", icon: UsersRound, variant: "kpi-blue" },
            { value: "5", label: "Days", icon: Calendar, variant: "kpi-purple" },
          ].map((kpi, i) => (
            <div
              key={kpi.label}
              className={`kpi-card ${kpi.variant} animate-slide-up stagger-${i + 1}`}
            >
              <div className="kpi-icon">
                <kpi.icon className="w-5 h-5" />
              </div>
              <div className="kpi-value">{kpi.value}</div>
              <div className="kpi-label">{kpi.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto max-w-6xl px-4 py-24">
        <div className="mx-auto max-w-2xl text-center mb-16 relative">
          <h2 className="text-hero-heading text-primary font-bold">Built for the rush.</h2>
          <div className="h-1 w-24 bg-gradient-to-r from-[#a84a25] to-[#c87038] mx-auto mt-6 rounded-full opacity-80" />
          <p className="text-body-primary text-secondary mt-7 max-w-xl mx-auto">
            Everything you need to onboard thousands of students without lines, paper, or chaos.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: QrCode, title: "Instant QR attendance", body: "Scan a poster, mark attendance in under a second. Duplicates blocked automatically." },
            { icon: Activity, title: "Realtime dashboards", body: "Admins watch registrations flow in live — no refresh, no waiting." },
            { icon: Users, title: "Clubs in one tap", body: "Browse 30+ clubs and societies. Join your tribe before classes start." },
          ].map((f, i) => (
            <div key={f.title} className={`glass-premium-v2 p-6 rounded-3xl group transition-transform hover:scale-[1.01] animate-slide-up stagger-${i + 1}`}>
              <div className="feature-card-icon relative z-10">
                <f.icon className="h-7 w-7 stroke-[1.5]" />
              </div>
              <div className="relative z-10">
                <h3 className="text-card-title text-primary font-bold transition-colors">{f.title}</h3>
                <p className="mt-2.5 text-body-secondary text-[#7a4020]/75 leading-relaxed">{f.body}</p>
              </div>
              {/* Hover arrow */}
              <div className="mt-4 relative z-10">
                <span className="inline-flex items-center text-xs font-semibold text-[#8a4a22]/50 opacity-0 translate-x-[-4px] transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" style={{ opacity: 'var(--hover-opacity, 0)' }}>
                  Learn more <ArrowRight className="w-3 h-3 ml-1" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="glass-premium-v2 rounded-none border-t border-[#8a4a22]/10 pt-20 pb-10 mt-16 relative overflow-hidden">
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
                  <span className="text-label text-secondary uppercase font-bold tracking-wider mt-1.5">Induction 2026</span>
                </div>
              </div>
              
              <p className="text-body-secondary max-w-md">
                The official student induction platform for K.R. Mangalam University. Simplifying onboarding, scheduling, and community building for the incoming class of 2026.
              </p>

              <div className="flex items-start gap-4 glass-premium-v2 rounded-2xl p-5 max-w-md hover-lift">
                <ShieldCheck className="h-6 w-6 text-[#8a4a22] shrink-0 mt-0.5 relative z-10" />
                <p className="text-xs text-[#7a4020] leading-relaxed relative z-10">
                  <strong className="block mb-1 text-sm text-[#2c1208] tracking-tight">Enterprise Security</strong> 
                  End-to-end encrypted and strictly for university onboarding. We never track location or share data.
                </p>
              </div>
            </div>

            {/* Quick Links */}
            <div className="md:col-span-3 lg:col-span-3 md:col-start-7 lg:col-start-8 flex flex-col gap-5 mt-2 md:mt-0">
              <h4 className="text-label text-[#2c1208] uppercase font-bold tracking-wider">Platform</h4>
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
              <h4 className="text-label text-[#2c1208] uppercase font-bold tracking-wider">Resources</h4>
              <nav className="flex flex-col gap-4">
                <Link to="/help" className="text-sm text-[#7a4020]/80 hover:text-[#8a4a22] hover:translate-x-1 transition-all">Help Center</Link>
                <Link to="/privacy" className="text-sm text-[#7a4020]/80 hover:text-[#8a4a22] hover:translate-x-1 transition-all">Privacy Policy</Link>
                <Link to="/terms" className="text-sm text-[#7a4020]/80 hover:text-[#8a4a22] hover:translate-x-1 transition-all">Terms of Service</Link>
                <Link to="/admin/login" className="mt-4 action-card !p-3.5">
                  <div className="action-card-content">
                    <span className="action-card-title !text-[13px]">Admin Portal</span>
                  </div>
                  <ArrowRight className="h-4 w-4 action-card-arrow" />
                </Link>
              </nav>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-10 border-t border-[#8a4a22]/10">
            <div className="text-caption text-[#7a4020]/70 font-medium tracking-wide flex flex-wrap justify-center items-center text-center">
              &copy; 2026 EOZKA. <span className="mx-3 text-[#7a4020]/30 hidden sm:inline">•</span><br className="sm:hidden" /> All rights reserved.
            </div>
            <a href="https://eozka.com" target="_blank" rel="noreferrer" className="group glass-premium-v2 rounded-full px-6 sm:px-8 py-3.5 flex flex-col sm:flex-row items-center gap-3 sm:gap-5 hover-lift text-center">
              <span className="text-label text-secondary uppercase font-bold tracking-wider mt-0 relative z-10">Engineered & powered by</span>
              <div className="w-[1px] h-8 bg-[#8a4a22]/15 group-hover:bg-[#8a4a22]/30 transition-colors relative z-10"></div>
              <img src="/eozka-logo.webp" alt="eOzka" loading="lazy" className="h-10 w-auto mix-blend-multiply object-contain scale-[1.25] group-hover:scale-[1.35] transition-transform relative z-10" />
            </a>
          </div>
        </div>
      </footer>
      </div>
    </LazyMotion>
  );
}
