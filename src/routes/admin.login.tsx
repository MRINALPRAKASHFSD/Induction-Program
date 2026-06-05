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
    <div className="min-h-screen relative flex items-center justify-center px-4 overflow-hidden">
      {/* Background Elements */}
      <div className="bg-hero-premium absolute inset-0 -z-10" />
      
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
        <div className="hero-ring hero-ring-1" />
        <div className="hero-ring hero-ring-2" />
        <div className="hero-ring hero-ring-3" />
        <div className="hero-particle hp1" /><div className="hero-particle hp2" />
        <div className="hero-particle hp3" /><div className="hero-particle hp4" />
      </div>

      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj4KICA8ZmlsdGVyIGlkPSJub2lzZSI+CiAgICA8ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44NSIgbnVtT2N0YXZlcz0iMyIgc3RpdGNoVGlsZXM9InN0aXRjaCIgLz4KICAgIDxmZUNvbG9yTWF0cml4IHR5cGU9Im1hdHJpeCIgdmFsdWVzPSIxIDAgMCAwIDAgIDAgMSAwIDAgMCAgMCAwIDEgMCAwICAwIDAgMCAwLjA4IDAiIC8+ICAKICA8L2ZpbHRlcj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2UpIiAvPgo8L3N2Zz4=')] opacity-40 mix-blend-multiply pointer-events-none -z-10" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Card */}
        <motion.div
          animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="glass-card-hero p-8"
        >
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/50 text-[#8a4a22] shadow-sm ring-1 ring-inset ring-[#8a4a22]/20 mb-4">
              <Shield className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-[#2c1208]">Admin Portal</h1>
            <p className="text-sm text-[#7a4020]/70 mt-1">KRMU Induction 2026</p>
          </div>

          {/* Form */}
          <form onSubmit={onLogin} className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="admin-password" className="flex items-center gap-1.5 text-[#5a2c14] font-semibold">
                <Lock className="h-3.5 w-3.5" />
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
                  className="pr-10 bg-white/70 border-[#8a4a22]/20 focus-visible:ring-[#8a4a22]/40 shadow-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a4a22]/60 hover:text-[#8a4a22] transition-colors"
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
              className="h-12 mt-2 rounded-full font-bold shadow-md"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Verifying…
                </span>
              ) : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-[#7a4020]/60 font-medium">
            Default: <code className="bg-white/40 px-1.5 py-0.5 rounded font-mono border border-[#8a4a22]/10">krmu@admin2024</code>
          </p>
        </motion.div>

        <p className="text-center text-[11px] text-[#7a4020]/50 mt-6 font-medium uppercase tracking-widest">
          KRMU Induction Management System
        </p>
      </motion.div>
    </div>
  );
}
