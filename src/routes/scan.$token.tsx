import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { QrCode, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuccessBurst } from "@/components/success-burst";
import { recordScan } from "@/lib/attendance.functions";

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
  const [enroll, setEnroll] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultType | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate slight network delay
    await new Promise(r => setTimeout(r, 400));
    
    try {
      const enrollClean = enroll.trim().toUpperCase();
      
      const markRes = (await recordScan({ data: { qr_token: token, enrollment_no: enrollClean } })) as {
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
      <div className="min-h-screen bg-hero text-primary-foreground">
        <div className="container mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
          <SuccessBurst
            title={result.duplicate ? "Already checked in" : "Attendance marked!"}
            subtitle={`${result.student.name} · ${result.event.title}`}
          />
          <div className="mt-6 grid gap-2 rounded-xl bg-white/10 p-4 text-sm backdrop-blur">
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Day {result.event.day} of induction</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {result.event.venue}</div>
          </div>
          <Button asChild variant="liquidGlassWhite" size="lg" className="mt-6 rounded-full font-semibold text-primary">
            <Link to="/">Done</Link>
          </Button>
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
