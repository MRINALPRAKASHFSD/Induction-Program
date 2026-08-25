import { Link, useNavigate, Navigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Element3, Calendar1, Profile2User, MagicStar, Chart1, Activity, Logout, HambergerMenu, CloseSquare, ScanBarcode, ShieldTick, DocumentText, Building4, Gallery, CalendarAdd, UserTick, MonitorMobbile, Notification
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
import { AlertCircle, Clock, Bell, Search, ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Only render on the client — avoids SSR hydration mismatch with auth state
const isClient = typeof window !== 'undefined';

// Navigation grouped into sections for the sidebar.
// Each section has a label (shown when sidebar is expanded) and a list of items.
const NAV_SECTIONS = [
  {
    label: "Operations",
    items: [
      { to: "/admin/dashboard",     label: "Dashboard",          icon: Element3      },
      { to: "/admin/attendance",    label: "Attendance",          icon: ScanBarcode   },
      { to: "/admin/events",        label: "Events",              icon: Calendar1     },
      { to: "/admin/planner",       label: "Induction Planner",   icon: CalendarAdd   },
      { to: "/admin/planners",      label: "Event Planners",      icon: CalendarAdd   },
      { to: "/admin/event-guests",  label: "Guest Analytics",     icon: UserTick      },
      { to: "/admin/rooms",         label: "Rooms",               icon: Building4     },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/admin/landing",       label: "Landing Experience",  icon: MonitorMobbile },
      { to: "/admin/media",         label: "Media Library",       icon: Gallery        },
      { to: "/admin/announcements", label: "Announcements",       icon: Notification   },
      { to: "/admin/documents",     label: "Documents",           icon: ShieldTick     },
    ],
  },
  {
    label: "Management",
    items: [
      { to: "/admin/students",      label: "Students",            icon: Profile2User  },
      { to: "/admin/clubs",         label: "Clubs",               icon: MagicStar     },
      { to: "/admin/datasets",      label: "Dataset Management",  icon: DocumentText  },
      { to: "/admin/analytics",     label: "Analytics",           icon: Chart1        },
      { to: "/admin/activity",      label: "Activity",            icon: Activity      },
    ],
  },
] as const;

export function AdminShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { userId, loading } = useSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  // Isolated UI state for desktop sidebar collapse
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem("adminSidebarCollapsed") === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("adminSidebarCollapsed", isCollapsed.toString());
  }, [isCollapsed]);

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
    <div className="min-h-screen relative overflow-hidden bg-background text-foreground flex flex-col">
      {/* Background Elements (Preserved but subtle) */}
      <div className="bg-hero-premium fixed inset-0 -z-10 opacity-30" />
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="orb orb-1 opacity-20" />
        <div className="orb orb-2 opacity-20" />
      </div>

      {/* Sticky Premium Header */}
      <header className="sticky top-0 z-50 bg-background/70 backdrop-blur-2xl border-b border-border/80 shadow-sm transition-all duration-200">
        <div className="admin-content-grid py-0 flex items-center justify-between h-16">
          <div className="flex items-center gap-1 lg:gap-2">
            {/* Mobile Toggle */}
            <button 
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-md text-foreground hover:bg-muted/60 transition-colors" 
              onClick={() => setOpen((o) => !o)} 
              aria-label="Toggle navigation"
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            {/* Desktop Toggle */}
            <button 
              className="hidden lg:flex items-center justify-center w-10 h-10 rounded-md text-foreground hover:bg-muted/60 transition-colors cursor-pointer" 
              onClick={() => setIsCollapsed((c) => !c)} 
              aria-label="Toggle navigation"
            >
              <Menu className="h-6 w-6" />
            </button>
            <Link to="/admin/dashboard" className="font-bold text-xl text-foreground tracking-tight flex items-center gap-2 px-2">
              <ShieldTick variant="TwoTone" className="h-6 w-6 text-primary" />
              <span className="hidden sm:inline-block">KRMU Admin</span>
            </Link>
            
            {/* Breadcrumb Area */}
            <div className="hidden md:flex items-center ml-4 pl-4 border-l border-border/50 text-sm text-muted-foreground font-medium">
               <span>Admin</span>
               <span className="mx-2">/</span>
               <span className="text-foreground capitalize">{path.split('/').pop()?.replace(/-/g, ' ') || 'Dashboard'}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             {/* Decorative Search Bar */}
             <div className="hidden lg:flex items-center relative mr-2">
                <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search (Cmd+K)" 
                  className="admin-input-enhanced pl-9 py-1.5 h-9 text-sm w-64 bg-muted/50 border border-transparent focus:bg-background focus:border-border transition-colors"
                  readOnly 
                />
             </div>

            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-full text-amber-600 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900/50">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white shadow-sm ring-2 ring-background">
                      {displayCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 bg-white/90 dark:bg-card/90 backdrop-blur-2xl border-border shadow-2xl rounded-2xl overflow-hidden mt-2">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                  <h3 className="font-bold text-foreground">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="max-h-[60vh] overflow-y-auto hide-scrollbar">
                  {announcements.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground/60">
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
                                className={`block p-4 border-b border-border/50 transition-colors hover:bg-muted/50 relative ${!isRead ? "bg-muted/30" : "opacity-75"}`}
                              >
                                {!isRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />}
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h4 className={`text-sm tracking-tight line-clamp-1 pr-16 ${!isRead ? "font-bold text-foreground" : "font-semibold text-muted-foreground"}`}>
                                    {a.title}
                                  </h4>
                                  {a.isImportant && (
                                    <span className="absolute top-4 right-4 bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 text-[9px] uppercase px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                                      <AlertCircle className="w-2.5 h-2.5" /> Urgent
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">
                                  {a.content}
                                </p>
                                <div className="flex items-center justify-between">
                                  <div className="text-[10px] font-semibold text-muted-foreground/80 flex items-center gap-1">
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
                <div className="p-2 border-t border-border bg-muted/30">
                  <Button variant="ghost" className="w-full text-xs font-bold text-foreground rounded-xl hover:bg-muted" asChild>
                    <Link to="/admin/announcements" onClick={() => setIsOpen(false)}>
                      Manage Announcements
                    </Link>
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile Avatar Placeholder */}
            <div className="h-9 w-9 rounded-full bg-primary/10 ring-2 ring-primary/20 ring-offset-2 ring-offset-background flex items-center justify-center text-primary font-bold text-sm mx-1 hidden sm:flex">
              A
            </div>

            <Button asChild variant="outline" size="sm" className="hidden sm:flex rounded-full shadow-sm text-foreground bg-background"><Link to="/">View site</Link></Button>
            <Button onClick={signOutAdmin} variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-destructive"><Logout variant="TwoTone" className="h-5 w-5 sm:mr-1.5" /> <span className="hidden sm:inline">Sign out</span></Button>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="admin-content-grid flex-1 flex gap-8 items-start relative z-10 w-full pt-6 pb-12">
        
        {/* Mobile Backdrop */}
        {open && (
           <div className="admin-sidebar-backdrop lg:hidden" onClick={() => setOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`${
           open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed lg:sticky top-0 lg:top-[88px] left-0 z-40 h-full lg:h-[calc(100vh-100px)] transition-[width,transform] duration-300 ease-in-out ${
           isCollapsed ? "lg:w-20" : "lg:w-64"
        } shrink-0 bg-[#FDFBF7] dark:bg-muted/30 backdrop-blur-md lg:bg-transparent lg:backdrop-blur-none shadow-2xl lg:shadow-none p-4 lg:p-0 border-r border-border/40`}>
          
          <div className="flex flex-col gap-4 h-full overflow-y-auto hide-scrollbar admin-scroll-area">
             {/* Main Menu Label (only when expanded) */}
             {!isCollapsed && (
               <div className="flex items-center mb-2 px-1">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Main Menu</h3>
               </div>
             )}
             
             <nav className="flex flex-col gap-3">
               {NAV_SECTIONS.map((section) => (
                 <div key={section.label} className={`transition-all duration-300 ${isCollapsed ? "py-1" : "admin-card p-3"}`}>
                   {!isCollapsed && (
                     <p className="text-[9px] font-black uppercase tracking-[0.22em] text-muted-foreground/35 px-1 mb-2">
                       {section.label}
                     </p>
                   )}
                   <div className="grid gap-1">
                     {section.items.map(({ to, label, icon: Icon }) => {
                       const active = path === to;
                       return (
                         <Link
                           key={to} to={to} onClick={() => setOpen(false)}
                           title={isCollapsed ? label : undefined}
                           className={`flex items-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition-all group relative overflow-hidden ${
                             active
                               ? "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md shadow-primary/20"
                               : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                           } ${isCollapsed ? "justify-center w-12 h-12 mx-auto px-0" : "px-3"}`}
                         >
                           {active && !isCollapsed && (
                             <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-white/90 rounded-r-full shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
                           )}
                           <Icon
                             variant={active ? "Bold" : "TwoTone"}
                             className={`h-5 w-5 shrink-0 transition-transform group-hover:scale-110 ${active ? "text-white" : "text-primary/60 group-hover:text-primary"}`}
                           />
                           {!isCollapsed && <span>{label}</span>}
                         </Link>
                       );
                     })}
                   </div>
                 </div>
               ))}
             </nav>

             {/* Privacy block - hide when collapsed */}
             {!isCollapsed && (
               <div className="admin-card p-5 mt-auto">
                 <div className="flex items-center gap-2 mb-3">
                   <ShieldTick variant="TwoTone" className="h-4 w-4 text-primary" />
                   <h4 className="text-[11px] font-bold text-foreground uppercase tracking-[0.15em]">Privacy First</h4>
                 </div>
                 <p className="text-xs leading-relaxed text-muted-foreground font-medium">
                   Admin data is encrypted. Student records are confidential. Zero tracking.
                 </p>
               </div>
             )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0 flex-1 w-full admin-scroll-area">
          <div className="mb-8">
            <h1 className="admin-page-title">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted-foreground font-medium">{subtitle}</p>}
          </div>
          {/* Note: We removed the glass-card-hero wrapper to allow pages to own their card layouts as specified in Phase 2 */}
          <div className="w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

