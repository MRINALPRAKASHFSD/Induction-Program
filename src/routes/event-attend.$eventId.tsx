import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// ─────────────────────────────────────────────────────────────────────────────
// Route definition
// URL: /event-attend/{eventId}?v=1
// v=1 is the URL schema version — allows future backward-compat routing
// ─────────────────────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
function EventAttendPage() {
  const { eventId } = Route.useParams();

  const [pageState,  setPageState]  = useState<PageState>('loading');
  const [event,      setEvent]      = useState<EventData | null>(null);
  const [applicationNumber, setApplicationNumber] = useState('');
  const [errorMsg,          setErrorMsg]          = useState('');
  const [resultData,        setResultData]        = useState<{ studentName: string; status: string } | null>(null);
  const [confetti,          setConfetti]          = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load event from Firestore (public read)
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

        // Quick client-side window check
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
        setResultData({ studentName: json.data.studentName, status: json.data.status });
        setPageState('success');
        setConfetti(true);
        setTimeout(() => setConfetti(false), 4000);
        return;
      }

      if (json.code === 'DUPLICATE') {
        setResultData({ studentName: json.data?.studentName || cleanApplicationNumber, status: 'present' });
        setPageState('duplicate');
        return;
      }

      // Map error codes to human-readable messages
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

  // ── Render states ──────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1035 50%, #0f0f1a 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Confetti particles */}
      {confetti && <ConfettiOverlay />}

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {/* KRMU Logo/Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>KRMU</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Aarambh · Event Attendance</div>
        </div>

        {/* State: Loading */}
        {pageState === 'loading' && (
          <Card>
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <Spinner />
              <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 }}>Loading event…</p>
            </div>
          </Card>
        )}

        {/* State: Event Not Found */}
        {pageState === 'event_not_found' && (
          <Card>
            <StatusIcon type="error" />
            <h2 style={headingStyle}>Event Not Found</h2>
            <p style={bodyStyle}>This QR code is invalid or the event no longer exists.</p>
          </Card>
        )}

        {/* State: QR Disabled */}
        {(pageState === 'qr_disabled') && (
          <Card>
            {event && <EventHeader event={event} />}
            <StatusIcon type="warning" />
            <h2 style={headingStyle}>Attendance Disabled</h2>
            <p style={bodyStyle}>Attendance for this event has been disabled by the organizer.</p>
          </Card>
        )}

        {/* State: Outside Window */}
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

        {/* State: Generic Error */}
        {pageState === 'error' && (
          <Card>
            <StatusIcon type="error" />
            <h2 style={headingStyle}>Something Went Wrong</h2>
            <p style={bodyStyle}>{errorMsg}</p>
          </Card>
        )}

        {/* State: Input Form */}
        {pageState === 'event_loaded' && event && (
          <Card>
            <EventHeader event={event} />
            <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
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
                  borderRadius: 14, border: '1.5px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.07)',
                  color: '#fff', fontSize: 16, fontWeight: 600,
                  outline: 'none', boxSizing: 'border-box',
                  letterSpacing: '0.04em',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.6)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.15)'; }}
              />
              {errorMsg && (
                <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 13, color: '#fca5a5', lineHeight: 1.5 }}>
                  {errorMsg}
                </div>
              )}
              <button
                type="submit"
                style={{
                  marginTop: 16, width: '100%', padding: '14px',
                  borderRadius: 14, border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: '#fff', fontSize: 16, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '-0.01em',
                  boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseDown={e => { (e.target as HTMLButtonElement).style.transform = 'scale(0.98)'; }}
                onMouseUp={e => { (e.target as HTMLButtonElement).style.transform = 'scale(1)'; }}
              >
                Mark Attendance →
              </button>
            </form>
          </Card>
        )}

        {/* State: Submitting */}
        {pageState === 'submitting' && (
          <Card>
            {event && <EventHeader event={event} />}
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Spinner />
              <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 }}>Marking attendance…</p>
            </div>
          </Card>
        )}

        {/* State: Success */}
        {pageState === 'success' && event && resultData && (
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 56, marginBottom: 8 }}>✅</div>
              <h2 style={{ ...headingStyle, color: '#4ade80', fontSize: 22 }}>Attendance Marked!</h2>
              <p style={{ ...bodyStyle, fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                Hello, {resultData.studentName}
              </p>
              {resultData.status === 'late' && (
                <div style={{ display: 'inline-block', marginTop: 6, padding: '4px 12px', borderRadius: 20, background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: 12, fontWeight: 600 }}>
                  LATE
                </div>
              )}
              <EventHeader event={event} compact />
              <p style={{ ...bodyStyle, marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>You may close this page.</p>
            </div>
          </Card>
        )}

        {/* State: Duplicate */}
        {pageState === 'duplicate' && event && (
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🔁</div>
              <h2 style={{ ...headingStyle, color: '#60a5fa' }}>Already Marked</h2>
              <p style={bodyStyle}>
                {resultData?.studentName && <><strong style={{ color: '#fff' }}>{resultData.studentName}</strong><br /></>}
                Your attendance for this event was already recorded.
              </p>
              <EventHeader event={event} compact />
            </div>
          </Card>
        )}
      </div>

      {/* Footer */}
      <p style={{ position: 'absolute', bottom: 16, fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
        Powered by Aarambh · KRMU
      </p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 24,
      padding: '28px 24px',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
    }}>
      {children}
    </div>
  );
}

function EventHeader({ event, compact = false }: { event: EventData; compact?: boolean }) {
  return (
    <div style={{ marginBottom: compact ? 0 : 4 }}>
      <h1 style={{ margin: 0, fontSize: compact ? 15 : 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', textAlign: compact ? 'center' : 'left' }}>
        {event.title}
      </h1>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: compact ? 'center' : 'left' }}>
        📍 {event.venue} &nbsp;·&nbsp; 🕐 {formatEventTime(event.starts_at)}
      </p>
      {event.capacity && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: compact ? 'center' : 'left' }}>
          {event.attendance_count ?? 0}/{event.capacity} attended
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 40, height: 40, margin: '0 auto',
      border: '3px solid rgba(255,255,255,0.1)',
      borderTopColor: '#6366f1',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StatusIcon({ type }: { type: 'error' | 'warning' | 'clock' }) {
  const icons: Record<string, string> = { error: '⚠️', warning: '🚫', clock: '⏰' };
  return <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>{icons[type]}</div>;
}

function ConfettiOverlay() {
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#fff'];
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100, overflow: 'hidden' }}>
      {Array.from({ length: 40 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${Math.random() * 100}%`,
          top: '-20px',
          width: `${6 + Math.random() * 8}px`,
          height: `${6 + Math.random() * 8}px`,
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          background: colors[Math.floor(Math.random() * colors.length)],
          opacity: 0.85,
          animation: `confettiFall ${1.5 + Math.random() * 2}s ${Math.random() * 0.8}s ease-in forwards`,
        }} />
      ))}
      <style>{`
        @keyframes confettiFall {
          to { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Inline style constants ────────────────────────────────────────────────────
const headingStyle: React.CSSProperties = {
  margin: '12px 0 8px', fontSize: 20, fontWeight: 700,
  color: '#fff', letterSpacing: '-0.02em', textAlign: 'center',
};

const bodyStyle: React.CSSProperties = {
  margin: '0 0 4px', fontSize: 14, lineHeight: 1.6,
  color: 'rgba(255,255,255,0.55)', textAlign: 'center',
};
