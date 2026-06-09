import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { Trash2, Send, Bell } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/announcements")({
  component: AdminAnnouncementsPage,
});

function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", is_important: false });

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "announcements"), orderBy("created_at", "desc"));
      const snap = await getDocs(q);
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.content) {
      toast.error("Title and content are required");
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, "announcements"), {
        title: form.title,
        content: form.content,
        is_important: form.is_important,
        created_at: new Date().toISOString(),
      });
      toast.success("Announcement published!");
      setForm({ title: "", content: "", is_important: false });
      fetchAnnouncements();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to publish");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this announcement?")) return;
    try {
      await deleteDoc(doc(db, "announcements", id));
      toast.success("Deleted successfully");
      fetchAnnouncements();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to delete");
    }
  };

  return (
    <AdminShell title="Manage Announcements">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Publish Form */}
        <div className="rounded-xl border bg-card p-6 shadow-sm h-fit">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" /> Publish New
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input 
                value={form.title} 
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} 
                placeholder="e.g. Schedule Change for B.Tech" 
              />
            </div>
            <div className="grid gap-2">
              <Label>Content</Label>
              <textarea 
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={form.content} 
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))} 
                placeholder="Details of the announcement..." 
              />
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="important" 
                checked={form.is_important} 
                onChange={e => setForm(f => ({ ...f, is_important: e.target.checked }))} 
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="important" className="cursor-pointer">Mark as Urgent / Important</Label>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Publishing..." : "Publish Announcement"}
            </Button>
          </form>
        </div>

        {/* Existing Announcements */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" /> Recent Announcements
          </h2>
          
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-24 bg-muted rounded-xl" />
              <div className="h-24 bg-muted rounded-xl" />
            </div>
          ) : announcements.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border rounded-xl bg-card">
              No announcements published yet.
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map(a => (
                <div key={a.id} className={`p-4 rounded-xl border ${a.is_important ? 'border-red-500/20 bg-red-500/5' : 'bg-card'}`}>
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold">{a.title}</h3>
                        {a.is_important && <span className="bg-red-500/10 text-red-600 text-[10px] uppercase px-2 py-0.5 rounded-full font-bold">Urgent</span>}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{a.content}</p>
                      <div className="text-xs text-muted-foreground mt-2">
                        {new Date(a.created_at).toLocaleString()}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive shrink-0 hover:bg-destructive/10" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
