import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase/config";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, query, where, orderBy, onSnapshot, doc, setDoc } from "firebase/firestore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Calendar, Clock, Bell, User, LogOut, ChevronRight } from "lucide-react";

export function SiteHeader() {
  const [user, setUser] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setAnnouncements([]);
      setReadIds(new Set());
      return;
    }

    // Listen to active announcements
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
      // Sort locally by createdAt desc
      docs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAnnouncements(docs);
    });

    // Listen to user's read states
    const qReads = collection(db, `user_notifications/${user.uid}/reads`);
    const unsubReads = onSnapshot(qReads, (snap) => {
      const reads = new Set(snap.docs.map(d => d.id));
      setReadIds(reads);
    });

    return () => {
      unsubAnnouncements();
      unsubReads();
    };
  }, [user]);

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

  const unreadCount = announcements.filter(a => !readIds.has(a.id)).length;
  const displayCount = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <header className="sticky top-0 z-40 w-full panel-liquid-glass">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3 font-semibold">
          <img src="/krmu-emblem.jpg" alt="KRMU Emblem" className="h-11 w-auto mix-blend-multiply object-contain" />
          <span className="text-xl tracking-tight text-[#6b3517]">KRMU Induction</span>
        </Link>
        <nav className="flex items-center gap-2">
          
          {/* Notification Bell */}
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
                              to="/announcements" 
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
                  <Link to="/announcements" onClick={() => setIsOpen(false)}>
                    View All Announcements <ChevronRight className="w-4 h-4 ml-1 inline-block" />
                  </Link>
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full text-[#5a2c14] hover:bg-white/50 hover:text-[#2c1208]">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-background/95 backdrop-blur-md border-white/20">
              {user ? (
                <>
                  <DropdownMenuItem className="text-muted-foreground text-xs pointer-events-none">
                    {user.email}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer mt-1 font-medium">
                    <LogOut className="mr-2 h-4 w-4 inline-block" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem asChild className="cursor-pointer font-medium">
                  <Link to="/register" className="flex items-center w-full">
                    <span>Register now</span>
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button asChild variant="liquidGlassDark" className="h-9 px-5 rounded-full font-medium text-xs">
            <Link to="/admin/login">
              Admin Panel
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
