import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { QrCode, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuccessBurst } from "@/components/success-burst";

import { auth } from "@/lib/firebase/config";

export const Route = createFileRoute("/scan/$token")({
  head: () => ({
    meta: [
      { title: "Mark Attendance · KRMU" },
      { name: "description", content: "Scan QR to mark attendance for KRMU induction events." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ScanPage,
});

type ResultType = 
  | { ok: true; duplicate: boolean; student: { name: string }; event: { title: string; venue: string; day: number } }
  | { ok: false; error: string };

function ScanPage() {
  const { token } = Route.useParams();
  const [enroll, setEnroll] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("enroll") || "";
    }
    return "";
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultType | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate slight network delay for UX
    await new Promise(r => setTimeout(r, 400));
    
    try {
      const enrollClean = enroll.trim().toUpperCase();

      // Enforce login for attendance (ChatGPT security recommendation)
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setResult({ ok: false, error: "You must be logged in to mark attendance. Please register or login first." });
        setLoading(false);
        return;
      }
      
      const idToken = await currentUser.getIdToken();
      
      const response = await fetch('/api/attendance-mark', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ qr_token: token, enrollment_no: enrollClean }),
      });

      const markRes = await response.json() as {
        ok: boolean;
        message?: string;
        duplicate?: boolean;
        studentName?: string;
        eventTitle?: string;
        day?: number;
        error?: string;
      };

      if (markRes.ok) {
        setResult({
          ok: true,
          duplicate: !!markRes.duplicate,
          student: { name: markRes.studentName || enrollClean },
          event: { title: markRes.eventTitle || "Event", venue: "Campus Venue", day: markRes.day || 1 },
        });
      } else {
        setResult({ ok: false, error: markRes.error || markRes.message || "Attendance failed" });
      }
    } catch (err: any) {
      setResult({ ok: false, error: err.message || "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  if (result?.ok) {
    return (
      <div className="relative min-h-screen bg-[#0a0a0a] text-white overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-[#FFB75E]/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-[#FF5E5E]/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="relative container mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 z-10">
          <SuccessBurst
            title={result.duplicate ? "Already checked in" : "Attendance marked!"}
            subtitle={`${result.student.name} · ${result.event.title}`}
            className="border-white/10 bg-black/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] text-white"
          />
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm backdrop-blur-md shadow-lg"
          >
            <div className="flex items-center gap-3 text-white/90">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFB75E]/20 text-[#FFB75E]">
                <Calendar className="h-4 w-4" /> 
              </div>
              <span className="font-medium tracking-wide">Day {result.event.day} of induction</span>
            </div>
            <div className="flex items-center gap-3 text-white/90">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFB75E]/20 text-[#FFB75E]">
                <MapPin className="h-4 w-4" /> 
              </div>
              <span className="font-medium tracking-wide">{result.event.venue}</span>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <Button asChild size="lg" className="mt-8 w-full rounded-full bg-gradient-to-r from-[#FFB75E] to-[#E69B40] hover:from-[#FFC882] hover:to-[#FFB75E] text-black font-bold border-none h-14 shadow-[0_0_20px_rgba(255,183,94,0.3)] transition-all hover:shadow-[0_0_30px_rgba(255,183,94,0.5)] btn-hover-scale">
              <Link to="/">Done</Link>
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-md px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-hero text-primary-foreground shadow-elegant">
            <QrCode className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Mark your attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your enrollment number to check in.</p>
        </motion.div>

        <form onSubmit={onSubmit} className="mt-8 grid gap-4 rounded-2xl border bg-card-soft p-6 shadow-sm">
          <div className="grid gap-2">
            <Label>Enrollment number</Label>
            <Input
              autoFocus required value={enroll}
              onChange={(e) => setEnroll(e.target.value.toUpperCase())}
              placeholder="KRMU24CS0001"
              className="h-12 text-base"
            />
          </div>
          <Button type="submit" variant="liquidGlassDark" size="lg" disabled={loading || enroll.length < 3} className="h-12 text-base rounded-full font-semibold">
            {loading ? "Checking in…" : "Check in"}
          </Button>
          {result && !result.ok && (
            <p className="text-center text-sm text-destructive">{result.error}</p>
          )}
          <Link to="/register" className="text-center text-sm text-muted-foreground underline">
            Not registered yet? Register first
          </Link>
        </form>
      </main>
    </div>
  );
}
