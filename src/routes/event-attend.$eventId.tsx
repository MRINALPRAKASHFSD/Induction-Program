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
      { title: 'Mark Attendance · KRMU' },
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

  // Motion variants that respect reduced motion
  const fadeUp = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', damping: 20 } }
  };
  
  const popIn = {
    hidden: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.95 },
    show: { opacity: 1, scale: 1, transition: { type: 'spring', damping: 20, stiffness: 100 } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.2 } }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      background: '#09090b', // Modern SaaS dark base
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Animated Premium Background */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        {/* Soft Spotlight */}
        <div style={{ 
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', 
          width: '100%', maxWidth: 800, height: 300, 
          background: 'radial-gradient(ellipse at top, rgba(255,255,255,0.08) 0%, transparent 70%)',
        }} />
        
        {/* Blurred Orb 1 - Top Left (Emerald) */}
        <motion.div
          animate={{ 
            x: shouldReduceMotion ? 0 : [0, 20, 0, -20, 0],
            y: shouldReduceMotion ? 0 : [0, 30, 0, -10, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute', top: '-10%', left: '10%',
            width: 400, height: 400, borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.08)',
            filter: 'blur(100px)',
          }}
        />
        
        {/* Blurred Orb 2 - Bottom Right (Indigo) */}
        <motion.div
          animate={{ 
            x: shouldReduceMotion ? 0 : [0, -30, 0, 20, 0],
            y: shouldReduceMotion ? 0 : [0, -20, 0, 30, 0]
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear', delay: 2 }}
          style={{
            position: 'absolute', bottom: '-10%', right: '5%',
            width: 500, height: 500, borderRadius: '50%',
            background: 'rgba(99, 102, 241, 0.08)',
            filter: 'blur(120px)',
          }}
        />
        
        {/* Subtle Grain (via CSS background pattern) */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }} />
      </div>

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 10 }}>
        
        {/* Header - Only show if not in success state to avoid redundancy */}
        <AnimatePresence>
          {pageState !== 'success' && pageState !== 'duplicate' && (
            <motion.div 
              initial={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }}
              style={{ textAlign: 'center', marginBottom: 28 }}
            >
              <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>KRMU</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Aarambh · Event Attendance</div>
            </motion.div>
          )}
        </AnimatePresence>

        {pageState === 'loading' && (
          <Card>
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <Spinner />
              <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 }}>Loading event…</p>
            </div>
          </Card>
        )}

        {pageState === 'event_not_found' && (
          <Card>
            <StatusIcon type="error" />
            <h2 style={headingStyle}>Event Not Found</h2>
            <p style={bodyStyle}>This QR code is invalid or the event no longer exists.</p>
          </Card>
        )}

        {pageState === 'qr_disabled' && (
          <Card>
            {event && <EventHeader event={event} />}
            <StatusIcon type="warning" />
            <h2 style={headingStyle}>Attendance Disabled</h2>
            <p style={bodyStyle}>Attendance for this event has been disabled by the organizer.</p>
          </Card>
        )}

        {pageState === 'outside_window' && (
          <Card>
            {event && <EventHeader event={event} />}
            <StatusIcon type="clock" />
            <h2 style={headingStyle}>Attendance Closed</h2>
            <p style={bodyStyle}>
              {Date.now() < new Date(event!.starts_at).getTime() - 15 * 60 * 1000
                ? `Attendance opens at ${formatEventTime(event!.starts_at)}.`
                : 'The attendance window for this event has closed.'}
            </p>
          </Card>
        )}

        {pageState === 'error' && (
          <Card>
            <StatusIcon type="error" />
            <h2 style={headingStyle}>Something Went Wrong</h2>
            <p style={bodyStyle}>{errorMsg}</p>
          </Card>
        )}

        {pageState === 'event_loaded' && event && (
          <motion.div initial="hidden" animate="show" variants={popIn}>
            <Card>
              <EventHeader event={event} />
              <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 8, fontWeight: 500 }}>
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
                  style={{
                    width: '100%', padding: '14px 16px',
                    borderRadius: 14, border: '1.5px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#fff', fontSize: 16, fontWeight: 600,
                    outline: 'none', boxSizing: 'border-box',
                    letterSpacing: '0.04em',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onFocus={e => { 
                    e.target.style.borderColor = 'rgba(99,102,241,0.5)';
                    e.target.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onBlur={e => { 
                    e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                    e.target.style.background = 'rgba(255,255,255,0.04)';
                  }}
                />
                <AnimatePresence>
                  {errorMsg && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#fca5a5', lineHeight: 1.5 }}>
                        {errorMsg}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <button
                  type="submit"
                  style={{
                    marginTop: 16, width: '100%', padding: '14px',
                    borderRadius: 14, border: 'none',
                    background: '#fff',
                    color: '#000', fontSize: 15, fontWeight: 600,
                    cursor: 'pointer', letterSpacing: '-0.01em',
                    transition: 'transform 0.1s, opacity 0.15s',
                  }}
                  onMouseDown={e => { (e.target as HTMLButtonElement).style.transform = 'scale(0.98)'; }}
                  onMouseUp={e => { (e.target as HTMLButtonElement).style.transform = 'scale(1)'; }}
                  onMouseEnter={e => { (e.target as HTMLButtonElement).style.opacity = '0.9'; }}
                  onMouseLeave={e => { (e.target as HTMLButtonElement).style.opacity = '1'; }}
                >
                  Mark Attendance
                </button>
              </form>
            </Card>
          </motion.div>
        )}

        {pageState === 'submitting' && (
          <motion.div initial="hidden" animate="show" variants={popIn}>
            <Card>
              {event && <EventHeader event={event} />}
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <Spinner />
                <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14, fontWeight: 500 }}>Confirming attendance…</p>
              </div>
            </Card>
          </motion.div>
        )}

        {/* ========================================================
            SUCCESS STATE REDESIGN (PREMIUM PRODUCTION UI)
            ======================================================== */}
        {pageState === 'success' && event && resultData && (
          <motion.div
            initial="hidden" animate="show" variants={popIn}
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 24,
              padding: '36px 28px',
              backdropFilter: 'blur(32px)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          >
            {/* Header Area */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.1, damping: 12, stiffness: 200 }}
                style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 0 30px rgba(16,185,129,0.3)',
                  border: '1px solid rgba(16,185,129,0.3)'
                }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                >
                  <CheckCircle2 size={36} color="#10b981" />
                </motion.div>
              </motion.div>
              
              <motion.h2 
                variants={fadeUp}
                style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 4px' }}
              >
                Attendance Confirmed
              </motion.h2>
              <motion.p
                variants={fadeUp}
                style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', margin: 0, fontWeight: 500 }}
              >
                Welcome to Orientation 2026
              </motion.p>
            </div>

            {/* Event Branding / Info */}
            <motion.div 
              variants={fadeUp}
              style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32, alignItems: 'center' }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', textAlign: 'center' }}>{event.title}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: 12, fontWeight: 500 }}>
                  <MapPin size={14} /> {event.venue}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: 12, fontWeight: 500 }}>
                  <Clock size={14} /> {formatEventTime(event.starts_at)}
                </div>
              </div>
            </motion.div>

            {/* Student Details Grid */}
            <motion.div 
              variants={staggerContainer}
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 16,
                padding: '18px 20px',
                marginBottom: 28,
                display: 'flex', flexDirection: 'column', gap: 14
              }}
            >
              <StudentDetailRow icon={<User size={16} />} label="Student" value={resultData.studentName} />
              <StudentDetailRow icon={<Hash size={16} />} label="Application No." value={resultData.applicationNumber} />
              {resultData.course && <StudentDetailRow icon={<BookOpen size={16} />} label="Course" value={resultData.course} />}
              {resultData.school && <StudentDetailRow icon={<Building size={16} />} label="School" value={resultData.school} />}
              {resultData.program && <StudentDetailRow icon={<GraduationCap size={16} />} label="Program" value={resultData.program} />}
              
              {/* Status Pill inline */}
              <motion.div 
                variants={fadeUp}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                  <CheckCircle2 size={16} /> Status
                </div>
                <StatusPill status={resultData.status} />
              </motion.div>
            </motion.div>

            {/* Timeline Steps */}
            <motion.div
              variants={{
                hidden: { opacity: 0 },
                show: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.6 } }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 8 }}
            >
              <TimelineStep text="QR Verified" />
              <TimelineStep text="Student Verified" />
              <TimelineStep text="Attendance Recorded" />
            </motion.div>

          </motion.div>
        )}

        {/* Duplicate State Redesign (Aligned with Success aesthetic) */}
        {pageState === 'duplicate' && event && (
          <motion.div
            initial="hidden" animate="show" variants={popIn}
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 24,
              padding: '36px 28px',
              backdropFilter: 'blur(32px)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.1, damping: 12, stiffness: 200 }}
                style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: 'rgba(59, 130, 246, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 0 30px rgba(59,130,246,0.3)',
                  border: '1px solid rgba(59,130,246,0.3)'
                }}
              >
                <CheckCircle2 size={36} color="#3b82f6" />
              </motion.div>
              
              <motion.h2 
                variants={fadeUp}
                style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 4px' }}
              >
                Already Recorded
              </motion.h2>
              <motion.p
                variants={fadeUp}
                style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', margin: 0, fontWeight: 500 }}
              >
                Welcome back to Orientation 2026
              </motion.p>
            </div>

            <motion.div 
              variants={staggerContainer}
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 16,
                padding: '18px 20px',
                marginBottom: 28,
                display: 'flex', flexDirection: 'column', gap: 14
              }}
            >
              <StudentDetailRow icon={<User size={16} />} label="Student" value={resultData?.studentName} />
              <StudentDetailRow icon={<Hash size={16} />} label="Application No." value={resultData?.applicationNumber} />
            </motion.div>

            <motion.div variants={fadeUp} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                Your attendance was already verified.
              </p>
            </motion.div>
          </motion.div>
        )}

      </div>

      {/* Global Footer */}
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 1 }}
        style={{ 
          position: 'absolute', bottom: 24, left: 16, right: 16, 
          fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center',
          fontWeight: 500, lineHeight: 1.6
        }}
      >
        Welcome to Aarambh.<br />
        Have an amazing experience at K.R. Mangalam University.
      </motion.p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 24,
      padding: '28px 24px',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
    }}>
      {children}
    </div>
  );
}

function EventHeader({ event }: { event: EventData }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
        {event.title}
      </h1>
      <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
        <MapPin size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> {event.venue} &nbsp;·&nbsp; <Clock size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> {formatEventTime(event.starts_at)}
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 40, height: 40, margin: '0 auto',
      border: '3px solid rgba(255,255,255,0.1)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StatusIcon({ type }: { type: 'error' | 'warning' | 'clock' }) {
  const icons = { 
    error: <XCircle size={48} color="#ef4444" strokeWidth={1.5} />, 
    warning: <AlertTriangle size={48} color="#f59e0b" strokeWidth={1.5} />, 
    clock: <Clock size={48} color="#3b82f6" strokeWidth={1.5} /> 
  };
  return <div style={{ textAlign: 'center', marginBottom: 16, display: 'flex', justifyContent: 'center' }}>{icons[type]}</div>;
}

function StudentDetailRow({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div 
      variants={{ hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 }, show: { opacity: 1, y: 0 } }}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
        {icon} <span>{label}</span>
      </div>
      <div style={{ fontWeight: 600, color: '#fff', textAlign: 'right' }}>
        {value}
      </div>
    </motion.div>
  );
}

function StatusPill({ status }: { status: string }) {
  const normalized = (status || '').toLowerCase();
  
  const config = {
    late: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', text: 'Late', icon: <Clock size={12} /> },
    early: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', text: 'Early', icon: <Clock size={12} /> },
    'on time': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', text: 'On Time', icon: <Check size={12} strokeWidth={3} /> },
  };

  const current = config[normalized as keyof typeof config] || config['on time'];

  return (
    <div style={{ 
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: current.bg, border: `1px solid ${current.color}40`,
      color: current.color, padding: '4px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 700, boxShadow: `0 0 10px ${current.color}20`
    }}>
      {current.icon} {current.text}
    </div>
  );
}

function TimelineStep({ text }: { text: string }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div 
      variants={{ hidden: { opacity: 0, x: shouldReduceMotion ? 0 : -10 }, show: { opacity: 1, x: 0, transition: { type: 'spring', damping: 20 } } }}
      style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}
    >
      <div style={{ 
        width: 24, height: 24, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', 
        border: '1px solid rgba(16, 185, 129, 0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' 
      }}>
        <Check size={14} color="#10b981" strokeWidth={3} />
      </div>
      {text}
    </motion.div>
  );
}

// ─── Inline style constants ────────────────────────────────────────────────────
const headingStyle: React.CSSProperties = {
  margin: '8px 0 8px', fontSize: 20, fontWeight: 700,
  color: '#fff', letterSpacing: '-0.02em', textAlign: 'center',
};

const bodyStyle: React.CSSProperties = {
  margin: '0 0 4px', fontSize: 14, lineHeight: 1.6, fontWeight: 500,
  color: 'rgba(255,255,255,0.55)', textAlign: 'center',
};
