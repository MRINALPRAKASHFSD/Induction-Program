import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, Calendar, Users, Sparkles, BarChart3, Activity, LogOut, Menu, X, ScanLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
    if (loading) return;
    if (!userId) { navigate({ to: "/admin/login" }); return; }
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const roles = (data ?? []).map((r) => r.role);
      setAllowed(roles.includes("admin") || roles.includes("coordinator"));
    })();
  }, [userId, loading, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login" });
  };

  if (loading || allowed === null) {
    return (
      <div className="min-h-screen p-8">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4 text-center">
        <div>
          <h1 className="text-2xl font-bold">Awaiting role assignment</h1>
          <p className="mt-2 max-w-md text-muted-foreground">
            Ask a super-admin to grant you an admin or coordinator role.
          </p>
          <Button className="mt-6" onClick={signOut}>Sign out</Button>
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
            <Button asChild variant="ghost" size="sm"><Link to="/">View site</Link></Button>
            <Button onClick={signOut} variant="outline" size="sm"><LogOut className="mr-1 h-4 w-4" /> Sign out</Button>
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
