import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Plus, QrCode as QrIcon, Trash2, Printer, Power, PowerOff } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listEvents, createEvent, updateEvent, deleteEvent } from "@/lib/admin.functions";
import { getDepartments } from "@/lib/students.functions";

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
  departments?: { name: string };
};

export const Route = createLazyFileRoute("/admin/events")({
  head: () => ({ meta: [{ title: "Events · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminEvents,
});

const LOCAL_DEPARTMENTS = [
  { id: "soet", code: "SOET", name: "School of Engineering & Technology" },
  { id: "soms", code: "SOMS", name: "School of Management Studies" },
  { id: "sols", code: "SOLS", name: "School of Legal Studies" },
  { id: "soa", code: "SOA", name: "School of Architecture" },
  { id: "soah", code: "SOAH", name: "School of Allied Health Sciences" },
  { id: "soe", code: "SOE", name: "School of Education" },
  { id: "somc", code: "SOMC", name: "School of Media & Communication" },
  { id: "sosc", code: "SOSC", name: "School of Science" },
  { id: "sohs", code: "SOHS", name: "School of Hospitality Studies" },
  { id: "sofa", code: "SOFA", name: "School of Fine Arts & Design" },
];

function AdminEvents() {
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [qrEvent, setQrEvent] = useState<EventRow | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string; code: string }[]>([]);

  const load = async () => {
    try {
      const fbData = await listEvents() as any;
      setRows(fbData as unknown as EventRow[]);
    } catch (e: any) {
      console.warn("Firebase listEvents failed", e);
      setRows([]);
    }
  };

  const loadDepartments = async () => {
    try {
      const { departments } = (await Promise.race([
        getDepartments(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
      ])) as any;
      if (departments && departments.length > 0) {
        setDepartments(departments);
      } else {
        setDepartments(LOCAL_DEPARTMENTS);
      }
    } catch (e: any) {
      console.warn("Failed to load departments from server, using local fallback", e);
      setDepartments(LOCAL_DEPARTMENTS);
    }
  };
  
  useEffect(() => { 
    load(); 
    loadDepartments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          {rows.map((r) => <EventCard key={r.id} row={r} onChanged={load} onOpenQr={() => setQrEvent(r)} departments={departments} />)}
        </div>
      )}

      <QrDialog event={qrEvent} onClose={() => setQrEvent(null)} />
    </AdminShell>
  );
}

function EventCard({ row, onChanged, onOpenQr, departments }: { row: EventRow; onChanged: () => void; onOpenQr: () => void; departments: { id: string; name: string }[] }) {
  const toggle = async () => {
    try { 
      await updateEvent({ data: { id: row.id, is_active: !row.is_active } }); 
      toast.success(`Event ${!row.is_active ? "activated" : "paused"}`); 
      onChanged();
    }
    catch (e: any) {
      console.warn("Event update failed", e);
      toast.error("Failed to update event");
    }
  };
  const remove = async () => {
    if (!confirm(`Permanently delete "${row.title}"?\n\nThis will also remove related attendance records.`)) return;
    try { 
      await deleteEvent({ data: { id: row.id } }); 
      toast.success("Event deleted"); 
      onChanged();
    }
    catch (e: any) {
      console.warn("Event delete failed", e);
      toast.error("Failed to delete event");
    }
  };

  const deptName = departments.find(d => d.id === row.department_id)?.name || "All Schools";

  return (
    <div className="glass-premium-v2 rounded-2xl p-4 sm:p-5 border border-[#8a4a22]/8 shadow-sm hover:shadow-md transition-shadow">
      {/* Top row: badges */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="rounded-lg bg-[#8a4a22]/10 px-2.5 py-1 text-xs font-bold text-[#5a2c14] tracking-wide">
          Day {row.day_number}
        </span>
        {row.is_active
          ? <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-700">LIVE</span>
          : <span className="rounded-lg bg-[#8a4a22]/8 px-2.5 py-1 text-xs font-semibold text-[#8a4a22]/60">Paused</span>
        }
        <span className="rounded-lg bg-[#8a4a22]/8 px-2.5 py-1 text-xs font-semibold text-[#7a4020]/80 max-w-[200px] truncate">
          {deptName}
        </span>
      </div>

      {/* Title + meta */}
      <h3 className="font-bold text-[#2c1208] text-base leading-snug mb-1">{row.title}</h3>
      <p className="text-sm text-[#7a4020]/70 font-medium mb-1">
        {row.venue} · {new Date(row.starts_at).toLocaleString()} → {new Date(row.ends_at).toLocaleTimeString()}
      </p>
      {row.description && (
        <p className="mt-2 line-clamp-2 text-sm text-[#7a4020]/60 leading-relaxed">{row.description}</p>
      )}

      {/* Divider */}
      <div className="mt-4 pt-3 border-t border-[#8a4a22]/8 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="liquidGlassWhite" className="rounded-full h-8 text-xs font-bold" onClick={onOpenQr}>
          <QrIcon className="mr-1.5 h-3.5 w-3.5" /> QR Code
        </Button>
        <Button size="sm" variant="liquidGlassWhite" className="rounded-full h-8 text-xs font-bold" onClick={toggle}>
          {row.is_active
            ? <><PowerOff className="mr-1.5 h-3.5 w-3.5" /> Pause</>
            : <><Power className="mr-1.5 h-3.5 w-3.5" /> Activate</>}
        </Button>
        <EventDialog row={row} onSaved={onChanged} departments={departments} />

        {/* Delete — clearly labeled, destructive red */}
        <Button
          size="sm"
          variant="liquidGlassDestructive"
          className="rounded-full h-8 text-xs font-bold ml-auto"
          onClick={remove}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventDialog({ row, onSaved, departments }: { row?: EventRow; onSaved: () => void; departments: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: row?.title ?? "", description: row?.description ?? "",
    day_number: row?.day_number ?? 1, venue: row?.venue ?? "",
    starts_at: row ? toLocalInput(row.starts_at) : "", ends_at: row ? toLocalInput(row.ends_at) : "",
    department_id: row?.department_id ?? "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.title.trim()) {
      toast.error("Please provide a title");
      return;
    }
    
    if (!form.venue.trim()) {
      toast.error("Please provide a venue");
      return;
    }

    if (!form.department_id) {
      toast.error("Please select a school");
      return;
    }
    
    if (!form.starts_at || !form.ends_at) {
      toast.error("Please provide valid start and end times");
      return;
    }
    
    const parseDate = (dStr: string) => {
      let d = new Date(dStr);
      if (isNaN(d.getTime())) {
        d = new Date(dStr.replace(" , ", " "));
      }
      if (isNaN(d.getTime())) {
        throw new Error("Invalid date");
      }
      return d.toISOString();
    };

    let starts_at_iso, ends_at_iso;
    try {
      starts_at_iso = parseDate(form.starts_at);
      ends_at_iso = parseDate(form.ends_at);
    } catch (e) {
      const msg = `Invalid date format provided. Please use YYYY-MM-DD HH:MM.`;
      toast.error(msg);
      alert(msg);
      return;
    }

    const payload = {
      title: form.title, description: form.description || null,
      day_number: Number(form.day_number), venue: form.venue,
      starts_at: starts_at_iso,
      ends_at: ends_at_iso,
      department_id: form.department_id,
      is_active: true,
    };

    try {
      if (row) {
        await updateEvent({ data: { id: row.id, ...payload } });
      } else {
        await createEvent({ data: payload });
      }
      
      toast.success(row ? "Event updated" : "Event created");
      setOpen(false); 
      onSaved();
    } catch (err: any) {
      console.warn("Firebase event create/update failed", err);
      const msg = `Failed to save event: ${err.message || err.toString()}`;
      toast.error(msg);
      alert(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {row ? <Button size="sm" variant="liquidGlassWhite" className="rounded-full">Edit</Button>
             : <Button variant="liquidGlassDark" className="rounded-full"><Plus className="mr-1 h-4 w-4" /> New event</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{row ? "Edit event" : "New event"}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="School">
            <Select value={form.department_id || undefined} onValueChange={(v) => setForm({ ...form, department_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select School" /></SelectTrigger>
              <SelectContent>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day"><Input type="number" min={1} max={10} value={form.day_number} onChange={(e) => setForm({ ...form, day_number: Number(e.target.value) })} /></Field>
            <Field label="Venue"><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts at"><Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
            <Field label="Ends at"><Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></Field>
          </div>
          <Field label="Description"><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <DialogFooter><Button type="button" onClick={submit} variant="liquidGlassDark" className="rounded-full">Save</Button></DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}

function QrDialog({ event, onClose }: { event: EventRow | null; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [scanUrl, setScanUrl] = useState<string>("");

  useEffect(() => {
    if (!event) return;
    const url = `${window.location.origin}/scan/${event.qr_token}`;
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
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
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
