import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  ArrowLeft, User, BookOpen, CheckCircle2,
  AlertTriangle, XCircle, ScanLine, RotateCcw,
  Sparkles, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { localDb, type LocalStudent } from "@/lib/local-db";
import { recordScan } from "@/lib/attendance.functions";

export const Route = createFileRoute("/student-scan")({
  head: () => ({
    meta: [
      { title: "Scan QR · KRMU Induction" },
      { name: "description", content: "Point your camera at the session QR poster to mark attendance instantly." },
    ],
  }),
  component: StudentScanPage,
});

/* ─── Types ──────────────────────────────────────────────────────────────── */
type ScanPhase =
  | { status: "scanning" }
  | { status: "processing" }
  | { status: "success"; studentName: string; eventTitle: string; day: number; duplicate: boolean }
  | { status: "error"; message: string };

/* ─── Haptic + Audio helpers ─────────────────────────────────────────────── */
function buzz(type: "success" | "warn" | "error") {
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate(type === "success" ? [80] : type === "warn" ? [40, 30, 40] : [200]);
    }
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
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
function StudentScanPage() {
  const [profile, setProfile] = useState<LocalStudent | null>(null);
  const [phase, setPhase] = useState<ScanPhase>({ status: "scanning" });
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    const p = localDb.getStudentProfile();
    if (p) setProfile(p);
  }, []);

  /* ─── Process scanned QR ──────────────────────────────────────────────── */
  const onScanSuccess = useCallback(async (decodedText: string) => {
    if (processingRef.current || !profile) return;
    processingRef.current = true;
    setPhase({ status: "processing" });

    // Extract qr_token from the decoded URL
    let qrToken = decodedText.trim();
    try {
      if (qrToken.includes("/scan/")) {
        const urlObj = new URL(qrToken);
        const parts = urlObj.pathname.split("/scan/");
        if (parts.length > 1) {
          qrToken = parts[1].split("/")[0];
        }
      }
    } catch {
      if (qrToken.includes("/scan/")) {
        const parts = qrToken.split("/scan/");
        qrToken = parts[parts.length - 1].split("?")[0];
      }
    }

    try {
      const res = await recordScan({
        data: { qr_token: qrToken, enrollment_no: profile.enrollment_no }
      });

      if (res.ok) {
        const isDuplicate = !!res.duplicate;
        buzz(isDuplicate ? "warn" : "success");
        setPhase({
          status: "success",
          studentName: res.student?.name || profile.full_name,
          eventTitle: res.event?.title || "Session",
          day: res.event?.day || 1,
          duplicate: isDuplicate,
        });
      } else {
        buzz("error");
        setPhase({ status: "error", message: res.error || "Attendance failed. Try again." });
      }
    } catch (err: any) {
      buzz("error");
      setPhase({ status: "error", message: err.message || "Network error. Check your connection." });
    }
  }, [profile]);

  const resetScanner = () => {
    processingRef.current = false;
    setPhase({ status: "scanning" });
  };

  /* ─── Not registered ──────────────────────────────────────────────────── */
  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border bg-card shadow-elegant overflow-hidden max-w-sm w-full"
        >
          <div className="h-2 bg-hero" />
          <div className="p-8 text-center">
            <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-hero text-primary-foreground shadow-elegant">
              <User className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">Register First</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
              You need to register before you can scan QR codes to mark your attendance.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button variant="liquidGlassMaroon" asChild size="lg" className="h-12 w-full text-base rounded-full font-semibold">
                <Link to="/register">Register in 30 Seconds</Link>
              </Button>
              <Button variant="liquidGlassDark" asChild size="lg" className="h-12 w-full text-base rounded-full font-medium">
                <Link to="/">Back to Home</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ─── Full-screen Scanner View ────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* ── Top bar: glassmorphism with student info ── */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-xl border-b border-white/10">
        <Link
          to="/"
          className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 transition-colors active:scale-95"
        >
          <ArrowLeft className="h-5 w-5 text-white" />
        </Link>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-white text-sm font-semibold leading-tight truncate max-w-[160px]">
              {profile.full_name}
            </p>
            <p className="text-white/50 text-[0.65rem] font-medium tracking-wide">
              {profile.enrollment_no}
            </p>
          </div>
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/80 to-primary grid place-items-center shadow-lg ring-2 ring-white/20">
            <User className="h-4 w-4 text-white" />
          </div>
        </div>
      </div>

      {/* ── Camera viewport ── */}
      <div className="flex-1 relative overflow-hidden">
        <CameraScanner
          onScan={onScanSuccess}
          active={phase.status === "scanning"}
          onReady={() => setCameraReady(true)}
          onError={(msg) => setCameraError(msg)}
        />

        {/* Scanning overlay — corner brackets + laser */}
        {cameraReady && phase.status === "scanning" && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Dimmed border */}
            <div className="absolute inset-0 bg-black/30" />
            {/* Clear center cutout */}
            <div className="relative w-72 h-72 sm:w-80 sm:h-80">
              {/* Remove the dimmed area inside the frame */}
              <div className="absolute inset-0 rounded-3xl" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }} />
              
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-12 h-12 border-t-[3px] border-l-[3px] border-white rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-12 h-12 border-t-[3px] border-r-[3px] border-white rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-12 h-12 border-b-[3px] border-l-[3px] border-white rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-[3px] border-r-[3px] border-white rounded-br-2xl" />

              {/* Sweeping laser line */}
              <motion.div
                className="absolute left-3 right-3 h-[2px] rounded-full"
                style={{
                  background: "linear-gradient(90deg, transparent 0%, rgba(139,69,19,0.9) 20%, rgba(255,255,255,0.95) 50%, rgba(139,69,19,0.9) 80%, transparent 100%)",
                  boxShadow: "0 0 12px 3px rgba(139,69,19,0.4), 0 0 40px 6px rgba(139,69,19,0.15)",
                }}
                animate={{ top: ["4%", "96%", "4%"] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </div>
        )}

        {/* Camera not ready state */}
        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
            <div className="relative">
              <div className="animate-spin rounded-full border-4 border-white/20 border-t-white h-12 w-12" />
              <ScanLine className="absolute inset-0 m-auto h-5 w-5 text-white/60" />
            </div>
            <p className="text-white/60 text-sm font-medium">Starting camera…</p>
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-red-500/20 grid place-items-center">
              <XCircle className="h-8 w-8 text-red-400" />
            </div>
            <p className="text-white font-semibold text-lg">Camera Unavailable</p>
            <p className="text-white/60 text-sm max-w-xs">{cameraError}</p>
            <Button
              variant="liquidGlassWhite"
              className="rounded-full mt-2"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Processing overlay */}
        <AnimatePresence>
          {phase.status === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center gap-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Zap className="h-10 w-10 text-amber-400" />
              </motion.div>
              <p className="text-white font-semibold text-lg">Marking attendance…</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success overlay */}
        <AnimatePresence>
          {phase.status === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 p-8 text-center backdrop-blur-xl ${
                phase.duplicate ? "bg-amber-600/85" : "bg-emerald-600/85"
              }`}
            >
              {/* Floating particles */}
              {!phase.duplicate && (
                <>
                  {[...Array(12)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-2 h-2 rounded-full bg-white/40"
                      initial={{
                        x: 0, y: 0, scale: 0, opacity: 1,
                      }}
                      animate={{
                        x: (Math.random() - 0.5) * 300,
                        y: (Math.random() - 0.5) * 400,
                        scale: [0, 1, 0.5],
                        opacity: [1, 0.8, 0],
                      }}
                      transition={{
                        duration: 1.5,
                        delay: i * 0.05,
                        ease: "easeOut",
                      }}
                      style={{ left: "50%", top: "40%" }}
                    />
                  ))}
                </>
              )}

              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
              >
                {phase.duplicate ? (
                  <div className="h-24 w-24 rounded-full bg-white/20 grid place-items-center ring-4 ring-white/30">
                    <AlertTriangle className="h-12 w-12 text-white" />
                  </div>
                ) : (
                  <div className="h-24 w-24 rounded-full bg-white/20 grid place-items-center ring-4 ring-white/30">
                    <CheckCircle2 className="h-12 w-12 text-white" />
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="space-y-2"
              >
                <h2 className="text-white text-2xl font-bold">
                  {phase.duplicate ? "Already Checked In" : "Attendance Marked!"}
                </h2>
                <p className="text-white/90 text-base font-medium">{phase.studentName}</p>
                <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 text-sm text-white/80 font-medium">
                  <Sparkles className="h-3.5 w-3.5" />
                  Day {phase.day} · {phase.eventTitle}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-4 flex flex-col gap-2 w-full max-w-xs"
              >
                <Button
                  onClick={resetScanner}
                  className="w-full h-12 rounded-full bg-white text-emerald-700 font-bold text-base hover:bg-white/90 shadow-lg"
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Scan Another
                </Button>
                <Button
                  variant="ghost"
                  asChild
                  className="w-full h-12 rounded-full text-white/80 font-medium hover:text-white hover:bg-white/10"
                >
                  <Link to="/">Done — Go Home</Link>
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error overlay */}
        <AnimatePresence>
          {phase.status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 bg-red-700/85 backdrop-blur-xl flex flex-col items-center justify-center gap-5 p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <div className="h-24 w-24 rounded-full bg-white/20 grid place-items-center ring-4 ring-white/30">
                  <XCircle className="h-12 w-12 text-white" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-2"
              >
                <h2 className="text-white text-2xl font-bold">Scan Failed</h2>
                <p className="text-white/80 text-sm max-w-xs">{phase.message}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-4 flex flex-col gap-2 w-full max-w-xs"
              >
                <Button
                  onClick={resetScanner}
                  className="w-full h-12 rounded-full bg-white text-red-700 font-bold text-base hover:bg-white/90 shadow-lg"
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Try Again
                </Button>
                <Button
                  variant="ghost"
                  asChild
                  className="w-full h-12 rounded-full text-white/80 font-medium hover:text-white hover:bg-white/10"
                >
                  <Link to="/attendance">Use Manual Attendance</Link>
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom bar ── */}
      {cameraReady && phase.status === "scanning" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative z-20 px-6 py-5 bg-black/60 backdrop-blur-xl border-t border-white/10"
        >
          <div className="flex items-center justify-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <p className="text-white/70 text-sm font-medium">
              Point camera at the session QR poster
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ─── Camera Scanner Component ───────────────────────────────────────────── */
function CameraScanner({
  onScan,
  active,
  onReady,
  onError,
}: {
  onScan: (text: string) => void;
  active: boolean;
  onReady: () => void;
  onError: (msg: string) => void;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const scannedRef = useRef(false);
  const initLockRef = useRef(false);
  const scanRegionId = "student-qr-scanner";

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Reset scanned lock when becoming active again
  useEffect(() => {
    if (active) {
      scannedRef.current = false;
    }
  }, [active]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (initLockRef.current) return;
      initLockRef.current = true;

      try {
        const scanner = new Html5Qrcode(scanRegionId, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
        });

        const scanConfig = { fps: 10, disableFlip: true };

        const successCb = (decodedText: string) => {
          if (!mounted || scannedRef.current) return;
          scannedRef.current = true;
          onScanRef.current(decodedText);
        };

        // Try rear camera first, fall back to front
        try {
          await scanner.start({ facingMode: "environment" }, scanConfig, successCb, () => {});
        } catch {
          await scanner.start({ facingMode: "user" }, { ...scanConfig, disableFlip: false }, successCb, () => {});
        }

        if (mounted) {
          scannerRef.current = scanner;
          onReady();
        } else {
          await scanner.stop().catch(() => {});
          scanner.clear();
        }
      } catch (err: any) {
        if (mounted) {
          const msg = err?.message?.includes("permission")
            ? "Camera permission denied. Please allow camera access in your browser settings."
            : "Could not start camera. Please check permissions and try again.";
          onError(msg);
        }
      } finally {
        initLockRef.current = false;
      }
    };

    init();

    return () => {
      mounted = false;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        (scanner.isScanning ? scanner.stop() : Promise.resolve())
          .finally(() => scanner.clear())
          .catch(() => {});
      }
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black flex items-center justify-center">
      <div id={scanRegionId} className="w-full h-full" />
    </div>
  );
}
