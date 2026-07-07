import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, orderBy, getDocs, onSnapshot, where, doc, setDoc } from "firebase/firestore";
import { Bell, AlertCircle, ArrowLeft, Calendar, Clock, CheckCircle2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { db, auth } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { onAuthStateChanged } from "firebase/auth";

export const Route = createFileRoute("/announcements")({
  component: AnnouncementsPage,
});

const glassCard = "bg-white/40 backdrop-blur-xl border border-white/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-[24px]";

function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const qAnnouncements = query(
      collection(db, "announcements"),
      where("status", "==", "active")
    );
    
    const unsubAnnouncements = onSnapshot(qAnnouncements, (snap) => {
      const now = new Date().getTime();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => {
        // filter expired
        if (a.expiresAt && new Date(a.expiresAt).getTime() < now) return false;
        // basic audience filter (assume All Students applies to this user view)
        return a.targetAudience === "All Students";
      });
      docs.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
      setAnnouncements(docs);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load announcements:", err);
      setLoading(false);
    });

    return () => unsubAnnouncements();
  }, []);

  useEffect(() => {
    if (!user) return;
    const qReads = collection(db, `user_notifications/${user.uid}/reads`);
    const unsubReads = onSnapshot(qReads, (snap) => {
      const reads = new Set(snap.docs.map(d => d.id));
      setReadIds(reads);
    });
    return () => unsubReads();
  }, [user]);

  const markAsRead = async (id: string) => {
    if (!user || readIds.has(id)) return;
    try {
      await setDoc(doc(db, `user_notifications/${user.uid}/reads/${id}`), {
        readAt: new Date().toISOString()
      });
    } catch (e) {
      console.error("Failed to mark read", e);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const unread = announcements.filter(a => !readIds.has(a.id));
    for (const a of unread) {
      await markAsRead(a.id);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden text-[#2c1208] pb-12">
      {/* Background Elements */}
      <div className="bg-hero-premium fixed inset-0 -z-10" />
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="orb orb-1 opacity-50" />
        <div className="orb orb-2 opacity-50" />
        <div className="orb orb-3 opacity-40" />
        <div className="hero-ring hero-ring-1 opacity-40" />
      </div>
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj4KICA8ZmlsdGVyIGlkPSJub2lzZSI+CiAgICA8ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44NSIgbnVtT2N0YXZlcz0iMyIgc3RpdGNoVGlsZXM9InN0aXRjaCIgLz4KICAgIDxmZUNvbG9yTWF0cml4IHR5cGU9Im1hdHJpeCIgdmFsdWVzPSIxIDAgMCAwIDAgIDAgMSAwIDAgMCAgMCAwIDEgMCAwICAwIDAgMCAwLjA4IDAiIC8+ICAKICA8L2ZpbHRlcj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2UpIiAvPgo8L3N2Zz4=')] opacity-30 mix-blend-multiply pointer-events-none -z-10" />
      
      <SiteHeader />

      <main className="relative container mx-auto max-w-2xl px-4 py-10 z-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="liquidGlassWhite" size="icon" asChild className="rounded-full shadow-sm">
                <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[#2c1208]">Announcements</h1>
                <p className="text-[#7a4020] font-medium">Official updates from KRMU Induction</p>
              </div>
            </div>
            {user && announcements.filter(a => !readIds.has(a.id)).length > 0 && (
              <Button onClick={markAllAsRead} variant="liquidGlassWhite" className="rounded-full shadow-sm text-sm font-bold text-[#5a2c14]">
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark all read
              </Button>
            )}
          </div>

          <div className="space-y-5">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-40 bg-white/40 rounded-3xl animate-pulse" />)}
              </div>
            ) : announcements.length === 0 ? (
              <div className="text-center py-20 rounded-[32px] glass-card-hero border border-white/60 shadow-sm">
                <Bell className="h-12 w-12 mx-auto text-[#8a4a22]/20 mb-4" />
                <h3 className="text-xl font-bold text-[#2c1208]">You're All Caught Up</h3>
                <p className="text-[#7a4020] font-medium mt-1">No active announcements right now.</p>
              </div>
            ) : (
              <AnimatePresence>
                {announcements.map((a, idx) => {
                  const isRead = readIds.has(a.id);
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 20 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      transition={{ delay: idx * 0.05 }}
                      key={a.id}
                      onClick={() => markAsRead(a.id)}
                      className={`relative overflow-hidden p-6 sm:p-8 cursor-pointer transition-all duration-300 ${
                        a.isImportant 
                          ? "bg-red-50/80 backdrop-blur-xl border border-red-200 shadow-md rounded-[32px]" 
                          : `${glassCard} border-white/60 hover:bg-white/50 hover:shadow-lg hover:-translate-y-1`
                      } ${!isRead ? "ring-2 ring-emerald-500/30" : "opacity-90"}`}
                    >
                      {!isRead && (
                        <div className="absolute top-0 right-0 p-4">
                          <span className="w-3 h-3 bg-emerald-500 rounded-full block animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        </div>
                      )}
                      
                      {a.isImportant && (
                        <div className="mb-4 inline-flex items-center gap-1.5 bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm">
                          <AlertCircle className="h-3.5 w-3.5" /> Urgent
                        </div>
                      )}
                      
                      <h3 className={`font-bold text-xl sm:text-2xl leading-tight mb-3 pr-10 ${!isRead ? 'text-[#2c1208]' : 'text-[#4a2412]'}`}>{a.title}</h3>
                      <p className={`text-base whitespace-pre-wrap leading-relaxed mb-6 ${!isRead ? 'text-[#4a2412]' : 'text-[#7a4020]'}`}>{a.content}</p>
                      
                      <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-[#7a4020] pt-4 border-t border-[#8a4a22]/10">
                        <div className="flex items-center gap-2 bg-white/40 px-3 py-1.5 rounded-xl shadow-sm border border-white/50">
                          <Calendar className="h-4 w-4 text-[#8a4a22]" />
                          {new Date(a.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className="flex items-center gap-2 bg-white/40 px-3 py-1.5 rounded-xl shadow-sm border border-white/50">
                          <Clock className="h-4 w-4 text-[#8a4a22]" />
                          {new Date(a.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

        </motion.div>
      </main>
    </div>
  );
}
