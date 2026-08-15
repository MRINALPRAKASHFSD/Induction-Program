import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { storage } from "@/lib/firebase/config";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { MediaAsset } from "@/components/landing/modules/content/Hero/schema";
import { Image as ImageIcon, DocumentUpload } from "iconsax-react";

interface MediaLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: MediaAsset) => void;
}

// Utility: image dimensions from File
function getImageDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve({ w: 0, h: 0 }); // Fallback on error instead of hanging forever
    img.src = URL.createObjectURL(file);
  });
}

export function MediaLibraryModal({ open, onOpenChange, onSelect }: MediaLibraryModalProps) {
  const [activeTab, setActiveTab] = useState("upload");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large. Maximum size is 5MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const dims = await getImageDimensions(file);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `media_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `media-library/${fileName}`);
      
      const metadata = {
        contentType: file.type || 'image/jpeg'
      };
      const uploadTask = uploadBytesResumable(storageRef, file, metadata);
      
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          setProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        },
        (error) => {
          console.error("Upload failed", error);
          setUploading(false);
          alert("Upload failed. Try again.");
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          setUploading(false);
          
          const asset: MediaAsset = {
            assetId: fileName,
            url: downloadUrl,
            width: dims.w,
            height: dims.h,
            dominantColor: "#000000", // Would ideally extract this
            blurhash: "", // Would ideally generate this
            filesize: file.size,
          };
          
          onSelect(asset);
          onOpenChange(false);
        }
      );
    } catch (err: any) {
      console.error("Synchronous upload error:", err);
      setUploading(false);
      alert("Upload failed: " + (err.message || "Unknown error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Media Library</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="upload">Upload New</TabsTrigger>
            <TabsTrigger value="recent">Recent Files</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl bg-muted/20">
            {uploading ? (
              <div className="w-full max-w-sm space-y-4 px-6 text-center">
                <DocumentUpload variant="TwoTone" className="h-12 w-12 mx-auto text-primary animate-pulse" />
                <h3 className="text-sm font-semibold">Uploading Media...</h3>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <DocumentUpload variant="TwoTone" className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Drag & drop or click to upload</h3>
                  <p className="text-sm text-muted-foreground mt-1">Supports JPG, PNG, WEBP, SVG (Max 5MB)</p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*"
                />
                <Button onClick={() => fileInputRef.current?.click()}>
                  Select File
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="recent" className="min-h-[300px]">
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground pt-20">
              <ImageIcon variant="TwoTone" className="h-12 w-12 mb-3 opacity-40" />
              <p>Recent files will appear here.</p>
              <p className="text-xs mt-1">Implement listing logic from Firebase Storage or a dedicated media collection.</p>
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
