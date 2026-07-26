import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Users, ImageIcon, Link2 } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { listClubs, deleteClub, upsertClub } from "@/lib/admin.functions";
import { uploadClubImage } from "@/lib/upload-club-image";
import type { LocalClub } from "@/lib/local-db";

export const Route = createLazyFileRoute("/admin/clubs")({
  // @ts-expect-error - Route type options do not include head in this version
  head: () => ({ meta: [{ title: "Clubs · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminClubs,
});

/* ─────────────────────────────────────────────────────────────── */
/*  Page                                                           */
/* ─────────────────────────────────────────────────────────────── */

function AdminClubs() {
  const [rows, setRows] = useState<LocalClub[] | null>(null);

  const load = async () => {
    try {
      const data = await listClubs();
      setRows(data as unknown as LocalClub[]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load clubs");
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <AdminShell title="Clubs" subtitle="Create and manage student clubs (120 seats each).">
      <div className="mb-4 flex justify-end">
        <ClubDialog onSaved={load} />
      </div>

      {!rows ? (
        /* Loading skeleton */
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-glass skeleton-card" style={{ minHeight: 120 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border glass-card-hero p-8 text-center text-sm text-muted-foreground">
          No clubs yet. Click "New club" to create one.
        </p>
      ) : (
        /* ── Admin Club Table ── */
        <div className="rounded-xl border overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid sm:grid-cols-[56px_1fr_1fr_120px_100px_80px_auto] gap-3 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Logo</span>
            <span>Club</span>
            <span>Tagline</span>
            <span>Seats</span>
            <span>Status</span>
            <span>Visible</span>
            <span />
          </div>

          {rows.map((c) => (
            <AdminClubRow key={c.id} club={c} onChanged={load} />
          ))}
        </div>
      )}
    </AdminShell>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*  Admin Club Row                                                 */
/* ─────────────────────────────────────────────────────────────── */

function AdminClubRow({ club, onChanged }: { club: LocalClub; onChanged: () => void }) {
  const remove = async () => {
    if (!confirm(`Delete "${club.name}"?`)) return;
    try {
      await deleteClub({ data: { id: club.id } });
      onChanged();
      toast.success("Club deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const registered = club.registeredCount ?? 0;
  const capacity = club.capacity ?? 120;
  const isFull = !club.isRegistrationOpen || registered >= capacity;
  const createdDate = club.createdAt
    ? new Date(club.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  return (
    <div className="grid sm:grid-cols-[56px_1fr_1fr_120px_100px_80px_auto] gap-3 items-center px-4 py-3 border-t first:border-t-0 bg-background/60 hover:bg-muted/20 transition-colors">
      {/* Logo */}
      <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
        {club.imageUrl ? (
          <img src={club.imageUrl} alt={club.name} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Name + Date */}
      <div className="min-w-0">
        <p className="font-semibold truncate text-sm">{club.name}</p>
        <p className="text-xs text-muted-foreground">{createdDate}</p>
      </div>

      {/* Tagline */}
      <p className="text-sm text-muted-foreground truncate">{club.tagline || "—"}</p>

      {/* Seats */}
      <div className="flex items-center gap-1.5 text-sm">
        <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="font-medium">{registered}</span>
        <span className="text-muted-foreground">/ {capacity}</span>
      </div>

      {/* Status */}
      <Badge variant={isFull ? "destructive" : "default"} className="rounded-full text-xs w-fit">
        {isFull ? "Full" : "Open"}
      </Badge>

      {/* Visibility */}
      <span className={`text-xs font-medium ${club.visible ? "text-emerald-600" : "text-muted-foreground"}`}>
        {club.visible ? "Visible" : "Hidden"}
      </span>

      {/* Actions */}
      <div className="flex gap-2">
        <ClubDialog club={club} onSaved={onChanged} />
        <Button size="sm" variant="liquidGlass" className="text-destructive rounded-full" onClick={remove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*  Create / Edit Dialog                                           */
/* ─────────────────────────────────────────────────────────────── */

const WHATSAPP_REGEX = /^https:\/\/(chat\.whatsapp\.com\/|wa\.me\/)[a-zA-Z0-9/?=&_%-]+$/;

interface ClubForm {
  name: string;
  tagline: string;
  description: string;
  whatsappGroup: string;
  visible: boolean;
  imageUrl: string | null;
  imageFile: File | null;
  imagePreview: string | null;
}

function ClubDialog({ club, onSaved }: { club?: LocalClub; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultForm = (): ClubForm => ({
    name: club?.name ?? "",
    tagline: club?.tagline ?? "",
    description: club?.description ?? "",
    whatsappGroup: club?.whatsappGroup ?? "",
    visible: club?.visible ?? true,
    imageUrl: club?.imageUrl ?? null,
    imageFile: null,
    imagePreview: club?.imageUrl ?? null,
  });

  const [form, setForm] = useState<ClubForm>(defaultForm);

  // Reset form when dialog opens/closes or club changes
  useEffect(() => {
    if (open) setForm(defaultForm());
  }, [open]);

  /* ── Image helpers ── */
  const applyFile = (file: File) => {
    const preview = URL.createObjectURL(file);
    setForm((f) => ({ ...f, imageFile: file, imagePreview: preview }));
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) applyFile(file);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  /* ── Validation ── */
  const validate = (): string | null => {
    if (!form.name.trim()) return "Club name is required.";
    if (form.name.length > 80) return "Club name must be ≤ 80 characters.";
    if (!form.tagline.trim()) return "Tagline is required.";
    if (form.tagline.length > 80) return "Tagline must be ≤ 80 characters.";
    if (!form.description.trim()) return "Description is required.";
    if (form.description.length > 500) return "Description must be ≤ 500 characters.";
    if (!form.whatsappGroup.trim()) return "WhatsApp Group Link is required.";
    if (!WHATSAPP_REGEX.test(form.whatsappGroup.trim()))
      return "Enter a valid WhatsApp invite link (https://chat.whatsapp.com/… or https://wa.me/…).";
    if (!club && !form.imageFile && !form.imageUrl)
      return "Club logo is required.";
    return null;
  };

  /* ── Submit ── */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);

    try {
      let finalImageUrl = form.imageUrl;

      // Upload new image if selected
      if (form.imageFile) {
        finalImageUrl = await uploadClubImage(form.imageFile, club?.id ?? "new");
      }

      await upsertClub({
        data: {
          id: club?.id,
          name: form.name.trim(),
          tagline: form.tagline.trim(),
          description: form.description.trim() || null,
          whatsappGroup: form.whatsappGroup.trim(),
          visible: form.visible,
          imageUrl: finalImageUrl,
        },
      });

      toast.success(club ? "Club updated" : "Club created");
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed to save club");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {club ? (
          <Button size="sm" variant="liquidGlassWhite" className="rounded-full">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button variant="liquidGlassDark" className="rounded-full">
            <Plus className="mr-1 h-4 w-4" /> New club
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{club ? "Edit Club" : "New Club"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4 pt-1">
          {/* 1. Club Name */}
          <Field label="Club Name *">
            <Input
              required
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Robotics Club"
            />
            <p className="text-xs text-muted-foreground text-right">{form.name.length}/80</p>
          </Field>

          {/* 2. Club Logo / Image Upload */}
          <Field label="Club Logo *">
            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`
                relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
                cursor-pointer transition-colors p-4
                ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"}
              `}
            >
              {form.imagePreview ? (
                <div className="flex items-center gap-3 w-full">
                  <img
                    src={form.imagePreview}
                    alt="Preview"
                    className="h-16 w-16 rounded-lg object-cover border flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {form.imageFile?.name ?? "Current logo"}
                    </p>
                    <p className="text-xs text-muted-foreground">Click to replace</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Drop image here or click to upload</p>
                    <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, JPEG, WEBP · Max 5 MB</p>
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onFileChange}
            />
          </Field>

          {/* 3. Tagline */}
          <Field label="Tagline *">
            <Input
              required
              maxLength={80}
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder='e.g. "Innovate. Inspire. Impact."'
            />
            <p className="text-xs text-muted-foreground text-right">{form.tagline.length}/80</p>
          </Field>

          {/* 4. Description */}
          <Field label="Description *">
            <Textarea
              required
              rows={3}
              maxLength={500}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What does this club do? Who should join?"
            />
            <p className="text-xs text-muted-foreground text-right">{form.description.length}/500</p>
          </Field>

          {/* 5. WhatsApp Group Link */}
          <Field label="WhatsApp Group Link *">
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                required
                type="url"
                value={form.whatsappGroup}
                onChange={(e) => setForm({ ...form, whatsappGroup: e.target.value })}
                placeholder="https://chat.whatsapp.com/..."
                className="pl-9"
              />
            </div>
            {form.whatsappGroup && !WHATSAPP_REGEX.test(form.whatsappGroup) && (
              <p className="text-xs text-destructive mt-0.5">
                Must be a valid WhatsApp invite link (chat.whatsapp.com or wa.me).
              </p>
            )}
          </Field>

          {/* 6. Visible to Students */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Visible to Students</p>
              <p className="text-xs text-muted-foreground">When off, this club is hidden from the student view.</p>
            </div>
            <Switch
              checked={form.visible}
              onCheckedChange={(v) => setForm({ ...form, visible: v })}
            />
          </div>

          <DialogFooter>
            <Button type="submit" variant="liquidGlassDark" className="rounded-full" disabled={saving}>
              {saving ? "Saving…" : club ? "Update Club" : "Create Club"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*  Field wrapper                                                  */
/* ─────────────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
