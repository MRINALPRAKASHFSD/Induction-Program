import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { TicketPDF } from '@/components/ticket-pdf';
import { db } from '@/lib/firebase/config';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  CheckCircle2, MapPin, Clock, User, Hash,
  BookOpen, GraduationCap, Building, Check,
  AlertTriangle, XCircle, Loader2, Users, ChevronDown, CalendarClock,
  Grid, Map, LifeBuoy, ArrowRight, Download, Image as ImageIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { SCHOOLS } from '@/lib/constants';


import { Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';

export const Route = createFileRoute('/event-attend/$eventId')({
  head: () => ({
    meta: [
      { title: 'Mark Attendance · Aarambh' },
      { name: 'description', content: 'Scan to mark your attendance for this event.' },
      { name: 'robots', content: 'noindex,nofollow' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1' },
    ],
  }),
  component: EventAttendPage,
});

type PageState = 'loading' | 'event_loaded' | 'new_student' | 'submitting' | 'success' | 'duplicate' | 'error' | 'event_not_found' | 'qr_disabled' | 'outside_window';

interface EventData {
  id:          string;
  title:       string;
  display_name?: string;
  venue:       string;
  starts_at:   string;
  ends_at:     string;
  is_active:   boolean;
  qr_enabled?: boolean;
  capacity?:   number;
  attendance_count?: number;
  coordinator?: string;
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

/** Derive a display-friendly event title using display_name → title → formatted id */
function getEventDisplayName(event: EventData): string {
  if (event.display_name?.trim()) return event.display_name.trim();
  if (event.title?.trim()) {
    // Capitalise each word so "orientation" → "Orientation"
    return event.title.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return event.id;
}

function getNextEvent(sessions: any[] | null) {
  if (!sessions || sessions.length === 0) return null;
  const now = new Date().getTime();
  const future = sessions.filter(s => s.start_time && new Date(s.start_time).getTime() > now);
  if (future.length === 0) return null;
  future.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  return future[0];
}

function EventAttendPage() {
  const { eventId } = Route.useParams();
  const shouldReduceMotion = useReducedMotion();

  const [pageState,  setPageState]  = useState<PageState>('loading');
  const [event,      setEvent]      = useState<EventData | null>(null);
  const [errorMsg,          setErrorMsg]          = useState('');
  const [resultData,        setResultData]        = useState<any | null>(null);
  const [downloadType,      setDownloadType]      = useState<'pdf' | 'png' | null>(null);
  const [hasPlanner,        setHasPlanner]        = useState(false);
  const [scheduleSessions,  setScheduleSessions]  = useState<any[] | null>(null);
  const [applicationNumber, setApplicationNumber] = useState('');
  const [studentName, setStudentName] = useState('');
  const [school, setSchool] = useState('');
  const [programme, setProgramme] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!eventId) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'events', eventId));
        if (!snap.exists()) {
          setPageState('event_not_found');
          return;
        }

        const data = { id: snap.id, ...snap.data() } as EventData;

        const now = Date.now();
        const startsAt = new Date(data.starts_at).getTime();
        const endsAt   = new Date(data.ends_at).getTime();
        const WINDOW_BEFORE = 15 * 60 * 1000;
        const WINDOW_AFTER  = 15 * 60 * 1000;

        if (data.qr_enabled === false) {
          setEvent(data);
          setPageState('qr_disabled');
          return;
        }

        if (now < startsAt - WINDOW_BEFORE || now > endsAt + WINDOW_AFTER) {
          setEvent(data);
          setPageState('outside_window');
          return;
        }

        setEvent(data);
        setPageState('event_loaded');
        setTimeout(() => inputRef.current?.focus(), 100);
      } catch (err: any) {
        setErrorMsg('Could not load event. Check your connection and try again.');
        setPageState('error');
      }
    };
    load();
  }, [eventId]);



  useEffect(() => {
    if (pageState === 'success') {
      const checkPlanner = async () => {
        try {
          const res = await fetch('/api/event-schedule?type=orientation', {
            headers: {},
          });
          const data = await res.json();
          if (data.plannerActive) {
            setHasPlanner(true);
          }
          if (data.sessions && Array.isArray(data.sessions)) {
            setScheduleSessions(data.sessions);
          }
        } catch (e) {
          console.error("Failed to check planner status", e);
        }
      };
      checkPlanner();
    }
  }, [pageState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicationNumber.trim()) {
      setErrorMsg('Please enter your application number.');
      return;
    }

    setPageState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/event-attendance-mark', {
        method:  'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body:    JSON.stringify({
          event_id:          eventId,
          application_number: applicationNumber.trim(),

          student_name:      studentName.trim(),
          school:            school.trim(),
          programme:         programme.trim(),
          client_timestamp:  new Date().toISOString(),
        }),
      });

      const json = await res.json();

      if (json.code === 'NEW_STUDENT_DATA_REQUIRED') {
        setPageState('new_student');
        return;
      }

      if (json.ok && json.code === 'SUCCESS') {
        setResultData(json.data);
        setPageState('success');
        return;
      }

      if (json.code === 'DUPLICATE') {
        setResultData({
          studentName: json.data?.studentName || '',
          status: 'present',
          applicationNumber: json.data?.applicationNumber || '',
          guests: json.data?.guests || 0,
          programme: json.data?.programme,
          school: json.data?.school,
          batch: json.data?.batch,
          section: json.data?.section,
        });
        setPageState('duplicate');
        return;
      }

      const errorMessages: Record<string, string> = {
        NOT_FOUND:      'Application Number not found for this event.',
        SUSPENDED:      'Your account is suspended. Please contact administration.',
        QR_DISABLED:    json.message || 'Attendance has been disabled by the organizer.',
        OUTSIDE_WINDOW: json.message || 'Attendance window is currently closed.',
        CAPACITY_FULL:  'This event has reached its maximum capacity.',
        RATE_LIMITED:   `Too many attempts. Please wait ${json.meta?.retryAfter ?? 60} seconds and try again.`,
        INVALID_INPUT:  'Invalid application number format.',
        SERVER_ERROR:   'Server error. Please try again.',
      };

      setErrorMsg(errorMessages[json.code] || json.message || 'Something went wrong. Please try again.');
      setPageState('event_loaded');
    } catch {
      setErrorMsg('Connection error. Please check your internet and try again.');
      setPageState('event_loaded');
    }
  };

  // ── Motion variants — respect reduced motion ────────────────────────
  const fadeUp = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 12 },
    show:   { opacity: 1, y: 0, transition: { type: 'spring' as const, damping: 22, stiffness: 120 } },
  };

  const popIn = {
    hidden: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.96 },
    show:   { opacity: 1, scale: 1, transition: { type: 'spring' as const, damping: 22, stiffness: 120 } },
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    show:   { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
  };

  // ── The confirmation card is visible immediately on success. ────────
  // Decorative child animations play in parallel via staggerChildren.

  return (
    <div className="min-h-dvh relative overflow-hidden flex flex-col items-center justify-center px-4 py-8" style={{ backgroundColor: '#FFFDFC' }}>

      {/* ── Aarambh Ambient Background ──────────────────────────────── */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
        <div className="ambient-blob ambient-blob-3" />
        <div className="watermark" aria-hidden="true">AARAMBH</div>
      </div>

      {/* ── Hero gradient overlay ────────────────────────────────────── */}
      <div className="bg-hero-premium fixed inset-0 -z-10 opacity-60" aria-hidden="true" />

      {/* ── Content container ───────────────────────────────────────── */}
      <div className="w-full max-w-sm relative z-10">

        {/* ── Brand logo (all non-success states) ─────────────────── */}
        <AnimatePresence>
          {pageState !== 'success' && pageState !== 'duplicate' && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-center mb-7"
            >
              {/* KRMU Logo & Event Title */}
              <div className="inline-flex flex-col items-center gap-2">
                <img 
                  src="/krmu-logo-transparent.png" 
                  alt="K.R. Mangalam University Logo" 
                  className="h-[56px] w-auto md:h-[64px] object-contain drop-shadow-[0_4px_12px_rgba(139,30,45,0.15)]"
                />
                <div className="flex flex-col items-center gap-1.5 mt-2">
                  <h1 className="text-base md:text-lg font-bold tracking-[0.08em] text-[#8B1E2D] uppercase text-center">
                    {event ? getEventDisplayName(event) : "EVENT ATTENDANCE"}
                  </h1>
                  <div className="h-[2px] w-12 bg-gradient-to-r from-transparent via-[#C8A55A] to-transparent opacity-70" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── LOADING ─────────────────────────────────────────────── */}
        {pageState === 'loading' && (
          <WarmCard>
            <div className="text-center py-8">
              <BrandSpinner />
              <p className="text-body-secondary text-secondary mt-4">Loading event…</p>
            </div>
          </WarmCard>
        )}

        {/* ── EVENT NOT FOUND ─────────────────────────────────────── */}
        {pageState === 'event_not_found' && (
          <WarmCard>
            <StatusIcon type="error" />
            <h2 className={headingCls}>Event Not Found</h2>
            <p className={bodyCls}>This QR code is invalid or the event no longer exists.</p>
          </WarmCard>
        )}

        {/* ── QR DISABLED ─────────────────────────────────────────── */}
        {pageState === 'qr_disabled' && (
          <WarmCard>
            {event && <EventHeader event={event} />}
            <StatusIcon type="warning" />
            <h2 className={headingCls}>Attendance Disabled</h2>
            <p className={bodyCls}>Attendance for this event has been disabled by the organizer.</p>
          </WarmCard>
        )}

        {/* ── OUTSIDE WINDOW ──────────────────────────────────────── */}
        {pageState === 'outside_window' && (
          <WarmCard>
            {event && <EventHeader event={event} />}
            <StatusIcon type="clock" />
            <h2 className={headingCls}>Attendance Closed</h2>
            <p className={bodyCls}>
              {Date.now() < new Date(event!.starts_at).getTime() - 15 * 60 * 1000
                ? `Attendance opens at ${formatEventTime(event!.starts_at)}.`
                : 'The attendance window for this event has closed.'}
            </p>
          </WarmCard>
        )}

        {/* ── ERROR ───────────────────────────────────────────────── */}
        {pageState === 'error' && (
          <WarmCard>
            <StatusIcon type="error" />
            <h2 className={headingCls}>Something Went Wrong</h2>
            <p className={bodyCls}>{errorMsg}</p>
          </WarmCard>
        )}

        {/* ── FORM (EVENT LOADED) ─────────────────────────────────── */}
        {pageState === 'event_loaded' && event && (
          <motion.div initial="hidden" animate="show" variants={popIn}>
            <WarmCard>
              <EventHeader event={event} />
              
              <form onSubmit={handleSubmit} className="mt-6">
                <div className="mb-4">
                  <label htmlFor="applicationNumber" className="block text-sm font-semibold text-primary mb-2">Application Number</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Hash className="h-5 w-5 text-secondary" />
                    </div>
                    <input
                      type="text"
                      id="applicationNumber"
                      ref={inputRef}
                      value={applicationNumber}
                      onChange={(e) => setApplicationNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. 25012345"
                      className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl focus:ring-[#8a4a22] focus:border-[#8a4a22] text-primary sm:text-sm shadow-sm"
                      required
                    />
                  </div>
                </div>
                
                <AnimatePresence>
                  {errorMsg && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="px-4 py-2.5 rounded-xl bg-red-50 border border-red-200/70 text-red-700 text-sm leading-relaxed">
                        {errorMsg}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <button
                  type="submit"
                  className="btn-liquid-glass-maroon mt-4 w-full py-3.5 rounded-2xl text-[15px] font-semibold cursor-pointer tracking-tight"
                >
                  Mark Attendance
                </button>
              </form>
            </WarmCard>
          </motion.div>
        )}

                {/* ── NEW STUDENT DATA REQUIRED ──────────────────────────────── */}
        {pageState === 'new_student' && event && (
          <motion.div initial="hidden" animate="show" variants={popIn}>
            <WarmCard>
              <EventHeader event={event} />
              
              <div className="mt-6 mb-2">
                <h3 className="text-lg font-bold text-primary mb-1">Welcome!</h3>
                <p className="text-sm text-secondary">It looks like this is your first time checking in. Please confirm your details below to register and mark attendance.</p>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
                <div>
                  <label htmlFor="studentName" className="block text-sm font-semibold text-primary mb-1.5">Full Name</label>
                  <input
                    type="text"
                    id="studentName"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Enter your full name"
                    className="block w-full px-3 py-2.5 border border-border rounded-xl focus:ring-[#8a4a22] focus:border-[#8a4a22] text-primary sm:text-sm shadow-sm"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="school" className="block text-sm font-semibold text-primary mb-1.5">School</label>
                  <select
                    id="school"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    className="block w-full px-3 py-2.5 border border-border rounded-xl focus:ring-[#8a4a22] focus:border-[#8a4a22] text-primary sm:text-sm shadow-sm bg-white"
                    required
                  >
                    <option value="" disabled>Select your school</option>
                    {SCHOOLS.filter(s => s.id !== 'all').map(s => (
                      <option key={s.id} value={s.code}>{s.code} - {s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="programme" className="block text-sm font-semibold text-primary mb-1.5">Programme</label>
                  <input
                    type="text"
                    id="programme"
                    value={programme}
                    onChange={(e) => setProgramme(e.target.value)}
                    placeholder="e.g. B.Tech CSE"
                    className="block w-full px-3 py-2.5 border border-border rounded-xl focus:ring-[#8a4a22] focus:border-[#8a4a22] text-primary sm:text-sm shadow-sm bg-white"
                    required
                  />
                </div>

                <AnimatePresence>
                  {errorMsg && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="px-4 py-2.5 rounded-xl bg-red-50 border border-red-200/70 text-red-700 text-sm leading-relaxed">
                        {errorMsg}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => { setPageState('event_loaded'); setErrorMsg(''); }}
                    className="w-1/3 py-3.5 rounded-2xl text-[15px] font-semibold text-secondary border border-border hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="btn-liquid-glass-maroon w-2/3 py-3.5 rounded-2xl text-[15px] font-semibold cursor-pointer tracking-tight"
                  >
                    Register & Check In
                  </button>
                </div>
              </form>
            </WarmCard>
          </motion.div>
        )}

        {/* ── SUBMITTING ──────────────────────────────────────────── */}
        {pageState === 'submitting' && (
          <motion.div initial="hidden" animate="show" variants={popIn}>
            <WarmCard>
              {event && <EventHeader event={event} />}
              <div className="text-center py-6">
                <BrandSpinner />
                <p className="text-body-secondary text-secondary mt-4">Confirming attendance…</p>
              </div>
            </WarmCard>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════
            SUCCESS STATE — Digital Orientation Companion
            ════════════════════════════════════════════════════════════ */}
        {pageState === 'success' && event && resultData && (() => {
          const nextEvent = getNextEvent(scheduleSessions);
          
          return (
            <motion.div
              initial="hidden"
              animate="show"
              variants={popIn}
              className="w-full"
            >
              <div className="bg-white rounded-3xl px-6 py-8 shadow-[0_20px_60px_rgba(137,32,44,0.10)] border border-[rgba(137,32,44,0.08)]">
                {/* ── Brand mark ─────────────────────────────────────── */}
                <div className="text-center mb-6">
                  <div className="inline-flex flex-col items-center gap-1.5 mb-5">
                    <img 
                      src="/krmu-logo-transparent.png" 
                      alt="K.R. Mangalam University Logo" 
                      className="h-[48px] w-auto md:h-[56px] object-contain drop-shadow-[0_4px_12px_rgba(139,30,45,0.15)]"
                    />
                  </div>

                  {/* ── Success icon ─────────────────────────────────── */}
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 14, stiffness: 220 }}
                    className="w-[72px] h-[72px] rounded-full bg-[#00B26F]/10 border border-[#00B26F]/25 flex items-center justify-center mx-auto mb-4 shadow-[0_0_24px_rgba(0,178,111,0.18)]"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.15, type: 'spring', stiffness: 220 }}
                    >
                      <CheckCircle2 size={36} className="text-[#00B26F]" strokeWidth={1.75} />
                    </motion.div>
                  </motion.div>

                  <motion.div variants={fadeUp}>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#00B26F]/10 text-[#00B26F] font-bold text-xs rounded-full border border-[#00B26F]/20 mb-4">
                      <Check size={12} strokeWidth={3} />
                      Attendance Confirmed
                    </div>
                  </motion.div>

                  {/* ── Heading ──────────────────────────────────────── */}
                  <motion.h2
                    variants={fadeUp}
                    className="font-serif text-2xl font-bold text-primary tracking-tight mb-2"
                  >
                    Welcome to Aarambh 2026
                  </motion.h2>
                  <motion.p variants={fadeUp} className="text-body-secondary text-secondary">
                    Your attendance has been successfully recorded.<br/>
                    Explore today's orientation schedule,<br/>
                    campus guidance and student activities.
                  </motion.p>
                  
                  <motion.div variants={fadeUp} className="mt-5 flex flex-col items-center">
                    <h1 className="text-lg md:text-xl font-bold tracking-[0.08em] text-[#8B1E2D] uppercase text-center">
                      {event ? getEventDisplayName(event) : "EVENT ATTENDANCE"}
                    </h1>
                    <div className="h-[2px] w-12 bg-gradient-to-r from-transparent via-[#C8A55A] to-transparent opacity-70 mt-1.5" />
                  </motion.div>
                </div>

                {/* ── Live Status Card (Next Event) ──────────────────────────── */}
                <motion.div
                  variants={fadeUp}
                  className="bg-white border border-[#8B1E2D]/10 rounded-2xl p-4 mb-5 shadow-sm"
                >
                  <p className="text-sm text-primary mb-1">
                    Good Afternoon, <span className="font-bold">{resultData.studentName?.split(' ')[0] || 'Student'}</span> 👋
                  </p>
                  {nextEvent ? (
                    <p className="text-xs text-secondary leading-snug">
                      You have successfully checked in. Next Event: <span className="font-semibold text-primary">{nextEvent.title}</span> in <span className="font-semibold text-primary">
                        {Math.max(1, Math.round((new Date(nextEvent.start_time).getTime() - new Date().getTime()) / 60000))} mins
                      </span>.
                    </p>
                  ) : (
                    <p className="text-xs text-secondary leading-snug">
                      You have successfully checked in to {getEventDisplayName(event)}. Check out your schedule below.
                    </p>
                  )}
                </motion.div>

                {/* ── Card 1: Attendance Status ─────────────────────────── */}
                <motion.div
                  variants={staggerContainer}
                  className="bg-white rounded-2xl px-5 py-4 mb-4 flex flex-col gap-3.5 border border-[#8B1E2D]/10"
                >
                  <div className="flex justify-between items-center text-label text-secondary border-b border-border pb-2.5 mb-0.5">
                    <span>Attendance Status</span>
                    <span className="font-bold text-[#00B26F]">✓ Confirmed</span>
                  </div>
                  <StudentDetailRow icon={<User size={15} className="text-[#8B1E2D]" />}   label="Name"           value={resultData.studentName} />
                  <StudentDetailRow icon={<Hash size={15} className="text-[#8B1E2D]" />}   label="Application No." value={resultData.applicationNumber} />
                  {resultData.school  && <StudentDetailRow icon={<Building size={15} className="text-[#8B1E2D]" />}     label="School"  value={resultData.school} />}
                  {resultData.program && <StudentDetailRow icon={<GraduationCap size={15} className="text-[#8B1E2D]" />} label="Programme" value={resultData.program} />}
                  
                  <motion.div
                    variants={fadeUp}
                    className="flex justify-between items-center pt-2.5 border-t border-border text-sm"
                  >
                    <div className="flex items-center gap-2 text-secondary text-label">
                      <Clock size={14} className="text-[#8B1E2D]/60" />
                      Time of Check-in
                    </div>
                    <StatusPill status={resultData.status} />
                  </motion.div>
                </motion.div>

                {/* ── Card 2: Today's Event ─────────────────────────── */}
                <motion.div
                  variants={staggerContainer}
                  className="bg-white rounded-2xl px-5 py-4 mb-5 flex flex-col gap-3.5 border border-[#8B1E2D]/10"
                >
                  <div className="text-label text-secondary border-b border-border pb-2.5 mb-0.5">
                    Orientation Day • {resultData.school || 'Day 1'}
                  </div>
                  <div className="flex flex-col gap-1 mb-2">
                    <h3 className="font-bold text-primary text-base leading-tight">
                      {getEventDisplayName(event)}
                    </h3>
                  </div>
                  
                  <StudentDetailRow icon={<MapPin size={15} className="text-[#C8A55A]" />} label="Venue" value={event.venue} />
                  <StudentDetailRow icon={<Clock size={15} className="text-[#C8A55A]" />} label="Time" value={formatEventTime(event.starts_at)} />
                  {event.coordinator && <StudentDetailRow icon={<User size={15} className="text-[#C8A55A]" />} label="Coordinator" value={event.coordinator} />}
                </motion.div>

                {/* ── 4-step timeline ──────────────────────────────────── */}
                <motion.div
                  variants={{
                    hidden: { opacity: 0 },
                    show:   { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
                  }}
                  className="flex flex-col gap-3 pl-1 mb-5"
                >
                  <TimelineStep text="Check-in Complete" />
                  <TimelineStep text="Identity Verified" />
                  <TimelineStep text="Attendance Recorded" />
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, x: shouldReduceMotion ? 0 : -10 },
                      show:   { opacity: 1, x: 0, transition: { type: 'spring' as const, damping: 22 } },
                    }}
                    className="flex items-center gap-3 text-sm text-primary font-bold mt-1"
                  >
                    <div className="w-6 h-6 rounded-full bg-[#8B1E2D]/10 border border-[#8B1E2D]/25 flex items-center justify-center shrink-0">
                      <ArrowRight size={13} className="text-[#8B1E2D]" strokeWidth={3} />
                    </div>
                    Next Step: {nextEvent ? nextEvent.title : getEventDisplayName(event)}
                  </motion.div>
                </motion.div>

                <GuestDrawerTrigger event={event} resultData={resultData} />

                {/* ── Apple Wallet Style Quick Actions ───────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="mt-6 w-full grid grid-cols-2 gap-3"
                >
                  <Link
                    to="/schedule"
                    className="bg-white border border-[#8B1E2D]/10 rounded-2xl p-4 flex flex-col items-start gap-2 hover:shadow-md transition-all group"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#8B1E2D]/5 flex items-center justify-center group-hover:bg-[#8B1E2D]/10 transition-colors">
                      <CalendarClock className="w-4 h-4 text-[#8B1E2D]" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-primary leading-tight">Schedule</p>
                      <p className="text-[10px] text-secondary mt-0.5">View itinerary</p>
                    </div>
                  </Link>
                  <Link
                    to="/campus"
                    className="bg-white border border-[#8B1E2D]/10 rounded-2xl p-4 flex flex-col items-start gap-2 hover:shadow-md transition-all group"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#8B1E2D]/5 flex items-center justify-center group-hover:bg-[#8B1E2D]/10 transition-colors">
                      <Map className="w-4 h-4 text-[#8B1E2D]" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-primary leading-tight">Campus Map</p>
                      <p className="text-[10px] text-secondary mt-0.5">Find your way</p>
                    </div>
                  </Link>
                  <Link
                    to="/clubs"
                    className="bg-white border border-[#8B1E2D]/10 rounded-2xl p-4 flex flex-col items-start gap-2 hover:shadow-md transition-all group"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#8B1E2D]/5 flex items-center justify-center group-hover:bg-[#8B1E2D]/10 transition-colors">
                      <Grid className="w-4 h-4 text-[#8B1E2D]" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-primary leading-tight">Explore Clubs</p>
                      <p className="text-[10px] text-secondary mt-0.5">Join communities</p>
                    </div>
                  </Link>
                  <Link
                    to="/help"
                    className="bg-white border border-[#8B1E2D]/10 rounded-2xl p-4 flex flex-col items-start gap-2 hover:shadow-md transition-all group"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#8B1E2D]/5 flex items-center justify-center group-hover:bg-[#8B1E2D]/10 transition-colors">
                      <LifeBuoy className="w-4 h-4 text-[#8B1E2D]" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-primary leading-tight">Help Desk</p>
                      <p className="text-[10px] text-secondary mt-0.5">Get support</p>
                    </div>
                  </Link>
                </motion.div>

                {/* ── Download Entry Pass Actions ───────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="mt-6 flex flex-col gap-3"
                >
                  <button
                    onClick={() => setDownloadType('pdf')}
                    disabled={!!downloadType}
                    className="w-full bg-[#8B1E2D] text-white rounded-2xl py-4 font-bold text-sm shadow-[0_4px_14px_rgba(137,32,44,0.3)] hover:shadow-[0_6px_20px_rgba(137,32,44,0.4)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <Download size={18} className="group-hover:-translate-y-1 transition-transform" />
                    {downloadType === 'pdf' ? 'Generating Pass...' : 'Download Official Entry Pass'}
                  </button>
                  <button
                    onClick={() => setDownloadType('png')}
                    disabled={!!downloadType}
                    className="w-full bg-white text-[#8B1E2D] border border-[#8B1E2D]/20 rounded-2xl py-3.5 font-bold text-sm shadow-sm hover:bg-[#8B1E2D]/5 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <ImageIcon size={18} />
                    {downloadType === 'png' ? 'Saving...' : 'Save as Image (PNG)'}
                  </button>
                </motion.div>
              </div>

              {/* Hidden Ticket PDF Component */}
              {downloadType && event && resultData && (
                <TicketPDF 
                  event={event} 
                  resultData={resultData} 
                  type={downloadType}
                  onComplete={() => setDownloadType(null)} 
                />
              )}
            </motion.div>
          );
        })()}

        {/* ════════════════════════════════════════════════════════════
            DUPLICATE STATE — brand aligned
            ════════════════════════════════════════════════════════════ */}
        {pageState === 'duplicate' && event && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={popIn}
            className="glass-premium-v2 rounded-3xl px-6 py-8 shadow-[0_20px_60px_rgba(138,74,34,0.10)]"
          >
            <div className="text-center mb-6">
              <div className="inline-flex flex-col items-center gap-1.5 mb-5">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] flex items-center justify-center text-white font-bold text-lg shadow-md shadow-[#8a4a22]/25">
                  A
                </div>
                <span className="aarambh-year text-[10px]">Aarambh 2026 · K.R. Mangalam University</span>
              </div>

              {/* Blue info icon for duplicate */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 220 }}
                className="w-[72px] h-[72px] rounded-full bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mx-auto mb-4 shadow-[0_0_24px_rgba(59,130,246,0.15)]"
              >
                <CheckCircle2 size={36} className="text-blue-500" strokeWidth={1.75} />
              </motion.div>

              <motion.h2 variants={fadeUp} className="font-serif text-2xl font-bold text-primary tracking-tight mb-1">
                Already Recorded
              </motion.h2>
              <motion.p variants={fadeUp} className="text-body-secondary text-secondary">
                You're already checked in to {getEventDisplayName(event)}
              </motion.p>
            </div>

            <div className="h-px bg-border my-5" />

            <motion.div
              variants={staggerContainer}
              className="glass-premium-v2 rounded-2xl px-5 py-4 mb-5 flex flex-col gap-3.5"
            >
              <div className="text-label text-secondary border-b border-border pb-2.5 mb-0.5">
                Student Information
              </div>
              <StudentDetailRow icon={<User size={15} className="text-[#c87038]" />} label="Name"           value={resultData?.studentName} />
              <StudentDetailRow icon={<Hash size={15} className="text-[#c87038]" />} label="Application No." value={resultData?.applicationNumber} />
            </motion.div>

            <motion.p variants={fadeUp} className="text-caption text-secondary text-center">
              Your attendance was already verified for this event.
            </motion.p>
          </motion.div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="relative z-10 mt-8 text-center text-caption text-secondary/70 leading-relaxed"
      >
        Welcome to Aarambh 2026 · Scan In. Stand Out. Belong.
        <br />
        <span className="text-secondary/50">Powered by K.R. Mangalam University</span>
      </motion.footer>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Warm ivory frosted glass card — matches homepage `glass-premium-v2` */
function WarmCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-premium-v2 rounded-3xl px-6 py-7 shadow-[0_20px_60px_rgba(138,74,34,0.08)]">
      {children}
    </div>
  );
}

/** Event title & metadata header for form / gating states */
function EventHeader({ event }: { event: EventData }) {
  return (
    <div className="mb-1">
      <h1 className="text-section-heading text-primary font-bold">{getEventDisplayName(event)}</h1>
      <p className="text-caption text-secondary mt-1 flex items-center gap-1.5 flex-wrap">
        <MapPin size={11} className="text-[#c87038]" />
        {event.venue}
        <span className="text-border">·</span>
        <Clock size={11} className="text-[#c87038]" />
        {formatEventTime(event.starts_at)}
      </p>
    </div>
  );
}

/** Copper-tinted brand spinner */
function BrandSpinner() {
  return (
    <div
      className="w-10 h-10 mx-auto rounded-full border-[3px]"
      style={{
        borderColor: 'rgba(138,74,34,0.15)',
        borderTopColor: '#8a4a22',
        animation: 'aarambh-spin 0.9s linear infinite',
      }}
    >
      <style>{`@keyframes aarambh-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/** Status icons for gating / error states using Aarambh warm palette */
function StatusIcon({ type }: { type: 'error' | 'warning' | 'clock' }) {
  const icons = {
    error:   <XCircle    size={48} className="text-red-500"    strokeWidth={1.5} />,
    warning: <AlertTriangle size={48} className="text-[#c87038]" strokeWidth={1.5} />,
    clock:   <Clock      size={48} className="text-blue-500"   strokeWidth={1.5} />,
  };
  return <div className="text-center mb-4 flex justify-center">{icons[type]}</div>;
}

/** One row in the student information card */
function StudentDetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 8 },
        show:   { opacity: 1, y: 0, transition: { type: 'spring' as const, damping: 22 } },
      }}
      className="flex justify-between items-center text-sm gap-3"
    >
      <div className="flex items-center gap-2 text-secondary font-medium shrink-0">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-primary font-semibold text-right leading-snug break-words min-w-0">
        {value}
      </div>
    </motion.div>
  );
}

/** Status badge — maps backend snake_case values to user-friendly labels and Aarambh palette */
function StatusPill({ status }: { status: string }) {
  const key = (status || '').toLowerCase().replace(/[\s-]/g, '_');

  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    late: {
      label: 'Late',
      className: 'bg-[#c87038]/10 text-[#c87038] border-[#c87038]/25',
      icon: <Clock size={11} />,
    },
    early: {
      label: 'Early',
      className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      icon: <Clock size={11} />,
    },
    on_time: {
      label: 'On Time',
      className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
      icon: <Check size={11} strokeWidth={3} />,
    },
    present: {
      label: 'Present',
      className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
      icon: <Check size={11} strokeWidth={3} />,
    },
  };

  const current = config[key] ?? config['on_time'];

  return (
    <div
      className={`inline-flex items-center gap-1 border px-2.5 py-1 rounded-full text-xs font-bold ${current.className}`}
    >
      {current.icon}
      {current.label}
    </div>
  );
}

/** 3-step confirmation timeline item */
function TimelineStep({ text }: { text: string }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, x: shouldReduceMotion ? 0 : -10 },
        show:   { opacity: 1, x: 0, transition: { type: 'spring' as const, damping: 22 } },
      }}
      className="flex items-center gap-3 text-sm text-secondary font-medium"
    >
      <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
        <Check size={13} className="text-emerald-600" strokeWidth={3} />
      </div>
      {text}
    </motion.div>
  );
}

// ─── Shared style constants ────────────────────────────────────────────────────

const headingCls = 'text-section-heading text-primary font-bold text-center my-2';
const bodyCls    = 'text-body-secondary text-secondary text-center';

// ── GuestDrawerTrigger ────────────────────────────────────────────────────────

const RELATIONSHIP_OPTIONS = [
  { value: "PARENT",   label: "Parent",   emoji: "👨‍👩‍👧" },
  { value: "SIBLING",  label: "Sibling",  emoji: "👫" },
  { value: "GUARDIAN", label: "Guardian", emoji: "🤝" },
  { value: "RELATIVE", label: "Relative", emoji: "👪" },
  { value: "FRIEND",   label: "Friend",   emoji: "😊" },
  { value: "OTHER",    label: "Other",    emoji: "✨" },
] as const;

function GuestDrawerTrigger({
  event,
  resultData,
}: {
  event: EventData;
  resultData: any;
}) {
  const [open, setOpen]                   = useState(false);
  const [headcount, setHeadcount]         = useState(0);
  const [customCount, setCustomCount]     = useState<string>("");
  const [useCustom, setUseCustom]         = useState(false);
  const [relationships, setRelationships] = useState<string[]>([]);
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);
  const [skipped, setSkipped]             = useState(false);

  if (skipped) return null;

  const effectiveCount = useCustom ? (parseInt(customCount, 10) || 0) : headcount;

  const toggleRel = (val: string) => {
    setRelationships(prev =>
      prev.includes(val) ? prev.filter(r => r !== val) : [...prev, val],
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        event_id:             event.id,
        student_id:           resultData.applicationNumber,
        application_number:   resultData.applicationNumber,
        orientation_id:       null,
        attendance_record_id: null,
        headcount:            effectiveCount,
        relationships,
        device_timestamp:     new Date().toISOString(),
        department_id:        resultData.course || null,
        programme:            resultData.program || null,
        school:               resultData.school || null,
      };
      const res = await fetch("/api/event-guest-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save guest details");
      setSubmitted(true);
      setOpen(false);
      toast.success(effectiveCount === 0 ? "Got it — came alone!" : `${effectiveCount} guest(s) recorded. Thank you!`);
    } catch (e: any) {
      toast.error(`Failed to save: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-600 font-semibold mx-auto mt-6 mb-2">
        <CheckCircle2 className="w-4 h-4" />
        {effectiveCount === 0 ? "Came alone — recorded ✓" : `${effectiveCount} guest(s) recorded ✓`}
      </div>
    );
  }

  return (
    <div className="w-full mt-6 mb-2">
      {/* Drawer trigger card */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        onClick={() => setOpen(true)}
        className="w-full mx-auto bg-white border border-[#8B1E2D]/10 rounded-2xl p-4 flex items-center justify-between gap-3 hover:shadow-lg transition-all group shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#C8A55A]/10 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-[#C8A55A]" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-primary">Accompanying Guest (Optional)</p>
            <p className="text-xs text-secondary mt-0.5">Did anyone accompany them?</p>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-primary/40 group-hover:text-primary transition-colors shrink-0" />
      </motion.button>

      {/* Backdrop + Drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="drawer"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[101] bg-[#FFFDFB] rounded-t-3xl shadow-2xl p-6 max-h-[88vh] overflow-y-auto"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-5" />
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-primary">Guest Headcount</h3>
                  <p className="text-sm text-secondary mt-0.5">How many guests accompanied them today?</p>
                </div>

                {/* Stepper 0–8 then 8+ */}
                <div className="grid grid-cols-5 gap-2">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                    <button
                      key={n}
                      onClick={() => { setHeadcount(n); setUseCustom(false); }}
                      className={`aspect-square rounded-xl text-lg font-bold transition-all ${
                        !useCustom && headcount === n
                          ? "bg-[#8a4a22] text-white shadow-lg scale-105"
                          : "glass-premium-v2 border border-border/50 text-primary hover:bg-[#8a4a22]/10"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => setUseCustom(true)}
                    className={`aspect-square rounded-xl text-sm font-bold transition-all ${
                      useCustom
                        ? "bg-[#8a4a22] text-white shadow-lg scale-105"
                        : "glass-premium-v2 border border-border/50 text-primary hover:bg-[#8a4a22]/10"
                    }`}
                  >
                    8+
                  </button>
                </div>

                {/* Custom count for 8+ */}
                <AnimatePresence>
                  {useCustom && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label className="text-xs font-bold text-secondary uppercase tracking-wider block mb-2 mt-2">
                        Exact number of guests
                      </label>
                      <input
                        type="number"
                        min={8}
                        max={99}
                        value={customCount}
                        onChange={e => setCustomCount(e.target.value)}
                        placeholder="Enter number (8–99)"
                        className="w-full px-4 py-3 rounded-xl border border-border bg-white text-primary font-bold text-center text-lg focus:outline-none focus:ring-2 focus:ring-[#c87038]/50"
                        autoFocus
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Relationship tags (visible when guests > 0) */}
                <AnimatePresence>
                  {effectiveCount > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <p className="text-xs font-bold text-secondary uppercase tracking-wider mb-3 mt-2">
                        Who came with them? (optional)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {RELATIONSHIP_OPTIONS.map(r => (
                          <button
                            key={r.value}
                            onClick={() => toggleRel(r.value)}
                            className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all ${
                              relationships.includes(r.value)
                                ? "bg-[#8a4a22] text-white border-[#8a4a22] shadow"
                                : "bg-white border-border text-secondary hover:border-[#8a4a22]/30"
                            }`}
                          >
                            {r.emoji} {r.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit + Skip */}
                <div className="flex flex-col gap-3 pt-4">
                  <Button
                    className="w-full bg-[#8a4a22] hover:bg-[#6e3a1a] text-white rounded-xl h-12"
                    disabled={submitting || (useCustom && (!customCount || parseInt(customCount, 10) < 8))}
                    onClick={handleSubmit}
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                    ) : effectiveCount === 0 ? (
                      "Came alone"
                    ) : (
                      `Confirm ${effectiveCount} Guest${effectiveCount !== 1 ? "s" : ""}`
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setOpen(false); setSkipped(true); }}
                    className="text-secondary text-xs hover:bg-black/5"
                  >
                    Skip for now
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
