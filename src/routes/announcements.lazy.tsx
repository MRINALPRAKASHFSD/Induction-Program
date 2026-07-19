import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, onSnapshot, where, doc, setDoc } from "firebase/firestore";
import { Bell, AlertCircle, ArrowLeft, Calendar, Clock, CheckCircle2, Megaphone } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { db, auth } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { onAuthStateChanged } from "firebase/auth";
import { localDb } from "@/lib/local-db";

export const Route = createLazyFileRoute("/announcements")({
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile] = useState<any>(() => localDb.getStudentProfile());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
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
    <div className="min-h-screen bg-background pb-12">
      <SiteHeader />
      
      {/* Ambient Background */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
      </div>

      <main className="relative container mx-auto max-w-2xl px-4 py-8 z-10">
        {!profile && !loading ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center py-16"
          >
            <div className="empty-state">
              <div className="empty-state-icon">
                <Megaphone className="h-7 w-7" />
              </div>
              <div className="empty-state-title">Announcements Locked</div>
              <div className="empty-state-text">
                You need to register for AARAMBH 2026 to view official announcements and updates.
              </div>
              <Button asChild variant="liquidGlassMaroon" size="lg" className="rounded-full px-8">
                <Link to="/register">Register Now</Link>
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slide-up stagger-1">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild className="rounded-full bg-white/40 hover:bg-white/60 border border-[#8a4a22]/5">
                <Link to="/"><ArrowLeft className="h-5 w-5 text-[#5a2c14]" /></Link>
              </Button>
              <div>
                <h1 className="text-hero-heading text-primary font-bold">Announcements</h1>
                <p className="text-label text-secondary uppercase font-bold tracking-wider">Official updates from KRMU Induction</p>
              </div>
            </div>
            {user && announcements.filter(a => !readIds.has(a.id)).length > 0 && (
              <Button onClick={markAllAsRead} variant="liquidGlassWhite" className="rounded-full shadow-sm text-sm font-bold text-[#5a2c14]">
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark all read
              </Button>
            )}
          </div>

          {/* Content */}
          <div className="space-y-4">
            {loading ? (
              /* Skeleton loading */
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="skeleton-glass skeleton-card" style={{ minHeight: '160px' }} />
                ))}
              </div>
            ) : announcements.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Megaphone className="h-7 w-7" />
                </div>
                <div className="empty-state-title">You're All Caught Up</div>
                <div className="empty-state-text">
                  No active announcements right now. We'll notify you when something new drops.
                </div>
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
                      className={`glass-premium-v2 rounded-2xl p-6 sm:p-8 cursor-pointer transition-all duration-300 hover:shadow-lg group ${
                        a.isImportant 
                          ? "!bg-red-50/60 !border-red-200/50" 
                          : ""
                      } ${!isRead ? "ring-2 ring-emerald-500/20" : "opacity-85"}`}
                    >
                      <div className="relative z-10">
                        {/* Unread indicator */}
                        {!isRead && (
                          <div className="absolute -left-3 top-0 bottom-0 w-[3px] bg-emerald-500 rounded-full" />
                        )}
                        
                        {a.isImportant && (
                          <div className="mb-4 inline-flex items-center gap-1.5 bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm">
                            <AlertCircle className="h-3.5 w-3.5" /> Urgent
                          </div>
                        )}
                        
                        <h3 className={`text-card-title font-bold leading-tight mb-3 pr-10 ${!isRead ? 'text-[#2c1208]' : 'text-[#4a2412]'}`}>{a.title}</h3>
                        <p className={`text-body-primary whitespace-pre-wrap leading-relaxed mb-6 ${!isRead ? 'text-[#4a2412]' : 'text-[#7a4020]'}`}>{a.content}</p>
                        
                        <div className="flex flex-wrap items-center justify-between gap-4 text-caption font-bold text-[#7a4020] pt-4 border-t border-[#8a4a22]/8">
                          <div className="flex items-center gap-2 glass-premium-v2 rounded-xl px-3 py-1.5 border-[#8a4a22]/5">
                            <Calendar className="h-4 w-4 text-[#8a4a22] relative z-10" />
                            <span className="relative z-10">{new Date(a.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                          <div className="flex items-center gap-2 glass-premium-v2 rounded-xl px-3 py-1.5 border-[#8a4a22]/5">
                            <Clock className="h-4 w-4 text-[#8a4a22] relative z-10" />
                            <span className="relative z-10">{new Date(a.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

        </motion.div>
        )}
      </main>
    </div>
  );
}
