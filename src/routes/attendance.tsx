import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import QRCode from "qrcode";
import { 
  QrCode, Scan, CheckCircle2, User, BookOpen, 
  AlertTriangle, XCircle, ArrowLeft, AlertCircle, 
  Building2, Calendar, Clock, RefreshCw, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SiteHeader } from "@/components/site-header";
import { localDb, type LocalStudent } from "@/lib/local-db";
import { getDepartments, getSchoolDays, getSchoolSessions } from "@/lib/students.functions";
import { recordScan } from "@/lib/attendance.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    meta: [
      { title: "Lodge Attendance · KRMU Induction" },
      { name: "description", content: "Lodge your session attendance instantly by scanning the admin QR." },
    ],
  }),
  component: AttendancePage,
});

type Phase = "dashboard" | "scanner" | "success" | "duplicate" | "error";

interface Dept {
  id: string;
  name: string;
  code: string;
}

interface Session {
  id: string;
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  qr_token?: string; // returned dynamically
}

const LOCAL_DEPARTMENTS = [
  { id: "soet", code: "SOET", name: "School of Engineering & Technology" },
  { id: "soms", code: "SOMS", name: "School of Management Studies" },
  { id: "sols", code: "SOLS", name: "School of Legal Studies" },
  { id: "soa", code: "SOA", name: "School of Architecture" },
  { id: "soah", code: "SOAH", name: "School of Allied Health Sciences" },
  { id: "soe", code: "SOE", name: "School of Education" },
  { id: "somc", code: "SOMC", name: "School of Media & Communication" },
  { id: "sosc", code: "SOSC", name: "School of Science" },
  { id: "sohs", code: "SOHS", name: "School of Hospitality Studies" },
  { id: "sofa", code: "SOFA", name: "School of Fine Arts & Design" },
];

function AttendancePage() {
  const [phase, setPhase] = useState<Phase>("dashboard");
  const [profile, setProfile] = useState<LocalStudent | null>(null);
  
  // List selections
  const [schools, setSchools] = useState<Dept[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [day, setDay] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");

  const [loadingDays, setLoadingDays] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Dynamic QR Code url
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  // Feedback state
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [isWrongSchool, setIsWrongSchool] = useState(false);

  // Fully evaluate session selection early to prevent TDZ ReferenceError in hooks
  const currentSelectedSession = sessions.find(s => s.id === sessionId);

  useEffect(() => {
    // 1. Fetch active profile
    const p = localDb.getStudentProfile();
    if (p) {
      setProfile(p);
    }
    
    // 2. Fetch schools list
    Promise.race([
      getDepartments(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
    ])
      .then((res: any) => {
        if (res.departments && res.departments.length > 0) {
          setSchools(res.departments as Dept[]);
        } else {
          setSchools(LOCAL_DEPARTMENTS);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch departments from server, using local fallback", err);
        setSchools(LOCAL_DEPARTMENTS);
      });
  }, []);

  // Generate QR code dynamically when session is selected
  useEffect(() => {
    if (currentSelectedSession && currentSelectedSession.qr_token && profile) {
      // The QR URL points to `/scan/${qr_token}` or encodes the qr_token
      const url = `${window.location.origin}/scan/${currentSelectedSession.qr_token}?enroll=${encodeURIComponent(profile.enrollment_no)}`;
      QRCode.toDataURL(url, {
        width: 360,
        margin: 1,
        color: { dark: "#2d0d12", light: "#fdfaf6" },
        errorCorrectionLevel: "H",
      })
        .then(setQrCodeUrl)
        .catch(console.error);
    } else {
      setQrCodeUrl(null);
    }
  }, [sessionId, currentSelectedSession]);

  // When school is selected
  const handleSchoolChange = async (val: string) => {
    setSchoolId(val);
    setDay("");
    setSessionId("");
    setDays([]);
    setSessions([]);
    setQrCodeUrl(null);
    
    if (!profile) return;

    // Validation check: school mismatch
    const selectedDept = schools.find(s => s.id === val);
    if (selectedDept) {
      const match = profile.department_id 
        ? (profile.department_id === selectedDept.id || profile.department_id.toLowerCase() === selectedDept.code?.toLowerCase())
        : profile.branch.toLowerCase().includes(selectedDept.name.toLowerCase());
      
      setIsWrongSchool(!match);
      if (!match) {
        toast.error("You can't lodge attendance for other school.");
        return;
      }
    }

    setLoadingDays(true);
    try {
      const res = await getSchoolDays({ data: { department_id: val } }) as any;
      
      if (res.days && res.days.length > 0) {
        setDays(res.days);
      }
    } catch (e) {
      console.warn("Failed to fetch school days", e);
    } finally {
      setLoadingDays(false);
    }
  };

  // When day is selected
  const handleDayChange = async (val: string) => {
    setDay(val);
    setSessionId("");
    setSessions([]);
    setQrCodeUrl(null);
    setLoadingSessions(true);
    try {
      const res = await getSchoolSessions({ data: { department_id: schoolId, day_number: Number(val) } }) as any;
      
      if (res.sessions && res.sessions.length > 0) {
        setSessions(res.sessions as Session[]);
      }
    } catch (e) {
      console.warn("Failed to fetch school sessions", e);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleSessionChange = (val: string) => {
    setSessionId(val);
  };

  const startScanner = () => {
    if (isWrongSchool) {
      toast.error("Access blocked: School mismatch!");
      return;
    }
    setPhase("scanner");
  };

  const closeScanner = () => setPhase("dashboard");

  const onScanSuccess = async (decodedText: string) => {
    if (!profile || !sessionId) return;
    
    setPhase("dashboard");
    toast.loading("Lodging attendance...", { id: "lodge-toast" });

    // Clean QR Token from decoded text (admin poster URL contains token at the end)
    let qrToken = decodedText.trim();
    try {
      if (qrToken.includes("/scan/")) {
        const urlObj = new URL(qrToken);
        const parts = urlObj.pathname.split("/scan/");
        if (parts.length > 1) {
          qrToken = parts[1].split("/")[0];
        }
      }
    } catch (e) {
      if (qrToken.includes("/scan/")) {
        const parts = qrToken.split("/scan/");
        qrToken = parts[parts.length - 1].split("?")[0];
      }
    }

    try {
      // 1. Try server function to push attendance
      const res = await recordScan({ 
        data: { qr_token: qrToken, enrollment_no: profile.enrollment_no } 
      });

      if (res.ok) {
        // Also mirror it in local database to show checked list correctly
        localDb.markAttendance(sessionId, profile);

        toast.success("Attendance Lodged!", { id: "lodge-toast" });
        setFeedbackMsg(res.duplicate 
          ? `You were already checked in for ${res.event.title}` 
          : `Present marked for ${res.event.title}`
        );
        setPhase(res.duplicate ? "duplicate" : "success");
      } else {
        throw new Error(res.error || "Server rejected transaction.");
      }
    } catch (err: any) {
      console.warn("Server push failed", err);
      toast.error(err.message || "Invalid QR code or network error.", { id: "lodge-toast" });
      setFeedbackMsg(err.message || "The scanned QR token does not match this session or the session is inactive.");
      setPhase("error");
    }

    setTimeout(() => {
      setPhase("dashboard");
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <SiteHeader />
      
      {/* Decorative background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <main className="relative container mx-auto max-w-lg px-4 py-8 sm:py-10">
        <AnimatePresence mode="wait">
          {!profile && (
            <motion.div 
              key="no-profile" 
              initial={{ opacity: 0, y: 16 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -16 }}
              className="rounded-3xl border bg-card shadow-elegant overflow-hidden"
            >
              <div className="h-2 bg-hero" />
              <div className="p-8 text-center">
                <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-hero text-primary-foreground shadow-elegant">
                  <User className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold">Registration Required</h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
                  You need to set up your profile first before you can lodge attendance for induction sessions.
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
          )}

          {profile && phase === "dashboard" && (
            <motion.div 
              key="dashboard" 
              initial={{ opacity: 0, y: 16 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -16 }} 
              className="space-y-6"
            >
              {/* Header profile block */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Lodge Attendance</h1>
                  <p className="text-sm text-muted-foreground">Induction Program &middot; KRMU 2026</p>
                </div>
              </div>

              {/* Student detail card */}
              <div className="rounded-3xl border bg-card p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-hero" />
                <div className="flex flex-col gap-2">
                  <h3 className="font-bold text-lg text-foreground leading-tight">{profile.full_name}</h3>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground font-medium">
                    <div className="flex items-center gap-2"><User className="h-4 w-4 shrink-0 text-primary/60"/> {profile.enrollment_no}</div>
                    <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 shrink-0 text-primary/60"/> {profile.branch}</div>
                  </div>
                </div>
              </div>

              {/* Attendance Lodge Form */}
              <div className="rounded-3xl border bg-card p-6 shadow-elegant space-y-4">
                <h3 className="text-base font-bold flex items-center gap-2 mb-2">
                  <QrCode className="h-5 w-5 text-primary" /> Setup Session Selection
                </h3>

                {/* Dropdown 1: School */}
                <div className="grid gap-2">
                  <Label htmlFor="school-select">Select School / Department</Label>
                  <Select value={schoolId} onValueChange={handleSchoolChange}>
                    <SelectTrigger id="school-select" className="h-12 bg-muted/20">
                      <SelectValue placeholder="Choose your school" />
                    </SelectTrigger>
                    <SelectContent>
                      {schools.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Validation alert */}
                {schoolId && isWrongSchool && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex gap-3 rounded-2xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive items-start mt-2"
                  >
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Access Blocked:</span> You can't lodge attendance for other school what you have written during registration.
                    </div>
                  </motion.div>
                )}

                {/* Dropdown 2: Day */}
                <div className="grid gap-2">
                  <Label htmlFor="day-select">Select Day</Label>
                  <Select 
                    value={day} 
                    onValueChange={handleDayChange}
                    disabled={!schoolId || isWrongSchool || days.length === 0}
                  >
                    <SelectTrigger id="day-select" className="h-12 bg-muted/20 disabled:opacity-50">
                      <SelectValue placeholder={loadingDays ? "Loading days..." : days.length === 0 ? "No active sessions for this school" : "Choose day"} />
                    </SelectTrigger>
                    <SelectContent>
                      {days.map(d => (
                        <SelectItem key={d} value={String(d)}>Day {d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dropdown 3: Slot / Session */}
                <div className="grid gap-2">
                  <Label htmlFor="session-select">Select Slot / Session</Label>
                  <Select 
                    value={sessionId} 
                    onValueChange={handleSessionChange}
                    disabled={!day || isWrongSchool || sessions.length === 0}
                  >
                    <SelectTrigger id="session-select" className="h-12 bg-muted/20 disabled:opacity-50">
                      <SelectValue placeholder={loadingSessions ? "Loading sessions..." : "Choose session slot"} />
                    </SelectTrigger>
                    <SelectContent>
                      {sessions.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Info summary of slot */}
                {currentSelectedSession && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl bg-muted/40 p-4 text-xs space-y-1.5 border border-border/50 text-muted-foreground"
                  >
                    <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-primary/60 shrink-0" /><span className="font-semibold text-foreground">{currentSelectedSession.venue}</span></div>
                    <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary/60 shrink-0" />{new Date(currentSelectedSession.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &rarr; {new Date(currentSelectedSession.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </motion.div>
                )}

                {/* Display QR Code inside page if selected */}
                {qrCodeUrl && !isWrongSchool && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-3 p-5 bg-card border rounded-2xl shadow-inner mt-4"
                  >
                    <div className="rounded-2xl bg-[oklch(0.99_0.005_80)] p-3 border shadow-sm">
                      <img src={qrCodeUrl} alt="Session QR" className="h-44 w-44 object-contain" draggable={false} />
                    </div>
                    <p className="text-xs text-muted-foreground text-center font-medium max-w-xs">
                      Session QR Code. Show this to the class coordinator or scan it using the scanner button below!
                    </p>
                  </motion.div>
                )}

                {/* Scan Trigger Button / Extra Scanner Option */}
                <Button 
                  variant="liquidGlassMaroon"
                  onClick={startScanner} 
                  disabled={!sessionId || isWrongSchool}
                  size="lg" 
                  className="w-full h-14 text-base rounded-2xl relative overflow-hidden group mt-4 font-semibold"
                >
                  <span className="relative flex items-center justify-center gap-2">
                    <Scan className="h-5 w-5 animate-pulse" /> Extra Scan Option &rarr; Mark Attendance
                  </span>
                </Button>
              </div>
            </motion.div>
          )}

          {phase === "scanner" && (
            <motion.div 
              key="scanner" 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="fixed inset-0 z-50 bg-black flex flex-col"
            >
              <div className="flex items-center justify-between p-4 bg-black/50 text-white backdrop-blur absolute top-0 left-0 right-0 z-10">
                <button onClick={closeScanner} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition">
                  <ArrowLeft className="h-6 w-6" />
                </button>
                <div className="font-semibold tracking-wide uppercase text-sm">Scan Admin Session QR</div>
                <div className="w-10" />
              </div>
              
              <div className="flex-1 relative">
                <QRScanner onScan={onScanSuccess} />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                   <div className="w-64 h-64 border-2 border-white/30 rounded-3xl relative">
                     {/* Corners */}
                     <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                     <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                     <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                     <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
                     {/* Scanning laser */}
                     <motion.div 
                        className="w-full h-0.5 bg-primary/80 shadow-[0_0_8px_2px_rgba(255,255,255,0.3)] absolute top-0"
                        animate={{ top: ['0%', '100%', '0%'] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                     />
                   </div>
                </div>
              </div>
            </motion.div>
          )}

          {(phase === "success" || phase === "duplicate" || phase === "error") && (
             <motion.div 
               key="feedback" 
               initial={{ opacity: 0, scale: 0.9 }} 
               animate={{ opacity: 1, scale: 1 }} 
               exit={{ opacity: 0 }}
               className="flex flex-col items-center justify-center py-20 text-center space-y-4 rounded-3xl border bg-card p-8 shadow-elegant"
             >
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, delay: 0.1 }}>
                  {phase === "success" && <CheckCircle2 className="h-20 w-20 text-success drop-shadow-lg" />}
                  {phase === "duplicate" && <AlertTriangle className="h-20 w-20 text-yellow-500 drop-shadow-lg" />}
                  {phase === "error" && <XCircle className="h-20 w-20 text-destructive drop-shadow-lg" />}
                </motion.div>
                <h2 className="text-2xl font-bold">
                  {phase === "success" && "Attendance Marked!"}
                  {phase === "duplicate" && "Already Marked"}
                  {phase === "error" && "Check-in Failed"}
                </h2>
                <p className="text-muted-foreground text-sm max-w-xs">{feedbackMsg}</p>
                
                <div className="pt-4 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-4 py-1.5 rounded-full">
                  <Check className="h-3.5 w-3.5" /> Pushed Successfully to Server
                </div>
             </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ─── Scanner Component ───
function QRScanner({ onScan }: { onScan: (text: string) => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const scannedRef = useRef(false);
  const initLockRef = useRef(false);
  const scanRegionId = "attendance-qr-reader-lodge";

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Prevent double-init from React StrictMode / fast remounts
      if (initLockRef.current) return;
      initLockRef.current = true;

      try {
        const scanner = new Html5Qrcode(scanRegionId, { 
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true
        });

        const scanConfig = {
          fps: 10,
          disableFlip: true,
        };

        const successCb = (decodedText: string) => {
          if (!mounted || scannedRef.current) return;
          scannedRef.current = true;
          onScanRef.current(decodedText);
        };

        const errorCb = () => {};

        // Try rear camera first (phones), fall back to front camera (laptops/desktops)
        try {
          await scanner.start({ facingMode: "environment" }, scanConfig, successCb, errorCb);
        } catch {
          console.warn("Rear camera unavailable, falling back to front camera");
          await scanner.start({ facingMode: "user" }, { ...scanConfig, disableFlip: false }, successCb, errorCb);
        }

        if (mounted) {
          scannerRef.current = scanner;
        } else {
          await scanner.stop().catch(() => {});
          scanner.clear();
        }
      } catch (err) {
        console.error("Camera start failed:", err);
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
