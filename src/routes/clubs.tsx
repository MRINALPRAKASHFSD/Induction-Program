import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { localDb, type LocalClub } from "@/lib/local-db";

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

  useEffect(() => {
    setClubs(localDb.getClubs().filter(c => c.is_active));
  }, []);

  const onJoin = async () => {
    if (!active) return;
    setLoading(true);
    try {
      // Small simulated delay for UX
      await new Promise(r => setTimeout(r, 400));
      
      const res = localDb.registerForClub(enroll.trim(), active.slug);
      
      if (!res.ok) toast.error(res.error);
      else if (res.duplicate) toast.info(`Already in ${active.name}`);
      else toast.success(`Joined ${active.name}!`);
      
      setActive(null);
      setEnroll("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold sm:text-4xl">Clubs & societies</h1>
          <p className="mt-2 text-muted-foreground">Find your people. Join as many as you like — registration is one tap.</p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="group flex flex-col rounded-2xl border bg-card-soft p-5 shadow-sm transition hover:shadow-elegant"
            >
              <h3 className="text-lg font-semibold">{c.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{c.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
              </div>
              <Dialog open={active?.id === c.id} onOpenChange={(o) => !o && setActive(null)}>
                <DialogTrigger asChild>
                  <Button className="mt-4 w-full" onClick={() => setActive(c)}>Join</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Join {c.name}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <Label>Your enrollment number</Label>
                    <Input
                      autoFocus value={enroll}
                      onChange={(e) => setEnroll(e.target.value.toUpperCase())}
                      placeholder="KRMU24CS0001"
                    />
                    <Button onClick={onJoin} disabled={loading || enroll.length < 3} size="lg">
                      {loading ? "Joining…" : "Confirm join"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
