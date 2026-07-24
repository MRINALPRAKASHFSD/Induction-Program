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
import {
  User,
  Hash,
  Phone,
  Mail,
  GraduationCap,
  Building2,
  BookOpen,
  Calendar,
  ShieldCheck,
  Check,
  Ticket,
  QrCode,
  Sparkles,
} from "lucide-react";

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
  { id: "soet",  code: "SOET",  name: "School of Engineering & Technology" },
  { id: "somc",  code: "SOMC",  name: "School of Management and Commerce" },
  { id: "sols",  code: "SOLS",  name: "School of Legal Studies" },
  { id: "smas",  code: "SMAS",  name: "School of Medical & Allied Sciences" },
  { id: "sola",  code: "SOLA",  name: "School of Liberal Arts" },
  { id: "sbas",  code: "SBAS",  name: "School of Basic & Applied Sciences" },
  { id: "soad",  code: "SOAD",  name: "School of Architecture & Design" },
  { id: "sprs",  code: "SPRS",  name: "School of Physiotherapy and Rehabilitation Sciences" },
  { id: "semc",  code: "SEMC",  name: "School of Emerging Media and Creator Economy" },
  { id: "soe",   code: "SOE",   name: "School of Education" },
  { id: "sas",   code: "SAS",   name: "School of Agricultural Sciences" },
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
    full_name:     "",
    enrollment_no: "",
    email:         "",
    phone:         "",
    department_id: "",
    branch:        "",
    course:        "",
    year:          "1",
    agreeTerms:    false,
    agreePrivacy:  false,
    consentComms:  false,
  });
  const [submitting, setSubmitting]           = useState(false);
  const [done, setDone]                       = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [loadingAuth, setLoadingAuth]         = useState(true);

  // ── Email verification states ──────────────────────────────────────────────
  const [emailVerified, setEmailVerified]     = useState(false);
  const [verifyingEmail, setVerifyingEmail]   = useState(false);
  const [emailOtp, setEmailOtp]               = useState("");
  const [sendingOtp, setSendingOtp]           = useState(false);
  const [storedCustomToken, setStoredCustomToken] = useState<string | null>(null);
  const [storedRegToken, setStoredRegToken]   = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAlreadyRegistered(!!user);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const update = <K extends keyof typeof form>(k: K, v: any) =>
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

  const branches  = form.department_id ? PROGRAM_LEVELS : [];
  const deptName  = DEPARTMENTS.find(d => d.id === form.department_id)?.name ?? "";

  // ── Send OTP to email ──────────────────────────────────────────────────────
  const onSendEmailOtp = async () => {
    if (!form.email) {
      toast.error("Please enter your email address first.");
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
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        throw new Error("API returned an invalid response. Ensure the backend is running.");
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
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        throw new Error("API returned an invalid response. Ensure the backend is running.");
      }
      if (!response.ok) throw new Error(data.error || "Invalid OTP");

      // If user already exists (registered before), redirect to login
      if (data.userExists && data.enrollmentNo) {
        toast.success("You're already registered! Please sign in.");
        navigate({ to: "/login" });
        return;
      }

      setStoredCustomToken(data.customToken);
      setStoredRegToken(data.regToken);
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

    if (!form.full_name || !form.enrollment_no || !form.email || !form.phone || !form.department_id || !form.branch || !form.course) {
      toast.error("Please fill all required fields.");
      return;
    }

    if (!form.agreeTerms || !form.agreePrivacy || !form.consentComms) {
      toast.error("Please accept all required agreements to continue.");
      return;
    }

    if (!emailVerified || !storedCustomToken || !storedRegToken) {
      toast.error("Please verify your email first using the 'Verify Email' button.");
      return;
    }

    setSubmitting(true);
    try {
      // Sign in with the custom token for client-side Firebase auth state
      const result = await signInWithCustomToken(auth, storedCustomToken);

      const profile = {
        full_name:     form.full_name,
        enrollment_no: form.enrollment_no.toUpperCase(),
        email:         form.email,
        phone:         form.phone,
        department_id: form.department_id,
        branch_id:     form.branch,
        course:        form.course,
        year:          parseInt(form.year),
        deptName,
        auth_uid:      result.user.uid,
      };

      // regToken authorizes the server-side registration (avoids firebase-admin/auth)
      const res = await registerStudent({ data: profile, regToken: storedRegToken! });
      if (!res.ok) throw new Error(res.error || "Failed to finalize registration.");

      // Save profile to local device storage for offline use
      localDb.saveStudentProfile({
        id:            res.student_id!,
        full_name:     profile.full_name,
        enrollment_no: profile.enrollment_no,
        branch:        `${profile.branch_id} · ${profile.deptName}`,
        semester:      `Session 2026–2027 · ${profile.course}`,
        created_at:    new Date().toISOString(),
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

  // ── Prevent flickering while checking auth ──────────────────────────────────
  if (loadingAuth) return null;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done === "success") {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="orb orb-1" /><div className="orb orb-2" />
          <div className="orb orb-3" /><div className="orb orb-4" />
        </div>
        <div className="relative z-10">
          <SiteHeader />
          <main className="container mx-auto max-w-md px-4 py-8 sm:py-12">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="panel-liquid-glass rounded-2xl p-8 shadow-glow relative z-10 text-center">
              <SuccessBurst
                title="Registration Complete!"
                subtitle="Your email has been verified and your profile is ready."
              />
              <div className="mt-8 grid gap-3">
                <Button variant="liquidGlassMaroon" asChild size="lg" className="rounded-full font-semibold h-12">
                  <Link to="/my-pass">View Digital Pass</Link>
                </Button>
                <Button variant="liquidGlassDark" asChild size="lg" className="rounded-full font-medium h-12">
                  <Link to="/">Back to Home</Link>
                </Button>
              </div>
            </motion.div>
          </main>
        </div>
      </div>
    );
  }

  // ── Already logged in screen ────────────────────────────────────────────────
  if (alreadyRegistered) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="orb orb-1" /><div className="orb orb-2" />
          <div className="orb orb-3" /><div className="orb orb-4" />
        </div>
        <div className="relative z-10">
          <SiteHeader />
          <main className="container mx-auto max-w-md px-4 py-8 sm:py-12">
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

      <div className="relative z-10 flex flex-col min-h-screen">
        <SiteHeader />
        
        <main className="container mx-auto max-w-6xl px-4 py-8 sm:py-12 flex-1">
          <div className="grid gap-12 lg:grid-cols-12 items-start">
            
            {/* Left Column - Value Prop */}
            <div className="lg:col-span-5 lg:sticky lg:top-32 hidden lg:flex flex-col gap-8 rounded-[2rem] p-10 shadow-2xl border border-primary/20 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-xl relative overflow-hidden">
               {/* Decorative background meshes */}
               <div className="absolute -top-32 -right-32 w-80 h-80 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
               <div className="absolute top-1/2 -left-32 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />
               <div className="absolute -bottom-20 right-0 w-72 h-72 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
               
               {/* Subtle grid pattern overlay */}
               <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMTgyLCAzNCwgNTEsIDAuMDUpIi8+PC9zdmc+')] [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none" />

               <div className="relative z-10">
                 <h2 className="text-[2.75rem] font-extrabold tracking-tight text-foreground leading-[1.15] text-balance">Claim Your<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-600">Identity</span></h2>
                 <p className="mt-5 text-muted-foreground text-[16px] leading-[1.65] max-w-[92%] text-pretty font-medium">
                   Welcome to the AARAMBH 2026 portal. Complete your verified registration to unlock exclusive access to the entire induction experience.
                 </p>
               </div>

               <div className="relative z-10 grid gap-8 mt-7">
                  <div className="flex gap-5 group">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-background border border-primary/20 shadow-[0_4px_20px_rgba(var(--primary-rgb),0.15)] group-hover:scale-105 group-hover:shadow-[0_4px_25px_rgba(var(--primary-rgb),0.25)] transition-all duration-300">
                      <Ticket className="h-6 w-6 text-primary" />
                    </div>
                    <div className="pt-0.5">
                      <h3 className="font-bold text-foreground text-[16px] tracking-tight">Digital Entry Pass</h3>
                      <p className="text-[14px] text-muted-foreground mt-1.5 leading-relaxed pr-2 text-pretty">Secure your smart wallet pass for frictionless campus entry and check-ins.</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-5 group">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-background border border-primary/20 shadow-[0_4px_20px_rgba(var(--primary-rgb),0.15)] group-hover:scale-105 group-hover:shadow-[0_4px_25px_rgba(var(--primary-rgb),0.25)] transition-all duration-300">
                      <QrCode className="h-6 w-6 text-primary" />
                    </div>
                    <div className="pt-0.5">
                      <h3 className="font-bold text-foreground text-[16px] tracking-tight">QR Attendance</h3>
                      <p className="text-[14px] text-muted-foreground mt-1.5 leading-relaxed pr-2 text-pretty">Experience lightning-fast event check-ins straight from your mobile device.</p>
                    </div>
                  </div>

                  <div className="flex gap-5 group">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-background border border-primary/20 shadow-[0_4px_20px_rgba(var(--primary-rgb),0.15)] group-hover:scale-105 group-hover:shadow-[0_4px_25px_rgba(var(--primary-rgb),0.25)] transition-all duration-300">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <div className="pt-0.5">
                      <h3 className="font-bold text-foreground text-[16px] tracking-tight">Exclusive Access</h3>
                      <p className="text-[14px] text-muted-foreground mt-1.5 leading-relaxed pr-2 text-pretty">Gain immediate, verified access to premium clubs and networking events.</p>
                    </div>
                  </div>
               </div>
               
               <div className="mt-8 relative z-10 p-6 rounded-2xl bg-primary/[0.03] border border-primary/10 shadow-inner">
                  <p className="text-[15px] text-foreground/80 leading-relaxed italic text-center font-medium">
                    "The future belongs to those who prepare for it today."
                  </p>
               </div>
            </div>

            {/* Right Column - Form */}
            <div className="lg:col-span-7">
               {/* Mobile Header (Hidden on LG) */}
               <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center lg:hidden mb-8">
                 <h1 className="text-3xl font-extrabold tracking-tight">Claim Your Identity</h1>
                 <p className="mt-3 text-[15px] text-muted-foreground">Takes about 30 seconds. Required for QR attendance.</p>
               </motion.div>

               <form onSubmit={onSubmitForm} className="rounded-3xl sm:rounded-[2rem] panel-liquid-glass p-5 sm:p-10 shadow-glow border border-primary/10 relative z-10 bg-background/70 backdrop-blur-2xl">
                 
                 <div className="space-y-8 sm:space-y-10">

                   {/* Section 1 — Personal Identity */}
                   <div className="space-y-6">
                     <div className="flex items-center gap-3 border-b border-border/30 pb-3">
                       <div className="h-6 w-1.5 rounded-full bg-primary" />
                       <h3 className="font-bold text-xl tracking-tight">1. Personal Identity</h3>
                     </div>

                     <Field label="Full Name *">
                       <IconInput icon={User} required minLength={2} value={form.full_name}
                         onChange={(e: any) => update("full_name", e.target.value)} placeholder="e.g. Aarav Sharma" />
                     </Field>

                     <div className="grid gap-6 sm:grid-cols-2">
                       <Field label="Enrollment Number *">
                         <IconInput icon={Hash} required value={form.enrollment_no}
                           onChange={(e: any) => update("enrollment_no", e.target.value)}
                           placeholder="e.g. KRMU24CS0001" className="uppercase" />
                       </Field>
                       <Field label="Phone Number *">
                         <IconInput icon={Phone} type="tel" required minLength={10} value={form.phone}
                           onChange={(e: any) => update("phone", e.target.value)} placeholder="+91 9xxxxxxxxx" />
                       </Field>
                     </div>

                     {/* Email with inline OTP verification */}
                     <Field label="Email Address *">
                       <AnimatePresence mode="wait">
                         {!emailVerified ? (
                           <motion.div key="email-input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                             <div className="flex gap-2">
                               <div className="relative flex items-center flex-1 min-w-0">
                                 <div className="absolute left-3 flex h-full items-center text-muted-foreground z-10 pointer-events-none">
                                   <Mail className="h-[18px] w-[18px]" />
                                 </div>
                                 <Input
                                   type="email"
                                   required
                                   value={form.email}
                                   onChange={(e) => updateEmail(e.target.value)}
                                   placeholder="you@example.com"
                                   disabled={verifyingEmail || sendingOtp}
                                   className="pl-10 h-12 text-[15px] bg-background/50 border-border/50 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                                 />
                               </div>
                               <button
                                 type="button"
                                 onClick={verifyingEmail ? onVerifyEmailOtp : onSendEmailOtp}
                                 disabled={sendingOtp || !form.email}
                                 className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 h-12 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-sm"
                               >
                                 {sendingOtp ? (
                                   <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                 ) : verifyingEmail ? "Verify" : "Send OTP"}
                               </button>
                             </div>
                             {verifyingEmail && (
                               <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2">
                                 <p className="text-[13px] text-foreground/70">
                                   Enter the 6-digit code sent to <span className="font-semibold text-foreground">{form.email}</span>.{" "}
                                   <span className="text-yellow-600 dark:text-yellow-500">Check spam if not received.</span>
                                 </p>
                                 <div className="flex gap-2">
                                   <Input
                                     type="text"
                                     inputMode="numeric"
                                     maxLength={6}
                                     value={emailOtp}
                                     onChange={(e) => setEmailOtp(e.target.value.replace(/[^0-9]/g, ""))}
                                     onKeyDown={(e) => e.key === "Enter" && emailOtp.length === 6 && onVerifyEmailOtp()}
                                     placeholder="------"
                                     autoFocus
                                     className="text-center text-xl tracking-[0.5em] font-mono h-12 bg-background/80 border-border/60 flex-1 focus-visible:ring-primary/30 rounded-xl"
                                   />
                                   <button type="button" onClick={() => { setVerifyingEmail(false); setEmailOtp(""); }}
                                     className="text-[13px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 whitespace-nowrap self-center">
                                     Change email
                                   </button>
                                 </div>
                               </motion.div>
                             )}
                             {!verifyingEmail && (
                               <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                 <ShieldCheck className="w-3.5 h-3.5 text-primary/70" />
                                 Use any personal email. A 6-digit code will be sent to verify it.
                               </p>
                             )}
                           </motion.div>
                         ) : (
                           <motion.div key="email-verified" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                             className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                             <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
                             <div className="min-w-0">
                               <p className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">Email Verified</p>
                               <p className="text-[13px] text-foreground/70 truncate">{form.email}</p>
                             </div>
                           </motion.div>
                         )}
                       </AnimatePresence>
                     </Field>
                   </div>

                   {/* Section 2 — Academic Profile */}
                   <div className="space-y-6">
                     <div className="flex items-center gap-3 border-b border-border/30 pb-3">
                       <div className="h-6 w-1.5 rounded-full bg-primary" />
                       <h3 className="font-bold text-xl tracking-tight">2. Academic Profile</h3>
                     </div>

                     <div className="grid gap-6 sm:grid-cols-2">
                       <Field label="School *">
                         <div className="relative flex items-center w-full min-w-0">
                           <div className="absolute left-3 flex h-full items-center justify-center text-muted-foreground z-10 pointer-events-none">
                             <Building2 className="h-[18px] w-[18px]" />
                           </div>
                           <Select value={form.department_id} onValueChange={(v) => update("department_id", v)}>
                             <SelectTrigger className="pl-10 h-12 text-[15px] bg-background/50 border-border/50 focus:ring-primary/20 [&>span]:truncate"><SelectValue placeholder="Select school" /></SelectTrigger>
                             <SelectContent>
                               {DEPARTMENTS.map((d) => (
                                 <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                         </div>
                       </Field>
                       <Field label="Programme *">
                         <div className="relative flex items-center w-full min-w-0">
                           <div className="absolute left-3 flex h-full items-center justify-center text-muted-foreground z-10 pointer-events-none">
                             <GraduationCap className="h-[18px] w-[18px]" />
                           </div>
                           <Select value={form.branch} onValueChange={(v) => update("branch", v)} disabled={!form.department_id}>
                             <SelectTrigger className="pl-10 h-12 text-[15px] bg-background/50 border-border/50 focus:ring-primary/20 [&>span]:truncate"><SelectValue placeholder={form.department_id ? "Select programme" : "Pick school first"} /></SelectTrigger>
                             <SelectContent>
                               {branches.map((b) => (
                                 <SelectItem key={b} value={b}>{b}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                         </div>
                       </Field>
                     </div>

                     <div className="grid gap-6 sm:grid-cols-2">
                       <Field label="Course *">
                         <IconInput icon={BookOpen} required value={form.course} onChange={(e: any) => update("course", e.target.value)} placeholder="e.g. B.Tech CSE" />
                       </Field>
                       <Field label="Session *">
                         <div className="relative flex items-center w-full min-w-0">
                           <div className="absolute left-3 flex h-full items-center justify-center text-muted-foreground z-10 pointer-events-none">
                             <Calendar className="h-[18px] w-[18px]" />
                           </div>
                           <Select value={form.year} onValueChange={(v) => update("year", v)}>
                             <SelectTrigger className="pl-10 h-12 text-[15px] bg-background/50 border-border/50 focus:ring-primary/20"><SelectValue /></SelectTrigger>
                             <SelectContent>
                               {[1].map((y) => <SelectItem key={y} value={String(y)}>Session 2026–2027</SelectItem>)}
                             </SelectContent>
                           </Select>
                         </div>
                       </Field>
                     </div>
                   </div>

                   {/* Consents */}
                   <div className="pt-6 grid gap-4 border-t border-border/30">
                     <CustomCheckbox required checked={form.agreeTerms} onChange={(v: boolean) => update("agreeTerms", v)}>
                       I agree to the <Link to="/terms" className="text-primary hover:underline font-bold">Terms of Service</Link>
                     </CustomCheckbox>
                     <CustomCheckbox required checked={form.agreePrivacy} onChange={(v: boolean) => update("agreePrivacy", v)}>
                       I agree to the <Link to="/privacy" className="text-primary hover:underline font-bold">Privacy Policy</Link>
                     </CustomCheckbox>
                     <CustomCheckbox required checked={form.consentComms} onChange={(v: boolean) => update("consentComms", v)}>
                       I consent to receiving official induction communications
                     </CustomCheckbox>
                   </div>

                   <Button
                     type="submit"
                     variant="liquidGlassMaroon"
                     size="lg"
                     disabled={submitting}
                     className="w-full h-14 mt-4 text-[17px] rounded-2xl font-extrabold shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-300 group"
                   >
                     {submitting ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          Processing Registration...
                        </span>
                     ) : (
                       "Complete Registration"
                     )}
                   </Button>

                   <p className="text-center text-[13px] text-muted-foreground">
                     Already registered?{" "}
                     <Link to="/login" className="text-primary hover:underline font-semibold">
                       Sign in here
                     </Link>
                   </p>
                 </div>
               </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── UI Helper Components ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2.5 min-w-0 w-full">
      <Label className="text-sm font-semibold text-foreground/90 pl-1">{label}</Label>
      {children}
    </div>
  );
}

function IconInput({ icon: Icon, className, ...props }: any) {
  return (
    <div className="relative flex items-center w-full min-w-0">
      <div className="absolute left-3 flex h-full items-center justify-center text-muted-foreground z-10 pointer-events-none">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <Input {...props} className={`pl-10 h-12 text-[15px] bg-background/50 border-border/50 focus-visible:border-primary/50 focus-visible:ring-primary/20 ${className || ""}`} />
    </div>
  );
}

function CustomCheckbox({ checked, onChange, required, children }: any) {
  return (
    <label className="flex items-center gap-3.5 cursor-pointer group p-2 -ml-2 rounded-xl hover:bg-background/40 transition-colors">
      <div className="relative flex items-center justify-center">
        <input type="checkbox" required={required} checked={checked} onChange={e => onChange(e.target.checked)} className="peer absolute opacity-0 w-0 h-0" />
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${checked ? "bg-primary border-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.4)]" : "bg-background/50 border-border/60 group-hover:border-primary/50 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40"}`}>
          <Check className={`h-3 w-3 text-primary-foreground stroke-[3] transition-transform duration-300 ${checked ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} />
        </div>
      </div>
      <div className="text-[14px] text-foreground/90 group-hover:text-foreground transition-colors select-none pt-0.5">
        {children}
      </div>
    </label>
  );
}
