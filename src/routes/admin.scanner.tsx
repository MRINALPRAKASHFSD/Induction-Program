import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, ChevronDown, CheckCircle2, AlertTriangle,
  XCircle, Scan, Zap, Wifi, WifiOff,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { getActiveEvents, scanMarkAttendance, type ScanResult } from "@/lib/scanner.functions";

export const Route = createFileRoute("/admin/scanner")({
  head: () => ({
    meta: [
      { title: "QR Scanner · KRMU Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ScannerPage,
});

/* ─── Types ─────────────────────────────────────────────────────────────── */
type EventRow = {
  id: string;
  title: string;
  day_number: number;
  venue: string;
};

type FeedbackState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "success"; studentName: string; eventTitle: string; day: number }
  | { status: "duplicate"; studentName: string; eventTitle: string; day: number }
  | { status: "error"; message: string };

/* ─── Page ──────────────────────────────────────────────────────────────── */
function ScannerPage() {
  const fetchEvents = useServerFn(getActiveEvents);
  const markAttendance = useServerFn(scanMarkAttendance);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [feedback, setFeedback] = useState<FeedbackState>({ status: "idle" });
  const [scannerReady, setScannerReady] = useState(false);
  const [totalScans, setTotalScans] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false); // prevent double-processing
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref so the html5-qrcode callback (set once on mount) always reads the latest event
  const selectedEventIdRef = useRef<string>("");
  const SCANNER_DIV_ID = "krmu-qr-scanner";

  /* ─── Network monitor ─────────────────────────────────────────────────── */
  useEffect(() => {
    const go = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", go);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", go); window.removeEventListener("offline", off); };
  }, []);

  /* ─── Load active events ─────────────────────────────────────────────── */
  useEffect(() => {
    fetchEvents({ data: {} })
      .then((rows) => {
        setEvents(rows as EventRow[]);
        if (rows.length > 0) {
          setSelectedEventId(rows[0].id);
          selectedEventIdRef.current = rows[0].id;
        }
      })
      .catch(console.error);
  }, []);

  /* ─── Feedback auto-dismiss (1.5 s) and scanner resume ──────────────── */
  const showFeedback = useCallback(
    (state: FeedbackState) => {
      setFeedback(state);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => {
        setFeedback({ status: "scanning" });
        processingRef.current = false;
      }, 1500);
    },
    [],
  );

  /* ─── Sound / vibration helpers ─────────────────────────────────────── */
  const buzz = useCallback((type: "success" | "warn" | "error") => {
    try {
      if ("vibrate" in navigator) {
        navigator.vibrate(type === "success" ? [80] : type === "warn" ? [40, 30, 40] : [200]);
      }
      // Web Audio API beep
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = type === "success" ? 880 : type === "warn" ? 660 : 220;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // audio not available
    }
  }, []);

  /* ─── Process a decoded QR string ───────────────────────────────────── */
  const processEnrollment = useCallback(
    async (raw: string) => {
      if (processingRef.current) return;
      processingRef.current = true;

      const enrollment = raw.trim().toUpperCase();
      // Read from ref so this callback always uses the latest selected event
      const currentEventId = selectedEventIdRef.current;
      if (!currentEventId) {
        showFeedback({ status: "error", message: "No event selected. Pick an event first." });
        buzz("error");
        return;
      }

      try {
        const result = await markAttendance({
          data: { enrollment_no: enrollment, event_id: currentEventId },
        }) as ScanResult;

        if (!result.ok) {
          buzz("error");
          showFeedback({ status: "error", message: result.error });
        } else if (result.duplicate) {
          buzz("warn");
          showFeedback({ status: "duplicate", studentName: result.studentName, eventTitle: result.eventTitle, day: result.day });
        } else {
          buzz("success");
          setTotalScans((n) => n + 1);
          showFeedback({ status: "success", studentName: result.studentName, eventTitle: result.eventTitle, day: result.day });
        }
      } catch (err: any) {
        buzz("error");
        showFeedback({ status: "error", message: err?.message ?? "Network error. Please try again." });
      }
    },
    // Stable: refs always fresh, no selectedEventId dep needed
    [markAttendance, showFeedback, buzz],
  );

  /* ─── Keep processEnrollment ref fresh for the html5-qrcode callback ── */
  const processEnrollmentRef = useRef(processEnrollment);
  useEffect(() => {
    processEnrollmentRef.current = processEnrollment;
  }, [processEnrollment]);

  /* ─── Camera scanner lifecycle ───────────────────────────────────────── */
  useEffect(() => {
    let scanner: Html5Qrcode | null = null;

    const startScanner = async () => {
      try {
        scanner = new Html5Qrcode(SCANNER_DIV_ID);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
            disableFlip: false,
          },
          (decoded) => {
            // Always call via ref so we get the latest version
            processEnrollmentRef.current(decoded);
          },
          () => {
            // QR not detected in frame — ignore
          },
        );
        setScannerReady(true);
        setFeedback({ status: "scanning" });
      } catch (err: any) {
        setScannerReady(false);
        setFeedback({
          status: "error",
          message: err?.message?.includes("permission")
            ? "Camera permission denied. Please allow camera access and refresh."
            : `Camera error: ${err?.message ?? "Unknown"}`,
        });
      }
    };

    startScanner();

    return () => {
      if (scanner?.isScanning) {
        scanner.stop().catch(() => {});
      }
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // start/stop only on mount/unmount

  /* ─── Selected event display ─────────────────────────────────────────── */
  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <AdminShell
      title="QR Scanner"
      subtitle="Scan student boarding passes to mark attendance."
    >
      <div className="space-y-4">
        {/* Network / session status bar */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isOnline ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
            }`}
          >
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? "Connected" : "Offline"}
          </span>
          {totalScans > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Zap className="h-3 w-3" />
              {totalScans} successful scan{totalScans !== 1 ? "s" : ""} this session
            </span>
          )}
        </div>

        {/* Event selector */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <label
            htmlFor="event-selector"
            className="block text-sm font-semibold mb-2"
          >
            Active Event
          </label>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active events found. Create and activate an event first.
            </p>
          ) : (
            <div className="relative">
              <select
                id="event-selector"
                value={selectedEventId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedEventId(newId);
                  selectedEventIdRef.current = newId;
                  processingRef.current = false;
                }}
                className="w-full appearance-none rounded-xl border bg-muted/40 px-4 py-3 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    Day {ev.day_number} · {ev.title} — {ev.venue}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Camera viewport + feedback overlay */}
        <div className="relative overflow-hidden rounded-3xl border bg-black shadow-elegant aspect-square max-w-sm mx-auto">
          {/* html5-qrcode mounts here */}
          <div id={SCANNER_DIV_ID} className="h-full w-full" />

          {/* Scan-frame corners */}
          {scannerReady && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-56 w-56">
                {/* Four corner brackets */}
                {["tl", "tr", "bl", "br"].map((c) => (
                  <div
                    key={c}
                    className={`absolute h-8 w-8 border-4 border-white/80 ${
                      c === "tl" ? "top-0 left-0 border-r-0 border-b-0 rounded-tl-lg" :
                      c === "tr" ? "top-0 right-0 border-l-0 border-b-0 rounded-tr-lg" :
                      c === "bl" ? "bottom-0 left-0 border-r-0 border-t-0 rounded-bl-lg" :
                      "bottom-0 right-0 border-l-0 border-t-0 rounded-br-lg"
                    }`}
                  />
                ))}
                {/* Animated scan line */}
                <motion.div
                  className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-primary-glow to-transparent opacity-80"
                  animate={{ top: ["8px", "calc(100% - 8px)", "8px"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                />
              </div>
            </div>
          )}

          {/* Feedback overlay */}
          <AnimatePresence>
            {(feedback.status === "success" ||
              feedback.status === "duplicate" ||
              feedback.status === "error") && (
              <motion.div
                key={feedback.status}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center ${
                  feedback.status === "success"
                    ? "bg-success/90"
                    : feedback.status === "duplicate"
                    ? "bg-yellow-500/90"
                    : "bg-destructive/90"
                } backdrop-blur-sm`}
              >
                {feedback.status === "success" && (
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      <CheckCircle2 className="h-16 w-16 text-white" />
                    </motion.div>
                    <p className="text-xl font-bold text-white">Checked In!</p>
                    <p className="text-sm font-medium text-white/90">{feedback.studentName}</p>
                    <p className="text-xs text-white/70">Day {feedback.day} · {feedback.eventTitle}</p>
                  </>
                )}
                {feedback.status === "duplicate" && (
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      <AlertTriangle className="h-16 w-16 text-white" />
                    </motion.div>
                    <p className="text-xl font-bold text-white">Already Checked In</p>
                    <p className="text-sm font-medium text-white/90">{feedback.studentName}</p>
                    <p className="text-xs text-white/70">Day {feedback.day} · {feedback.eventTitle}</p>
                  </>
                )}
                {feedback.status === "error" && (
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      <XCircle className="h-16 w-16 text-white" />
                    </motion.div>
                    <p className="text-xl font-bold text-white">Not Registered</p>
                    <p className="text-sm text-white/80 max-w-[220px]">{feedback.message}</p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Camera not yet ready placeholder */}
          {!scannerReady && feedback.status === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/80">
              <div className="animate-spin rounded-full border-4 border-primary/30 border-t-primary h-10 w-10" />
              <p className="text-sm text-muted-foreground">Starting camera…</p>
            </div>
          )}
        </div>

        {/* Status label below camera */}
        <div className="text-center">
          {feedback.status === "scanning" && (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Scanning · {selectedEvent ? `Day ${selectedEvent.day_number} — ${selectedEvent.title}` : "Select an event above"}
            </p>
          )}
          {feedback.status === "idle" && !scannerReady && (
            <p className="text-sm text-muted-foreground">Initialising camera…</p>
          )}
        </div>

        {/* Manual fallback input */}
        <ManualEntryFallback onEnroll={processEnrollment} disabled={!selectedEventId} />
      </div>
    </AdminShell>
  );
}

/* ─── Manual entry fallback ──────────────────────────────────────────────── */
function ManualEntryFallback({
  onEnroll,
  disabled,
}: {
  onEnroll: (enroll: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim().length < 3) return;
    onEnroll(value.trim());
    setValue("");
  };

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <button
        className="flex w-full items-center justify-between text-sm font-medium"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="flex items-center gap-2">
          <Scan className="h-4 w-4 text-muted-foreground" />
          Manual entry (camera unavailable)
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.form
            key="manual"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={submit}
            className="mt-3 flex gap-2 overflow-hidden"
          >
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value.toUpperCase())}
              placeholder="KRMU24CS0001"
              disabled={disabled}
              className="flex-1 rounded-xl border bg-muted/40 px-3 py-2 text-sm font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <Button type="submit" size="sm" disabled={disabled || value.trim().length < 3}>
              Mark
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
