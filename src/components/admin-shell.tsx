import { Link, useNavigate, Navigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, Calendar, Users, Sparkles, BarChart3, Activity, LogOut, Menu, X, ScanLine, ShieldCheck, Bell } from "lucide-react";
// Supabase auth is bypassed — using local session flag instead
import { useSession } from "@/hooks/use-session";
import { auth } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Only render on the client — avoids SSR hydration mismatch with auth state
const isClient = typeof window !== 'undefined';

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/scanner", label: "QR Scanner", icon: ScanLine },
  { to: "/admin/events", label: "Events", icon: Calendar },
  { to: "/admin/students", label: "Students", icon: Users },
  { to: "/admin/clubs", label: "Clubs", icon: Sparkles },
  { to: "/admin/announcements", label: "Announcements", icon: Bell },
  { to: "/admin/documents", label: "Documents", icon: ShieldCheck },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/activity", label: "Activity", icon: Activity },
] as const;

export function AdminShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { userId, loading } = useSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const signOutAdmin = async () => {
    try {
      await auth.signOut();
      navigate({ to: "/admin/login" });
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 bg-background">
        <div className="max-w-7xl mx-auto space-y-8">
          <Skeleton className="h-12 w-64" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (!userId) {
    return <Navigate to="/admin/login" />;
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      {/* Background Elements */}
      <div className="bg-hero-premium fixed inset-0 -z-10" />
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="orb orb-1 opacity-50" />
        <div className="orb orb-2 opacity-50" />
        <div className="orb orb-3 opacity-40" />
        <div className="hero-ring hero-ring-1 opacity-40" />
        <div className="hero-ring hero-ring-2 opacity-40" />
      </div>
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj4KICA8ZmlsdGVyIGlkPSJub2lzZSI+CiAgICA8ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44NSIgbnVtT2N0YXZlcz0iMyIgc3RpdGNoVGlsZXM9InN0aXRjaCIgLz4KICAgIDxmZUNvbG9yTWF0cml4IHR5cGU9Im1hdHJpeCIgdmFsdWVzPSIxIDAgMCAwIDAgIDAgMSAwIDAgMCAgMCAwIDEgMCAwICAwIDAgMCAwLjA4IDAiIC8+ICAKICA8L2ZpbHRlcj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2UpIiAvPgo8L3N2Zz4=')] opacity-30 mix-blend-multiply pointer-events-none -z-10" />

      <header className="sticky top-0 z-30 panel-liquid-glass">
        <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-[#5a2c14] hover:text-[#2c1208]" onClick={() => setOpen((o) => !o)} aria-label="Toggle nav">
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <Link to="/admin/dashboard" className="font-bold text-xl text-[#2c1208] tracking-tight flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#8a4a22]" />
              KRMU Admin
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="liquidGlassWhite" size="sm" className="rounded-full shadow-sm"><Link to="/">View site</Link></Button>
            <Button onClick={signOutAdmin} variant="liquidGlassDark" size="sm" className="rounded-full shadow-sm"><LogOut className="mr-1.5 h-4 w-4" /> Sign out</Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto flex max-w-7xl gap-8 px-4 py-8 relative z-10">
        <aside className={`${open ? "block" : "hidden"} lg:block w-full lg:w-64 shrink-0`}>
          <div className="flex flex-col gap-5 sticky top-24">
            <nav className="grid gap-1.5 glass-card-hero p-3.5">
              {NAV.map(({ to, label, icon: Icon }) => {
                const active = path === to;
                return (
                  <Link
                    key={to} to={to} onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition-all ${
                      active 
                        ? "bg-[#3c1608] text-white shadow-md" 
                        : "text-[#7a4020] hover:bg-white/50 hover:text-[#2c1208]"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? "text-white" : "text-[#8a4a22]"}`} /> {label}
                  </Link>
                );
              })}
            </nav>

            {/* Privacy & Copyright Block */}
            <div className="glass-card-hero p-5">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="h-4 w-4 text-[#8a4a22]" />
                <h4 className="text-[11px] font-bold text-[#2c1208] uppercase tracking-[0.15em]">Privacy First</h4>
              </div>
              <p className="text-xs leading-relaxed text-[#7a4020]/90 font-medium">
                Admin data is encrypted. Student records are confidential and used strictly for induction operations. Zero tracking.
              </p>
              <div className="mt-4 pt-4 border-t border-[#8a4a22]/15">
                <p className="text-[10px] font-semibold text-[#7a4020]/70 uppercase tracking-wider">
                  &copy; {new Date().getFullYear()} KRMU.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-8">
            <h1 className="text-3xl font-bold sm:text-4xl text-[#2c1208] tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-base text-[#7a4020]/80 font-medium">{subtitle}</p>}
          </div>
          <div className="glass-card-hero p-6 sm:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
