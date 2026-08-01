import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users,
  ImageIcon,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trophy,
  Calendar,
  Share2,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  Flame,
  Zap,
  Layers,
  X,
  ChevronRight,
  Check,
  Filter,
  Building2,
  BadgeCheck,
  Compass,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { listClubs, registerForClub, listClubRegistrations } from "@/lib/admin.functions";
import { lookupStudent } from "@/lib/students.functions";
import { CLUB_REGISTRATION_OPEN_DATE, isClubRegistrationOpen } from "@/lib/constants";
import type { LocalClub } from "@/lib/local-db";

export const Route = createLazyFileRoute("/clubs")({
  // @ts-expect-error - Route type options do not include head in this version
  head: () => ({
    meta: [
      { title: "Clubs & Societies · KRMU Induction" },
      { name: "description", content: "Browse, explore, and join clubs & societies at KRMU." },
    ],
  }),
  component: ClubsPage,
});

/* ─────────────────────────────────────────────────────────────── */
/*  Extended Club Display Data Interface (Graceful Degradation)    */
/* ─────────────────────────────────────────────────────────────── */

export interface ClubDisplayData extends LocalClub {
  category?: string;
  featured?: boolean;
  popular?: boolean;
  new?: boolean;
  mission?: string;
  benefits?: string;
  commitment?: string;
  faculty?: string;
  lead?: string;
  department?: string;
  eligibility?: string;
  requirements?: string;
  gallery?: string[];
  nextEvent?: { date?: string; title?: string };
  activities?: string[];
  achievements?: string[];
  socialLinks?: { instagram?: string; linkedin?: string; website?: string };
}

interface VerifiedStudentData {
  id: string;
  name?: string;
  course?: string;
  department?: string;
  enrollment_no: string;
}

/* ─────────────────────────────────────────────────────────────── */
/*  Main Page Component                                            */
/* ─────────────────────────────────────────────────────────────── */

function ClubsPage() {
  const [clubs, setClubs] = useState<ClubDisplayData[]>([]);
  const [userRegistrations, setUserRegistrations] = useState<string[]>([]); // list of club IDs joined by verified student
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"popular" | "newest" | "seats" | "alpha">("popular");
  const [pageLoading, setPageLoading] = useState(true);

  // Recommendation Engine State (sessionStorage backed)
  const [selectedInterests, setSelectedInterests] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem("krmu_selected_club_interests");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Drawer & Modal States
  const [activeClub, setActiveClub] = useState<ClubDisplayData | null>(null);
  const [drawerTab, setDrawerTab] = useState<"overview" | "events" | "gallery" | "team">("overview");
  const [joinClubTarget, setJoinClubTarget] = useState<ClubDisplayData | null>(null);
  const [compareClubs, setCompareClubs] = useState<ClubDisplayData[]>([]);
  const [showCompareDrawer, setShowCompareDrawer] = useState(false);

  // Verified student in state (from localStorage ID -> lookup)
  const [verifiedStudent, setVerifiedStudent] = useState<VerifiedStudentData | null>(null);

  // 1. Fetch Clubs & Check Local Verification
  useEffect(() => {
    listClubs()
      .then((data) => {
        const visibleClubs = (data as unknown as ClubDisplayData[]).filter((c) => c.visible);
        setClubs(visibleClubs);
        setPageLoading(false);

        // Check deep link URL (?club=id or #id)
        const params = new URLSearchParams(window.location.search);
        const clubParam = params.get("club") || window.location.hash.replace("#", "");
        if (clubParam) {
          const match = visibleClubs.find(
            (c) => c.id === clubParam || c.name.toLowerCase().replace(/\s+/g, "-") === clubParam.toLowerCase()
          );
          if (match) {
            setActiveClub(match);
            setDrawerTab("overview");
          }
        }
      })
      .catch(() => setPageLoading(false));

    // Verify student from localStorage ID without storing PII
    const savedStudentId = localStorage.getItem("krmu_verified_student_id");
    if (savedStudentId) {
      lookupStudent({ data: { enrollment_no: savedStudentId } })
        .then((res) => {
          if (res?.student) {
            setVerifiedStudent({
              id: res.student.id,
              name: res.student.name,
              course: res.student.course,
              department: res.student.department,
              enrollment_no: res.student.enrollment_no || savedStudentId,
            });
            // Fetch registrations to know which clubs this student has joined
            listClubRegistrations().then((allRegs: any[]) => {
              const myRegs = allRegs
                .filter((r) => r.student_id === res.student.id || r.enrollment_no === savedStudentId)
                .map((r) => r.club_id);
              setUserRegistrations(myRegs);
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, []);

  // Sync URL Deep Link when activeClub changes
  const handleOpenClubDrawer = useCallback((club: ClubDisplayData) => {
    setActiveClub(club);
    setDrawerTab("overview");
    const url = new URL(window.location.href);
    url.searchParams.set("club", club.id);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const handleCloseClubDrawer = useCallback(() => {
    setActiveClub(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("club");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  // Toggle Interest in Recommendation Engine
  const toggleInterest = (category: string) => {
    const next = selectedInterests.includes(category)
      ? selectedInterests.filter((i) => i !== category)
      : [...selectedInterests, category];
    setSelectedInterests(next);
    try {
      sessionStorage.setItem("krmu_selected_club_interests", JSON.stringify(next));
    } catch {}
  };

  // Derive unique categories automatically from loaded clubs
  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    clubs.forEach((c) => {
      if (c.category) set.add(c.category);
      else set.add("General");
    });
    return Array.from(set).sort();
  }, [clubs]);

  // Recommended Clubs matching user interest pills
  const recommendedClubs = useMemo(() => {
    if (selectedInterests.length === 0) return [];
    return clubs.filter((c) => {
      const cat = c.category || "General";
      return selectedInterests.includes(cat);
    }).slice(0, 3); // top 3 matches
  }, [clubs, selectedInterests]);

  // 2. Filter & Sort Logic
  const filteredClubs = useMemo(() => {
    let list = [...clubs];

    // Category Filter
    if (selectedCategory === "Open Seats") {
      list = list.filter((c) => {
        const seatsLeft = (c.capacity ?? 120) - (c.registeredCount ?? 0);
        return seatsLeft > 0 && c.isRegistrationOpen !== false;
      });
    } else if (selectedCategory !== "All") {
      list = list.filter((c) => (c.category || "General") === selectedCategory);
    }

    // Search Filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((c) => {
        const nameMatch = c.name?.toLowerCase().includes(q);
        const tagMatch = c.tagline?.toLowerCase().includes(q);
        const descMatch = c.description?.toLowerCase().includes(q);
        const catMatch = c.category?.toLowerCase().includes(q);
        const missionMatch = c.mission?.toLowerCase().includes(q);
        const facultyMatch = c.faculty?.toLowerCase().includes(q);
        const leadMatch = c.lead?.toLowerCase().includes(q);
        return nameMatch || tagMatch || descMatch || catMatch || missionMatch || facultyMatch || leadMatch;
      });
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "popular") {
        return (b.registeredCount ?? 0) - (a.registeredCount ?? 0);
      } else if (sortBy === "seats") {
        const seatsA = (a.capacity ?? 120) - (a.registeredCount ?? 0);
        const seatsB = (b.capacity ?? 120) - (b.registeredCount ?? 0);
        return seatsB - seatsA;
      } else if (sortBy === "newest") {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da;
      } else {
        return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [clubs, selectedCategory, search, sortBy]);

  // Aggregate statistics
  const totalClubsCount = clubs.length;
  const totalAvailableSeats = useMemo(() => {
    return clubs.reduce((acc, c) => {
      const seatsLeft = Math.max(0, (c.capacity ?? 120) - (c.registeredCount ?? 0));
      return acc + seatsLeft;
    }, 0);
  }, [clubs]);

  // Handle compare checkbox selection (Cap at 2: replacing oldest if 3rd is selected)
  const toggleCompareClub = (club: ClubDisplayData) => {
    setCompareClubs((prev) => {
      const exists = prev.some((item) => item.id === club.id);
      if (exists) {
        return prev.filter((item) => item.id !== club.id);
      }
      if (prev.length >= 2) {
        // Automatically replace the oldest selected club
        return [prev[1], club];
      }
      return [...prev, club];
    });
  };

  return (
    <div className="min-h-screen bg-[#fffdfc] text-[#2b180d] pb-16 selection:bg-[#8a4a22]/20">
      <SiteHeader />

      {/* Ambient Background */}
      <div className="ambient-bg pointer-events-none" aria-hidden="true">
        <div className="ambient-blob ambient-blob-1 opacity-25" />
        <div className="ambient-blob ambient-blob-2 opacity-20" />
      </div>

      <main className="relative container mx-auto max-w-6xl px-4 py-8 sm:py-12">
        {/* 1. Hero Section & Statistics Banner */}
        <div className="max-w-3xl animate-slide-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#8a4a22]/20 bg-[#8a4a22]/5 px-3.5 py-1.5 text-xs font-semibold text-[#8a4a22] mb-4">
            <Building2 className="h-3.5 w-3.5" />
            <span>KRMU Induction 2026 · Clubs &amp; Societies</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#3b1c0a] leading-tight">
            Clubs &amp; Societies
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#7a4020]/80 leading-relaxed max-w-2xl">
            Discover your community. Explore every club before selecting up to{" "}
            <strong className="text-[#8a4a22] font-semibold">two societies</strong> that will shape your university
            journey.
          </p>

          {/* Statistics Bar */}
          {pageLoading ? (
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-[#8a4a22]/10 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="flex items-center gap-3.5 rounded-2xl border border-[#8a4a22]/15 bg-white/80 backdrop-blur-md p-4 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8a4a22]/10 text-[#8a4a22]">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[#3b1c0a]">{totalClubsCount}</div>
                  <div className="text-xs font-medium text-[#7a4020]/70">Total Clubs</div>
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-2xl border border-[#8a4a22]/15 bg-white/80 backdrop-blur-md p-4 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[#3b1c0a]">{totalAvailableSeats}</div>
                  <div className="text-xs font-medium text-[#7a4020]/70">Available Seats</div>
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-2xl border border-[#8a4a22]/15 bg-white/80 backdrop-blur-md p-4 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#3b1c0a]">
                    {isClubRegistrationOpen() ? "Registrations Open" : "Opens 22 August"}
                  </div>
                  <div className="text-xs font-medium text-[#7a4020]/70">
                    {isClubRegistrationOpen() ? "Max 2 Clubs per student" : "2026 Intake Window"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. Interactive Club Recommendation Engine */}
        {!pageLoading && uniqueCategories.length > 0 && (
          <div className="mt-10 rounded-3xl border border-[#8a4a22]/15 bg-white/70 backdrop-blur-md p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-[#3b1c0a] flex items-center gap-2">
                  <Compass className="h-4 w-4 text-[#8a4a22]" />
                  <span>Club Recommendation Engine</span>
                </h3>
                <p className="text-xs text-[#7a4020]/70 mt-0.5">
                  What interests you? Select your preferences to see tailored society matches.
                </p>
              </div>
              {selectedInterests.length > 0 && (
                <button
                  onClick={() => {
                    setSelectedInterests([]);
                    sessionStorage.removeItem("krmu_selected_club_interests");
                  }}
                  className="text-xs text-[#8a4a22] font-semibold hover:underline self-start sm:self-auto"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {/* Interest categories pills */}
            <div className="flex flex-wrap gap-2">
              {uniqueCategories.map((cat) => {
                const active = selectedInterests.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleInterest(cat)}
                    aria-pressed={active}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                      active
                        ? "bg-[#8a4a22] text-white shadow-md scale-105"
                        : "bg-[#8a4a22]/5 text-[#7a4020] hover:bg-[#8a4a22]/10 border border-[#8a4a22]/10"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>

            {/* Recommended Matches */}
            <AnimatePresence>
              {recommendedClubs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-5 pt-5 border-t border-[#8a4a22]/10"
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-[#8a4a22] mb-3 flex items-center gap-1.5">
                    <Compass className="h-4 w-4" />
                    <span>Recommended for You ({recommendedClubs.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {recommendedClubs.map((club) => (
                      <div
                        key={club.id}
                        onClick={() => handleOpenClubDrawer(club)}
                        className="cursor-pointer rounded-2xl border border-[#8a4a22]/15 bg-white p-3.5 shadow-sm hover:shadow-md hover:border-[#8a4a22]/30 transition-all flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {club.imageUrl ? (
                            <img
                              src={club.imageUrl}
                              alt=""
                              className="h-10 w-10 rounded-xl object-cover border border-[#8a4a22]/10 flex-shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-xl bg-[#8a4a22]/10 flex items-center justify-center text-[#8a4a22] flex-shrink-0">
                              <Building2 className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#3b1c0a] truncate group-hover:text-[#8a4a22] transition-colors">
                              {club.name}
                            </div>
                            <div className="text-xs text-[#7a4020]/70 truncate">
                              {club.category || "Society"}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[#8a4a22]/50 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 3. Search, Categories, & Sort Toolbar */}
        <div className="mt-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Smart Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7a4020]/50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clubs & societies, keywords (dance, robotics, coding)..."
              className="pl-10 pr-9 rounded-full border-[#8a4a22]/20 bg-white/80 backdrop-blur-sm text-sm focus:border-[#8a4a22] h-11"
              aria-label="Search clubs and societies"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a4020]/50 hover:text-[#7a4020]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Filter className="h-4 w-4 text-[#7a4020]/70" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort clubs by"
              className="rounded-full border border-[#8a4a22]/20 bg-white/80 px-4 py-2 text-xs font-semibold text-[#3b1c0a] focus:outline-none focus:ring-2 focus:ring-[#8a4a22]/20 shadow-sm"
            >
              <option value="popular">Sort: Most Popular</option>
              <option value="seats">Sort: Seats Available</option>
              <option value="newest">Sort: Newest</option>
              <option value="alpha">Sort: Name A-Z</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {["All", ...uniqueCategories, "Open Seats"].map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                aria-pressed={active}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-all whitespace-nowrap ${
                  active
                    ? "bg-[#3b1c0a] text-white shadow-md"
                    : "bg-white/70 text-[#7a4020] hover:bg-white border border-[#8a4a22]/15 shadow-sm"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* 4. Club Cards Grid (Equal-Height Matrix or Shimmer Loading) */}
        {pageLoading ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="flex flex-col justify-between rounded-3xl border border-[#8a4a22]/15 bg-white/70 backdrop-blur-md shadow-sm overflow-hidden h-[420px]"
              >
                <div className="h-48 w-full bg-gradient-to-r from-stone-100 via-stone-200 to-stone-100 animate-pulse" />
                <div className="flex-1 p-5 space-y-4">
                  <div className="flex gap-2">
                    <div className="h-5 w-20 rounded-full bg-stone-200 animate-pulse" />
                    <div className="h-5 w-24 rounded-full bg-stone-200 animate-pulse" />
                  </div>
                  <div className="h-6 w-3/4 rounded-lg bg-stone-200 animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-stone-100 animate-pulse" />
                    <div className="h-3 w-5/6 rounded bg-stone-100 animate-pulse" />
                  </div>
                </div>
                <div className="p-5 pt-0 flex gap-2">
                  <div className="h-10 flex-1 rounded-full bg-stone-200 animate-pulse" />
                  <div className="h-10 w-24 rounded-full bg-stone-200 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredClubs.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-[#8a4a22]/15 bg-white/70 backdrop-blur-md p-10 text-center max-w-md mx-auto shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#8a4a22]/10 text-[#8a4a22] mb-4">
              <Users className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-[#3b1c0a]">No clubs match your filters</h3>
            <p className="mt-1.5 text-xs text-[#7a4020]/70 leading-relaxed">
              We couldn't find any societies matching "{search || selectedCategory}". Try adjusting your search query or
              clearing active filters.
            </p>
            <Button
              onClick={() => {
                setSearch("");
                setSelectedCategory("All");
              }}
              className="mt-5 rounded-full bg-[#8a4a22] hover:bg-[#7a4020] text-white font-semibold text-xs px-5 py-2.5"
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClubs.map((club, idx) => (
              <ClubCardView
                key={club.id}
                club={club}
                index={idx}
                isJoined={userRegistrations.includes(club.id)}
                isCompared={compareClubs.some((c) => c.id === club.id)}
                onOpen={() => handleOpenClubDrawer(club)}
                onToggleCompare={() => toggleCompareClub(club)}
                onInitiateJoin={() => setJoinClubTarget(club)}
              />
            ))}
          </div>
        )}

        {/* 5. Row-Aligned Club Comparison Bar & Drawer */}
        <AnimatePresence>
          {compareClubs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-full border border-[#8a4a22]/20 bg-[#3b1c0a] px-5 py-3 shadow-2xl flex items-center gap-4 text-white max-w-xl w-full mx-4"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Compare ({compareClubs.length}/2)</span>
                <div className="flex items-center gap-1.5 truncate">
                  {compareClubs.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium truncate max-w-[120px]"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  onClick={() => setShowCompareDrawer(true)}
                  disabled={compareClubs.length < 2}
                  size="sm"
                  className="rounded-full bg-amber-500 hover:bg-amber-400 text-[#2b1406] font-bold text-xs"
                >
                  Compare Now
                </Button>
                <button
                  onClick={() => setCompareClubs([])}
                  className="p-1.5 text-white/70 hover:text-white"
                  aria-label="Clear comparison"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 6. Apple-Inspired Sticky-Tab Drawer for Club Details            */}
      {/* ───────────────────────────────────────────────────────────── */}
      <Sheet open={!!activeClub} onOpenChange={(open) => !open && handleCloseClubDrawer()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl md:max-w-2xl bg-[#fffdfc]/95 backdrop-blur-3xl p-0 flex flex-col border-l border-[#8a4a22]/15 shadow-2xl overflow-hidden"
          aria-label={activeClub?.name || "Society Details"}
        >
          {activeClub && (
            <>
              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                {/* Full Banner Header */}
                <div className="relative rounded-2xl overflow-hidden border border-[#8a4a22]/15 bg-gradient-to-br from-[#8a4a22]/10 to-[#c97d4a]/10 h-64 flex items-center justify-center">
                  {activeClub.imageUrl ? (
                    <img
                      src={activeClub.imageUrl}
                      alt={`${activeClub.name} banner`}
                      className="h-full w-full object-cover object-center"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#8a4a22]/15 to-[#c97d4a]/15">
                      <Building2 className="h-16 w-16 text-[#8a4a22]/30" />
                    </div>
                  )}
                  {activeClub.category && (
                    <span className="absolute top-3 left-3 rounded-full bg-[#3b1c0a]/80 backdrop-blur-md px-3 py-1 text-xs font-bold text-white shadow-sm">
                      {activeClub.category}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                </div>

                {/* Header Information */}
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-[#3b1c0a]">{activeClub.name}</h2>
                  {activeClub.tagline && (
                    <p className="mt-1 text-sm font-medium italic text-[#8a4a22]">{activeClub.tagline}</p>
                  )}
                  {activeClub.description && (
                    <p className="mt-3 text-sm text-[#7a4020]/85 leading-relaxed">{activeClub.description}</p>
                  )}
                </div>

                {/* Apple-Inspired Sticky Tab Navigation */}
                <div className="sticky top-0 z-10 bg-[#fffdfc]/95 backdrop-blur-md border-y border-[#8a4a22]/15 py-2.5 -mx-6 sm:-mx-8 px-6 sm:px-8 flex items-center gap-2 overflow-x-auto scrollbar-none">
                  {[
                    { id: "overview", label: "Overview", icon: Info },
                    { id: "events", label: "Events", icon: Calendar, badge: activeClub.nextEvent?.title ? "1" : undefined },
                    { id: "gallery", label: "Gallery", icon: ImageIcon, badge: activeClub.gallery?.length ? `${activeClub.gallery.length}` : undefined },
                    { id: "team", label: "Team", icon: Users },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = drawerTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setDrawerTab(tab.id as any)}
                        className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
                          active
                            ? "bg-[#3b1c0a] text-white shadow-sm"
                            : "bg-[#8a4a22]/5 text-[#7a4020] hover:bg-[#8a4a22]/10"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{tab.label}</span>
                        {tab.badge && (
                          <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            active ? "bg-white/20 text-white" : "bg-[#8a4a22]/20 text-[#8a4a22]"
                          }`}>
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Tab Content 1: Overview */}
                {drawerTab === "overview" && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Seat Capacity Bar */}
                    <div className="rounded-2xl border border-[#8a4a22]/15 bg-white/80 p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-[#3b1c0a]">
                        <span>Remaining Slots</span>
                        <span>
                          {Math.max(0, (activeClub.capacity ?? 120) - (activeClub.registeredCount ?? 0))} of{" "}
                          {activeClub.capacity ?? 120} Seats
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#8a4a22]/10 overflow-hidden">
                        <div
                          className="h-full bg-[#8a4a22] transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              100,
                              (((activeClub.registeredCount ?? 0) / (activeClub.capacity ?? 120)) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Mission */}
                    {activeClub.mission && (
                      <div className="space-y-1.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#8a4a22]">Our Mission</h3>
                        <p className="text-sm text-[#7a4020]/80 leading-relaxed">{activeClub.mission}</p>
                      </div>
                    )}

                    {/* Benefits */}
                    {activeClub.benefits && (
                      <div className="space-y-1.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#8a4a22]">Member Benefits</h3>
                        <p className="text-sm text-[#7a4020]/80 leading-relaxed">{activeClub.benefits}</p>
                      </div>
                    )}

                    {/* Eligibility & Requirements */}
                    {(activeClub.eligibility || activeClub.requirements) && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#8a4a22]">
                          Eligibility &amp; Requirements
                        </h3>
                        {activeClub.eligibility && (
                          <p className="text-sm text-[#7a4020]/80">
                            <strong>Eligibility:</strong> {activeClub.eligibility}
                          </p>
                        )}
                        {activeClub.requirements && (
                          <p className="text-sm text-[#7a4020]/80">
                            <strong>Requirements:</strong> {activeClub.requirements}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Gated WhatsApp Link */}
                    {activeClub.whatsappGroup && userRegistrations.includes(activeClub.id) ? (
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/80 p-4 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                            Member Access
                          </div>
                          <div className="text-sm font-bold text-emerald-950">Official WhatsApp Group</div>
                        </div>
                        <a
                          href={activeClub.whatsappGroup}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Join WhatsApp</span>
                        </a>
                      </div>
                    ) : (
                      <div className="text-xs text-[#7a4020]/70 italic">
                        * WhatsApp Group link is available to confirmed registered members.
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Content 2: Events */}
                {drawerTab === "events" && (
                  <div className="space-y-4 animate-fade-in">
                    {activeClub.nextEvent?.title ? (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-50/70 p-5 space-y-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-amber-600 flex-shrink-0" />
                          <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                            Next Upcoming Event
                          </div>
                        </div>
                        <div className="text-base font-bold text-[#3b1c0a]">{activeClub.nextEvent.title}</div>
                        {activeClub.nextEvent.date && (
                          <div className="text-xs font-semibold text-amber-700/90">{activeClub.nextEvent.date}</div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-[#8a4a22]/15 bg-white/60 p-8 text-center text-sm text-[#7a4020]/70">
                        No upcoming events scheduled yet for this society. Check back soon!
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Content 3: Gallery */}
                {drawerTab === "gallery" && (
                  <div className="space-y-4 animate-fade-in">
                    {activeClub.gallery && activeClub.gallery.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#8a4a22]">Society Photo Gallery</h3>
                        <Carousel className="w-full">
                          <CarouselContent>
                            {activeClub.gallery.map((imgUrl, i) => (
                              <CarouselItem key={i} className="basis-4/5 sm:basis-2/3">
                                <div className="rounded-2xl overflow-hidden border border-[#8a4a22]/15 h-52 bg-[#8a4a22]/5">
                                  <img
                                    src={imgUrl}
                                    alt={`Gallery slide ${i + 1}`}
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              </CarouselItem>
                            ))}
                          </CarouselContent>
                          <div className="flex justify-end gap-2 mt-2">
                            <CarouselPrevious className="static translate-y-0" />
                            <CarouselNext className="static translate-y-0" />
                          </div>
                        </Carousel>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-[#8a4a22]/15 bg-white/60 p-8 text-center text-sm text-[#7a4020]/70">
                        No gallery photos uploaded yet for this society.
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Content 4: Team */}
                {drawerTab === "team" && (
                  <div className="space-y-4 animate-fade-in">
                    {(activeClub.faculty || activeClub.lead) ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {activeClub.faculty && (
                          <div className="rounded-2xl border border-[#8a4a22]/15 bg-white/80 p-4 space-y-1">
                            <div className="text-xs font-medium text-[#7a4020]/70 uppercase tracking-wider">Faculty Coordinator</div>
                            <div className="text-base font-bold text-[#3b1c0a]">{activeClub.faculty}</div>
                          </div>
                        )}
                        {activeClub.lead && (
                          <div className="rounded-2xl border border-[#8a4a22]/15 bg-white/80 p-4 space-y-1">
                            <div className="text-xs font-medium text-[#7a4020]/70 uppercase tracking-wider">Student Lead</div>
                            <div className="text-base font-bold text-[#3b1c0a]">{activeClub.lead}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-[#8a4a22]/15 bg-white/60 p-8 text-center text-sm text-[#7a4020]/70">
                        Leadership team details will be updated soon.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sticky Action Footer */}
              <div className="sticky bottom-0 z-20 border-t border-[#8a4a22]/15 bg-[#fffdfc]/95 backdrop-blur-xl p-4 flex items-center justify-between gap-3 shadow-lg">
                <Button
                  onClick={() => {
                    const el = activeClub;
                    handleCloseClubDrawer();
                    if (el) setJoinClubTarget(el);
                  }}
                  disabled={!isClubRegistrationOpen() || userRegistrations.includes(activeClub.id)}
                  className="flex-1 rounded-full bg-[#8a4a22] hover:bg-[#7a4020] text-white font-bold h-11 shadow-md"
                >
                  {userRegistrations.includes(activeClub.id)
                    ? "Joined ✓"
                    : !isClubRegistrationOpen()
                    ? "Registration Opens 22 Aug"
                    : "Join Society"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toggleCompareClub(activeClub)}
                  className="rounded-full border-[#8a4a22]/20 text-[#8a4a22] font-semibold h-11 px-5"
                >
                  {compareClubs.some((c) => c.id === activeClub.id) ? "Comparing ✓" : "Compare"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: activeClub.name,
                        url: window.location.href,
                      }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(window.location.href);
                      toast.success("Society link copied!");
                    }
                  }}
                  className="rounded-full h-11 w-11 p-0 text-[#7a4020]"
                  aria-label="Share society link"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 7. Row-Aligned Side-by-Side Club Comparison Drawer            */}
      {/* ───────────────────────────────────────────────────────────── */}
      <Sheet open={showCompareDrawer} onOpenChange={setShowCompareDrawer}>
        <SheetContent
          side="bottom"
          className="h-[80vh] bg-[#fffdfc] p-6 sm:p-8 overflow-y-auto border-t border-[#8a4a22]/15 shadow-2xl"
          aria-label="Society Comparison"
        >
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-extrabold text-[#3b1c0a]">Side-by-Side Society Comparison</h2>
                <p className="text-xs text-[#7a4020]/70">Compare key attributes before finalizing your choice.</p>
              </div>
              <Button
                variant="ghost"
                onClick={() => setShowCompareDrawer(false)}
                className="rounded-full text-xs"
              >
                Close
              </Button>
            </div>

            {compareClubs.length === 2 && (
              <div className="grid grid-cols-3 gap-4 border-t border-[#8a4a22]/15 pt-6">
                {/* Feature Column */}
                <div className="space-y-4 font-bold text-xs uppercase tracking-wider text-[#7a4020]">
                  <div className="h-16 flex items-center">Society</div>
                  <div className="h-12 flex items-center">Category</div>
                  <div className="h-12 flex items-center">Weekly Commitment</div>
                  <div className="h-12 flex items-center">Seats Remaining</div>
                  <div className="h-20 flex items-center">Faculty Coordinator</div>
                  <div className="h-24 flex items-center">Mission</div>
                  <div className="h-24 flex items-center">Eligibility</div>
                </div>

                {/* Club A & B */}
                {compareClubs.map((c) => {
                  const seatsLeft = Math.max(0, (c.capacity ?? 120) - (c.registeredCount ?? 0));
                  return (
                    <div key={c.id} className="space-y-4 text-sm text-[#3b1c0a] border-l border-[#8a4a22]/10 pl-4">
                      <div className="h-16 flex items-center font-extrabold text-base">{c.name}</div>
                      <div className="h-12 flex items-center font-semibold">{c.category || "General"}</div>
                      <div className="h-12 flex items-center">{c.commitment || "Not specified"}</div>
                      <div className="h-12 flex items-center font-bold text-[#8a4a22]">
                        {seatsLeft} / {c.capacity ?? 120}
                      </div>
                      <div className="h-20 flex items-center text-xs">{c.faculty || "Faculty advisor"}</div>
                      <div className="h-24 flex items-center text-xs text-[#7a4020]/80 line-clamp-3">
                        {c.mission || c.description || "N/A"}
                      </div>
                      <div className="h-24 flex items-center text-xs text-[#7a4020]/80 line-clamp-3">
                        {c.eligibility || "Open to all enrolled KRMU students"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 8. 3-Step Smart Registration Wizard (No PII in localStorage)  */}
      {/* ───────────────────────────────────────────────────────────── */}
      <RegistrationWizardModal
        club={joinClubTarget}
        onClose={() => setJoinClubTarget(null)}
        onSuccess={(clubId) => {
          setUserRegistrations((prev) => [...new Set([...prev, clubId])]);
          toast.success("Successfully registered for society! 🎉");
          setJoinClubTarget(null);
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*  Club Card Component (Uncluttered, Max 2 Badges)                */
/* ─────────────────────────────────────────────────────────────── */

interface ClubCardViewProps {
  club: ClubDisplayData;
  index: number;
  isJoined: boolean;
  isCompared: boolean;
  onOpen: () => void;
  onToggleCompare: () => void;
  onInitiateJoin: () => void;
}

function ClubCardView({
  club,
  index,
  isJoined,
  isCompared,
  onOpen,
  onToggleCompare,
  onInitiateJoin,
}: ClubCardViewProps) {
  const registered = club.registeredCount ?? 0;
  const capacity = club.capacity ?? 120;
  const seatsLeft = Math.max(0, capacity - registered);
  const isFull = !club.isRegistrationOpen || seatsLeft === 0;

  // Derived dynamic seat-capacity badge (No AI Sparkles or Emojis)
  const capacityBadge = useMemo(() => {
    if (seatsLeft <= 15 || registered / capacity >= 0.9) return { text: "Almost Full", color: "text-red-600 bg-red-50 border-red-200" };
    if (seatsLeft <= 50 || registered / capacity >= 0.6) return { text: "Filling Fast", color: "text-amber-700 bg-amber-50 border-amber-200" };
    return { text: "Plenty of Seats", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  }, [seatsLeft, registered, capacity]);

  // Derived Club Health indicator (No AI Sparkles or Emojis)
  const healthBadge = useMemo(() => {
    if (club.nextEvent?.title || registered > 10) return { text: "Active", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    if (club.new || (club.createdAt && Date.now() - new Date(club.createdAt).getTime() < 30 * 86400000)) {
      return { text: "New", color: "text-blue-700 bg-blue-50 border-blue-200" };
    }
    return null;
  }, [club, registered]);

  // Badges list (Max 2 badges to avoid visual clutter)
  const displayBadges = useMemo(() => {
    const list: Array<{ label: string; cls: string }> = [];
    if (club.featured) list.push({ label: "Featured", cls: "bg-amber-100 text-amber-800 border-amber-200" });
    if (club.popular || registered > 50) list.push({ label: "Popular", cls: "bg-orange-100 text-orange-800 border-orange-200" });
    if (club.new && list.length < 2) list.push({ label: "New", cls: "bg-blue-100 text-blue-800 border-blue-200" });
    return list.slice(0, 2);
  }, [club, registered]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group relative flex flex-col justify-between rounded-3xl border border-[#8a4a22]/15 bg-white/90 backdrop-blur-md shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 overflow-hidden h-full"
    >
      {/* Premium Full-Bleed Media Presentation */}
      <div
        onClick={onOpen}
        className="relative h-48 w-full cursor-pointer overflow-hidden bg-gradient-to-br from-[#8a4a22]/10 to-[#c97d4a]/10"
      >
        {club.imageUrl ? (
          <img
            src={club.imageUrl}
            alt={club.name}
            className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#8a4a22]/15 to-[#c97d4a]/15">
            <Building2 className="h-14 w-14 text-[#8a4a22]/40" />
          </div>
        )}
        {/* Subtle bottom dark gradient overlay for title contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* Category Pill */}
        {club.category && (
          <span className="absolute top-3 left-3 z-20 rounded-full bg-white/90 backdrop-blur-md px-3 py-1 text-xs font-bold text-[#3b1c0a] shadow-sm border border-[#8a4a22]/10">
            {club.category}
          </span>
        )}

        {/* Compare Checkbox */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompare();
          }}
          className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-md px-2.5 py-1 text-xs font-bold text-[#7a4020] shadow-sm border border-[#8a4a22]/10 hover:bg-white"
        >
          <input
            type="checkbox"
            checked={isCompared}
            onChange={() => {}}
            aria-label={`Compare ${club.name}`}
            className="rounded border-[#8a4a22]/30 text-[#8a4a22] focus:ring-[#8a4a22]"
          />
          <span className="text-[11px]">Compare</span>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        <div>
          {/* Max 2 Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {displayBadges.map((b, idx) => (
              <span
                key={idx}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${b.cls}`}
              >
                {b.label}
              </span>
            ))}
            {healthBadge && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${healthBadge.color}`}
              >
                {healthBadge.text}
              </span>
            )}
          </div>

          <h3
            onClick={onOpen}
            className="text-lg font-bold text-[#3b1c0a] group-hover:text-[#8a4a22] transition-colors cursor-pointer leading-tight"
          >
            {club.name}
          </h3>
          {club.tagline && (
            <p className="text-xs font-medium text-[#8a4a22]/80 mt-0.5 italic line-clamp-1">{club.tagline}</p>
          )}
        </div>

        {/* Short description */}
        {club.description && (
          <p className="text-xs text-[#7a4020]/80 line-clamp-2 leading-relaxed flex-1">{club.description}</p>
        )}

        {/* Graceful Upcoming Event Preview */}
        {club.nextEvent?.title && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-amber-700 flex-shrink-0" />
            <span className="text-xs font-semibold text-amber-900 truncate">
              Next: {club.nextEvent.title}
            </span>
          </div>
        )}

        {/* Visual Seat Counter & Capacity Badge */}
        <div className="space-y-1.5 pt-2 border-t border-[#8a4a22]/10">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#7a4020]">
              {seatsLeft} / {capacity} Seats Left
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${capacityBadge.color}`}>
              {capacityBadge.text}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full bg-[#8a4a22]/10 overflow-hidden">
            <div
              className="h-full bg-[#8a4a22] transition-all duration-500"
              style={{ width: `${Math.min(100, (registered / capacity) * 100)}%` }}
            />
          </div>
        </div>

        {/* Contextual Action Button */}
        <div className="pt-2">
          {isJoined ? (
            <div className="w-full rounded-full border border-emerald-500/30 bg-emerald-50 py-2.5 text-center text-xs font-bold text-emerald-800">
              Joined ✓
            </div>
          ) : isFull ? (
            <div className="w-full rounded-full border border-red-200 bg-red-50 py-2.5 text-center text-xs font-bold text-red-700">
              Registration Closed
            </div>
          ) : !isClubRegistrationOpen() ? (
            <div className="w-full rounded-full border border-amber-200 bg-amber-50 py-2.5 text-center text-xs font-bold text-amber-800">
              Opens 22 August
            </div>
          ) : (
            <Button
              onClick={onInitiateJoin}
              className="w-full rounded-full bg-[#3b1c0a] hover:bg-[#8a4a22] text-white font-bold text-xs py-5 shadow-sm transition-all"
            >
              Join Society
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*  3-Step Registration Wizard Modal                               */
/* ─────────────────────────────────────────────────────────────── */

interface RegistrationWizardModalProps {
  club: ClubDisplayData | null;
  onClose: () => void;
  onSuccess: (clubId: string) => void;
}

function RegistrationWizardModal({ club, onClose, onSuccess }: RegistrationWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [enrollmentNo, setEnrollmentNo] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [joiningLoading, setJoiningLoading] = useState(false);
  const [studentInfo, setStudentInfo] = useState<{
    id: string;
    name: string;
    course: string;
    department: string;
    enrollment_no: string;
  } | null>(null);

  useEffect(() => {
    if (club) {
      setStep(1);
      const savedId = localStorage.getItem("krmu_verified_student_id");
      if (savedId) setEnrollmentNo(savedId);
      setStudentInfo(null);
    }
  }, [club]);

  if (!club) return null;

  const handleVerifyStudent = async () => {
    if (!enrollmentNo.trim()) {
      toast.error("Please enter your Student ID / Enrollment Number");
      return;
    }
    setLookupLoading(true);
    try {
      const res = await lookupStudent({ data: { enrollment_no: enrollmentNo.trim().toUpperCase() } });
      if (!res?.student) {
        toast.error("Student ID not found in database. Please verify your enrollment number.");
        return;
      }
      setStudentInfo({
        id: res.student.id,
        name: res.student.name || "Verified Student",
        course: res.student.course || "Enrolled Course",
        department: res.student.department || "KRMU Department",
        enrollment_no: res.student.enrollment_no || enrollmentNo.trim().toUpperCase(),
      });
      // Save ONLY verified ID and timestamp in localStorage (No PII)
      localStorage.setItem("krmu_verified_student_id", res.student.enrollment_no || enrollmentNo.trim().toUpperCase());
      localStorage.setItem("krmu_verification_timestamp", Date.now().toString());

      setStep(2);
    } catch (e: any) {
      toast.error(e.message || "Failed to verify Student ID");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleConfirmRegistration = async () => {
    if (!studentInfo) return;
    if (!isClubRegistrationOpen()) {
      toast.error("Club registrations open on 22 August 2026.");
      return;
    }
    setJoiningLoading(true);
    try {
      await registerForClub({
        data: {
          enrollment_no: studentInfo.enrollment_no,
          club_id: club.id,
        },
      });
      setStep(3);
      setTimeout(() => {
        onSuccess(club.id);
      }, 1500);
    } catch (e: any) {
      toast.error(e.message || "Failed to register for society");
      setJoiningLoading(false);
    }
  };

  return (
    <Dialog open={!!club} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="!rounded-3xl bg-[#fffdfc] p-6 sm:p-8 max-w-lg border border-[#8a4a22]/15 shadow-2xl"
        aria-label="Registration Wizard"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-[#3b1c0a]">
            {step === 1 ? `Confirm Society Selection` : step === 2 ? `Student Verification` : `Registration Successful`}
          </DialogTitle>
        </DialogHeader>

        {/* Visual Progress Indicator */}
        <div className="my-4 flex items-center justify-between text-xs font-bold text-[#7a4020]">
          <span className={step >= 1 ? "text-[#8a4a22]" : "opacity-50"}>① Confirm</span>
          <span className="flex-1 border-t-2 border-[#8a4a22]/20 mx-2" />
          <span className={step >= 2 ? "text-[#8a4a22]" : "opacity-50"}>② Verify</span>
          <span className="flex-1 border-t-2 border-[#8a4a22]/20 mx-2" />
          <span className={step === 3 ? "text-emerald-600" : "opacity-50"}>③ Finish</span>
        </div>

        {/* Step 1: Confirm Society Summary */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#8a4a22]/15 bg-[#8a4a22]/5 p-4 space-y-2">
              <div className="text-base font-extrabold text-[#3b1c0a]">{club.name}</div>
              {club.tagline && <div className="text-xs italic text-[#7a4020]">{club.tagline}</div>}
              <div className="flex items-center justify-between text-xs text-[#7a4020] pt-2 border-t border-[#8a4a22]/10">
                <span>Seats Left</span>
                <span className="font-bold">
                  {Math.max(0, (club.capacity ?? 120) - (club.registeredCount ?? 0))} / {club.capacity ?? 120}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-[#7a4020]">
                Enter Your Student ID / Enrollment Number
              </Label>
              <Input
                value={enrollmentNo}
                onChange={(e) => setEnrollmentNo(e.target.value.toUpperCase())}
                placeholder="e.g., 2301010001"
                className="rounded-xl border-[#8a4a22]/20 bg-white"
                onKeyDown={(e) => e.key === "Enter" && handleVerifyStudent()}
              />
              <p className="text-[11px] text-[#7a4020]/70">
                Your student identity will be verified against the official KRMU database.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} className="rounded-full text-xs">
                Cancel
              </Button>
              <Button
                onClick={handleVerifyStudent}
                disabled={lookupLoading || !enrollmentNo.trim()}
                className="rounded-full bg-[#3b1c0a] hover:bg-[#8a4a22] text-white font-bold text-xs px-6"
              >
                {lookupLoading ? "Verifying…" : "Verify Student ID"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Smart Verification Confirmation */}
        {step === 2 && studentInfo && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/70 p-4 space-y-2 text-emerald-950">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                <ShieldCheck className="h-4 w-4" />
                <span>Verified KRMU Student</span>
              </div>
              <div className="text-base font-extrabold">{studentInfo.name}</div>
              <div className="text-xs text-emerald-800">
                <strong>Course:</strong> {studentInfo.course}
              </div>
              <div className="text-xs text-emerald-800">
                <strong>Department:</strong> {studentInfo.department}
              </div>
            </div>

            <div className="text-xs text-[#7a4020]/80">
              Please confirm that the details above match your student identity before completing registration for{" "}
              <strong>{club.name}</strong>.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep(1)} className="rounded-full text-xs">
                Back
              </Button>
              <Button
                onClick={handleConfirmRegistration}
                disabled={joiningLoading}
                className="rounded-full bg-[#3b1c0a] hover:bg-[#8a4a22] text-white font-bold text-xs px-6"
              >
                {joiningLoading ? "Confirming…" : "Confirm Registration"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Celebratory Finish */}
        {step === 3 && (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 animate-bounce">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-extrabold text-[#3b1c0a]">Welcome to {club.name}!</h3>
            <p className="text-xs text-[#7a4020]/80">
              Your membership registration is confirmed. Check the Student Dashboard to access official WhatsApp
              communities.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
