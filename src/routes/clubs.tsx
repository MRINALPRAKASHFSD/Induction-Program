import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { listClubs, registerForClub } from "@/lib/admin.functions";
import type { LocalClub } from "@/lib/local-db";

export const Route = createFileRoute("/clubs")({
  head: () => ({
    meta: [
      { title: "Clubs & Societies · KRMU Induction" },
      { name: "description", content: "Browse and join clubs at KRMU." },
    ],
  }),
  component: ClubsPage,
});

function ClubsPage() {
  const [clubs, setClubs] = useState<LocalClub[]>([]);
  const [enroll, setEnroll] = useState("");
  const [active, setActive] = useState<LocalClub | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    listClubs().then(data => {
      setClubs((data as unknown as LocalClub[]).filter(c => c.is_active));
      setPageLoading(false);
    }).catch(() => setPageLoading(false));
  }, []);

  const onJoin = async () => {
    if (!active) return;
    setLoading(true);
    try {
      // Small simulated delay for UX
      await new Promise(r => setTimeout(r, 400));
      
      const res = await registerForClub({ data: { enrollment_no: enroll.trim(), slug: active.slug } });
      
      if (res.duplicate) toast.info(`Already in ${active.name}`);
      else toast.success(`Joined ${active.name}!`);
      
      setActive(null);
      setEnroll("");
    } catch (e: any) {
      toast.error(e.message || "Failed to join club");
    } finally {
      setLoading(false);
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

      <main className="relative container mx-auto max-w-6xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="max-w-2xl animate-slide-up stagger-1">
          <h1 className="text-hero-heading text-primary font-bold">Clubs & Societies</h1>
          <p className="text-body-primary text-secondary mt-3">Find your people. Join as many as you like — registration is one tap.</p>
        </div>

        {/* Loading skeleton */}
        {pageLoading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="skeleton-glass skeleton-card" style={{ minHeight: '180px' }} />
            ))}
          </div>
        ) : clubs.length === 0 ? (
          /* Empty state */
          <div className="mt-12">
            <div className="empty-state">
              <div className="empty-state-icon">
                <Users className="h-7 w-7" />
              </div>
              <div className="empty-state-title">No Clubs Yet</div>
              <div className="empty-state-text">
                Clubs will be available once the admin adds them. Check back soon!
              </div>
            </div>
          </div>
        ) : (
          /* Club cards grid */
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clubs.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass-premium-v2 p-6 rounded-3xl group transition-transform hover:scale-[1.01]"
              >
                {/* Club icon */}
                <div className="feature-card-icon relative z-10">
                  <Sparkles className="h-6 w-6 stroke-[1.5]" />
                </div>
                
                <div className="relative z-10">
                  <h3 className="text-card-title text-primary font-bold">{c.name}</h3>
                  <p className="mt-2 text-body-secondary text-[#7a4020]/70 line-clamp-2 leading-relaxed">{c.description}</p>
                </div>

                {/* Tags */}
                <div className="mt-3 flex flex-wrap gap-1.5 relative z-10">
                  {c.tags.map((t) => (
                    <span key={t} className="text-caption font-bold text-[#8a4a22]/60 bg-[#8a4a22]/6 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {t}
                    </span>
                  ))}
                </div>

                {/* Join button */}
                <Dialog open={active?.id === c.id} onOpenChange={(o) => !o && setActive(null)}>
                  <DialogTrigger asChild>
                    <Button variant="liquidGlassMaroon" className="mt-4 w-full rounded-full font-semibold relative z-10" onClick={() => setActive(c)}>Join</Button>
                  </DialogTrigger>
                  <DialogContent className="!rounded-3xl bg-[#fffdfc]/95 backdrop-blur-2xl border-[#8a4a22]/10 shadow-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-section-heading text-primary font-bold">Join {c.name}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-3">
                      <Label className="text-label text-secondary uppercase font-bold tracking-wider mt-0">Your enrollment number</Label>
                      <Input
                        autoFocus value={enroll}
                        onChange={(e) => setEnroll(e.target.value.toUpperCase())}
                        placeholder="KRMU24CS0001"
                        className="rounded-xl border-[#8a4a22]/10 bg-white/60"
                      />
                      <Button variant="liquidGlassMaroon" onClick={onJoin} disabled={loading || enroll.length < 3} size="lg" className="rounded-full font-semibold">
                        {loading ? "Joining…" : "Confirm join"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
