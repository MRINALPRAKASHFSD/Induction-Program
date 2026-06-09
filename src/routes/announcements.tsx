import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { Bell, AlertCircle, ArrowLeft, Calendar } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { db } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/announcements")({
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const q = query(collection(db, "announcements"), orderBy("created_at", "desc"), limit(20));
        const snap = await getDocs(q);
        setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Failed to fetch announcements", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnnouncements();
  }, []);

  return (
    <div className="min-h-screen bg-background pb-12">
      <SiteHeader />
      
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-20 left-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <main className="relative container mx-auto max-w-md px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full bg-muted/50">
              <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
              <p className="text-sm text-muted-foreground">Stay updated with latest news</p>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-10"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></div>
            ) : announcements.length === 0 ? (
              <div className="text-center py-12 rounded-3xl bg-card border shadow-sm">
                <Bell className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-20" />
                <h3 className="text-lg font-bold">All Caught Up</h3>
                <p className="text-sm text-muted-foreground mt-1">No announcements right now.</p>
              </div>
            ) : (
              announcements.map((a, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: idx * 0.05 }}
                  key={a.id}
                  className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm transition-all ${
                    a.is_important 
                      ? "bg-red-500/5 border-red-500/20" 
                      : "bg-card hover:bg-muted/50"
                  }`}
                >
                  {a.is_important && (
                    <div className="absolute top-0 right-0 p-2">
                      <div className="flex items-center gap-1 bg-red-500/10 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                        <AlertCircle className="h-3.5 w-3.5" /> Urgent
                      </div>
                    </div>
                  )}
                  
                  <h3 className="font-bold text-lg leading-tight mb-2 pr-20">{a.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{a.content}</p>
                  
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-md">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>

        </motion.div>
      </main>
    </div>
  );
}
