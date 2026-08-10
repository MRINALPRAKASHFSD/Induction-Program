import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { RefreshCw, Users, UserCheck, UserX, TrendingUp, Clock, PieChart } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";

export const Route = createLazyFileRoute("/admin/event-guests")({
  component: AdminEventGuestsPage,
});

// ── Auth helper ────────────────────────────────────────────────────────────────

async function adminFetch(url: string): Promise<any> {
  const { auth } = await import("@/lib/firebase/config");
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricTile({
  icon, label, value, sub, color = "text-[#8a4a22]"
}: {
  icon: React.ReactNode; label: string; value: any; sub?: string; color?: string;
}) {
  return (
    <div className="glass-premium-v2 border border-white/30 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-[#8a4a22]/10 flex items-center justify-center">
          {icon}
        </div>
        <p className="text-[10px] font-bold text-primary/50 uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-3xl font-bold ${color}`}>{value ?? "—"}</p>
      {sub && <p className="text-xs text-tertiary mt-1">{sub}</p>}
    </div>
  );
}

function BreakdownTable({ title, rows, cols }: {
  title: string;
  rows: any[];
  cols: { key: string; label: string }[];
}) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="glass-premium-v2 border border-white/30 rounded-2xl p-5">
      <h3 className="font-bold text-primary mb-4 flex items-center gap-2">
        <PieChart className="w-4 h-4 text-primary/50" />
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/10">
              {cols.map(c => (
                <th key={c.key} className="text-left py-2 pr-4 font-bold text-primary/50 uppercase tracking-wider">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.slice(0, 20).map((row, i) => (
              <tr key={i} className="hover:bg-white/30 transition-colors">
                {cols.map(c => (
                  <td key={c.key} className="py-2 pr-4 text-primary/80 font-medium">{row[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RelationshipBar({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  const total   = entries.reduce((s, [, v]) => s + v, 0);
  if (entries.length === 0) return null;

  const COLORS = ["bg-[#8a4a22]", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-pink-500"];

  return (
    <div className="glass-premium-v2 border border-white/30 rounded-2xl p-5">
      <h3 className="font-bold text-primary mb-4 flex items-center gap-2">
        <Users className="w-4 h-4 text-primary/50" />
        Guest Relationships
      </h3>
      <div className="flex rounded-full overflow-hidden h-4 mb-4">
        {entries.map(([rel, count], i) => (
          <div
            key={rel}
            className={`${COLORS[i % COLORS.length]} h-full transition-all`}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${rel}: ${count}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([rel, count], i) => (
          <div key={rel} className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${COLORS[i % COLORS.length]}`} />
            <span className="text-xs text-secondary font-medium">{rel}</span>
            <span className="text-xs text-primary ml-auto font-bold">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

function AdminEventGuestsPage() {
  const [eventId, setEventId]       = useState("orientation-2026");
  const [loading, setLoading]       = useState(false);
  const [analytics, setAnalytics]   = useState<any>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const loadAnalytics = useCallback(async () => {
    if (!eventId.trim()) return;
    setLoading(true);
    try {
      const data = await adminFetch(`/api/event-guest-analytics?event_id=${encodeURIComponent(eventId)}`);
      setAnalytics(data);
      setLastFetched(new Date());
    } catch (e: any) {
      toast.error(`Failed to load analytics: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { loadAnalytics(); }, []);

  const a = analytics;

  return (
    <AdminShell title="Guest Analytics" subtitle="Footfall and guest headcount by event">
      {/* Event selector */}
      <div className="flex flex-wrap gap-3 mb-8 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-primary/50 uppercase tracking-wider mb-1.5">
            Event ID
          </label>
          <input
            className="w-full px-4 py-2.5 rounded-xl border border-[#8a4a22]/20 bg-white/60 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#8a4a22]/30"
            value={eventId}
            onChange={e => setEventId(e.target.value)}
            placeholder="orientation-2026"
          />
        </div>
        <Button variant="liquidGlassDark" onClick={loadAnalytics} disabled={loading}>
          {loading ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Loading…</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" />Load Analytics</>
          )}
        </Button>
      </div>

      {lastFetched && (
        <p className="text-xs text-primary/40 mb-4">
          Last refreshed: {lastFetched.toLocaleTimeString()}
        </p>
      )}

      {!a && !loading && (
        <div className="text-center py-16 text-primary/40">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">Enter an Event ID and click Load Analytics</p>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-black/5 rounded-2xl animate-pulse" />)}
        </div>
      )}

      {a && !loading && (
        <div className="space-y-6">
          {/* Core metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricTile
              icon={<UserCheck className="w-4 h-4 text-[#8a4a22]" />}
              label="Students Checked In"
              value={a.studentsCheckedIn}
              color="text-[#8a4a22]"
            />
            <MetricTile
              icon={<Users className="w-4 h-4 text-blue-700" />}
              label="Total Guests"
              value={a.totalGuestCount}
              sub={`Avg ${a.averageGuestsPerStudent}/student`}
              color="text-blue-700"
            />
            <MetricTile
              icon={<TrendingUp className="w-4 h-4 text-emerald-700" />}
              label="Total Footfall"
              value={a.totalFootfall}
              sub="Students + Guests"
              color="text-emerald-700"
            />
            <MetricTile
              icon={<UserX className="w-4 h-4 text-amber-700" />}
              label="Came Alone"
              value={a.studentsAlone}
              sub={`${a.studentsCheckedIn > 0 ? Math.round((a.studentsAlone / a.studentsCheckedIn) * 100) : 0}% of check-ins`}
              color="text-amber-700"
            />
          </div>

          {/* Expected vs Actual */}
          {a.expectedVsActual && (
            <div className="glass-premium-v2 border border-white/30 rounded-2xl p-5">
              <h3 className="font-bold text-primary mb-4">Expected vs Actual Footfall</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-primary/40 uppercase tracking-wider">Registered</p>
                  <p className="text-2xl font-bold text-primary mt-1">{a.expectedVsActual.registered}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-primary/40 uppercase tracking-wider">Actual</p>
                  <p className="text-2xl font-bold text-primary mt-1">{a.expectedVsActual.actualFootfall}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-primary/40 uppercase tracking-wider">Variance</p>
                  <p className={`text-2xl font-bold mt-1 ${a.expectedVsActual.variance >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {a.expectedVsActual.variance >= 0 ? "+" : ""}{a.expectedVsActual.variance}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-primary/40 uppercase tracking-wider">Coverage</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">{a.expectedVsActual.coveragePercent}%</p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-4 h-2 rounded-full bg-black/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#8a4a22] to-amber-600 transition-all"
                  style={{ width: `${Math.min(100, a.expectedVsActual.coveragePercent)}%` }}
                />
              </div>
            </div>
          )}

          {/* Peak arrival */}
          {a.peakArrivalHour !== null && (
            <div className="glass-premium-v2 border border-white/30 rounded-2xl p-5 flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center shrink-0">
                <Clock className="w-7 h-7 text-purple-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-primary/40 uppercase tracking-wider">Peak Arrival Hour</p>
                <p className="text-3xl font-bold text-primary mt-1">
                  {a.peakArrivalHour > 12 ? `${a.peakArrivalHour - 12}:00 PM` : `${a.peakArrivalHour}:00 ${a.peakArrivalHour === 12 ? "PM" : "AM"}`}
                </p>
                <p className="text-sm text-tertiary">Most students arrived during this hour</p>
              </div>
            </div>
          )}

          {/* Relationship breakdown */}
          {Object.keys(a.relationshipBreakdown || {}).length > 0 && (
            <RelationshipBar breakdown={a.relationshipBreakdown} />
          )}

          {/* School-wise table */}
          <BreakdownTable
            title="School-wise Footfall"
            rows={a.schoolWise || []}
            cols={[
              { key: "school", label: "School" },
              { key: "studentCount", label: "Students" },
              { key: "guestCount", label: "Guests" },
              { key: "footfall", label: "Total Footfall" },
            ]}
          />

          {/* Programme-wise table */}
          <BreakdownTable
            title="Programme-wise Footfall"
            rows={a.programmeWise || []}
            cols={[
              { key: "programme", label: "Programme" },
              { key: "studentCount", label: "Students" },
              { key: "guestCount", label: "Guests" },
              { key: "footfall", label: "Total Footfall" },
            ]}
          />

          {/* Department-wise table */}
          <BreakdownTable
            title="Department-wise Footfall"
            rows={a.departmentWise || []}
            cols={[
              { key: "dept", label: "Department" },
              { key: "studentCount", label: "Students" },
              { key: "guestCount", label: "Guests" },
              { key: "footfall", label: "Total Footfall" },
            ]}
          />
        </div>
      )}
    </AdminShell>
  );
}
