import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, QrCode, Sparkles, Calendar } from "lucide-react";
import { useLiveCount } from "@/hooks/use-live-count";
import { AdminShell } from "@/components/admin-shell";
import { localDb, type LocalStudent } from "@/lib/local-db";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard · KRMU Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const [recent, setRecent] = useState<LocalStudent[]>([]);
  const students = useLiveCount("students");
  const scans = useLiveCount("attendance");
  const clubs = useLiveCount("club_registrations");
  const events = useLiveCount("events");

  useEffect(() => {
    const load = () => {
      const all = localDb.getStudents();
      const sorted = [...all].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRecent(sorted.slice(0, 10));
    };
    load();

    const handler = () => load();
    window.addEventListener("local-db-update", handler);
    return () => window.removeEventListener("local-db-update", handler);
  }, []);

  return (
    <AdminShell title="Live dashboard" subtitle="Real-time numbers across the induction.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Students registered" value={students} accent="from-primary to-primary-glow" />
        <Kpi icon={QrCode} label="Total QR scans" value={scans} accent="from-accent to-primary-glow" />
        <Kpi icon={Sparkles} label="Club joins" value={clubs} accent="from-chart-4 to-success" />
        <Kpi icon={Calendar} label="Events live" value={events} accent="from-chart-3 to-primary" />
      </div>

      <section className="mt-8 rounded-2xl border bg-card p-5 shadow-sm">
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
            <motion.div key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between py-3">
              <div>
                <div className="font-medium">{s.full_name}</div>
                <div className="text-xs text-muted-foreground">{s.enrollment_no}</div>
              </div>
              <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleTimeString()}</div>
            </motion.div>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: number | null; accent: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border bg-card p-5 shadow-sm">
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
