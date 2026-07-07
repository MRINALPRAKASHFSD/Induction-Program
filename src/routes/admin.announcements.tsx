import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { Trash2, Send, Bell, Edit, Archive, RotateCcw, Search, Clock, Users, Calendar, AlertCircle } from "lucide-react";
import { db, auth } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/admin/announcements")({
  component: AdminAnnouncementsPage,
});

const TARGET_AUDIENCES = ["All Students", "All Coordinators", "Specific Club", "Specific Event"];
const STATUS_FILTERS = ["All", "Active", "Archived", "Important"];

const glassCard = "bg-white/40 backdrop-blur-xl border border-white/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-[24px]";
const glassInput = "glass-card-hero border-white/60 focus:bg-white/70 transition-all shadow-sm rounded-xl";
const glassPanel = "glass-card-hero p-6 shadow-sm rounded-2xl";

function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [form, setForm] = useState({ 
    title: "", 
    content: "", 
    isImportant: false,
    targetAudience: "All Students",
    expiresAt: ""
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("Active");

  useEffect(() => {
    const q = query(collection(db, "announcements"));
    // We must fetch all for admins, but since the security rules require super_admin to read all,
    // and we want this to work even if the claim is delayed, we'll try to fetch all.
    // If it fails (due to rules), we fall back to fetching only active ones.
    const unsubscribe = onSnapshot(q, (snap) => {
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAnnouncements(docs);
      setLoading(false);
    }, (err) => {
      console.error("Admin query failed, falling back to active only:", err);
      const activeQ = query(collection(db, "announcements"), where("status", "==", "active"));
      onSnapshot(activeQ, (activeSnap) => {
        let docs = activeSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAnnouncements(docs);
        setLoading(false);
      }, (activeErr) => {
        console.error(activeErr);
        toast.error("Failed to load announcements");
        setLoading(false);
      });
    });
    return () => unsubscribe();
  }, []);

  const callApi = async (action: string, payload: any) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const token = await auth.currentUser.getIdToken();
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ action, payload })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "API request failed");
    return data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.content) {
      toast.error("Title and content are required");
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading(editingId ? "Updating announcement..." : "Publishing announcement...");
    try {
      if (editingId) {
        await callApi("EDIT", { id: editingId, ...form });
        toast.success("Announcement updated!", { id: toastId });
        setEditingId(null);
      } else {
        await callApi("PUBLISH", form);
        toast.success("Announcement published!", { id: toastId });
      }
      setForm({ title: "", content: "", isImportant: false, targetAudience: "All Students", expiresAt: "" });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to publish", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (action: string, id: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const toastId = toast.loading("Processing...");
    try {
      await callApi(action, { id });
      toast.success("Action completed successfully", { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Action failed", { id: toastId });
    }
  };

  const startEdit = (a: any) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      content: a.content,
      isImportant: a.isImportant || false,
      targetAudience: a.targetAudience || "All Students",
      expiresAt: a.expiresAt || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ title: "", content: "", isImportant: false, targetAudience: "All Students", expiresAt: "" });
  };

  const filteredAnnouncements = announcements.filter(a => {
    // Some old announcements might not have status, treat them as active unless they are archived
    const status = a.status || 'active'; 
    if (status === 'deleted') return false; // hide deleted entirely from this view
    
    if (filterStatus === "Active" && status !== "active") return false;
    if (filterStatus === "Archived" && status !== "archived") return false;
    if (filterStatus === "Important" && !a.isImportant) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!a.title?.toLowerCase().includes(q) && 
          !a.content?.toLowerCase().includes(q) &&
          !a.createdByEmail?.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <AdminShell title="Manage Announcements" subtitle="Broadcast updates to students and coordinators securely.">
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Publish Form */}
        <div className="lg:col-span-4 h-fit sticky top-24">
          <div className={glassPanel}>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-[#2c1208]">
              {editingId ? <Edit className="h-5 w-5 text-amber-600" /> : <Send className="h-5 w-5 text-emerald-600" />}
              {editingId ? "Edit Announcement" : "Publish New"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-2">
                <Label className="text-[#5a2c14] font-semibold">Title</Label>
                <Input 
                  value={form.title} 
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} 
                  placeholder="e.g. Schedule Change for B.Tech" 
                  className={glassInput}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#5a2c14] font-semibold">Content</Label>
                <textarea 
                  className={`flex min-h-[120px] w-full px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 resize-none ${glassInput}`}
                  value={form.content} 
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))} 
                  placeholder="Details of the announcement..." 
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#5a2c14] font-semibold">Target Audience</Label>
                <Select value={form.targetAudience} onValueChange={(v) => setForm(f => ({ ...f, targetAudience: v }))}>
                  <SelectTrigger className={glassInput}>
                    <SelectValue placeholder="Select audience" />
                  </SelectTrigger>
                  <SelectContent className="bg-white/90 backdrop-blur-xl border-white/40 rounded-xl">
                    {TARGET_AUDIENCES.map(aud => (
                      <SelectItem key={aud} value={aud}>{aud}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-[#5a2c14] font-semibold">Expires At (Optional)</Label>
                <Input 
                  type="datetime-local"
                  value={form.expiresAt} 
                  onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} 
                  className={glassInput}
                />
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-white/60 bg-white/20">
                <input 
                  type="checkbox" 
                  id="important" 
                  checked={form.isImportant} 
                  onChange={e => setForm(f => ({ ...f, isImportant: e.target.checked }))} 
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-600 accent-red-600"
                />
                <Label htmlFor="important" className="cursor-pointer font-bold text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Mark as Urgent
                </Label>
              </div>
              <div className="flex gap-3 pt-2">
                {editingId && (
                  <Button type="button" variant="outline" className="flex-1 rounded-[16px] h-12" onClick={cancelEdit}>
                    Cancel
                  </Button>
                )}
                <Button type="submit" variant="liquidGlassDark" className="flex-1 rounded-[16px] h-12 shadow-md" disabled={submitting}>
                  {submitting ? "Processing..." : editingId ? "Update" : "Publish"}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Existing Announcements */}
        <div className="lg:col-span-8 space-y-6">
          <div className={`${glassPanel} p-4 flex flex-col sm:flex-row gap-4 items-center justify-between`}>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a4a22]/50 pointer-events-none" />
              <Input 
                placeholder="Search announcements..." 
                className={`pl-9 h-10 w-full ${glassInput}`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
              {STATUS_FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${filterStatus === f ? "bg-[#3c1608] text-white shadow-md" : "glass-card-hero border-white/60 text-[#7a4020] hover:bg-white/50"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          
          {loading ? (
            <div className="animate-pulse space-y-4">
              {[1,2,3].map(i => <div key={i} className="h-32 bg-white/40 rounded-2xl" />)}
            </div>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-[#8a4a22]/30 rounded-2xl bg-white/20">
              <Bell className="w-12 h-12 mx-auto text-[#8a4a22]/20 mb-3" />
              <p className="font-semibold text-[#5a2c14]">No announcements found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {filteredAnnouncements.map(a => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={a.id} 
                    className={`p-5 rounded-2xl border transition-all ${
                      a.isImportant ? 'border-red-500/30 bg-red-50/50 shadow-sm' : 
                      a.status === 'archived' ? 'border-gray-300/50 bg-gray-50/50 opacity-70' : 
                      glassCard
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {a.isImportant && <span className="bg-red-100 text-red-700 text-[10px] uppercase px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Urgent</span>}
                          {a.status === 'archived' && <span className="bg-gray-200 text-gray-700 text-[10px] uppercase px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1"><Archive className="w-3 h-3" /> Archived</span>}
                          <span className="bg-[#5a2c14]/10 text-[#5a2c14] text-[10px] uppercase px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Users className="w-3 h-3" /> {a.targetAudience || 'All Students'}
                          </span>
                        </div>
                        <h3 className="font-bold text-lg text-[#2c1208] mb-1 truncate">{a.title}</h3>
                        <p className="text-sm text-[#5a2c14] line-clamp-2 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                        
                        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-[#7a4020] mt-4 pt-3 border-t border-[#8a4a22]/10">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 opacity-70" />
                            {new Date(a.createdAt || a.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-[#8a4a22]/20 flex items-center justify-center text-[10px] text-[#2c1208]">
                              {a.createdByEmail?.charAt(0).toUpperCase() || 'A'}
                            </div>
                            {a.createdByEmail || 'Admin'}
                          </div>
                          {a.expiresAt && (
                            <div className="flex items-center gap-1.5 text-amber-700">
                              <Calendar className="w-3.5 h-3.5" />
                              Expires: {new Date(a.expiresAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex sm:flex-col gap-2 shrink-0">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full bg-white/50 hover:bg-white text-[#5a2c14] shadow-sm" onClick={() => startEdit(a)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {a.status === 'archived' ? (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full bg-white/50 hover:bg-white text-emerald-600 shadow-sm" onClick={() => handleAction("RESTORE", a.id, "Restore this announcement?")}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full bg-white/50 hover:bg-white text-amber-600 shadow-sm" onClick={() => handleAction("ARCHIVE", a.id, "Archive this announcement?")}>
                            <Archive className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full bg-red-50 hover:bg-red-100 text-red-600 shadow-sm" onClick={() => handleAction("DELETE", a.id, "Delete this announcement? This action is irreversible.")}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
