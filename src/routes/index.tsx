import { createFileRoute, Link } from "@tanstack/react-router";
import { m, LazyMotion, domAnimation, AnimatePresence, animate } from "framer-motion";
import { Users, Calendar, Activity, Clock, ShieldCheck, ScanLine, UsersRound, Megaphone, QrCode, ArrowRight, Database, MapPin, ArrowRightIcon, BarChart3, UserPlus } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePlatformAnalytics } from "@/hooks/use-platform-analytics";
import "../memories.css";


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
  const nodeRef = React.useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (node) {
      const controls = animate(0, value, {
        duration: 1.5,
        ease: "easeOut",
        onUpdate: (v: number) => {
          node.textContent = Math.round(v).toString();
        }
      });

      return () => controls?.stop?.();
    }
  }, [value]);

  return <span ref={nodeRef}>{value}</span>;
}

// Fallback images if API fails or returns no data
const FALLBACK_IMAGES = [
  { id: 1, url: "https://images.unsplash.com/photo-1523580494112-071d1621110c?auto=format&fit=crop&w=800&q=80", title: "Orientation 2026", desc: "The first hello.", anim: "anim-ken-burns", chip: "✨ First Day" },
  { id: 2, url: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80", title: "Hackathon", desc: "Building something unforgettable.", anim: "anim-slide-left", chip: "" },
  { id: 3, url: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=800&q=80", title: "Club Fair", desc: "Find your community.", anim: "anim-parallax", chip: "🏆 Clubs" },
  { id: 4, url: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=800&q=80", title: "Welcome Ceremony", desc: "A new journey begins.", anim: "anim-crossfade", chip: "🎤 Welcome" },
  { id: 5, url: "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=80", title: "Late Night Study", desc: "Quiet moments of focus.", anim: "anim-vertical-reveal", chip: "📚 Learning" },
  { id: 6, url: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=800&q=80", title: "Campus Life", desc: "Friendships that last.", anim: "anim-breathe", chip: "🤝 New Friends" },
  { id: 7, url: "https://images.unsplash.com/photo-1511556532299-8f662fc26c06?auto=format&fit=crop&w=800&q=80", title: "Cultural Fest", desc: "The energy of the crowd.", anim: "anim-polaroid", chip: "🎭 Events" },
  { id: 8, url: "https://images.unsplash.com/photo-1519452314545-0d297587fc6b?auto=format&fit=crop&w=800&q=80", title: "Morning Walks", desc: "Exploring the campus.", anim: "anim-film", chip: "📸 Memories" },
  { id: 9, url: "https://images.unsplash.com/photo-1506869640319-fea1a2ab8ce5?auto=format&fit=crop&w=800&q=80", title: "Workshops", desc: "Learning together.", anim: "anim-ken-burns", chip: "" },
  { id: 10, url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80", title: "Group Projects", desc: "Ideas taking shape.", anim: "anim-slide-left", chip: "" },
  { id: 11, url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80", title: "Tech Talk", desc: "Innovating the future.", anim: "anim-breathe", chip: "" },
  { id: 12, url: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=80", title: "Seminars", desc: "Words that inspire.", anim: "anim-vertical-reveal", chip: "🎓 Orientation" },
];

function MemoriesSection() {
  const [activeIndices, setActiveIndices] = useState([0, 1, 2, 3, 4, 5, 6, 7]);
  const [isInView, setIsInView] = useState(false);
  const sectionRef = React.useRef<HTMLElement>(null);
  const mouseRef = React.useRef<HTMLDivElement>(null);

  // Fetch homepage media from the new API
  const { data: mediaData, isLoading } = useQuery({
    queryKey: ["homepageMedia"],
    queryFn: async () => {
      const res = await fetch("/api/media/homepage");
      if (!res.ok) throw new Error("Failed to fetch media");
      return res.json();
    },
    staleTime: 30 * 1000, // Cache for 30 seconds to sync faster
  });

  // Combine featured and random into a single pool, fallback to static images if empty/loading
  const memoryImages = useMemo(() => {
    if (isLoading || !mediaData || !Array.isArray(mediaData.data)) return FALLBACK_IMAGES;
    const combined = mediaData.data;
    if (combined.length === 0) return FALLBACK_IMAGES;
    
    const animTypes = ["anim-ken-burns", "anim-slide-left", "anim-parallax", "anim-crossfade", "anim-vertical-reveal", "anim-breathe", "anim-polaroid", "anim-film"];
    
    // Map API format to component format
    const mapped = combined.map((asset: any, idx: number) => ({
      id: asset.id,
      url: asset.url,
      title: asset.title || "Memory",
      desc: asset.subtitle || "",
      anim: animTypes[idx % animTypes.length],
      chip: asset.category ? `✨ ${asset.category}` : ""
    }));

    // If there are less than 8 images, pad them with fallback images 
    // to ensure the gallery layout always has enough unique items to render
    if (mapped.length < 8) {
      const padCount = 8 - mapped.length;
      return [...mapped, ...FALLBACK_IMAGES.slice(0, padCount)];
    }
    
    return mapped;
  }, [mediaData, isLoading]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView || memoryImages.length <= 8) return;
    const interval = setInterval(() => {
      setActiveIndices(prev => {
        const newIndices = [...prev];
        const numUpdates = Math.random() > 0.5 ? 2 : 1;
        for (let i = 0; i < numUpdates; i++) {
          const targetSlot = Math.floor(Math.random() * 8);
          const availablePool = memoryImages.map((_, i) => i).filter((i: number) => !newIndices.includes(i));
          if (availablePool.length > 0) {
            const randomPoolIndex = availablePool[Math.floor(Math.random() * availablePool.length)];
            newIndices[targetSlot] = randomPoolIndex;
          }
        }
        return newIndices;
      });
    }, 4500);
    return () => clearInterval(interval);
  }, [isInView, memoryImages.length]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mouseRef.current || !isInView) return;
    const { clientX, clientY } = e;
    const x = (clientX / window.innerWidth - 0.5) * 8;
    const y = (clientY / window.innerHeight - 0.5) * 8;
    mouseRef.current.style.transform = `translate(${x}px, ${y}px)`;
  };

  return (
    <section 
      ref={sectionRef} 
      className="memories-section" 
      onMouseMove={handleMouseMove}
    >
      <div className="container mx-auto max-w-7xl px-4 relative z-10">
        <m.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="memories-heading-container"
        >
          <div className="memories-text-script">Memories</div>
          <div className="memories-text-serif">that become</div>
          <div className="memories-text-script-bottom">Beginnings</div>
          
          <m.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="memories-subtitle"
          >
            "Every registration is the beginning of friendships, discoveries, unforgettable moments, lifelong memories and a brand-new chapter at K.R. Mangalam University."
          </m.p>
        </m.div>

        <div ref={mouseRef} className="memories-gallery transition-transform duration-700 ease-out">
          {activeIndices.map((imgIndex, slot) => {
            const img = memoryImages[imgIndex] || memoryImages[0];
            if (!img) return null;
            return (
              <m.div
                key={`slot-${slot}`}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.1 * slot, ease: "easeOut" }}
                className={`memory-card mem-item-${slot} ${slot % 2 === 0 ? 'mem-item-even' : 'mem-item-odd'}`}
              >
                <div className="memory-image-wrapper bg-[#e8e4db]">
                  <AnimatePresence>
                    <m.img
                      key={img.id}
                      src={img.url}
                      alt={img.title}
                      initial={{ opacity: 0, scale: 1.05 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 1.2, ease: "easeInOut" }}
                      className={`memory-image absolute inset-0 ${isInView ? img.anim : ''}`}
                      loading="lazy"
                      decoding="async"
                    />
                  </AnimatePresence>
                </div>
                
                {img.chip && (
                  <div 
                    className="floating-chip" 
                    style={{ 
                      top: `${10 + (slot * 7) % 20}%`, 
                      left: slot % 2 === 0 ? '-10px' : 'auto',
                      right: slot % 2 !== 0 ? '-10px' : 'auto',
                      animationDelay: `${slot * 0.5}s` 
                    }}
                  >
                    {img.chip}
                  </div>
                )}
                
                {slot === 2 && <div className="golden-light-sweep" />}

                <div className="memory-caption">
                  <div className="memory-caption-title">{img.title}</div>
                  <div className="memory-caption-desc">{img.desc}</div>
                </div>
              </m.div>
            );
          })}
        </div>

        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.4 }}
        >
          <div className="memories-quote-line" />
          <p className="memories-quote">
            "Years from now, you won't remember the registration process.<br/>
            You'll remember the people you met that day."
          </p>
        </m.div>
      </div>
    </section>
  );
}

function Landing() {

  const { data, isLoading, error } = usePlatformAnalytics();
  const [relativeTime, setRelativeTime] = useState("just now");

  useEffect(() => {
    if (data?.generatedAt) {
      setRelativeTime(getRelativeTime(data.generatedAt));
      const interval = setInterval(() => {
        setRelativeTime(getRelativeTime(data.generatedAt));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [data?.generatedAt]);

  const [isBgLoaded, setIsBgLoaded] = useState(false);
  const isMobile = useIsMobile();
  useEffect(() => {
    const timer = setTimeout(() => {
      // Defer rendering of heavy background elements to prioritize LCP
      setIsBgLoaded(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);



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
              <div className="orbit-ring orbit-ring-3"><div className="orbit-node node-3-a orbit-node-trail-cw node-accent" /><div className="orbit-node node-3-b node-primary" /></div>
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
                <span className="font-['Great_Vibes',cursive] text-[3rem] sm:text-[4rem] md:text-[5.5rem] text-[#c87038] mx-2 sm:mx-3 z-10 opacity-90 rotate-[-2deg] translate-y-1 sm:translate-y-2">the</span>
                <span className="font-serif text-[1.75rem] sm:text-[2.25rem] md:text-[3rem] font-bold tracking-tight text-[#1e0c06]">New Horizon</span>
              </div>
              
              {/* Decorative line below Horizons */}
              <div className="mt-5 flex items-center gap-3 opacity-80">
                <div className="h-[1px] w-12 sm:w-20 bg-gradient-to-r from-transparent to-[#8a4a22]/50" />
                <div className="text-[#c87038] text-[0.65rem] animate-pulse">✦</div>
                <div className="h-[1px] w-32 sm:w-48 bg-gradient-to-l from-[#8a4a22]/50 to-transparent" />
              </div>

              <p className="mt-6 text-[#7a4020]/80 text-[0.95rem] sm:text-base font-normal max-w-xs leading-relaxed">
                Register. Connect. Belong.
              </p>
            </div>

            {/* CTA buttons */}
            <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row flex-wrap gap-5 css-animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <Button variant="liquidGlassWhite" size="lg" asChild className="btn-hover-arrow min-h-[56px] h-14 sm:h-14 px-9 rounded-full font-semibold w-full sm:w-auto shadow-[0_8px_30px_rgb(138,74,34,0.06)] hover:shadow-[0_12px_40px_rgb(138,74,34,0.12)] transition-all duration-500 text-[0.95rem]" aria-label="Register Now">
                <Link to="/register">
                  Register Now <ArrowRight className="ml-2 h-4 w-4 hover-arrow" />
                </Link>
              </Button>
              <Button variant="liquidGlassDark" size="lg" asChild className="min-h-[56px] h-14 sm:h-14 px-9 rounded-full font-medium w-full sm:w-auto shadow-[0_8px_30px_rgb(44,18,8,0.15)] hover:shadow-[0_12px_40px_rgb(44,18,8,0.25)] transition-all duration-500 text-[0.95rem]" aria-label="Lodge Attendance">
                <Link to="/attendance">
                  <QrCode className="mr-2.5 h-4 w-4" />
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
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${error ? 'bg-red-500' : 'bg-[#c87038] animate-ping'}`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${error ? 'bg-red-600' : 'bg-[#a84a25]'}`}></span>
            </span>
            <span className="text-label text-[#8a4a22] uppercase font-bold tracking-wider mt-0">
              {error ? "Unable to refresh" : `LIVE — Updated ${relativeTime}`}
            </span>
          </div>
          <h2 className="text-hero-heading text-primary font-bold">Live Platform Impact</h2>
          <p className="text-body-primary text-secondary mt-4 max-w-lg mx-auto">
            Watch Aarambh come to life — students registering, attending sessions, joining clubs, and participating in university events, all in real time.
          </p>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
                      { id: 'students',     value: data?.stats.students,           label: "Students Registered",     icon: Users,      variant: "kpi-yellow",  emptyLabel: "" },
            { id: 'scans',        value: data?.stats.attendance,          label: "Attendance Marked",       icon: ScanLine,   variant: "kpi-emerald", emptyLabel: "" },
            { id: 'events',       value: data?.stats.liveEvents,          label: "Live Events",             icon: Calendar,   variant: "kpi-purple",  emptyLabel: "No Active Events" },
            { id: 'participants', value: data?.stats.participants,        label: "Orientation Participants",icon: UsersRound, variant: "kpi-yellow",  emptyLabel: "" },
            { id: 'datasets',     value: data?.stats.datasets,            label: "Student Datasets",        icon: Database,   variant: "kpi-blue",    emptyLabel: "No Datasets" },
            { id: 'communities',  value: data?.stats.communities,         label: "Student Communities",     icon: UsersRound, variant: "kpi-emerald", emptyLabel: "Not Configured" },
            { id: 'clubs',        value: data?.stats.clubRegistrations,   label: "Club Registrations",      icon: Users,      variant: "kpi-purple",  emptyLabel: "" },
            { id: 'announcements',value: data?.stats.announcements,       label: "Announcements",           icon: Megaphone,  variant: "kpi-blue",    emptyLabel: "No Active Announcements" },
            ...(data?.stats.campusLocations || isLoading ? [{ id: 'locations', value: data?.stats.campusLocations, label: "Campus Locations", icon: MapPin, variant: "kpi-yellow", emptyLabel: "Not Configured" }] : [])
          ].map((kpi, i) => (
            <div
              key={kpi.id}
              className={`kpi-card ${kpi.variant} animate-slide-up stagger-${(i % 5) + 1}`}
            >
              <div className="kpi-icon">
                <kpi.icon className="w-5 h-5" />
              </div>
              
              {isLoading ? (
                <div className="h-10 w-24 bg-[#8a4a22]/10 rounded-md animate-pulse my-1" />
              ) : error && !data ? (
                <div className="kpi-value">—</div>
              ) : (
                <div className="kpi-value">
                  {kpi.value === 0 && kpi.emptyLabel ? (
                    <span className="text-lg font-medium text-muted-foreground/80">{kpi.emptyLabel}</span>
                  ) : (
                    <AnimatedCounter value={kpi.value ?? 0} />
                  )}
                </div>
              )}
              
              <div className="kpi-label">{kpi.label}</div>
            </div>
          ))}
        </div>
      </section>


      {/* Memories Cinematic Experience */}
      <MemoriesSection />

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
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 pt-10 border-t border-[#8a4a22]/10">
            <div className="text-xs text-[#7a4020]/50 font-medium tracking-wide flex flex-wrap justify-center items-center text-center">
              &copy; 2026 EOZKA. <span className="mx-3 text-[#7a4020]/20 hidden sm:inline">•</span><br className="sm:hidden" /> All rights reserved.
            </div>
            
            <a 
              href="https://eozka.com" 
              target="_blank" 
              rel="noreferrer" 
              className="group relative bg-gradient-to-b from-white/80 to-white/40 border border-[#c87038]/20 backdrop-blur-xl rounded-[2rem] sm:rounded-[2.5rem] px-10 sm:px-10 py-4 sm:py-3.5 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 transition-all duration-500 shadow-[0_8px_30px_rgb(200,112,56,0.12)] hover:shadow-[0_12px_40px_rgb(200,112,56,0.2)] hover:-translate-y-1"
            >
              {/* Subtle premium inner glow */}
              <div className="absolute inset-0 rounded-[2rem] sm:rounded-[2.5rem] shadow-[inset_0_1px_1px_rgba(255,255,255,1)] pointer-events-none"></div>

              <span className="text-[12px] sm:text-[14px] text-[#b06f3b] font-black uppercase tracking-[0.25em] drop-shadow-sm flex-shrink-0 relative z-10 pt-1 sm:pt-0">
                Engineered & Powered By
              </span>
              
              {/* Desktop Divider */}
              <div className="hidden sm:block w-[1.5px] h-12 bg-gradient-to-b from-transparent via-[#c87038]/40 to-transparent relative z-10 flex-shrink-0 transition-opacity group-hover:opacity-100 opacity-80"></div>
              
              {/* Logo wrapper */}
              <div className="flex items-center justify-center h-16 sm:h-[72px] relative z-10 flex-shrink-0 -mt-1 sm:mt-0">
                <img 
                  src="/eozka-logo.webp" 
                  alt="eOzka" 
                  loading="lazy" 
                  className="h-full w-auto mix-blend-multiply object-contain scale-[1.4] sm:scale-[1.25] group-hover:scale-[1.35] transition-transform duration-500 ease-out" 
                />
              </div>
            </a>
          </div>
        </div>
      </footer>
      </div>
    </LazyMotion>
  );
}
