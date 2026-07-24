import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, ImageIcon, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listClubs, registerForClub } from "@/lib/admin.functions";
import type { LocalClub } from "@/lib/local-db";

export const Route = createLazyFileRoute("/clubs")({
  head: () => ({
    meta: [
      { title: "Clubs & Societies · KRMU Induction" },
      { name: "description", content: "Browse and join clubs at KRMU." },
    ],
  }),
  component: ClubsPage,
});

/* ─────────────────────────────────────────────────────────────── */
/*  Page                                                           */
/* ─────────────────────────────────────────────────────────────── */

function ClubsPage() {
  const [clubs, setClubs] = useState<LocalClub[]>([]);
  const [enroll, setEnroll] = useState("");
  const [active, setActive] = useState<LocalClub | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    listClubs()
      .then((data) => {
        setClubs((data as unknown as LocalClub[]).filter((c) => c.visible));
        setPageLoading(false);
      })
      .catch(() => setPageLoading(false));
  }, []);

  const onJoin = async () => {
    if (!active) return;
    setLoading(true);
    try {
      // Small simulated delay for UX
      await new Promise((r) => setTimeout(r, 300));

      const res = await registerForClub({
        data: { enrollment_no: enroll.trim(), club_id: active.id },
      });

      if (res.duplicate) toast.info(`You're already in ${active.name}`);
      else toast.success(`Joined ${active.name}! 🎉`);

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
          <p className="text-body-primary text-secondary mt-3">
            Find your people. Browse clubs below and tap <strong>Join</strong> to register.
          </p>
        </div>

        {/* Loading skeleton */}
        {pageLoading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton-glass skeleton-card" style={{ minHeight: "220px" }} />
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
              <ClubCard
                key={c.id}
                club={c}
                index={i}
                active={active}
                enroll={enroll}
                loading={loading}
                onOpen={() => setActive(c)}
                onClose={() => setActive(null)}
                onEnrollChange={setEnroll}
                onJoin={onJoin}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*  Club Card                                                      */
/* ─────────────────────────────────────────────────────────────── */

interface ClubCardProps {
  club: LocalClub;
  index: number;
  active: LocalClub | null;
  enroll: string;
  loading: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEnrollChange: (v: string) => void;
  onJoin: () => void;
}

function ClubCard({ club, index, active, enroll, loading, onOpen, onClose, onEnrollChange, onJoin }: ClubCardProps) {
  const registered = club.registeredCount ?? 0;
  const capacity = club.capacity ?? 120;
  const seatsLeft = Math.max(0, capacity - registered);
  const isFull = !club.isRegistrationOpen || seatsLeft === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="glass-premium-v2 rounded-3xl overflow-hidden group transition-transform hover:scale-[1.01] flex flex-col"
    >
      {/* Club Logo Banner */}
      <div className="relative h-36 bg-gradient-to-br from-[#8a4a22]/10 to-[#c97d4a]/10 flex-shrink-0">
        {club.imageUrl ? (
          <img
            src={club.imageUrl}
            alt={`${club.name} logo`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <ImageIcon className="h-10 w-10 text-[#8a4a22]/30" />
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        {/* Name + Tagline */}
        <div>
          <h3 className="text-card-title text-primary font-bold leading-tight">{club.name}</h3>
          {club.tagline && (
            <p className="text-xs font-medium text-[#8a4a22]/70 mt-0.5 italic">{club.tagline}</p>
          )}
        </div>

        {/* Description */}
        {club.description && (
          <p className="text-body-secondary text-[#7a4020]/70 line-clamp-2 leading-relaxed text-sm flex-1">
            {club.description}
          </p>
        )}

        {/* Seats remaining */}
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-[#8a4a22]/60 flex-shrink-0" />
          {isFull ? (
            <span className="text-xs font-semibold text-destructive">Registration Full</span>
          ) : (
            <span className="text-xs text-[#8a4a22]/60">
              <strong className="text-[#8a4a22]">{seatsLeft}</strong> seats remaining
            </span>
          )}
        </div>

        {/* Join / Full button */}
        {isFull ? (
          <div className="mt-1 w-full rounded-full border border-destructive/30 bg-destructive/10 py-2 text-center text-sm font-semibold text-destructive">
            Registration Closed
          </div>
        ) : (
          <Dialog open={active?.id === club.id} onOpenChange={(o) => !o && onClose()}>
            <DialogTrigger asChild>
              <Button
                variant="liquidGlassMaroon"
                className="mt-1 w-full rounded-full font-semibold"
                onClick={onOpen}
              >
                Join
              </Button>
            </DialogTrigger>
            <DialogContent className="!rounded-3xl bg-[#fffdfc]/95 backdrop-blur-2xl border-[#8a4a22]/10 shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-section-heading text-primary font-bold">
                  Join {club.name}
                </DialogTitle>
              </DialogHeader>

              {club.tagline && (
                <p className="text-sm text-[#8a4a22]/60 italic -mt-1">"{club.tagline}"</p>
              )}

              <div className="grid gap-3">
                <Label className="text-label text-secondary uppercase font-bold tracking-wider">
                  Your enrollment number
                </Label>
                <Input
                  autoFocus
                  value={enroll}
                  onChange={(e) => onEnrollChange(e.target.value.toUpperCase())}
                  placeholder="KRMU24CS0001"
                  className="rounded-xl border-[#8a4a22]/10 bg-white/60"
                />

                {/* Seats info in modal */}
                <div className="flex items-center gap-1.5 text-xs text-[#8a4a22]/60">
                  <Users className="h-3.5 w-3.5" />
                  <span>{seatsLeft} seats remaining out of {capacity}</span>
                </div>

                <Button
                  variant="liquidGlassMaroon"
                  onClick={onJoin}
                  disabled={loading || enroll.length < 3}
                  size="lg"
                  className="rounded-full font-semibold"
                >
                  {loading ? "Joining…" : "Confirm Join"}
                </Button>

                {/* WhatsApp link shown after joining — only visible inside modal */}
                {club.whatsappGroup && (
                  <a
                    href={club.whatsappGroup}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 text-xs text-[#8a4a22]/60 hover:text-[#8a4a22] transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Join WhatsApp Group
                  </a>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </motion.div>
  );
}
