import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Unlock, UploadCloud, FileText, Download, ShieldCheck, CheckCircle2, Clock, Trash2, Search, History, Users } from "lucide-react";
import { db, auth } from "@/lib/firebase/config";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, getDocs, where, limit } from "firebase/firestore";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/admin/documents")({
  component: AdminDocumentsPage,
});

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const CATEGORIES = ["Orientation", "Guidelines", "Schedules", "Reports", "Other"];

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
  
  // PDF: 25504446
  // JPEG: FFD8FF
  // PNG: 89504E47
  // DOCX/XLSX (ZIP): 504B0304
  // DOC/XLS (OLE): D0CF11E0
  
  const validSignatures = ['25504446', 'FFD8FF', '89504E47', '504B0304', 'D0CF11E0'];
  return validSignatures.some(sig => hex.startsWith(sig));
}

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
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // View State
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [showTrashed, setShowTrashed] = useState(false);

  // User Management State
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "coordinator" });
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // -- Security Functions --
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) return;

    setIsAuthenticating(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, emailInput, passwordInput);
      
      // Fetch user role from Firebase Auth Custom Claims by forcing a token refresh
      const tokenResult = await userCredential.user.getIdTokenResult(true);
      const role = tokenResult.claims.role as "coordinator" | "super_admin";
      
      if (!role) {
        throw new Error("User role not configured. Ask super admin for access.");
      }

      if (activeTab === "upload" && role !== "coordinator" && role !== "super_admin") {
        throw new Error("You do not have coordinator access.");
      }
      if ((activeTab === "view" || activeTab === "users") && role !== "super_admin") {
        throw new Error("You do not have super admin access.");
      }

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
    await signOut(auth);
  };

  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lockVault();
      toast("Vault Locked automatically due to inactivity.");
    }, LOCK_TIMEOUT_MS);
  };

  useEffect(() => {
    const handleActivity = () => {
      if (currentUserRole) startTimer();
    };
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  });

  // -- Upload Logic (Rate Limiting, Folder Hierarchy, Versioning, Magic Bytes, Hashing) --
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !docName || !auth.currentUser) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is too large (max 10MB).");
      return;
    }

    // 1. Magic Bytes Validation
    const isValidMagic = await checkMagicBytes(file);
    if (!isValidMagic) {
      toast.error("Security Alert: Invalid file signature detected. Possible spoofed extension.");
      return;
    }

    setUploading(true);
    startTimer();
    toast.loading("Analyzing file for duplicates...", { id: "upload-toast" });

    try {
      // 2. Hash file
      const fileHash = await calculateHash(file);
      
      const safeDocName = docName.trim();
      const token = await auth.currentUser.getIdToken();
      
      // 3. Init Upload (Backend Cooldown & Audit & Duplicate Check & Signed URL)
      const initRes = await fetch('/api/vault-init-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          filename: file.name, 
          fileSize: file.size, 
          fileHash, 
          category,
          contentType: file.type || 'application/octet-stream'
        })
      });
      
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error);
      
      const { uploadUrl, filePath } = initData;
      
      toast.loading("Uploading securely...", { id: "upload-toast" });
      
      // 4. Upload to Signed URL using XMLHttpRequest for progress
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        
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

      // 5. Version History Check and Save to Firestore
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
          fileHash, // Update with latest hash
          size: file.size,
          uploadedAt: serverTimestamp(),
          status: 'active',
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
    
    setIsCreatingUser(true);
    const toastId = toast.loading("Creating user & assigning roles...");
    
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/vault-assign-role", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(newUser)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      toast.success(`User ${newUser.name} created successfully!`, { id: toastId });
      setNewUser({ name: "", email: "", password: "", role: "coordinator" });
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
      const docsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setDocuments(docsData);
      setLoadingDocs(false);
    }, (error) => {
      console.error("Error fetching docs:", error);
      toast.error("Failed to load documents.");
      setLoadingDocs(false);
    });
    return unsubscribe;
  };

  const handleDownload = async (docData: any) => {
    const loadingToast = toast.loading("Generating secure URL...");
    try {
      if (!auth.currentUser) throw new Error("Session expired.");
      const token = await auth.currentUser.getIdToken();
      
      const res = await fetch("/api/vault-download", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ filePath: docData.filePath, documentId: docData.id })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Secure link generated!", { id: loadingToast });
      window.open(data.url, "_blank");
    } catch (e: any) {
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

  const filteredDocs = documents.filter(doc => {
    if (showTrashed ? doc.status !== 'trashed' : doc.status === 'trashed') return false;
    if (filterCategory !== "All" && doc.category !== filterCategory) return false;
    if (searchQuery && !doc.name_lowercase?.includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <AdminShell title="Enterprise Vault" subtitle="Role-Based Secure Document Management.">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-black/5 rounded-xl w-fit flex-wrap">
          <button
            onClick={() => { setActiveTab("upload"); lockVault(); }}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === "upload" ? "bg-white shadow-sm text-[#5a2c14]" : "text-[#7a4020] hover:text-[#5a2c14]"}`}
          >
            <UploadCloud className="w-4 h-4" /> Coordinator Upload
          </button>
          <button
            onClick={() => { setActiveTab("view"); lockVault(); }}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === "view" ? "bg-white shadow-sm text-[#5a2c14]" : "text-[#7a4020] hover:text-[#5a2c14]"}`}
          >
            <ShieldCheck className="w-4 h-4" /> Super Admin View
          </button>
          <button
            onClick={() => { setActiveTab("users"); lockVault(); }}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === "users" ? "bg-white shadow-sm text-[#5a2c14]" : "text-[#7a4020] hover:text-[#5a2c14]"}`}
          >
            <Users className="w-4 h-4" /> User Management
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-[#8a4a22]/10 overflow-hidden shadow-sm relative min-h-[400px]">
          <AnimatePresence mode="wait">
            {!currentUserRole ? (
              <motion.div 
                key="locked"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-zinc-50/90 backdrop-blur-md z-10"
              >
                <div className="w-20 h-20 bg-[#5a2c14]/10 rounded-full flex items-center justify-center mb-6">
                  <Lock className="w-10 h-10 text-[#5a2c14]" />
                </div>
                <h3 className="text-2xl font-bold text-[#2c1208] mb-2">Vault Locked</h3>
                <p className="text-[#7a4020] text-center mb-8 max-w-sm">
                  Sign in with your authorized {activeTab === "upload" ? "Coordinator" : "Super Admin"} email and password.
                </p>
                <form onSubmit={handleLogin} className="flex flex-col gap-3 w-full max-w-xs">
                  <Input 
                    type="email" 
                    placeholder="Email address" 
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    required
                  />
                  <Input 
                    type="password" 
                    placeholder="Password" 
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                  />
                  <Button type="submit" variant="liquidGlassDark" disabled={isAuthenticating} className="mt-2">
                    {isAuthenticating ? "Authenticating..." : "Unlock Vault"}
                  </Button>
                </form>
              </motion.div>
            ) : (
              <motion.div 
                key="unlocked"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 sm:p-8"
              >
                <div className="flex items-center justify-between border-b border-[#8a4a22]/10 pb-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                      <Unlock className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#2c1208] text-lg">
                        {activeTab === "upload" ? "Secure Upload Area" : 
                         activeTab === "users" ? "User Management" : "Secure Document Viewer"}
                      </h3>
                      <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Signed in as {auth.currentUser?.email}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={lockVault} className="text-[#7a4020]">
                    Lock Vault
                  </Button>
                </div>

                {activeTab === "upload" && (
                  <form onSubmit={handleUpload} className="max-w-xl mx-auto space-y-6">
                    <div className="grid gap-2">
                      <Label>Document Name</Label>
                      <Input 
                        required 
                        placeholder="e.g. Induction Guidelines 2026" 
                        value={docName}
                        onChange={(e) => setDocName(e.target.value)}
                      />
                      <p className="text-[10px] text-muted-foreground">Uploading a document with the exact same name and category will automatically create a new version.</p>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label>Category / Folder</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label>File (Max 10MB: PDF, Doc, Image)</Label>
                      <label className="border-2 border-dashed border-[#8a4a22]/20 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-black/[0.02] transition-colors">
                        <UploadCloud className="w-10 h-10 text-[#8a4a22]/40 mb-4" />
                        <span className="text-sm font-semibold text-[#5a2c14]">Click to browse</span>
                        <span className="text-xs text-[#7a4020] mt-1">{file ? file.name : "Securely encrypted upload"}</span>
                        <input 
                          type="file" 
                          className="hidden" 
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xls,.xlsx"
                        />
                      </label>
                    </div>

                    {uploading && (
                      <div className="w-full bg-black/5 rounded-full h-2 mt-4 overflow-hidden">
                        <div className="bg-[#5a2c14] h-full transition-all duration-300" style={{ width: `${progress}%` }} />
                      </div>
                    )}

                    <Button 
                      type="submit" 
                      variant="liquidGlassDark" 
                      className="w-full h-12" 
                      disabled={uploading || !file || !docName}
                    >
                      {uploading ? `Uploading ${Math.round(progress)}%...` : "Secure Upload & Audit"}
                    </Button>
                  </form>
                )}

                {activeTab === "users" && (
                  <div className="max-w-md mx-auto space-y-6">
                    <div>
                      <h4 className="font-bold text-[#2c1208]">Add New User</h4>
                      <p className="text-sm text-[#7a4020]">Create a new coordinator or super admin.</p>
                    </div>
                    <form onSubmit={handleCreateUser} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input 
                          required 
                          placeholder="e.g. John Doe"
                          value={newUser.name}
                          onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input 
                          required 
                          type="email"
                          placeholder="john@example.com"
                          value={newUser.email}
                          onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Password</Label>
                        <Input 
                          required 
                          type="password"
                          placeholder="Minimum 6 characters"
                          value={newUser.password}
                          onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={newUser.role} onValueChange={(val) => setNewUser({...newUser, role: val})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="coordinator">Coordinator</SelectItem>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button 
                        type="submit" 
                        variant="liquidGlassDark" 
                        className="w-full"
                        disabled={isCreatingUser || !newUser.name || !newUser.email || !newUser.password}
                      >
                        {isCreatingUser ? "Creating..." : "Create User & Assign Role"}
                      </Button>
                    </form>
                  </div>
                )}

                {activeTab === "view" && (
                  <div className="space-y-6">
                    {/* Search and Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search documents..." 
                          className="pl-9"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <Select value={filterCategory} onValueChange={setFilterCategory}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All Categories</SelectItem>
                          {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button 
                        variant={showTrashed ? "destructive" : "outline"}
                        onClick={() => setShowTrashed(!showTrashed)}
                        className="w-full sm:w-auto"
                      >
                        {showTrashed ? "View Active" : "View Trash"}
                      </Button>
                    </div>

                    {loadingDocs ? (
                      <div className="animate-pulse space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-black/5 rounded-xl w-full" />)}
                      </div>
                    ) : filteredDocs.length === 0 ? (
                      <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-[#8a4a22]/30 mx-auto mb-4" />
                        <h4 className="font-bold text-[#5a2c14]">No documents found</h4>
                        <p className="text-sm text-[#7a4020]">Try adjusting your search or filters.</p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {filteredDocs.map((doc) => (
                          <div key={doc.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border ${showTrashed ? 'border-red-100 bg-red-50/30' : 'border-[#8a4a22]/10 bg-white hover:shadow-md'} transition-all gap-4`}>
                            <div className="flex items-start gap-4">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${showTrashed ? 'bg-red-100' : 'bg-[#5a2c14]/5'}`}>
                                <FileText className={`w-5 h-5 ${showTrashed ? 'text-red-600' : 'text-[#5a2c14]'}`} />
                              </div>
                              <div>
                                <h4 className="font-bold text-[#2c1208] flex items-center gap-2">
                                  {doc.name} 
                                  {doc.versions?.length > 1 && (
                                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                      <History className="w-3 h-3" /> v{doc.versions.length}
                                    </span>
                                  )}
                                  <span className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold">
                                    {doc.category}
                                  </span>
                                </h4>
                                <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-[#7a4020] mt-1">
                                  <span>By {doc.coordinator}</span>
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {doc.uploadedAt?.toDate().toLocaleDateString() || "Just now"}</span>
                                  <span>{(doc.size / 1024 / 1024).toFixed(2)} MB</span>
                                  {showTrashed && doc.deletedAt && (
                                    <span className="text-red-600 font-bold">Deleted: {doc.deletedAt.toDate().toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-center">
                              {!showTrashed && (
                                <>
                                  <Button variant="liquidGlassMaroon" size="sm" onClick={() => handleDownload(doc)}>
                                    <Download className="w-4 h-4 mr-2" /> View
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleSoftDelete(doc.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
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
