import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useCallback, useMemo } from "react";
// Firebase imports moved to dynamic imports inside effects and handlers
import { localDb } from "@/lib/local-db";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { m, AnimatePresence } from "framer-motion";
import {
  AlertCircle, Calendar, CalendarDays, Clock, Bell, User, LogOut, ChevronRight,
  CheckCircle2, ScanLine, MapPin, Megaphone,
  UsersRound, Users, Shield, HelpCircle, Wallet, LayoutDashboard, LogIn, UserPlus, Menu, X, CircleUserRound
} from "lucide-react";

/* ─── Nav Items ─────────────────────────────────────────────────── */

type NavItem = {
  to: string;
  label: string;
  icon: typeof Calendar;
  comingSoon?: boolean;
  requiresAuth?: boolean;
  guestOnly?: boolean;
};

// Items shown BEFORE registration (Frozen Order)
const GUEST_NAV_ITEMS: NavItem[] = [
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/clubs", label: "Clubs", icon: Users },
  { to: "/campus", label: "Campus", icon: MapPin },
];

// Items shown AFTER registration (Frozen Order)
const AUTH_NAV_ITEMS: NavItem[] = [
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/clubs", label: "Clubs", icon: Users },
  { to: "/campus", label: "Campus", icon: MapPin },
  { to: "/my-pass", label: "Dashboard", icon: LayoutDashboard },
  { to: "/announcements", label: "Announcements", icon: Megaphone },
  { to: "/help", label: "Help", icon: HelpCircle },
];

/* ─── Exported Spacer ───────────────────────────────────────────── */

export function NavSpacer() {
  return <div className="nav-spacer" />;
}

/* ─── Main Header ───────────────────────────────────────────────── */

export function SiteHeader() {
  const [user, setUser] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [plannerActive, setPlannerActive] = useState(false);

  const path = useRouterState({ select: (s) => s.location.pathname });

  // Check if user has registered (has a student profile)
  const profile = useMemo(() => localDb.getStudentProfile(), [user]);
  const isRegistered = !!profile;

  // Determine which nav items to show
  const navItems = useMemo(() => {
    if (!isRegistered) return GUEST_NAV_ITEMS;
    return AUTH_NAV_ITEMS;
  }, [isRegistered]);

  /* ── Scroll listener ──────────────────────────────────────────── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Lock body scroll + add page-scale class when mobile menu is open */
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      document.body.classList.add("menu-open");
    } else {
      document.body.style.overflow = "";
      document.body.classList.remove("menu-open");
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    if (mobileOpen) {
      window.addEventListener("keydown", onKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("menu-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  /* ── Auth listener ────────────────────────────────────────────── */
  useEffect(() => {
    let unsubscribe = () => {};
    Promise.all([
      import("@/lib/firebase/config"),
      import("firebase/auth")
    ]).then(([{ auth }, { onAuthStateChanged }]) => {
      unsubscribe = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthLoading(false);
      });
    }).catch(e => console.error("Firebase auth lazy load failed", e));
    return () => unsubscribe();
  }, []);

  /* ── Announcements listener ───────────────────────────────────── */
  useEffect(() => {
    let unsubAnnouncements = () => {};
    
    Promise.all([
      import("@/lib/firebase/config"),
      import("firebase/firestore")
    ]).then(([{ db }, { collection, query, where, onSnapshot }]) => {
      const qAnnouncements = query(
        collection(db, "announcements"),
        where("status", "==", "active")
      );
      
      unsubAnnouncements = onSnapshot(qAnnouncements, (snap) => {
        const now = new Date().getTime();
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => {
          if (a.expiresAt && new Date(a.expiresAt).getTime() < now) return false;
          return a.targetAudience === "All Students";
        });
        docs.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
        setAnnouncements(docs);
      });
    }).catch(e => console.error("Firebase firestore lazy load failed", e));

    return () => {
      unsubAnnouncements();
    };
  }, []);

  /* ── Read-state listener ──────────────────────────────────────── */
  useEffect(() => {
    if (user) {
      let unsubReads = () => {};
      Promise.all([
        import("@/lib/firebase/config"),
        import("firebase/firestore")
      ]).then(([{ db }, { collection, onSnapshot }]) => {
        const qReads = collection(db, `user_notifications/${user.uid}/reads`);
        unsubReads = onSnapshot(qReads, (snap) => {
          const reads = new Set(snap.docs.map(d => d.id));
          setReadIds(reads);
        });
      }).catch(e => console.error("Firebase reads lazy load failed", e));
      
      return () => unsubReads();
    } else {
      const localReads = JSON.parse(localStorage.getItem('read_announcements') || '[]');
      setReadIds(new Set(localReads));
    }
  }, [user]);

  /* ── Handlers ─────────────────────────────────────────────────── */
  const handleLogout = async () => {
    try {
      const { auth } = await import("@/lib/firebase/config");
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
      // Clear all student-facing session keys from localStorage
      localStorage.removeItem("krmu_active_profile");
      localStorage.removeItem("krmu_verified_student_id");
      toast.success("Logged out successfully");
      window.location.href = "/";
    } catch (err) {
      toast.error("Failed to log out");
    }
  };

  const markAsRead = useCallback(async (id: string) => {
    if (readIds.has(id)) return;
    
    if (user) {
      try {
        const [{ db }, { doc, setDoc }] = await Promise.all([
          import("@/lib/firebase/config"),
          import("firebase/firestore")
        ]);
        await setDoc(doc(db, `user_notifications/${user.uid}/reads/${id}`), {
          readAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Failed to mark as read", err);
      }
    } else {
      const updated = new Set(readIds);
      updated.add(id);
      setReadIds(updated);
      localStorage.setItem('read_announcements', JSON.stringify(Array.from(updated)));
    }
  }, [readIds, user]);

  const markAllAsRead = async () => {
    const unread = announcements.filter(a => !readIds.has(a.id));
    if (user) {
      for (const a of unread) {
        await markAsRead(a.id);
      }
    } else {
      const newReads = new Set(readIds);
      unread.forEach(a => newReads.add(a.id));
      setReadIds(newReads);
      localStorage.setItem('read_announcements', JSON.stringify(Array.from(newReads)));
    }
  };

  const unreadCount = announcements.filter(a => !readIds.has(a.id)).length;
  const displayCount = unreadCount > 99 ? "99+" : unreadCount;
  const userInitial = user?.email?.[0]?.toUpperCase() || "?";
  const profileInitial = profile?.full_name?.[0]?.toUpperCase() || userInitial;
  const profilePhoto = profile?.profile_picture_url || profile?.photo_url || user?.photoURL;

  const isActive = (to: string) => {
    if (to === "/") return path === "/";
    return path.startsWith(to);
  };

  const isHomePage = path === "/";
  const isTransparent = isHomePage && !scrolled;

  const textColor = isTransparent ? "text-white" : "text-[#00509e]";
  const textHoverColor = isTransparent ? "hover:text-white/80" : "hover:text-[#d2232a]";
  const borderBottomColor = isTransparent ? "border-white/20" : "border-[#00509e]/10";
  const topBarBg = isTransparent ? "bg-transparent border-b border-white/20" : "bg-[#d2232a]";

  return (
    <>
      {/* ── Institutional Header ───────────────────────────────────── */}
      <header
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${isTransparent ? 'bg-gradient-to-b from-black/80 via-black/40 to-transparent' : 'bg-white shadow-md'}`}
      >
        <div className={`hidden lg:flex items-center justify-between px-6 py-2 text-white text-xs font-semibold tracking-wide transition-colors duration-300 ${topBarBg}`}>
          <div className="flex items-center gap-6">
            <span className="bg-white/20 px-3 py-1 rounded-full uppercase text-[10px] tracking-widest border border-white/30">
              AARAMBH 2026
            </span>
            <Link 
              to="/help" 
              className="relative group text-white hover:text-[#fcfaf8] transition-colors duration-300"
            >
              Contact Us
              <span className={`absolute left-0 -bottom-1.5 w-full h-[2px] rounded-full bg-[#d2232a] shadow-[0_0_8px_rgba(210,35,42,0.5)] origin-left transition-transform duration-300 ease-in-out ${isActive("/help") ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`} />
            </Link>
            <Link 
              to="/campus" 
              className="relative group text-white hover:text-[#fcfaf8] transition-colors duration-300"
            >
              Campus Map
              <span className={`absolute left-0 -bottom-1.5 w-full h-[2px] rounded-full bg-[#d2232a] shadow-[0_0_8px_rgba(210,35,42,0.5)] origin-left transition-transform duration-300 ease-in-out ${isActive("/campus") ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`} />
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <a 
              href="https://eozka.com/community" 
              target="_blank"
              rel="noopener noreferrer"
              className="relative group text-white hover:text-[#fcfaf8] transition-colors duration-300"
            >
              Careers
              <span className="absolute left-0 -bottom-1.5 w-full h-[2px] rounded-full bg-[#d2232a] shadow-[0_0_8px_rgba(210,35,42,0.5)] origin-left transition-transform duration-300 ease-in-out scale-x-0 group-hover:scale-x-100" />
            </a>
          </div>
        </div>

        {/* Main Navigation */}
        <div className={`flex items-center justify-between px-4 lg:px-8 py-3 lg:py-5 border-b transition-colors duration-300 ${borderBottomColor}`}>
          
          {/* Left: Logo */}
          <Link to="/" className={`flex items-center shrink-0 transition-all duration-300 ${isTransparent ? 'bg-white/95 px-3 py-1 rounded-md shadow-sm' : ''}`} onClick={() => setMobileOpen(false)}>
             <img src="/krmu-emblem.webp" alt="K.R. Mangalam University" className="h-10 lg:h-12 object-contain" />
          </Link>

          {/* Center: Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8 mx-4">
            {navItems.map((item) => {
              const active = isActive(item.to);
              const activeColor = isTransparent ? "text-white" : "text-[#d2232a]";
              const underlineColor = isTransparent ? "bg-white" : "bg-[#d2232a]";
              
              return item.comingSoon ? (
                <button
                  key={item.label}
                  className={`${textColor} font-bold ${textHoverColor} transition-colors text-xs xl:text-sm uppercase tracking-wider relative group`}
                  onClick={() => toast.info(`${item.label} is coming soon!`, { description: "We're building something special." })}
                >
                  {item.label}
                  <span className={`absolute -bottom-1 left-0 w-0 h-[2px] ${underlineColor} group-hover:w-full transition-all duration-300`} />
                </button>
              ) : (
                <Link
                  key={item.to}
                  to={item.to as any}
                  className={`text-xs xl:text-sm uppercase tracking-wider font-bold transition-colors relative group ${active ? activeColor : `${textColor} ${textHoverColor}`}`}
                >
                  {item.label}
                  <span className={`absolute -bottom-1 left-0 h-[2px] ${underlineColor} transition-all duration-300 ${active ? "w-full" : "w-0 group-hover:w-full"}`} />
                </Link>
              )
            })}
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Scanner CTA */}
            {isRegistered && (
              <Link
                to="/attendance"
                className={`hidden lg:flex items-center gap-2 border px-4 py-2 transition-colors text-xs font-bold uppercase tracking-wider ${isTransparent ? 'text-white border-white hover:bg-white hover:text-[#00509e]' : 'text-[#00509e] border-[#00509e] hover:bg-[#00509e] hover:text-white'}`}
              >
                <ScanLine className="w-4 h-4" />
                <span>Scan</span>
              </Link>
            )}

            {/* Auth CTAs for guests */}
            {!isRegistered && !user && (
              <div className="hidden lg:flex items-center gap-3">
                <Button variant="outline" size="sm" asChild className={`rounded-none transition-colors px-6 h-10 font-bold uppercase tracking-wider text-xs ${isTransparent ? 'border-white text-white hover:bg-white hover:text-black bg-transparent backdrop-blur-sm' : 'border-[#00509e] text-[#00509e] hover:bg-[#00509e] hover:text-white'}`}>
                  <Link to="/login">Login</Link>
                </Button>
                <Button size="sm" asChild className="rounded-none bg-[#d2232a] hover:bg-[#b01d22] text-white px-6 h-10 font-bold uppercase tracking-wider text-xs shadow-md border-none">
                  <Link to="/register">Apply Now</Link>
                </Button>
              </div>
            )}

            {/* Notification Bell */}
            {isRegistered && (
              <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
                <DropdownMenuTrigger asChild>
                  <button className={`relative p-2 rounded-full transition-colors ${textColor} hover:bg-white/10`} aria-label="Notifications">
                    <Bell className="w-6 h-6" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-[#d2232a] text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white">
                        {displayCount}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 lg:w-96 p-0 bg-white border border-[#00509e]/10 shadow-xl rounded-none mt-2">
                  <div className="flex items-center justify-between px-4 py-3 bg-[#00509e] text-white">
                    <h3 className="font-bold text-sm uppercase tracking-wider">Notifications</h3>
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} className="text-[10px] uppercase font-bold text-white/80 hover:text-white transition-colors flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    {announcements.length === 0 ? (
                      <div className="p-8 text-center text-[#00509e]/60">
                        <Bell className="h-8 w-8 opacity-40 mx-auto mb-3" />
                        <p className="text-sm font-bold">You're all caught up!</p>
                      </div>
                    ) : (
                      <div className="flex flex-col divide-y divide-[#00509e]/5">
                        {announcements.map((a) => {
                          const isRead = readIds.has(a.id);
                          return (
                            <Link 
                              key={a.id}
                              to="/announcements" 
                              onClick={() => { markAsRead(a.id); setNotifOpen(false); }}
                              className={`block p-4 transition-colors hover:bg-slate-50 ${!isRead ? "bg-white" : "bg-slate-50/50 opacity-70"}`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h4 className={`text-sm line-clamp-1 pr-16 ${!isRead ? "font-bold text-[#00509e]" : "font-semibold text-[#00509e]/80"}`}>
                                  {a.title}
                                </h4>
                                {a.isImportant && (
                                  <span className="absolute top-4 right-4 bg-[#d2232a] text-white text-[9px] uppercase px-1.5 py-0.5 rounded font-bold">
                                    Urgent
                                  </span>
                                )}
                              </div>
                              <p className={`text-xs line-clamp-2 leading-relaxed mb-2 ${!isRead ? "text-slate-700" : "text-slate-500"}`}>
                                {a.content}
                              </p>
                              <div className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(a.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="p-2 border-t border-[#00509e]/10 bg-slate-50">
                    <Button variant="ghost" className="w-full text-xs font-bold text-[#00509e] rounded-none hover:bg-[#00509e]/5 uppercase tracking-wider" asChild>
                      <Link to="/announcements" onClick={() => setNotifOpen(false)}>
                        View All Announcements <ChevronRight className="w-4 h-4 ml-1 inline-block" />
                      </Link>
                    </Button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Profile Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`p-2 rounded-full transition-colors flex items-center gap-2 ${textColor} hover:bg-white/10`} aria-label="User menu">
                  {user ? (
                    profilePhoto ? (
                      <img src={profilePhoto} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-white/20" />
                    ) : profileInitial ? (
                      <span className={`w-8 h-8 flex items-center justify-center text-white rounded-full text-sm font-bold ${isTransparent ? 'bg-white/20 border border-white/40' : 'bg-[#00509e]'}`}>{profileInitial}</span>
                    ) : (
                      <CircleUserRound className="w-6 h-6" />
                    )
                  ) : (
                    <User className="w-6 h-6" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 mt-2 p-0 bg-white border border-[#00509e]/10 shadow-xl rounded-none">
                {user ? (
                  <>
                    <div className="px-4 py-4 bg-slate-50 border-b border-[#00509e]/10">
                      <div className="flex items-center gap-3">
                        {profilePhoto ? (
                          <img src={profilePhoto} alt="Profile" className="w-10 h-10 rounded-full object-cover border border-[#00509e]/20" />
                        ) : profileInitial ? (
                          <span className="w-10 h-10 flex items-center justify-center bg-[#00509e] text-white rounded-full text-sm font-bold">{profileInitial}</span>
                        ) : (
                          <CircleUserRound className="w-10 h-10 text-[#00509e]/80" />
                        )}
                        <div className="min-w-0 flex flex-col">
                          <p className="text-[#00509e] font-bold truncate">{profile?.full_name || user.email}</p>
                          <p className="text-xs text-slate-500 truncate">{user.email}</p>
                          <span className="mt-1 text-[10px] uppercase font-bold tracking-wider text-[#d2232a]">
                            {isRegistered ? profile?.branch || "Student" : "Registered Member"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-1">
                      <DropdownMenuItem asChild className="cursor-pointer rounded-none px-3 py-2.5 text-[#00509e] font-semibold hover:bg-[#00509e]/5 transition-colors focus:bg-[#00509e]/5">
                        <Link to="/my-pass" className="flex items-center justify-between w-full">
                          <span className="flex items-center gap-3">
                            <LayoutDashboard className="w-4 h-4" /> Dashboard
                          </span>
                          <ChevronRight className="w-4 h-4 opacity-50" />
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="cursor-pointer rounded-none px-3 py-2.5 text-[#00509e]/80 hover:bg-[#00509e]/5 transition-colors focus:bg-[#00509e]/5">
                        <Link to="/my-pass" className="flex items-center gap-3 w-full">
                          <Shield className="w-4 h-4" /> Digital ID
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="cursor-pointer rounded-none px-3 py-2.5 text-[#00509e]/80 hover:bg-[#00509e]/5 transition-colors focus:bg-[#00509e]/5">
                        <Link to="/schedule" className="flex items-center gap-3 w-full">
                          <CalendarDays className="w-4 h-4" /> Schedule
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="cursor-pointer rounded-none px-3 py-2.5 text-[#00509e]/80 hover:bg-[#00509e]/5 transition-colors focus:bg-[#00509e]/5">
                        <Link to="/clubs" className="flex items-center gap-3 w-full">
                          <UsersRound className="w-4 h-4" /> Attendance
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="cursor-pointer rounded-none px-3 py-2.5 text-[#00509e]/80 hover:bg-[#00509e]/5 transition-colors focus:bg-[#00509e]/5">
                        <Link to="/announcements" className="flex items-center gap-3 w-full">
                          <Megaphone className="w-4 h-4" /> Announcements
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="cursor-pointer rounded-none px-3 py-2.5 text-[#00509e]/80 hover:bg-[#00509e]/5 transition-colors focus:bg-[#00509e]/5">
                        <Link to="/help" className="flex items-center gap-3 w-full">
                          <HelpCircle className="w-4 h-4" /> Help
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[#00509e]/10 mx-1" />
                      <DropdownMenuItem onClick={handleLogout} className="cursor-pointer rounded-none px-3 py-2.5 text-[#d2232a] font-semibold hover:bg-[#d2232a]/5 transition-colors focus:bg-[#d2232a]/5 focus:text-[#d2232a]">
                        <LogOut className="w-4 h-4 mr-3" /> Log out
                      </DropdownMenuItem>
                    </div>
                  </>
                ) : (
                  <div className="p-1">
                    <DropdownMenuItem asChild className="cursor-pointer rounded-none px-3 py-2.5 text-[#00509e] font-semibold hover:bg-[#00509e]/5 transition-colors focus:bg-[#00509e]/5">
                      <Link to="/register" className="flex items-center gap-3 w-full">
                        <UserPlus className="w-4 h-4" /> Apply Now
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-none px-3 py-2.5 text-[#00509e] font-semibold hover:bg-[#00509e]/5 transition-colors focus:bg-[#00509e]/5">
                      <Link to="/login" className="flex items-center gap-3 w-full">
                        <LogIn className="w-4 h-4" /> Login
                      </Link>
                    </DropdownMenuItem>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile Hamburger (visible < lg) */}
            <button
              type="button"
              className={`lg:hidden p-2 ml-2 transition-colors rounded-full ${textColor} hover:bg-white/10`}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Navigation Backdrop ────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <m.div
            className="fixed inset-0 bg-[#00509e]/20 backdrop-blur-sm z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Mobile Navigation Sheet ───────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <m.nav
            className="fixed top-0 right-0 bottom-0 w-[85vw] max-w-sm bg-white z-50 shadow-2xl lg:hidden flex flex-col"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div className="flex items-center justify-between p-4 border-b border-[#00509e]/10">
              <span className="text-xs font-bold tracking-widest uppercase text-[#00509e]">Menu</span>
              <button onClick={() => setMobileOpen(false)} className="p-2 text-[#00509e] hover:bg-[#00509e]/5 rounded-full">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {/* Navigation List */}
              <div className="flex flex-col gap-4">
                {navItems.map((item) => {
                  const active = isActive(item.to);
                  return item.comingSoon ? (
                    <button
                      key={item.label}
                      type="button"
                      className="flex items-center text-left text-[#00509e]/60"
                      onClick={() => {
                        toast.info(`${item.label} is coming soon!`);
                        setMobileOpen(false);
                      }}
                    >
                      <item.icon className="w-5 h-5 mr-4" />
                      <span className="font-bold text-lg uppercase tracking-wider">{item.label}</span>
                      <span className="ml-auto text-[10px] font-bold text-white bg-[#00509e]/40 px-2 py-0.5 rounded uppercase">Soon</span>
                    </button>
                  ) : (
                    <Link
                      key={item.to}
                      to={item.to as any}
                      className={`flex items-center transition-colors group ${active ? "text-[#d2232a]" : "text-[#00509e] hover:text-[#d2232a]"}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <item.icon className={`w-5 h-5 mr-4 ${active ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`} />
                      <span className="font-bold text-lg uppercase tracking-wider">{item.label}</span>
                      <ChevronRight className={`w-5 h-5 ml-auto ${active ? "opacity-100" : "opacity-30 group-hover:opacity-100"}`} />
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="p-6 border-t border-[#00509e]/10 bg-slate-50">
              {!isRegistered && !user ? (
                <div className="flex flex-col gap-3">
                  <Button asChild className="w-full rounded-none bg-[#d2232a] hover:bg-[#b01d22] text-white h-12 font-bold uppercase tracking-wider">
                    <Link to="/register" onClick={() => setMobileOpen(false)}>Apply Now</Link>
                  </Button>
                  <Button variant="outline" asChild className="w-full rounded-none border-[#00509e] text-[#00509e] hover:bg-[#00509e] hover:text-white h-12 font-bold uppercase tracking-wider">
                    <Link to="/login" onClick={() => setMobileOpen(false)}>Login</Link>
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => { handleLogout(); setMobileOpen(false); }} className="w-full rounded-none border-[#d2232a] text-[#d2232a] hover:bg-[#d2232a] hover:text-white h-12 font-bold uppercase tracking-wider">
                  <LogOut className="w-4 h-4 mr-2" /> Log out
                </Button>
              )}
            </div>
          </m.nav>
        )}
      </AnimatePresence>

      {/* Spacer to push content below the taller fixed header */}
      {!isHomePage && <div className="h-[100px] lg:h-[120px]" />}
    </>
  );
}
