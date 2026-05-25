import { createFileRoute } from "@tanstack/react-router";
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
import { localDb, type LocalEvent } from "@/lib/local-db";

export const Route = createFileRoute("/admin/events")({
  head: () => ({ meta: [{ title: "Events · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminEvents,
});

function AdminEvents() {
  const [rows, setRows] = useState<LocalEvent[] | null>(null);
  const [qrEvent, setQrEvent] = useState<LocalEvent | null>(null);

  const load = () => {
    setRows(localDb.getEvents());
  };
  
  useEffect(() => { load(); }, []);

  return (
    <AdminShell title="Events" subtitle="Create induction sessions, toggle live status, print QR posters.">
      <div className="mb-4 flex justify-end">
        <EventDialog onSaved={load} />
      </div>

      {!rows ? (
        <div className="grid gap-3" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No events yet. Create one to get started.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => <EventCard key={r.id} row={r} onChanged={load} onOpenQr={() => setQrEvent(r)} />)}
        </div>
      )}

      <QrDialog event={qrEvent} onClose={() => setQrEvent(null)} />
    </AdminShell>
  );
}

function EventCard({ row, onChanged, onOpenQr }: { row: LocalEvent; onChanged: () => void; onOpenQr: () => void }) {
  const toggle = () => {
    try { 
      localDb.updateEvent(row.id, { is_active: !row.is_active }); 
      onChanged(); 
      toast.success(`Event ${!row.is_active ? "activated" : "deactivated"}`); 
    }
    catch (e: any) { toast.error(e.message); }
  };
  const remove = () => {
    if (!confirm(`Delete "${row.title}"? This removes related attendance.`)) return;
    try { 
      localDb.deleteEvent(row.id); 
      onChanged(); 
      toast.success("Deleted"); 
    }
    catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Day {row.day_number}</span>
            {row.is_active
              ? <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs font-medium text-success">LIVE</span>
              : <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">paused</span>}
          </div>
          <h3 className="mt-1 truncate font-semibold">{row.title}</h3>
          <p className="text-xs text-muted-foreground">
            {row.venue} · {new Date(row.starts_at).toLocaleString()} → {new Date(row.ends_at).toLocaleTimeString()}
          </p>
          {row.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{row.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onOpenQr}><QrIcon className="mr-1 h-4 w-4" /> QR</Button>
          <Button size="sm" variant="outline" onClick={toggle}>
            {row.is_active ? <><PowerOff className="mr-1 h-4 w-4" /> Pause</> : <><Power className="mr-1 h-4 w-4" /> Activate</>}
          </Button>
          <EventDialog row={row} onSaved={onChanged} />
          <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventDialog({ row, onSaved }: { row?: LocalEvent; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: row?.title ?? "", description: row?.description ?? "",
    day_number: row?.day_number ?? 1, venue: row?.venue ?? "",
    starts_at: row ? toLocalInput(row.starts_at) : "", ends_at: row ? toLocalInput(row.ends_at) : "",
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        title: form.title, description: form.description || null,
        day_number: Number(form.day_number), venue: form.venue,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        is_active: true,
      };
      if (row) {
        localDb.updateEvent(row.id, payload);
      } else {
        localDb.createEvent(payload);
      }
      toast.success(row ? "Event updated" : "Event created");
      setOpen(false); onSaved();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {row ? <Button size="sm" variant="outline">Edit</Button>
             : <Button><Plus className="mr-1 h-4 w-4" /> New event</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{row ? "Edit event" : "New event"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Title"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day"><Input type="number" min={1} max={10} required value={form.day_number} onChange={(e) => setForm({ ...form, day_number: Number(e.target.value) })} /></Field>
            <Field label="Venue"><Input required value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts at"><Input type="datetime-local" required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
            <Field label="Ends at"><Input type="datetime-local" required value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></Field>
          </div>
          <Field label="Description"><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <DialogFooter><Button type="submit">Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}

function QrDialog({ event, onClose }: { event: LocalEvent | null; onClose: () => void }) {
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
    w.document.write(`<!doctype html><html><head><title>${event.title} · QR</title>
      <style>body{font-family:system-ui;text-align:center;padding:40px}h1{margin:0 0 8px}p{color:#555;margin:4px 0}img{margin:24px 0;width:380px;height:380px}</style>
      </head><body>
      <h1>${event.title}</h1>
      <p>Day ${event.day_number} · ${event.venue}</p>
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
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(scanUrl).then(() => toast.success("Link copied"))}>Copy link</Button>
          <Button onClick={printIt}><Printer className="mr-1 h-4 w-4" /> Print poster</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
