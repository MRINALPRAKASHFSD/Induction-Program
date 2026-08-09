import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Upload, RefreshCw, Send, RotateCcw, Search,
  Activity, AlertCircle, CheckCircle2, XCircle, Layers, ChevronDown
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";

export const Route = createLazyFileRoute("/admin/planners")({
  component: AdminPlannersPage,
});

// ── Types ──────────────────────────────────────────────────────────────────────

const PLANNER_TYPES = [
  { value: "orientation", label: "Orientation",  emoji: "🎓" },
  { value: "workshop",    label: "Workshop",     emoji: "🔧" },
  { value: "hackathon",   label: "Hackathon",    emoji: "💻" },
  { value: "bootcamp",    label: "Bootcamp",     emoji: "⚡" },
  { value: "convocation", label: "Convocation",  emoji: "🏛️" },
] as const;

type PlannerType = (typeof PLANNER_TYPES)[number]["value"];
type Tab = "overview" | "preview" | "history";

// ── Auth helper ────────────────────────────────────────────────────────────────

async function adminFetch(url: string, options: RequestInit = {}): Promise<any> {
  const { auth } = await import("@/lib/firebase/config");
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function adminFetchFormData(url: string, formData: FormData): Promise<any> {
  const { auth } = await import("@/lib/firebase/config");
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT:       "bg-amber-100 text-amber-700",
    VALIDATED:   "bg-blue-100 text-blue-700",
    PUBLISHED:   "bg-emerald-100 text-emerald-700",
    ARCHIVED:    "bg-slate-100 text-slate-600",
    ROLLED_BACK: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${map[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

function MetricCard({ label, value, color = "text-primary" }: { label: string; value: any; color?: string }) {
  return (
    <div className="glass-premium-v2 rounded-2xl p-4 border border-white/30">
      <p className="text-[10px] font-bold text-primary/50 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value ?? "—"}</p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

function AdminPlannersPage() {
  const [plannerType, setPlannerType]   = useState<PlannerType>("orientation");
  const [tab, setTab]                   = useState<Tab>("overview");
  const [uploading, setUploading]       = useState(false);
  const [publishing, setPublishing]     = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [status, setStatus]             = useState<any>(null);
  const [preview, setPreview]           = useState<any>(null);
  const [searchQuery, setSearchQuery]   = useState("");
  const [typeOpen, setTypeOpen]         = useState(false);

  const selectedType = PLANNER_TYPES.find(t => t.value === plannerType)!;

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const data = await adminFetch(`/api/event-planner-status?type=${plannerType}`);
      setStatus(data);
    } catch (e: any) {
      toast.error(`Failed to load status: ${e.message}`);
    } finally {
      setLoadingStatus(false);
    }
  }, [plannerType]);

  useEffect(() => {
    loadStatus();
    setPreview(null);
    setTab("overview");
  }, [loadStatus, plannerType]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      toast.error("Only .xlsx and .csv files are accepted.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("planner", file);
      const data = await adminFetchFormData(
        `/api/event-planner-upload?type=${plannerType}`,
        formData,
      );
      setPreview(data);
      setTab("preview");
      if (data.hasBlockingErrors) {
        toast.error(`Parsed with ${data.validationErrors?.length} blocking error(s). Fix before publishing.`);
      } else {
        toast.success(`Parsed ${data.sessionCount} sessions across ${data.dayCount} day(s).`);
      }
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }, [plannerType]);

  const handlePublish = useCallback(async (plannerId: string) => {
    if (!confirm(`Publish ${plannerId}? This will archive the current active schedule and notify students.`)) return;
    setPublishing(true);
    try {
      await adminFetch("/api/event-planner-publish", {
        method: "POST",
        body: JSON.stringify({ plannerId }),
      });
      toast.success("Planner published! Students will see the updated schedule.");
      setPreview(null);
      await loadStatus();
      setTab("overview");
    } catch (e: any) {
      toast.error(`Publish failed: ${e.message}`);
    } finally {
      setPublishing(false);
    }
  }, [loadStatus]);

  const handleRollback = useCallback(async (plannerId: string) => {
    if (!confirm(`Roll back to "${plannerId}"? This will replace the current active schedule.`)) return;
    try {
      await adminFetch("/api/event-planner-rollback", {
        method: "POST",
        body: JSON.stringify({ plannerId }),
      });
      toast.success(`Rolled back to "${plannerId}"`);
      await loadStatus();
    } catch (e: any) {
      toast.error(`Rollback failed: ${e.message}`);
    }
  }, [loadStatus]);

  const active = status?.activePlanner;
  const TAB_CLASS = (t: string) =>
    `px-4 py-2 text-sm font-bold rounded-xl transition-all ${tab === t ? "bg-[#3c1608] text-white shadow" : "text-[#7a4020] hover:bg-white/50"}`;

  return (
    <AdminShell title="Event Planners" subtitle="Manage schedules for any university event">
      {/* ── Planner type selector ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-8 flex-wrap">
        <div className="relative">
          <button
            onClick={() => setTypeOpen(!typeOpen)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3c1608] text-white text-sm font-bold shadow hover:bg-[#4a1e0a] transition-colors"
          >
            <span>{selectedType.emoji}</span>
            <span>{selectedType.label}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${typeOpen ? "rotate-180" : ""}`} />
          </button>
          {typeOpen && (
            <div className="absolute top-full left-0 mt-2 z-20 bg-white rounded-2xl shadow-xl border border-black/5 py-1 min-w-[180px]">
              {PLANNER_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => { setPlannerType(t.value); setTypeOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left hover:bg-[#3c1608]/5 transition-colors font-medium ${t.value === plannerType ? "text-[#3c1608] font-bold" : "text-[#2c1208]"}`}
                >
                  <span>{t.emoji}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-sm text-[#7a4020]/70">
          {selectedType.label} Schedule Management
        </p>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-8">
        {(["overview", "preview", "history"] as const).map(t => (
          <button key={t} className={TAB_CLASS(t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Overview ──────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-8">
          {/* Upload zone */}
          <div className="border-2 border-dashed border-[#8a4a22]/20 rounded-2xl p-8 text-center space-y-4 hover:border-[#8a4a22]/40 transition-colors">
            <div className="w-14 h-14 rounded-2xl bg-[#8a4a22]/10 flex items-center justify-center mx-auto">
              <Upload className="w-7 h-7 text-[#8a4a22]" />
            </div>
            <div>
              <h3 className="font-bold text-[#2c1208]">Upload {selectedType.label} Schedule</h3>
              <p className="text-sm text-[#7a4020]/70 mt-1">
                .xlsx or .csv file with columns: Day, Date, Start Time, End Time, Session Title, Venue, Building, Speaker
              </p>
            </div>
            <label className="inline-block">
              <input
                type="file"
                accept=".xlsx,.csv"
                className="sr-only"
                onChange={handleUpload}
                disabled={uploading}
              />
              <Button variant="liquidGlassDark" disabled={uploading} asChild>
                <span className="cursor-pointer">
                  {uploading ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Parsing…</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" />Choose File (.xlsx / .csv)</>
                  )}
                </span>
              </Button>
            </label>
          </div>

          {/* Active planner */}
          {loadingStatus ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-24 bg-black/5 rounded-2xl animate-pulse" />)}
            </div>
          ) : active ? (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs font-bold text-[#7a4020]/60 uppercase tracking-wider mb-1">Active Planner</p>
                  <h2 className="text-xl font-bold text-[#2c1208] flex items-center gap-3">
                    {active.plannerId}
                    <StatusBadge status={active.status} />
                  </h2>
                  <p className="text-sm text-[#7a4020]/70 mt-1">
                    Published {active.publishedAt ? new Date(active.publishedAt).toLocaleString() : "—"}
                    {active.publishedBy && ` by ${active.publishedByName || active.publishedBy}`}
                  </p>
                </div>
                <Button variant="liquidGlassWhite" size="sm" onClick={loadStatus}>
                  <RefreshCw className="w-4 h-4 mr-2" />Refresh
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Sessions"   value={active.sessionCount} color="text-[#8a4a22]" />
                <MetricCard label="Days"       value={active.dayCount}     color="text-blue-700" />
                <MetricCard label="Warnings"   value={active.validationWarnings?.length ?? 0} color={(active.validationWarnings?.length ?? 0) > 0 ? "text-amber-700" : "text-emerald-700"} />
                <MetricCard label="Year"       value={active.plannerYear} />
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-[#7a4020]/60">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No active {selectedType.label} planner</p>
              <p className="text-sm mt-1">Upload a schedule file and publish to activate.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Preview ───────────────────────────────────────────────────────── */}
      {tab === "preview" && (
        <div className="space-y-6">
          {!preview && (
            <p className="text-center text-[#7a4020]/60 py-8 text-sm">Upload a file to see the preview.</p>
          )}
          {preview && (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px] relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8a4a22]/50" />
                  <input
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#8a4a22]/20 bg-white/60 text-sm font-medium placeholder:text-[#8a4a22]/40 focus:outline-none focus:ring-2 focus:ring-[#8a4a22]/30"
                    placeholder="Search sessions, venues, speakers…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                {!preview.hasBlockingErrors && (
                  <Button
                    variant="liquidGlassDark"
                    disabled={publishing}
                    onClick={() => handlePublish(preview.plannerId)}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {publishing ? "Publishing…" : "Publish Now"}
                  </Button>
                )}
              </div>

              {/* Validation errors */}
              {preview.validationErrors?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
                  <p className="text-sm font-bold text-red-700 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    {preview.validationErrors.length} Blocking Error(s) — Must Resolve Before Publishing
                  </p>
                  {preview.validationErrors.map((e: any, i: number) => (
                    <div key={i} className="text-xs text-red-600 pl-6">
                      <strong>[{e.code}]</strong> Row {e.row} / {e.field}: {e.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {preview.validationWarnings?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                  <p className="text-sm font-bold text-amber-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {preview.validationWarnings.length} Warning(s) — Non-blocking
                  </p>
                  {preview.validationWarnings.slice(0, 5).map((w: any, i: number) => (
                    <div key={i} className="text-xs text-amber-700 pl-6">
                      <strong>[{w.code}]</strong> Row {w.row} / {w.field}: {w.message}
                    </div>
                  ))}
                  {preview.validationWarnings.length > 5 && (
                    <p className="text-xs text-amber-600 pl-6">+{preview.validationWarnings.length - 5} more…</p>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Sessions" value={preview.sessionCount} />
                <MetricCard label="Days" value={preview.dayCount} />
                <MetricCard label="Year" value={preview.plannerYear} />
                <MetricCard label="Errors" value={preview.validationErrors?.length ?? 0} color={(preview.validationErrors?.length ?? 0) > 0 ? "text-red-700" : "text-emerald-700"} />
              </div>

              {/* Sessions table */}
              <div className="glass-card-hero rounded-2xl p-4">
                <h3 className="font-bold text-[#2c1208] mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Sessions ({preview.preview?.sessions?.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#8a4a22]/10">
                        {["Day", "Date", "Start", "End", "Session Title", "Venue", "Speaker"].map(h => (
                          <th key={h} className="text-left py-2 pr-4 font-bold text-[#7a4020]/70 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {(preview.preview?.sessions || [])
                        .filter((s: any) => !searchQuery || JSON.stringify(s).toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((s: any, i: number) => (
                          <tr key={i} className="hover:bg-white/40">
                            <td className="py-2 pr-4 font-bold text-[#8a4a22]">D{s.dayNumber}</td>
                            <td className="py-2 pr-4 whitespace-nowrap">{s.date}</td>
                            <td className="py-2 pr-4 whitespace-nowrap font-mono">{s.startTime}</td>
                            <td className="py-2 pr-4 whitespace-nowrap font-mono">{s.endTime}</td>
                            <td className="py-2 pr-4 font-medium text-[#2c1208] max-w-[180px] truncate">{s.sessionTitle}</td>
                            <td className="py-2 pr-4">{s.venue}</td>
                            <td className="py-2">{s.speaker}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── History ───────────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-4">
          {loadingStatus && (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-20 bg-black/5 rounded-2xl animate-pulse" />)}
            </div>
          )}
          {!loadingStatus && (status?.history || []).length === 0 && (
            <p className="text-center text-[#7a4020]/60 py-8 text-sm">No previous planners.</p>
          )}
          {(status?.history || []).map((p: any) => (
            <div key={p.id ?? p.plannerId} className="glass-card-hero p-5 rounded-2xl flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#2c1208]">{p.plannerId}</span>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-xs text-[#7a4020]/70 mt-1">
                  Uploaded {p.uploadedAt ? new Date(p.uploadedAt).toLocaleDateString() : "—"} by {p.uploadedByName || p.uploadedBy}
                  {p.publishedAt && ` · Published ${new Date(p.publishedAt).toLocaleDateString()}`}
                </p>
                {(p.sessionCount ?? 0) > 0 && (
                  <p className="text-xs text-[#7a4020]/60 mt-0.5">
                    {p.sessionCount} sessions · {p.dayCount} days
                  </p>
                )}
              </div>
              {(p.status === "ARCHIVED" || p.status === "ROLLED_BACK") && (
                <Button
                  variant="liquidGlassWhite"
                  size="sm"
                  onClick={() => handleRollback(p.plannerId)}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Rollback
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
