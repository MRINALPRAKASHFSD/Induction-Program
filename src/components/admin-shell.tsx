import { Link, useNavigate, Navigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Element3, Calendar1, Profile2User, MagicStar, Chart1, Activity, Logout, HambergerMenu, CloseSquare, ScanBarcode, ShieldTick, DocumentText, Building4, Gallery, CalendarAdd
} from "iconsax-react";
// Supabase auth is bypassed — using local session flag instead
import { useSession } from "@/hooks/use-session";
import { auth, db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, onSnapshot, doc, setDoc } from "firebase/firestore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, Clock, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Only render on the client — avoids SSR hydration mismatch with auth state
const isClient = typeof window !== 'undefined';

const NAV = [
  { to: "/admin/dashboard",   label: "Dashboard",          icon: Element3     },
  { to: "/admin/attendance",  label: "Attendance",          icon: ScanBarcode  },
  { to: "/admin/events",      label: "Events",              icon: Calendar1    },
  { to: "/admin/planner",     label: "Induction Planner",   icon: CalendarAdd  },
  { to: "/admin/datasets",    label: "Dataset Management",  icon: DocumentText },
  { to: "/admin/students",    label: "Students",            icon: Profile2User },
  { to: "/admin/rooms",       label: "Rooms",               icon: Building4    },
  { to: "/admin/clubs",       label: "Clubs",               icon: MagicStar    },
  { to: "/admin/media",       label: "Media Library",       icon: Gallery      },
  { to: "/admin/announcements", label: "Announcements",     icon: Bell         },
  { to: "/admin/documents",   label: "Documents",           icon: ShieldTick   },
  { to: "/admin/analytics",   label: "Analytics",           icon: Chart1       },
  { to: "/admin/activity",    label: "Activity",            icon: Activity     },
] as const;

export function AdminShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { userId, loading } = useSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    // Listen to active announcements
    const qAnnouncements = query(
      collection(db, "announcements"), 
      where("status", "==", "active"),
      orderBy("createdAt", "desc")
    );
    
    const unsubAnnouncements = onSnapshot(qAnnouncements, (snap) => {
      const now = new Date().getTime();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => {
        // filter expired
        if (a.expiresAt && new Date(a.expiresAt).getTime() < now) return false;
        return true; // Admin sees all
      });
      setAnnouncements(docs);
    });

    // Listen to user's read states
    const qReads = collection(db, `user_notifications/${userId}/reads`);
    const unsubReads = onSnapshot(qReads, (snap) => {
      const reads = new Set(snap.docs.map(d => d.id));
      setReadIds(reads);
    });

    return () => {
      unsubAnnouncements();
      unsubReads();
    };
  }, [userId]);

  const markAsRead = async (id: string) => {
    if (!userId || readIds.has(id)) return;
    try {
      await setDoc(doc(db, `user_notifications/${userId}/reads/${id}`), {
        readAt: new Date().toISOString()
      });
    } catch (e) {
      console.error("Failed to mark read", e);
    }
  };

  const unreadCount = announcements.filter(a => !readIds.has(a.id)).length;
  const displayCount = unreadCount > 99 ? "99+" : unreadCount;

  const signOutAdmin = async () => {
    try {
      await auth.signOut();
      navigate({ to: "/admin/login" });
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 bg-background">
        <div className="max-w-7xl mx-auto space-y-8">
          <Skeleton className="h-12 w-64" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (!userId) {
    return <Navigate to="/admin/login" />;
  }

  return (
    <div className="min-h-screen relative overflow-hidden text-[#2c1208]">
      {/* Background Elements */}
      <div className="bg-hero-premium fixed inset-0 -z-10" />
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="orb orb-1 opacity-50" />
        <div className="orb orb-2 opacity-50" />
        <div className="orb orb-3 opacity-40" />
        <div className="hero-ring hero-ring-1 opacity-40" />
        <div className="hero-ring hero-ring-2 opacity-40" />
      </div>
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj4KICA8ZmlsdGVyIGlkPSJub2lzZSI+CiAgICA8ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44NSIgbnVtT2N0YXZlcz0iMyIgc3RpdGNoVGlsZXM9InN0aXRjaCIgLz4KICAgIDxmZUNvbG9yTWF0cml4IHR5cGU9Im1hdHJpeCIgdmFsdWVzPSIxIDAgMCAwIDAgIDAgMSAwIDAgMCAgMCAwIDEgMCAwICAwIDAgMCAwLjA4IDAiIC8+ICAKICA8L2ZpbHRlcj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2UpIiAvPgo8L3N2Zz4=')] opacity-30 mix-blend-multiply pointer-events-none -z-10" />

      <header className="sticky top-0 z-30 panel-liquid-glass">
        <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-[#5a2c14] hover:text-[#2c1208]" onClick={() => setOpen((o) => !o)} aria-label="Toggle nav">
              {open ? <CloseSquare variant="TwoTone" className="h-6 w-6" /> : <HambergerMenu variant="TwoTone" className="h-6 w-6" />}
            </button>
            <Link to="/admin/dashboard" className="font-bold text-xl text-[#2c1208] tracking-tight flex items-center gap-2">
              <ShieldTick variant="TwoTone" className="h-5 w-5 text-[#8a4a22]" />
              KRMU Admin
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-full text-amber-500 hover:bg-white/50 hover:text-amber-600">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white shadow-sm ring-2 ring-white/50">
                      {displayCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 bg-white/80 backdrop-blur-2xl border-white/40 shadow-2xl rounded-2xl overflow-hidden mt-2">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#8a4a22]/10 bg-white/50">
                  <h3 className="font-bold text-[#2c1208]">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="max-h-[60vh] overflow-y-auto hide-scrollbar">
                  {announcements.length === 0 ? (
                    <div className="p-8 text-center text-[#7a4020]/60">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-medium">You're all caught up!</p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <AnimatePresence>
                        {announcements.map((a) => {
                          const isRead = readIds.has(a.id);
                          return (
                            <motion.div
                              key={a.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            >
                              <Link 
                                to="/admin/announcements" 
                                onClick={() => { markAsRead(a.id); setIsOpen(false); }}
                                className={`block p-4 border-b border-[#8a4a22]/5 transition-colors hover:bg-white/60 relative ${!isRead ? "bg-white/40" : "opacity-75"}`}
                              >
                                {!isRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />}
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h4 className={`text-sm tracking-tight line-clamp-1 pr-16 ${!isRead ? "font-bold text-[#2c1208]" : "font-semibold text-[#5a2c14]"}`}>
                                    {a.title}
                                  </h4>
                                  {a.isImportant && (
                                    <span className="absolute top-4 right-4 bg-red-100 text-red-700 text-[9px] uppercase px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                                      <AlertCircle className="w-2.5 h-2.5" /> Urgent
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#7a4020] line-clamp-2 leading-relaxed mb-2">
                                  {a.content}
                                </p>
                                <div className="flex items-center justify-between">
                                  <div className="text-[10px] font-semibold text-[#8a4a22]/60 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {new Date(a.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                  </div>
                                </div>
                              </Link>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
                <div className="p-2 border-t border-[#8a4a22]/10 bg-white/50">
                  <Button variant="ghost" className="w-full text-xs font-bold text-[#5a2c14] rounded-xl hover:bg-white/60" asChild>
                    <Link to="/admin/announcements" onClick={() => setIsOpen(false)}>
                      Manage Announcements
                    </Link>
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button asChild variant="liquidGlassWhite" size="sm" className="rounded-full shadow-sm text-[#2c1208]"><Link to="/">View site</Link></Button>
            <Button onClick={signOutAdmin} variant="liquidGlassDark" size="sm" className="rounded-full shadow-sm"><Logout variant="TwoTone" className="mr-1.5 h-4 w-4" /> Sign out</Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto flex max-w-7xl gap-8 px-4 py-8 relative z-10">
        <aside className={`${open ? "block" : "hidden"} lg:block w-full lg:w-64 shrink-0`}>
          <div className="flex flex-col gap-5 sticky top-24">
            <nav className="grid gap-1.5 glass-card-hero p-3.5">
              {NAV.map(({ to, label, icon: Icon }) => {
                const active = path === to;
                return (
                  <Link
                    key={to} to={to} onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition-all ${
                      active 
                        ? "bg-[#3c1608] text-white shadow-md" 
                        : "text-[#7a4020] hover:bg-white/50 hover:text-[#2c1208]"
                    }`}
                  >
                    <Icon variant="TwoTone" className={`h-5 w-5 ${active ? "text-white" : "text-[#8a4a22]"}`} /> {label}
                  </Link>
                );
              })}
            </nav>

            {/* Privacy & Copyright Block */}
            <div className="glass-card-hero p-5">
              <div className="flex items-center gap-2 mb-3">
                <ShieldTick variant="TwoTone" className="h-4 w-4 text-[#8a4a22]" />
                <h4 className="text-[11px] font-bold text-[#2c1208] uppercase tracking-[0.15em]">Privacy First</h4>
              </div>
              <p className="text-xs leading-relaxed text-[#7a4020]/90 font-medium">
                Admin data is encrypted. Student records are confidential and used strictly for induction operations. Zero tracking.
              </p>
              <div className="mt-4 pt-4 border-t border-[#8a4a22]/15">
                <p className="text-[10px] font-semibold text-[#7a4020]/70 uppercase tracking-wider">
                  &copy; {new Date().getFullYear()} KRMU.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-8">
            <h1 className="text-3xl font-bold sm:text-4xl text-[#2c1208] tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-base text-[#7a4020]/80 font-medium">{subtitle}</p>}
          </div>
          <div className="glass-card-hero p-6 sm:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
