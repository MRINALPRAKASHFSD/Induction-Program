import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { getAuth } from "firebase/auth";
import {
  listEvents,
  uploadDataset,
  importDatasetBatch,
  activateDataset,
  deleteDataset,
  listDatasets
} from "@/lib/admin.functions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  AlertDialog, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, Play, Trash2, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createLazyFileRoute("/admin/datasets")({
  component: DatasetsManager,
});

function DatasetsManager() {
  const getToken = async (): Promise<string> => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  };
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const [importingDatasetId, setImportingDatasetId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState<any>(null);
  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadDatasets();
    } else {
      setDatasets([]);
    }
  }, [selectedEventId]);

  const loadEvents = async () => {
    try {
      const data = await listEvents();
      setEvents(data);
    } catch (err: any) {
      toast.error("Failed to load events: " + err.message);
    }
  };

  const loadDatasets = async () => {
    if (!selectedEventId) return;
    setLoadingDatasets(true);
    try {
      const data = await listDatasets(selectedEventId);
      setDatasets(data);
    } catch (err: any) {
      toast.error("Failed to load datasets: " + err.message);
    } finally {
      setLoadingDatasets(false);
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedEventId) return;
    setUploading(true);
    try {
      const token = await getToken();
      const email = getAuth().currentUser?.email || "Admin";
      await uploadDataset(token, file, selectedEventId, email);
      toast.success("Dataset uploaded and validated successfully.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadDatasets();
    } catch (err: any) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async (dataset: any) => {
    setImportingDatasetId(dataset.id);
    setImportProgress(0);
    try {
      let arrayBuffer: ArrayBuffer;
      if (file && file.name === dataset.filename && file.size === dataset.file_size) {
        arrayBuffer = await file.arrayBuffer();
      } else {
        toast.info("Downloading dataset for import...");
        const res = await fetch(dataset.download_url);
        if (!res.ok) throw new Error("Failed to download dataset from storage.");
        arrayBuffer = await res.arrayBuffer();
      }

      toast.info("Parsing dataset...");
      const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

      toast.info("Starting import...");
      const token = await getToken();
      const startRes = await importDatasetBatch(token, { dataset_id: dataset.id, action: 'start' });
      if (!startRes.ok && startRes.message !== 'Import started and lock acquired.' && !startRes.message.includes('already')) {
        throw new Error(startRes.message);
      }

      const CHUNK_SIZE = 500;
      const startTimestamp = Date.now();
      
      for (let i = 0; i < rawRows.length; i += CHUNK_SIZE) {
        const chunk = rawRows.slice(i, i + CHUNK_SIZE);
        const batchStart = Date.now();
        await importDatasetBatch(token, { dataset_id: dataset.id, action: 'chunk', rows: chunk, batch_time_ms: Date.now() - batchStart });
        setImportProgress(Math.round(((i + chunk.length) / rawRows.length) * 100));
      }

      await importDatasetBatch(token, { 
        dataset_id: dataset.id, 
        action: 'finish',
        import_duration_ms: Date.now() - startTimestamp
      });

      toast.success("Dataset imported successfully!");
      loadDatasets();
    } catch (err: any) {
      toast.error("Import failed: " + err.message);
    } finally {
      setImportingDatasetId(null);
    }
  };

  const handleActivate = async (datasetId: string) => {
    try {
      const token = await getToken();
      const email = getAuth().currentUser?.email || "Admin";
      await activateDataset(token, datasetId, email);
      toast.success("Dataset activated successfully!");
      await Promise.all([
        loadEvents(),
        loadDatasets(),
      ]);
    } catch (err: any) {
      toast.error("Failed to activate: " + err.message);
    }
  };

  const promptDelete = (dataset: any) => {
    setDatasetToDelete(dataset);
    setDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!datasetToDelete || !selectedEventId) return;
    setDeletingDatasetId(datasetToDelete.id);
    
    const toastId = toast.loading("Deleting dataset and removing participants...");
    
    try {
      const token = await getToken();
      const email = getAuth().currentUser?.email || "Admin";
      const result = await deleteDataset(token, datasetToDelete.id, selectedEventId, email);
      
      toast.success(`Dataset deleted. Removed ${result.data?.participants_deleted || 0} participants.`, { id: toastId });
      
      setDeleteModalOpen(false);
      setDatasetToDelete(null);
      
      await Promise.all([
        loadEvents(),
        loadDatasets(),
      ]);
    } catch (err: any) {
      toast.error("Failed to delete: " + err.message, { id: toastId });
    } finally {
      setDeletingDatasetId(null);
    }
  };

  const activeEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dataset Management</h1>
        <p className="text-muted-foreground mt-1">
          Upload and manage official orientation datasets for events.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Select Event</CardTitle>
          <CardDescription>Datasets belong exclusively to a specific event.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-full md:w-[400px]">
              <SelectValue placeholder="Select an event..." />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.title} {e.active_dataset_id ? "(Has Active Dataset)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedEventId && (
        <Card>
          <CardHeader>
            <CardTitle>2. Upload New Dataset</CardTitle>
            <CardDescription>Upload a CSV or XLSX file containing participant data.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <input 
                type="file" 
                accept=".csv, .xlsx, .xls"
                className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer border rounded-md p-2 w-full max-w-sm"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                ref={fileInputRef}
              />
              <Button 
                onClick={handleUpload} 
                disabled={!file || uploading || importingDatasetId !== null || deletingDatasetId !== null}
              >
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload & Validate
              </Button>
            </div>
            {file && (
              <p className="text-sm text-muted-foreground mt-2">
                Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {selectedEventId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>3. Dataset Versions</CardTitle>
              <CardDescription>Manage uploaded datasets for {activeEvent?.title}.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadDatasets} disabled={loadingDatasets}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingDatasets ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {datasets.filter(d => d.status !== 'DELETED').length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <UploadCloud className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No datasets found for this event.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rows (Valid)</TableHead>
                      <TableHead>Issues</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datasets.filter(d => d.status !== 'DELETED').map((dataset) => {
                      const isImporting = importingDatasetId === dataset.id;
                      const isDeleting = deletingDatasetId === dataset.id;
                      const disableActions = isImporting || importingDatasetId !== null || deletingDatasetId !== null;
                      
                      return (
                        <TableRow key={dataset.id} className={dataset.status === 'ACTIVE' ? "bg-primary/5" : ""}>
                          <TableCell className="font-medium">v{dataset.version}</TableCell>
                          <TableCell>
                            <div className="truncate max-w-[150px]" title={dataset.filename}>{dataset.filename}</div>
                            <div className="text-xs text-muted-foreground">{new Date(dataset.uploaded_at?.seconds ? dataset.uploaded_at.seconds * 1000 : dataset.uploaded_at).toLocaleString()}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              dataset.status === 'ACTIVE' ? 'default' : 
                              dataset.status === 'READY' ? 'secondary' : 
                              dataset.status === 'PREVIEW' ? 'outline' : 
                              dataset.status === 'FAILED' ? 'destructive' : 'outline'
                            }>
                              {dataset.status}
                            </Badge>
                            {isImporting && (
                              <div className="mt-2 w-full min-w-[100px]">
                                <Progress value={importProgress} className="h-2" />
                                <div className="text-xs text-muted-foreground text-right mt-1">{importProgress}%</div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {dataset.total_rows} ({dataset.valid_rows})
                          </TableCell>
                          <TableCell>
                            <div className="text-xs space-y-1">
                              {dataset.duplicate_rows > 0 && <div className="text-amber-500">{dataset.duplicate_rows} dupes</div>}
                              {dataset.invalid_rows > 0 && <div className="text-red-500">{dataset.invalid_rows} invalid</div>}
                              {dataset.blank_rows > 0 && <div className="text-muted-foreground">{dataset.blank_rows} blank</div>}
                              {dataset.duplicate_rows === 0 && dataset.invalid_rows === 0 && dataset.blank_rows === 0 && (
                                <span className="text-green-500 flex items-center"><CheckCircle2 className="h-3 w-3 mr-1"/> Clean</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right space-x-2 whitespace-nowrap">
                            {(dataset.status === 'PREVIEW' || dataset.status === 'FAILED') && (
                              <Button size="sm" onClick={() => handleImport(dataset)} disabled={disableActions}>
                                {isImporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                                Import
                              </Button>
                            )}
                            {(dataset.status === 'READY' || dataset.status === 'ARCHIVED') && (
                              <Button size="sm" variant="secondary" onClick={() => handleActivate(dataset.id)} disabled={disableActions}>
                                <Check className="h-4 w-4 mr-1" />
                                Activate
                              </Button>
                            )}
                            {dataset.status === 'ACTIVE' && (
                              <Button size="sm" variant="default" disabled>
                                Active
                              </Button>
                            )}
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="text-destructive hover:bg-destructive/10"
                              disabled={disableActions}
                              onClick={() => promptDelete(dataset)}
                            >
                              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dataset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this dataset and every participant imported from it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDatasetId !== null}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={executeDelete} disabled={deletingDatasetId !== null}>
              {deletingDatasetId !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Dataset
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
