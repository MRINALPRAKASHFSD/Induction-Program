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
  Zap, ZapOff, ZoomIn, SwitchCamera, Sun, Focus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { localDb, type LocalStudent } from "@/lib/local-db";
import { auth, db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { verifyInsideCampus, isInsideCampus, CAMPUS_CENTER, CAMPUS_RADIUS_METERS, type GeolocationResult } from "@/lib/geofence";
import { toast } from "sonner";

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
              <Button variant="liquidGlassMaroon" onClick={retryOrResume}>
                <Camera className="w-4 h-4 mr-1.5" /> Scan Another
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
            <Button variant="liquidGlassMaroon" onClick={retryOrResume}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Try Again
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
    )}
    </>
  );
}
