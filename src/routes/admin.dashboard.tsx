import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Users, QrCode, Sparkles, LogOut, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useLiveCount } from "@/hooks/use-live-count";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard · KRMU Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminDashboard,
});

type Row = {
  id: string;
  full_name: string;
  enrollment_no: string;
  created_at: string;
};

function AdminDashboard() {
  const { userId, loading } = useSession();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [recent, setRecent] = useState<Row[]>([]);
  const students = useLiveCount("students");
  const scans = useLiveCount("attendance");
  const clubs = useLiveCount("club_registrations");
  const events = useLiveCount("events");

  useEffect(() => {
    if (loading) return;
    if (!userId) { navigate({ to: "/admin/login" }); return; }
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const roles = (data ?? []).map((r) => r.role);
      setAllowed(roles.includes("admin") || roles.includes("coordinator"));
    })();
  }, [userId, loading, navigate]);

  useEffect(() => {
    if (!allowed) return;
    const load = async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, enrollment_no, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      setRecent((data ?? []) as Row[]);
    };
    load();
    const ch = supabase
      .channel("recent-students")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "students" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [allowed]);

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
            Your account exists but doesn't have an admin or coordinator role yet. Ask a super-admin to grant access.
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
          <Link to="/admin/dashboard" className="font-semibold">KRMU Admin</Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/">View site</Link></Button>
            <Button onClick={signOut} variant="outline" size="sm"><LogOut className="mr-1 h-4 w-4" /> Sign out</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold">Live dashboard</h1>
          <p className="text-muted-foreground">Real-time numbers across the induction.</p>
        </motion.div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={Users} label="Students registered" value={students} accent="from-primary to-primary-glow" />
          <Kpi icon={QrCode} label="Total QR scans" value={scans} accent="from-accent to-primary-glow" />
          <Kpi icon={Sparkles} label="Club joins" value={clubs} accent="from-chart-4 to-success" />
          <Kpi icon={Calendar} label="Events live" value={events} accent="from-chart-3 to-primary" />
        </div>

        <section className="mt-10 rounded-2xl border bg-card-soft p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Live registration feed</h2>
              <p className="text-sm text-muted-foreground">Newest students appear instantly.</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              live
            </div>
          </div>
          <div className="mt-4 divide-y">
            {recent.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No registrations yet.</p>}
            {recent.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <div className="font-medium">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground">{s.enrollment_no}</div>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleTimeString()}</div>
              </motion.div>
            ))}
          </div>
        </section>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Activity className="mr-1 inline h-4 w-4" />
          Event management, student database, analytics, and CSV exports ship in Phase 2.
        </p>
      </main>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, accent,
}: { icon: typeof Users; label: string; value: number | null; accent: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${accent} text-primary-foreground shadow-sm`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums">{value ?? "—"}</div>
    </motion.div>
  );
}
