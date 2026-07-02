import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { signInWithCustomToken, onAuthStateChanged, signOut } from "firebase/auth";

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

const PROGRAM_LEVELS = [
  "Undergraduate Programmes",
  "Postgraduate Programmes",
  "Doctoral Programmes",
  "Diploma Programmes",
];

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "", enrollment_no: "", email: "", phone: "",
    department_id: "", branch: "", course: "", year: "1",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  // ── Email verification states ──────────────────────────────────────────────
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [storedCustomToken, setStoredCustomToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAlreadyRegistered(!!user);
    });
    return () => unsubscribe();
  }, []);

  const update = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v, ...(k === "department_id" ? { branch: "" } : {}) }));

  // Reset email verification whenever the email changes
  const updateEmail = (v: string) => {
    update("email", v);
    if (emailVerified || verifyingEmail) {
      setEmailVerified(false);
      setVerifyingEmail(false);
      setEmailOtp("");
      setStoredCustomToken(null);
    }
  };

  const branches = form.department_id ? PROGRAM_LEVELS : [];
  const deptName = DEPARTMENTS.find(d => d.id === form.department_id)?.name ?? "";

  // ── Send OTP to email ──────────────────────────────────────────────────────
  const onSendEmailOtp = async () => {
    if (!form.email) {
      toast.error("Please enter your email address first.");
      return;
    }
    if (!form.email.toLowerCase().endsWith("@gmail.com")) {
      toast.error("Please enter a valid @gmail.com address.");
      return;
    }

    setSendingOtp(true);
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
      setVerifyingEmail(true);
      toast.success("OTP sent to your email!");
    } catch (err: any) {
      console.error("Send OTP error:", err);
      toast.error(err.message || "Failed to send OTP.");
    } finally {
      setSendingOtp(false);
    }
  };

  // ── Verify OTP inline ──────────────────────────────────────────────────────
  const onVerifyEmailOtp = async () => {
    if (!emailOtp || emailOtp.length !== 6) {
      toast.error("Please enter the 6-digit OTP.");
      return;
    }

    setSendingOtp(true);
    try {
      const response = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, otp: emailOtp }),
      });
      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        throw new Error("API returned an invalid response (not JSON). Ensure your backend is running.");
      }
      if (!response.ok) throw new Error(data.error || "Invalid OTP");

      setStoredCustomToken(data.customToken);
      setEmailVerified(true);
      setVerifyingEmail(false);
      setEmailOtp("");
      toast.success("Email verified ✓");
    } catch (err: any) {
      console.error("Verify OTP error:", err);
      toast.error(err.message || "Invalid OTP. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  // ── Final registration submit ───────────────────────────────────────────────
  const onSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.full_name || !form.enrollment_no || !form.email || !form.department_id || !form.branch || !form.course) {
      toast.error("Please fill all required fields.");
      return;
    }

    if (!emailVerified || !storedCustomToken) {
      toast.error("Please verify your email first using the 'Verify Email' button.");
      return;
    }

    setSubmitting(true);
    try {
      // Sign in with the token we already obtained during email verification
      const result = await signInWithCustomToken(auth, storedCustomToken);

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
      console.error("Registration error:", err);
      toast.error(err.message || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done === "success") {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
          <div className="orb orb-4" />
        </div>
        <div className="relative z-10">
          <SiteHeader />
          <main className="container mx-auto max-w-md px-4 py-12">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="panel-liquid-glass rounded-2xl p-8 shadow-glow relative z-10 text-center">
              <SuccessBurst
                title="Registration Complete!"
                subtitle="Your email has been verified and your profile is ready."
              />
              <div className="mt-8 grid gap-3">
                <Button variant="liquidGlassMaroon" asChild size="lg" className="rounded-full font-semibold h-12">
                  <Link to="/my-pass">View Digital Pass</Link>
                </Button>
                <Button variant="liquidGlassDark" asChild size="lg" className="rounded-full font-medium h-12">
                  <Link to="/">Back to home</Link>
                </Button>
              </div>
            </motion.div>
          </main>
        </div>
      </div>
    );
  }

  // ── Already registered screen ───────────────────────────────────────────────
  if (alreadyRegistered) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
          <div className="orb orb-4" />
        </div>
        <div className="relative z-10">
          <SiteHeader />
          <main className="container mx-auto max-w-md px-4 py-12">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="panel-liquid-glass rounded-2xl p-8 shadow-glow relative z-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-3">Already Registered</h1>
              <p className="text-muted-foreground mb-8">
                You are currently logged in. To register a new account, you must log out first.
              </p>
              <div className="mt-4 grid gap-3">
                <Button variant="liquidGlassMaroon" asChild size="lg" className="rounded-full font-semibold h-12">
                  <Link to="/my-pass">View Digital Pass</Link>
                </Button>
                <Button
                  variant="liquidGlassDark"
                  size="lg"
                  className="rounded-full font-medium h-12"
                  onClick={async () => {
                    await signOut(auth);
                    localStorage.clear();
                    window.location.reload();
                  }}
                >
                  Log out
                </Button>
              </div>
            </motion.div>
          </main>
        </div>
      </div>
    );
  }

  // ── Main registration form ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
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

          <form onSubmit={onSubmitForm} className="mt-8 grid gap-4 rounded-2xl panel-liquid-glass p-6 shadow-glow relative z-10">
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

            {/* ── Email field with inline verification ── */}
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Email</Label>
                {emailVerified && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <path d="m9 11 3 3L22 4"/>
                    </svg>
                    Verified
                  </motion.span>
                )}
              </div>

              <div className="relative">
                <Input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => updateEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className={`bg-background/60 transition-colors ${emailVerified ? "border-emerald-500/50 focus-visible:ring-emerald-500/30" : ""}`}
                />
              </div>

              {/* Verify Email button — shown when not yet verified and not in OTP entry */}
              {!emailVerified && !verifyingEmail && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                  <button
                    type="button"
                    onClick={onSendEmailOtp}
                    disabled={sendingOtp || !form.email}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-border/60 bg-background/40 hover:bg-background/80 hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingOtp ? (
                      <>
                        <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        Sending…
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="20" height="16" x="2" y="4" rx="2"/>
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                        </svg>
                        Verify Email
                      </>
                    )}
                  </button>
                </motion.div>
              )}

              {/* Inline OTP entry — shown after OTP is sent */}
              <AnimatePresence>
                {verifyingEmail && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 flex flex-col gap-2 rounded-xl border border-border/50 bg-background/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        Enter the 6-digit code sent to <span className="font-medium text-foreground">{form.email}</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          maxLength={6}
                          value={emailOtp}
                          onChange={(e) => setEmailOtp(e.target.value.replace(/[^0-9]/g, ""))}
                          placeholder="------"
                          className="text-center text-lg tracking-[0.4em] font-mono h-10 bg-background/60 flex-1"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={onVerifyEmailOtp}
                          disabled={sendingOtp || emailOtp.length !== 6}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {sendingOtp ? (
                            <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          ) : (
                            "Confirm"
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setVerifyingEmail(false); setEmailOtp(""); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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

            <Button
              type="submit"
              variant="liquidGlassMaroon"
              size="lg"
              disabled={submitting}
              className="mt-2 h-12 text-base rounded-full font-semibold"
            >
              {submitting ? "Registering…" : "Register"}
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
