import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { getAuth } from "firebase/auth";
import {
  Plus, QrCode as QrIcon, Trash2, Printer, Power, PowerOff,
  RefreshCw, Download, Search, Users, ChevronLeft, ChevronRight,
  Radio, WifiOff,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  listEvents, createEvent, updateEventWithOCC, deleteEvent,
  getEventAttendanceUrl, listEventAttendance, exportEventAttendanceCsv,
} from "@/lib/admin.functions";
import { getDepartments } from "@/lib/students.functions";
import { useVisibilityPolling } from "@/hooks/use-visibility-polling";

// ─── Types ────────────────────────────────────────────────────────────────────
type EventRow = {
  id: string;
  title: string;
  description: string | null;
  day_number: number;
  venue: string;
  starts_at: string;
  ends_at: string;
  qr_token: string;
  is_active: boolean;
  department_id: string;
  qr_enabled?: boolean;
  capacity?: number;
  attendance_count?: number;
  allow_overflow?: boolean;
  version?: number;
  departments?: { name: string };
};

type AttendanceRecord = {
  id: string;
  application_number: string;
  student_name: string;
  department: string;
  school: string;
  status: string;
  verification_method: string;
  device_type: string;
  browser: string;
  os: string;
  server_timestamp: string | null;
  created_at: string | null;
};

// ─── Route ────────────────────────────────────────────────────────────────────
export const Route = createLazyFileRoute("/admin/events")({
  // @ts-expect-error - Route type options do not include head in this version
  head: () => ({ meta: [{ title: "Events · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminEvents,
});

const LOCAL_DEPARTMENTS = [
  { id: "soet", code: "SOET", name: "School of Engineering & Technology" },
  { id: "soms", code: "SOMS", name: "School of Management Studies" },
  { id: "sols", code: "SOLS", name: "School of Legal Studies" },
  { id: "soa",  code: "SOA",  name: "School of Architecture" },
  { id: "soah", code: "SOAH", name: "School of Allied Health Sciences" },
  { id: "soe",  code: "SOE",  name: "School of Education" },
  { id: "somc", code: "SOMC", name: "School of Media & Communication" },
  { id: "sosc", code: "SOSC", name: "School of Science" },
  { id: "sohs", code: "SOHS", name: "School of Hospitality Studies" },
  { id: "sofa", code: "SOFA", name: "School of Fine Arts & Design" },
];

// ─── Main Component ───────────────────────────────────────────────────────────
function AdminEvents() {
  const [rows,        setRows]        = useState<EventRow[] | null>(null);
  const [qrEvent,     setQrEvent]     = useState<EventRow | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string; code: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const fbData = await listEvents() as any;
      setRows(fbData as unknown as EventRow[]);
    } catch (e: any) {
      console.warn("Firebase listEvents failed", e);
      setRows([]);
    }
  }, []);

  const loadDepartments = async () => {
    try {
      const { departments } = (await Promise.race([
        getDepartments(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
      ])) as any;
      if (departments && departments.length > 0) setDepartments(departments);
      else setDepartments(LOCAL_DEPARTMENTS);
    } catch {
      setDepartments(LOCAL_DEPARTMENTS);
    }
  };

  useEffect(() => { load(); loadDepartments(); }, [load]);

  return (
    <AdminShell title="Events" subtitle="Create induction sessions, toggle live status, print QR posters.">
      <div className="mb-4 flex justify-end">
        <EventDialog onSaved={load} departments={departments} />
      </div>

      {!rows ? (
        <div className="grid gap-3" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border glass-card-hero p-8 text-center text-sm text-muted-foreground">No events yet. Create one to get started.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <EventCard key={r.id} row={r} onChanged={load} onOpenQr={() => setQrEvent(r)} departments={departments} />
          ))}
        </div>
      )}

      <QrDialog event={qrEvent} onClose={() => setQrEvent(null)} />
    </AdminShell>
  );
}

// ─── EventCard ────────────────────────────────────────────────────────────────
function EventCard({
  row, onChanged, onOpenQr, departments,
}: { row: EventRow; onChanged: () => void; onOpenQr: () => void; departments: { id: string; name: string }[] }) {
  const [showAttendance, setShowAttendance] = useState(false);

  const toggle = async () => {
    try {
      await updateEventWithOCC({ data: { id: row.id, is_active: !row.is_active, expected_version: row.version } });
      toast.success(`Event ${!row.is_active ? "activated" : "paused"}`);
      onChanged();
    } catch (e: any) {
      if ((e as any).code === "CONFLICT") {
        toast.error("Conflict: another admin just updated this event. Reloading…");
        onChanged();
      } else {
        toast.error("Failed to update event");
      }
    }
  };

  const toggleQr = async () => {
    const newQrEnabled = !(row.qr_enabled ?? true);
    try {
      await updateEventWithOCC({ data: { id: row.id, qr_enabled: newQrEnabled, expected_version: row.version } });
      toast.success(newQrEnabled ? "QR attendance enabled" : "QR attendance disabled");
      onChanged();
    } catch (e: any) {
      toast.error((e as any).code === "CONFLICT" ? "Conflict — reloading…" : "Failed to update");
      onChanged();
    }
  };

  const remove = async () => {
    if (!confirm(`Permanently delete "${row.title}"?\n\nThis will also remove related attendance records.`)) return;
    try {
      await deleteEvent({ data: { id: row.id } });
      toast.success("Event deleted");
      onChanged();
    } catch {
      toast.error("Failed to delete event");
    }
  };

  const deptName = departments.find(d => d.id === row.department_id)?.name || "All Schools";
  const attendCount = row.attendance_count ?? 0;
  const isFull = row.capacity !== undefined && !row.allow_overflow && attendCount >= row.capacity;
  const qrEnabled = row.qr_enabled ?? true;

  return (
    <div className="glass-premium-v2 rounded-2xl border border-[#8a4a22]/8 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="p-4 sm:p-5">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="rounded-lg bg-[#8a4a22]/10 px-2.5 py-1 text-xs font-bold text-[#5a2c14] tracking-wide">Day {row.day_number}</span>
          {row.is_active
            ? <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-700">LIVE</span>
            : <span className="rounded-lg bg-[#8a4a22]/8 px-2.5 py-1 text-xs font-semibold text-[#8a4a22]/60">Paused</span>
          }
          {!qrEnabled && (
            <span className="rounded-lg bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-600 flex items-center gap-1">
              <WifiOff className="h-3 w-3" /> QR OFF
            </span>
          )}
          {isFull && (
            <span className="rounded-lg bg-orange-500/15 px-2.5 py-1 text-xs font-bold text-orange-600">FULL</span>
          )}
          <span className="rounded-lg bg-[#8a4a22]/8 px-2.5 py-1 text-xs font-semibold text-[#7a4020]/80 max-w-[200px] truncate">{deptName}</span>

          {/* Capacity badge */}
          {row.capacity !== undefined && (
            <span className="rounded-lg bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {attendCount}/{row.capacity} attended
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-bold text-[#2c1208] text-base leading-snug mb-1">{row.title}</h3>
        <p className="text-sm text-[#7a4020]/70 font-medium mb-1">
          {row.venue} · {new Date(row.starts_at).toLocaleString()} → {new Date(row.ends_at).toLocaleTimeString()}
        </p>
        {row.description && (
          <p className="mt-2 line-clamp-2 text-sm text-[#7a4020]/60 leading-relaxed">{row.description}</p>
        )}

        {/* Action row */}
        <div className="mt-4 pt-3 border-t border-[#8a4a22]/8 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="liquidGlassWhite" className="rounded-full h-8 text-xs font-bold" onClick={onOpenQr}>
            <QrIcon className="mr-1.5 h-3.5 w-3.5" /> QR Code
          </Button>
          <Button size="sm" variant="liquidGlassWhite" className="rounded-full h-8 text-xs font-bold" onClick={toggle}>
            {row.is_active ? <><PowerOff className="mr-1.5 h-3.5 w-3.5" /> Pause</> : <><Power className="mr-1.5 h-3.5 w-3.5" /> Activate</>}
          </Button>

          {/* Emergency QR toggle */}
          <Button
            size="sm"
            variant="liquidGlassWhite"
            className={`rounded-full h-8 text-xs font-bold ${!qrEnabled ? "border-red-400/40 text-red-600" : ""}`}
            onClick={toggleQr}
            title={qrEnabled ? "Disable QR attendance" : "Enable QR attendance"}
          >
            {qrEnabled ? <><Radio className="mr-1.5 h-3.5 w-3.5" /> QR On</> : <><WifiOff className="mr-1.5 h-3.5 w-3.5" /> QR Off</>}
          </Button>

          {/* Attendance panel toggle */}
          <Button
            size="sm"
            variant="liquidGlassWhite"
            className={`rounded-full h-8 text-xs font-bold ${showAttendance ? "bg-indigo-500/10 border-indigo-400/30 text-indigo-700" : ""}`}
            onClick={() => setShowAttendance(v => !v)}
          >
            <Users className="mr-1.5 h-3.5 w-3.5" /> Attendance
          </Button>

          <EventDialog row={row} onSaved={onChanged} departments={departments} />

          <Button size="sm" variant="liquidGlassDestructive" className="rounded-full h-8 text-xs font-bold ml-auto" onClick={remove}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Attendance panel */}
      {showAttendance && <AttendancePanel event={row} />}
    </div>
  );
}

// ─── AttendancePanel ──────────────────────────────────────────────────────────
function AttendancePanel({ event }: { event: EventRow }) {
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState<Record<string, string>>({});
  const [page,    setPage]    = useState(1);
  const [cursor,  setCursor]  = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const getToken = async (): Promise<string> => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  };

  const fetchData = useCallback(async (pg = 1, cur?: string) => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await listEventAttendance({
        token,
        event_id: event.id,
        page: pg,
        pageSize: 50,
        search,
        filter,
        cursor: cur,
      });
      setData(res);
    } catch (err: any) {
      toast.error(err.message || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [event.id, search, filter]);

  useEffect(() => { setPage(1); setCursor(undefined); setCursorHistory([]); fetchData(1); }, [event.id, search, filter]);

  // Smart polling — pauses when tab hidden
  const { refresh } = useVisibilityPolling(
    () => fetchData(page, cursor),
    15_000,
    { enabled: true },
  );

  const handleNextPage = () => {
    const nextCursor = data?.meta?.pagination?.nextCursor;
    if (!nextCursor) return;
    setCursorHistory(h => [...h, cursor ?? ""]);
    setCursor(nextCursor);
    const nextPage = page + 1;
    setPage(nextPage);
    fetchData(nextPage, nextCursor);
  };

  const handlePrevPage = () => {
    if (page <= 1) return;
    const prevHistory = [...cursorHistory];
    const prevCursor = prevHistory.pop() || undefined;
    setCursorHistory(prevHistory);
    setCursor(prevCursor);
    const prevPage = page - 1;
    setPage(prevPage);
    fetchData(prevPage, prevCursor);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = await getToken();
      await exportEventAttendanceCsv({ token, event_id: event.id, filter, eventTitle: event.title });
      toast.success("CSV exported successfully");
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const metrics = data?.meta?.metrics;
  const pagination = data?.meta?.pagination;
  const records: AttendanceRecord[] = data?.data ?? [];

  const MetricCard = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs text-white/50 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-white/30 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="border-t border-[#8a4a22]/10 bg-[#0f0f1a]/4 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-bold text-sm text-[#2c1208]">Attendance Records</h4>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchData(page, cursor)} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5 text-[#7a4020]/70" />
          </button>
          <Button size="sm" variant="liquidGlassWhite" className="rounded-full h-7 text-xs" onClick={handleExport} disabled={exporting}>
            <Download className="mr-1 h-3 w-3" /> {exporting ? "Exporting…" : "CSV"}
          </Button>
        </div>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 mb-4">
          <MetricCard label="Total" value={metrics.total_attendance ?? 0} />
          <MetricCard label="Capacity" value={metrics.capacity ?? "∞"} sub={metrics.attendance_pct != null ? `${metrics.attendance_pct}%` : undefined} />
          <MetricCard label="Remaining" value={metrics.remaining_seats ?? "∞"} />
          <MetricCard label="Present" value={metrics.total_present ?? 0} />
          {metrics.total_late > 0 && <MetricCard label="Late" value={metrics.total_late} />}
          {metrics.total_manual > 0 && <MetricCard label="Manual" value={metrics.total_manual} />}
          {metrics.duplicate_attempts > 0 && <MetricCard label="Duplicates" value={metrics.duplicate_attempts} />}
          {metrics.rejected_attempts > 0 && <MetricCard label="Rejected" value={metrics.rejected_attempts} />}
          {metrics.velocity_per_minute > 0 && (
            <MetricCard label="Velocity" value={`${metrics.velocity_per_minute}/min`} sub="last 5 min" />
          )}
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7a4020]/40" />
          <Input
            placeholder="Search by Application Number or Name…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-8 text-xs rounded-xl"
          />
        </div>
        <select
          value={filter.status || ""}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value || undefined! }))}
          className="h-8 text-xs rounded-xl border border-input bg-background px-2"
        >
          <option value="">All Status</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-sm text-[#7a4020]/50">Loading…</div>
      ) : records.length === 0 ? (
        <div className="text-center py-8 text-sm text-[#7a4020]/50">No attendance records yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#8a4a22]/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#8a4a22]/10 bg-[#8a4a22]/4">
                <th className="text-left p-2.5 font-semibold text-[#5a2c14]">Application No.</th>
                <th className="text-left p-2.5 font-semibold text-[#5a2c14]">Name</th>
                <th className="text-left p-2.5 font-semibold text-[#5a2c14]">Dept.</th>
                <th className="text-left p-2.5 font-semibold text-[#5a2c14]">Status</th>
                <th className="text-left p-2.5 font-semibold text-[#5a2c14]">Device</th>
                <th className="text-left p-2.5 font-semibold text-[#5a2c14]">Marked At</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id} className={`border-b border-[#8a4a22]/6 hover:bg-[#8a4a22]/3 transition-colors ${i % 2 === 0 ? "" : "bg-[#8a4a22]/2"}`}>
                  <td className="p-2.5 font-mono text-[#5a2c14] font-semibold">{r.application_number}</td>
                  <td className="p-2.5 text-[#2c1208]">{r.student_name}</td>
                  <td className="p-2.5 text-[#7a4020]/70 truncate max-w-[100px]">{r.department || r.school}</td>
                  <td className="p-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      r.status === "present" ? "bg-emerald-100 text-emerald-700" :
                      r.status === "late"    ? "bg-yellow-100 text-yellow-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>{r.status}</span>
                  </td>
                  <td className="p-2.5 text-[#7a4020]/60">{r.device_type} · {r.browser}</td>
                  <td className="p-2.5 text-[#7a4020]/60">
                    {r.server_timestamp
                      ? new Date(r.server_timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between mt-3 text-xs text-[#7a4020]/60">
          <span>Page {page} of {pagination.totalPages || 1} · {pagination.total} total</span>
          <div className="flex gap-1">
            <button
              onClick={handlePrevPage}
              disabled={!pagination.hasPrevPage}
              className="p-1.5 rounded-lg hover:bg-black/5 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNextPage}
              disabled={!pagination.hasNextPage}
              className="p-1.5 rounded-lg hover:bg-black/5 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EventDialog ──────────────────────────────────────────────────────────────
function toIso(val: string): string {
  if (!val) return "";
  const d = new Date(val);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

function EventDialog({
  row, onSaved, departments,
}: { row?: EventRow; onSaved: () => void; departments: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title:         row?.title ?? "",
    description:   row?.description ?? "",
    day_number:    row?.day_number ?? 1,
    venue:         row?.venue ?? "",
    starts_at:     row?.starts_at ?? "",
    ends_at:       row?.ends_at ?? "",
    department_id: row?.department_id ?? "",
    capacity:      row?.capacity !== undefined ? String(row.capacity) : "",
    allow_overflow:row?.allow_overflow ?? false,
    qr_enabled:    row?.qr_enabled ?? true,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim())        { toast.error("Please provide a title"); return; }
    if (!form.venue.trim())        { toast.error("Please provide a venue"); return; }
    if (!form.department_id)       { toast.error("Please select a school"); return; }
    if (!form.starts_at || !form.ends_at) { toast.error("Please provide valid start and end times"); return; }

    const starts_at = toIso(form.starts_at);
    const ends_at   = toIso(form.ends_at);
    if (!starts_at || !ends_at) { toast.error("Invalid date/time format"); return; }
    if (new Date(ends_at) <= new Date(starts_at)) { toast.error("End time must be after start time"); return; }

    const payload: Record<string, any> = {
      title:         form.title,
      description:   form.description || null,
      day_number:    Number(form.day_number),
      venue:         form.venue,
      starts_at,
      ends_at,
      department_id: form.department_id,
      is_active:     row?.is_active ?? true,
      qr_enabled:    form.qr_enabled,
      allow_overflow: form.allow_overflow,
    };

    // Capacity: only set if a valid number is provided
    if (form.capacity.trim() !== "") {
      const cap = parseInt(form.capacity, 10);
      if (!isNaN(cap) && cap > 0) payload.capacity = cap;
    }

    try {
      if (row) {
        await updateEventWithOCC({ data: { id: row.id, expected_version: row.version, ...payload } });
      } else {
        await createEvent({ data: payload });
      }
      toast.success(row ? "Event updated" : "Event created");
      setOpen(false);
      onSaved();
    } catch (err: any) {
      if ((err as any).code === "CONFLICT") {
        toast.error("Another admin updated this event. Please reload and try again.");
        setOpen(false);
        onSaved();
      } else {
        toast.error(`Failed to save: ${err.message}`);
      }
    }
  };

  const allDepts = [
    { id: "all", name: "All Schools" },
    ...departments,
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {row
          ? <Button size="sm" variant="liquidGlassWhite" className="rounded-full">Edit</Button>
          : <Button variant="liquidGlassDark" className="rounded-full"><Plus className="mr-1 h-4 w-4" /> New event</Button>
        }
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{row ? "Edit event" : "New event"}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          {/* School */}
          <Field label="School">
            <Select value={form.department_id || undefined} onValueChange={v => setForm({ ...form, department_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select School" /></SelectTrigger>
              <SelectContent>
                {allDepts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {/* Title */}
          <Field label="Title">
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </Field>

          {/* Day + Venue */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day">
              <Input type="number" min={1} max={10} value={form.day_number} onChange={e => setForm({ ...form, day_number: Number(e.target.value) })} />
            </Field>
            <Field label="Venue">
              <Input value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} />
            </Field>
          </div>

          {/* Start DateTime */}
          <Field label="Starts at">
            <DateTimePicker
              value={form.starts_at}
              onChange={iso => setForm(f => ({ ...f, starts_at: iso, ends_at: f.ends_at && new Date(f.ends_at) <= new Date(iso) ? "" : f.ends_at }))}
            />
          </Field>

          {/* End DateTime */}
          <Field label="Ends at">
            <DateTimePicker
              value={form.ends_at}
              min={form.starts_at || undefined}
              onChange={iso => setForm(f => ({ ...f, ends_at: iso }))}
            />
          </Field>

          {/* Description */}
          <Field label="Description">
            <Textarea rows={3} value={form.description ?? ""} onChange={e => setForm({ ...form, description: e.target.value })} />
          </Field>

          {/* Capacity */}
          <Field label="Capacity (optional — leave blank for unlimited)">
            <Input
              type="number" min={1} placeholder="e.g. 500"
              value={form.capacity}
              onChange={e => setForm({ ...form, capacity: e.target.value })}
            />
          </Field>

          {/* Allow Overflow */}
          {form.capacity.trim() !== "" && (
            <label className="flex items-center gap-3 cursor-pointer select-none text-sm">
              <input
                type="checkbox" checked={form.allow_overflow}
                onChange={e => setForm({ ...form, allow_overflow: e.target.checked })}
                className="h-4 w-4 accent-indigo-600"
              />
              <span>Allow overflow (accept registrations even when full)</span>
            </label>
          )}

          {/* QR Enabled toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none text-sm">
            <input
              type="checkbox" checked={form.qr_enabled}
              onChange={e => setForm({ ...form, qr_enabled: e.target.checked })}
              className="h-4 w-4 accent-indigo-600"
            />
            <span>QR attendance enabled</span>
          </label>

          <DialogFooter>
            <Button type="button" onClick={submit} variant="liquidGlassDark" className="rounded-full">Save</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}

// ─── QrDialog ─────────────────────────────────────────────────────────────────
function QrDialog({ event, onClose }: { event: EventRow | null; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [scanUrl, setScanUrl] = useState<string>("");

  useEffect(() => {
    if (!event) return;
    // Use the new versioned event attendance URL (isolated from induction)
    const url = getEventAttendanceUrl(event.id, 1);
    setScanUrl(url);
    QRCode.toDataURL(url, { width: 512, margin: 1 }).then(setDataUrl);
  }, [event]);

  const printIt = () => {
    if (!event) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${event.title} &middot; QR</title>
      <style>body{font-family:system-ui;text-align:center;padding:40px}h1{margin:0 0 8px}p{color:#555;margin:4px 0}img{margin:24px 0;width:380px;height:380px}</style>
      </head><body>
      <h1>${event.title}</h1>
      <p>Day ${event.day_number} &middot; ${event.venue}</p>
      <p>${new Date(event.starts_at).toLocaleString()}</p>
      <img src="${dataUrl}" />
      <p><b>Scan to mark attendance</b></p>
      <p style="font-size:12px;color:#888">${scanUrl}</p>
      </body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  return (
    <Dialog open={!!event} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{event?.title}</DialogTitle></DialogHeader>
        {dataUrl && <img src={dataUrl} alt="QR" className="mx-auto h-72 w-72" />}
        <p className="break-all text-center text-xs text-muted-foreground">{scanUrl}</p>
        <DialogFooter>
          <Button variant="liquidGlassWhite" className="rounded-full" onClick={() => navigator.clipboard.writeText(scanUrl).then(() => toast.success("Link copied"))}>Copy link</Button>
          <Button variant="liquidGlassDark" className="rounded-full" onClick={printIt}><Printer className="mr-1 h-4 w-4" /> Print poster</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
