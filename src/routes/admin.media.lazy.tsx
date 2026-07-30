import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Gallery, Add, SearchNormal, Filter, ArrowDown2, DocumentUpload } from "iconsax-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, storage } from "@/lib/firebase/config";
import { collection, query, orderBy, limit, getDocs, startAfter, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createLazyFileRoute("/admin/media")({
  component: AdminMedia,
});

function AdminMedia() {
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  
  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  
  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async (isLoadMore = false) => {
    setLoading(true);
    try {
      let q = query(
        collection(db, "media_assets"),
        orderBy("created_at", "desc"),
        limit(24)
      );

      if (isLoadMore && lastDoc) {
        q = query(
          collection(db, "media_assets"),
          orderBy("created_at", "desc"),
          startAfter(lastDoc),
          limit(24)
        );
      }

      const snap = await getDocs(q);
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (docs.length < 24) setHasMore(false);

      if (isLoadMore) {
        setMedia(prev => [...prev, ...docs]);
      } else {
        setMedia(docs);
      }

      if (snap.docs.length > 0) {
        setLastDoc(snap.docs[snap.docs.length - 1]);
      }
    } catch (error) {
      console.error("Failed to fetch media:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    
    if (!uploadFile.type.startsWith('image/')) {
      alert('Please upload an image file');
      setIsUploading(false);
      return;
    }
    
    const assetId = crypto.randomUUID();
    const year = new Date().getFullYear().toString();
    const event = "induction"; 
    const storagePath = `media-library/homepage/memories/${year}/${event}/${assetId}/v1.${uploadFile.name.split('.').pop()}`;
    const storageRef = ref(storage, storagePath);
    
    const uploadTask = uploadBytesResumable(storageRef, uploadFile);
    
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Upload failed", error);
        setIsUploading(false);
        alert("Upload failed");
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        const docRef = doc(db, "media_assets", assetId);
        
        const newAsset = {
          title: uploadFile.name,
          url: downloadURL,
          thumbnail_url: downloadURL, // Will be updated by Cloud Function
          status: "PROCESSING",
          created_at: new Date().toISOString(),
          category: "",
          tags: [],
          keywords: [],
          event_name: event,
          academic_year: year,
          display_weight: 1,
          display_count: 0,
          click_count: 0
        };
        
        await setDoc(docRef, newAsset);
        
        setIsUploading(false);
        setIsUploadOpen(false);
        setUploadFile(null);
        setUploadProgress(0);
        
        fetchMedia();
        
        // Wait for processing to finish then refresh to show READY status
        try {
          await fetch('/api/media/process', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ assetId, path: storagePath })
          });
          fetchMedia();
        } catch (err) {
          console.error("Processing failed", err);
        }
      }
    );
  };

  
  const handleSaveMetadata = async () => {
    if (!selectedMedia) return;
    try {
      const docRef = doc(db, "media_assets", selectedMedia.id);
      await updateDoc(docRef, {
         title: selectedMedia.title,
         description: selectedMedia.description || "",
         category: selectedMedia.category || "",
         status: selectedMedia.status,
         display_weight: selectedMedia.display_weight || 1
      });
      setIsDetailOpen(false);
      setMedia(prev => prev.map(m => m.id === selectedMedia.id ? selectedMedia : m));
    } catch (e) {
       console.error("Failed to save", e);
    }
  };

  const handleDeleteAsset = async () => {
    if (!selectedMedia) return;
    if (!window.confirm("Are you sure you want to delete this asset? This cannot be undone.")) return;
    
    try {
      // 1. Delete from Firestore
      const docRef = doc(db, "media_assets", selectedMedia.id);
      await deleteDoc(docRef);
      
      // 2. Try to delete from Storage (fail silently if not found)
      try {
        if (selectedMedia.url) {
          const storageRef = ref(storage, selectedMedia.url);
          await deleteObject(storageRef);
        }
      } catch (storageErr) {
        console.warn("Storage delete failed or file not found", storageErr);
      }
      
      setIsDetailOpen(false);
      setMedia(prev => prev.filter(m => m.id !== selectedMedia.id));
    } catch (e) {
      console.error("Failed to delete", e);
      alert("Failed to delete asset");
    }
  };

  return (
    <AdminShell title="Media Library" subtitle="Manage all visual assets across the platform.">
      <div className="flex flex-col gap-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <SearchNormal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by title, tags, keywords, event..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 rounded-full border-white/20 bg-white/50 backdrop-blur-md"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-full h-10 gap-2 border-white/20 bg-white/50 shadow-sm">
              <Filter className="w-4 h-4" /> Filters <ArrowDown2 className="w-3 h-3" />
            </Button>
            <Button onClick={() => setIsUploadOpen(true)} className="rounded-full h-10 gap-2 bg-[#2c1208] text-white hover:bg-[#3c1608] shadow-md">
              <Add className="w-4 h-4" /> Upload Media
            </Button>
          </div>
        </div>

        {/* Gallery Grid */}
        <div className="glass-card-hero p-6 min-h-[400px]">
          {media.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center">
              <Gallery variant="TwoTone" className="w-12 h-12 text-[#8a4a22]/50 mb-3" />
              <h3 className="text-lg font-bold text-[#2c1208]">No media found</h3>
              <p className="text-sm text-[#7a4020]/70 max-w-sm mt-1">Upload your first image to start building the media library.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {media.map((item) => (
                  <div key={item.id} onClick={() => { setSelectedMedia(item); setIsDetailOpen(true); }} className="group relative aspect-square rounded-2xl overflow-hidden bg-black/5 border border-white/20 shadow-sm cursor-pointer hover:shadow-md transition-all">
                    <img src={item.thumbnail_url || item.url} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                      <p className="text-white font-semibold text-xs truncate">{item.title}</p>
                      <p className="text-white/70 text-[10px] uppercase font-bold tracking-wider mt-0.5">{item.status}</p>
                    </div>
                    {['UPLOADING', 'PROCESSING'].includes(item.status) && (
                      <div className="absolute top-2 left-2 bg-yellow-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm uppercase tracking-wider">Processing</div>
                    )}
                  </div>
                ))}
              </div>
              {hasMore && media.length > 0 && (
                <div className="mt-8 flex justify-center">
                  <Button 
                    variant="outline" 
                    onClick={() => fetchMedia(true)}
                    disabled={loading}
                    className="rounded-full bg-white/50 border-white/20"
                  >
                    {loading ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Upload Media Modal */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
            <DialogDescription>
              Upload a new asset to the media library. It will be processed automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50/50">
              <DocumentUpload className="w-8 h-8 text-gray-400 mb-2" />
              <Input
                type="file"
                accept="image/*"
                className="hidden"
                id="file-upload"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                disabled={isUploading}
              />
              <Label htmlFor="file-upload" className="cursor-pointer text-sm font-medium text-[#c87038] hover:text-[#8a4a22]">
                {uploadFile ? uploadFile.name : "Click to select file"}
              </Label>
              {!uploadFile && <p className="text-xs text-gray-500 mt-1">JPEG, PNG, WebP up to 10MB</p>}
            </div>
            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>Uploading...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadOpen(false)} disabled={isUploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!uploadFile || isUploading}>
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Asset Details</DialogTitle>
            <DialogDescription>
              Manage metadata and visibility for this asset.
            </DialogDescription>
          </DialogHeader>
          {selectedMedia && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              <div>
                <div className="aspect-square rounded-xl overflow-hidden bg-black/5 border border-white/20">
                  <img src={selectedMedia.url} alt={selectedMedia.title} className="w-full h-full object-cover" />
                </div>
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span className="font-semibold">ID:</span>
                    <span className="truncate max-w-[150px]">{selectedMedia.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">Event:</span>
                    <span>{selectedMedia.event_name} ({selectedMedia.academic_year})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">Status:</span>
                    <span className="uppercase font-bold text-[#c87038]">{selectedMedia.status}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input 
                    id="title" 
                    value={selectedMedia.title || ""} 
                    onChange={e => setSelectedMedia({...selectedMedia, title: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category (Chip)</Label>
                  <Input 
                    id="category" 
                    placeholder="e.g. ✨ First Day"
                    value={selectedMedia.category || ""} 
                    onChange={e => setSelectedMedia({...selectedMedia, category: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Visibility Status</Label>
                  <Select 
                    value={selectedMedia.status} 
                    onValueChange={(val) => setSelectedMedia({...selectedMedia, status: val})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PROCESSING">Processing</SelectItem>
                      <SelectItem value="READY">Ready</SelectItem>
                      <SelectItem value="PUBLISHED">Published</SelectItem>
                      <SelectItem value="HIDDEN">Hidden</SelectItem>
                      <SelectItem value="TRASH">Trash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Display Weight</Label>
                  <Input 
                    id="weight" 
                    type="number"
                    value={selectedMedia.display_weight || 1} 
                    onChange={e => setSelectedMedia({...selectedMedia, display_weight: parseInt(e.target.value) || 1})} 
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-between w-full">
            <Button variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleDeleteAsset}>
              Delete Asset
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveMetadata} className="bg-[#3c1608] hover:bg-[#4c2010] text-white">Save Changes</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
