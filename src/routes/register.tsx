import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SuccessBurst } from "@/components/success-burst";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { localDb } from "@/lib/local-db";
import { registerStudent } from "@/lib/students.functions";

import { auth } from "@/lib/firebase/config";
import { signInWithCustomToken } from "firebase/auth";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register · KRMU Induction" },
      { name: "description", content: "Register for KRMU induction in 30 seconds." },
    ],
  }),
  component: RegisterPage,
});

// ─── Static KRMU data (no DB call needed) ──────────────────────────────────
const DEPARTMENTS = [
  { id: "soet", code: "SOET", name: "School of Engineering & Technology" },
  { id: "zsai", code: "ZSAI", name: "Zenith School of AI" },
  { id: "somc", code: "SOMC", name: "School of Management and Commerce" },
  { id: "sols", code: "SOLS", name: "School of Legal Studies" },
  { id: "smas", code: "SMAS", name: "School of Medical & Allied Sciences" },
  { id: "sola", code: "SOLA", name: "School of Liberal Arts" },
  { id: "sbas", code: "SBAS", name: "School of Basic & Applied Sciences" },
  { id: "soad", code: "SOAD", name: "School of Architecture & Design" },
  { id: "sprs", code: "SPRS", name: "School of Physiotherapy and Rehabilitation Sciences" },
  { id: "semc", code: "SEMC", name: "School of Emerging Media and Creator Economy" },
  { id: "soe", code: "SOE", name: "School of Education" },
  { id: "sas", code: "SAS", name: "School of Agricultural Sciences" },
  { id: "shmct", code: "SHMCT", name: "School of Hotel Management & Catering Technology" },
];

const BRANCHES_BY_DEPT: Record<string, string[]> = {
  soet: ["Computer Science Engineering", "Civil Engineering", "Mechanical Engineering", "Electronics & Communication", "Electrical Engineering", "Information Technology", "Cyber Security"],
  zsai: ["AI & Machine Learning", "Data Science"],
  somc: ["MBA", "BBA", "BBA (Hons.)", "B.Com (Hons.)", "B.Com"],
  sols: ["LLB (3-Year)", "LLB (5-Year / BA LLB)", "LLM"],
  smas: ["B.Pharm", "Medical Lab Tech", "Radiology", "Optometry"],
  sola: ["BA (Hons.) English", "BA (Hons.) Psychology", "BA (Hons.) Economics"],
  sbas: ["B.Sc Chemistry", "B.Sc Physics", "B.Sc Mathematics", "B.Sc Biotechnology", "B.Sc Microbiology"],
  soad: ["B.Arch", "B.Des (Interior Design)", "B.Des (Fashion Design)"],
  sprs: ["Physiotherapy (BPT)", "MPT"],
  semc: ["B.Journalism & Mass Communication", "BA (Hons.) Media Studies"],
  soe: ["B.Ed", "D.El.Ed", "M.Ed"],
  sas: ["B.Sc (Hons.) Agriculture"],
  shmct: ["B.Sc Hotel Management"],
};

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "", enrollment_no: "", email: "", phone: "",
    department_id: "", branch: "", course: "", year: "1",
  });
  const [submitting, setSubmitting] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v, ...(k === "department_id" ? { branch: "" } : {}) }));

  const branches = BRANCHES_BY_DEPT[form.department_id] ?? [];
  const deptName = DEPARTMENTS.find(d => d.id === form.department_id)?.name ?? "";

  const onRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.enrollment_no || !form.email || !form.department_id || !form.branch || !form.course) {
      toast.error("Please fill all required fields.");
      return;
    }

    if (!form.email.toLowerCase().endsWith("@gmail.com")) {
      toast.error("Please enter a valid @gmail.com address.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        throw new Error("API returned an invalid response (not JSON). Ensure your backend is running.");
      }
      
      if (!response.ok) throw new Error(data.error || "Failed to send OTP");

      setOtpMode(true);
      toast.success("OTP sent to your email!");
    } catch (err: any) {
      console.error("OTP request error:", err);
      toast.error(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, otp }),
      });
      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        throw new Error("API returned an invalid response (not JSON). Ensure your backend is running.");
      }
      
      if (!response.ok) throw new Error(data.error || "Invalid OTP");

      // Sign in securely using custom token
      const result = await signInWithCustomToken(auth, data.customToken);

      // Create student profile
      const profile = {
        full_name: form.full_name,
        enrollment_no: form.enrollment_no.toUpperCase(),
        email: form.email,
        phone: form.phone,
        department_id: form.department_id,
        branch_id: form.branch,
        course: form.course,
        year: parseInt(form.year),
        deptName,
        auth_uid: result.user.uid,
      };

      const res = await registerStudent({ data: profile });
      if (!res.ok) throw new Error(res.error || "Failed to finalize registration.");

      // Save to local device
      localDb.saveStudentProfile({
        id: res.student_id!,
        full_name: profile.full_name,
        enrollment_no: profile.enrollment_no,
        branch: `${profile.branch_id} · ${profile.deptName}`,
        semester: `Year ${profile.year} · ${profile.course}`,
        created_at: new Date().toISOString(),
        department_id: profile.department_id,
      });

      setDone("success");
    } catch (err: any) {
      console.error("OTP verify error:", err);
      toast.error(err.message || "Invalid OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done === "success") {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-12">
          <SuccessBurst
            title="Registration Complete!"
            subtitle="Your email has been verified and your profile is ready."
          />
          <div className="mt-6 grid gap-2">
            <Button variant="liquidGlassMaroon" asChild size="lg" className="rounded-full font-semibold">
              <Link to="/my-pass">View Digital Pass</Link>
            </Button>
            <Button variant="liquidGlassDark" asChild size="lg" className="rounded-full font-medium">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (otpMode) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-12">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="text-center mb-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h1 className="text-2xl font-bold">Verify your Email</h1>
              <p className="mt-2 text-muted-foreground text-sm">
                We sent a 6-digit code to <span className="font-medium text-foreground">{form.email}</span>
              </p>
            </div>
            
            <form onSubmit={onVerifyOtp} className="space-y-6 bg-card border rounded-2xl p-6 shadow-sm">
              <div className="space-y-2 text-center">
                <Label htmlFor="otp">Enter 6-digit Code</Label>
                <Input 
                  id="otp"
                  type="text" 
                  maxLength={6}
                  required 
                  className="text-center text-2xl tracking-[0.5em] font-mono h-14" 
                  value={otp} 
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))} 
                  placeholder="------" 
                />
              </div>
              <div className="space-y-3">
                <Button type="submit" variant="liquidGlassMaroon" size="lg" disabled={submitting || otp.length !== 6} className="w-full h-12 rounded-full font-semibold">
                  {submitting ? "Verifying…" : "Verify & Complete"}
                </Button>
                <Button type="button" variant="ghost" className="w-full rounded-full" onClick={() => setOtpMode(false)}>
                  Change Email
                </Button>
              </div>
            </form>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated Liquid Glass Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
      </div>

      <div className="relative z-10">
        <SiteHeader />
        <main className="container mx-auto max-w-xl px-4 py-8 sm:py-12">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <h1 className="text-3xl font-bold">Student Registration</h1>
            <p className="mt-1 text-muted-foreground">Takes about 30 seconds. Required for QR attendance.</p>
          </motion.div>

          <form onSubmit={onRequestOtp} className="mt-8 grid gap-4 rounded-2xl panel-liquid-glass p-6 shadow-glow relative z-10">
            <Field label="Full Name">
              <Input required minLength={2} value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="e.g. Aarav Sharma" className="bg-background/60" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Enrollment Number">
                <Input required value={form.enrollment_no} onChange={(e) => update("enrollment_no", e.target.value)} placeholder="KRMU24CS0001" className="uppercase bg-background/60" />
              </Field>
              <Field label="Phone (optional)">
                <Input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+91 9xxxxxxxxx" className="bg-background/60" />
              </Field>
            </div>

            <Field label="Email">
              <Input required type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@gmail.com" className="bg-background/60" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="School">
                <Select value={form.department_id} onValueChange={(v) => update("department_id", v)}>
                  <SelectTrigger className="bg-background/60"><SelectValue placeholder="Select school" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Program">
                <Select value={form.branch} onValueChange={(v) => update("branch", v)} disabled={!form.department_id}>
                  <SelectTrigger className="bg-background/60"><SelectValue placeholder={form.department_id ? "Select program" : "Pick school first"} /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Course">
                <Input required value={form.course} onChange={(e) => update("course", e.target.value)} placeholder="Write your course..." className="bg-background/60" />
              </Field>
              <Field label="Year">
                <Select value={form.year} onValueChange={(v) => update("year", v)}>
                  <SelectTrigger className="bg-background/60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((y) => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Button type="submit" variant="liquidGlassMaroon" size="lg" disabled={submitting} className="mt-2 h-12 text-base rounded-full font-semibold">
              {submitting ? "Sending OTP…" : "Continue with OTP"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              By registering you agree to the KRMU induction code of conduct.
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
