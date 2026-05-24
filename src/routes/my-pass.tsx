import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import {
  QrCode, CheckCircle2, Circle, User, BookOpen, Building2,
  ArrowLeft, RefreshCw, ChevronRight, Scan,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localDb, type LocalStudent, type LocalAttendance } from "@/lib/local-db";

export const Route = createFileRoute("/my-pass")({
  head: () => ({
    meta: [
      { title: "My Boarding Pass · KRMU Induction" },
      { name: "description", content: "View your digital induction boarding pass and attendance record." },
    ],
  }),
  component: MyPassPage,
});

type PassState =
  | { phase: "input" }
  | { phase: "loading" }
  | { phase: "pass"; student: LocalStudent; attended: LocalAttendance[]; qrDataUrl: string }
  | { phase: "error"; message: string };

const LS_KEY = "krmu_induction_enrollment_no";

function MyPassPage() {
  const [state, setState] = useState<PassState>({ phase: "input" });
  const [enrollInput, setEnrollInput] = useState("");

  useEffect(() => {
    // Auto-load if profile exists
    const profile = localDb.getStudentProfile();
    if (profile) {
      setEnrollInput(profile.enrollment_no);
      loadPass(profile.enrollment_no);
      return;
    }
    // Fallback: saved enrollment key
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      setEnrollInput(saved);
      loadPass(saved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPass = async (enroll: string) => {
    const key = enroll.trim().toUpperCase();
    setState({ phase: "loading" });

    // Look up the student from all registered students
    let student = localDb.getStudent(key);
    
    // Fallback: if somehow missing from students array but exists in active profile
    if (!student) {
      const profile = localDb.getStudentProfile();
      if (profile && profile.enrollment_no === key) {
        student = profile;
        localDb.saveStudentProfile(profile); // Ensure it's re-added to students
      }
    }

    if (!student) {
      setState({
        phase: "error",
        message: `No student found for "${key}". Please register first.`,
      });
      return;
    }

    // Get all attendance records for this student across all sessions
    const sessions = localDb.getSessions();
    const allAttended: LocalAttendance[] = sessions.flatMap((s) =>
      localDb.getAttendanceForSession(s.id).filter((a) => a.enrollment_no === key)
    );

    const qrDataUrl = await QRCode.toDataURL(student.enrollment_no, {
      width: 300,
      margin: 2,
      color: { dark: "#2d0d12", light: "#fdfaf6" },
      errorCorrectionLevel: "H",
    });

    localStorage.setItem(LS_KEY, student.enrollment_no);
    setState({ phase: "pass", student, attended: allAttended, qrDataUrl });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (enrollInput.trim().length < 3) return;
    loadPass(enrollInput);
  };

  const reset = () => {
    localStorage.removeItem(LS_KEY);
    setEnrollInput("");
    setState({ phase: "input" });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <main className="relative container mx-auto max-w-lg px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center gap-3"
        >
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Boarding Pass</h1>
            <p className="text-sm text-muted-foreground">KRMU Student Induction</p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {state.phase === "input" && (
            <motion.div key="input" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
              <div className="rounded-3xl border bg-card shadow-elegant overflow-hidden">
                <div className="h-2 bg-hero" />
                <div className="p-8">
                  <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-hero text-primary-foreground shadow-elegant">
                    <QrCode className="h-8 w-8" />
                  </div>
                  <h2 className="text-center text-xl font-bold">Enter your enrollment number</h2>
                  <p className="mt-1 text-center text-sm text-muted-foreground">
                    We'll generate your personalised boarding pass instantly.
                  </p>
                  <form onSubmit={onSubmit} className="mt-6 grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="enroll-input">Enrollment Number</Label>
                      <Input
                        id="enroll-input"
                        autoFocus
                        required
                        value={enrollInput}
                        onChange={(e) => setEnrollInput(e.target.value.toUpperCase())}
                        placeholder="e.g. KRMU24CS0001"
                        className="h-12 text-center text-base font-mono tracking-wider uppercase"
                      />
                    </div>
                    <Button type="submit" size="lg" disabled={enrollInput.trim().length < 3} className="h-12">
                      View my pass <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Link to="/register" className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors">
                      Not registered yet? Register here
                    </Link>
                  </form>
                </div>
              </div>
            </motion.div>
          )}

          {state.phase === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-24">
              <div className="relative h-14 w-14">
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
                <QrCode className="absolute inset-0 m-auto h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground animate-pulse">Fetching your pass…</p>
            </motion.div>
          )}

          {state.phase === "error" && (
            <motion.div key="error" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="font-semibold text-destructive">Couldn't load your pass</p>
              <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" onClick={reset}>Try different number</Button>
                <Button asChild size="sm"><Link to="/register">Register now <ChevronRight className="ml-1 h-3 w-3" /></Link></Button>
              </div>
            </motion.div>
          )}

          {state.phase === "pass" && (
            <motion.div key="pass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <BoardingPassCard
                student={state.student}
                attended={state.attended}
                qrDataUrl={state.qrDataUrl}
                onReset={reset}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function BoardingPassCard({
  student,
  attended,
  qrDataUrl,
  onReset,
}: {
  student: LocalStudent;
  attended: LocalAttendance[];
  qrDataUrl: string;
  onReset: () => void;
}) {
  const sessions = localDb.getSessions();
  const totalSessions = sessions.length || 5;

  return (
    <div className="space-y-4">
      {/* Boarding pass ticket */}
      <div className="relative rounded-3xl border bg-card overflow-hidden shadow-elegant">
        <div className="bg-hero px-6 py-5 text-primary-foreground">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium opacity-70 uppercase tracking-widest">KRMU · Induction</p>
              <h2 className="mt-1 text-2xl font-bold leading-tight">{student.full_name}</h2>
            </div>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
              BOARDING PASS
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs opacity-80">
            <span className="flex items-center gap-1.5"><User className="h-3 w-3" />{student.enrollment_no}</span>
            <span className="flex items-center gap-1.5"><BookOpen className="h-3 w-3" />{student.semester}</span>
            <span className="flex items-center gap-1.5"><Building2 className="h-3 w-3" />{student.branch}</span>
          </div>
        </div>

        {/* Tear line */}
        <div className="relative flex items-center overflow-hidden">
          <div className="h-px flex-1 border-t border-dashed border-border" />
          <div className="absolute -left-4 h-8 w-8 rounded-full bg-background border border-border" />
          <div className="absolute -right-4 h-8 w-8 rounded-full bg-background border border-border" />
        </div>

        {/* QR section */}
        <div className="flex flex-col items-center gap-3 px-6 py-6">
          <div className="rounded-2xl bg-[oklch(0.99_0.005_80)] p-3 shadow-inner border">
            <img src={qrDataUrl} alt={`QR for ${student.enrollment_no}`} className="h-44 w-44 object-contain" draggable={false} />
          </div>
          <p className="font-mono text-sm font-semibold tracking-widest text-foreground">{student.enrollment_no}</p>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Present this QR code to the coordinator at each induction event.
          </p>
        </div>
      </div>

      {/* Attendance checklist */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Attendance Record</h3>
            <p className="text-xs text-muted-foreground">{attended.length} session{attended.length !== 1 ? "s" : ""} attended</p>
          </div>
          <div className="relative h-2 w-24 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: totalSessions > 0 ? `${(attended.length / totalSessions) * 100}%` : "0%" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="absolute inset-y-0 left-0 rounded-full bg-hero"
            />
          </div>
        </div>

        <div className="grid gap-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No sessions created yet by admin.</p>
          ) : (
            sessions.map((s, i) => {
              const wasPresent = attended.some((a) => a.session_id === s.id);
              const record = attended.find((a) => a.session_id === s.id);
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
                    wasPresent ? "bg-success/10 border border-success/25" : "bg-muted/40 border border-transparent"
                  }`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    wasPresent ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${wasPresent ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.title}
                    </p>
                    {record && (
                      <p className="text-xs text-muted-foreground">{new Date(record.scanned_at).toLocaleTimeString()}</p>
                    )}
                  </div>
                  {wasPresent
                    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                    : <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                  }
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onReset}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Different student
        </Button>
        <Button asChild size="sm" className="flex-1">
          <Link to="/attendance"><Scan className="mr-1.5 h-3.5 w-3.5" />Mark Attendance</Link>
        </Button>
      </div>
    </div>
  );
}
