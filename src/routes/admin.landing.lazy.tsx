import { createLazyFileRoute } from "@tanstack/react-router";
import { HeroManager } from "@/components/admin/HeroManager";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type DragEvent,
} from "react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { db, storage, auth } from "@/lib/firebase/config";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
  getDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {
  MonitorMobbile,
  Add,
  Gallery,
  TickSquare,
  CloseSquare,
  Warning2,
  Eye,
  Copy,
  Trash,
  ArrangeVertical,
  Mobile,
  Monitor,
  Setting2,
  Image as ImageIcon,
} from "iconsax-react";
import { AlertCircle, GripVertical, Play, Pause, ArchiveRestore, Lock, Unlock } from "lucide-react";

export const Route = createLazyFileRoute("/admin/landing")({
  component: AdminLanding,
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface LandingSettings {
  active_collection: string | null;
  enable_slideshow: boolean;
  enable_countdown: boolean;
  enable_memories: boolean;
  enable_stats: boolean;
  enable_footer: boolean;
  navbar_mode: "glass" | "dark-glass" | "transparent";
  maintenance_mode: boolean;
  maintenance_message: string;
}

interface LandingCollection {
  id: string;
  name: string;
  slug: string;
  academic_year: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  transition: "crossfade" | "fade" | "zoom" | "ken-burns" | "none";
  default_duration_ms: number;
  ken_burns_enabled: boolean;
  particles_intensity: "off" | "low" | "medium" | "high";
  theme: string;
  show_background_image: boolean;
  show_overlay: boolean;
  show_orbit: boolean;
  show_particles: boolean;
  show_watermark: boolean;
  show_logo: boolean;
  show_glow: boolean;
  show_noise: boolean;
  heading: string;
  subheading: string;
  tagline_prefix: string;
  tagline_script: string;
  tagline_suffix: string;
  body_copy: string;
  cta_primary_label: string;
  cta_primary_link: string;
  cta_secondary_label: string;
  cta_secondary_link: string;
  publish_at: string | null;
  expires_at: string | null;
  navbar_variant: string | null;
  countdown_variant: string | null;
  overlay_color_override: string | null;
  created_at: string;
  updated_at: string;
}

interface LandingSlide {
  id: string;
  collection_id: string;
  title: string;
  subtitle: string;
  alt_text: string;
  image_credit: string;
  url: string;
  mobile_url: string;
  thumbnail_url: string;
  dominant_color: string;
  desktop_resolution: { w: number; h: number } | null;
  mobile_resolution: { w: number; h: number } | null;
  display_order: number;
  duration_ms: number;
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
  overlay_opacity: number;
  overlay_color: string;
  focal_point: "center" | "top" | "bottom" | "left" | "right";
  asset_type: "image";
  created_at: string;
  updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const THEMES = [
  { id: "classic-aarambh", name: "Classic Aarambh", overlay: "#0A0F28", accent: "#B8934B" },
  { id: "midnight-gold", name: "Midnight Gold", overlay: "#0D1117", accent: "#D4AF37", recommended: true },
  { id: "royal-blue", name: "Royal Blue", overlay: "#001F5B", accent: "#4A90D9" },
  { id: "convocation", name: "Convocation", overlay: "#1A0A00", accent: "#C8A96E" },
  { id: "admissions", name: "Admissions", overlay: "#001A1A", accent: "#2ECC71" },
  { id: "orientation", name: "Orientation", overlay: "#1A0030", accent: "#9B59B6" },
] as const;

const DEFAULT_SETTINGS: LandingSettings = {
  active_collection: null,
  enable_slideshow: true,
  enable_countdown: true,
  enable_memories: true,
  enable_stats: true,
  enable_footer: true,
  navbar_mode: "glass",
  maintenance_mode: false,
  maintenance_message: "",
};

const DEFAULT_COLLECTION: Omit<LandingCollection, "id" | "slug" | "created_at" | "updated_at"> = {
  name: "",
  academic_year: new Date().getFullYear().toString(),
  status: "DRAFT",
  transition: "crossfade",
  default_duration_ms: 6000,
  ken_burns_enabled: false,
  particles_intensity: "low",
  theme: "midnight-gold",
  show_background_image: true,
  show_overlay: true,
  show_orbit: true,
  show_particles: true,
  show_watermark: true,
  show_logo: true,
  show_glow: true,
  show_noise: true,
  heading: "आरंभ",
  subheading: "AARAMBH 2026",
  tagline_prefix: "Embracing",
  tagline_script: "",
  tagline_suffix: "New Horizons",
  body_copy: "Register. Connect. Belong.",
  cta_primary_label: "Register Now",
  cta_primary_link: "/register",
  cta_secondary_label: "Lodge Attendance",
  cta_secondary_link: "/attendance",
  publish_at: null,
  expires_at: null,
  navbar_variant: null,
  countdown_variant: null,
  overlay_color_override: null,
};

// ─── Utility: cache invalidation ──────────────────────────────────────────────
async function invalidateLandingCache() {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/media/landing", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Silent fail — TTL will expire naturally
  }
}

// ─── Utility: image quality score ─────────────────────────────────────────────
interface QualityScore {
  stars: number;
  label: string;
  color: "emerald" | "amber" | "red";
}

function getImageQualityScore(w: number, h: number): QualityScore {
  const longer = Math.max(w, h);
  if (longer >= 3840) return { stars: 5, label: "Perfect", color: "emerald" };
  if (longer >= 1920) return { stars: 4, label: "Good", color: "emerald" };
  if (longer >= 1280) return { stars: 3, label: "Acceptable", color: "amber" };
  return { stars: 1, label: "Too small — may appear blurry", color: "red" };
}

// ─── Utility: dominant color extraction ──────────────────────────────────────
async function extractDominantColor(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve("#0A0F28"); return; }
        ctx.drawImage(img, 0, 0, 8, 8);
        const data = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2];
        }
        const toHex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
        resolve(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
      } catch {
        resolve("#0A0F28");
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve("#0A0F28"); };
    img.src = url;
  });
}

// ─── Utility: image dimensions from File ─────────────────────────────────────
function getImageDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ w: 0, h: 0 }); };
    img.src = url;
  });
}

// ─── Stars renderer ───────────────────────────────────────────────────────────
function Stars({ count, color }: { count: number; color: "emerald" | "amber" | "red" }) {
  const colorMap = { emerald: "text-emerald-500", amber: "text-amber-500", red: "text-red-500" };
  return (
    <span className={colorMap[color]}>
      {"★".repeat(count)}{"☆".repeat(5 - count)}
    </span>
  );
}

// ─── Toast (simple inline) ────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const show = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, show };
}

// ─── Main Component ───────────────────────────────────────────────────────────
function AdminLanding() {
  const { toast, show: showToast } = useToast();

  // Settings
  const [settings, setSettings] = useState<LandingSettings>(DEFAULT_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Auth Lock
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  useEffect(() => {
    async function checkAuth() {
      const user = auth.currentUser;
      if (user) {
        const idTokenResult = await user.getIdTokenResult();
        setIsUnlocked(!!idTokenResult.claims.landing_super_admin);
      }
    }
    checkAuth();
  }, []);

  const handleUnlock = async () => {
    setUnlocking(true);
    setUnlockError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in");
      const token = await user.getIdToken();
      const res = await fetch("/api/landing-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ action: "unlock", password: unlockPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to unlock");
      
      await user.getIdToken(true);
      setIsUnlocked(true);
      setUnlockDialogOpen(false);
      setUnlockPassword("");
      showToast("Edit mode unlocked");
    } catch (e: any) {
      setUnlockError(e.message);
    } finally {
      setUnlocking(false);
    }
  };

  const handleLock = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      await fetch("/api/landing-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ action: "lock" })
      });
      await user.getIdToken(true);
      setIsUnlocked(false);
      showToast("Edit mode locked");
    } catch (e: any) {
      showToast("Failed to lock: " + e.message, "error");
    }
  };

  // Collections
  const [collections, setCollections] = useState<LandingCollection[]>([]);
  const [selectedCol, setSelectedCol] = useState<LandingCollection | null>(null);
  const [slides, setSlides] = useState<LandingSlide[]>([]);
  const [colSaving, setColSaving] = useState(false);
  const [newColOpen, setNewColOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColYear, setNewColYear] = useState(new Date().getFullYear().toString());
  const [creatingCol, setCreatingCol] = useState(false);

  // Slide dialog
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<Partial<LandingSlide> | null>(null);
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [desktopPreview, setDesktopPreview] = useState<string>("");
  const [mobilePreview, setMobilePreview] = useState<string>("");
  const [desktopQuality, setDesktopQuality] = useState<QualityScore | null>(null);
  const [mobileQuality, setMobileQuality] = useState<QualityScore | null>(null);
  const [desktopProgress, setDesktopProgress] = useState(0);
  const [mobileProgress, setMobileProgress] = useState(0);
  const [slideSaving, setSlideSaving] = useState(false);

  // Drag-and-drop reorder
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);

  // Preview tab
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Subscribe: landing_settings/global ──────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "landing_settings", "global"), (snap) => {
      if (snap.exists()) {
        setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<LandingSettings>) });
      }
    });
    return unsub;
  }, []);

  // ── Subscribe: landing_collections ──────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "landing_collections"),
      orderBy("updated_at", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LandingCollection));
      setCollections(docs);
    });
    return unsub;
  }, []);

  // ── Subscribe: slides for selected collection ────────────────────────────────
  useEffect(() => {
    if (!selectedCol) { 
      setSlides([]); 
      return; 
    }
    // We now read slides directly from the hero property of the collection document
    // (as saved by HeroManager) instead of a separate landing_slides collection.
    const heroSlides = (selectedCol as any).hero?.slides || [];
    setSlides(heroSlides);
    setOrderDirty(false);
  }, [selectedCol]);

  // ── Auto-advance preview ────────────────────────────────────────────────────
  useEffect(() => {
    if (!previewPlaying || slides.length === 0) return;
    const publishedSlides = slides.filter((s) => s.status === "PUBLISHED");
    if (publishedSlides.length === 0) { setPreviewPlaying(false); return; }
    previewTimerRef.current = setTimeout(() => {
      setPreviewSlideIdx((i) => (i + 1) % publishedSlides.length);
    }, 3000);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [previewPlaying, previewSlideIdx, slides]);

  // ── Health check ────────────────────────────────────────────────────────────
  const publishedSlides = slides.filter((s: any) => s.status === "PUBLISHED");
  const missingMobile = publishedSlides.filter((s: any) => !s.mobileImage?.url);
  const missingAlt = publishedSlides.filter((s: any) => !s.altText?.trim());
  const isLive = settings.active_collection === selectedCol?.id;
  const expiresInDays = selectedCol?.expires_at
    ? Math.ceil((new Date(selectedCol.expires_at).getTime() - Date.now()) / 86400000)
    : null;

  // ── Save: global settings ───────────────────────────────────────────────────
  const saveSettings = async () => {
    if (!isUnlocked) { showToast("Unlock Edit Mode to save settings.", "error"); return; }
    setSettingsSaving(true);
    try {
      await setDoc(doc(db, "landing_settings", "global"), {
        ...settings,
        updated_at: new Date().toISOString(),
        updated_by: auth.currentUser?.uid ?? "admin",
      }, { merge: true });
      await invalidateLandingCache();
      showToast("Global settings saved.");
    } catch (e: any) {
      showToast("Failed to save settings: " + e.message, "error");
    } finally {
      setSettingsSaving(false);
    }
  };

  // ── Create new collection ────────────────────────────────────────────────────
  const createCollection = async () => {
    if (!isUnlocked) { showToast("Unlock Edit Mode to create collections.", "error"); return; }
    if (!newColName.trim()) return;
    setCreatingCol(true);
    try {
      const slug = newColName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const now = new Date().toISOString();
      const uid = auth.currentUser?.uid ?? "admin";
      const newCol: LandingCollection = {
        ...DEFAULT_COLLECTION,
        id: slug,
        slug,
        name: newColName.trim(),
        academic_year: newColYear,
        created_at: now,
        updated_at: now,
      } as LandingCollection;
      await setDoc(doc(db, "landing_collections", slug), newCol);
      setNewColOpen(false);
      setNewColName("");
      showToast(`Collection "${newColName.trim()}" created.`);
    } catch (e: any) {
      showToast("Failed to create collection: " + e.message, "error");
    } finally {
      setCreatingCol(false);
    }
  };

  // ── Save: collection general/animation/schedule ──────────────────────────────
  const saveCollection = async () => {
    if (!isUnlocked) { showToast("Unlock Edit Mode to save collections.", "error"); return; }
    if (!selectedCol) return;
    setColSaving(true);
    try {
      await updateDoc(doc(db, "landing_collections", selectedCol.id), {
        ...selectedCol,
        updated_at: new Date().toISOString(),
        updated_by: auth.currentUser?.uid ?? "admin",
      });
      await invalidateLandingCache();
      showToast("Collection saved.");
    } catch (e: any) {
      showToast("Failed to save: " + e.message, "error");
    } finally {
      setColSaving(false);
    }
  };

  // ── Duplicate collection ──────────────────────────────────────────────────────
  const duplicateCollection = async (source: LandingCollection) => {
    if (!isUnlocked) { showToast("Unlock Edit Mode to duplicate collections.", "error"); return; }
    try {
      const newSlug = `${source.slug}-copy-${Date.now()}`;
      const now = new Date().toISOString();
      const uid = auth.currentUser?.uid ?? "admin";
      await setDoc(doc(db, "landing_collections", newSlug), {
        ...source,
        id: newSlug,
        slug: newSlug,
        name: `${source.name} (Copy)`,
        status: "DRAFT",
        publish_at: null,
        expires_at: null,
        created_at: now,
        updated_at: now,
        created_by: uid,
        updated_by: uid,
      });
      const slidesSnap = await getDocs(
        query(collection(db, "landing_slides"), where("collection_id", "==", source.id))
      );
      const batch = writeBatch(db);
      slidesSnap.docs.forEach((d) => {
        const newId = crypto.randomUUID();
        batch.set(doc(db, "landing_slides", newId), {
          ...d.data(),
          id: newId,
          collection_id: newSlug,
          status: "DRAFT",
          created_at: now,
          updated_at: now,
        });
      });
      await batch.commit();
      showToast(`"${source.name}" duplicated. Update schedule before publishing.`);
    } catch (e: any) {
      showToast("Duplication failed: " + e.message, "error");
    }
  };

  // ── Archive / Delete collection ──────────────────────────────────────────────
  const archiveCollection = async (col: LandingCollection) => {
    if (!isUnlocked) { showToast("Unlock Edit Mode to archive collections.", "error"); return; }
    try {
      await updateDoc(doc(db, "landing_collections", col.id), {
        status: "ARCHIVED",
        updated_at: new Date().toISOString(),
        updated_by: auth.currentUser?.uid ?? "admin",
      });
      showToast(`"${col.name}" archived.`);
    } catch (e: any) {
      showToast("Failed to archive: " + e.message, "error");
    }
  };

  const unarchiveCollection = async (col: LandingCollection) => {
    if (!isUnlocked) { showToast("Unlock Edit Mode to unarchive collections.", "error"); return; }
    try {
      await updateDoc(doc(db, "landing_collections", col.id), {
        status: "DRAFT",
        updated_at: new Date().toISOString(),
        updated_by: auth.currentUser?.uid ?? "admin",
      });
      showToast(`"${col.name}" unarchived (status set to DRAFT).`);
    } catch (e: any) {
      showToast("Failed to unarchive: " + e.message, "error");
    }
  };

  // ── Drag-and-drop reorder slides ─────────────────────────────────────────────
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setSlides((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      setDragIdx(idx);
      setOrderDirty(true);
      return next;
    });
  };
  const handleDragEnd = () => setDragIdx(null);

  const saveSlideOrder = async () => {
    if (!selectedCol) return;
    setOrderSaving(true);
    try {
      const batch = writeBatch(db);
      slides.forEach((s, i) => {
        batch.update(doc(db, "landing_slides", s.id), { display_order: i, updated_at: new Date().toISOString() });
      });
      await batch.commit();
      await invalidateLandingCache();
      setOrderDirty(false);
      showToast("Slide order saved.");
    } catch (e: any) {
      showToast("Failed to save order: " + e.message, "error");
    } finally {
      setOrderSaving(false);
    }
  };

  // ── File select handlers ───────────────────────────────────────────────────
  const handleDesktopFileSelect = async (file: File) => {
    setDesktopFile(file);
    setDesktopPreview(URL.createObjectURL(file));
    const dims = await getImageDimensions(file);
    setDesktopQuality(getImageQualityScore(dims.w, dims.h));
    if (editingSlide) {
      const color = await extractDominantColor(file);
      setEditingSlide((prev) => ({
        ...prev,
        dominant_color: color,
        desktop_resolution: dims,
      }));
    }
  };

  const handleMobileFileSelect = async (file: File) => {
    setMobileFile(file);
    setMobilePreview(URL.createObjectURL(file));
    const dims = await getImageDimensions(file);
    setMobileQuality(getImageQualityScore(dims.w, dims.h));
    if (editingSlide) {
      setEditingSlide((prev) => ({ ...prev, mobile_resolution: dims }));
    }
  };

  // ── Upload a single file ────────────────────────────────────────────────────
  const uploadFile = (
    file: File,
    path: string,
    onProgress: (p: number) => void
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        "state_changed",
        (snap) => onProgress((snap.bytesTransferred / snap.totalBytes) * 100),
        reject,
        async () => resolve(await getDownloadURL(task.snapshot.ref))
      );
    });

  // ── Save slide ────────────────────────────────────────────────────────────
  const saveSlide = async () => {
    if (!isUnlocked) { showToast("Unlock Edit Mode to save slides.", "error"); return; }
    if (!selectedCol || !editingSlide) return;
    setSlideSaving(true);
    try {
      const slideId = editingSlide.id ?? crypto.randomUUID();
      const year = selectedCol.academic_year;
      const basePath = `media-library/landing/${year}/${selectedCol.id}/${slideId}`;
      const now = new Date().toISOString();
      const uid = auth.currentUser?.uid ?? "admin";

      let desktopUrl = editingSlide.url ?? "";
      let mobileUrl = editingSlide.mobile_url ?? "";
      let dominantColor = editingSlide.dominant_color ?? "#0A0F28";

      if (desktopFile) {
        const ext = desktopFile.name.split(".").pop() ?? "jpg";
        dominantColor = await extractDominantColor(desktopFile);
        desktopUrl = await uploadFile(
          desktopFile,
          `${basePath}/desktop.${ext}`,
          setDesktopProgress
        );
      }
      if (mobileFile) {
        const ext = mobileFile.name.split(".").pop() ?? "jpg";
        mobileUrl = await uploadFile(
          mobileFile,
          `${basePath}/mobile.${ext}`,
          setMobileProgress
        );
      }

      const maxOrder = slides.length > 0 ? Math.max(...slides.map((s) => s.display_order)) + 1 : 0;
      const isNew = !editingSlide.id;

      const slideDoc: LandingSlide = {
        id: slideId,
        collection_id: selectedCol.id,
        title: editingSlide.title ?? "",
        subtitle: editingSlide.subtitle ?? "",
        alt_text: editingSlide.alt_text ?? "",
        image_credit: editingSlide.image_credit ?? "",
        url: desktopUrl,
        mobile_url: mobileUrl || desktopUrl,
        thumbnail_url: desktopUrl,
        dominant_color: dominantColor,
        desktop_resolution: editingSlide.desktop_resolution ?? null,
        mobile_resolution: editingSlide.mobile_resolution ?? null,
        display_order: editingSlide.display_order ?? maxOrder,
        duration_ms: editingSlide.duration_ms ?? selectedCol.default_duration_ms,
        status: editingSlide.status ?? "DRAFT",
        overlay_opacity: editingSlide.overlay_opacity ?? 65,
        overlay_color: editingSlide.overlay_color ?? "#0A0F28",
        focal_point: editingSlide.focal_point ?? "center",
        asset_type: "image",
        created_at: isNew ? now : (editingSlide.created_at ?? now),
        updated_at: now,
      };

      await setDoc(doc(db, "landing_slides", slideId), {
        ...slideDoc,
        updated_by: uid,
        ...(isNew && { created_by: uid }),
      });
      await invalidateLandingCache();
      showToast(`Slide "${slideDoc.title || "Untitled"}" saved.`);
      setSlideOpen(false);
      resetSlideDialog();
    } catch (e: any) {
      showToast("Upload failed: " + e.message, "error");
    } finally {
      setSlideSaving(false);
    }
  };

  const resetSlideDialog = () => {
    setEditingSlide(null);
    setDesktopFile(null);
    setMobileFile(null);
    setDesktopPreview("");
    setMobilePreview("");
    setDesktopQuality(null);
    setMobileQuality(null);
    setDesktopProgress(0);
    setMobileProgress(0);
  };

  const openNewSlide = () => {
    resetSlideDialog();
    setEditingSlide({
      status: "DRAFT",
      overlay_opacity: 65,
      overlay_color: "#0A0F28",
      focal_point: "center",
      duration_ms: selectedCol?.default_duration_ms ?? 6000,
    });
    setSlideOpen(true);
  };

  const openEditSlide = (slide: LandingSlide) => {
    resetSlideDialog();
    setEditingSlide({ ...slide });
    setDesktopPreview(slide.url);
    setMobilePreview(slide.mobile_url || slide.url);
    setSlideOpen(true);
  };

  const duplicateSlide = async (slide: LandingSlide) => {
    try {
      const newId = crypto.randomUUID();
      const now = new Date().toISOString();
      const maxOrder = slides.length > 0 ? Math.max(...slides.map((s) => s.display_order)) + 1 : 0;
      await setDoc(doc(db, "landing_slides", newId), {
        ...slide,
        id: newId,
        status: "DRAFT",
        display_order: maxOrder,
        created_at: now,
        updated_at: now,
        created_by: auth.currentUser?.uid ?? "admin",
        updated_by: auth.currentUser?.uid ?? "admin",
      });
      showToast("Slide duplicated as Draft.");
    } catch (e: any) {
      showToast("Failed to duplicate: " + e.message, "error");
    }
  };

  const toggleSlideStatus = async (slide: LandingSlide) => {
    const next = slide.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      await updateDoc(doc(db, "landing_slides", slide.id), {
        status: next,
        updated_at: new Date().toISOString(),
        updated_by: auth.currentUser?.uid ?? "admin",
      });
      await invalidateLandingCache();
      showToast(`Slide ${next === "PUBLISHED" ? "published" : "unpublished"}.`);
    } catch (e: any) {
      showToast("Failed to update status: " + e.message, "error");
    }
  };

  const deleteSlide = async (slide: LandingSlide) => {
    if (!isUnlocked) { showToast("Unlock Edit Mode to delete slides.", "error"); return; }
    if (!window.confirm(`Delete "${slide.title || "this slide"}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "landing_slides", slide.id));
      try { if (slide.url) await deleteObject(ref(storage, slide.url)); } catch { /* fail silently */ }
      try { if (slide.mobile_url && slide.mobile_url !== slide.url) await deleteObject(ref(storage, slide.mobile_url)); } catch { /* fail silently */ }
      await invalidateLandingCache();
      showToast("Slide deleted.");
    } catch (e: any) {
      showToast("Failed to delete: " + e.message, "error");
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminShell
      title="Landing Experience"
      subtitle="Manage collections, slides, and global settings for all landing pages."
    >
      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold border transition-all duration-300 ${
            toast.type === "error"
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <TickSquare variant="Bold" className="w-4 h-4 shrink-0" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Lock/Unlock Header Area */}
      <div className="flex justify-end mb-6">
        {isUnlocked ? (
          <Button variant="outline" size="sm" onClick={handleLock} className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
            <Lock className="w-4 h-4 mr-2" />
            Lock Edit Mode
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={() => setUnlockDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Unlock className="w-4 h-4 mr-2" />
            Unlock Edit Mode
          </Button>
        )}
      </div>

      {/* Unlock Dialog */}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unlock Edit Mode</DialogTitle>
            <DialogDescription>
              Enter the super-password to enable editing for the Landing Experience.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="super-password">Password</Label>
            <Input
              id="super-password"
              type="password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder="Enter password..."
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === "Enter" && unlockPassword) handleUnlock();
              }}
            />
            {unlockError && <p className="text-sm text-red-500 mt-2 font-medium">{unlockError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUnlock} disabled={!unlockPassword || unlocking}>
              {unlocking ? "Unlocking..." : "Unlock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Global Settings Strip ─────────────────────────────────────────── */}
      <div className={`admin-card p-5 mb-6 ${settings.maintenance_mode ? "border-l-4 border-red-500" : ""}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Setting2 variant="TwoTone" className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Global Settings</h2>
          </div>
          {settings.maintenance_mode && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
              <Warning2 variant="Bold" className="w-3.5 h-3.5" />
              Maintenance Mode Active
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          {/* Active collection */}
          <div className="xl:col-span-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Active Collection
            </Label>
            <select
              value={settings.active_collection ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, active_collection: e.target.value || null }))}
              className="admin-input-enhanced w-full text-sm"
            >
              <option value="">— None (Landing page shows empty state) —</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.academic_year} · {c.status}
                </option>
              ))}
            </select>
          </div>

          {/* Navbar mode */}
          <div>
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Navbar Mode
            </Label>
            <select
              value={settings.navbar_mode}
              onChange={(e) => setSettings((s) => ({ ...s, navbar_mode: e.target.value as LandingSettings["navbar_mode"] }))}
              className="admin-input-enhanced w-full text-sm"
            >
              <option value="glass">Glass</option>
              <option value="dark-glass">Dark Glass</option>
              <option value="transparent">Transparent</option>
            </select>
          </div>

          {/* Maintenance mode */}
          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.maintenance_mode}
                onChange={(e) => setSettings((s) => ({ ...s, maintenance_mode: e.target.checked }))}
                className="w-4 h-4 rounded accent-red-500"
              />
              <span className="text-sm font-semibold text-foreground">Maintenance Mode</span>
            </label>
          </div>
        </div>

        {/* Section toggles */}
        <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-border/50">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Sections:</span>
          {(
            [
              ["enable_slideshow", "Slideshow"],
              ["enable_countdown", "Countdown"],
              ["enable_memories", "Memories"],
              ["enable_stats", "Stats"],
              ["enable_footer", "Footer"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={saveSettings} disabled={settingsSaving || !isUnlocked} size="sm" className="rounded-full px-5">
            {settingsSaving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </div>

      {/* ── Health Check + Live Badge ─────────────────────────────────────── */}
      {selectedCol && (
        <div className="admin-card p-5 mb-6">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {isLive && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                LIVE · {publishedSlides.length} slides
              </span>
            )}
            <span className="text-sm font-bold text-foreground">{selectedCol.name}</span>
            <span className="text-xs text-muted-foreground">Theme: {THEMES.find((t) => t.id === selectedCol.theme)?.name ?? selectedCol.theme}</span>
            {expiresInDays !== null && expiresInDays <= 7 && (
              <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                Expires in {expiresInDays} day{expiresInDays !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <HealthCard label="Slides Published" value={`${publishedSlides.length} of ${slides.length}`} ok={publishedSlides.length > 0} />
            <HealthCard label="Desktop Images" value={publishedSlides.every((s) => !!s.url) ? "All set" : `${publishedSlides.filter((s) => !s.url).length} missing`} ok={publishedSlides.every((s) => !!s.url)} />
            <HealthCard
              label="Mobile Images"
              value={missingMobile.length === 0 ? "All set" : `${missingMobile.length} missing`}
              ok={missingMobile.length === 0}
              onFix={missingMobile.length > 0 ? () => openEditSlide(missingMobile[0]) : undefined}
            />
            <HealthCard label="Alt Text" value={missingAlt.length === 0 ? "All set" : `${missingAlt.length} missing`} ok={missingAlt.length === 0} />
          </div>
        </div>
      )}

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6">
        {/* ── Collections Panel ─────────────────────────────────────────── */}
        <div className="admin-card p-4 flex flex-col gap-3 min-h-[400px]">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Collections</h2>
            <Button size="sm" variant="default" onClick={() => setNewColOpen(true)} disabled={!isUnlocked} className="h-7 px-3 rounded-md shadow-sm">
              <Add variant="Bold" className="h-4 w-4 mr-1" />
              <span className="text-xs font-semibold">New</span>
            </Button>
          </div>

          <div className="flex flex-col gap-1.5 flex-1">
            {collections.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center py-10 text-center text-muted-foreground/60">
                <Gallery variant="TwoTone" className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">No collections yet.</p>
                <p className="text-xs mt-1">Click + to create your first collection.</p>
              </div>
            )}
            {collections.map((col) => {
              const live = settings.active_collection === col.id;
              const active = selectedCol?.id === col.id;
              return (
                <div
                  key={col.id}
                  className={`group flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer transition-all border ${
                    active
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => { setSelectedCol(col); setPreviewSlideIdx(0); setPreviewPlaying(false); }}
                >
                  {live && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 ring-2 ring-emerald-100" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-none truncate">{col.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{col.academic_year} · {col.status}</p>
                  </div>
                  {/* Action menu */}
                  <div className="flex items-center gap-1.5 opacity-100" onClick={(e) => e.stopPropagation()}>
                    <button
                      title="Duplicate collection"
                      className="p-1.5 rounded-md bg-muted hover:bg-primary/20 text-foreground hover:text-primary transition-colors shadow-sm"
                      onClick={() => duplicateCollection(col)}
                    >
                      <Copy variant="TwoTone" className="h-4 w-4" />
                    </button>
                    {col.status === "ARCHIVED" ? (
                      <button
                        title="Unarchive collection"
                        className="p-1.5 rounded-md bg-muted hover:bg-emerald-100 text-foreground hover:text-emerald-600 transition-colors shadow-sm"
                        onClick={() => unarchiveCollection(col)}
                      >
                        <ArchiveRestore className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        title="Archive collection"
                        className="p-1.5 rounded-md bg-muted hover:bg-amber-100 text-foreground hover:text-amber-600 transition-colors shadow-sm"
                        onClick={() => archiveCollection(col)}
                      >
                        <Trash variant="TwoTone" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Tabbed Collection Editor ───────────────────────────────────── */}
        {selectedCol ? (
          <div className="admin-card p-5">
            <Tabs defaultValue="general">
              <TabsList className="mb-6 flex flex-wrap">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="hero">Hero</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
                <TabsTrigger value="faq">FAQ</TabsTrigger>
                <TabsTrigger value="footer">Footer</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
                <TabsTrigger value="publish">Publish</TabsTrigger>
              </TabsList>

              {/* ── General Tab ─────────────────────────────────────────── */}
              <TabsContent value="general" className="space-y-6">
                {/* Identity */}
                <Section title="Identity">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FormField label="Name">
                      <Input
                        value={selectedCol.name}
                        onChange={(e) => setSelectedCol((c) => c ? { ...c, name: e.target.value } : c)}
                        placeholder="Aarambh 2026"
                      />
                    </FormField>
                    <FormField label="Academic Year">
                      <Input
                        value={selectedCol.academic_year}
                        onChange={(e) => setSelectedCol((c) => c ? { ...c, academic_year: e.target.value } : c)}
                        placeholder="2026"
                      />
                    </FormField>
                    <FormField label="Status">
                      <select
                        value={selectedCol.status}
                        onChange={(e) => setSelectedCol((c) => c ? { ...c, status: e.target.value as LandingCollection["status"] } : c)}
                        className="admin-input-enhanced w-full text-sm"
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="ACTIVE">Active</option>
                        <option value="ARCHIVED">Archived</option>
                      </select>
                    </FormField>
                  </div>
                </Section>

                {/* Hero text */}
                <Section title="Hero Text">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Heading (Devanagari)">
                      <Input value={selectedCol.heading} onChange={(e) => setSelectedCol((c) => c ? { ...c, heading: e.target.value } : c)} placeholder="आरंभ" />
                    </FormField>
                    <FormField label="Subheading">
                      <Input value={selectedCol.subheading} onChange={(e) => setSelectedCol((c) => c ? { ...c, subheading: e.target.value } : c)} placeholder="AARAMBH 2026" />
                    </FormField>
                    <FormField label="Tagline · Part 1">
                      <Input value={selectedCol.tagline_prefix} onChange={(e) => setSelectedCol((c) => c ? { ...c, tagline_prefix: e.target.value } : c)} placeholder="Embracing" />
                    </FormField>
                    <FormField label="Tagline · Part 2 (Gold script)">
                      <Input value={selectedCol.tagline_suffix} onChange={(e) => setSelectedCol((c) => c ? { ...c, tagline_suffix: e.target.value } : c)} placeholder="New Horizons" />
                    </FormField>
                    <FormField label="Body Copy" className="sm:col-span-2">
                      <Input value={selectedCol.body_copy} onChange={(e) => setSelectedCol((c) => c ? { ...c, body_copy: e.target.value } : c)} placeholder="Register. Connect. Belong." />
                    </FormField>
                  </div>
                </Section>

                {/* CTAs */}
                <Section title="Calls to Action">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Primary Button Label">
                      <Input value={selectedCol.cta_primary_label} onChange={(e) => setSelectedCol((c) => c ? { ...c, cta_primary_label: e.target.value } : c)} placeholder="Register Now" />
                    </FormField>
                    <FormField label="Primary Button Link">
                      <Input value={selectedCol.cta_primary_link} onChange={(e) => setSelectedCol((c) => c ? { ...c, cta_primary_link: e.target.value } : c)} placeholder="/register" />
                    </FormField>
                    <FormField label="Secondary Button Label">
                      <Input value={selectedCol.cta_secondary_label} onChange={(e) => setSelectedCol((c) => c ? { ...c, cta_secondary_label: e.target.value } : c)} placeholder="Lodge Attendance" />
                    </FormField>
                    <FormField label="Secondary Button Link">
                      <Input value={selectedCol.cta_secondary_link} onChange={(e) => setSelectedCol((c) => c ? { ...c, cta_secondary_link: e.target.value } : c)} placeholder="/attendance" />
                    </FormField>
                  </div>
                </Section>

                {/* Theme presets (visual cards) */}
                <Section title="Theme Preset">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedCol((c) => c ? { ...c, theme: t.id } : c)}
                        className={`relative flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left ${
                          selectedCol.theme === t.id
                            ? "border-primary shadow-md shadow-primary/20"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex gap-1.5 mb-2">
                          <div className="h-5 w-5 rounded-full" style={{ background: t.overlay }} />
                          <div className="h-5 w-5 rounded-full" style={{ background: t.accent }} />
                        </div>
                        <span className="text-xs font-bold text-foreground">{t.name}</span>
                        {"recommended" in t && t.recommended && (
                          <span className="absolute top-2 right-2 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">⭐ Rec.</span>
                        )}
                      </button>
                    ))}
                  </div>
                </Section>

                {/* Layer Manager */}
                <Section title="Layer Manager">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(
                      [
                        ["show_background_image", "Background"],
                        ["show_overlay", "Overlay"],
                        ["show_orbit", "Orbit"],
                        ["show_particles", "Particles"],
                        ["show_watermark", "Watermark"],
                        ["show_logo", "Logo"],
                        ["show_glow", "Glow"],
                        ["show_noise", "Noise"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer text-sm font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={selectedCol[key]}
                          onChange={(e) => setSelectedCol((c) => c ? { ...c, [key]: e.target.checked } : c)}
                          className="w-4 h-4 rounded accent-primary"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </Section>

                {/* Accessibility Audit */}
                <Section title="Accessibility Audit">
                  <div className="space-y-2">
                    <AuditLine ok={missingAlt.length === 0} label="All slides have alt text" warn={missingAlt.length > 0 ? `${missingAlt.length} missing` : undefined} />
                    <AuditLine ok={missingMobile.length === 0} label="All slides have mobile images" warn={missingMobile.length > 0 ? `${missingMobile.length} missing` : undefined} onFix={missingMobile.length > 0 ? () => openEditSlide(missingMobile[0]) : undefined} />
                    <AuditLine ok={!!selectedCol.cta_primary_label} label="Primary CTA is set" warn={!selectedCol.cta_primary_label ? "Missing" : undefined} />
                    <AuditLine ok={expiresInDays === null || expiresInDays > 7} label="Collection expiry" warn={expiresInDays !== null && expiresInDays <= 7 ? `Expires in ${expiresInDays} days` : undefined} />
                  </div>
                </Section>

                <div className="flex justify-end pt-2">
                  <Button onClick={saveCollection} disabled={colSaving || !isUnlocked} className="rounded-full px-6">
                    {colSaving ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </TabsContent>

              {/* ── Hero Tab ──────────────────────────────────────────── */}
              <TabsContent value="hero" className="space-y-6">
                <HeroManager collectionId={selectedCol.id} />
              </TabsContent>

              {/* Placeholders for other tabs */}
              <TabsContent value="timeline"><div className="p-10 text-center text-muted-foreground border-2 border-dashed rounded-xl">Timeline Manager (Coming Soon)</div></TabsContent>
              <TabsContent value="stats"><div className="p-10 text-center text-muted-foreground border-2 border-dashed rounded-xl">Stats Manager (Coming Soon)</div></TabsContent>
              <TabsContent value="faq"><div className="p-10 text-center text-muted-foreground border-2 border-dashed rounded-xl">FAQ Manager (Coming Soon)</div></TabsContent>
              <TabsContent value="footer"><div className="p-10 text-center text-muted-foreground border-2 border-dashed rounded-xl">Footer Manager (Coming Soon)</div></TabsContent>
              <TabsContent value="seo"><div className="p-10 text-center text-muted-foreground border-2 border-dashed rounded-xl">SEO Settings (Coming Soon)</div></TabsContent>
              <TabsContent value="publish"><div className="p-10 text-center text-muted-foreground border-2 border-dashed rounded-xl">Publishing Controls (Coming Soon)</div></TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="admin-card p-8 flex flex-col items-center justify-center text-center text-muted-foreground/60 min-h-[400px]">
            <MonitorMobbile variant="TwoTone" className="h-12 w-12 mb-4 opacity-30" />
            <p className="font-semibold text-foreground/60">Select a collection to edit</p>
            <p className="text-xs mt-1.5">Choose from the list on the left, or create a new one.</p>
          </div>
        )}
      </div>

      {/* ── New Collection Dialog ───────────────────────────────────────────── */}
      <Dialog open={newColOpen} onOpenChange={setNewColOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Collection</DialogTitle>
            <DialogDescription>Create a new landing experience collection. You can always edit it later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Collection Name">
              <Input
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="e.g. Aarambh 2027"
                autoFocus
              />
            </FormField>
            <FormField label="Academic Year">
              <Input
                value={newColYear}
                onChange={(e) => setNewColYear(e.target.value)}
                placeholder="2027"
                className="max-w-[120px]"
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewColOpen(false)}>Cancel</Button>
            <Button onClick={createCollection} disabled={creatingCol || !newColName.trim() || !isUnlocked} className="rounded-full">
              {creatingCol ? "Creating…" : "Create Collection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Slide Upload / Edit Dialog ──────────────────────────────────────── */}
      <Dialog open={slideOpen} onOpenChange={(open) => { if (!open) resetSlideDialog(); setSlideOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSlide?.id ? "Edit Slide" : "Add Hero Slide"}</DialogTitle>
            <DialogDescription>Upload desktop and mobile images, then configure the slide settings.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Dual image upload */}
            <div className="grid grid-cols-2 gap-4">
              <ImageUploadZone
                label="Desktop Image"
                preview={desktopPreview}
                quality={desktopQuality}
                progress={desktopProgress}
                uploading={slideSaving && desktopProgress > 0}
                onFile={handleDesktopFileSelect}
                aspectHint="16:9 · 1920×1080 min"
              />
              <ImageUploadZone
                label="Mobile Image"
                preview={mobilePreview}
                quality={mobileQuality}
                progress={mobileProgress}
                uploading={slideSaving && mobileProgress > 0}
                onFile={handleMobileFileSelect}
                aspectHint="9:16 · 1080×1920 min"
              />
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Title">
                <Input
                  value={editingSlide?.title ?? ""}
                  onChange={(e) => setEditingSlide((s) => s ? { ...s, title: e.target.value } : s)}
                  placeholder="Main Building"
                />
              </FormField>
              <FormField label="Subtitle">
                <Input
                  value={editingSlide?.subtitle ?? ""}
                  onChange={(e) => setEditingSlide((s) => s ? { ...s, subtitle: e.target.value } : s)}
                  placeholder="The heart of KRMU"
                />
              </FormField>
              <FormField label="Alt Text (for screen readers)">
                <Input
                  value={editingSlide?.alt_text ?? ""}
                  onChange={(e) => setEditingSlide((s) => s ? { ...s, alt_text: e.target.value } : s)}
                  placeholder="Describe the image for accessibility"
                />
              </FormField>
              <FormField label="Image Credit (optional)">
                <Input
                  value={editingSlide?.image_credit ?? ""}
                  onChange={(e) => setEditingSlide((s) => s ? { ...s, image_credit: e.target.value } : s)}
                  placeholder="Photo: DSW Photography"
                />
              </FormField>
            </div>

            {/* Settings row */}
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Duration (seconds)">
                <Input
                  type="number"
                  min={2}
                  max={30}
                  value={(editingSlide?.duration_ms ?? 6000) / 1000}
                  onChange={(e) => setEditingSlide((s) => s ? { ...s, duration_ms: Number(e.target.value) * 1000 } : s)}
                />
              </FormField>
              <FormField label="Overlay Opacity (%)">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={editingSlide?.overlay_opacity ?? 65}
                  onChange={(e) => setEditingSlide((s) => s ? { ...s, overlay_opacity: Number(e.target.value) } : s)}
                />
              </FormField>
              <FormField label="Focal Point">
                <select
                  value={editingSlide?.focal_point ?? "center"}
                  onChange={(e) => setEditingSlide((s) => s ? { ...s, focal_point: e.target.value as LandingSlide["focal_point"] } : s)}
                  className="admin-input-enhanced w-full text-sm"
                >
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </FormField>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <input
                  type="radio"
                  name="slide-status"
                  value="DRAFT"
                  checked={editingSlide?.status === "DRAFT"}
                  onChange={() => setEditingSlide((s) => s ? { ...s, status: "DRAFT" } : s)}
                  className="accent-primary"
                />
                Draft
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <input
                  type="radio"
                  name="slide-status"
                  value="PUBLISHED"
                  checked={editingSlide?.status === "PUBLISHED"}
                  onChange={() => setEditingSlide((s) => s ? { ...s, status: "PUBLISHED" } : s)}
                  className="accent-primary"
                />
                Published
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSlideOpen(false)}>Cancel</Button>
            <Button onClick={saveSlide} disabled={slideSaving || !isUnlocked} className="rounded-full">
              {slideSaving ? "Uploading…" : editingSlide?.id ? "Save Slide" : "Upload & Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

// ─── Small shared sub-components ─────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  );
}

function FormField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ActionBtn({ title, onClick, icon, danger = false }: { title: string; onClick: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1 rounded transition-colors ${danger ? "hover:bg-red-100 hover:text-red-600 text-muted-foreground" : "hover:bg-primary/10 hover:text-primary text-muted-foreground"}`}
    >
      {icon}
    </button>
  );
}

function HealthCard({ label, value, ok, onFix }: { label: string; value: string; ok: boolean; onFix?: () => void }) {
  return (
    <div className={`p-3 rounded-xl border text-sm ${ok ? "bg-emerald-50/50 border-emerald-100" : "bg-amber-50/50 border-amber-200"}`}>
      <div className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${ok ? "text-emerald-600" : "text-amber-600"}`}>{label}</div>
      <div className="flex items-center justify-between">
        <span className={`font-semibold ${ok ? "text-emerald-700" : "text-amber-700"}`}>{value}</span>
        {!ok && onFix && (
          <button onClick={onFix} className="text-[10px] font-bold text-amber-600 hover:underline">Fix →</button>
        )}
      </div>
    </div>
  );
}

function AuditLine({ ok, label, warn, onFix }: { ok: boolean; label: string; warn?: string; onFix?: () => void }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      {ok ? (
        <TickSquare variant="Bold" className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <Warning2 variant="Bold" className="h-4 w-4 text-amber-500 shrink-0" />
      )}
      <span className={ok ? "text-foreground" : "text-amber-700 font-medium"}>{label}</span>
      {!ok && warn && <span className="text-xs text-muted-foreground">— {warn}</span>}
      {!ok && onFix && (
        <button onClick={onFix} className="text-xs font-bold text-primary hover:underline ml-auto">Fix →</button>
      )}
    </div>
  );
}

function ImageUploadZone({
  label,
  preview,
  quality,
  progress,
  uploading,
  onFile,
  aspectHint,
}: {
  label: string;
  preview: string;
  quality: QualityScore | null;
  progress: number;
  uploading: boolean;
  onFile: (f: File) => void;
  aspectHint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <div
        onClick={() => inputRef.current?.click()}
        className="relative aspect-video rounded-xl border-2 border-dashed border-border hover:border-primary/50 cursor-pointer overflow-hidden bg-muted/30 transition-colors group"
      >
        {preview ? (
          <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/60 gap-1.5 group-hover:text-muted-foreground transition-colors">
            <ImageIcon variant="TwoTone" className="h-6 w-6" />
            <span className="text-[10px] font-medium">{aspectHint}</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-x-0 bottom-0 bg-black/50 p-2">
            <Progress value={progress} className="h-1" />
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleChange}
      />
      {quality && (
        <div className="flex items-center gap-1.5 text-xs">
          <Stars count={quality.stars} color={quality.color} />
          <span className={quality.color === "red" ? "text-red-600 font-medium" : quality.color === "amber" ? "text-amber-600" : "text-emerald-600"}>
            {quality.label}
          </span>
        </div>
      )}
    </div>
  );
}
