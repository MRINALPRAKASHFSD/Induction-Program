import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localDb } from "@/lib/local-db";
import { Label } from "@/components/ui/label";
import { lookupStudent } from "@/lib/students.functions";
import { auth } from "@/lib/firebase/config";
import { signInWithCustomToken } from "firebase/auth";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import {
  Mail,
  ShieldCheck, Check, Ticket, QrCode, Sparkles, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In · KRMU Induction" },
      { name: "description", content: "Sign in or register for KRMU Induction in seconds." },
    ],
  }),
  component: LoginPage,
});

type Step = "email" | "otp";

function LoginPage() {
  const navigate = useNavigate();
  // If Firebase session already exists, redirect to dashboard immediately.
  // Students should never see the login page again once authenticated.
  const { loading: loadingAuth } = useAuthRedirect({ redirectIfAuthenticated: "/my-pass" });

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Show a minimal loading state while Firebase resolves the session.
  // This prevents a flash of the login form before the redirect fires.
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-sm text-muted-foreground font-medium">Checking your session…</p>
        </div>
      </div>
    );
  }

  const onSendOtp = async () => {
    if (!email) { toast.error("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address."); return;
    }
    setSendingOtp(true);
    try {
      const response = await fetch("/api/send-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "login" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send OTP.");
      setStep("otp");
      toast.success("Verification code sent! Check your inbox (and spam folder).");
    } catch (err: any) {
      toast.error(err.message || "Failed to send code. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  const onVerifyOtp = async () => {
    if (!otp || otp.length !== 6) { toast.error("Please enter the 6-digit code."); return; }
    setVerifyingOtp(true);
    try {
      const response = await fetch("/api/verify-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Invalid code.");

      const { customToken: token, userExists, enrollmentNo } = data;

      if (userExists && enrollmentNo) {
        // Existing user — sign them in and take them to their pass
        await signInWithCustomToken(auth, token);
        const lookupRes = await lookupStudent({ data: { enrollment_no: enrollmentNo } });
        if (lookupRes.student) {
          const s = lookupRes.student as any;
          localDb.saveStudentProfile({
            id: s.id,
            full_name: s.full_name,
            enrollment_no: s.enrollment_no,
            branch: s.branch_id ? `${s.branch_id} · ${s.department_id ?? ""}` : (s.course || ""),
            semester: s.semester ? `Semester ${s.semester}` : (s.year ? `Session 2026–2027 · ${s.course ?? ""}` : ""),
            created_at: s.created_at || new Date().toISOString(),
            department_id: s.department_id,
          });
        }
        toast.success("Welcome back!");
        navigate({ to: "/my-pass" });
      } else {
        // New user — send them to the full registration form
        toast.success("Email verified! Please complete your registration.");
        navigate({ to: "/register" });
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed. Please try again.");
    } finally {
      setVerifyingOtp(false);
    }
  };


  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="orb orb-1" /><div className="orb orb-2" />
        <div className="orb orb-3" /><div className="orb orb-4" />
      </div>
      <div className="relative z-10 flex flex-col min-h-screen">
        <SiteHeader />
        <main className="container mx-auto max-w-6xl px-4 py-8 sm:py-12 flex-1">
          <div className="grid gap-12 lg:grid-cols-12 items-start">

            {/* Left: Value Prop */}
            <div className="lg:col-span-5 lg:sticky lg:top-32 hidden lg:flex flex-col gap-8 rounded-[2rem] p-10 shadow-2xl border border-primary/20 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-xl relative overflow-hidden">
              <div className="absolute -top-32 -right-32 w-80 h-80 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
              <div className="absolute top-1/2 -left-32 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />
              <div className="absolute -bottom-20 right-0 w-72 h-72 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
              <div className="relative z-10">
                <h2 className="text-[2.75rem] font-extrabold tracking-tight text-foreground leading-[1.15] text-balance">
                  <span>Sign In to</span><br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-600">AARAMBH 2026</span>
                </h2>
                <p className="mt-5 text-muted-foreground text-[16px] leading-[1.65] max-w-[92%] text-pretty font-medium">
                  Welcome back. Enter your personal email to receive a one-time code and sign in instantly.
                </p>
              </div>
              <div className="relative z-10 grid gap-8 mt-7">
                {([
                  { icon: Ticket,   title: "Dashboard",  desc: "Secure your student dashboard for frictionless campus entry." },
                  { icon: QrCode,   title: "QR Attendance",       desc: "Lightning-fast event check-ins from your mobile device." },
                  { icon: Sparkles, title: "Exclusive Access",    desc: "Verified access to premium clubs and networking events." },
                ] as const).map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex gap-5 group">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-background border border-primary/20 shadow-[0_4px_20px_rgba(var(--primary-rgb),0.15)] group-hover:scale-105 transition-all duration-300">
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

            {/* Right: Form */}
            <div className="lg:col-span-7">
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center lg:hidden mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight">Sign In</h1>
                <p className="mt-3 text-[15px] text-muted-foreground">Use your personal email to get started.</p>
              </motion.div>

              <AnimatePresence mode="wait">

                {/* Email + OTP step */}
                {(step === "email" || step === "otp") && (
                  <motion.div key="email-otp" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                    className="rounded-3xl sm:rounded-[2rem] panel-liquid-glass p-5 sm:p-10 shadow-glow border border-primary/10 relative z-10 bg-background/70 backdrop-blur-2xl">
                    <div className="space-y-8">
                      {/* Step progress dots */}
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step === "otp" ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"}`}>
                          {step === "otp" ? <Check className="w-4 h-4" /> : "1"}
                        </div>
                        <div className={`h-0.5 flex-1 transition-all ${step === "otp" ? "bg-primary" : "bg-border/40"}`} />
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step === "otp" ? "bg-primary text-primary-foreground" : "bg-border/30 text-muted-foreground"}`}>2</div>
                        <div className="h-0.5 flex-1 bg-border/40" />
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold bg-border/30 text-muted-foreground">3</div>
                      </div>

                      {/* Email field */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 border-b border-border/30 pb-3">
                          <div className="h-6 w-1.5 rounded-full bg-primary" />
                          <h3 className="font-bold text-xl tracking-tight">Your Email Address</h3>
                        </div>
                        <div className="grid gap-2.5">
                          <Label className="text-sm font-semibold text-foreground/90">Personal Email</Label>
                          <div className="relative flex items-center">
                            <div className={`absolute left-3 flex h-full items-center text-muted-foreground transition-colors ${step === "otp" ? "text-emerald-500" : ""}`}>
                              <Mail className="h-[18px] w-[18px]" />
                            </div>
                            <Input
                              type="email"
                              value={email}
                              onChange={(e) => { if (step === "email") setEmail(e.target.value); }}
                              onKeyDown={(e) => e.key === "Enter" && step === "email" && onSendOtp()}
                              placeholder="you@example.com"
                              disabled={step === "otp"}
                              className={`pl-10 h-12 text-[15px] bg-background/50 border-border/50 transition-all ${step === "otp" ? "border-emerald-500/50 bg-emerald-500/5 text-foreground/80" : "focus-visible:border-primary/50 focus-visible:ring-primary/20"}`}
                            />
                            {step === "otp" && (
                              <div className="absolute right-3 flex items-center gap-1.5 text-emerald-500 text-[13px] font-semibold">
                                <ShieldCheck className="w-3.5 h-3.5" /> Verified
                              </div>
                            )}
                          </div>
                          {step === "email" && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 font-medium">
                              <ShieldCheck className="w-3.5 h-3.5 text-primary/70" />
                              Use any personal email. A 6-digit code will be sent to verify it.
                            </p>
                          )}
                        </div>
                        {step === "email" && (
                          <Button type="button" variant="liquidGlassMaroon" size="lg"
                            disabled={sendingOtp || !email} onClick={onSendOtp}
                            className="w-full h-12 rounded-2xl font-bold text-[16px]">
                            {sendingOtp ? (
                              <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                Sending Code…
                              </span>
                            ) : (
                              <span className="flex items-center gap-2">Send Verification Code <ArrowRight className="h-4 w-4" /></span>
                            )}
                          </Button>
                        )}
                      </div>

                      {/* OTP field */}
                      <AnimatePresence>
                        {step === "otp" && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }} className="overflow-hidden space-y-4">
                            <div className="flex items-center gap-3 border-b border-border/30 pb-3">
                              <div className="h-6 w-1.5 rounded-full bg-primary" />
                              <h3 className="font-bold text-xl tracking-tight">Enter Verification Code</h3>
                            </div>
                            <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 relative overflow-hidden shadow-inner">
                              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/40 to-transparent" />
                              <p className="text-[13px] text-foreground/80 leading-relaxed">
                                Enter the 6-digit code sent to <span className="font-bold text-foreground">{email}</span>.
                                <br />
                                <span className="text-yellow-600 dark:text-yellow-500 font-medium inline-block mt-0.5">
                                  Check your spam/junk folder if you don't see it within a minute.
                                </span>
                              </p>
                              <div className="flex items-center gap-3">
                                <Input
                                  type="text" inputMode="numeric" maxLength={6} value={otp}
                                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                                  onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && onVerifyOtp()}
                                  placeholder="------"
                                  className="text-center text-2xl tracking-[0.6em] font-mono h-14 bg-background/80 border-border/60 flex-1 shadow-sm focus-visible:ring-primary/30 rounded-xl"
                                  autoFocus
                                />
                                <button type="button" onClick={onVerifyOtp} disabled={verifyingOtp || otp.length !== 6}
                                  className="inline-flex items-center justify-center gap-2 text-[15px] font-bold px-6 h-14 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-md shadow-primary/20">
                                  {verifyingOtp
                                    ? <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                    : "Confirm"}
                                </button>
                              </div>
                              <button type="button" onClick={() => { setStep("email"); setOtp(""); }}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors self-start font-medium underline underline-offset-4">
                                Change email address
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}

                {/* Sign up prompt */}
                <div className="mt-6 text-center text-[13px] text-muted-foreground">
                  New student?{" "}
                  <Link to="/register" className="text-primary hover:underline font-semibold">
                    Register here
                  </Link>
                </div>

              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
