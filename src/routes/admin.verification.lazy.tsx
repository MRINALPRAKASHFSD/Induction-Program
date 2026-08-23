import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase/config";
import {
  CheckCircle2, Clock, AlertTriangle, Users, Building,
  RefreshCw, Download, BarChart3
} from "lucide-react";

export const Route = createLazyFileRoute("/admin/verification")({
  component: AdminVerification,
});

// ── Types ─────────────────────────────────────────────────────────────────────
interface VerificationData {
  plannerId:          string;
  totalStudents:      number;
  allocated:          number;
  pendingReview:      number;
  unallocated:        number;
  schedulesGenerated: number;
  allocationRate:     string;
  scheduleRate:       string;
  roomOccupancy:      Array<{ room: string; assigned: number }>;
  pendingReviewList:  Array<{ studentId: string; reason: string }>;
  asOf:               string;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color, icon: Icon
}: {
  label: string; value: string | number; sub?: string;
  color: string; icon: React.ElementType;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border bg-white dark:bg-zinc-900/80 p-5 shadow-sm flex items-start gap-4"
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}18`, color }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-primary truncate">{value}</p>
        {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function AdminVerification() {
  const [data,    setData]    = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { setError("Not authenticated"); setLoading(false); return; }
      const res = await fetch('/api/admin-verification', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Failed to load verification data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportReport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `allocation-final-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminShell>
      <div className="max-w-5xl mx-auto space-y-6 pb-12">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">Allocation Verification</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              {data?.asOf
                ? `Data as of ${new Date(data.asOf).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                : 'Deeksharambh 2026'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportReport} disabled={!data}>
              <Download className="w-4 h-4 mr-1.5" />
              Export JSON
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl border bg-zinc-100 dark:bg-zinc-800 h-24 animate-pulse" />
            ))}
          </div>
        )}

        {/* Stat Cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="Total Students"      value={data.totalStudents}      color="#6366f1" icon={Users} />
            <StatCard label="Allocated"            value={data.allocated}          sub={data.allocationRate}  color="#22c55e" icon={CheckCircle2} />
            <StatCard label="Schedules Generated"  value={data.schedulesGenerated} sub={data.scheduleRate}    color="#0ea5e9" icon={BarChart3} />
            <StatCard label="Pending Review"       value={data.pendingReview}      color="#f59e0b" icon={Clock} />
            <StatCard label="Unallocated"          value={data.unallocated}        color="#ef4444" icon={AlertTriangle} />
            <StatCard label="Rooms Used"           value={data.roomOccupancy.length} color="#8b5cf6" icon={Building} />
          </div>
        )}

        {/* Room Occupancy Table */}
        {data && data.roomOccupancy.length > 0 && (
          <div className="rounded-2xl border bg-white dark:bg-zinc-900/80 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b flex items-center gap-2">
              <Building className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-bold text-primary">Room Occupancy</span>
              <span className="ml-auto text-xs text-zinc-400">{data.roomOccupancy.length} rooms</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-widest text-zinc-400 border-b">
                    <th className="px-5 py-2 text-left font-semibold">Room</th>
                    <th className="px-5 py-2 text-right font-semibold">Assigned</th>
                    <th className="px-5 py-2 text-left font-semibold">Fill</th>
                  </tr>
                </thead>
                <tbody>
                  {data.roomOccupancy.map((row, i) => (
                    <tr key={row.room} className={`border-b last:border-0 ${i % 2 === 0 ? 'bg-zinc-50/50 dark:bg-zinc-800/20' : ''}`}>
                      <td className="px-5 py-2.5 font-mono font-bold text-primary">{row.room}</td>
                      <td className="px-5 py-2.5 text-right font-semibold">{row.assigned}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden max-w-[80px]">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.min(100, row.assigned * 100 / 60)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pending Review List */}
        {data && data.pendingReviewList.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-amber-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Pending Review</span>
              <span className="ml-auto text-xs text-amber-500">{data.pendingReview} students</span>
            </div>
            <div className="divide-y divide-amber-100 dark:divide-amber-900/20">
              {data.pendingReviewList.map((s) => (
                <div key={s.studentId} className="px-5 py-2.5 flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-primary">{s.studentId}</span>
                  <span className="text-amber-600 dark:text-amber-400 text-right ml-4 max-w-xs truncate">{s.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </AdminShell>
  );
}
