import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Play, Pause, Square, Lock, RefreshCw, Download, Plus, Timer,
  MapPin, Users, CheckCircle2, Wifi, AlertTriangle, Maximize, 
  Minimize, Clock, Activity, Search, Filter, SlidersHorizontal, ArrowRight
} from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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

// ── Status Dot ──────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const config: Record<string, string> = {
    pending: "bg-amber-500",
    active: "bg-emerald-500",
    paused: "bg-blue-500",
    ended: "bg-gray-500",
    locked: "bg-red-500",
  };
  const dotClass = config[status] || config.pending;
  return (
    <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className={`w-2.5 h-2.5 rounded-full ${dotClass} ${status === 'active' ? 'animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : ''}`} />
      {status}
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

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("All Schools");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortFilter, setSortFilter] = useState("Newest First");

  // Confirmation dialog state for destructive actions
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

  // ── Derived Data & Statistics ─────────────────────────────────────────────
  const sessionStats = useMemo(() => {
    return {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'active').length,
      paused: sessions.filter(s => s.status === 'paused').length,
      locked: sessions.filter(s => s.status === 'locked').length,
      ended: sessions.filter(s => s.status === 'ended').length,
    };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.event_id.toLowerCase().includes(q) ||
        s.venue.toLowerCase().includes(q) ||
        s.programme_name.toLowerCase().includes(q)
      );
    }

    // School
    if (schoolFilter !== "All Schools") {
      result = result.filter(s => s.programme_name === schoolFilter);
    }

    // Status
    if (statusFilter !== "All") {
      result = result.filter(s => s.status === statusFilter.toLowerCase());
    }

    // Sort
    result.sort((a, b) => {
      switch (sortFilter) {
        case "Oldest First":
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        case "Alphabetical":
          return a.event_id.localeCompare(b.event_id);
        case "Most Attendance":
          return b.total_present - a.total_present;
        case "Newest First":
        default:
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
    });

    return result;
  }, [sessions, searchQuery, schoolFilter, statusFilter, sortFilter]);

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

  const FiltersUI = () => (
    <>
      <div className="w-full sm:w-auto">
        <Select value={schoolFilter} onValueChange={setSchoolFilter}>
          <SelectTrigger className="w-full sm:w-[200px] h-10 bg-background/50 backdrop-blur border-border/50">
            <SelectValue placeholder="All Schools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All Schools">All Schools</SelectItem>
            {SCHOOLS.map(p => (
              <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-full sm:w-auto">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px] h-10 bg-background/50 backdrop-blur border-border/50">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Paused">Paused</SelectItem>
            <SelectItem value="Locked">Locked</SelectItem>
            <SelectItem value="Ended">Ended</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="w-full sm:w-auto">
        <Select value={sortFilter} onValueChange={setSortFilter}>
          <SelectTrigger className="w-full sm:w-[170px] h-10 bg-background/50 backdrop-blur border-border/50">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <SelectValue placeholder="Sort" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Newest First">Newest First</SelectItem>
            <SelectItem value="Oldest First">Oldest First</SelectItem>
            <SelectItem value="Most Attendance">Most Attendance</SelectItem>
            <SelectItem value="Alphabetical">Alphabetical</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <AdminShell title="Attendance Management" subtitle="Premium Operations Dashboard">
      
      {/* ── Sticky Command Bar ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 -mx-4 sm:-mx-8 px-4 sm:px-8 py-4 bg-background/80 backdrop-blur-xl border-b border-border/50 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex-1 flex items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by title, venue, room or school..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 w-full bg-background/50 backdrop-blur border-border/50 transition-shadow focus-visible:ring-primary/20"
            />
          </div>

          {/* Desktop Filters */}
          <div className="hidden lg:flex items-center gap-3">
            <FiltersUI />
          </div>

          {/* Mobile Filters */}
          <div className="lg:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="h-10 bg-background/50 backdrop-blur">
                  <Filter className="w-4 h-4 mr-2" /> Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl p-6">
                <SheetHeader className="mb-6">
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4">
                  <FiltersUI />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* New Session Button */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button variant="liquidGlassMaroon" size="default" className="shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" /> New Session
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

      <div className="space-y-8">
        
        {/* ── Statistics Row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
          {[
            { label: 'Active', value: sessionStats.active, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
            { label: 'Paused', value: sessionStats.paused, color: 'text-blue-600', bg: 'bg-blue-500/10' },
            { label: 'Locked', value: sessionStats.locked, color: 'text-red-600', bg: 'bg-red-500/10' },
            { label: 'Ended', value: sessionStats.ended, color: 'text-gray-600', bg: 'bg-gray-500/10' },
          ].map((stat, i) => (
            <div key={i} className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm flex items-center justify-between">
              <span className="font-semibold text-muted-foreground">{stat.label}</span>
              <div className={`w-10 h-10 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center font-bold text-lg tabular-nums`}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground font-medium">
            {sessionStats.total} Sessions <span className="opacity-50 mx-2">|</span> Showing {filteredSessions.length}
          </p>
        </div>

        {/* ── Active Session Panel ────────────────────────────────────────── */}
        {activeSession && (
          <div className="bg-card rounded-3xl p-6 md:p-8 border-2 border-primary/20 shadow-xl shadow-primary/5 mb-8">
            <div className="flex flex-col lg:flex-row gap-8">
              
              {/* QR Panel */}
              <div
                ref={qrContainerRef}
                className={`flex-1 flex flex-col items-center justify-center p-8 bg-muted/30 rounded-2xl border border-border/50 relative overflow-hidden ${
                  isFullscreen ? 'fixed inset-0 z-[100] bg-background' : ''
                }`}
              >
                <Button size="icon" variant="ghost" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground bg-background/50 backdrop-blur" onClick={toggleFullscreen}>
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </Button>
                {qrDataUrl ? (
                  <>
                    <div className="relative">
                      <div className="absolute -inset-4 bg-primary/20 blur-2xl rounded-full" />
                      <img
                        src={qrDataUrl}
                        alt="Attendance QR"
                        className="relative z-10 w-64 h-64 md:w-80 md:h-80 rounded-2xl shadow-xl bg-white p-4"
                      />
                    </div>
                    <div className="mt-8 flex items-center gap-3 bg-background px-4 py-2 rounded-full border shadow-sm">
                      <Timer className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Next rotation in</span>
                      <span className={`text-sm font-bold w-6 inline-block tabular-nums text-center ${qrCountdown <= 5 ? 'text-destructive' : 'text-primary'}`}>{qrCountdown}s</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-16">
                    <Wifi className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="font-semibold text-lg text-foreground">No QR Code Active</p>
                    <p className="text-sm mt-2 opacity-80">Start the session to generate a secure rolling QR code</p>
                  </div>
                )}
              </div>

              {/* Session Info & Controls */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-2xl md:text-3xl font-bold font-serif leading-tight text-foreground mb-3">{activeSession.event_id}</h3>
                    <StatusDot status={activeSession.status} />
                  </div>
                  <Button size="icon" variant="ghost" className="rounded-full bg-muted/50 hover:bg-muted" onClick={() => { setActiveSession(null); setQrDataUrl(null); }}>
                    ✕
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-muted-foreground mb-8">
                  <div className="flex items-center gap-2.5 bg-muted/30 p-3 rounded-xl border border-border/50">
                    <MapPin className="w-4 h-4 text-primary" /> <span className="font-medium truncate">{activeSession.venue}</span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-muted/30 p-3 rounded-xl border border-border/50">
                    <Clock className="w-4 h-4 text-primary" /> <span className="font-medium truncate">{activeSession.programme_name}</span>
                  </div>
                </div>

                {/* Control buttons */}
                <div className="flex flex-wrap gap-3 mb-8">
                  {activeSession.status === "pending" && (
                    <Button className="admin-btn-success shadow-lg shadow-emerald-500/20 rounded-xl" onClick={() => generateQr(activeSession.id)} disabled={actionLoading}>
                      <Play className="w-4 h-4 mr-2" /> Start & Generate QR
                    </Button>
                  )}
                  {activeSession.status === "active" && (
                    <>
                      <Button variant="outline" className="shadow-sm rounded-xl border-primary/20 hover:bg-primary/5" onClick={() => generateQr(activeSession.id)} disabled={actionLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Force Rotate
                      </Button>
                      <Button variant="outline" className="shadow-sm rounded-xl" onClick={() => updateStatus(activeSession.id, "paused")} disabled={actionLoading}>
                        <Pause className="w-4 h-4 mr-2" /> Pause
                      </Button>
                      <Button variant="destructive" className="shadow-lg shadow-red-500/20 rounded-xl" disabled={actionLoading} onClick={() => setConfirmAction({
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
                      <Button className="admin-btn-success shadow-lg shadow-emerald-500/20 rounded-xl" onClick={() => updateStatus(activeSession.id, "active")} disabled={actionLoading}>
                        <Play className="w-4 h-4 mr-2" /> Resume
                      </Button>
                      <Button variant="destructive" className="shadow-lg shadow-red-500/20 rounded-xl" disabled={actionLoading} onClick={() => setConfirmAction({
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
                    <Button variant="destructive" className="shadow-lg shadow-red-500/20 rounded-xl" disabled={actionLoading} onClick={() => setConfirmAction({
                      label: "Lock Attendance",
                      description: "This will permanently lock attendance for this session. Admins will not be able to make further changes without unlocking.",
                      status: "locked",
                      sessionId: activeSession.id,
                    })}>
                      <Lock className="w-4 h-4 mr-2" /> Lock
                    </Button>
                  )}
                  <Button variant="secondary" className="shadow-sm rounded-xl" onClick={() => exportCsv(activeSession.id)}>
                    <Download className="w-4 h-4 mr-2" /> CSV
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-2xl border border-emerald-500/20 p-5 flex flex-col justify-center">
                    <div className="text-4xl font-bold text-emerald-600 tabular-nums leading-none mb-2">{liveStats}</div>
                    <div className="text-xs uppercase tracking-widest text-emerald-700/80 font-bold">Students Present</div>
                  </div>
                  <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-2xl border border-blue-500/20 p-5 flex flex-col justify-center">
                    <div className="text-4xl font-bold text-blue-600 tabular-nums leading-none mb-2">{activeSession.qr_rotation_interval_seconds}s</div>
                    <div className="text-xs uppercase tracking-widest text-blue-700/80 font-bold">QR Rotation</div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-[250px] bg-background rounded-2xl border border-border/50 overflow-hidden shadow-sm">
                  <div className="bg-muted/30 p-4 border-b border-border/50">
                    <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
                      <Activity className="w-4 h-4 text-emerald-500" />
                      Recent Check-ins
                      {activeSession.status === "active" && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-auto" />
                      )}
                    </h4>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 admin-scroll-area max-h-80">
                    {liveRecords.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8 opacity-60">
                        <Users className="w-8 h-8 mb-2" />
                        <p className="text-sm">No check-ins yet</p>
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {liveRecords.map((rec, i) => (
                          <m.div
                            key={rec.id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center justify-between p-3 rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors border border-transparent hover:border-border/50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold tabular-nums shrink-0">
                                {i + 1}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold leading-tight truncate">{rec.student_name}</div>
                                <div className="text-xs text-muted-foreground mt-0.5 truncate">{rec.student_id}</div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end justify-center gap-1 text-xs text-muted-foreground shrink-0 pl-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="tabular-nums font-medium">
                                {rec.scanned_at?.toDate?.()
                                  ? rec.scanned_at.toDate().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                                  : "—"}
                              </span>
                            </div>
                          </m.div>
                        ))}
                      </AnimatePresence>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ── Sessions List ───────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-64 bg-muted/50 animate-pulse rounded-3xl" />
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-24 bg-card rounded-3xl border border-dashed border-border/60">
            <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="font-semibold text-lg text-foreground">No sessions found.</p>
            <p className="text-sm mt-2 text-muted-foreground">Try another search or clear your filters.</p>
            {(searchQuery || statusFilter !== 'All' || schoolFilter !== 'All Schools') && (
              <Button variant="outline" className="mt-6" onClick={() => {
                setSearchQuery(""); setStatusFilter("All"); setSchoolFilter("All Schools"); setSortFilter("Newest First");
              }}>
                Clear All Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence>
              {filteredSessions.map((session, idx) => (
                <m.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  className={`bg-card rounded-3xl p-6 flex flex-col h-full cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5 border ${
                    activeSession?.id === session.id 
                      ? 'border-primary ring-4 ring-primary/10 shadow-lg' 
                      : 'border-border/50 shadow-sm'
                  }`}
                  onClick={() => {
                    setActiveSession(session);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <div className="flex flex-col gap-4 mb-6">
                    <h3 className="font-bold font-serif text-xl leading-tight text-foreground line-clamp-2" title={session.event_id}>
                      {session.event_id}
                    </h3>
                    <StatusDot status={session.status} />
                  </div>
                  
                  <div className="py-4 border-y border-border/50 my-auto">
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-bold text-foreground tabular-nums leading-none tracking-tight">
                        {session.total_present}
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                        Present
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3 text-sm text-muted-foreground font-medium">
                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 shrink-0 text-primary/70" /> 
                      <span className="truncate">{session.venue}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 shrink-0 text-primary/70" />
                      <span className="truncate">{session.programme_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 shrink-0 text-primary/70" />
                      <span className="truncate">
                        {new Date(session.created_at || session.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  <div className="mt-8 pt-4 border-t border-border/30 flex items-center justify-between text-sm font-semibold text-primary group">
                    <span>View Live</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </m.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Confirmation Dialog for destructive actions ──────────────── */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive font-serif text-xl">
              <AlertTriangle className="w-5 h-5" />
              {confirmAction?.label}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2 leading-relaxed">
            {confirmAction?.description}
          </p>
          <DialogFooter className="gap-3 mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl shadow-lg shadow-red-500/20"
              disabled={actionLoading}
              onClick={async () => {
                if (!confirmAction) return;
                setConfirmAction(null);
                await updateStatus(confirmAction.sessionId, confirmAction.status);
              }}
            >
              {actionLoading ? "Processing..." : "Confirm Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
