import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Play, Pause, Square, Lock, RefreshCw, Download, Plus, Timer,
  MapPin, Users, CheckCircle2, Wifi, AlertTriangle, Maximize, 
  Minimize, Clock, Activity,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SCHOOLS } from "@/lib/constants";
import { auth, db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, onSnapshot, limit } from "firebase/firestore";

export const Route = createLazyFileRoute("/admin/attendance")({
  // @ts-expect-error - Route type options do not include head in this version
  head: () => ({
    meta: [
      { title: "Attendance · KRMU Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAttendance,
});

// ── Types ─────────────────────────────────────────────────────────────────────
interface AttendanceSession {
  id: string;
  event_id: string;
  programme_id: string;
  programme_name: string;
  venue: string;
  date: string;
  starts_at: string;
  ends_at: string;
  attendance_window_minutes: number;
  qr_rotation_interval_seconds: number;
  geofence_radius_meters: number;
  status: "pending" | "active" | "paused" | "ended" | "locked";
  total_present: number;
  created_at: string;
}

interface AttendanceRecord {
  id: string;
  student_id: string;
  student_name: string;
  programme_id: string;
  scanned_at: any;
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiCall(endpoint: string, body: any, method: string = "POST"): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();

  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  };

  if (method !== "GET" && method !== "HEAD") {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`/api/${endpoint}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API error");
  return data;
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { badge: string; dot: string }> = {
    pending: { badge: "admin-badge-warning", dot: "bg-amber-500" },
    active: { badge: "admin-badge-success", dot: "bg-emerald-500" },
    paused: { badge: "admin-badge-info", dot: "bg-blue-500" },
    ended: { badge: "admin-badge-neutral", dot: "bg-gray-500" },
    locked: { badge: "admin-badge-danger", dot: "bg-red-500" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 ${c.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════
function AdminAttendance() {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrCountdown, setQrCountdown] = useState(0);
  const [liveRecords, setLiveRecords] = useState<AttendanceRecord[]>([]);
  const [liveStats, setLiveStats] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Fix 5: Confirmation dialog state for destructive actions
  const [confirmAction, setConfirmAction] = useState<{
    label: string;
    description: string;
    status: string;
    sessionId: string;
  } | null>(null);

  // Form state
  const [formEventId, setFormEventId] = useState("");
  const [formProgramme, setFormProgramme] = useState("");
  const [formVenue, setFormVenue] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formStartsAt, setFormStartsAt] = useState("09:00");
  const [formEndsAt, setFormEndsAt] = useState("10:00");
  const [formWindow, setFormWindow] = useState(60);
  const [formRotation, setFormRotation] = useState(30);
  const [formRadius, setFormRadius] = useState(300);

  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  // ── Load sessions ─────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      const data = await apiCall("attendance-session", { action: "list" });
      setSessions(data.sessions || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── Live attendance listener (Firestore onSnapshot) ───────────────────────
  useEffect(() => {
    if (!activeSession || activeSession.status !== "active") return;

    const q = query(
      collection(db, "attendance_logs"),
      where("session_id", "==", activeSession.id),
      orderBy("scanned_at", "desc"),
      limit(100),
    );

    const unsub = onSnapshot(q, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
      setLiveRecords(records);
    });

    return () => unsub();
  }, [activeSession?.id, activeSession?.status]);

  // ── Live stats polling ────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!activeSession) return;
    try {
      const data = await apiCall(`attendance-stats?sessionId=${activeSession.id}`, null, "GET");
      if (data.ok) {
        setLiveStats(data.total_present);
        
        // Also update the session in the main list so it doesn't stay at 0
        setSessions(prev => prev.map(s => 
          s.id === activeSession.id ? { ...s, total_present: data.total_present } : s
        ));
      }
    } catch(e) { }
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession || activeSession.status !== "active") return;
    fetchStats();
    const intId = setInterval(fetchStats, 5000); // 5 sec interval
    return () => clearInterval(intId);
  }, [activeSession?.id, activeSession?.status, fetchStats]);

  // ── QR polling & countdown ────────────────────────────────────────────────
  const fetchAndRenderQr = useCallback(async () => {
    if (!activeSession) return;
    try {
      const data = await apiCall("attendance-qr", {
        action: "current",
        sessionId: activeSession.id,
      });

      if (data.qr_encoded) {
        const url = await QRCode.toDataURL(data.qr_encoded, {
          width: 400,
          margin: 2,
          color: { dark: "#1a1a2e", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        setQrDataUrl(url);
        setQrCountdown(data.rotation_interval || 30);
      }
    } catch (e: any) {
      console.error("QR fetch error:", e);
    }
  }, [activeSession]);

  // Start QR rotation polling
  const startQrRotation = useCallback((intervalSec: number) => {
    // Clear existing
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    // Initial fetch
    fetchAndRenderQr();

    // Poll for new QR at rotation interval
    qrIntervalRef.current = setInterval(() => {
      fetchAndRenderQr();
    }, intervalSec * 1000);

    // Countdown timer (ticks every second)
    countdownRef.current = setInterval(() => {
      setQrCountdown((prev) => (prev > 0 ? prev - 1 : intervalSec));
    }, 1000);
  }, [fetchAndRenderQr]);

  // Cleanup intervals
  useEffect(() => {
    return () => {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ── Create session ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const programme = SCHOOLS.find(p => p.id === formProgramme);
    if (!programme) { toast.error("Select a programme"); return; }
    if (!formEventId.trim()) { toast.error("Enter event/session title"); return; }
    if (!formVenue.trim()) { toast.error("Enter venue"); return; }

    setActionLoading(true);
    try {
      const data = await apiCall("attendance-session", {
        action: "create",
        event_id: formEventId.trim(),
        programme_id: programme.id,
        programme_name: programme.name,
        venue: formVenue.trim(),
        date: formDate,
        starts_at: `${formDate}T${formStartsAt}:00`,
        ends_at: `${formDate}T${formEndsAt}:00`,
        attendance_window_minutes: formWindow,
        qr_rotation_interval_seconds: formRotation,
        geofence_radius_meters: formRadius,
      });
      toast.success("Session created!");
      setShowCreate(false);
      loadSessions();
      // Reset form
      setFormEventId("");
      setFormVenue("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Session controls ──────────────────────────────────────────────────────
  const updateStatus = async (sessionId: string, status: string) => {
    setActionLoading(true);
    try {
      await apiCall("attendance-session", { action: "update_status", sessionId, status });
      toast.success(`Session ${status}`);

      // Update local state
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: status as any } : s));
      if (activeSession?.id === sessionId) {
        setActiveSession(prev => prev ? { ...prev, status: status as any } : null);
      }

      // If activating, start QR rotation
      if (status === "active" && activeSession) {
        startQrRotation(activeSession.qr_rotation_interval_seconds || 30);
      }

      // If pausing/ending, stop rotation
      if (status === "paused" || status === "ended" || status === "locked") {
        if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
        setQrDataUrl(null);
        setQrCountdown(0);
      }

      loadSessions();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Generate / Force Rotate QR ────────────────────────────────────────────
  const generateQr = async (sessionId: string) => {
    setActionLoading(true);
    try {
      const data = await apiCall("attendance-qr", { action: "generate", sessionId });
      if (data.qr_encoded) {
        const url = await QRCode.toDataURL(data.qr_encoded, {
          width: 400, margin: 2,
          color: { dark: "#1a1a2e", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        setQrDataUrl(url);
        setQrCountdown(data.rotation_interval || 30);

        // Ensure session is now active and selected
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
          setActiveSession({ ...session, status: "active" });
          startQrRotation(session.qr_rotation_interval_seconds || 30);
        }
      }
      toast.success("QR generated!");
      loadSessions();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const exportCsv = async (sessionId: string) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");
      const token = await user.getIdToken();

      const res = await fetch("/api/attendance-export", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance_${sessionId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Fullscreen toggle ─────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      qrContainerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <AdminShell title="Attendance Management" subtitle="Create sessions, generate QR codes, track live attendance">
      <div className="space-y-6">

        {/* ── Header Bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-xl font-bold">Attendance Sessions</h2>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button variant="liquidGlassMaroon" size="sm">
                <Plus className="w-4 h-4 mr-1.5" /> New Session
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Attendance Session</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Event / Session Title</Label>
                  <Input
                    placeholder="e.g. Orientation Day 1 — Morning"
                    value={formEventId}
                    onChange={e => setFormEventId(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Programme / School</Label>
                  <Select value={formProgramme} onValueChange={setFormProgramme}>
                    <SelectTrigger><SelectValue placeholder="Select programme" /></SelectTrigger>
                    <SelectContent>
                      {SCHOOLS.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Venue</Label>
                  <Input placeholder="e.g. Main Auditorium" value={formVenue} onChange={e => setFormVenue(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Start</Label>
                    <Input type="time" value={formStartsAt} onChange={e => setFormStartsAt(e.target.value)} />
                  </div>
                  <div>
                    <Label>End</Label>
                    <Input type="time" value={formEndsAt} onChange={e => setFormEndsAt(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>QR Rotation (s)</Label>
                    <Input
                      type="number" min={15} max={120}
                      value={formRotation}
                      onChange={e => setFormRotation(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Window (min)</Label>
                    <Input
                      type="number" min={5} max={180}
                      value={formWindow}
                      onChange={e => setFormWindow(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Geofence (m)</Label>
                    <Input
                      type="number" min={100} max={1000}
                      value={formRadius}
                      onChange={e => setFormRadius(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button variant="liquidGlassMaroon" onClick={handleCreate} disabled={actionLoading}>
                  {actionLoading ? "Creating..." : "Create Session"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Active Session Panel ────────────────────────────────────────── */}
        {activeSession && (
          <div className="admin-card mb-8">
            <div className="flex flex-col lg:flex-row gap-6">
              
              {/* QR Panel */}
              <div
                ref={qrContainerRef}
                className={`flex-1 flex flex-col items-center justify-center p-6 bg-muted/20 rounded-2xl border relative ${
                  isFullscreen ? 'fixed inset-0 z-[100] bg-background' : ''
                }`}
              >
                <Button size="icon" variant="ghost" className="absolute top-3 right-3 text-muted-foreground hover:text-foreground" onClick={toggleFullscreen}>
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </Button>
                {qrDataUrl ? (
                  <>
                    <img
                      src={qrDataUrl}
                      alt="Attendance QR"
                      className="w-64 h-64 md:w-80 md:h-80 rounded-2xl shadow-sm bg-white p-3"
                    />
                    <div className="mt-6 flex items-center gap-2 text-sm font-medium">
                      <Timer className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Next rotation in:</span>
                      <strong className={`${qrCountdown <= 5 ? 'text-destructive' : 'text-success'} w-6 inline-block tabular-nums`}>{qrCountdown}s</strong>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-center max-w-[250px]">Display this QR on the projector or smart panel</p>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-16">
                    <Wifi className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-medium text-foreground">No QR Code Active</p>
                    <p className="text-xs mt-1">Start the session to generate a QR code</p>
                  </div>
                )}
              </div>

              {/* Session Info & Controls */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="admin-section-title mb-2">{activeSession.event_id}</h3>
                    <StatusBadge status={activeSession.status} />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => { setActiveSession(null); setQrDataUrl(null); }}>
                    ✕
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-5 mb-6">
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {activeSession.venue}</span>
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {activeSession.programme_name}</span>
                </div>

                {/* Control buttons */}
                <div className="flex flex-wrap gap-2 mb-8">
                  {activeSession.status === "pending" && (
                    <Button className="admin-btn-success shadow-sm rounded-lg" onClick={() => generateQr(activeSession.id)} disabled={actionLoading}>
                      <Play className="w-4 h-4 mr-2" /> Start & Generate QR
                    </Button>
                  )}
                  {activeSession.status === "active" && (
                    <>
                      <Button variant="outline" className="shadow-sm rounded-lg" onClick={() => generateQr(activeSession.id)} disabled={actionLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Force Rotate
                      </Button>
                      <Button variant="outline" className="shadow-sm rounded-lg" onClick={() => updateStatus(activeSession.id, "paused")} disabled={actionLoading}>
                        <Pause className="w-4 h-4 mr-2" /> Pause
                      </Button>
                      <Button variant="destructive" className="shadow-sm rounded-lg" disabled={actionLoading} onClick={() => setConfirmAction({
                        label: "End Attendance",
                        description: "Students will no longer be able to mark attendance. This cannot be undone without admin action.",
                        status: "ended",
                        sessionId: activeSession.id,
                      })}>
                        <Square className="w-4 h-4 mr-2" /> End
                      </Button>
                    </>
                  )}
                  {activeSession.status === "paused" && (
                    <>
                      <Button className="admin-btn-success shadow-sm rounded-lg" onClick={() => updateStatus(activeSession.id, "active")} disabled={actionLoading}>
                        <Play className="w-4 h-4 mr-2" /> Resume
                      </Button>
                      <Button variant="destructive" className="shadow-sm rounded-lg" disabled={actionLoading} onClick={() => setConfirmAction({
                        label: "End Attendance",
                        description: "Students will no longer be able to mark attendance. This cannot be undone without admin action.",
                        status: "ended",
                        sessionId: activeSession.id,
                      })}>
                        <Square className="w-4 h-4 mr-2" /> End
                      </Button>
                    </>
                  )}
                  {activeSession.status === "ended" && (
                    <Button variant="destructive" className="shadow-sm rounded-lg" disabled={actionLoading} onClick={() => setConfirmAction({
                      label: "Lock Attendance",
                      description: "This will permanently lock attendance for this session. Admins will not be able to make further changes without unlocking.",
                      status: "locked",
                      sessionId: activeSession.id,
                    })}>
                      <Lock className="w-4 h-4 mr-2" /> Lock
                    </Button>
                  )}
                  <Button variant="outline" className="shadow-sm rounded-lg" onClick={() => exportCsv(activeSession.id)}>
                    <Download className="w-4 h-4 mr-2" /> CSV
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-emerald-500/10 rounded-2xl text-center py-5">
                    <div className="text-3xl font-bold text-emerald-600 tabular-nums leading-none">{liveStats}</div>
                    <div className="text-[11px] uppercase tracking-wider text-emerald-700/80 font-bold mt-2">Students Present</div>
                  </div>
                  <div className="bg-blue-500/10 rounded-2xl text-center py-5">
                    <div className="text-3xl font-bold text-blue-600 tabular-nums leading-none">{activeSession.qr_rotation_interval_seconds}s</div>
                    <div className="text-[11px] uppercase tracking-wider text-blue-700/80 font-bold mt-2">QR Rotation</div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-[250px]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                      <Activity className="w-4 h-4 text-emerald-500" />
                      Recent Check-ins
                      {activeSession.status === "active" && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1" />
                      )}
                    </h4>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-2 space-y-2 admin-scroll-area max-h-80">
                    {liveRecords.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8 bg-muted/20 rounded-xl">
                        No check-ins yet. Students will appear here in real-time.
                      </p>
                    ) : (
                      liveRecords.map((rec, i) => (
                        <div
                          key={rec.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-xs font-bold tabular-nums shrink-0">
                              {i + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold leading-tight truncate">{rec.student_name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 truncate">{rec.student_id}</div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end justify-center gap-1 text-xs text-muted-foreground shrink-0 pl-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="tabular-nums">
                              {rec.scanned_at?.toDate?.()
                                ? rec.scanned_at.toDate().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                                : "—"}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ── Sessions List ───────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="h-40 admin-skeleton rounded-2xl" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No attendance sessions yet</p>
            <p className="text-sm mt-1">Create your first session to start tracking attendance</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map(session => (
              <div
                key={session.id}
                className={`admin-card flex flex-col h-full cursor-pointer border-2 transition-all hover:-translate-y-1 ${
                  activeSession?.id === session.id ? 'border-primary/50 bg-primary/5 shadow-md' : 'border-transparent'
                }`}
                onClick={() => setActiveSession(session)}
              >
                <div className="flex justify-between items-start mb-4 gap-3">
                  <div className="flex flex-col gap-2.5">
                    <span className="font-bold text-base leading-tight text-foreground">{session.event_id}</span>
                    <StatusBadge status={session.status} />
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <div className="text-2xl font-bold text-primary tabular-nums leading-none">{session.total_present}</div>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-1.5">Present</div>
                  </div>
                </div>

                <div className="mt-auto space-y-2.5 text-sm text-muted-foreground pt-3 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 shrink-0" /> 
                    <span className="truncate">{session.venue}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 shrink-0" />
                    <span className="truncate">{session.programme_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span className="truncate">{session.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Fix 5: Confirmation Dialog for destructive actions ──────────────── */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {confirmAction?.label}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {confirmAction?.description}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={actionLoading}
              onClick={async () => {
                if (!confirmAction) return;
                setConfirmAction(null);
                await updateStatus(confirmAction.sessionId, confirmAction.status);
              }}
            >
              {actionLoading ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
