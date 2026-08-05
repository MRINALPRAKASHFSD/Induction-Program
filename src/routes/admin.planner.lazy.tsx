/**
 * Admin Planner Dashboard
 *
 * Route: /admin/planner  (admin.planner.lazy.tsx)
 *
 * Tabs:
 *   1. Overview    — Metric cards + planner status + import log
 *   2. Preview     — Searchable/filterable room allocations + sessions
 *   3. History     — Version list + rollback
 *   4. Health      — 12 health checks
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/admin-shell";
import { auth } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Upload, CheckCircle2, XCircle, AlertCircle, RefreshCw, Send,
  RotateCcw, Search, ChevronDown, ChevronUp, Activity, Clock, Layers
} from "lucide-react";

export const Route = createLazyFileRoute("/admin/planner")({
  component: AdminPlannerPage,
});

import { signInAnonymously } from "firebase/auth";

// ── Auth helper ────────────────────────────────────────────────────────────────

async function adminFetch(path: string, opts: RequestInit = {}): Promise<any> {
  await auth.authStateReady();
  let user = auth.currentUser;
  if (!user) {
    try {
      const cred = await signInAnonymously(auth);
      user = cred.user;
    } catch (e) {
      console.warn("Anonymous sign-in fallback failed", e);
    }
  }
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      ...opts.headers,
      Authorization: `Bearer ${token}`,
      ...(opts.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Metric Card ────────────────────────────────────────────────────────────────

function MetricCard({ label, value, color = "text-primary" }: { label: string; value: any; color?: string }) {
  return (
    <div className="glass-card-hero p-5 rounded-2xl flex flex-col gap-1">
      <div className={`text-3xl font-bold tracking-tight ${color}`}>{value ?? "—"}</div>
      <div className="text-xs font-semibold text-[#7a4020]/70 uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ── Status Badge ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT:        "bg-amber-500/10 text-amber-700",
  VALIDATED:    "bg-blue-500/10 text-blue-700",
  PUBLISHED:    "bg-emerald-500/10 text-emerald-700",
  ARCHIVED:     "bg-slate-500/10 text-slate-600",
  ROLLED_BACK:  "bg-purple-500/10 text-purple-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

// ── Collapsible tree node ──────────────────────────────────────────────────────

function TreeNode({ label, children, count }: { label: string; children: React.ReactNode; count?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#8a4a22]/10 rounded-xl overflow-hidden mb-2">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-sm font-bold text-[#2c1208]">{label}</span>
        <div className="flex items-center gap-2">
          {count !== undefined && (
            <span className="text-xs font-semibold text-[#8a4a22]/60 bg-[#8a4a22]/10 px-2 py-0.5 rounded-full">{count}</span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-[#8a4a22]/60" /> : <ChevronDown className="w-4 h-4 text-[#8a4a22]/60" />}
        </div>
      </button>
      {open && <div className="border-t border-[#8a4a22]/10 p-4">{children}</div>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

function AdminPlannerPage() {
  const [tab, setTab] = useState<"overview" | "preview" | "history" | "health">("overview");
  const [status, setStatus] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const data = await adminFetch("/api/planner-admin-status");
      setStatus(data);
    } catch (e: any) {
      toast.error(`Failed to load status: ${e.message}`);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const data = await adminFetch("/api/planner-health");
      setHealth(data);
    } catch (e: any) {
      toast.error(`Health check failed: ${e.message}`);
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.xlsx')) {
      toast.error("Only .xlsx files are supported");
      return;
    }

    setUploading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");
      const token = await user.getIdToken();

      const formData = new FormData();
      formData.append("planner", file);

      const res = await fetch("/api/planner-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setPreview(data);
      toast.success(`Parsed ${data.summary?.sessionCount} sessions, ${data.summary?.roomCount} rooms`);
      if (data.hasBlockingErrors) {
        toast.warning(`${data.validationErrors.length} blocking error(s) — cannot publish until resolved`);
      }
      await loadStatus();
      setTab("preview");
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [loadStatus]);

  const handlePublish = useCallback(async (plannerId: string) => {
    if (!confirm(`Publish planner "${plannerId}"? This will deactivate the current published planner.`)) return;
    setPublishing(true);
    try {
      await adminFetch("/api/planner-publish", {
        method: "POST",
        body: JSON.stringify({ plannerId }),
      });
      toast.success(`Planner "${plannerId}" published successfully!`);
      await loadStatus();
      setTab("overview");
    } catch (e: any) {
      toast.error(`Publish failed: ${e.message}`);
    } finally {
      setPublishing(false);
    }
  }, [loadStatus]);

  const handleRollback = useCallback(async (plannerId: string) => {
    if (!confirm(`Roll back to "${plannerId}"? This cannot be undone easily.`)) return;
    try {
      await adminFetch("/api/planner-rollback", {
        method: "POST",
        body: JSON.stringify({ plannerId, confirm: "CONFIRM_ROLLBACK" }),
      });
      toast.success(`Rolled back to "${plannerId}"`);
      await loadStatus();
    } catch (e: any) {
      toast.error(`Rollback failed: ${e.message}`);
    }
  }, [loadStatus]);

  const active = status?.activePlanner;
  const il     = active?.importLog;

  const TAB_CLASS = (t: string) =>
    `px-4 py-2 text-sm font-bold rounded-xl transition-all ${tab === t ? "bg-[#3c1608] text-white shadow" : "text-[#7a4020] hover:bg-white/50"}`;

  return (
    <AdminShell title="Induction Planner" subtitle="Aarambh 2026 — Master Schedule Management">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {(["overview", "preview", "history", "health"] as const).map(t => (
          <button key={t} className={TAB_CLASS(t)} onClick={() => {
            setTab(t);
            if (t === "health" && !health) loadHealth();
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-8">
          {/* Upload Zone */}
          <div className="border-2 border-dashed border-[#8a4a22]/20 rounded-2xl p-8 text-center space-y-4 hover:border-[#8a4a22]/40 transition-colors">
            <div className="w-14 h-14 rounded-2xl bg-[#8a4a22]/10 flex items-center justify-center mx-auto">
              <Upload className="w-7 h-7 text-[#8a4a22]" />
            </div>
            <div>
              <h3 className="font-bold text-[#2c1208]">Upload Master Planner Excel</h3>
              <p className="text-sm text-[#7a4020]/70 mt-1">
                .xlsx file with sheets: Room Allocation, Schedule, Venue List
              </p>
            </div>
            <label className="inline-block">
              <input type="file" accept=".xlsx" className="sr-only" onChange={handleUpload} disabled={uploading} />
              <Button variant="liquidGlassDark" disabled={uploading} asChild>
                <span className="cursor-pointer">
                  {uploading ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Parsing…</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" />Choose File</>
                  )}
                </span>
              </Button>
            </label>
          </div>

          {/* Active Planner Status */}
          {loadingStatus ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-24 bg-black/5 rounded-2xl animate-pulse" />)}
            </div>
          ) : active ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#7a4020]/60 uppercase tracking-wider mb-1">Active Planner</p>
                  <h2 className="text-xl font-bold text-[#2c1208] flex items-center gap-3">
                    {active.plannerId}
                    <StatusBadge status={active.status} />
                  </h2>
                  <p className="text-sm text-[#7a4020]/70 mt-1">
                    Published {active.publishedAt ? new Date(active.publishedAt).toLocaleString() : "—"}
                    {active.publishedBy && ` by ${active.publishedBy}`}
                  </p>
                </div>
                <Button variant="liquidGlassDark" size="sm" onClick={loadStatus}>
                  <RefreshCw className="w-4 h-4 mr-2" />Refresh
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Schools"    value={active.summary?.schoolCount}    color="text-blue-700" />
                <MetricCard label="Programmes" value={active.summary?.programmeCount} color="text-purple-700" />
                <MetricCard label="Rooms"      value={active.summary?.roomCount}       color="text-emerald-700" />
                <MetricCard label="Sessions"   value={active.summary?.sessionCount}    color="text-[#8a4a22]" />
                <MetricCard label="Courses"    value={active.summary?.courseCount}     />
                <MetricCard label="Venues"     value={active.summary?.venueCount}      />
                <MetricCard label="Faculty"    value={active.summary?.facultyCount}    />
                <MetricCard label="Warnings"   value={active.validationWarnings}      color={active.validationWarnings > 0 ? "text-amber-700" : "text-emerald-700"} />
              </div>

              {il && (
                <div className="glass-card-hero p-6 rounded-2xl space-y-4">
                  <h3 className="font-bold text-[#2c1208] flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Import Log
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    {[
                      ["File", il.excelFilename],
                      ["Rows Parsed", il.rowsParsed],
                      ["Rows Imported", il.rowsImported],
                      ["Rows Ignored", il.rowsIgnored],
                      ["Parse Duration", `${il.parseDurationMs}ms`],
                      ["Publish Duration", `${il.publishDurationMs}ms`],
                      ["Published By", il.publishedByName || il.publishedBy],
                      ["Published At", il.publishedAt ? new Date(il.publishedAt).toLocaleString() : "—"],
                      ["Checksum", il.fileChecksum?.slice(0, 12) + "…"],
                    ].map(([k, v]) => (
                      <div key={k as string}>
                        <p className="text-[10px] font-bold text-[#7a4020]/60 uppercase tracking-wider">{k}</p>
                        <p className="font-semibold text-[#2c1208] truncate">{v || "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-[#7a4020]/60">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No active planner</p>
              <p className="text-sm mt-1">Upload the Master Excel and publish to activate.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Preview ─────────────────────────────────────────────────── */}
      {tab === "preview" && (
        <div className="space-y-6">
          {!preview && !loadingStatus && (
            <p className="text-center text-[#7a4020]/60 py-8 text-sm">Upload a planner file to see the preview.</p>
          )}
          {preview && (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px] relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8a4a22]/50" />
                  <input
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#8a4a22]/20 bg-white/60 text-sm font-medium placeholder:text-[#8a4a22]/40 focus:outline-none focus:ring-2 focus:ring-[#8a4a22]/30"
                    placeholder="Search rooms, programmes, sessions…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                {preview.validationErrors?.length === 0 && (
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
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {Object.entries(preview.summary || {}).map(([k, v]) => (
                  <MetricCard key={k} label={k.replace(/([A-Z])/g, ' $1').replace('Count', '').trim()} value={v as any} />
                ))}
              </div>

              {/* Collapsible Room Allocation tree */}
              <TreeNode label="Room Allocations" count={preview.preview?.roomAllocations?.length}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#8a4a22]/10">
                        {["School", "Programme", "Course", "Room", "Block", "Floor", "Capacity"].map(h => (
                          <th key={h} className="text-left py-2 pr-4 font-bold text-[#7a4020]/70 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {(preview.preview?.roomAllocations || [])
                        .filter((r: any) => !searchQuery || JSON.stringify(r).toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((r: any, i: number) => (
                        <tr key={i} className="hover:bg-white/40">
                          <td className="py-2 pr-4 font-medium text-[#2c1208]">{r.school}</td>
                          <td className="py-2 pr-4">{r.programme}</td>
                          <td className="py-2 pr-4">{r.course}</td>
                          <td className="py-2 pr-4 font-bold text-[#8a4a22]">{r.roomNumber}</td>
                          <td className="py-2 pr-4">{r.block}</td>
                          <td className="py-2 pr-4">{r.floor}</td>
                          <td className="py-2">{r.capacity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TreeNode>

              {/* Collapsible Sessions tree */}
              <TreeNode label="Sessions" count={preview.preview?.sessions?.length}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#8a4a22]/10">
                        {["Day", "Date", "Start", "End", "Session", "Scope", "Venue", "Faculty"].map(h => (
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
                          <td className="py-2 pr-4 whitespace-nowrap">{s.startTime}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">{s.endTime}</td>
                          <td className="py-2 pr-4 font-medium text-[#2c1208] max-w-[160px] truncate">{s.sessionName}</td>
                          <td className="py-2 pr-4">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-[#8a4a22]/10 text-[#8a4a22]">{s.scope}</span>
                          </td>
                          <td className="py-2 pr-4">{s.venueName}</td>
                          <td className="py-2">{s.facultyCoordinator}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TreeNode>
            </>
          )}
        </div>
      )}

      {/* ── Tab: History ─────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-4">
          {(status?.history || []).length === 0 ? (
            <p className="text-center text-[#7a4020]/60 py-8 text-sm">No previous planners.</p>
          ) : (
            (status?.history || []).map((p: any) => (
              <div key={p.id} className="glass-card-hero p-5 rounded-2xl flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-[#2c1208]">{p.plannerId}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-xs text-[#7a4020]/70 mt-1">
                    Uploaded {p.uploadedAt ? new Date(p.uploadedAt).toLocaleDateString() : "—"} by {p.uploadedBy}
                    {p.publishedAt && ` · Published ${new Date(p.publishedAt).toLocaleDateString()}`}
                  </p>
                  {p.summary && (
                    <p className="text-xs text-[#7a4020]/60 mt-0.5">
                      {p.summary.sessionCount} sessions · {p.summary.roomCount} rooms · {p.summary.programmeCount} programmes
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
            ))
          )}
        </div>
      )}

      {/* ── Tab: Health ──────────────────────────────────────────────────── */}
      {tab === "health" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#7a4020]/70">
              {health ? `Last checked ${health.durationMs}ms ago` : "Run health check to see results"}
            </p>
            <Button variant="liquidGlassDark" size="sm" onClick={loadHealth} disabled={loadingHealth}>
              <Activity className={`w-4 h-4 mr-2 ${loadingHealth ? "animate-spin" : ""}`} />
              {loadingHealth ? "Checking…" : "Run Check"}
            </Button>
          </div>

          {health && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Checks Run" value={health.summary?.totalChecks} />
                <MetricCard label="Passed" value={health.summary?.passed} color="text-emerald-700" />
                <MetricCard label="Critical Failed" value={health.summary?.criticalFailed} color={health.summary?.criticalFailed > 0 ? "text-red-700" : "text-emerald-700"} />
                <MetricCard label="Warnings" value={health.summary?.warningFailed} color={health.summary?.warningFailed > 0 ? "text-amber-700" : "text-emerald-700"} />
              </div>

              <div className="space-y-3">
                {(health.checks || []).map((check: any, i: number) => (
                  <div key={i} className={`glass-card-hero p-4 rounded-xl flex items-start gap-3 ${!check.passed && check.severity === 'CRITICAL' ? 'border border-red-200 bg-red-50/50' : !check.passed && check.severity === 'WARNING' ? 'border border-amber-200 bg-amber-50/50' : ''}`}>
                    <div className="shrink-0 mt-0.5">
                      {check.passed
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        : check.severity === 'CRITICAL'
                          ? <XCircle className="w-5 h-5 text-red-600" />
                          : <AlertCircle className="w-5 h-5 text-amber-600" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#2c1208] mb-0.5 font-mono">{check.check}</div>
                      <div className="text-sm text-[#7a4020]">{check.detail}</div>
                      {check.data && check.data.length > 0 && (
                        <div className="mt-1 text-xs text-[#7a4020]/70 font-mono bg-black/5 rounded p-2 max-h-24 overflow-auto">
                          {JSON.stringify(check.data, null, 1).slice(0, 300)}
                        </div>
                      )}
                    </div>
                    <span className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ml-auto ${check.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : check.severity === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {check.severity}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </AdminShell>
  );
}
