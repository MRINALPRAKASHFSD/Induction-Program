import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Html5Qrcode } from "html5-qrcode";
import { QrCode, Scan, CheckCircle2, User, BookOpen, AlertTriangle, XCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/site-header";
import { localDb, type LocalStudent, type LocalSession } from "@/lib/local-db";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    meta: [
      { title: "Student Attendance · KRMU Induction" },
      { name: "description", content: "Self-lodge your attendance instantly." },
    ],
  }),
  component: AttendancePage,
});

type Phase = "setup" | "dashboard" | "scanner" | "success" | "duplicate" | "error";

function AttendancePage() {
  const [phase, setPhase] = useState<Phase>("dashboard");
  const [profile, setProfile] = useState<LocalStudent | null>(null);
  
  // Setup form state
  const [fullName, setFullName] = useState("");
  const [enrollment, setEnrollment] = useState("");
  const [branch, setBranch] = useState("");
  const [semester, setSemester] = useState("");

  // Feedback state
  const [feedbackMsg, setFeedbackMsg] = useState("");

  useEffect(() => {
    const p = localDb.getStudentProfile();
    if (p) {
      setProfile(p);
      setPhase("dashboard");
    } else {
      setPhase("setup");
    }
  }, []);

  const handleSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !enrollment || !branch || !semester) return;

    const newProfile: LocalStudent = {
      id: "std_" + Date.now(),
      full_name: fullName,
      enrollment_no: enrollment.toUpperCase(),
      branch,
      semester,
      created_at: new Date().toISOString(),
    };

    localDb.saveStudentProfile(newProfile);
    setProfile(newProfile);
    setPhase("dashboard");
  };

  const startScanner = () => setPhase("scanner");
  const closeScanner = () => setPhase("dashboard");

  const onScanSuccess = (decodedText: string) => {
    if (!profile) return;
    
    // The admin QR contains the Session ID.
    const sessionId = decodedText.trim();
    
    // Validate that the session is currently active
    const activeSession = localDb.getActiveSession();
    if (!activeSession || activeSession.id !== sessionId) {
      if (sessionId.toUpperCase().startsWith("KRMU")) {
        setFeedbackMsg("You scanned a Boarding Pass. Please scan an Event QR code instead.");
      } else {
        setFeedbackMsg("Invalid or inactive session QR code.");
      }
      setPhase("error");
      setTimeout(() => setPhase("dashboard"), 4000);
      return;
    }

    const res = localDb.markAttendance(sessionId, profile);
    if (res.ok) {
      setFeedbackMsg(`Marked present for ${activeSession.title}`);
      setPhase("success");
    } else {
      setFeedbackMsg(res.message);
      setPhase("duplicate");
    }

    setTimeout(() => {
      setPhase("dashboard");
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      
      {/* Decorative background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <main className="relative container mx-auto max-w-md px-4 py-10">
        <AnimatePresence mode="wait">
          {phase === "setup" && (
            <motion.div key="setup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
              <div className="rounded-3xl border bg-card shadow-elegant overflow-hidden">
                <div className="h-2 bg-hero" />
                <div className="p-8">
                  <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-hero text-primary-foreground shadow-elegant">
                    <User className="h-8 w-8" />
                  </div>
                  <h2 className="text-center text-xl font-bold">One-Time Registration</h2>
                  <p className="mt-1 text-center text-sm text-muted-foreground">Set up your profile to mark attendance instantly.</p>

                  <form onSubmit={handleSetup} className="mt-6 grid gap-4">
                    <div className="grid gap-2">
                      <Label>Full Name</Label>
                      <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Aditi Sharma" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Enrollment Number</Label>
                      <Input required value={enrollment} onChange={(e) => setEnrollment(e.target.value)} placeholder="e.g. KRMU24CS0001" className="uppercase" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Branch / Department</Label>
                      <Input required value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. B.Tech CSE" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Semester</Label>
                      <Input required value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="e.g. Semester 1" />
                    </div>
                    <Button type="submit" size="lg" className="mt-2">Complete Profile</Button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}

          {phase === "dashboard" && profile && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Welcome, {profile.full_name.split(' ')[0]}</h1>
                  <p className="text-sm text-muted-foreground">Ready for induction.</p>
                </div>
              </div>

              <div className="rounded-3xl border bg-card p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-hero" />
                <div className="flex flex-col gap-1 text-sm font-medium">
                  <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground"/> {profile.enrollment_no}</div>
                  <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-muted-foreground"/> {profile.branch} — {profile.semester}</div>
                </div>
              </div>

              <Button onClick={startScanner} size="lg" className="w-full h-16 text-lg rounded-2xl shadow-glow bg-primary hover:bg-primary/90 text-primary-foreground border border-white/10 relative overflow-hidden group">
                <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <span className="relative flex items-center justify-center gap-2">
                  <Scan className="h-6 w-6" /> Scan Session QR
                </span>
              </Button>
            </motion.div>
          )}

          {phase === "scanner" && (
            <motion.div key="scanner" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 z-50 bg-black flex flex-col">
              <div className="flex items-center justify-between p-4 bg-black/50 text-white backdrop-blur absolute top-0 left-0 right-0 z-10">
                <button onClick={closeScanner} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition">
                  <ArrowLeft className="h-6 w-6" />
                </button>
                <div className="font-semibold tracking-wide">SCAN QR</div>
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
             <motion.div key="feedback" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, delay: 0.1 }}>
                  {phase === "success" && <CheckCircle2 className="h-20 w-20 text-success drop-shadow-lg" />}
                  {phase === "duplicate" && <AlertTriangle className="h-20 w-20 text-yellow-500 drop-shadow-lg" />}
                  {phase === "error" && <XCircle className="h-20 w-20 text-destructive drop-shadow-lg" />}
                </motion.div>
                <h2 className="text-2xl font-bold">
                  {phase === "success" && "Attendance Marked!"}
                  {phase === "duplicate" && "Already Marked"}
                  {phase === "error" && "Error"}
                </h2>
                <p className="text-muted-foreground">{feedbackMsg}</p>
             </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ─── Separate Scanner Component to handle lifecycle safely ───
function QRScanner({ onScan }: { onScan: (text: string) => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const scannedRef = useRef(false);
  const scanRegionId = "attendance-qr-reader";

  // Keep callback ref fresh without restarting the scanner
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const scanner = new Html5Qrcode(scanRegionId, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            // qrbox as a function lets html5-qrcode calculate the right size
            // based on the actual rendered video dimensions
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const min = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.floor(min * 0.75);
              return { width: size, height: size };
            },
          },
          (decodedText) => {
            if (!mounted || scannedRef.current) return;
            scannedRef.current = true; // prevent double-fire
            onScanRef.current(decodedText);
          },
          () => {} // ignore per-frame errors (camera focusing, etc.)
        );
      } catch (err) {
        console.error("Camera start failed:", err);
      }
    };

    init();

    return () => {
      mounted = false;
      const scanner = scannerRef.current;
      if (scanner) {
        (scanner.isScanning
          ? scanner.stop()
          : Promise.resolve()
        ).finally(() => scanner.clear()).catch(() => {});
      }
    };
  }, []); // ← empty dep array: only start once

  return (
    <div
      id={scanRegionId}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
