import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  CheckCircle2, MapPin, Clock, User, Hash,
  BookOpen, GraduationCap, Building, Check,
  AlertTriangle, XCircle
} from 'lucide-react';

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

type PageState = 'loading' | 'event_loaded' | 'submitting' | 'success' | 'duplicate' | 'error' | 'event_not_found' | 'qr_disabled' | 'outside_window';

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

function EventAttendPage() {
  const { eventId } = Route.useParams();
  const shouldReduceMotion = useReducedMotion();

  const [pageState,  setPageState]  = useState<PageState>('loading');
  const [event,      setEvent]      = useState<EventData | null>(null);
  const [applicationNumber, setApplicationNumber] = useState('');
  const [errorMsg,          setErrorMsg]          = useState('');
  const [resultData,        setResultData]        = useState<any | null>(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanApplicationNumber = applicationNumber.trim().toUpperCase();
    if (!cleanApplicationNumber || cleanApplicationNumber.length < 3) {
      setErrorMsg('Please enter your application number.');
      return;
    }

    setPageState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/event-attendance-mark', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          event_id:          eventId,
          application_number: cleanApplicationNumber,
          client_timestamp:  new Date().toISOString(),
        }),
      });

      const json = await res.json();

      if (json.ok && json.code === 'SUCCESS') {
        setResultData({
          ...json.data,
          applicationNumber: cleanApplicationNumber
        });
        setPageState('success');
        return;
      }

      if (json.code === 'DUPLICATE') {
        setResultData({
          studentName: json.data?.studentName || cleanApplicationNumber,
          status: 'present',
          applicationNumber: cleanApplicationNumber
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
    <div className="min-h-dvh bg-background relative overflow-hidden flex flex-col items-center justify-center px-4 py-8">

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
              {/* Aarambh "A" logo block — matches footer branding in index.tsx */}
              <div className="inline-flex flex-col items-center gap-2">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-[#8a4a22]/25">
                  A
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="aarambh-year text-[10px]">K.R. Mangalam University</span>
                  <span className="text-label text-secondary">Event Attendance</span>
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
                <label className="block text-label text-secondary mb-2">
                  Application Number
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={applicationNumber}
                  onChange={e => { setApplicationNumber(e.target.value); setErrorMsg(''); }}
                  placeholder="e.g. KRMU2643057"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="w-full px-4 py-3.5 rounded-2xl border border-border bg-white/60 backdrop-blur-sm text-primary font-semibold text-base outline-none transition-all placeholder:text-muted-foreground focus:border-[#8a4a22]/40 focus:bg-white/80 focus:ring-2 focus:ring-[#8a4a22]/10 tracking-wide box-border"
                />
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
            SUCCESS STATE — Aarambh brand-aligned
            Card is visible immediately. Decorative items animate in
            parallel via stagger so perceived latency is zero.
            ════════════════════════════════════════════════════════════ */}
        {pageState === 'success' && event && resultData && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={popIn}
            className="glass-premium-v2 rounded-3xl px-6 py-8 shadow-[0_20px_60px_rgba(138,74,34,0.10)]"
          >
            {/* ── Brand mark ─────────────────────────────────────── */}
            <div className="text-center mb-6">
              <div className="inline-flex flex-col items-center gap-1.5 mb-5">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] flex items-center justify-center text-white font-bold text-lg shadow-md shadow-[#8a4a22]/25">
                  A
                </div>
                <span className="aarambh-year text-[10px]">Aarambh 2026 · K.R. Mangalam University</span>
              </div>

              {/* ── Success icon ─────────────────────────────────── */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 220 }}
                className="w-[72px] h-[72px] rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto mb-4 shadow-[0_0_24px_rgba(34,197,94,0.18)]"
              >
                {/* Primary: animated SVG tick. Fallback: lucide Check */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15, type: 'spring', stiffness: 220 }}
                >
                  <CheckCircle2 size={36} className="text-emerald-500" strokeWidth={1.75} />
                </motion.div>
              </motion.div>

              {/* ── Heading ──────────────────────────────────────── */}
              <motion.h2
                variants={fadeUp}
                className="font-serif text-2xl font-bold text-primary tracking-tight mb-1"
              >
                Attendance Confirmed
              </motion.h2>
              <motion.p variants={fadeUp} className="text-body-secondary text-secondary">
                Welcome to {getEventDisplayName(event)}
              </motion.p>
            </div>

            {/* ── Divider ──────────────────────────────────────────── */}
            <div className="h-px bg-border my-5" />

            {/* ── Event info pills ─────────────────────────────────── */}
            <motion.div variants={fadeUp} className="flex flex-wrap justify-center gap-2 mb-5">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary bg-white/60 border border-border px-3 py-1.5 rounded-full backdrop-blur-sm">
                <MapPin size={12} className="text-[#c87038]" />
                {event.venue}
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary bg-white/60 border border-border px-3 py-1.5 rounded-full backdrop-blur-sm">
                <Clock size={12} className="text-[#c87038]" />
                {formatEventTime(event.starts_at)}
              </div>
            </motion.div>

            {/* ── Student information card ─────────────────────────── */}
            <motion.div
              variants={staggerContainer}
              className="glass-premium-v2 rounded-2xl px-5 py-4 mb-5 flex flex-col gap-3.5"
            >
              {/* Section label */}
              <div className="text-label text-secondary border-b border-border pb-2.5 mb-0.5">
                Student Information
              </div>

              <StudentDetailRow icon={<User size={15} className="text-[#c87038]" />}   label="Name"           value={resultData.studentName} />
              <StudentDetailRow icon={<Hash size={15} className="text-[#c87038]" />}   label="Application No." value={resultData.applicationNumber} />
              {resultData.course  && <StudentDetailRow icon={<BookOpen size={15} className="text-[#c87038]" />}     label="Course"  value={resultData.course} />}
              {resultData.school  && <StudentDetailRow icon={<Building size={15} className="text-[#c87038]" />}     label="School"  value={resultData.school} />}
              {resultData.program && <StudentDetailRow icon={<GraduationCap size={15} className="text-[#c87038]" />} label="Program" value={resultData.program} />}

              {/* ── Status row ─────────────────────────────────────── */}
              <motion.div
                variants={fadeUp}
                className="flex justify-between items-center pt-2.5 border-t border-border text-sm"
              >
                <div className="flex items-center gap-2 text-secondary text-label">
                  <CheckCircle2 size={14} className="text-[#8a4a22]/60" />
                  Status
                </div>
                <StatusPill status={resultData.status} />
              </motion.div>
            </motion.div>

            {/* ── 3-step timeline ──────────────────────────────────── */}
            <motion.div
              variants={{
                hidden: { opacity: 0 },
                show:   { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
              }}
              className="flex flex-col gap-3 pl-1"
            >
              <TimelineStep text="QR Verified" />
              <TimelineStep text="Student Verified" />
              <TimelineStep text="Attendance Recorded" />
            </motion.div>
          </motion.div>
        )}

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
