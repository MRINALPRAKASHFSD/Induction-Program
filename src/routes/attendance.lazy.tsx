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
  ScanLine, CheckCircle2, XCircle, AlertTriangle, X, Navigation, Signal, Smartphone, ShieldAlert, Check, Navigation2,
  ArrowLeft, Clock, MapPin, Shield, History,
  Percent, ChevronRight, Camera, Loader2, RefreshCw,
  Zap, ZapOff, ZoomIn, SwitchCamera, Sun, Focus, QrCode,
  Users, ChevronDown, CalendarDays
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { localDb, type LocalStudent } from "@/lib/local-db";
import { auth, db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { verifyInsideCampus, isInsideCampus, CAMPUS_CENTER, CAMPUS_RADIUS_METERS, type GeolocationResult, GeofenceError } from "@/lib/geofence";
import { toast } from "sonner";

const DEPARTMENTS = {
  SOET: "School of Engineering and Technology",
  SOMC: "School of Management and Commerce",
  SOAS: "School of Applied Sciences",
  SOAH: "School of Allied Health",
  SALS: "School of Agricultural and Life Sciences",
  SOL: "School of Law",
  SOA: "School of Architecture",
  SOJMC: "School of Journalism and Mass Communication",
  SOED: "School of Education",
  SFA: "School of Fine Arts",
  SOHS: "School of Humanities and Social Sciences"
};

const playSuccessSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.warn("Audio play failed", e);
  }
};

export const Route = createLazyFileRoute("/attendance")({
  // @ts-expect-error - Route type options do not include head in this version
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
  // Guest linkage fields (additive — may be null for older sessions)
  sessionId?: string;
  event_id?: string | null;
}

// ══════════════════════════════════════════════════════════════════════════════
function AttendancePage() {
  const [profile, setProfile] = useState<LocalStudent | null>(null);
  const [phase, setPhase] = useState<Phase>("dashboard");
  const [result, setResult] = useState<MarkResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorObj, setErrorObj] = useState<Error | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [location, setLocation] = useState<GeolocationResult | null>(null);
  // locationRef mirrors location state but is readable inside scanner callbacks
  // without stale closure issues (state updates are async; refs are synchronous).
  const locationRef = useRef<GeolocationResult | null>(null);

  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
  const [hasZoom, setHasZoom] = useState(false);
  const [lowLightWarning, setLowLightWarning] = useState(false);
  const [isSoftwareZoom, setIsSoftwareZoom] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{x: number, y: number} | null>(null);
  const lightingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialPinchDistRef = useRef<number | null>(null);
  
  const lastScanRef = useRef<{ data: string, time: number }>({ data: "", time: 0 });
  const isProcessingRef = useRef(false);

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
        collection(db, "attendance_logs"),
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

  // ── Start scanning flow: Camera first, then GPS in background ───────────────
  const startAttendanceFlow = async () => {
    // Show scanner immediately so iOS Safari doesn't pause the hidden <video> element
    setPhase("scanner");
    setErrorMsg("");
    locationRef.current = null;
    setLocation(null);

    try {
      const scannerStarted = await startScanner();
      if (!scannerStarted) return;

      // Start GPS in background
      verifyInsideCampus().then(position => {
        locationRef.current = position;
        setLocation(position);
      }).catch(e => {
        // If GPS fails and they haven't scanned yet, stop and show error
        if (!isProcessingRef.current) {
          stopScanner();
          setErrorObj(e as Error);
          setErrorMsg(e.message || "Failed to get your location");
          setPhase("error");
        }
      });
    } catch (e: any) {
      stopScanner();
      setErrorMsg(e.message || "Failed to start camera");
      setPhase("error");
    }
  };

  // ── Camera scanner ────────────────────────────────────────────────────────
  const startScanner = async (cameraId?: string): Promise<boolean> => {
    try {
      if (scannerRef.current) {
        try { await scannerRef.current.stop(); } catch(e) {}
        scannerRef.current.clear();
      }

      if (lightingIntervalRef.current) {
        clearInterval(lightingIntervalRef.current);
        lightingIntervalRef.current = null;
      }

      let currentCameras = cameras;
      if (currentCameras.length === 0) {
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCameras(devices);
            currentCameras = devices;
          }
        } catch (e) {
          console.warn("Could not get cameras", e);
        }
      }

      let started = false;
      let lastError: any = null;
      let usedCameraId = cameraId || localStorage.getItem("preferred_camera_id") || undefined;

      // html5-qrcode REQUIREMENT: constraint objects must have EXACTLY 1 top-level key.
      // An empty {} causes: "'cameraIdOrConfig' object should have exactly 1 key, found 0 keys"
      // String values ("environment" / "user") are always valid as a final fallback.
      const fallbackConfigs: (MediaTrackConstraints | string)[] = [
        { facingMode: { ideal: "environment" } },  // 1 key ✓ — prefer rear camera
        { facingMode: "environment" },              // 1 key ✓ — strict rear camera
        { facingMode: { ideal: "user" } }           // 1 key ✓ — front camera fallback
      ];

      const attemptConfigs: (MediaTrackConstraints | string)[] = usedCameraId
        ? [
            { deviceId: { exact: usedCameraId } },  // 1 key ✓ — exact preferred camera
            ...fallbackConfigs
          ]
        : fallbackConfigs;

      for (const config of attemptConfigs) {
        try {
          // Clean up any failed previous instance in the loop
          if (scannerRef.current) {
            try { await scannerRef.current.stop(); } catch(err) {}
            try { scannerRef.current.clear(); } catch(err) {}
            scannerRef.current = null;
          }

          // Instantiate a fresh scanner for each attempt to avoid 'already under transition' errors
          const scanner = new Html5Qrcode(scannerContainerId, {
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
            verbose: false,
            experimentalFeatures: { useBarCodeDetectorIfSupported: true }
          });
          scannerRef.current = scanner;

          // Note: DO NOT set focusMode directly on config here, it causes OverconstrainedError on many devices (iOS Safari).
          // We will attempt to set it safely after camera start via applyVideoConstraints.

          await scanner.start(
            config,
            {
              fps: 30, // Increased to 30 for extreme sensitivity and fast capture
              qrbox: (viewfinderWidth, viewfinderHeight) => {
                const isMobile = window.innerWidth < 640;
                const isTablet = window.innerWidth >= 640 && window.innerWidth < 1024;
                // Slightly tighter box to focus the scanner strictly on the QR and ignore background
                let pct = isMobile ? 0.75 : isTablet ? 0.6 : 0.5; 
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                let size = Math.floor(minEdge * pct);
                if (!isMobile && size > 500) size = 500;
                return { width: size, height: size };
              },
              aspectRatio: 1.0,
              disableFlip: false,
            },
            (decodedText) => {
              const now = Date.now();
              if (lastScanRef.current.data === decodedText && now - lastScanRef.current.time < 2000) {
                return;
              }
              lastScanRef.current = { data: decodedText, time: now };
              handleScan(decodedText);
            },
            () => {},
          );
          started = true;
          if (usedCameraId) localStorage.setItem("preferred_camera_id", usedCameraId);
          break;
        } catch (e) {
          lastError = e;
          console.warn("Camera init attempt failed:", config, e);
        }
      }

      if (!started) throw lastError;

      setTimeout(() => {
        try {
          if (!scannerRef.current) return;
          const trackCaps = scannerRef.current.getRunningTrackCapabilities();
          const trackSettings = scannerRef.current.getRunningTrackSettings();
          
          if ((trackCaps as any).torch) setHasTorch(true);
          else setHasTorch(false);

          if ((trackCaps as any).zoom) {
            setHasZoom(true);
            setIsSoftwareZoom(false);
            setZoomRange({ min: (trackCaps as any).zoom.min || 1, max: (trackCaps as any).zoom.max || 5 });
            setZoom(trackSettings.zoom || (trackCaps as any).zoom.min || 1);
          } else {
            // Enable high-quality software (CSS) zoom as a fallback
            setHasZoom(true);
            setIsSoftwareZoom(true);
            setZoomRange({ min: 1, max: 3 });
            setZoom(1);
          }
          
          if ((trackCaps as any).focusMode && Array.isArray((trackCaps as any).focusMode) && (trackCaps as any).focusMode.includes("continuous")) {
            scannerRef.current.applyVideoConstraints({
              advanced: [{ focusMode: "continuous" } as any]
            }).catch(() => {});
          }
        } catch (e) {
          console.warn("Capability check failed", e);
        }
      }, 500);

      lightingIntervalRef.current = setInterval(() => {
        const videoEl = document.querySelector(`#${scannerContainerId} video`) as HTMLVideoElement;
        if (!videoEl || videoEl.videoWidth === 0) return;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        canvas.width = 64; 
        canvas.height = 64;
        try {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let i = 0; i < imageData.length; i += 4) {
            sum += (imageData[i] * 0.299 + imageData[i+1] * 0.587 + imageData[i+2] * 0.114);
          }
          const avg = sum / (imageData.length / 4);
          setLowLightWarning(avg < 40);
        } catch(e) {}
      }, 1000);

      return true;

    } catch (e: any) {
      console.error("Scanner error:", e);
      let errMsg = `Failed to start camera. Error: ${e?.message || e?.name || String(e)}`;
      if (e?.name === "NotAllowedError" || e?.message?.includes("NotAllowed")) errMsg = "Camera permission denied. Please enable camera access in your browser settings.";
      if (e?.name === "NotReadableError") errMsg = "Camera is already in use by another app or tab.";
      if (e?.name === "NotFoundError") errMsg = "No camera found on this device.";
      
      setErrorObj(new Error(errMsg));
      setErrorMsg(errMsg);
      setPhase("error");
      return false;
    }
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const newTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: newTorch } as any]
      });
      setTorchOn(newTorch);
    } catch (e) {
      console.warn("Failed to toggle torch", e);
    }
  };

  const handleZoomChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newZoom = parseFloat(e.target.value);
    setZoom(newZoom);
    if (!scannerRef.current || !hasZoom || isSoftwareZoom) return;
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ zoom: newZoom } as any]
      });
    } catch (err) {
      console.warn("Failed to change zoom", err);
    }
  };

  const cycleCamera = async () => {
    if (cameras.length < 2) return;
    let nextIndex = 0;
    if (selectedCameraId) {
      const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
      nextIndex = (currentIndex + 1) % cameras.length;
    } else {
      nextIndex = 1 % cameras.length;
    }
    const nextCamId = cameras[nextIndex].id;
    setSelectedCameraId(nextCamId);
    setHasTorch(false);
    setTorchOn(false);
    setHasZoom(false);
    await startScanner(nextCamId);
  };

  const handleContainerTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && hasZoom) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistRef.current = Math.sqrt(dx*dx + dy*dy);
    }
  };

  const handleContainerTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && hasZoom && initialPinchDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const diff = dist - initialPinchDistRef.current;
      
      let newZoom = zoom + (diff * 0.01);
      if (newZoom < zoomRange.min) newZoom = zoomRange.min;
      if (newZoom > zoomRange.max) newZoom = zoomRange.max;
      
      setZoom(newZoom);
      initialPinchDistRef.current = dist;
      
      if (scannerRef.current && !isSoftwareZoom) {
        scannerRef.current.applyVideoConstraints({ advanced: [{ zoom: newZoom } as any] }).catch(()=>{});
      }
    }
  };

  const handleContainerClick = async (e: React.MouseEvent) => {
    if (!scannerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setFocusPoint({ x, y });
    setTimeout(() => setFocusPoint(null), 1000);
    
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ focusMode: "single-shot" } as any]
      });
    } catch(err) {}
  };

  // ── Handle scanned QR ─────────────────────────────────────────────────────
  const handleScan = async (qrData: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    if (!profile?.enrollment_no) {
      setErrorObj(new Error("Please register first to mark attendance."));
      setErrorMsg("Please register first to mark attendance.");
      setPhase("error");
      return;
    }

    setPhase("submitting");

    let currentLocation = locationRef.current;
    if (!currentLocation) {
      // If GPS is still acquiring, wait for it now
      try {
        currentLocation = await verifyInsideCampus();
        locationRef.current = currentLocation;
        setLocation(currentLocation);
      } catch (e: any) {
        setErrorObj(e as Error);
        setErrorMsg(e.message || "Failed to verify campus location.");
        setPhase("error");
        return;
      }
    }

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
          latitude: currentLocation.lat,
          longitude: currentLocation.lng,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorObj(new Error(data.error || "Failed to mark attendance."));
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
        playSuccessSound();
        if ('vibrate' in navigator) navigator.vibrate([200]);
        loadAttendanceHistory(profile.enrollment_no);
      }
    } catch (e: any) {
      const isOffline = !navigator.onLine
        || e.name === 'TypeError'
        || e.message?.toLowerCase().includes('failed to fetch')
        || e.message?.toLowerCase().includes('network')
        || e.message?.toLowerCase().includes('networkerror');

      setErrorObj(new Error(isOffline ? 'Network unavailable. Please reconnect and scan again.' : 'Failed to reach server. Please check your connection.'));
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

  const resumeScanning = () => {
    isProcessingRef.current = false;
    setPhase("scanner");
    setErrorMsg("");
    setErrorObj(null);
    setResult(null);
  };

  const retryOrResume = () => {
    if (scannerRef.current) {
      resumeScanning();
    } else {
      startAttendanceFlow();
    }
  };

  // ── Go back to dashboard ──────────────────────────────────────────────────
  const goBack = () => {
    isProcessingRef.current = false;
    stopScanner();
    setPhase("dashboard");
    setResult(null);
    setErrorMsg("");
    setErrorObj(null);
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
  
  const attendanceCount = records.length;

  return (
    <>
      {/* BACKGROUND SCANNER: Always in DOM with dimensions to prevent 0x0 initialization errors */}
      <div style={{ 
        opacity: phase === 'scanner' ? 1 : 0, 
        pointerEvents: phase === 'scanner' ? 'auto' : 'none',
        position: 'fixed', inset: 0, zIndex: phase === 'scanner' ? 10 : -10 
      }}>
        <div className="min-h-screen bg-black">
          <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-xl">
            <Button variant="ghost" size="sm" className="text-white" onClick={goBack}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <span className="text-white text-sm font-semibold flex items-center gap-1.5">
              <ScanLine className="w-4 h-4" /> Scan QR
            </span>
            <div className="flex justify-end gap-2">
              {cameras.length > 1 && (
                <Button variant="ghost" size="icon" className="text-white h-8 w-8 rounded-full" onClick={cycleCamera}>
                  <SwitchCamera className="w-4 h-4" />
                </Button>
              )}
              {hasTorch && (
                <Button variant="ghost" size="icon" className={`text-white h-8 w-8 rounded-full ${torchOn ? 'bg-white/20' : ''}`} onClick={toggleTorch}>
                  {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center min-h-screen px-4 pt-16 pb-8 relative">
            <div 
              className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-black transition-colors"
              style={{ minHeight: "300px" }}
              onTouchStart={handleContainerTouchStart}
              onTouchMove={handleContainerTouchMove}
              onClick={handleContainerClick}
            >
              <div
                id={scannerContainerId}
                className={`w-full h-full ${phase === 'success' ? 'border-4 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : ''}`}
                style={{ 
                  transform: isSoftwareZoom ? `scale(${zoom})` : 'none', 
                  transformOrigin: 'center',
                  transition: 'transform 0.1s ease-out' 
                }}
              />
              
              <AnimatePresence>
                {focusPoint && (
                  <motion.div
                    initial={{ opacity: 0, scale: 1.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="absolute border-2 border-yellow-400 rounded-sm pointer-events-none flex items-center justify-center"
                    style={{ left: focusPoint.x - 20, top: focusPoint.y - 20, width: 40, height: 40 }}
                  >
                    <Focus className="w-6 h-6 text-yellow-400 opacity-50" />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {lowLightWarning && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 pointer-events-none z-20"
                  >
                    <Sun className="w-4 h-4 text-amber-400" />
                    <span className="text-white text-xs font-medium">Lighting is too low</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {hasZoom && (
              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-64 bg-black/50 p-3 rounded-2xl backdrop-blur-md flex items-center gap-3 z-30">
                 <ZoomIn className="w-5 h-5 text-white/70" />
                 <input 
                   type="range" 
                   min={zoomRange.min} 
                   max={zoomRange.max} 
                   step="0.1" 
                   value={zoom}
                   onChange={handleZoomChange}
                   className="flex-1 accent-white"
                 />
              </div>
            )}

            <div className="mt-6 text-center z-10 pointer-events-none">
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
      </div>

            {phase === "dashboard" && (
        <div className="min-h-screen bg-background pb-16">
          <SiteHeader />
          <div className="ambient-bg hidden md:block" aria-hidden="true">
            <div className="ambient-blob ambient-blob-1" />
            <div className="ambient-blob ambient-blob-2" />
            <div className="ambient-blob ambient-blob-3" />
          </div>

          <main 
            className="relative mx-auto mt-8 lg:mt-12 space-y-6 md:space-y-8"
            style={{ maxWidth: "1600px", width: "min(94vw, 1600px)", paddingInline: "clamp(20px, 3vw, 48px)" }}
          >
            {/* Header */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="md:hidden text-center space-y-1 mb-6"
            >
              <h1 className="text-2xl font-bold text-primary">Attendance Status</h1>
              <p className="text-xs text-muted-foreground">Fast • Secure • Verified</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 lg:gap-12">
              
              {/* LEFT COLUMN: Identity Pass */}
              <div className="md:col-span-5 lg:col-span-4 flex flex-col gap-6">
                {!profile ? (
                  <div className="glass-premium-v2 rounded-3xl p-6 space-y-6 min-h-[400px]">
                    <div className="skeleton-glass w-full h-8 rounded-lg" />
                    <div className="skeleton-glass w-3/4 h-6 rounded-lg" />
                    <div className="skeleton-glass w-full h-32 rounded-xl mt-8" />
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-premium-v2 rounded-[32px] overflow-hidden relative border border-white/40 dark:border-white/10 shadow-xl"
                  >
                    {/* Noise texture overlay */}
                    <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay pointer-events-none" />
                    
                    {/* Pass Header */}
                    <div className="bg-primary/5 p-6 border-b border-white/20 dark:border-white/5 relative overflow-hidden">
                      <div className="absolute -right-12 -top-12 w-40 h-40 bg-primary/10 blur-3xl rounded-full" />
                      <div className="relative z-10 flex justify-between items-start">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-primary/70 font-bold mb-1">Aarambh 2026</div>
                          <h2 className="text-2xl md:text-3xl font-black text-primary tracking-tight leading-none uppercase">{profile.full_name}</h2>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 backdrop-blur-md">
                          <Shield className="w-6 h-6 text-primary" />
                        </div>
                      </div>
                      
                      <div className="mt-6 inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verified Student
                      </div>
                    </div>

                    {/* Pass Details */}
                    <div className="p-6 space-y-5 relative bg-gradient-to-b from-transparent to-black/5 dark:to-white/5">
                      <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-tertiary font-bold mb-1">Programme</div>
                          <div className="text-sm font-semibold text-secondary">{profile.branch || "B.Tech CSE"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-tertiary font-bold mb-1">School</div>
                          <div className="text-sm font-semibold text-secondary">{DEPARTMENTS[profile.department_id as keyof typeof DEPARTMENTS] || "SOET"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-tertiary font-bold mb-1">Enrollment</div>
                          <div className="text-sm font-semibold text-secondary uppercase font-mono tracking-wide">{profile.enrollment_no || profile.id.split('-')[0]}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-tertiary font-bold mb-1">Academic Session</div>
                          <div className="text-sm font-semibold text-secondary">2026-27</div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-dashed border-primary/20 flex justify-between items-center">
                        <div className="font-mono text-xs text-tertiary font-semibold uppercase tracking-widest">
                          ID: {profile.id.split('-').pop()}
                        </div>
                        <div className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                          DAY 2
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Desktop CTA */}
                <div className="hidden md:block mt-2">
                  <ScanButton onScan={startAttendanceFlow} />
                </div>
              </div>

              {/* RIGHT COLUMN: Stats & Journey */}
              <div className="md:col-span-7 lg:col-span-8 flex flex-col gap-6 md:gap-8">
                
                {/* Stats Grid */}
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: 0.1 }}
                  className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4"
                >
                  <StatCard 
                    icon={CheckCircle2}
                    value={attendanceCount}
                    label="Completed"
                    color="emerald"
                  />
                  <StatCard 
                    icon={Clock}
                    value={2}
                    label="Today's Sessions"
                    color="blue"
                  />
                  <StatCard 
                    icon={QrCode}
                    value={1}
                    label="Remaining Today"
                    color="amber"
                  />
                  <StatCard 
                    icon={Shield}
                    value="Day 1"
                    label="Verified Since"
                    color="primary"
                  />
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                  {/* Attendance History (Boarding Pass style) */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm text-primary uppercase font-bold tracking-wider flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Recent Attendance
                      </h3>
                    </div>

                    {loadingRecords ? (
                      <div className="space-y-3">
                        {[1,2].map(i => <div key={i} className="skeleton-glass rounded-[20px] min-h-[80px]" />)}
                      </div>
                    ) : records.length === 0 ? (
                      <div className="glass-premium-v2 rounded-[24px] p-8 text-center border border-dashed border-primary/20">
                        <History className="w-10 h-10 mx-auto mb-3 opacity-20 text-primary" />
                        <p className="text-sm font-bold text-primary">No records yet</p>
                        <p className="text-xs mt-1 text-tertiary">Scan your first QR code to begin your journey.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {records.map(rec => (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            key={rec.id} 
                            className="glass-premium-v2 rounded-[20px] p-4 flex items-center justify-between relative overflow-hidden group hover:border-primary/30 transition-colors"
                          >
                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
                            <div className="flex items-center gap-4 pl-2">
                              <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary/10 transition-colors">
                                <MapPin className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-primary">{rec.event_id || rec.session_id || "Main Auditorium"}</div>
                                <div className="text-[11px] text-tertiary font-medium mt-0.5 flex items-center gap-1.5">
                                  <Clock className="w-3 h-3" />
                                  {rec.scanned_at?.toDate?.()
                                    ? rec.scanned_at.toDate().toLocaleString("en-IN", {
                                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                                      })
                                    : "—"}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                Verified
                              </span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Security Timeline */}
                  <div className="space-y-4 hidden lg:block">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm text-primary uppercase font-bold tracking-wider flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Security Check
                      </h3>
                    </div>

                    <div className="glass-premium-v2 rounded-3xl p-6 relative overflow-hidden h-[calc(100%-2rem)] border border-primary/10">
                      <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full" />
                      
                      <div className="absolute left-9 top-10 bottom-10 w-0.5 bg-primary/10" />
                      
                      <div className="space-y-8 relative z-10">
                        <TimelineStep 
                          icon={MapPin} 
                          title="Campus Location Verified" 
                          status="completed" 
                        />
                        <TimelineStep 
                          icon={Shield} 
                          title="Device Identity Authenticated" 
                          status="completed" 
                        />
                        <TimelineStep 
                          icon={QrCode} 
                          title="Ready for Rotating QR Scan" 
                          status="current" 
                        />
                        <TimelineStep 
                          icon={CheckCircle2} 
                          title="Attendance Logged" 
                          status="upcoming" 
                          isLast
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile CTA */}
                <div className="md:hidden mt-4 pb-8">
                  <ScanButton onScan={startAttendanceFlow} />
                </div>

              </div>
            </div>
          </main>
        </div>
      )}

  

  {/* ══════════════════════════════════════════════════════════════════════════
      LOCATING PHASE — Getting GPS coordinates
      ══════════════════════════════════════════════════════════════════════════ */}
  {phase === "locating" && (
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
    )}

  {/* ══════════════════════════════════════════════════════════════════════════
      SCANNER PHASE — Camera active
      ══════════════════════════════════════════════════════════════════════════ */}
  

  {/* ══════════════════════════════════════════════════════════════════════════
      SUBMITTING PHASE — Processing attendance
      ══════════════════════════════════════════════════════════════════════════ */}
  {phase === "submitting" && (
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
    )}

  {/* ══════════════════════════════════════════════════════════════════════════
      SUCCESS PHASE
      ══════════════════════════════════════════════════════════════════════════ */}
  {phase === "success" && (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-12">
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

            {/* Guest headcount prompt */}
            <GuestDrawerTrigger result={result} profile={profile} />

            {/* Action CTAs */}
            <div className="flex flex-col gap-3 pt-2">
              <Link to="/my-schedule">
                <Button variant="liquidGlassMaroon" className="w-full">
                  <CalendarDays className="w-4 h-4 mr-2" />
                  View Schedule
                </Button>
              </Link>
              <Link to="/my-pass">
                <Button variant="liquidGlassWhite" className="w-full">
                  Back to Dashboard
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={retryOrResume} className="text-tertiary">
                <Camera className="w-4 h-4 mr-1.5" />
                Scan Another
              </Button>
            </div>
          </motion.div>
        </main>
      </div>
    )}

  {/* ══════════════════════════════════════════════════════════════════════════
      DUPLICATE PHASE
      ══════════════════════════════════════════════════════════════════════════ */}
  {phase === "duplicate" && (
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
    )}

  {/* ══════════════════════════════════════════════════════════════════════════
      ERROR PHASE
      ══════════════════════════════════════════════════════════════════════════ */}
  {phase === "error" && (
      <ErrorPhase 
        errorObj={errorObj} 
        errorMsg={errorMsg} 
        goBack={goBack} 
        retryOrResume={retryOrResume} 
      />
    )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PRESENTATIONAL COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function ScanButton({ onScan }: { onScan: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onScan}
      className="w-full relative group overflow-hidden rounded-[28px] p-[1px] bg-gradient-to-b from-white/20 to-white/5 shadow-xl md:shadow-2xl"
    >
      <div className="absolute inset-0 bg-primary/20 group-hover:bg-primary/30 transition-colors duration-500 blur-xl" />
      <div className="relative w-full bg-gradient-to-br from-primary to-[#7a3443] rounded-[27px] p-6 flex flex-col items-center justify-center gap-3 overflow-hidden border border-white/10">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
        <Camera className="w-10 h-10 text-white/90 drop-shadow-md" />
        <div className="text-center">
          <div className="text-lg md:text-xl font-bold text-white tracking-tight">Scan Attendance QR</div>
          <div className="text-[10px] md:text-xs text-white/70 font-semibold tracking-widest uppercase mt-1">Secure • Rotating • Verified</div>
        </div>
      </div>
    </motion.button>
  );
}

function StatCard({ icon: Icon, value, label, color }: { icon: any, value: string | number, label: string, color: 'emerald' | 'blue' | 'amber' | 'primary' }) {
  const colorMap = {
    emerald: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
    blue: "text-blue-600 bg-blue-500/10 border-blue-500/20",
    amber: "text-amber-600 bg-amber-500/10 border-amber-500/20",
    primary: "text-primary bg-primary/5 border-primary/10",
  };
  return (
    <div className="glass-premium-v2 rounded-[20px] p-4 flex flex-col items-center justify-center text-center gap-2 border border-white/40 dark:border-white/10">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${colorMap[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-xl md:text-2xl font-bold text-primary leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-tertiary font-bold mt-1.5">{label}</div>
      </div>
    </div>
  );
}

function TimelineStep({ icon: Icon, title, status, isLast }: { icon: any, title: string, status: 'completed' | 'current' | 'upcoming', isLast?: boolean }) {
  const statusColors = {
    completed: "bg-emerald-500 text-white ring-emerald-500/30",
    current: "bg-primary text-white ring-primary/30",
    upcoming: "bg-primary/5 text-primary/40 ring-transparent",
  };
  
  return (
    <div className="flex items-start gap-4 relative group">
      <div className="relative mt-1">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ring-4 transition-all duration-500 z-10 relative ${statusColors[status]}`}>
          {status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
        </div>
        {status === 'current' && (
          <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-20" />
        )}
      </div>
      <div className="pt-1.5 pb-2">
        <div className={`text-sm font-bold ${status === 'upcoming' ? 'text-primary/40' : 'text-primary'}`}>{title}</div>
      </div>
    </div>
  );
}


export function ErrorPhase({
  errorObj,
  errorMsg,
  goBack,
  retryOrResume
}: {
  errorObj: Error | null;
  errorMsg: string;
  goBack: () => void;
  retryOrResume: () => void;
}) {
  const isGeofence = errorObj instanceof GeofenceError;
  const distance = isGeofence ? errorObj.distance : undefined;
  const accuracy = isGeofence ? errorObj.accuracy : undefined;
  const errorCode = isGeofence ? errorObj.code : (errorObj?.name !== 'Error' ? errorObj?.name : 'ERR_ATTENDANCE');

  const formatDistance = (dist: number) => {
    if (dist < 1000) return `${dist} m`;
    return `${(dist / 1000).toFixed(1)} km`;
  };

  const getStatusText = (step: string) => {
    if (step === 'location') {
      if (isGeofence) return 'Failed';
      return 'Unknown';
    }
    // For Identity, QR, Session, if we are in this flow, they were verified
    return 'Verified';
  };

  const CampusRadius = typeof CAMPUS_RADIUS_METERS !== 'undefined' ? CAMPUS_RADIUS_METERS : 300;

  return (
    <div className="min-h-screen bg-[#FFFDFB] dark:bg-background pb-16">
      <SiteHeader />
      <main className="container mx-auto px-4 py-8 md:py-16">
        
        {/* Top Header */}
        <div className="mb-8 md:mb-12 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 text-sm font-medium text-muted-foreground mb-3">
            <Shield className="w-4 h-4" />
            <span>Secure Attendance</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">
            Attendance Not Recorded
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            {isGeofence 
              ? "Your location could not be verified for this attendance session." 
              : "We couldn't verify your attendance due to a technical issue."}
          </p>
          {errorCode && (
            <p className="text-xs text-muted-foreground mt-2 opacity-60 font-mono">
              Code: {errorCode}
            </p>
          )}
        </div>

        {/* Pipeline Progress */}
        <div className="max-w-4xl mx-auto md:mx-0 mb-12">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 w-full h-0.5 bg-border -translate-y-1/2 z-0"></div>
            {[
              { id: 'identity', label: 'Identity', valid: true },
              { id: 'qr', label: 'QR', valid: true },
              { id: 'session', label: 'Session', valid: true },
              { id: 'location', label: 'Location', valid: !isGeofence }
            ].map((step, i) => (
              <div key={step.id} className="relative z-10 flex flex-col items-center gap-2 bg-[#FFFDFB] dark:bg-background px-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2",
                  step.valid ? "bg-[#18B87A]/10 border-[#18B87A] text-[#18B87A]" : "bg-[#C05A67]/10 border-[#C05A67] text-[#C05A67]"
                )}>
                  {step.valid ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                </div>
                <span className="text-xs font-medium">{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Split Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left Column - Main Status */}
          <div className="md:col-span-7 space-y-6">
            
            {/* Status Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white/70 dark:bg-card/50 backdrop-blur-[24px] border border-black/5 dark:border-white/10 rounded-[32px] p-8 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.04)]"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-8">
                <div className="w-16 h-16 rounded-2xl bg-[#C05A67]/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-8 h-8 text-[#C05A67]" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C05A67]/10 text-[#C05A67] text-sm font-medium mb-3">
                    <ShieldAlert className="w-4 h-4" />
                    Campus Verification Failed
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">Security Verification</h2>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border/50">
                  <span className="text-muted-foreground">Identity</span>
                  <span className="flex items-center gap-2 font-medium text-[#18B87A]">
                    <CheckCircle2 className="w-4 h-4" /> Verified
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border/50">
                  <span className="text-muted-foreground">QR Code</span>
                  <span className="flex items-center gap-2 font-medium text-[#18B87A]">
                    <CheckCircle2 className="w-4 h-4" /> Verified
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border/50">
                  <span className="text-muted-foreground">Attendance Session</span>
                  <span className="flex items-center gap-2 font-medium text-[#18B87A]">
                    <CheckCircle2 className="w-4 h-4" /> Active
                  </span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-muted-foreground">Campus Location</span>
                  <span className="flex items-center gap-2 font-medium text-[#C05A67]">
                    <XCircle className="w-4 h-4" /> Outside Allowed Radius
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Actions */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button 
                onClick={retryOrResume}
                className="h-14 px-8 rounded-2xl text-base font-medium bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-white shadow-lg shadow-primary/25 transition-all active:scale-[0.98] w-full sm:w-auto"
              >
                <RefreshCw className="w-5 h-5 mr-2" /> Try Again
              </Button>
              <Button 
                variant="outline"
                onClick={goBack}
                className="h-14 px-8 rounded-2xl text-base font-medium bg-white/50 dark:bg-black/50 backdrop-blur-md border-border hover:bg-black/5 transition-all active:scale-[0.98] w-full sm:w-auto"
              >
                <ArrowLeft className="w-5 h-5 mr-2" /> Go Back
              </Button>
            </motion.div>
          </div>

          {/* Right Column - Metrics & Tips */}
          <div className="md:col-span-5 space-y-4">
            
            {/* Distance Card */}
            {distance !== undefined && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
                <Card className="bg-white/70 dark:bg-card/50 backdrop-blur-xl border-border/50 shadow-sm overflow-hidden">
                  <CardContent className="p-6 flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-muted-foreground mb-4">
                      <Navigation2 className="w-4 h-4" />
                      <span className="text-sm font-medium uppercase tracking-wider">Current Distance</span>
                    </div>
                    <div className="text-4xl font-bold tracking-tight text-foreground mb-2">
                      {formatDistance(distance)}
                    </div>
                    <div className="inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#C05A67]/10 text-[#C05A67] text-xs font-semibold uppercase tracking-wide">
                      Outside Campus
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Campus Mini Card */}
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
              <Card className="bg-white/70 dark:bg-card/50 backdrop-blur-xl border-border/50 shadow-sm overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">K.R. Mangalam University</h3>
                      <p className="text-sm text-muted-foreground leading-snug">Sohna Road<br/>Gurugram, Haryana</p>
                      
                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Radius</p>
                          <p className="text-sm font-medium">{CampusRadius} m</p>
                        </div>
                        {accuracy !== undefined && (
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">GPS Accuracy</p>
                            <p className="text-sm font-medium">±{Math.round(accuracy)}m</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Helpful Tips */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="pt-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 px-1">How to Fix</h3>
              <div className="space-y-3">
                {[
                  { icon: Navigation, text: `Move within ${CampusRadius}m of campus` },
                  { icon: Smartphone, text: "Enable High Accuracy / Precise Location" },
                  { icon: Signal, text: "Stay outdoors for better GPS signal" }
                ].map((tip, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-white/50 dark:bg-card/30 backdrop-blur-md border border-black/5 dark:border-white/5">
                    <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center shrink-0">
                      <tip.icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{tip.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>

          </div>
        </div>
      </main>
    </div>
  );
}

// ── GuestDrawerTrigger ────────────────────────────────────────────────────────
// Self-contained inline component. Uses a custom slide-up panel.

const RELATIONSHIP_OPTIONS = [
  { value: "PARENT",   label: "Parent",   emoji: "👨‍👩‍👧" },
  { value: "SIBLING",  label: "Sibling",  emoji: "👫" },
  { value: "GUARDIAN", label: "Guardian", emoji: "🤝" },
  { value: "RELATIVE", label: "Relative", emoji: "👪" },
  { value: "FRIEND",   label: "Friend",   emoji: "😊" },
  { value: "OTHER",    label: "Other",    emoji: "✨" },
] as const;

function GuestDrawerTrigger({
  result,
  profile,
}: {
  result: MarkResult | null;
  profile: any;
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
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");
      const token = await user.getIdToken();
      const payload = {
        event_id:             result?.event_id || "orientation-2026",
        student_id:           profile?.enrollment_no || "",
        application_number:   profile?.application_number || "",
        orientation_id:       null,
        attendance_record_id: result?.sessionId
          ? `${result.sessionId}_${(profile?.enrollment_no || "").toUpperCase()}`
          : null,
        headcount:            effectiveCount,
        relationships,
        device_timestamp:     new Date().toISOString(),
        department_id:        profile?.department_id || profile?.department || null,
        programme:            profile?.programme || null,
        school:               profile?.school || null,
      };
      const res = await fetch("/api/event-guest-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-600 font-semibold mx-auto">
        <CheckCircle2 className="w-4 h-4" />
        {effectiveCount === 0 ? "Came alone — recorded ✓" : `${effectiveCount} guest(s) recorded ✓`}
      </div>
    );
  }

  return (
    <>
      {/* Drawer trigger card */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        onClick={() => setOpen(true)}
        className="w-full max-w-xs mx-auto glass-premium-v2 border border-white/40 rounded-2xl p-4 flex items-center justify-between gap-3 hover:shadow-lg transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-primary">Add Guest Details</p>
            <p className="text-xs text-tertiary">Did anyone accompany you today?</p>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-primary/40 group-hover:text-primary transition-colors" />
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
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="drawer"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl shadow-2xl p-6 max-h-[88vh] overflow-y-auto"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              <div className="w-10 h-1 rounded-full bg-primary/20 mx-auto mb-5" />
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-primary">Guest Headcount</h3>
                  <p className="text-sm text-tertiary mt-0.5">How many guests accompanied you today?</p>
                </div>

                {/* Stepper 0–8 then 8+ */}
                <div className="grid grid-cols-5 gap-2">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                    <button
                      key={n}
                      onClick={() => { setHeadcount(n); setUseCustom(false); }}
                      className={`aspect-square rounded-xl text-lg font-bold transition-all ${
                        !useCustom && headcount === n
                          ? "bg-primary text-white shadow-lg scale-105"
                          : "glass-premium-v2 border border-white/30 text-primary hover:bg-primary/10"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => setUseCustom(true)}
                    className={`aspect-square rounded-xl text-sm font-bold transition-all ${
                      useCustom
                        ? "bg-primary text-white shadow-lg scale-105"
                        : "glass-premium-v2 border border-white/30 text-primary hover:bg-primary/10"
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
                      <label className="text-xs font-bold text-primary/60 uppercase tracking-wider block mb-2">
                        Exact number of guests
                      </label>
                      <input
                        type="number"
                        min={8}
                        max={99}
                        value={customCount}
                        onChange={e => setCustomCount(e.target.value)}
                        placeholder="Enter number (8–99)"
                        className="w-full px-4 py-3 rounded-xl border border-primary/20 bg-white/60 text-primary font-bold text-center text-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                      <p className="text-xs font-bold text-primary/60 uppercase tracking-wider mb-3">
                        Who came with you? (optional)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {RELATIONSHIP_OPTIONS.map(r => (
                          <button
                            key={r.value}
                            onClick={() => toggleRel(r.value)}
                            className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all ${
                              relationships.includes(r.value)
                                ? "bg-primary text-white border-primary shadow"
                                : "glass-premium-v2 border-white/30 text-secondary hover:border-primary/30"
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
                <div className="flex flex-col gap-3 pt-2">
                  <Button
                    variant="liquidGlassMaroon"
                    className="w-full"
                    disabled={submitting || (useCustom && (!customCount || parseInt(customCount, 10) < 8))}
                    onClick={handleSubmit}
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                    ) : effectiveCount === 0 ? (
                      "I came alone"
                    ) : (
                      `Confirm ${effectiveCount} Guest${effectiveCount !== 1 ? "s" : ""}`
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setOpen(false); setSkipped(true); }}
                    className="text-tertiary text-xs"
                  >
                    Skip for now
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
