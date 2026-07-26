import { createLazyFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useSpring, useReducedMotion } from 'framer-motion';
import { 
  ArrowLeft, Search, BookOpen, Clock, ShieldCheck, Map, Calendar, 
  Smartphone, Wallet, Info, Phone, Copy, CheckCircle2, AlertTriangle, 
  HelpCircle, ChevronRight, ChevronDown, Check, Lock, Navigation,
  FileText, Users, Building, Laptop, Wifi, LogIn, ExternalLink, QrCode, AlertCircle
} from 'lucide-react';

export const Route = createLazyFileRoute('/help')({
  component: HelpCenter,
});

const SECTIONS = [
  { id: 'overview', title: 'Platform Overview' },
  { id: 'quick-start', title: 'Quick Start' },
  { id: 'getting-started', title: 'Getting Started' },
  { id: 'registration', title: 'Registration Guide' },
  { id: 'qr-pass', title: 'QR Pass Guide' },
  { id: 'attendance', title: 'Attendance Guide' },
  { id: 'events', title: 'Events' },
  { id: 'schedule', title: 'Schedule' },
  { id: 'announcements', title: 'Announcements' },
  { id: 'clubs', title: 'Clubs & Communities' },
  { id: 'campus', title: 'Campus' },
  { id: 'wallet', title: 'Student Wallet' },
  { id: 'troubleshooting', title: 'Troubleshooting' },
  { id: 'requirements', title: 'Platform Requirements' },
  { id: 'faq', title: 'Frequently Asked Questions' },
  { id: 'support', title: 'Contact Support' }
];

function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  const [readProgress, setReadProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPx = document.documentElement.scrollTop;
      const winHeightPx = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (scrollPx / winHeightPx) * 100;
      setReadProgress(Math.round(scrolled));

      // ScrollSpy logic
      const sections = SECTIONS.map(s => document.getElementById(s.id));
      let currentSectionId = SECTIONS[0].id;
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section) {
          const rect = section.getBoundingClientRect();
          if (rect.top <= 150) {
            currentSectionId = SECTIONS[i].id;
            break;
          }
        }
      }
      setActiveSection(currentSectionId);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        searchInputRef.current?.blur();
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter sections by search
  const query = searchQuery.toLowerCase();
  const isSearching = query.length > 0;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = 100;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden selection:bg-[#8a4a22]/20 selection:text-[#8a4a22]">
      
      {/* ── Reading Progress Indicator ────────────────────────────────── */}
      <motion.div 
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#8a4a22] to-[#c87038] z-[60] origin-left"
        style={{ scaleX }}
      />
      <div className="fixed top-1.5 right-4 z-[60] text-[10px] font-bold text-[#8a4a22] bg-white/80 px-2 py-0.5 rounded-full shadow-sm backdrop-blur-md hidden sm:block">
        {readProgress}% Read
      </div>

      {/* ── Aarambh Ambient Background ──────────────────────────────── */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
        <div className="ambient-blob ambient-blob-3" />
        <div className="watermark" style={{ opacity: 0.015 }} aria-hidden="true">AARAMBH</div>
      </div>
      <div className="bg-hero-premium fixed inset-0 -z-10 opacity-60" aria-hidden="true" />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="glass-premium-v2 sticky top-0 z-50 border-b border-[#8a4a22]/10 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2 text-[#7a4020] hover:text-[#8a4a22] transition-colors btn-hover-arrow">
              <ArrowLeft className="h-4 w-4 hover-arrow" />
              <span className="text-sm font-semibold">Back to Platform</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg leading-none">A</span>
              </div>
              <span className="font-serif font-bold text-lg tracking-tight text-primary">Aarambh</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Layout ───────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-8 relative items-start">
        
        {/* ── Left Sidebar (Sticky) ───────────────────────────────────── */}
        <aside className="w-full md:w-64 shrink-0 md:sticky md:top-24 z-40 hidden md:block">
          <div className="glass-premium-v2 rounded-2xl p-4 overflow-y-auto max-h-[calc(100vh-120px)] custom-scrollbar">
            <h3 className="text-label text-secondary mb-4 px-2">Documentation</h3>
            <nav className="flex flex-col gap-1">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollTo(section.id)}
                  className={`text-left px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    activeSection === section.id
                      ? 'bg-[#8a4a22]/10 text-[#8a4a22] font-semibold'
                      : 'text-secondary hover:bg-white/40'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>
            
            <div className="mt-8 pt-4 border-t border-border px-2">
              <div className="text-xs text-secondary/60 font-medium">Keyboard Shortcuts</div>
              <div className="mt-2 flex items-center justify-between text-xs text-secondary">
                <span>Search</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/60 border border-border font-mono shadow-sm">/</kbd>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-secondary">
                <span>Close</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/60 border border-border font-mono shadow-sm">Esc</kbd>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Mobile Nav Toggle ───────────────────────────────────────── */}
        <div className="w-full md:hidden sticky top-20 z-40">
          <button 
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="w-full flex items-center justify-between glass-premium-v2 rounded-xl p-4 text-primary font-semibold shadow-sm"
          >
            <span>{SECTIONS.find(s => s.id === activeSection)?.title || 'Navigation'}</span>
            <ChevronDown className={`w-5 h-5 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`} />
          </button>
          
          <AnimatePresence>
            {mobileNavOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="absolute top-full left-0 right-0 mt-2 glass-premium-v2 rounded-2xl overflow-hidden shadow-lg border border-white/40 max-h-[60vh] overflow-y-auto"
              >
                <nav className="flex flex-col p-2">
                  {SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => scrollTo(section.id)}
                      className={`text-left px-4 py-3 rounded-lg text-sm font-medium ${
                        activeSection === section.id
                          ? 'bg-[#8a4a22]/10 text-[#8a4a22]'
                          : 'text-secondary'
                      }`}
                    >
                      {section.title}
                    </button>
                  ))}
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right Content Area ──────────────────────────────────────── */}
        <main className="flex-1 w-full min-w-0 pb-32">
          
          {/* Hero Section */}
          <div className="mb-12 text-center md:text-left">
            <h1 className="text-hero-heading text-primary font-bold mb-4 font-serif">Welcome to the<br />Aarambh Help Center</h1>
            <p className="text-page-heading text-secondary mb-6 text-xl md:text-2xl font-light">
              Everything you need to know about using the Aarambh Student Induction Platform.
            </p>
            <p className="text-body-primary text-secondary/80 max-w-2xl mb-8 leading-relaxed">
              Whether you're registering for the first time, marking attendance, exploring clubs, or navigating the campus, this guide will help you through every step.
            </p>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-medium text-secondary">
              <span className="flex items-center gap-1.5 bg-white/50 px-3 py-1.5 rounded-full border border-border backdrop-blur-sm">
                <BookOpen className="w-4 h-4 text-[#c87038]" /> Complete Guide
              </span>
              <span className="flex items-center gap-1.5 bg-white/50 px-3 py-1.5 rounded-full border border-border backdrop-blur-sm">
                <Clock className="w-4 h-4 text-[#c87038]" /> 15–20 min read
              </span>
              <span className="flex items-center gap-1.5 bg-white/50 px-3 py-1.5 rounded-full border border-border backdrop-blur-sm">
                <Calendar className="w-4 h-4 text-[#c87038]" /> Updated July 2026
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="sticky top-20 md:top-6 z-30 mb-12">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-secondary/50 group-focus-within:text-[#8a4a22] transition-colors" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Help... (e.g., Attendance, QR Pass, Schedule)"
                className="w-full pl-11 pr-12 py-4 rounded-2xl border border-border bg-white/70 backdrop-blur-xl text-primary font-medium text-base outline-none transition-all placeholder:text-secondary/40 focus:border-[#8a4a22]/40 focus:bg-white/90 focus:ring-4 focus:ring-[#8a4a22]/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <kbd className="hidden sm:inline-flex items-center justify-center px-2 py-1 text-xs font-mono font-medium text-secondary/50 bg-secondary/5 border border-secondary/10 rounded">
                  /
                </kbd>
              </div>
            </div>
            
            {!isSearching && (
              <div className="mt-3 flex flex-wrap gap-2 px-1">
                <span className="text-xs text-secondary/70 font-medium py-1">Examples:</span>
                {['Registration', 'Attendance', 'QR Pass', 'Schedule'].map(term => (
                  <button 
                    key={term} 
                    onClick={() => setSearchQuery(term)}
                    className="text-xs text-[#8a4a22] bg-[#8a4a22]/5 hover:bg-[#8a4a22]/10 px-2.5 py-1 rounded-full transition-colors border border-[#8a4a22]/10"
                  >
                    {term}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-16">
            
            {/* 1. What is Aarambh */}
            <Section id="overview" title="What is Aarambh?" query={query}>
              <p className="text-body-primary text-secondary mb-4 leading-relaxed">
                Aarambh is the official digital induction platform of K.R. Mangalam University.
                This platform is designed to provide a seamless, paperless digital induction experience for all incoming students.
              </p>
              <div className="glass-premium-v2 rounded-2xl p-6 mt-6 border-l-4 border-l-[#8a4a22]">
                <h4 className="font-semibold text-primary mb-3">The platform enables students to:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { icon: LogIn, text: 'Register & Complete Profile' },
                    { icon: QrCode, text: 'Generate Secure QR Pass' },
                    { icon: CheckCircle2, text: 'Mark Digital Attendance' },
                    { icon: Calendar, text: 'View Interactive Schedule' },
                    { icon: Info, text: 'Receive Live Announcements' },
                    { icon: Users, text: 'Join University Clubs' },
                    { icon: Map, text: 'Explore Campus Locations' },
                    { icon: Wallet, text: 'Access Student Wallet' },
                    { icon: Building, text: 'Participate in Events' }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-sm font-medium text-secondary">
                      <div className="w-6 h-6 rounded bg-[#8a4a22]/10 flex items-center justify-center shrink-0">
                        <item.icon className="w-3.5 h-3.5 text-[#8a4a22]" />
                      </div>
                      {item.text}
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* 2. Quick Start Guide */}
            <Section id="quick-start" title="Quick Start" query={query}>
              <p className="text-body-primary text-secondary mb-6">
                Short on time? Here is the absolute minimum you need to do to get ready for induction.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <QuickStartCard num="1" title="Login" desc="Use your registered email." />
                <QuickStartCard num="2" title="Complete Profile" desc="Fill in your basic details." />
                <QuickStartCard num="3" title="Generate QR Pass" desc="Save it to your phone." />
                <QuickStartCard num="4" title="Attend Orientation" desc="Arrive on campus." />
                <QuickStartCard num="5" title="Scan QR" desc="At the venue entrance." />
                <QuickStartCard num="6" title="Attendance Confirmed" desc="You're all set!" />
              </div>
            </Section>

            {/* 3. Getting Started Journey */}
            <Section id="getting-started" title="Student Journey" query={query}>
              <p className="text-body-primary text-secondary mb-8">
                Follow this complete path to make the most out of your induction week.
              </p>
              <div className="relative border-l-2 border-[#8a4a22]/20 ml-4 space-y-8 pb-4">
                <JourneyStep icon={Smartphone} title="Open Aarambh" desc="Access the platform on your mobile or desktop browser." />
                <JourneyStep icon={LogIn} title="Login" desc="Authenticate using your university-provided credentials." />
                <JourneyStep icon={FileText} title="Complete Profile" desc="Ensure your personal and academic details are correct." />
                <JourneyStep icon={QrCode} title="Generate QR Pass" desc="Your unique digital identity for the induction week." />
                <JourneyStep icon={CheckCircle2} title="Mark Attendance" desc="Scan your pass at designated checkpoints." />
                <JourneyStep icon={Calendar} title="Explore Schedule" desc="Find out where you need to be and when." />
                <JourneyStep icon={Users} title="Join Clubs" desc="Register for technical, cultural, and sports communities." />
                <JourneyStep icon={Building} title="Enjoy Campus Life" desc="Welcome to K.R. Mangalam University!" isLast />
              </div>
            </Section>

            {/* Platform Modules */}
            <Section id="modules" title="Platform Modules" query={query}>
              <p className="text-body-primary text-secondary mb-6">
                Explore the core features available to you on the Aarambh platform.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <ModuleCard icon={FileText} title="Registration" />
                <ModuleCard icon={CheckCircle2} title="Attendance" />
                <ModuleCard icon={Calendar} title="Schedule" />
                <ModuleCard icon={Building} title="Events" />
                <ModuleCard icon={Map} title="Campus" />
                <ModuleCard icon={Wallet} title="Wallet" />
                <ModuleCard icon={Info} title="Announcements" />
                <ModuleCard icon={Users} title="Clubs" />
                <ModuleCard icon={QrCode} title="QR Pass" />
              </div>
            </Section>

            {/* 4. Registration Guide */}
            <Section id="registration" title="Registration Guide" query={query}>
              <div className="space-y-4">
                <Step num="1" title="Open Aarambh" desc="Navigate to the platform homepage." />
                <Step num="2" title="Login" desc="Use your registered email and password." />
                <Step num="3" title="Verify Email" desc="If required, click the link sent to your inbox." />
                <Step num="4" title="Complete Profile" desc="Enter your name, application number, course, and school." />
                <Step num="5" title="Save Details" desc="Review your information and submit." />
                <Step num="6" title="Proceed to QR Pass" desc="Your profile is now complete." />
              </div>
              <TipBox 
                title="Success Tip" 
                desc="Double-check your Application Number. This cannot be easily changed later and is required for attendance." 
              />
            </Section>

            {/* 5. QR Pass Guide */}
            <Section id="qr-pass" title="QR Pass Guide" query={query}>
              <p className="text-body-primary text-secondary mb-6">
                Your QR Pass is your digital ID card for the induction week. You will need it to enter venues and mark attendance.
              </p>
              <h4 className="font-semibold text-primary mb-3 text-lg">How to access</h4>
              <ul className="list-disc pl-5 space-y-2 text-secondary mb-6">
                <li>Log in to your account.</li>
                <li>Tap the <strong>QR Pass</strong> button on your dashboard.</li>
                <li>You can download it as an image to your phone's gallery.</li>
              </ul>

              <div className="glass-premium-v2 rounded-2xl p-5 border border-[#8a4a22]/20 bg-gradient-to-br from-[#8a4a22]/5 to-transparent">
                <h4 className="font-bold text-[#8a4a22] flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-5 h-5" /> Best Practices for Scanning
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm text-secondary font-medium">
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Increase screen brightness to maximum.</div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Keep QR fully visible on screen.</div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Do not zoom in on the QR.</div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Do not crop the downloaded image.</div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Carry a backup screenshot.</div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Keep internet enabled if possible.</div>
                </div>
              </div>
            </Section>

            {/* 6. Attendance Guide */}
            <Section id="attendance" title="Attendance Guide" query={query}>
              <p className="text-body-primary text-secondary mb-4">
                Attendance is marked digitally by scanning your QR Pass at the venue entrance.
              </p>
              
              <h4 className="font-semibold text-primary mt-6 mb-3">Attendance Status Meanings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                <StatusCard status="Present" desc="Standard successful check-in." color="emerald" />
                <StatusCard status="On Time" desc="Checked in exactly within the designated window." color="emerald" />
                <StatusCard status="Late" desc="Checked in after the reporting time has passed." color="orange" />
                <StatusCard status="Early" desc="Checked in before the official start time." color="blue" />
                <StatusCard status="Duplicate Scan" desc="You've already scanned for this event." color="blue" />
                <StatusCard status="Invalid QR" desc="The QR code is unrecognised or damaged." color="red" />
              </div>

              <div className="glass-premium-v2 rounded-2xl p-5 border-l-4 border-l-red-500 bg-red-50/50">
                <h4 className="font-bold text-red-800 flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5" /> Important Notes
                </h4>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-red-900/80">
                  <li>Attendance can only be marked <strong>once</strong> per event.</li>
                  <li>Duplicate attendance is automatically prevented by the system.</li>
                  <li>QR validation is cryptographically secure. Fake QRs will flag an alert.</li>
                  <li>If your phone dies, inform a volunteer immediately with your Application Number.</li>
                </ul>
              </div>
            </Section>

            {/* 7. Events */}
            <Section id="events" title="Events" query={query}>
              <p className="text-body-primary text-secondary mb-4">
                Aarambh features both mandatory induction sessions and optional university events.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="glass-premium-v2 p-5 rounded-2xl border border-border">
                  <h5 className="font-bold text-primary mb-2">Induction Attendance</h5>
                  <p className="text-sm text-secondary">Mandatory daily check-in for your specific school. Tracks your overall induction completion.</p>
                </div>
                <div className="glass-premium-v2 p-5 rounded-2xl border border-border">
                  <h5 className="font-bold text-primary mb-2">Event Attendance</h5>
                  <p className="text-sm text-secondary">Specific check-ins for individual events (e.g., Guest Lectures, Workshops) within the schedule.</p>
                </div>
              </div>
            </Section>

            {/* 8. Schedule */}
            <Section id="schedule" title="Schedule" query={query}>
              <p className="text-body-primary text-secondary">
                The Schedule module displays your daily timetable, session timings, venues, and speakers. 
                It updates live in case of any delays or venue changes. You can see upcoming sessions highlighted on your dashboard.
              </p>
            </Section>

            {/* 9. Announcements */}
            <Section id="announcements" title="Announcements" query={query}>
              <p className="text-body-primary text-secondary">
                Check this section regularly for important notices, venue changes, emergency updates, and official university notifications. Unread announcements will show an indicator on your dashboard.
              </p>
            </Section>

            {/* 10. Clubs & Communities */}
            <Section id="clubs" title="Clubs & Communities" query={query}>
              <p className="text-body-primary text-secondary mb-4">
                Discover and join university organizations directly through Aarambh.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-secondary mb-4">
                <li>Technical & Coding Communities</li>
                <li>Cultural & Performing Arts Clubs</li>
                <li>Sports Teams</li>
                <li>Innovation & Entrepreneurship Cells</li>
              </ul>
              <p className="text-sm text-secondary font-medium">
                Note: Registration windows for clubs open on specific days during induction. Watch the announcements!
              </p>
            </Section>

            {/* 11. Campus */}
            <Section id="campus" title="Campus Navigation" query={query}>
              <p className="text-body-primary text-secondary mb-4">
                Use the Campus module to find your way around K.R. Mangalam University.
              </p>
              <div className="flex flex-wrap gap-2">
                {['Academic Blocks', 'Auditoriums', 'Library', 'Food Court', 'Parking', 'Help Desk', 'Medical', 'Hostels'].map(loc => (
                  <span key={loc} className="px-3 py-1 bg-white/60 border border-border rounded-full text-xs font-medium text-secondary backdrop-blur-sm">
                    {loc}
                  </span>
                ))}
              </div>
            </Section>

            {/* 12. Wallet */}
            <Section id="wallet" title="Student Wallet" query={query}>
              <p className="text-body-primary text-secondary mb-4">
                Your Student Wallet is a secure digital vault containing your credentials, digital passes, and access rights. Future university services will integrate directly with this wallet.
              </p>
            </Section>

            {/* Troubleshooting */}
            <Section id="troubleshooting" title="Troubleshooting" query={query}>
              <p className="text-body-primary text-secondary mb-6">
                Solutions to the most common issues students face.
              </p>
              <div className="space-y-4">
                <TroubleItem issue="QR doesn't scan" solution="Increase your screen brightness to maximum. Ensure there are no cracks over the QR code area on your screen. Do not zoom in." />
                <TroubleItem issue="Pass missing" solution="Ensure your profile registration is 100% complete. The pass will not generate if details are missing." />
                <TroubleItem issue="Wrong application number" solution="Contact Technical Support immediately. Do not try to scan with a wrong number." />
                <TroubleItem issue="Browser not supported" solution="Update to the latest version of Chrome or Safari. Clear your cache if pages aren't loading." />
                <TroubleItem issue="Camera permission denied" solution="If you are using a scanning feature, you must allow camera access in your browser settings, then refresh the page." />
                <TroubleItem issue="Slow internet" solution="Take a screenshot of your QR Pass while you have a good connection. The QR works offline for scanning." />
              </div>
            </Section>

            {/* Requirements & Browser */}
            <Section id="requirements" title="Platform Requirements" query={query}>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="glass-premium-v2 rounded-2xl p-6 border border-border">
                  <h4 className="font-bold text-primary mb-4 flex items-center gap-2"><Laptop className="w-5 h-5 text-[#8a4a22]" /> Supported Browsers</h4>
                  <ul className="space-y-2 text-sm text-secondary">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Google Chrome (Recommended)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Apple Safari</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Microsoft Edge</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Mozilla Firefox</li>
                  </ul>
                  <p className="text-xs text-secondary/70 mt-4 border-t border-border pt-3">
                    JavaScript must be enabled. Allow popups for downloading passes.
                  </p>
                </div>
                <div className="glass-premium-v2 rounded-2xl p-6 border border-border">
                  <h4 className="font-bold text-primary mb-4 flex items-center gap-2"><Wifi className="w-5 h-5 text-[#8a4a22]" /> Basic Requirements</h4>
                  <ul className="space-y-2 text-sm text-secondary">
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#8a4a22]" /> Stable Internet Connection</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#8a4a22]" /> Registered University Email</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#8a4a22]" /> Generated QR Pass</li>
                  </ul>
                </div>
              </div>
            </Section>

            {/* Security */}
            <Section id="security" title="Security & Privacy" query={query}>
              <div className="glass-premium-v2 rounded-2xl p-6 border border-emerald-500/20 bg-emerald-50/30">
                <ShieldCheck className="w-8 h-8 text-emerald-600 mb-4" />
                <ul className="space-y-3 text-secondary text-sm font-medium">
                  <li>• Student data is encrypted and protected.</li>
                  <li>• Your QR Pass contains a secure, unique cryptographic signature.</li>
                  <li>• Duplicate attendance attempts are automatically blocked.</li>
                  <li>• Personal information remains secure within the university network.</li>
                  <li>• Only authorised administrators can access attendance records.</li>
                </ul>
              </div>
            </Section>

            {/* FAQs */}
            <Section id="faq" title="Frequently Asked Questions" query={query}>
              <div className="space-y-3">
                <FaqAccordion question="How do I register?" answer="Login with your university email, verify it, and complete your profile form on the dashboard." />
                <FaqAccordion question="How do I access my QR Pass?" answer="Once registered, click the 'QR Pass' button on your dashboard. You can view or download it." />
                <FaqAccordion question="How do I mark attendance?" answer="Show your QR Pass to the volunteers at the venue entrance. They will scan it using their admin devices." />
                <FaqAccordion question="Can attendance be marked twice?" answer="No. The system automatically detects and blocks duplicate scans for the same event." />
                <FaqAccordion question="What if my QR code doesn't scan?" answer="Increase your screen brightness. If it still fails, provide your Application Number to the volunteer for manual entry." />
                <FaqAccordion question="What happens if I forget my password?" answer="Use the 'Forgot Password' link on the login page to receive a reset link on your registered email." />
                <FaqAccordion question="Where can I see my schedule?" answer="Navigate to the 'Schedule' tab from the main menu to view your personalized daily timetable." />
                <FaqAccordion question="How do I receive announcements?" answer="Announcements appear on your dashboard. Critical updates may also be sent via email or push notifications." />
                <FaqAccordion question="How do I update my profile?" answer="Go to your Profile settings from the top right menu. Note that some fields like Application Number cannot be changed." />
                <FaqAccordion question="How do I know attendance was recorded?" answer="You will see a green 'Attendance Confirmed' screen on the scanner's device, and the event will be marked as attended in your dashboard history." />
                <FaqAccordion question="Can I use Aarambh on mobile?" answer="Yes, Aarambh is fully optimized as a Progressive Web App (PWA) for all mobile devices." />
                <FaqAccordion question="Is internet required?" answer="Internet is required to login and view live updates. However, your downloaded QR Pass image can be scanned completely offline." />
              </div>
            </Section>

            {/* Support */}
            <Section id="support" title="Contact Support" query={query}>
              <div className="grid lg:grid-cols-2 gap-6">
                
                {/* Tech Support Card */}
                <div className="glass-premium-v2 rounded-3xl p-6 sm:p-8 shadow-elegant relative overflow-hidden group">
                  <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#8a4a22]/5 rounded-full blur-3xl group-hover:bg-[#8a4a22]/10 transition-colors" />
                  
                  <h3 className="text-xl font-bold text-primary mb-2">Technical Support</h3>
                  <p className="text-sm text-secondary/80 mb-6 max-w-sm">
                    If you experience any issues while using the Aarambh platform, our support team is available to assist you.
                  </p>
                  
                  <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-5 border border-border mb-6">
                    <div className="font-semibold text-primary text-lg">Mrinal Prakash</div>
                    <div className="text-sm text-secondary mb-3">Platform Administrator</div>
                    <div className="text-xl font-bold tracking-tight text-[#8a4a22] flex items-center gap-2">
                      <Phone className="w-5 h-5" /> 8920380253
                    </div>
                  </div>

                  <div className="space-y-3">
                    <a href="tel:8920380253" className="btn-liquid-glass-maroon w-full py-3.5 rounded-xl flex justify-center items-center gap-2 font-semibold">
                      Call Support
                    </a>
                    <button 
                      onClick={() => navigator.clipboard.writeText('8920380253')}
                      className="w-full py-3.5 rounded-xl bg-white/60 hover:bg-white/80 border border-border text-primary font-semibold flex justify-center items-center gap-2 transition-all shadow-sm"
                    >
                      <Copy className="w-4 h-4 text-secondary" /> Copy Contact Number
                    </button>
                  </div>

                  <div className="mt-8 border-t border-border pt-6 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-secondary font-bold uppercase tracking-wider mb-2">Support Hours</div>
                      <div className="text-sm text-primary font-medium">During Aarambh</div>
                      <div className="text-sm text-secondary">09:00 AM – 06:00 PM</div>
                    </div>
                    <div>
                      <div className="text-xs text-secondary font-bold uppercase tracking-wider mb-2">Support For</div>
                      <ul className="text-sm text-secondary space-y-1">
                        <li>✓ QR & Attendance Issues</li>
                        <li>✓ Registration Errors</li>
                        <li>✓ Platform Bugs</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Emergency Card */}
                <div className="glass-premium-v2 rounded-3xl p-6 sm:p-8 border-l-4 border-l-orange-500 bg-orange-50/30 flex flex-col justify-center">
                  <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center mb-6">
                    <Info className="w-6 h-6 text-orange-600" />
                  </div>
                  <h3 className="text-xl font-bold text-primary mb-3">Non-Technical Queries</h3>
                  <p className="text-secondary leading-relaxed mb-6">
                    For admission, fees, hostel, academics, or general university administration, please contact the respective university department directly.
                  </p>
                  <div className="p-4 bg-white/60 rounded-xl border border-orange-200/50 text-sm font-medium text-orange-900">
                    The number provided is for <strong className="font-bold">technical platform assistance only</strong>.
                  </div>
                </div>

              </div>
            </Section>

            {/* Quick Tips */}
            <Section id="quick-tips" title="Quick Tips" query={query}>
              <div className="glass-premium-v2 rounded-2xl p-6 sm:p-8 border border-border bg-gradient-to-br from-white/60 to-white/20">
                <h3 className="font-bold text-primary mb-6 flex items-center gap-2 text-lg">
                  <CheckCircle2 className="w-5 h-5 text-[#8a4a22]" /> Pro Tips for Induction
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    "Always keep your QR Pass ready before reaching the queue.",
                    "Arrive at least 15 minutes before reporting time.",
                    "Check the Announcements tab daily for schedule changes.",
                    "Keep your profile information updated and accurate.",
                    "Carry a fully charged mobile phone every day.",
                    "Do not share your QR Pass with anyone else.",
                  ].map((tip, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white/50 p-4 rounded-xl border border-border/50">
                      <div className="w-6 h-6 rounded-full bg-[#8a4a22]/10 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-[#8a4a22]">{i + 1}</span>
                      </div>
                      <p className="text-sm font-medium text-secondary leading-snug">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

          </div>

          {/* Footer Area */}
          <div className="mt-24 pt-8 border-t border-border text-center pb-8">
            <h3 className="text-lg font-bold text-primary mb-2">Still can't find your answer?</h3>
            <div className="flex flex-wrap justify-center gap-4 mt-6 mb-12">
              <a href="tel:8920380253" className="px-5 py-2.5 rounded-full bg-white/80 border border-border text-sm font-semibold text-primary hover:bg-[#8a4a22]/5 transition-colors flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#8a4a22]" /> Call Support
              </a>
              <button onClick={() => navigator.clipboard.writeText('8920380253')} className="px-5 py-2.5 rounded-full bg-white/80 border border-border text-sm font-semibold text-primary hover:bg-[#8a4a22]/5 transition-colors flex items-center gap-2">
                <Copy className="w-4 h-4 text-[#8a4a22]" /> Copy Number
              </button>
            </div>
            
            <div className="text-xs text-secondary/60 uppercase tracking-widest font-bold">
              Aarambh Platform <span className="mx-2 opacity-30">|</span> Version 2.0 <span className="mx-2 opacity-30">|</span> Updated July 2026
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

// ─── Sub-Components ────────────────────────────────────────────────────────────

function Section({ id, title, query, children }: { id: string, title: string, query: string, children: React.ReactNode }) {
  // Simple search filter - hides section entirely if it doesn't match query at all.
  // In a real app, you'd do deep text matching, but this suffices for UI simulation.
  const contentStr = children?.toString().toLowerCase() || '';
  const isMatch = !query || title.toLowerCase().includes(query) || contentStr.includes(query);
  
  if (!isMatch) return null;

  return (
    <motion.section 
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      className="scroll-mt-32"
    >
      <h2 className="text-page-heading text-primary font-bold mb-6 pb-4 border-b border-border/50">{title}</h2>
      {children}
    </motion.section>
  );
}

function FaqAccordion({ question, answer }: { question: string, answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="glass-premium-v2 rounded-xl overflow-hidden border border-border/60 transition-colors hover:border-[#8a4a22]/30 bg-white/40">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between text-left focus:outline-none"
      >
        <span className="font-semibold text-primary pr-4">{question}</span>
        <ChevronDown className={`w-5 h-5 text-secondary transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#8a4a22]' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.3, ease: 'easeInOut' }}
          >
            <div className="px-5 pb-5 pt-1 text-secondary text-sm leading-relaxed border-t border-border/30 mt-1">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModuleCard({ icon: Icon, title }: { icon: any, title: string }) {
  return (
    <div className="glass-premium-v2 p-4 rounded-2xl border border-border hover:border-[#8a4a22]/30 hover-lift transition-all flex flex-col items-center justify-center text-center gap-3 bg-white/40 cursor-default group">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#8a4a22]/10 to-[#8a4a22]/5 flex items-center justify-center group-hover:scale-110 transition-transform">
        <Icon className="w-6 h-6 text-[#8a4a22]" />
      </div>
      <span className="font-semibold text-primary text-sm">{title}</span>
    </div>
  );
}

function QuickStartCard({ num, title, desc }: { num: string, title: string, desc: string }) {
  return (
    <div className="glass-premium-v2 p-4 rounded-2xl border border-border bg-white/50 flex flex-col h-full hover-lift">
      <div className="w-8 h-8 rounded-full bg-[#8a4a22] text-white flex items-center justify-center font-bold text-sm mb-3">
        {num}
      </div>
      <h4 className="font-bold text-primary mb-1">{title}</h4>
      <p className="text-xs text-secondary leading-relaxed">{desc}</p>
    </div>
  );
}

function JourneyStep({ icon: Icon, title, desc, isLast = false }: { icon: any, title: string, desc: string, isLast?: boolean }) {
  return (
    <div className="relative pl-8">
      <div className="absolute left-[-17px] top-0 w-8 h-8 rounded-full bg-white border-2 border-[#8a4a22] flex items-center justify-center shadow-sm">
        <Icon className="w-4 h-4 text-[#8a4a22]" />
      </div>
      <h4 className="font-bold text-primary text-lg">{title}</h4>
      <p className="text-secondary text-sm mt-1">{desc}</p>
      {!isLast && <div className="h-6" />}
    </div>
  );
}

function Step({ num, title, desc }: { num: string, title: string, desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-[#8a4a22]/10 text-[#8a4a22] flex items-center justify-center font-bold">
        {num}
      </div>
      <div>
        <h4 className="font-bold text-primary">{title}</h4>
        <p className="text-sm text-secondary">{desc}</p>
      </div>
    </div>
  );
}

function TipBox({ title, desc }: { title: string, desc: string }) {
  return (
    <div className="mt-6 glass-premium-v2 rounded-xl p-4 border border-emerald-500/20 bg-emerald-50/50 flex gap-3 items-start">
      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
      <div>
        <h5 className="font-bold text-emerald-900">{title}</h5>
        <p className="text-sm text-emerald-800/80 mt-1">{desc}</p>
      </div>
    </div>
  );
}

function StatusCard({ status, desc, color }: { status: string, desc: string, color: 'emerald' | 'orange' | 'blue' | 'red' }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    orange: 'bg-orange-50 text-orange-800 border-orange-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200',
    red: 'bg-red-50 text-red-800 border-red-200',
  };
  return (
    <div className={`p-4 rounded-xl border ${colors[color]} bg-opacity-50 backdrop-blur-sm`}>
      <div className="font-bold mb-1">{status}</div>
      <div className="text-xs opacity-80">{desc}</div>
    </div>
  );
}

function TroubleItem({ issue, solution }: { issue: string, solution: string }) {
  return (
    <div className="glass-premium-v2 rounded-xl p-4 border border-border bg-white/40">
      <h5 className="font-bold text-primary flex items-center gap-2 mb-2">
        <AlertCircle className="w-4 h-4 text-red-500" /> {issue}
      </h5>
      <p className="text-sm text-secondary">{solution}</p>
    </div>
  );
}
