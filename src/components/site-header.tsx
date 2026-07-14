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
import { AlertCircle, Calendar, Clock, Bell, User, LogOut, ChevronRight, CheckCircle2 } from "lucide-react";

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
    // Listen to active announcements for everyone
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

  useEffect(() => {
    if (user) {
      // Listen to user's read states from Firestore
      const qReads = collection(db, `user_notifications/${user.uid}/reads`);
      const unsubReads = onSnapshot(qReads, (snap) => {
        const reads = new Set(snap.docs.map(d => d.id));
        setReadIds(reads);
      });
      return () => unsubReads();
    } else {
      // Load read states from localStorage for anonymous users
      const localReads = JSON.parse(localStorage.getItem('read_announcements') || '[]');
      setReadIds(new Set(localReads));
    }
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
      // Update localStorage for anonymous users
      const newReads = new Set(readIds);
      newReads.add(id);
      setReadIds(newReads);
      localStorage.setItem('read_announcements', JSON.stringify(Array.from(newReads)));
    }
  };

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

  return (
    <header className="sticky top-0 z-40 w-full panel-liquid-glass">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3 font-semibold">
          <img src="/krmu-emblem.webp" alt="KRMU Emblem" className="h-11 w-auto mix-blend-multiply object-contain" />
          <span className="text-xl tracking-tight text-[#6b3517] hidden sm:inline-block">KRMU Induction</span>
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
            <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-96 max-w-sm p-0 bg-[#fffdfc]/95 backdrop-blur-2xl border-[#8a4a22]/10 shadow-2xl rounded-2xl overflow-hidden mt-2">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#8a4a22]/10 bg-white/50">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-[#2c1208]">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs font-bold text-[#8a4a22] bg-[#8a4a22]/10 px-2 py-0.5 rounded-full">
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
                              onClick={() => { markAsRead(a.id); setIsOpen(false); }}
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
              <div className="p-2 border-t border-[#8a4a22]/10 bg-white/80">
                <Button variant="ghost" className="w-full text-xs font-bold text-[#5a2c14] rounded-xl hover:bg-[#8a4a22]/5" asChild>
                  <Link to="/announcements" onClick={() => setIsOpen(false)}>
                    View All Announcements <ChevronRight className="w-4 h-4 ml-1 inline-block opacity-70" />
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
