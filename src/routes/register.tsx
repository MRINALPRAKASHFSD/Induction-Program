import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { localDb } from "@/lib/local-db";
import { registerStudent } from "@/lib/students.functions";
import { lookupInductionParticipant, registerInductionStudent } from "@/lib/admin.functions";
import { lookupStudent } from "@/lib/students.functions";
import { SCHOOLS, PROGRAM_LEVELS } from "@/lib/constants";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

import { auth } from "@/lib/firebase/config";
import { signInWithCustomToken } from "firebase/auth";
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
  Search,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
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

// ─── Auth State Machine ────────────────────────────────────────────────────────
// The machine only moves FORWARD. It never jumps back to /login.
//
// LOOKUP           → enter application number
// FAST_TRACK       → student found (PENDING), waiting to send OTP
// FULL_FORM        → not in induction dataset, manual form
// NOT_FOUND        → application number not in system
// OTP_SENDING      → OTP request in flight
// OTP_ENTRY        → OTP sent, waiting for student to type
// OTP_VERIFYING    → OTP check in flight
// AUTHENTICATING   → signInWithCustomToken in flight
// AUTH_ERROR       → signInWithCustomToken failed (retry available, no redirect)
// REGISTERING      → creating Firestore student document
// LOADING_PROFILE  → animated progress before final navigate
// (terminal)       → navigate('/dashboard', { replace: true })
type AuthPhase =
  | "LOOKUP"
  | "FAST_TRACK"
  | "FULL_FORM"
  | "NOT_FOUND"
  | "OTP_SENDING"
  | "OTP_ENTRY"
  | "OTP_VERIFYING"
  | "AUTHENTICATING"
  | "AUTH_ERROR"
  | "REGISTERING"
  | "LOADING_PROFILE";

// ─────────────────────────────────────────────────────────────────────────────

function RegisterPage() {
  const navigate = useNavigate();

  const { user } = useAuthRedirect();
  
  // ── Core state machine ─────────────────────────────────────────────────────
  const [phase, setPhase] = useState<AuthPhase>("LOOKUP");

  useEffect(() => {
    // Only redirect if they load the page already logged in.
    // Do NOT interrupt the sequence if they are actively registering/logging in.
    if (user && phase === "LOOKUP") {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [user, phase, navigate]);

  // ── Application Number lookup ──────────────────────────────────────────────
  const [appNumber, setAppNumber] = useState("");
  const [inductionRecord, setInductionRecord] = useState<any | null>(null);
  // isReturning = true means registration_status was REGISTERED (existing student)
  const [isReturning, setIsReturning] = useState(false);

  // ── OTP state ──────────────────────────────────────────────────────────────
  const [otpValue, setOtpValue] = useState("");
  // Tokens received from /api/verify-otp
  const [verifiedCustomToken, setVerifiedCustomToken] = useState<string | null>(null);
  const [verifiedRegToken, setVerifiedRegToken]     = useState<string | null>(null);
  const [verifiedEnrollmentNo, setVerifiedEnrollmentNo] = useState<string | null>(null);
  // Whether the verify-otp response said this user already has an account
  const [otpUserExists, setOtpUserExists] = useState(false);

  // ── Auth error retry ───────────────────────────────────────────────────────
  const [authErrorMsg, setAuthErrorMsg] = useState("");
  const retryCountRef = useRef(0);

  // ── Full manual form ───────────────────────────────────────────────────────
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
  // Separate submit loading flag to satisfy TypeScript narrowing —
  // phase can't be REGISTERING inside the FULL_FORM render block.
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Email OTP for the full-form path
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  // Tokens from full-form OTP path
  const [formCustomToken, setFormCustomToken] = useState<string | null>(null);
  const [formRegToken, setFormRegToken]       = useState<string | null>(null);

  const updateForm = <K extends keyof typeof form>(k: K, v: any) =>
    setForm((f) => ({ ...f, [k]: v, ...(k === "department_id" ? { branch: "" } : {}) }));

  const updateFormEmail = (v: string) => {
    updateForm("email", v);
    if (emailVerified || verifyingEmail) {
      setEmailVerified(false);
      setVerifyingEmail(false);
      setEmailOtp("");
      setFormCustomToken(null);
      setFormRegToken(null);
    }
  };

  const branches = form.department_id ? PROGRAM_LEVELS : [];
  const deptName  = SCHOOLS.find(s => s.id === form.department_id)?.name ?? "";

  // ─── LOADING_PROFILE auto-navigate after animation ────────────────────────
  useEffect(() => {
    if (phase !== "LOADING_PROFILE") return;
    const timer = setTimeout(() => {
      navigate({ to: "/dashboard", replace: true });
    }, 2200); // 2.2 s — enough for the 3-step animation to finish
    return () => clearTimeout(timer);
  }, [phase, navigate]);

  // ─────────────────────────────────────────────────────────────────────────────
  // HANDLER: Sign in with Firebase custom token (with silent retry)
  // ─────────────────────────────────────────────────────────────────────────────
  async function signInWithRetry(customToken: string): Promise<boolean> {
    retryCountRef.current = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await signInWithCustomToken(auth, customToken);
        return true;
      } catch (err: any) {
        console.error(`[signInWithRetry] attempt ${attempt + 1} failed:`, err.message);
        if (attempt === 0) {
          // Silent retry — wait 800 ms before second attempt
          await new Promise(r => setTimeout(r, 800));
        } else {
          setAuthErrorMsg(err.message || "Authentication failed. Please try again.");
        }
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER: Wait for auth, poll for profile up to 3 times, save to localDb
  // ─────────────────────────────────────────────────────────────────────────────
  async function pollProfileAndSave(enrollmentNo: string, fallbackProfileData: any): Promise<boolean> {
    // Save the ID so the dashboard can load properly even if lookup is slow
    localStorage.setItem("krmu_verified_student_id", enrollmentNo);

    // Wait up to 2 seconds for Firebase auth state to propagate locally
    for (let i = 0; i < 20; i++) {
      if (auth.currentUser) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // Poll for profile up to 3 times (1.5 seconds)
    for (let i = 0; i < 3; i++) {
      try {
        const lookupRes = await lookupStudent({ data: { enrollment_no: enrollmentNo } });
        if (lookupRes.student) {
          const s = lookupRes.student as any;
          localDb.saveStudentProfile({
            id:            s.id,
            full_name:     s.full_name || s.name || fallbackProfileData.full_name || "Student",
            enrollment_no: s.enrollment_no || enrollmentNo,
            branch:        s.branch_id ? `${s.branch_id} · ${s.department_id ?? ""}` : (s.course || fallbackProfileData.branch || ""),
            semester:      s.year ? `Session 2026–2027 · ${s.course ?? ""}` : (fallbackProfileData.semester || ""),
            created_at:    s.created_at || new Date().toISOString(),
            department_id: s.department_id || fallbackProfileData.department_id || "",
            course:        s.course || fallbackProfileData.course || "",
          });
          return true;
        }
      } catch (err) { }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE: LOOKUP — validate Application Number
  // ─────────────────────────────────────────────────────────────────────────────
  const onLookupAppNumber = async () => {
    const normalized = appNumber.trim().toUpperCase();
    if (normalized.length < 4) {
      toast.error("Please enter a valid Application Number.");
      return;
    }
    setPhase("OTP_SENDING"); // reuse sending state for the lookup spinner
    try {
      const result = await lookupInductionParticipant(normalized);
      if (!result.data || !result.data.found) {
        setPhase("NOT_FOUND");
        return;
      }
      const record = result.data;
      setInductionRecord(record);

      if (record.registration_status === "REGISTERED") {
        // Existing student — show OTP panel with "Welcome back" heading.
        // Do NOT navigate to /login. They will verify OTP → signInWithCustomToken → dashboard.
        setIsReturning(true);
      } else {
        setIsReturning(false);
      }
      setPhase("FAST_TRACK");
    } catch (err: any) {
      toast.error("Lookup failed: " + err.message);
      setPhase("LOOKUP");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE: OTP_SENDING — send OTP to induction record email
  // ─────────────────────────────────────────────────────────────────────────────
  const onFtSendOtp = async () => {
    if (!inductionRecord?.email) return;
    setPhase("OTP_SENDING");
    try {
      const response = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inductionRecord.email, type: "register" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send OTP");
      setOtpValue("");
      setPhase("OTP_ENTRY");
      toast.success("Verification code sent!");
    } catch (err: any) {
      toast.error(err.message || "Failed to send OTP.");
      setPhase("FAST_TRACK");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE: OTP_VERIFYING → AUTHENTICATING → (REGISTERING | LOADING_PROFILE)
  // ─────────────────────────────────────────────────────────────────────────────
  const onFtVerifyAndContinue = async () => {
    if (!otpValue || otpValue.length !== 6) {
      toast.error("Please enter the 6-digit code.");
      return;
    }
    setPhase("OTP_VERIFYING");
    try {
      // 1. Verify OTP
      const verifyRes = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inductionRecord.email, otp: otpValue }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || "Invalid OTP");

      const { customToken, regToken, userExists, enrollmentNo } = verifyData;
      setVerifiedCustomToken(customToken);
      if (enrollmentNo) setVerifiedEnrollmentNo(enrollmentNo);
      if (regToken) setVerifiedRegToken(regToken);

      // 2. Authenticate via Firebase immediately
      setPhase("AUTHENTICATING");
      const ok = await signInWithRetry(customToken);
      if (!ok) {
        setPhase("AUTH_ERROR");
        return;
      }

      // 3a. Existing user — profile already exists in Firestore
      if (userExists && enrollmentNo) {
        const found = await pollProfileAndSave(enrollmentNo, {
          full_name: inductionRecord.student_name,
        });
        if (found) {
          setPhase("LOADING_PROFILE");
        } else {
          setPhase("AUTH_ERROR");
          setAuthErrorMsg("Your account exists but we couldn't load your profile. Please try again.");
        }
        return;
      }

      // 3b. New user — register the induction student
      setPhase("REGISTERING");
      const emailUid = `email:${inductionRecord.email.toLowerCase().trim()}`;
      await registerInductionStudent(regToken, {
        application_number: inductionRecord.application_number,
        email:              inductionRecord.email,
        auth_uid:           emailUid,
      });

      const found = await pollProfileAndSave(inductionRecord.application_number, {
        full_name: inductionRecord.student_name,
        branch: inductionRecord.program || "",
        semester: `Session 2026–2027`,
        department_id: inductionRecord.school || "",
        course: inductionRecord.course || "",
      });

      if (found) {
        setPhase("LOADING_PROFILE");
      } else {
        setPhase("AUTH_ERROR");
        setAuthErrorMsg("Your account has been created successfully, but we're still preparing your profile. Please try again.");
      }
    } catch (err: any) {
      console.error("Fast-track OTP error:", err);
      toast.error(err.message || "Verification failed. Please try again.");
      setPhase("OTP_ENTRY");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTH_ERROR retry handler — user presses "Try Again"
  // ─────────────────────────────────────────────────────────────────────────────
  const onRetryAuth = async () => {
    const token = verifiedCustomToken || formCustomToken;
    const eno = verifiedEnrollmentNo || form.enrollment_no;
    
    if (!token || !eno) {
      setPhase("OTP_ENTRY");
      return;
    }
    setPhase("AUTHENTICATING");
    const ok = await signInWithRetry(token);
    if (!ok) {
      setPhase("AUTH_ERROR");
      return;
    }

    const found = await pollProfileAndSave(eno, {
      full_name: form.full_name || inductionRecord?.student_name,
      branch: form.branch || inductionRecord?.program || "",
      semester: `Session 2026–2027`,
      department_id: form.department_id || inductionRecord?.school || "",
      course: form.course || inductionRecord?.course || "",
    });

    if (found) {
      setPhase("LOADING_PROFILE");
    } else {
      setPhase("AUTH_ERROR");
      setAuthErrorMsg("We couldn't load your profile. Please try again.");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Full form — Email OTP send
  // ─────────────────────────────────────────────────────────────────────────────
  const onSendFormEmailOtp = async () => {
    if (!form.email) {
      toast.error("Please enter your email address first.");
      return;
    }
    setSendingEmailOtp(true);
    try {
      const response = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, type: "register" }),
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
      toast.error(err.message || "Failed to send OTP.");
    } finally {
      setSendingEmailOtp(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Full form — Email OTP verify
  // ─────────────────────────────────────────────────────────────────────────────
  const onVerifyFormEmailOtp = async () => {
    if (!emailOtp || emailOtp.length !== 6) {
      toast.error("Please enter the 6-digit OTP.");
      return;
    }
    setSendingEmailOtp(true);
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

      // If user already exists — sign them in immediately and go to dashboard.
      // NEVER navigate to /login from this file.
      if (data.userExists && data.enrollmentNo) {
        setEmailVerified(true);
        setVerifyingEmail(false);
        setEmailOtp("");
        setFormCustomToken(data.customToken);
        updateForm("enrollment_no", data.enrollmentNo);

        // Authenticate immediately
        setPhase("AUTHENTICATING");
        const ok = await signInWithRetry(data.customToken);
        if (!ok) {
          setPhase("FULL_FORM"); // restore form view so user can retry
          return;
        }

        const found = await pollProfileAndSave(data.enrollmentNo, {
          full_name: form.full_name
        });
        
        if (found) {
          setPhase("LOADING_PROFILE");
        } else {
          setPhase("AUTH_ERROR");
          setAuthErrorMsg("Your account exists but we couldn't load your profile. Please try again.");
        }
        return;
      }

      // New user — store tokens, mark email verified, let them complete the form
      setFormCustomToken(data.customToken);
      setFormRegToken(data.regToken);
      setEmailVerified(true);
      setVerifyingEmail(false);
      setEmailOtp("");
      // Return to full_form phase (no-op if already there)
      setPhase("FULL_FORM");
      toast.success("Email verified ✓");
    } catch (err: any) {
      toast.error(err.message || "Invalid OTP. Please try again.");
    } finally {
      setSendingEmailOtp(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Full form — submit registration
  // ─────────────────────────────────────────────────────────────────────────────
  const onSubmitFullForm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.full_name || !form.enrollment_no || !form.email || !form.phone || !form.department_id || !form.branch || !form.course) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (!form.agreeTerms || !form.agreePrivacy || !form.consentComms) {
      toast.error("Please accept all required agreements to continue.");
      return;
    }
    if (!emailVerified || !formRegToken) {
      toast.error("Please verify your email first using the 'Verify Email' button.");
      return;
    }

    setIsSubmitting(true);
    setPhase("REGISTERING");
    try {
      const emailUid = `email:${form.email.toLowerCase().trim()}`;
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
        auth_uid:      emailUid,
      };

      const res = await registerStudent({ data: profile, regToken: formRegToken! });
      if (!res.ok) throw new Error(res.error || "Failed to finalize registration.");

      // Sign in with the custom token received during email OTP verification
      if (formCustomToken) {
        setPhase("AUTHENTICATING");
        const ok = await signInWithRetry(formCustomToken);
        if (!ok) {
          // Auth failed after registration — show in-place error, never redirect to /login
          setPhase("AUTH_ERROR");
          setAuthErrorMsg("Your account was created but we couldn't sign you in automatically. Please use the Login page.");
          return;
        }
      }

      const found = await pollProfileAndSave(profile.enrollment_no, {
        full_name: profile.full_name,
        branch: `${profile.branch_id} · ${profile.deptName}`,
        semester: `Session 2026–2027 · ${profile.course}`,
        department_id: profile.department_id,
        course: profile.course,
      });
      
      if (found) {
        setPhase("LOADING_PROFILE");
      } else {
        setPhase("AUTH_ERROR");
        setAuthErrorMsg("Your account has been created successfully, but we're still preparing your profile. Please try again.");
      }
    } catch (err: any) {
      toast.error(err.message || "Registration failed. Please try again.");
      setPhase("FULL_FORM");
      setIsSubmitting(false);
    }
  };


  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: LOADING_PROFILE — animated progress (auto-navigates)
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === "LOADING_PROFILE") {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="orb orb-1" /><div className="orb orb-2" />
          <div className="orb orb-3" /><div className="orb orb-4" />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 panel-liquid-glass rounded-2xl p-10 shadow-glow text-center max-w-sm w-full mx-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </motion.div>

          <h2 className="text-2xl font-bold tracking-tight mb-2">
            Welcome to Aarambh 2026
          </h2>
          <p className="text-[14px] text-muted-foreground mb-8">
            Preparing your dashboard…
          </p>

          <div className="space-y-4">
            {[
              { label: "Creating Account",      delay: 0   },
              { label: "Syncing Student Profile", delay: 600 },
              { label: "Loading Dashboard",      delay: 1300 },
            ].map(({ label, delay }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: delay / 1000, duration: 0.35 }}
                className="flex items-center gap-3 text-[14px] font-medium"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: delay / 1000 + 0.2, type: "spring", stiffness: 400 }}
                  className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0"
                >
                  <Check className="h-3 w-3 text-emerald-500" />
                </motion.div>
                <span className="text-foreground/80">{label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: AUTHENTICATING — signing in spinner
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === "AUTHENTICATING" || phase === "REGISTERING") {
    const label = phase === "AUTHENTICATING" ? "Signing you in…" : "Creating your account…";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: AUTH_ERROR — never redirects away, offers retry
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === "AUTH_ERROR") {
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
              className="panel-liquid-glass rounded-2xl p-8 shadow-glow relative z-10 text-center space-y-6">
              <div className="w-14 h-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold mb-2">Couldn't Complete Sign In</h2>
                <p className="text-[14px] text-muted-foreground leading-relaxed">
                  We couldn't complete your sign in. This is usually a temporary issue.
                </p>
              </div>
              <Button
                onClick={onRetryAuth}
                variant="liquidGlassMaroon"
                className="w-full h-12 font-bold rounded-xl"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <button
                type="button"
                onClick={() => setPhase(inductionRecord ? "FAST_TRACK" : "LOOKUP")}
                className="text-[13px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
              >
                ← Start Over
              </button>
            </motion.div>
          </main>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: LOOKUP — Application Number gate
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === "LOOKUP" || phase === "OTP_SENDING" && !inductionRecord) {
    const isChecking = phase === "OTP_SENDING" && !inductionRecord;
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="orb orb-1" /><div className="orb orb-2" />
          <div className="orb orb-3" /><div className="orb orb-4" />
        </div>
        <div className="relative z-10">
          <SiteHeader />
          <main className="container mx-auto max-w-md px-4 py-8 sm:py-12">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="panel-liquid-glass rounded-2xl p-8 shadow-glow relative z-10">
              <div className="text-center mb-8">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                  <Search className="h-7 w-7" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Enter Your KRMU ID</h1>
                <p className="text-muted-foreground mt-2 text-[14px]">
                  Enter your Application Number to get started.
                </p>
              </div>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label className="text-sm font-semibold pl-1">Application Number *</Label>
                  <Input
                    value={appNumber}
                    onChange={(e) => setAppNumber(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onLookupAppNumber()}
                    placeholder="e.g. KRMU2639407"
                    className="h-12 text-[15px] uppercase bg-background/50 border-border/50 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                    disabled={isChecking}
                    autoFocus
                  />
                </div>
                <Button
                  onClick={onLookupAppNumber}
                  disabled={isChecking || appNumber.trim().length < 4}
                  className="w-full h-12 text-[15px] font-bold rounded-xl"
                  variant="liquidGlassMaroon"
                >
                  {isChecking
                    ? <><svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Checking...</>
                    : <>Continue <ArrowRight className="h-4 w-4 ml-1" /></>}
                </Button>
                <p className="text-center text-[13px] text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/login" className="text-primary hover:underline font-semibold">Sign in here</Link>
                </p>
              </div>
            </motion.div>
          </main>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: NOT_FOUND — application number not in system
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === "NOT_FOUND") {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" /><div className="orb orb-4" />
        </div>
        <div className="relative z-10 w-full">
          <SiteHeader />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[14px]"
          />
          <main className="container mx-auto max-w-md px-4 relative z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="panel-liquid-glass rounded-2xl p-8 shadow-glow text-center"
            >
              <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Admission Record Not Found</h3>
              <p className="text-[15px] text-muted-foreground mb-4">
                We couldn't find a fast-track admission record for Application No.{" "}
                <strong className="text-foreground">{appNumber.toUpperCase()}</strong>.
              </p>
              <p className="text-[14px] text-muted-foreground/80 mb-8">
                You can still register manually, but you will need to fill out all details.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => setPhase("LOOKUP")}
                  variant="outline"
                  className="flex-1 h-11 border-border/50 bg-background/50"
                >
                  Try Another Number
                </Button>
                <Button
                  onClick={() => setPhase("FULL_FORM")}
                  variant="liquidGlassMaroon"
                  className="flex-1 h-11"
                >
                  Register Manually
                </Button>
              </div>
            </motion.div>
          </main>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: FAST_TRACK / OTP_SENDING / OTP_ENTRY / OTP_VERIFYING
  // ─────────────────────────────────────────────────────────────────────────────
  if (
    (phase === "FAST_TRACK" ||
     phase === "OTP_SENDING" ||
     phase === "OTP_ENTRY" ||
     phase === "OTP_VERIFYING") &&
    inductionRecord
  ) {
    const isSendingOrVerifying = phase === "OTP_SENDING" || phase === "OTP_VERIFYING";
    const showOtpInput = phase === "OTP_ENTRY" || phase === "OTP_VERIFYING";

    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" /><div className="orb orb-4" />
        </div>
        <div className="relative z-10">
          <SiteHeader />
          <main className="container mx-auto max-w-md px-4 py-8 sm:py-12">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="panel-liquid-glass rounded-2xl p-8 shadow-glow relative z-10 space-y-6">

              {/* Student record banner */}
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <span className="text-[14px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Admission Record Found
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{inductionRecord.student_name}</span>
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{inductionRecord.masked_email}</span>
                  <span className="text-muted-foreground">Mobile</span>
                  <span className="font-medium">{inductionRecord.masked_mobile}</span>
                  <span className="text-muted-foreground">Course</span>
                  <span className="font-medium">{inductionRecord.course}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight text-center">
                  {isReturning ? "Welcome Back! Verify Your Identity" : "Verify Your Identity"}
                </h2>
                <p className="text-center text-[14px] text-muted-foreground">
                  {isReturning
                    ? "Verify your email to access your dashboard."
                    : "We'll send a verification code to your registered email."}
                </p>
              </div>

              {!showOtpInput ? (
                <Button
                  onClick={onFtSendOtp}
                  disabled={isSendingOrVerifying}
                  className="w-full h-12 text-[15px] font-bold rounded-xl"
                  variant="liquidGlassMaroon"
                >
                  {isSendingOrVerifying
                    ? <><svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending...</>
                    : "Send Verification Code"}
                </Button>
              ) : (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-4">
                  <p className="text-[13px] text-foreground/70 text-center">
                    Enter the 6-digit code sent to{" "}
                    <span className="font-semibold">{inductionRecord.masked_email}</span>.{" "}
                    <span className="text-yellow-600 dark:text-yellow-500">Check spam if not received.</span>
                  </p>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && otpValue.length === 6 && onFtVerifyAndContinue()}
                    placeholder="——————"
                    autoFocus
                    disabled={phase === "OTP_VERIFYING"}
                    className="text-center text-xl tracking-[0.5em] font-mono h-12 bg-background/80 border-border/60 rounded-xl focus-visible:ring-primary/30"
                  />
                  <Button
                    onClick={onFtVerifyAndContinue}
                    disabled={otpValue.length !== 6 || phase === "OTP_VERIFYING"}
                    className="w-full h-12 text-[15px] font-bold rounded-xl"
                    variant="liquidGlassMaroon"
                  >
                    {phase === "OTP_VERIFYING"
                      ? <><svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Verifying...</>
                      : isReturning ? "Verify & Sign In" : "Verify & Activate Account"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setPhase("FAST_TRACK"); setOtpValue(""); }}
                    className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
                  >
                    Resend code
                  </button>
                </motion.div>
              )}

              <button
                type="button"
                onClick={() => { setPhase("LOOKUP"); setInductionRecord(null); setIsReturning(false); setOtpValue(""); }}
                className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to Application Number lookup
              </button>
            </motion.div>
          </main>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: FULL_FORM — manual registration form
  // ─────────────────────────────────────────────────────────────────────────────
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

            {/* Left Column — Value Prop */}
            <div className="lg:col-span-5 lg:sticky lg:top-32 hidden lg:flex flex-col gap-8 rounded-[2rem] p-10 shadow-2xl border border-amber-500/20 bg-gradient-to-br from-background via-background to-amber-500/5 backdrop-blur-xl relative overflow-hidden">
               <div className="absolute -top-32 -right-32 w-80 h-80 bg-amber-500/20 rounded-full blur-[100px] pointer-events-none" />
               <div className="absolute top-1/2 -left-32 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none" />
               <div className="absolute -bottom-20 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none" />
               <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMTgyLCAzNCwgNTEsIDAuMDUpIi8+PC9zdmc+')] [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none" />

               <div className="relative z-10">
                 <h2 className="text-[2.75rem] font-extrabold tracking-tight text-foreground leading-[1.15] text-balance">Claim Your<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-600">Identity</span></h2>
                 <p className="mt-5 text-muted-foreground text-[16px] leading-[1.65] max-w-[92%] text-pretty font-medium">
                   Welcome to the AARAMBH 2026 portal. Complete your verified registration to unlock exclusive access to the entire induction experience.
                 </p>
               </div>

               <div className="relative z-10 grid gap-8 mt-7">
                  {([
                    { icon: Ticket,   title: "Dashboard",       desc: "Secure your student dashboard for frictionless campus entry and check-ins." },
                    { icon: QrCode,   title: "QR Attendance",   desc: "Experience lightning-fast event check-ins straight from your mobile device." },
                    { icon: Sparkles, title: "Exclusive Access", desc: "Gain immediate, verified access to premium clubs and networking events." },
                  ] as const).map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex gap-5 group">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-background border border-primary/20 shadow-[0_4px_20px_rgba(var(--primary-rgb),0.15)] group-hover:scale-105 group-hover:shadow-[0_4px_25px_rgba(var(--primary-rgb),0.25)] transition-all duration-300">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="pt-0.5">
                        <h3 className="font-bold text-foreground text-[16px] tracking-tight">{title}</h3>
                        <p className="text-[14px] text-muted-foreground mt-1.5 leading-relaxed pr-2 text-pretty">{desc}</p>
                      </div>
                    </div>
                  ))}
               </div>

               <div className="mt-8 relative z-10 p-6 rounded-2xl bg-primary/[0.03] border border-primary/10 shadow-inner">
                  <p className="text-[15px] text-foreground/80 leading-relaxed italic text-center font-medium">
                    "The future belongs to those who prepare for it today."
                  </p>
               </div>
            </div>

            {/* Right Column — Form */}
            <div className="lg:col-span-7">
               {/* Mobile Header */}
               <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center lg:hidden mb-8">
                 <h1 className="text-3xl font-extrabold tracking-tight">Claim Your Identity</h1>
                 <p className="mt-3 text-[15px] text-muted-foreground">Takes about 30 seconds. Required for QR attendance.</p>
               </motion.div>

               <form onSubmit={onSubmitFullForm} className="rounded-3xl sm:rounded-[2rem] panel-liquid-glass p-6 sm:p-12 shadow-glow border border-border/40 relative z-10 bg-background/70 backdrop-blur-2xl">
                 <div className="space-y-8 sm:space-y-10">

                   {/* Section 1 — Personal Identity */}
                   <div className="space-y-6">
                     <div className="flex items-center gap-3 border-b border-border/30 pb-3">
                       <div className="h-6 w-1.5 rounded-full bg-primary" />
                       <div>
                         <h3 className="font-bold text-xl tracking-tight">1. Personal Identity</h3>
                         <p className="text-sm text-muted-foreground mt-0.5">Tell us who you are.</p>
                       </div>
                     </div>

                     <Field label="Full Name *">
                       <IconInput icon={User} required minLength={2} value={form.full_name}
                         onChange={(e: any) => updateForm("full_name", e.target.value)} placeholder="e.g. Aarav Sharma" />
                     </Field>

                     <div className="grid gap-6 sm:grid-cols-2">
                       <Field label="Application Number *">
                         <IconInput icon={Hash} required value={form.enrollment_no}
                           onChange={(e: any) => updateForm("enrollment_no", e.target.value)}
                           placeholder="e.g. KRMU24CS0001" className="uppercase" />
                       </Field>
                       <Field label="Phone Number *">
                         <IconInput icon={Phone} type="tel" required minLength={10} value={form.phone}
                           onChange={(e: any) => updateForm("phone", e.target.value)} placeholder="+91 9xxxxxxxxx" />
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
                                   onChange={(e) => updateFormEmail(e.target.value)}
                                   placeholder="you@example.com"
                                   disabled={verifyingEmail || sendingEmailOtp}
                                   className="pl-10 h-12 text-[15px] bg-background/50 border-border/50 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                                 />
                               </div>
                               <button
                                 type="button"
                                 onClick={verifyingEmail ? onVerifyFormEmailOtp : onSendFormEmailOtp}
                                 disabled={sendingEmailOtp || !form.email}
                                 className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 h-12 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-sm"
                               >
                                 {sendingEmailOtp ? (
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
                                     onKeyDown={(e) => e.key === "Enter" && emailOtp.length === 6 && onVerifyFormEmailOtp()}
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
                       <div>
                         <h3 className="font-bold text-xl tracking-tight">2. Academic Profile</h3>
                         <p className="text-sm text-muted-foreground mt-0.5">Help us identify your programme.</p>
                       </div>
                     </div>

                     <div className="grid gap-6 sm:grid-cols-2">
                       <Field label="School *">
                         <div className="relative flex items-center w-full min-w-0">
                           <div className="absolute left-3 flex h-full items-center justify-center text-muted-foreground z-10 pointer-events-none">
                             <Building2 className="h-[18px] w-[18px]" />
                           </div>
                           <Select value={form.department_id} onValueChange={(v) => updateForm("department_id", v)}>
                             <SelectTrigger className="pl-10 h-12 text-[15px] bg-background/50 border-border/50 focus:ring-primary/20 [&>span]:truncate"><SelectValue placeholder="Select school" /></SelectTrigger>
                             <SelectContent>
                               {SCHOOLS.map((s) => (
                                 <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
                           <Select value={form.branch} onValueChange={(v) => updateForm("branch", v)} disabled={!form.department_id}>
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
                         <IconInput icon={BookOpen} required value={form.course} onChange={(e: any) => updateForm("course", e.target.value)} placeholder="e.g. B.Tech CSE" />
                       </Field>
                       <Field label="Session *">
                         <div className="relative flex items-center w-full min-w-0">
                           <div className="absolute left-3 flex h-full items-center justify-center text-muted-foreground z-10 pointer-events-none">
                             <Calendar className="h-[18px] w-[18px]" />
                           </div>
                           <Select value={form.year} onValueChange={(v) => updateForm("year", v)}>
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
                     <CustomCheckbox required checked={form.agreeTerms} onChange={(v: boolean) => updateForm("agreeTerms", v)}>
                       I agree to the <Link to="/terms" className="text-primary hover:underline font-bold">Terms of Service</Link>
                     </CustomCheckbox>
                     <CustomCheckbox required checked={form.agreePrivacy} onChange={(v: boolean) => updateForm("agreePrivacy", v)}>
                       I agree to the <Link to="/privacy" className="text-primary hover:underline font-bold">Privacy Policy</Link>
                     </CustomCheckbox>
                     <CustomCheckbox required checked={form.consentComms} onChange={(v: boolean) => updateForm("consentComms", v)}>
                       I consent to receiving official induction communications
                     </CustomCheckbox>
                   </div>

                   <Button
                     type="submit"
                     variant="liquidGlassMaroon"
                     size="lg"
                     disabled={isSubmitting}
                     className="w-full h-14 mt-4 text-[17px] rounded-2xl font-extrabold shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-300 group"
                   >
                     {isSubmitting ? (
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
