import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, MapPin } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { listEvents, createEvent, updateEvent, deleteEvent } from "@/lib/admin.functions";

export const Route = createLazyFileRoute("/admin/schedule")({
  // @ts-expect-error - Route type options do not include head in this version
  head: () => ({ meta: [{ title: "Schedule · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminSchedule,
});

function AdminSchedule() {
  const [rows, setRows] = useState<any[] | null>(null);

  const load = async () => {
    try {
      const data = await listEvents();
      setRows(data);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load schedule");
    }
  };
  
  useEffect(() => { load(); }, []);

  // Group by day
  const grouped = rows?.reduce((acc: any, curr: any) => {
    const day = curr.day_number;
    if (!acc[day]) acc[day] = [];
    acc[day].push(curr);
    return acc;
  }, {});

  const days = grouped ? Object.keys(grouped).sort((a, b) => Number(a) - Number(b)) : [];

  return (
    <AdminShell title="Schedule" subtitle="Manage induction schedule and sessions.">
      <div className="mb-4 flex justify-end"><EventDialog onSaved={load} /></div>

      {!rows ? (
        <div className="grid gap-3" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border glass-card-hero p-8 text-center text-sm text-muted-foreground">No sessions scheduled.</p>
      ) : (
        <div className="space-y-8">
          {days.map((day) => (
            <div key={day} className="space-y-3">
              <h2 className="text-xl font-bold border-b pb-2">Day {day}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {grouped[day].map((event: any) => (
                  <EventCard key={event.id} event={event} onChanged={load} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

function EventCard({ event, onChanged }: { event: any; onChanged: () => void }) {
  const remove = async () => {
    if (!confirm(`Delete "${event.title}"?`)) return;
    try { 
      await deleteEvent({ data: { id: event.id } }); 
      onChanged(); 
      toast.success("Deleted"); 
    }
    catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="rounded-xl border glass-card-hero p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{event.title}</h3>
            {!event.is_active && <span className="rounded bg-muted px-2 py-0.5 text-xs">hidden</span>}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {new Date(event.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
            {new Date(event.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <p className="flex items-center gap-1 text-xs font-medium mt-1"><MapPin className="h-3 w-3" /> {event.venue}</p>
          {event.department_id && <p className="text-xs text-primary mt-1">Dept: {event.department_id}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <EventDialog event={event} onSaved={onChanged} />
          <Button size="sm" variant="liquidGlass" className="text-destructive rounded-full" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {event.description && <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>}
    </div>
  );
}

function EventDialog({ event, onSaved }: { event?: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: event?.title ?? "",
    description: event?.description ?? "",
    day_number: event?.day_number ?? 1,
    venue: event?.venue ?? "",
    starts_at: event?.starts_at ? new Date(event.starts_at).toISOString().slice(0,16) : "",
    ends_at: event?.ends_at ? new Date(event.ends_at).toISOString().slice(0,16) : "",
    department_id: event?.department_id ?? "",
    is_active: event?.is_active ?? true,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        day_number: Number(form.day_number),
        venue: form.venue,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        department_id: form.department_id || null,
        is_active: form.is_active,
      };

      if (event?.id) {
        await updateEvent({ data: { id: event.id, ...payload } });
        toast.success("Updated");
      } else {
        await createEvent({ data: payload });
        toast.success("Created");
      }
      setOpen(false); 
      onSaved();
    } catch (e: any) { 
      toast.error(e.message); 
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {event ? <Button size="sm" variant="liquidGlassWhite" className="rounded-full">Edit</Button> : <Button variant="liquidGlassDark" className="rounded-full"><Plus className="mr-1 h-4 w-4" /> New session</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{event ? "Edit session" : "New session"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 mt-2">
          <Field label="Title"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day Number"><Input type="number" required min={1} max={10} value={form.day_number} onChange={(e) => setForm({ ...form, day_number: Number(e.target.value) })} /></Field>
            <Field label="Venue"><Input required value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts At"><Input type="datetime-local" required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
            <Field label="Ends At"><Input type="datetime-local" required value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></Field>
          </div>

          <Field label="Department ID (Optional)"><Input placeholder="Leave empty for all" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} /></Field>
          
          <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          
          <div className="flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <span className="text-sm">{form.is_active ? "Visible to students" : "Hidden"}</span>
          </div>
          <DialogFooter><Button type="submit" variant="liquidGlassDark" className="rounded-full">Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}
