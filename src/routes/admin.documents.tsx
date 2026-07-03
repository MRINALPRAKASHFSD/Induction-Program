import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Unlock, UploadCloud, FileText, Download, ShieldCheck, CheckCircle2, Clock, Trash2, Search, History, Users, Eye, Image as ImageIcon, MapPin, MoreVertical, LayoutGrid, FileType2, ArrowUpDown, RefreshCw } from "lucide-react";
import { db, auth } from "@/lib/firebase/config";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, getDocs, where, limit, deleteDoc, deleteField } from "firebase/firestore";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/admin/documents")({
  component: AdminDocumentsPage,
});

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CATEGORIES = ["Orientation", "Induction Day 1", "Induction Day 2", "Induction Day 3", "Induction Day 4", "Induction Day 5", "Other"];

// Helper function to calculate SHA-256
async function calculateHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper to check magic bytes
async function checkMagicBytes(file: File): Promise<boolean> {
  const arrayBuffer = await file.slice(0, 4).arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  
  // PDF: 25504446, JPEG: FFD8FF, PNG: 89504E47, DOCX/XLSX: 504B0304, DOC/XLS: D0CF11E0, WEBP: 52494646, GIF: 47494638
  const validSignatures = ['25504446', 'FFD8FF', '89504E47', '504B0304', 'D0CF11E0', '52494646', '47494638'];
  return validSignatures.some(sig => hex.startsWith(sig));
}

// Liquid Glass Constants
const glassCard = "bg-white/40 backdrop-blur-xl border border-white/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-[24px]";
const glassInput = "glass-card-hero border-white/60 focus:bg-white/70 transition-all shadow-sm rounded-xl";
const glassPanel = "glass-card-hero p-6 shadow-sm rounded-2xl";

function AdminDocumentsPage() {
  const [activeTab, setActiveTab] = useState<"upload" | "view" | "users">("upload");
  
  // Auth State
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<"coordinator" | "super_admin" | null>(null);
  
  // Timers
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Form State
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [category, setCategory] = useState("Other");
  const [uploadType, setUploadType] = useState<"Document" | "Image">("Document");
  const [imageLocation, setImageLocation] = useState<"Geo-tagged" | "Non Geo-tagged">("Geo-tagged");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // View State
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterUploadType, setFilterUploadType] = useState("All");
  const [filterGeoTag, setFilterGeoTag] = useState("All");
  const [showTrashed, setShowTrashed] = useState(false);
  const [sortOrder, setSortOrder] = useState("Latest");

  // User Management State
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", roles: ["coordinator"] as string[] });
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // -- Security Functions --
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) return;
    setIsAuthenticating(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, emailInput, passwordInput);
      const tokenResult = await userCredential.user.getIdTokenResult(true);
      const role = tokenResult.claims.role as "coordinator" | "super_admin";
      
      if (!role) throw new Error("User role not configured. Ask super admin for access.");
      if (activeTab === "upload" && role !== "coordinator" && role !== "super_admin") throw new Error("You do not have coordinator access.");
      if ((activeTab === "view" || activeTab === "users") && role !== "super_admin") throw new Error("You do not have super admin access.");

      setCurrentUserRole(role);
      toast.success(`Secure Vault Unlocked (${role})`);
      startTimer();
      
      if (activeTab === "view") fetchDocuments();
      setPasswordInput("");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Authentication failed");
      signOut(auth);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const lockVault = async () => {
    setCurrentUserRole(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lockVault();
      toast("Vault Locked automatically due to inactivity.");
    }, LOCK_TIMEOUT_MS);
  };

  useEffect(() => {
    const handleActivity = () => { if (currentUserRole) startTimer(); };
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  });

  // -- File Validation Logic --
  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) {
      setFile(null);
      return;
    }
    
    const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
    const isDoc = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext);

    if (uploadType === 'Image' && !isImage) {
      toast.error("Please select a valid image file (.png, .jpg, .jpeg, .webp, .gif).", { id: "file-type-error" });
      return;
    }
    
    if (uploadType === 'Document' && !isDoc) {
      toast.error("Please select a valid document file (.pdf, .doc, .docx, .ppt, .pptx, .xls, .xlsx).", { id: "file-type-error" });
      return;
    }

    setFile(selectedFile);
  };

  // -- Upload Logic --
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !docName || !auth.currentUser) return;

    let maxSize = 10 * 1024 * 1024;
    if (category === 'Reports') maxSize = 100 * 1024 * 1024;
    else if (uploadType === 'Image') maxSize = 50 * 1024 * 1024;

    if (file.size > maxSize) {
      toast.error(`File is too large (max ${maxSize / (1024 * 1024)}MB for this category/type).`);
      return;
    }

    const isValidMagic = await checkMagicBytes(file);
    if (!isValidMagic) {
      toast.error("Security Alert: Invalid file signature detected. Possible spoofed extension.");
      return;
    }

    setUploading(true);
    startTimer();
    toast.loading("Analyzing file for duplicates...", { id: "upload-toast" });

    try {
      const fileHash = await calculateHash(file);
      const safeDocName = docName.trim();
      const token = await auth.currentUser.getIdToken();
      
      // Sanitize Content-Type to prevent DOMException in Safari during XHR
      const safeContentType = (file.type || 'application/octet-stream').replace(/[^\x20-\x7E]/g, '');
      
      const initRes = await fetch('/api/vault-init-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          filename: file.name, 
          fileSize: file.size, 
          fileHash, 
          category,
          contentType: safeContentType,
          uploadType,
          imageLocation: uploadType === 'Image' ? imageLocation : undefined
        })
      });
      
      const initText = await initRes.text();
      let initData;
      try {
        initData = JSON.parse(initText);
      } catch (parseError) {
        throw new Error(`Failed to parse API response: ${initText.substring(0, 200)}...`);
      }
      
      if (!initRes.ok) throw new Error(initData.error || initData.message || "Unknown API Error");
      
      const { uploadUrl, filePath } = initData;
      
      toast.loading("Uploading securely...", { id: "upload-toast" });
      
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', safeContentType);
        
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress((e.loaded / e.total) * 100);
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(true);
          else reject(new Error('Upload failed with status ' + xhr.status));
        };
        
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });
      
      toast.loading("Finalizing document...", { id: "upload-toast" });

      let existingDocId: string | null = null;
      let versionNum = 1;
      
      const q = query(collection(db, "secure_documents"), 
        where("name", "==", safeDocName), 
        where("category", "==", category),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        existingDocId = querySnapshot.docs[0].id;
        versionNum = (querySnapshot.docs[0].data().versions?.length || 1) + 1;
      }
      
      const uploaderUid = auth.currentUser!.uid;
      const uploaderEmail = auth.currentUser!.email || "unknown";
      
      const newVersionData = {
        filePath,
        fileName: file.name,
        size: file.size,
        uploadedAt: new Date(),
        version: versionNum
      };

      if (existingDocId) {
        const docRef = doc(db, "secure_documents", existingDocId);
        const existingData = (await getDoc(docRef)).data()!;
        await updateDoc(docRef, {
          filePath,
          fileName: file.name,
          fileHash,
          size: file.size,
          uploadedAt: serverTimestamp(),
          status: 'active',
          uploadType,
          imageLocation: uploadType === 'Image' ? imageLocation : null,
          versions: [...(existingData.versions || []), newVersionData]
        });
      } else {
        await addDoc(collection(db, "secure_documents"), {
          name: safeDocName,
          name_lowercase: safeDocName.toLowerCase(),
          category,
          coordinator: uploaderEmail,
          uploader_uid: uploaderUid,
          filePath,
          fileName: file.name,
          fileHash,
          size: file.size,
          uploadedAt: serverTimestamp(),
          status: 'active',
          uploadType,
          imageLocation: uploadType === 'Image' ? imageLocation : null,
          versions: [newVersionData]
        });
      }

      toast.success(`Document securely uploaded (v${versionNum})`, { id: "upload-toast" });
      setUploading(false);
      setFile(null);
      setDocName("");
      setProgress(0);

    } catch (e: any) {
      toast.error(e.message || "Upload failed.", { id: "upload-toast" });
      setUploading(false);
      setProgress(0);
    }
  };

  // -- User Creation Logic --
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (newUser.roles.length === 0) {
      toast.error("Please select at least one role.");
      return;
    }
    setIsCreatingUser(true);
    const toastId = toast.loading("Creating user & assigning roles...");
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/vault-assign-role", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ ...newUser, roles: newUser.roles })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`User ${newUser.name} created with role(s): ${newUser.roles.join(', ')}`, { id: toastId });
      setNewUser({ name: "", email: "", password: "", roles: ["coordinator"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to create user", { id: toastId });
    } finally {
      setIsCreatingUser(false);
    }
  };

  // -- View Logic --
  const fetchDocuments = () => {
    const q = query(collection(db, "secure_documents"), orderBy("uploadedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDocuments(docsData);
      setLoadingDocs(false);
    }, (error) => {
      console.error("Error fetching docs:", error);
      toast.error("Failed to load documents.");
      setLoadingDocs(false);
    });
    return unsubscribe;
  };

  const handleDownload = async (docData: any, forceDownload = false) => {
    const loadingToast = toast.loading("Generating secure URL...");
    
    // Safari fix: open window synchronously before async operations
    const newWindow = window.open("about:blank", "_blank");
    
    try {
      if (!auth.currentUser) throw new Error("Session expired.");
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/vault-download", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ 
          filePath: docData.filePath, 
          documentId: docData.id,
          fileName: docData.name,
          forceDownload
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Secure link generated!", { id: loadingToast });
      
      if (newWindow) {
        newWindow.location.href = data.downloadUrl;
      } else {
        // Fallback if popup was completely blocked
        window.location.href = data.downloadUrl;
      }
    } catch (e: any) {
      if (newWindow) newWindow.close();
      toast.error(e.message || "Failed to generate URL.", { id: loadingToast });
    }
  };

  const handleSoftDelete = async (docId: string) => {
    if (!confirm("Move this document to the trash? (It will be kept for 30 days)")) return;
    try {
      await updateDoc(doc(db, "secure_documents", docId), {
        status: 'trashed',
        deletedAt: serverTimestamp()
      });
      toast.success("Document moved to trash.");
      await addDoc(collection(db, "audit_logs"), {
        action: 'SOFT_DELETE',
        user: auth.currentUser?.uid,
        time: serverTimestamp(),
        documentId: docId
      });
    } catch (e: any) {
      toast.error("Failed to delete document.");
    }
  };

  const handleRestore = async (docId: string) => {
    if (!confirm("Restore this document?")) return;
    try {
      await updateDoc(doc(db, "secure_documents", docId), {
        status: 'active',
        deletedAt: deleteField()
      });
      toast.success("Document restored successfully.");
      await addDoc(collection(db, "audit_logs"), {
        action: 'RESTORE',
        user: auth.currentUser?.uid,
        time: serverTimestamp(),
        documentId: docId
      });
    } catch (e: any) {
      toast.error("Failed to restore document.");
    }
  };

  const handleHardDelete = async (docId: string) => {
    if (!confirm("WARNING: This will permanently delete the document from the database. This action cannot be undone. Proceed?")) return;
    try {
      await deleteDoc(doc(db, "secure_documents", docId));
      toast.success("Document permanently deleted.");
      await addDoc(collection(db, "audit_logs"), {
        action: 'HARD_DELETE',
        user: auth.currentUser?.uid,
        time: serverTimestamp(),
        documentId: docId
      });
    } catch (e: any) {
      toast.error("Failed to permanently delete document.");
    }
  };

  // Enhanced Sorting & Filtering
  let filteredDocs = documents.filter(doc => {
    if (showTrashed ? doc.status !== 'trashed' : doc.status === 'trashed') return false;
    if (filterCategory !== "All" && doc.category !== filterCategory) return false;
    if (filterUploadType !== "All" && (doc.uploadType || 'Document') !== filterUploadType) return false;
    if (filterUploadType === "Image" && filterGeoTag !== "All" && doc.imageLocation !== filterGeoTag) return false;
    if (searchQuery && !doc.name_lowercase?.includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  filteredDocs = filteredDocs.sort((a, b) => {
    switch (sortOrder) {
      case "Oldest": return (a.uploadedAt?.toMillis() || 0) - (b.uploadedAt?.toMillis() || 0);
      case "Largest": return b.size - a.size;
      case "Smallest": return a.size - b.size;
      case "Name A-Z": return a.name.localeCompare(b.name);
      case "Latest":
      default:
        return (b.uploadedAt?.toMillis() || 0) - (a.uploadedAt?.toMillis() || 0);
    }
  });

  const getLimitLabel = () => {
    if (category === 'Reports') return "Maximum 100 MB";
    if (uploadType === 'Image') return "Maximum 50 MB";
    return "Maximum 10 MB";
  };

  return (
    <AdminShell title="Enterprise Vault" subtitle="Role-Based Secure Document Management.">
      <div className="max-w-5xl mx-auto space-y-8 pb-12 relative z-10">
        
        {/* Animated Background Decor */}
        <div className="fixed top-20 right-0 w-[500px] h-[500px] bg-blue-400/20 rounded-full blur-[120px] pointer-events-none -z-10 mix-blend-multiply" />
        <div className="fixed bottom-0 left-20 w-[400px] h-[400px] bg-emerald-400/20 rounded-full blur-[100px] pointer-events-none -z-10 mix-blend-multiply" />

        {/* Tabs - Liquid Glass */}
        <div className={`flex gap-3 p-2 w-fit flex-wrap ${glassCard} border-white/60`}>
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-6 py-2.5 rounded-[16px] text-sm font-bold flex items-center gap-2 transition-all duration-300 ${activeTab === "upload" ? "bg-white/80 shadow-md text-[#5a2c14]" : "text-[#7a4020] hover:bg-white/40 hover:text-[#5a2c14]"}`}
          >
            <UploadCloud className="w-4 h-4" /> Coordinator Upload
          </button>
          <button
            onClick={() => { setActiveTab("view"); if (currentUserRole === 'super_admin') fetchDocuments(); }}
            className={`px-6 py-2.5 rounded-[16px] text-sm font-bold flex items-center gap-2 transition-all duration-300 ${activeTab === "view" ? "bg-white/80 shadow-md text-[#5a2c14]" : "text-[#7a4020] hover:bg-white/40 hover:text-[#5a2c14]"}`}
          >
            <ShieldCheck className="w-4 h-4" /> Super Admin View
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-6 py-2.5 rounded-[16px] text-sm font-bold flex items-center gap-2 transition-all duration-300 ${activeTab === "users" ? "bg-white/80 shadow-md text-[#5a2c14]" : "text-[#7a4020] hover:bg-white/40 hover:text-[#5a2c14]"}`}
          >
            <Users className="w-4 h-4" /> User Management
          </button>
        </div>

        <div className={`${glassCard} overflow-hidden relative min-h-[500px]`}>
          <AnimatePresence mode="wait">
            {!currentUserRole ? (
              <motion.div 
                key="locked"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 flex flex-col items-center justify-center p-8 glass-card-hero z-10"
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-24 h-24 glass-card-hero border border-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.05)] rounded-full flex items-center justify-center mb-6"
                >
                  <Lock className="w-12 h-12 text-[#5a2c14]" />
                </motion.div>
                <h3 className="text-3xl font-bold text-[#2c1208] mb-2 tracking-tight">Vault Locked</h3>
                <p className="text-[#7a4020] text-center mb-8 max-w-sm font-medium">
                  Sign in with your authorized {activeTab === "upload" ? "Coordinator" : "Super Admin"} credentials to access the secure enterprise module.
                </p>
                <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-sm">
                  <Input 
                    type="email" 
                    placeholder="Email address" 
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    required
                    className={`${glassInput} h-12`}
                  />
                  <Input 
                    type="password" 
                    placeholder="Password" 
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                    className={`${glassInput} h-12`}
                  />
                  <Button type="submit" variant="liquidGlassDark" disabled={isAuthenticating} className="h-12 text-base mt-2 rounded-[16px]">
                    {isAuthenticating ? "Authenticating..." : "Unlock Vault"}
                  </Button>
                </form>
              </motion.div>
            ) : (
              <motion.div 
                key="unlocked"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-8 sm:p-10"
              >
                <div className="flex items-center justify-between border-b border-[#5a2c14]/10 pb-6 mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 glass-card-hero shadow-sm border border-white/80 rounded-[16px] flex items-center justify-center">
                      <Unlock className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#2c1208] text-2xl tracking-tight">
                        {activeTab === "upload" ? "Secure Upload Area" : 
                         activeTab === "users" ? "User Management" : "Secure Document Viewer"}
                      </h3>
                      <p className="text-sm text-emerald-700 font-semibold flex items-center gap-1.5 mt-1">
                        <CheckCircle2 className="w-4 h-4" /> Authenticated as {auth.currentUser?.email}
                      </p>
                    </div>
                  </div>
                  <Button variant="liquidGlassWhite" onClick={lockVault} className="text-[#7a4020] rounded-[16px]">
                    <Lock className="w-4 h-4 mr-2" /> Lock Vault
                  </Button>
                </div>

                {activeTab === "upload" && (
                  <form onSubmit={handleUpload} className="max-w-2xl mx-auto space-y-8">
                    
                    {/* Step 1: Upload Type & Category */}
                    <div className={`p-6 ${glassPanel} space-y-6`}>
                      <div className="grid sm:grid-cols-2 gap-6">
                        <div className="grid gap-2">
                          <Label className="text-sm font-semibold text-[#5a2c14]">Upload Type</Label>
                          <Select value={uploadType} onValueChange={(v: "Document" | "Image") => { setUploadType(v); setFile(null); if(v==='Document') setImageLocation('Non Geo-tagged'); }}>
                            <SelectTrigger className={glassInput}>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent className="bg-white/90 backdrop-blur-xl border-white/40 rounded-xl">
                              <SelectItem value="Document">📄 Document</SelectItem>
                              <SelectItem value="Image">🖼 Image</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-sm font-semibold text-[#5a2c14]">Category</Label>
                          <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className={glassInput}>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent className="bg-white/90 backdrop-blur-xl border-white/40 rounded-xl">
                              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Step 2: Image Location (Only if Image) */}
                      <AnimatePresence>
                        {uploadType === "Image" && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="grid gap-3 pt-2"
                          >
                            <Label className="text-sm font-semibold text-[#5a2c14]">Image Location Metadata</Label>
                            <div className="flex gap-4">
                              <label className={`flex-1 flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${imageLocation === "Geo-tagged" ? "bg-emerald-50/50 border-emerald-200 shadow-sm" : "glass-card-hero border-white/60 hover:bg-white/60"}`}>
                                <input type="radio" name="imageLocation" value="Geo-tagged" checked={imageLocation === "Geo-tagged"} onChange={() => setImageLocation("Geo-tagged")} className="hidden" />
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${imageLocation === "Geo-tagged" ? "border-emerald-500" : "border-gray-300"}`}>
                                  {imageLocation === "Geo-tagged" && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />}
                                </div>
                                <span className="font-semibold text-emerald-800 flex items-center gap-2"><MapPin className="w-4 h-4" /> Geo-tagged</span>
                              </label>
                              <label className={`flex-1 flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${imageLocation === "Non Geo-tagged" ? "bg-amber-50/50 border-amber-200 shadow-sm" : "glass-card-hero border-white/60 hover:bg-white/60"}`}>
                                <input type="radio" name="imageLocation" value="Non Geo-tagged" checked={imageLocation === "Non Geo-tagged"} onChange={() => setImageLocation("Non Geo-tagged")} className="hidden" />
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${imageLocation === "Non Geo-tagged" ? "border-amber-500" : "border-gray-300"}`}>
                                  {imageLocation === "Non Geo-tagged" && <div className="w-2.5 h-2.5 bg-amber-500 rounded-full" />}
                                </div>
                                <span className="font-semibold text-amber-800 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Non Geo-tagged</span>
                              </label>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Step 3: Document Name & File */}
                    <div className={`p-6 ${glassPanel} space-y-6`}>
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold text-[#5a2c14]">File Name</Label>
                        <Input 
                          required 
                          placeholder="e.g. Induction Guidelines 2026" 
                          value={docName}
                          onChange={(e) => setDocName(e.target.value)}
                          className={glassInput}
                        />
                        <p className="text-xs text-[#7a4020]/80">Uploading a file with the exact same name and category automatically creates a new version.</p>
                      </div>
                      
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold text-[#5a2c14]">Upload File</Label>
                          <span className="text-xs font-bold px-2.5 py-1 bg-[#5a2c14]/10 text-[#5a2c14] rounded-full">
                            {getLimitLabel()}
                          </span>
                        </div>
                        <label 
                          className={`border-2 border-dashed ${file ? 'border-emerald-400 bg-emerald-50/30' : 'border-[#8a4a22]/30 bg-white/20'} rounded-[20px] p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-white/40 transition-all group`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.preventDefault(); handleFileChange(e.dataTransfer.files?.[0] || null); }}
                        >
                          <UploadCloud className={`w-12 h-12 mb-4 transition-transform group-hover:scale-110 ${file ? 'text-emerald-500' : 'text-[#8a4a22]/50'}`} />
                          <span className="text-base font-bold text-[#5a2c14] mb-1">Drag & Drop or Click to Browse</span>
                          <span className="text-sm text-[#7a4020] font-medium">
                            {file ? file.name : (uploadType === 'Image' ? 'JPG, PNG, WEBP' : 'PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX')}
                          </span>
                          <input 
                            type="file" 
                            className="hidden" 
                            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                            accept={uploadType === 'Image' ? '.png,.jpg,.jpeg,.webp,.gif' : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx'}
                          />
                        </label>
                      </div>
                    </div>

                    {uploading && (
                      <div className={`p-6 ${glassPanel}`}>
                        <div className="flex justify-between items-center mb-2 text-sm font-bold text-[#5a2c14]">
                          <span>Uploading...</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-black/5 rounded-full h-3 overflow-hidden shadow-inner">
                          <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full transition-all duration-300 relative" style={{ width: `${progress}%` }}>
                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-2 text-xs text-[#7a4020] font-medium">
                          <span>{file ? (file.size / 1024 / 1024).toFixed(2) : 0} MB Total</span>
                          <span>Please wait...</span>
                        </div>
                      </div>
                    )}

                    <Button 
                      type="submit" 
                      variant="liquidGlassDark" 
                      className="w-full h-14 text-lg rounded-[16px] shadow-lg shadow-black/10" 
                      disabled={uploading || !file || !docName}
                    >
                      {uploading ? `Processing...` : "Secure Upload & Audit"}
                    </Button>
                  </form>
                )}

                {activeTab === "users" && (
                  <div className={`max-w-md mx-auto p-8 ${glassPanel} space-y-6`}>
                    <div>
                      <h4 className="font-bold text-2xl text-[#2c1208]">Add New User</h4>
                      <p className="text-sm text-[#7a4020] font-medium mt-1">Create a new coordinator or super admin securely.</p>
                    </div>
                    <form onSubmit={handleCreateUser} className="space-y-5">
                      <div className="space-y-2">
                        <Label className="font-semibold text-[#5a2c14]">Name</Label>
                        <Input 
                          required 
                          placeholder="e.g. John Doe"
                          value={newUser.name}
                          onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                          className={glassInput}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-semibold text-[#5a2c14]">Email</Label>
                        <Input 
                          required 
                          type="email"
                          placeholder="john@example.com"
                          value={newUser.email}
                          onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                          className={glassInput}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-semibold text-[#5a2c14]">Password</Label>
                        <Input 
                          required 
                          type="password"
                          placeholder="Minimum 6 characters"
                          value={newUser.password}
                          onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                          className={glassInput}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-semibold text-[#5a2c14]">Roles</Label>
                        <p className="text-xs text-[#7a4020]">Select one or both roles for this user.</p>
                        <div className="flex flex-col gap-3 pt-1">
                          {[
                            { id: 'coordinator', label: 'Coordinator', desc: 'Can upload documents & images' },
                            { id: 'super_admin', label: 'Super Admin', desc: 'Full access — view, download, manage users' },
                          ].map(({ id, label, desc }) => (
                            <label
                              key={id}
                              className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                                newUser.roles.includes(id)
                                  ? 'bg-[#8a2c14]/10 border-[#8a2c14]/40'
                                  : 'bg-white/20 border-white/40 hover:bg-white/30'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 accent-[#8a2c14] w-4 h-4 shrink-0"
                                checked={newUser.roles.includes(id)}
                                onChange={(e) => {
                                  const updated = e.target.checked
                                    ? [...newUser.roles, id]
                                    : newUser.roles.filter(r => r !== id);
                                  setNewUser({ ...newUser, roles: updated });
                                }}
                              />
                              <div>
                                <div className="font-semibold text-[#2c1208] text-sm">{label}</div>
                                <div className="text-xs text-[#7a4020]">{desc}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <Button 
                        type="submit" 
                        variant="liquidGlassDark" 
                        className="w-full h-12 rounded-[16px] text-base shadow-md"
                        disabled={isCreatingUser || !newUser.name || !newUser.email || !newUser.password || newUser.roles.length === 0}
                      >
                        {isCreatingUser ? "Creating..." : "Create User & Assign Role"}
                      </Button>
                    </form>
                  </div>
                )}

                {activeTab === "view" && (
                  <div className="space-y-8">
                    {/* Search and Filters - Liquid Glass Redesign */}
                    <div className={`p-4 ${glassPanel} flex flex-col gap-3`}>
                      {/* Row 1: Search */}
                      <div className="relative w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8a4a22]/50 pointer-events-none" />
                        <Input 
                          placeholder="Search documents by name..." 
                          className={`pl-12 h-12 text-base w-full ${glassInput}`}
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                        />
                      </div>
                      
                      {/* Row 2: Filters + Toggle */}
                      <div className="flex flex-wrap gap-3 items-center">
                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                          <SelectTrigger className={`h-11 min-w-[140px] flex-1 ${glassInput} [&>span]:flex [&>span]:items-center [&>span]:gap-2`}>
                            <div className="flex items-center gap-2 text-sm">
                              <LayoutGrid className="w-4 h-4 shrink-0 opacity-50" />
                              <SelectValue placeholder="All Categories" />
                            </div>
                          </SelectTrigger>
                          <SelectContent className="bg-white/90 backdrop-blur-xl rounded-xl">
                            <SelectItem value="All">All Categories</SelectItem>
                            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>

                        <Select value={filterUploadType} onValueChange={(v) => { setFilterUploadType(v); setFilterGeoTag("All"); }}>
                          <SelectTrigger className={`h-11 min-w-[130px] flex-1 ${glassInput}`}>
                            <div className="flex items-center gap-2 text-sm">
                              <FileType2 className="w-4 h-4 shrink-0 opacity-50" />
                              <SelectValue placeholder="All Types" />
                            </div>
                          </SelectTrigger>
                          <SelectContent className="bg-white/90 backdrop-blur-xl rounded-xl">
                            <SelectItem value="All">All Types</SelectItem>
                            <SelectItem value="Document">📄 Documents</SelectItem>
                            <SelectItem value="Image">🖼️ Images</SelectItem>
                          </SelectContent>
                        </Select>

                        {filterUploadType === "Image" && (
                          <Select value={filterGeoTag} onValueChange={setFilterGeoTag}>
                            <SelectTrigger className={`h-11 min-w-[140px] flex-1 ${glassInput}`}>
                              <div className="flex items-center gap-2 text-sm">
                                <MapPin className="w-4 h-4 shrink-0 opacity-50" />
                                <SelectValue placeholder="All Locations" />
                              </div>
                            </SelectTrigger>
                            <SelectContent className="bg-white/90 backdrop-blur-xl rounded-xl">
                              <SelectItem value="All">All Locations</SelectItem>
                              <SelectItem value="Geo-tagged">📍 Geo-tagged</SelectItem>
                              <SelectItem value="Non Geo-tagged">📌 Non Geo-tagged</SelectItem>
                            </SelectContent>
                          </Select>
                        )}

                        <Select value={sortOrder} onValueChange={setSortOrder}>
                          <SelectTrigger className={`h-11 min-w-[130px] flex-1 ${glassInput}`}>
                            <div className="flex items-center gap-2 text-sm">
                              <ArrowUpDown className="w-4 h-4 shrink-0 opacity-50" />
                              <SelectValue placeholder="Latest First" />
                            </div>
                          </SelectTrigger>
                          <SelectContent className="bg-white/90 backdrop-blur-xl rounded-xl">
                            <SelectItem value="Latest">Latest First</SelectItem>
                            <SelectItem value="Oldest">Oldest First</SelectItem>
                            <SelectItem value="Largest">Largest Size</SelectItem>
                            <SelectItem value="Smallest">Smallest Size</SelectItem>
                            <SelectItem value="Name A-Z">Name A-Z</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button 
                          variant={showTrashed ? "destructive" : "liquidGlassWhite"}
                          onClick={() => setShowTrashed(!showTrashed)}
                          className={`h-11 px-5 rounded-xl whitespace-nowrap ${showTrashed ? 'shadow-md' : ''}`}
                        >
                          {showTrashed ? "View Active" : "View Trash"}
                        </Button>
                      </div>
                    </div>

                    {loadingDocs ? (
                      <div className="animate-pulse space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className={`h-24 ${glassPanel} w-full`} />)}
                      </div>
                    ) : filteredDocs.length === 0 ? (
                      <div className={`text-center py-20 ${glassPanel} flex flex-col items-center justify-center`}>
                        <div className="w-24 h-24 bg-white/40 rounded-full flex items-center justify-center mb-6 shadow-sm border border-white/60">
                          <Search className="w-10 h-10 text-[#8a4a22]/30" />
                        </div>
                        <h4 className="text-2xl font-bold text-[#2c1208] mb-2">No documents uploaded yet</h4>
                        <p className="text-[#7a4020] mb-6 font-medium">Try adjusting your filters or upload a new document.</p>
                        <Button variant="liquidGlassDark" onClick={() => {
                          setSearchQuery("");
                          setFilterCategory("All");
                          setFilterUploadType("All");
                          setShowTrashed(false);
                          if (!searchQuery && filterCategory === "All" && filterUploadType === "All" && !showTrashed) {
                             setActiveTab("upload");
                          }
                        }}>
                          {searchQuery || filterCategory !== "All" || filterUploadType !== "All" || showTrashed ? "Clear Filters" : "Upload Document"}
                        </Button>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        <AnimatePresence>
                          {filteredDocs.map((doc) => (
                            <motion.div 
                              layout
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.98 }}
                              key={doc.id} 
                              className={`flex flex-col md:flex-row md:items-center justify-between p-5 rounded-[20px] transition-all duration-300 group ${showTrashed ? 'bg-red-50/50 border border-red-200 shadow-sm' : `${glassPanel} hover:bg-white/50 hover:shadow-lg hover:-translate-y-0.5`} gap-4`}
                            >
                              <div className="flex items-start gap-5">
                                <div className={`w-14 h-14 rounded-[16px] flex items-center justify-center shrink-0 shadow-sm ${showTrashed ? 'bg-red-100' : 'bg-gradient-to-br from-white to-black/5 border border-white/60'}`}>
                                  {doc.uploadType === 'Image' ? 
                                    <ImageIcon className={`w-7 h-7 ${showTrashed ? 'text-red-600' : 'text-blue-600'}`} /> : 
                                    <FileText className={`w-7 h-7 ${showTrashed ? 'text-red-600' : 'text-[#5a2c14]'}`} />
                                  }
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <h4 className="font-bold text-[#2c1208] text-lg">{doc.name}</h4>
                                    
                                    {/* Badges */}
                                    {doc.versions?.length > 1 && (
                                      <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                                        v{doc.versions.length}
                                      </span>
                                    )}
                                    <span className="text-[10px] bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full font-bold border border-purple-200">
                                      {doc.category}
                                    </span>
                                    <span className="text-[10px] bg-zinc-100 text-zinc-800 px-2.5 py-0.5 rounded-full font-bold border border-zinc-200">
                                      {doc.uploadType === 'Image' ? '🖼 Image' : '📄 Document'}
                                    </span>
                                    {doc.uploadType === 'Image' && doc.imageLocation && (
                                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${doc.imageLocation === 'Geo-tagged' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                                        {doc.imageLocation === 'Geo-tagged' ? '🟢 Geo-tagged' : '🟠 Non Geo-tagged'}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-[#7a4020] mt-2">
                                    <span className="flex items-center gap-1.5 bg-white/40 px-2 py-1 rounded-md border border-white/50"><Users className="w-3.5 h-3.5" /> {doc.coordinator}</span>
                                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {doc.uploadedAt?.toDate().toLocaleDateString() || "Just now"}</span>
                                    <span className="font-semibold text-[#5a2c14]">{(doc.size / 1024 / 1024).toFixed(2)} MB</span>
                                    {showTrashed && doc.deletedAt && (
                                      <span className="text-red-600 font-bold bg-red-100 px-2 py-0.5 rounded-md">Deleted: {doc.deletedAt.toDate().toLocaleDateString()}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 self-end md:self-center opacity-100 transition-opacity">
                                {!showTrashed ? (
                                  <>
                                    <Button variant="liquidGlassWhite" size="sm" onClick={() => handleDownload(doc, true)} className="rounded-xl shadow-sm text-[#5a2c14]">
                                      <Download className="w-4 h-4 mr-2" /> Download
                                    </Button>
                                    <Button variant="liquidGlassMaroon" size="sm" onClick={() => handleDownload(doc, false)} className="rounded-xl shadow-sm">
                                      <Eye className="w-4 h-4 mr-2" /> View
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleSoftDelete(doc.id)} className="rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 shadow-sm border border-transparent hover:border-red-100 bg-white/40">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button variant="liquidGlassWhite" size="sm" onClick={() => handleRestore(doc.id)} className="rounded-xl shadow-sm text-[#5a2c14]">
                                      <RefreshCw className="w-4 h-4 mr-2" /> Restore
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleHardDelete(doc.id)} className="rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 shadow-sm border border-transparent hover:border-red-100 bg-white/40">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AdminShell>
  );
}
