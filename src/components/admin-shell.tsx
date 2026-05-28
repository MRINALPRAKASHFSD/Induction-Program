import { Link, useNavigate, Navigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, Calendar, Users, Sparkles, BarChart3, Activity, LogOut, Menu, X, ScanLine } from "lucide-react";
// Supabase auth is bypassed — using local session flag instead
import { useSession } from "@/hooks/use-session";
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
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/activity", label: "Activity", icon: Activity },
] as const;

export function AdminShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { userId, loading } = useSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !userId) return;
    // Grant access to any authenticated user
    setAllowed(true);
  }, [userId, loading]);

  const signOut = () => {
    sessionStorage.removeItem("krmu_admin_session");
    navigate({ to: "/admin/login" });
  };

  // On the server (SSR), render nothing — auth state is client-only
  if (!isClient) return null;

  if (loading || allowed === null) {
    return (
      <div className="min-h-screen p-8">
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

  if (!allowed) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4 text-center">
        <div>
          <h1 className="text-2xl font-bold">Awaiting role assignment</h1>
          <p className="mt-2 max-w-md text-muted-foreground">
            Ask a super-admin to grant you an admin or coordinator role.
          </p>
          <Button variant="liquidGlassDark" className="mt-6 rounded-full" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle nav">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link to="/admin/dashboard" className="font-semibold">KRMU Admin</Link>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="liquidGlass" size="sm" className="rounded-full"><Link to="/">View site</Link></Button>
            <Button onClick={signOut} variant="liquidGlassDark" size="sm" className="rounded-full"><LogOut className="mr-1 h-4 w-4" /> Sign out</Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className={`${open ? "block" : "hidden"} lg:block w-full lg:w-56 shrink-0`}>
          <nav className="grid gap-1 rounded-xl border bg-card p-2 shadow-sm">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = path === to;
              return (
                <Link
                  key={to} to={to} onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-6">
            <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
