import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { localDb, type LocalClub } from "@/lib/local-db";

export const Route = createFileRoute("/admin/clubs")({
  head: () => ({ meta: [{ title: "Clubs · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminClubs,
});

function AdminClubs() {
  const [rows, setRows] = useState<LocalClub[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = () => {
    const data = localDb.getClubs();
    setRows(data);
    const regs = localDb.getClubRegistrations();
    const c: Record<string, number> = {};
    regs.forEach((r) => { c[r.club_slug] = (c[r.club_slug] ?? 0) + 1; });
    setCounts(c);
  };
  
  useEffect(() => { load(); }, []);

  return (
    <AdminShell title="Clubs" subtitle="Create and manage student clubs.">
      <div className="mb-4 flex justify-end"><ClubDialog onSaved={load} /></div>

      {!rows ? (
        <div className="grid gap-3 sm:grid-cols-2" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No clubs yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((c) => <ClubCard key={c.id} club={c} count={counts[c.slug] ?? 0} onChanged={load} />)}
        </div>
      )}
    </AdminShell>
  );
}

function ClubCard({ club, count, onChanged }: { club: LocalClub; count: number; onChanged: () => void }) {
  const remove = () => {
    if (!confirm(`Delete "${club.name}"?`)) return;
    try { 
      localDb.deleteClub(club.id); 
      onChanged(); 
      toast.success("Deleted"); 
    }
    catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{club.name}</h3>
            {!club.is_active && <span className="rounded bg-muted px-2 py-0.5 text-xs">hidden</span>}
          </div>
          <p className="text-xs text-muted-foreground">/{club.slug} · {count} members</p>
          {club.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{club.description}</p>}
          {club.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {club.tags.map((t) => <span key={t} className="rounded bg-muted px-2 py-0.5 text-xs">{t}</span>)}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <ClubDialog club={club} onSaved={onChanged} />
          <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function ClubDialog({ club, onSaved }: { club?: LocalClub; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: club?.name ?? "", slug: club?.slug ?? "",
    description: club?.description ?? "",
    tags: (club?.tags ?? []).join(", "),
    image_url: club?.image_url ?? "",
    is_active: club?.is_active ?? true,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localDb.upsertClub({
        id: club?.id,
        name: form.name,
        slug: form.slug.toLowerCase(),
        description: form.description || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        image_url: form.image_url || null,
        is_active: form.is_active,
      });
      toast.success(club ? "Updated" : "Created"); setOpen(false); onSaved();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {club ? <Button size="sm" variant="outline">Edit</Button> : <Button><Plus className="mr-1 h-4 w-4" /> New club</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{club ? "Edit club" : "New club"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Slug (URL)"><Input required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
          <Field label="Description"><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Tags (comma-separated)"><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
          <Field label="Image URL"><Input value={form.image_url ?? ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></Field>
          <div className="flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <span className="text-sm">{form.is_active ? "Visible to students" : "Hidden"}</span>
          </div>
          <DialogFooter><Button type="submit">Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}
