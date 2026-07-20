import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useCallback, useMemo } from "react";
import { auth, db } from "@/lib/firebase/config";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, query, where, onSnapshot, doc, setDoc } from "firebase/firestore";
import { localDb } from "@/lib/local-db";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, Calendar, Clock, Bell, User, LogOut, ChevronRight,
  CheckCircle2, ScanLine, MapPin, Ticket, Megaphone, Menu,
  UsersRound, Shield, HelpCircle, Settings, Wallet, X,
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

// Items shown BEFORE registration
const GUEST_NAV_ITEMS: NavItem[] = [
  { to: "/schedule", label: "Schedule", icon: Calendar },
  { to: "/clubs", label: "Clubs", icon: UsersRound },
  { to: "/campus", label: "Campus", icon: MapPin },
];

// Items shown AFTER registration
const AUTH_NAV_ITEMS: NavItem[] = [
  { to: "/my-pass", label: "Wallet", icon: Wallet },
  { to: "/schedule", label: "Schedule", icon: Calendar },
  { to: "/announcements", label: "Announcements", icon: Megaphone },
  { to: "/clubs", label: "Clubs", icon: UsersRound },
  { to: "/campus", label: "Campus", icon: MapPin },
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
  const [scrolled, setScrolled] = useState(false);

  const path = useRouterState({ select: (s) => s.location.pathname });

  // Check if user has registered (has a student profile)
  const profile = useMemo(() => localDb.getStudentProfile(), [user]);
  const isRegistered = !!profile;

  // Determine which nav items to show
  const navItems = isRegistered ? AUTH_NAV_ITEMS : GUEST_NAV_ITEMS;

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
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("menu-open");
    };
  }, [mobileOpen]);

  /* ── Auth listener ────────────────────────────────────────────── */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  /* ── Announcements listener ───────────────────────────────────── */
  useEffect(() => {
    const qAnnouncements = query(
      collection(db, "announcements"),
      where("status", "==", "active")
    );
    
    const unsubAnnouncements = onSnapshot(qAnnouncements, (snap) => {
      const now = new Date().getTime();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => {
        if (a.expiresAt && new Date(a.expiresAt).getTime() < now) return false;
        return a.targetAudience === "All Students";
      });
      docs.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
      setAnnouncements(docs);
    });

    return () => unsubAnnouncements();
  }, []);

  /* ── Read-state listener ──────────────────────────────────────── */
  useEffect(() => {
    if (user) {
      const qReads = collection(db, `user_notifications/${user.uid}/reads`);
      const unsubReads = onSnapshot(qReads, (snap) => {
        const reads = new Set(snap.docs.map(d => d.id));
        setReadIds(reads);
      });
      return () => unsubReads();
    } else {
      const localReads = JSON.parse(localStorage.getItem('read_announcements') || '[]');
      setReadIds(new Set(localReads));
    }
  }, [user]);

  /* ── Handlers ─────────────────────────────────────────────────── */
  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("krmu_active_profile");
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
        await setDoc(doc(db, `user_notifications/${user.uid}/reads/${id}`), {
          readAt: new Date().toISOString()
        });
      } catch (e) {
        console.error("Failed to mark read", e);
      }
    } else {
      const newReads = new Set(readIds);
      newReads.add(id);
      setReadIds(newReads);
      localStorage.setItem('read_announcements', JSON.stringify(Array.from(newReads)));
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

  const isActive = (to: string) => {
    if (to === "/") return path === "/";
    return path.startsWith(to);
  };

  return (
    <>
      {/* ── Floating Nav Bar ─────────────────────────────────────── */}
      <header
        className="nav-floating"
        data-scrolled={scrolled ? "true" : "false"}
      >
        <div className="nav-inner flex items-center justify-between px-4 md:px-5">
          
          {/* Left: Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0" onClick={() => setMobileOpen(false)}>
            <img src="/krmu-emblem.webp" alt="KRMU Emblem" className="h-9 w-auto mix-blend-multiply object-contain" />
            <span className="text-base font-semibold tracking-tight text-[#6b3517] hidden sm:inline-block">
              Deeksharambh
            </span>
          </Link>

          {/* Center: Desktop Nav Links (hidden on mobile) */}
          <nav className="hidden md:flex items-center gap-0.5 mx-4">
            {navItems.map((item) => (
              item.comingSoon ? (
                <button
                  key={item.label}
                  className={`nav-link`}
                  onClick={() => toast.info(`${item.label} is coming soon!`, { description: "We're building something special." })}
                >
                  <item.icon className="w-3.5 h-3.5 opacity-60" />
                  {item.label}
                </button>
              ) : (
                <Link
                  key={item.to}
                  to={item.to as any}
                  className={`nav-link ${isActive(item.to) ? "active" : ""}`}
                >
                  <item.icon className="w-3.5 h-3.5 opacity-60" />
                  {item.label}
                </Link>
              )
            ))}
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 shrink-0">

            {/* Scanner CTA — only show when registered */}
            {isRegistered && (
              <Link
                to="/attendance"
                className="nav-scanner-btn nav-scanner-btn-compact md:nav-scanner-btn-compact-off relative"
              >
                <ScanLine className="w-4 h-4" />
                <span className="hidden sm:inline">Scan</span>
                <span className="sm:hidden">Scan</span>
                <span className="nav-scanner-btn-ring" />
              </Link>
            )}

            {/* Register CTA for guests */}
            {!isRegistered && !user && (
              <Button variant="liquidGlassMaroon" size="sm" asChild className="rounded-full px-4 h-8 text-xs font-bold hidden sm:flex">
                <Link to="/register">Register</Link>
              </Button>
            )}

            {/* Notification Bell — only show when registered */}
            {isRegistered && (
              <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
                <DropdownMenuTrigger asChild>
                  <button className="nav-icon-btn" aria-label="Notifications">
                    <Bell className="w-[18px] h-[18px]" />
                    {unreadCount > 0 && (
                      <span className="nav-badge">{displayCount}</span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-[calc(100vw-2rem)] sm:w-96 max-w-sm p-0 glass-premium-v2 border-none shadow-2xl rounded-2xl overflow-hidden mt-2"
                >
                  {/* Notification Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#8a4a22]/10 bg-white/50">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-[#2c1208] text-sm">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="text-[10px] font-bold text-[#8a4a22] bg-[#8a4a22]/10 px-2 py-0.5 rounded-full">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={markAllAsRead} 
                        className="h-6 px-2 text-[10px] uppercase font-bold text-[#8a4a22] hover:bg-[#8a4a22]/10 rounded-full transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Mark all read
                      </Button>
                    )}
                  </div>

                  {/* Notification List */}
                  <div className="max-h-[60vh] overflow-y-auto hide-scrollbar bg-gradient-to-b from-[#fdfbf9] to-[#faf6f3]">
                    {announcements.length === 0 ? (
                      <div className="p-10 text-center text-[#7a4020]/60">
                        <div className="w-12 h-12 rounded-full bg-[#8a4a22]/5 flex items-center justify-center mx-auto mb-3">
                          <Bell className="h-6 w-6 opacity-40" />
                        </div>
                        <p className="text-sm font-bold text-[#5a2c14]/60">You're all caught up!</p>
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
                                  to="/announcements" 
                                  onClick={() => { markAsRead(a.id); setNotifOpen(false); }}
                                  className={`block p-4 border-b border-[#8a4a22]/5 transition-colors hover:bg-white/80 relative group ${!isRead ? "bg-white" : "bg-transparent opacity-80"}`}
                                >
                                  {!isRead && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500 rounded-r-full" />}
                                  <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <h4 className={`text-sm tracking-tight line-clamp-1 pr-16 ${!isRead ? "font-bold text-[#2c1208]" : "font-semibold text-[#5a2c14]"}`}>
                                      {a.title}
                                    </h4>
                                    {a.isImportant && (
                                      <span className="absolute top-3 right-4 bg-red-100 text-red-700 text-[9px] uppercase px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 shadow-sm">
                                        <AlertCircle className="w-2.5 h-2.5" /> Urgent
                                      </span>
                                    )}
                                  </div>
                                  <p className={`text-xs line-clamp-2 leading-relaxed mb-3 ${!isRead ? "text-[#5a2c14]" : "text-[#7a4020]"}`}>
                                    {a.content}
                                  </p>
                                  <div className="flex items-center justify-between">
                                    <div className="text-[10px] font-semibold text-[#8a4a22]/60 flex items-center gap-1 bg-[#8a4a22]/5 px-1.5 py-0.5 rounded-md">
                                      <Clock className="w-3 h-3" />
                                      {new Date(a.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                    </div>
                                    {!isRead && (
                                      <button onClick={(e) => {
                                          e.preventDefault();
                                          markAsRead(a.id);
                                        }} 
                                        className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/50 px-2 py-0.5 rounded-full transition-all flex items-center gap-1 z-10 relative">
                                        <CheckCircle2 className="w-3 h-3" /> Mark read
                                      </button>
                                    )}
                                  </div>
                                </Link>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="p-2 border-t border-[#8a4a22]/10 bg-white/80">
                    <Button variant="ghost" className="w-full text-xs font-bold text-[#5a2c14] rounded-xl hover:bg-[#8a4a22]/5" asChild>
                      <Link to="/announcements" onClick={() => setNotifOpen(false)}>
                        View All Announcements <ChevronRight className="w-4 h-4 ml-1 inline-block opacity-70" />
                      </Link>
                    </Button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Profile Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="nav-icon-btn" aria-label="User menu">
                  {user ? (
                    <span className="nav-avatar">{profileInitial}</span>
                  ) : (
                    <User className="w-[18px] h-[18px]" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-premium-v2 w-64 mt-2 p-3 rounded-2xl border-none shadow-2xl">
                {user ? (
                  <>
                    {/* Profile header */}
                    <div className="px-2 py-2 mb-2">
                      <div className="flex items-center gap-3">
                        <span className="nav-avatar text-sm font-bold shrink-0">{profileInitial}</span>
                        <div className="min-w-0 flex flex-col justify-center">
                          <p className="text-body-primary text-primary font-semibold truncate leading-tight">{profile?.full_name || user.email}</p>
                          <p className="text-label text-tertiary mt-0.5 truncate">
                            {isRegistered ? profile?.branch : "Student"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <DropdownMenuSeparator className="bg-black/5 dark:bg-white/10 mx-1 mb-2" />
                    {isRegistered && (
                      <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-2 py-2 text-secondary font-medium focus:bg-black/5 dark:focus:bg-white/10 focus:text-primary transition-colors">
                        <Link to="/my-pass" className="flex items-center gap-3 w-full">
                          <Wallet className="w-4 h-4 opacity-70" /> 
                          <span>Student Wallet</span>
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-2 py-2 text-secondary font-medium focus:bg-black/5 dark:focus:bg-white/10 focus:text-primary transition-colors">
                      <Link to="/admin/login" className="flex items-center gap-3 w-full">
                        <Shield className="w-4 h-4 opacity-70" /> 
                        <span>Admin Panel</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-black/5 dark:bg-white/10 mx-1 my-2" />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="cursor-pointer rounded-xl px-2 py-2 text-red-600 font-medium focus:bg-red-500/10 focus:text-red-700 transition-colors"
                    >
                      <LogOut className="w-4 h-4 mr-3 opacity-70" /> 
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-2 py-2 text-secondary font-medium focus:bg-black/5 dark:focus:bg-white/10 focus:text-primary transition-colors">
                      <Link to="/register" className="flex items-center gap-3 w-full">
                        <User className="w-4 h-4 opacity-70" /> 
                        <span>Register now</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-black/5 dark:bg-white/10 mx-1 my-2" />
                    <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-2 py-2 text-secondary font-medium focus:bg-black/5 dark:focus:bg-white/10 focus:text-primary transition-colors">
                      <Link to="/admin/login" className="flex items-center gap-3 w-full">
                        <Shield className="w-4 h-4 opacity-70" /> 
                        <span>Admin Panel</span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile Hamburger (visible < md) */}
            <button
              className="nav-icon-btn md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
            >
              <div className="nav-hamburger" data-open={mobileOpen}>
                <span />
                <span />
                <span />
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Top Dropdown Overlay ──────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 bg-[#2c1208]/20 backdrop-blur-[2px] z-30 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Mobile Top Dropdown Menu ─────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            className="fixed top-[64px] left-0 right-0 mx-2 bg-white/95 backdrop-blur-xl border border-[#8a4a22]/10 shadow-2xl md:hidden overflow-hidden z-40 max-h-[calc(100vh-90px)] overflow-y-auto rounded-3xl pb-6 pt-2"
            initial={{ opacity: 0, y: -15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="px-3">
              {/* Profile Card (if registered) */}
              {isRegistered && profile && (
                <Link to="/my-pass" onClick={() => setMobileOpen(false)} className="mobile-profile-card">
                  <div className="mobile-profile-avatar">{profileInitial}</div>
                  <div className="min-w-0">
                    <div className="mobile-profile-name truncate">{profile.full_name}</div>
                    <div className="mobile-profile-sub">{profile.enrollment_no}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#8a4a22]/30 ml-auto shrink-0" />
                </Link>
              )}

              {/* Quick Action Pills (if registered) */}
              {isRegistered && (
                <div className="mobile-quick-actions">
                  <Link to="/my-pass" onClick={() => setMobileOpen(false)} className="mobile-quick-action">
                    <div className="mobile-quick-action-icon bg-[#8a4a22]/8">
                      <Wallet className="w-4 h-4 text-[#8a4a22]" />
                    </div>
                    Wallet
                  </Link>
                  <Link to="/attendance" onClick={() => setMobileOpen(false)} className="mobile-quick-action">
                    <div className="mobile-quick-action-icon bg-emerald-500/10">
                      <ScanLine className="w-4 h-4 text-emerald-600" />
                    </div>
                    Scanner
                  </Link>
                  <Link to="/help" onClick={() => setMobileOpen(false)} className="mobile-quick-action">
                    <div className="mobile-quick-action-icon bg-blue-500/10">
                      <HelpCircle className="w-4 h-4 text-blue-600" />
                    </div>
                    Help
                  </Link>
                </div>
              )}

              {/* Scanner CTA (for guests, prominent) */}
              {!isRegistered && (
                <Link
                  to="/register"
                  className="nav-mobile-scanner mb-4"
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="w-5 h-5" />
                  Register Now
                </Link>
              )}

              {/* Nav Links */}
              <div className="flex flex-col gap-1">
                {navItems.map((item) => (
                  item.comingSoon ? (
                    <button
                      key={item.label}
                      className="nav-mobile-link"
                      onClick={() => {
                        toast.info(`${item.label} is coming soon!`, { description: "We're building something special." });
                        setMobileOpen(false);
                      }}
                    >
                      <item.icon className="w-5 h-5 opacity-50" />
                      <span>{item.label}</span>
                      <span className="ml-auto text-[10px] font-bold text-[#8a4a22]/40 bg-[#8a4a22]/5 px-2 py-0.5 rounded-full">Soon</span>
                    </button>
                  ) : (
                    <Link
                      key={item.to}
                      to={item.to as any}
                      className={`nav-mobile-link ${isActive(item.to) ? "active" : ""}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <item.icon className="w-5 h-5 opacity-50" />
                      <span>{item.label}</span>
                      {isActive(item.to) && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#5a1a25]" />
                      )}
                    </Link>
                  )
                ))}
              </div>

              {/* Divider + secondary actions */}
              <div className="mt-4 pt-4 border-t border-[#8a4a22]/8 flex flex-col gap-1">
                <Link
                  to="/admin/login"
                  className="nav-mobile-link text-[#8a4a22]/70"
                  onClick={() => setMobileOpen(false)}
                >
                  <Shield className="w-5 h-5 opacity-40" />
                  <span>Admin Panel</span>
                </Link>
                {user && (
                  <button
                    className="nav-mobile-link text-red-600/80 w-full"
                    onClick={() => { handleLogout(); setMobileOpen(false); }}
                  >
                    <LogOut className="w-5 h-5 opacity-50" />
                    <span>Log out</span>
                  </button>
                )}
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* ── Spacer ───────────────────────────────────────────────── */}
      <div className="nav-spacer" />
    </>
  );
}
