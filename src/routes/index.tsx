import { createFileRoute, Link } from "@tanstack/react-router";
import { LazyMotion, domAnimation, AnimatePresence, m } from "framer-motion";
import { Users, Calendar, Activity, Clock, ShieldCheck, ScanLine, UsersRound, Megaphone, QrCode, ArrowRight, Database, MapPin, ArrowRightIcon, BarChart3, UserPlus, Facebook, Instagram, Linkedin, Youtube, Mail } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePlatformAnalytics, LIVE_IMPACT_ENABLED } from "@/hooks/use-platform-analytics";
import HeroComponent from "@/components/landing/modules/content/Hero/Hero";
import { mockAarambhModules } from "@/components/landing/core/repository";
import "../memories.css"; // We might not need this anymore if we rip out the old styles, but keep for safety
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KRMU Induction — Scan, Register, Belong" },
      {
        name: "description",
        content:
          "Real-time QR-based attendance and registration for K.R. Mangalam University's student induction.",
      },
    ],
  }),
  component: Landing,
});

function getRelativeTime(isoString: string) {
  const date = new Date(isoString);
  const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffInSeconds < 10) return "just now";
  if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date);
}

function AnimatedCounter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) return;

    let totalMilSecDur = 1500;
    let incrementTime = (totalMilSecDur / end) * 2;
    if (incrementTime > 50) incrementTime = 50;

    const timer = setInterval(() => {
      start += Math.ceil(end / (totalMilSecDur / incrementTime));
      if (start >= end) {
        setDisplayValue(end);
        clearInterval(timer);
      } else {
        setDisplayValue(start);
      }
    }, incrementTime);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{displayValue}</span>;
}

// Fallback images if API fails or returns no data
const FALLBACK_IMAGES = [
  { id: 1, url: "https://images.unsplash.com/photo-1523580494112-071d1621110c?auto=format&fit=crop&w=800&q=80", title: "Orientation 2026", desc: "The first hello." },
  { id: 2, url: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80", title: "Hackathon", desc: "Building something unforgettable." },
  { id: 3, url: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=800&q=80", title: "Club Fair", desc: "Find your community." },
  { id: 4, url: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=800&q=80", title: "Welcome Ceremony", desc: "A new journey begins." },
  { id: 5, url: "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=80", title: "Late Night Study", desc: "Quiet moments of focus." },
  { id: 6, url: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=800&q=80", title: "Campus Life", desc: "Friendships that last." }
];

function InstitutionalGallery() {
  const { data: mediaData, isLoading } = useQuery({
    queryKey: ["homepageMedia"],
    queryFn: async () => {
      const res = await fetch("/api/media/homepage");
      if (!res.ok) throw new Error("Failed to fetch media");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const memoryImages = useMemo(() => {
    if (isLoading || !mediaData || !Array.isArray(mediaData.data)) return FALLBACK_IMAGES;
    const combined = mediaData.data;
    if (combined.length === 0) return FALLBACK_IMAGES;
    
    const mapped = combined.map((asset: any) => ({
      id: asset.id,
      url: asset.url,
      title: asset.title || "Campus Memory",
      desc: asset.subtitle || ""
    }));

    if (mapped.length < 6) {
      const padCount = 6 - mapped.length;
      return [...mapped, ...FALLBACK_IMAGES.slice(0, padCount)];
    }
    
    return mapped.slice(0, 6);
  }, [mediaData, isLoading]);

  return (
    <section className="py-24 bg-white border-t border-gray-200" style={{ contentVisibility: 'auto', containIntrinsicSize: '800px' }}>
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-serif text-[#1e293b] font-bold mb-4">Life at KRMU</h2>
          <div className="h-1 w-24 bg-[#d2232a] mx-auto mb-6"></div>
          <p className="text-gray-600 max-w-2xl mx-auto text-lg">
            Discover a vibrant campus filled with opportunities, innovation, and community.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {memoryImages.map((img: any, idx: number) => (
            <div key={idx} className="group relative overflow-hidden bg-gray-100 aspect-[4/3]">
              <img 
                src={img.url} 
                alt={img.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111827]/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                <h3 className="text-white font-serif text-xl font-semibold">{img.title}</h3>
                <p className="text-white/80 text-sm mt-1">{img.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function InstitutionalFooter() {
  return (
    <footer className="relative bg-[#fdfbf7] text-[#1a1a1a] overflow-hidden pt-32 pb-16 border-t border-transparent" style={{ 
      contentVisibility: 'auto',
      containIntrinsicSize: '1200px',
      backgroundImage: `
        radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 255, 255, 0.8) 0%, rgba(253, 251, 247, 0) 100%),
        url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.02' fill='%23d4af37'/%3E%3C/svg%3E")
      `,
      boxShadow: 'inset 0 100px 100px -100px rgba(212, 175, 55, 0.05)'
    }}>
      {/* Luxury Ornamental Divider */}
      <div className="absolute top-0 left-0 w-full flex justify-center items-center">
        <div className="w-[45%] h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/30 to-transparent"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-[#d4af37]/50 mx-4 shadow-[0_0_12px_rgba(212,175,55,0.8)]"></div>
        <div className="w-[45%] h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/30 to-transparent"></div>
      </div>

      {/* Luxury lighting: Soft radial glow behind "Journey" */}
      <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[700px] bg-[#d4af37] rounded-full blur-[160px] opacity-[0.05] pointer-events-none"></div>
      {/* Vignette effect */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.03)_100%)]"></div>

      <div className="relative z-10 container mx-auto px-8 max-w-[90rem] pt-16">
        {/* Main Footer Layout: 3 elegant columns on desktop, 2 on tablet, 1 on mobile */}
        <div className="flex flex-col lg:flex-row justify-between items-center lg:items-start gap-20 mb-40">
          
          {/* LEFT ZONE */}
          <div className="w-full lg:w-1/4 flex flex-col text-center lg:text-left">
            <div>
              <h3 className="font-serif text-[44px] font-semibold text-[#0a0a0a] mb-6 tracking-wide">Aarambh 2026</h3>
              <p className="text-[20px] tracking-[0.25em] uppercase text-[#d4af37] font-bold mb-12">22 August 2026</p>
              <p className="text-[22px] text-gray-900 mb-4 font-semibold tracking-wide">K.R. Mangalam University</p>
              <p className="text-[20px] text-gray-700 tracking-wide">Freshers' Orientation Program</p>
            </div>
            <div className="mt-20 hidden lg:block">
              <p className="font-serif italic text-[24px] text-gray-600 leading-relaxed border-l-[3px] border-[#d4af37]/60 pl-8 py-2 pr-4 shadow-sm">
                "Every beginning becomes a memory."
              </p>
            </div>
            {/* Mobile/Tablet quote */}
            <div className="mt-16 lg:hidden">
              <p className="font-serif italic text-[24px] text-gray-600 leading-relaxed border-l-[3px] border-[#d4af37]/60 pl-6 py-2 mx-auto max-w-md text-left">
                "Every beginning becomes a memory."
              </p>
            </div>
          </div>

          {/* CENTER ZONE */}
          <div className="w-full lg:w-2/4 flex flex-col items-center justify-center text-center relative z-20 mt-12 lg:mt-0">
            <m.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h2 className="font-serif text-[48px] md:text-[72px] lg:text-[84px] leading-[1.1] text-[#111] font-normal tracking-tight mb-8">
                Where Every<br/>
                <span className="font-['Pinyon_Script',cursive] text-[90px] md:text-[130px] lg:text-[156px] text-[#d4af37] block mt-2 mb-10 font-normal drop-shadow-md leading-none" style={{ textShadow: '0 12px 48px rgba(212, 175, 55, 0.25)' }}>Journey</span>
                Begins.
              </h2>
              <div className="mt-16">
                <p className="text-gray-600 text-[14px] md:text-[16px] tracking-[0.3em] max-w-lg mx-auto leading-loose uppercase font-medium">
                  The Official Digital Onboarding Platform
                </p>
                <div className="flex items-center justify-center gap-4 mt-6">
                  <div className="w-12 h-[1px] bg-gradient-to-r from-transparent to-[#d4af37]/40"></div>
                  <span className="text-[14px] lowercase text-gray-400 italic font-serif">for</span>
                  <div className="w-12 h-[1px] bg-gradient-to-l from-transparent to-[#d4af37]/40"></div>
                </div>
                <p className="font-bold text-gray-900 tracking-[0.35em] text-[14px] md:text-[16px] uppercase mt-6">
                  K.R. Mangalam University
                </p>
              </div>
            </m.div>
          </div>

          {/* RIGHT ZONE */}
          <div className="w-full lg:w-1/4 flex flex-col lg:items-end text-center lg:text-right mt-12 lg:mt-0">
            <h4 className="font-bold tracking-[0.3em] uppercase text-[20px] text-[#d4af37] mb-12">Quick Links</h4>
            <ul className="space-y-8 text-[24px] font-medium text-gray-800">
              {[
                { label: 'Register', path: '/register' },
                { label: 'Admin Portal', path: '/admin/login' },
                { label: 'Help Center', path: '/help' },
                { label: 'Privacy', path: '/' },
                { label: 'Terms', path: '/' },
              ].map((link, idx) => (
                <li key={idx}>
                  <Link to={link.path} className="group flex items-center justify-center lg:justify-end gap-4 hover:text-[#d4af37] transition-all duration-300 relative overflow-hidden">
                    <span className="relative z-10 pb-1 opacity-90 group-hover:opacity-100 transition-opacity">
                      {link.label}
                      <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#d4af37]/80 group-hover:w-full transition-all duration-500 ease-out"></span>
                    </span>
                    <ArrowRight className="w-5 h-5 opacity-0 -translate-x-6 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500 ease-out text-[#d4af37]" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* PARTNER LOGOS */}
        <div className="mb-32">
          <div className="max-w-6xl mx-auto bg-white/60 backdrop-blur-2xl rounded-[40px] border border-white/80 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.08)] p-12 lg:p-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-transparent pointer-events-none"></div>
            <div className="absolute inset-0 shadow-[inset_0_0_30px_rgba(255,255,255,0.6)] rounded-[40px] pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-center gap-16 md:gap-0">
              {/* DSW */}
              <a href="#" className="flex-1 flex flex-col items-center justify-center group relative w-full">
                <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/90 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl"></div>
                <div className="h-24 md:h-28 mb-6 relative z-10">
                  <img src="/dsw-logo.png" alt="DSW Logo" className="h-full w-auto object-contain transition-transform duration-500 group-hover:scale-[1.08] drop-shadow-md" />
                </div>
                <div className="text-center relative z-10 mt-2">
                  <h5 className="text-[28px] md:text-[32px] font-bold text-gray-900 tracking-wide mb-1">Department of Student Welfare</h5>
                  <p className="text-[18px] md:text-[20px] font-medium text-gray-600">K.R. Mangalam University</p>
                </div>
              </a>
              
              <div className="hidden md:block w-[1.5px] h-32 bg-gradient-to-b from-transparent via-[#d4af37]/40 to-transparent"></div>
              <div className="md:hidden w-40 h-[1.5px] bg-gradient-to-r from-transparent via-[#d4af37]/40 to-transparent"></div>
              
              {/* eOzka */}
              <a href="https://eozka.com" target="_blank" rel="noopener noreferrer" className="flex-1 flex flex-col items-center justify-center group relative w-full">
                <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/90 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl"></div>
                <div className="h-20 md:h-24 mb-6 relative z-10 flex items-center">
                  <img src="/eozka-logo-transparent.png" alt="eOzka Logo" className="h-full w-auto object-contain transition-transform duration-500 group-hover:scale-[1.08] drop-shadow-md" />
                </div>
                <div className="text-center relative z-10 mt-2">
                  <h5 className="text-[30px] md:text-[34px] font-bold text-gray-900 tracking-wide mb-1">eOzka</h5>
                  <p className="text-[18px] md:text-[20px] font-medium text-gray-600">Technology Partner</p>
                </div>
              </a>
              
              <div className="hidden md:block w-[1.5px] h-32 bg-gradient-to-b from-transparent via-[#d4af37]/40 to-transparent"></div>
              <div className="md:hidden w-40 h-[1.5px] bg-gradient-to-r from-transparent via-[#d4af37]/40 to-transparent"></div>
              
              {/* KRMU */}
              <a href="#" className="flex-1 flex flex-col items-center justify-center group relative w-full">
                <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/90 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl"></div>
                <div className="h-24 md:h-28 mb-6 relative z-10">
                  <img src="/krmu-emblem.webp" alt="KRMU Logo" className="h-full w-auto object-contain transition-transform duration-500 group-hover:scale-[1.08] drop-shadow-md" />
                </div>
                <div className="text-center relative z-10 mt-2">
                  <h5 className="text-[28px] md:text-[32px] font-bold text-gray-900 tracking-wide mb-1">K.R. Mangalam University</h5>
                  <p className="text-[18px] md:text-[20px] font-medium text-gray-600">Host Institution</p>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* BOTTOM ZONE */}
        <div className="pt-12 pb-8 border-t border-[#d4af37]/30 flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex-1 text-center md:text-left">
            <p className="text-gray-500 text-[12px] md:text-[14px] font-medium tracking-[0.15em] uppercase leading-relaxed">
              &copy; 2026 Aarambh | Platform IP &copy; 2026 <span className="font-bold text-[#d4af37] normal-case">eOzka</span>. All Rights Reserved.
            </p>
          </div>
          
          <div className="flex-1 flex justify-center">
            <span className="text-gray-400 text-[12px] tracking-[0.3em] uppercase text-center max-w-[350px] leading-relaxed font-medium">
              POWERED BY <span className="font-bold text-[#d4af37] normal-case">eOzka</span>
            </span>
          </div>

          <div className="flex-1 flex justify-center md:justify-end gap-6">
            {[
              { icon: Instagram, href: 'https://instagram.com/weareeozka' },
              { icon: Linkedin, href: 'https://www.linkedin.com/company/eozka' },
              { icon: Mail, href: 'mailto:eozka.hq@gmail.com' },
            ].map((social, idx) => (
              <a key={idx} href={social.href} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full border border-gray-300 bg-white/60 flex items-center justify-center text-gray-500 hover:text-[#d4af37] hover:border-[#d4af37]/60 hover:bg-white hover:shadow-[0_8px_20px_rgba(212,175,55,0.25)] hover:-translate-y-1 transition-all duration-500 ease-out group">
                <social.icon className="w-5 h-5 group-hover:scale-110 transition-transform duration-500 ease-out" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function Landing() {
  const { user: firebaseUser, loading: authLoading } = useAuthRedirect();
  
  const { data, isLoading, error } = usePlatformAnalytics();
  const [relativeTime, setRelativeTime] = useState("just now");

  const { data: heroConfig } = useQuery({
    queryKey: ["landingHero"],
    queryFn: async () => {
      // 1. Fetch global settings to get the active collection ID
      const settingsRef = doc(db, "landing_settings", "global");
      const settingsSnap = await getDoc(settingsRef);
      let activeCollectionId = "aarambh-2026"; // Fallback default
      
      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data();
        if (settingsData.active_collection) {
          activeCollectionId = settingsData.active_collection;
        }
      }

      if (!activeCollectionId) return null;

      // 2. Fetch the active collection data
      const docRef = doc(db, "landing_collections", activeCollectionId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const d = snap.data();
        if (d.hero) {
          // Filter to only PUBLISHED slides so drafts don't show on the live site
          const publishedSlides = (d.hero.slides || []).filter((s: any) => s.status === 'PUBLISHED');
          return {
            ...d.hero,
            slides: publishedSlides.length > 0 ? publishedSlides : null,
          };
        }
      }
      return null;
    },
    staleTime: Infinity,
  });

  // Use Firestore config if valid, otherwise fallback to mock
  const finalHeroConfig = heroConfig && heroConfig.slides ? heroConfig : mockAarambhModules[0].config;

  useEffect(() => {
    if (data?.generatedAt) {
      setRelativeTime(getRelativeTime(data.generatedAt));
      const interval = setInterval(() => {
        setRelativeTime(getRelativeTime(data.generatedAt));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [data?.generatedAt]);

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-screen bg-[#f8fafc] font-sans">
        <SiteHeader />

        {/* Hero Component */}
        <HeroComponent config={finalHeroConfig as any} />

        {/* Live Stats — Institutional Design */}
        {LIVE_IMPACT_ENABLED && (
          <section className="bg-white py-20 border-b border-gray-200" style={{ contentVisibility: 'auto', containIntrinsicSize: '600px' }}>
            <div className="container mx-auto max-w-7xl px-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12">
                <div>
                  <h2 className="text-3xl md:text-5xl font-serif text-[#1e293b] font-bold">Live Impact</h2>
                  <div className="h-1 w-20 bg-[#d2232a] mt-4"></div>
                </div>
                <div className="mt-4 md:mt-0 flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-sm">
                  <span className="text-xs text-gray-700 font-medium tracking-wide">
                    {error ? "Update Failed" : (
                      <>
                        <span className="font-semibold text-gray-900">🟢 Live</span>
                        <span className="mx-1.5 text-gray-400">•</span>
                        <span className="text-gray-500">Updated {relativeTime}</span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { id: 'students',     value: data?.stats.students,            label: "Validated Students",      icon: ShieldCheck },
                  { id: 'scans',        value: data?.stats.attendance,          label: "Attendance Marked",       icon: ScanLine },
                  { id: 'events',       value: data?.stats.liveEvents,          label: "Live Events",             icon: Calendar },
                  { id: 'clubs',        value: data?.stats.communities,         label: "Clubs",                   icon: UsersRound },
                  { id: 'club_regs',    value: data?.stats.clubRegistrations,   label: "Club Registrations",      icon: Users },
                  { id: 'announcements',value: data?.stats.announcements,       label: "Announcements",           icon: Megaphone },
                  { id: 'datasets',     value: data?.stats.datasets,            label: "Datasets",                icon: Database }
                ].map((kpi, i) => (
                  <div key={kpi.id} className="bg-white p-6 border border-gray-200 hover:border-[#d2232a]/30 hover:shadow-lg transition-all duration-300 relative overflow-hidden group flex flex-col items-center justify-center text-center">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#d2232a] transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
                    
                    <div className="flex items-center justify-center mb-4">
                      <kpi.icon className="w-7 h-7 text-[#1e293b]/40 group-hover:text-[#d2232a] transition-colors" />
                    </div>
                    
                    {isLoading && kpi.value == null ? (
                      <div className="h-10 w-20 bg-gray-100 rounded-sm animate-pulse mb-2" />
                    ) : error && !data ? (
                      <div className="text-3xl md:text-4xl font-serif font-bold text-[#1e293b] mb-2">—</div>
                    ) : (
                      <div className="text-3xl md:text-4xl font-serif font-bold text-[#1e293b] mb-2">
                        <AnimatedCounter value={kpi.value ?? 0} />
                      </div>
                    )}
                    
                    <div className="text-xs md:text-sm text-gray-500 font-semibold uppercase tracking-wider">{kpi.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <InstitutionalGallery />
        
        {/* Breathing space before footer */}
        <div className="h-24 md:h-32 bg-[#f8fafc]"></div>
        
        <InstitutionalFooter />
      </div>
    </LazyMotion>
  );
}
