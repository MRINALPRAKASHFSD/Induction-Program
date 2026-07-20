/**
 * src/routes/attendance.tsx
 *
 * Student Attendance Page — SECURE ARCHITECTURE (v2)
 *
 * What this page does:
 *   1. Shows attendance history and percentage
 *   2. Provides a "Scan Attendance" button that opens the camera
 *   3. Scans the QR displayed by the admin
 *   4. Captures GPS coordinates (geofence pre-check)
 *   5. Sends { qr_data, enrollment_no, latitude, longitude } to api/attendance-mark
 *   6. Shows success/error animations
 *
 * What this page does NOT do:
 *   ✕ Generate QR codes
 *   ✕ Display QR codes
 *   ✕ Show session selectors
 *   ✕ Allow manual entry of QR data
 *   ✕ Write to Firestore directly
 */

import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

import {
  ScanLine, CheckCircle2, XCircle, AlertTriangle,
  ArrowLeft, Clock, MapPin, Shield, History,
  Percent, ChevronRight, Camera, Loader2, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { localDb, type LocalStudent } from "@/lib/local-db";
import { auth, db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { verifyInsideCampus, isInsideCampus, CAMPUS_CENTER, CAMPUS_RADIUS_METERS, type GeolocationResult } from "@/lib/geofence";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance · KRMU Induction" },
      { name: "description", content: "Scan the admin QR code to mark your attendance at KRMU AARAMBH 2026." },
    ],
  }),
  component: AttendancePage,
});

type Phase = "dashboard" | "locating" | "scanner" | "submitting" | "success" | "duplicate" | "error";

interface AttendanceRecord {
  id: string;
  event_id: string;
  session_id: string;
  student_name: string;
  programme_id: string;
  scanned_at: any;
}

interface MarkResult {
  ok: boolean;
  duplicate?: boolean;
  studentName?: string;
  eventTitle?: string;
  venue?: string;
  date?: string;
  programme?: string;
  message?: string;
  error?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
function AttendancePage() {
  const [profile, setProfile] = useState<LocalStudent | null>(null);
  const [phase, setPhase] = useState<Phase>("dashboard");
  const [result, setResult] = useState<MarkResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [location, setLocation] = useState<GeolocationResult | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "qr-scanner-container";

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    const p = localDb.getStudentProfile();
    setProfile(p);
    if (p) loadAttendanceHistory(p.enrollment_no);
    else setLoadingRecords(false);
  }, []);

  // ── Load attendance history ───────────────────────────────────────────────
  const loadAttendanceHistory = useCallback(async (enrollmentNo: string) => {
    try {
      const q = query(
        collection(db, "attendance"),
        where("student_id", "==", enrollmentNo.toUpperCase()),
        orderBy("scanned_at", "desc"),
        limit(50),
      );
      const snap = await getDocs(q);
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
      setRecords(recs);
    } catch (e: any) {
      console.warn("Failed to load attendance history:", e);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  // ── Start scanning flow: GPS first, then camera ───────────────────────────
  const startAttendanceFlow = async () => {
    setPhase("locating");
    setErrorMsg("");

    try {
      // Step 1: Get GPS coordinates and verify campus
      const position = await verifyInsideCampus();
      setLocation(position);

      // Step 2: Start camera scanner
      setPhase("scanner");
      await startScanner();
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to get your location");
      setPhase("error");
    }
  };

  // ── Camera scanner ────────────────────────────────────────────────────────
  const startScanner = async () => {
    try {
      // Small delay to let DOM render the container
      await new Promise(r => setTimeout(r, 300));

      const scanner = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => handleScan(decodedText),
        () => {}, // ignore scan errors (no QR in view)
      );
    } catch (e: any) {
      console.error("Scanner error:", e);
      setErrorMsg(
        e.message?.includes("NotAllowed")
          ? "Camera permission denied. Please enable camera access in your browser settings."
          : "Failed to start camera. Please check your device permissions.",
      );
      setPhase("error");
    }
  };

  // ── Handle scanned QR ─────────────────────────────────────────────────────
  const handleScan = async (qrData: string) => {
    // Stop scanner immediately to prevent double-scans
    try {
      await scannerRef.current?.stop();
    } catch {}

    if (!profile?.enrollment_no) {
      setErrorMsg("Please register first to mark attendance.");
      setPhase("error");
      return;
    }

    if (!location) {
      setErrorMsg("Location not available. Please try again.");
      setPhase("error");
      return;
    }

    setPhase("submitting");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be logged in to mark attendance.");

      const idToken = await user.getIdToken();

      const res = await fetch("/api/attendance-mark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          qr_data: qrData,
          enrollment_no: profile.enrollment_no,
          latitude: location.lat,
          longitude: location.lng,
        }),
      });

      const data: MarkResult = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to mark attendance.");
        setPhase("error");
        return;
      }

      setResult(data);

      if (data.duplicate) {
        setPhase("duplicate");
        toast.info("Attendance already marked for this session.");
      } else {
        setPhase("success");
        toast.success("Attendance marked!");
        // Haptic feedback
        if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
        // Refresh history
        loadAttendanceHistory(profile.enrollment_no);
      }
    } catch (e: any) {
      // Classify network vs. other errors (Fix 4: offline detection)
      const isOffline = !navigator.onLine
        || e.name === 'TypeError'
        || e.message?.toLowerCase().includes('failed to fetch')
        || e.message?.toLowerCase().includes('network')
        || e.message?.toLowerCase().includes('networkerror');

      setErrorMsg(
        isOffline
          ? 'Network unavailable. Please reconnect and scan again.'
          : e.message || 'Failed to mark attendance. Please try again.',
      );
      setPhase('error');
    }
  };

  // ── Stop scanner ──────────────────────────────────────────────────────────
  const stopScanner = async () => {
    try {
      await scannerRef.current?.stop();
      scannerRef.current = null;
    } catch {}
  };

  // ── Go back to dashboard ──────────────────────────────────────────────────
  const goBack = () => {
    stopScanner();
    setPhase("dashboard");
    setResult(null);
    setErrorMsg("");
    setLocation(null);
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // Not Registered
  // ══════════════════════════════════════════════════════════════════════════
  if (!profile && !loadingRecords) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="ambient-bg" aria-hidden="true">
          <div className="ambient-blob ambient-blob-1" />
          <div className="ambient-blob ambient-blob-2" />
        </div>
        <main className="container mx-auto max-w-md px-4 py-16 text-center relative">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="empty-state">
              <div className="empty-state-icon"><ScanLine className="h-7 w-7" /></div>
              <div className="empty-state-title">Mark Attendance</div>
              <div className="empty-state-text">
                Register to start marking your attendance by scanning the QR code displayed by the admin.
              </div>
              <Button asChild variant="liquidGlassMaroon" size="lg" className="rounded-full px-8">
                <Link to="/register">Register Now</Link>
              </Button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD PHASE — History + Scan Button
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === "dashboard") {
    const attendanceCount = records.length;

    return (
      <div className="min-h-screen bg-background pb-16">
        <SiteHeader />
        <div className="ambient-bg" aria-hidden="true">
          <div className="ambient-blob ambient-blob-1" />
          <div className="ambient-blob ambient-blob-2" />
          <div className="ambient-blob ambient-blob-3" />
        </div>

        <main className="relative container mx-auto max-w-md px-4 py-8 space-y-6">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-1.5">
            <h1 className="text-hero-heading text-primary font-bold">Attendance</h1>
            <p className="text-label text-secondary uppercase font-bold tracking-wider">Aarambh 2026</p>
          </motion.div>

          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 gap-3">
            <div className="glass-premium-v2 rounded-2xl p-4 text-center">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 mx-auto mb-2">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold text-primary">{attendanceCount}</div>
              <div className="text-xs text-tertiary font-medium">Sessions Attended</div>
            </div>
            <div className="glass-premium-v2 rounded-2xl p-4 text-center">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 mx-auto mb-2">
                <Shield className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold text-primary">{profile?.full_name?.[0] || "?"}</div>
              <div className="text-xs text-tertiary font-medium">Verified Student</div>
            </div>
          </motion.div>

          {/* SCAN BUTTON — the main CTA */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
            <Button
              variant="liquidGlassMaroon"
              size="lg"
              className="w-full rounded-2xl h-16 text-lg font-bold gap-3"
              onClick={startAttendanceFlow}
            >
              <Camera className="w-6 h-6" />
              Scan Attendance QR
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-2">
              Point your camera at the QR displayed on the projector or smart panel
            </p>
          </motion.div>

          {/* How it works */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <div className="glass-premium-v2 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500" />
                How Secure Attendance Works
              </h3>
              {[
                { icon: Camera, text: "Open camera and scan the QR code shown by admin" },
                { icon: MapPin, text: "Your location is verified to ensure you're on campus" },
                { icon: Clock, text: "QR codes rotate every 30s — they can't be shared" },
                { icon: CheckCircle2, text: "Attendance is recorded securely on the server" },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs text-secondary">
                  <div className="w-5 h-5 rounded-full bg-primary/5 flex items-center justify-center shrink-0 mt-0.5">
                    <step.icon className="w-3 h-3 text-primary/60" />
                  </div>
                  {step.text}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Attendance History */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-label text-secondary uppercase font-bold tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                Recent Attendance
              </h3>
              <span className="text-xs text-tertiary">{attendanceCount} total</span>
            </div>

            {loadingRecords ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="skeleton-glass skeleton-card" style={{ minHeight: "56px" }} />)}
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No attendance records yet</p>
                <p className="text-xs mt-1">Scan a QR code to mark your first attendance</p>
              </div>
            ) : (
              <div className="space-y-2">
                {records.map(rec => (
                  <div key={rec.id} className="glass-premium-v2 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-primary">{rec.event_id || rec.session_id}</div>
                        <div className="text-xs text-tertiary">
                          {rec.scanned_at?.toDate?.()
                            ? rec.scanned_at.toDate().toLocaleString("en-IN", {
                                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                              })
                            : "—"}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      Present
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOCATING PHASE — Getting GPS coordinates
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === "locating") {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-16">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto">
              <MapPin className="w-10 h-10 text-blue-500 animate-bounce" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">Verifying Location</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Checking that you're inside the KRMU campus...
              </p>
            </div>
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            <Button variant="outline" size="sm" onClick={goBack}>Cancel</Button>
          </motion.div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCANNER PHASE — Camera active
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === "scanner") {
    return (
      <div className="min-h-screen bg-black">
        <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-xl">
          <Button variant="ghost" size="sm" className="text-white" onClick={goBack}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <span className="text-white text-sm font-semibold flex items-center gap-1.5">
            <ScanLine className="w-4 h-4" /> Scan QR Code
          </span>
          <div className="w-16" />
        </div>

        <div className="flex flex-col items-center justify-center min-h-screen px-4 pt-16 pb-8">
          <div
            id={scannerContainerId}
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ minHeight: "300px" }}
          />

          <div className="mt-6 text-center">
            <p className="text-white/80 text-sm font-medium">
              Point your camera at the QR code
            </p>
            <p className="text-white/40 text-xs mt-1">
              The QR is displayed on the projector or smart panel by the admin
            </p>
            {location && (
              <p className="text-emerald-400 text-xs mt-3 flex items-center justify-center gap-1">
                <MapPin className="w-3 h-3" /> Location verified • On campus
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUBMITTING PHASE — Processing attendance
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === "submitting") {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-16">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">Marking Attendance</h2>
              <p className="text-sm text-muted-foreground mt-1">Verifying your QR code and location...</p>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUCCESS PHASE
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === "success") {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", damping: 15, stiffness: 200 }}
            className="text-center space-y-6"
          >
            {/* Success checkmark */}
            <motion.div
              className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.1, damping: 10, stiffness: 200 }}
            >
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            </motion.div>

            <div>
              <h2 className="text-2xl font-bold text-primary">Attendance Marked!</h2>
              <p className="text-lg text-emerald-600 font-semibold mt-1">{result?.studentName}</p>
            </div>

            {result && (
              <div className="glass-premium-v2 rounded-2xl p-4 space-y-2 text-left max-w-xs mx-auto">
                {result.eventTitle && (
                  <div className="flex justify-between text-sm">
                    <span className="text-tertiary">Event</span>
                    <span className="font-semibold text-primary">{result.eventTitle}</span>
                  </div>
                )}
                {result.venue && (
                  <div className="flex justify-between text-sm">
                    <span className="text-tertiary">Venue</span>
                    <span className="font-semibold text-primary">{result.venue}</span>
                  </div>
                )}
                {result.date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-tertiary">Date</span>
                    <span className="font-semibold text-primary">{result.date}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
              </Button>
              <Button variant="liquidGlassMaroon" onClick={startAttendanceFlow}>
                <Camera className="w-4 h-4 mr-1.5" /> Scan Another
              </Button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DUPLICATE PHASE
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === "duplicate") {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">Already Marked!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your attendance for this session was already recorded.
              </p>
              {result?.studentName && (
                <p className="text-base font-semibold text-primary mt-2">{result.studentName}</p>
              )}
            </div>
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Dashboard
            </Button>
          </motion.div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ERROR PHASE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-md px-4 py-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <XCircle className="w-10 h-10 text-red-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Attendance Failed</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{errorMsg}</p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <Button variant="liquidGlassMaroon" onClick={startAttendanceFlow}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Try Again
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
