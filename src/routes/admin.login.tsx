import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Shield, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Admin Login · KRMU Induction" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLogin,
});

// ── Local credential store ──────────────────────────────────────────────────
// Default password is "krmu@admin2024". Admin can change it from settings.
// We hash with a simple digest so the plain text isn't in localStorage.
const ADMIN_KEY = "krmu_admin_password_hash";
const DEFAULT_HASH = "7a3f8b2e1c4d9f0e6a5b3c7d2e8f1a4b"; // krmu@admin2024

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  // Convert to hex-like string
  return Math.abs(hash).toString(16).padStart(8, "0") + str.length.toString(16);
}

function getStoredHash(): string {
  return localStorage.getItem(ADMIN_KEY) || DEFAULT_HASH;
}

function checkPassword(password: string): boolean {
  const storedHash = getStoredHash();
  // First-time: default hash is the magic string; also check actual hash
  if (storedHash === DEFAULT_HASH) {
    return password === "krmu@admin2024";
  }
  return simpleHash(password) === storedHash;
}

const SESSION_KEY = "krmu_admin_session";

export function setAdminSession() {
  sessionStorage.setItem(SESSION_KEY, "authenticated");
}

export function clearAdminSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ── Component ───────────────────────────────────────────────────────────────
function AdminLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    // Simulate a tiny delay so it feels intentional
    setTimeout(() => {
      if (checkPassword(password)) {
        setAdminSession();
        toast.success("Welcome back 👋");
        navigate({ to: "/admin/dashboard" });
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 500);
        toast.error("Incorrect password");
      }
      setBusy(false);
    }, 400);
  };

  return (
    <div className="min-h-screen grid place-items-center bg-hero px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Card */}
        <motion.div
          animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="rounded-2xl bg-card p-8 shadow-elegant border border-border/60"
        >
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-hero text-primary-foreground shadow-elegant mb-4">
              <Shield className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold">Admin Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">KRMU Induction 2024</p>
          </div>

          {/* Form */}
          <form onSubmit={onLogin} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="admin-password" className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                Admin Password
              </Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={show ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="liquidGlassDark"
              size="lg"
              disabled={busy || !password}
              className="h-11 mt-1 rounded-full font-semibold"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Verifying…
                </span>
              ) : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Default: <code className="bg-muted px-1 py-0.5 rounded font-mono">krmu@admin2024</code>
          </p>
        </motion.div>

        <p className="text-center text-xs text-white/50 mt-4">
          KRMU Induction Management System
        </p>
      </motion.div>
    </div>
  );
}
