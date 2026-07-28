import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { getAuth } from "firebase/auth";
import {
  listEvents,
  uploadDataset,
  importDatasetBatch,
  activateDataset,
  deleteDataset,
  listDatasets,
  uploadInductionDataset,
  importInductionDatasetBatch,
  activateInductionDataset,
  deleteInductionDataset,
  listInductionDatasets,
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
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UploadCloud, CheckCircle2, Loader2, Play, Trash2, Check, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createLazyFileRoute("/admin/datasets")({
  component: DatasetsManager,
});

type DatasetType = "orientation" | "induction";

// ── Shared dataset table used by both tabs ────────────────────────────────────
function DatasetTable({
  datasets,
  importingDatasetId,
  importProgress,
  deletingDatasetId,
  onImport,
  onActivate,
  onDelete,
  isInduction,
}: {
  datasets: any[];
  importingDatasetId: string | null;
  importProgress: number;
  deletingDatasetId: string | null;
  onImport: (d: any) => void;
  onActivate: (id: string) => void;
  onDelete: (d: any) => void;
  isInduction: boolean;
}) {
  const visible = datasets.filter((d) => d.status !== "DELETED");
  if (visible.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <UploadCloud className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p>No datasets found. Upload one above.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Rows (Valid)</TableHead>
            <TableHead>Issues</TableHead>
            {isInduction && <TableHead>Conflicts</TableHead>}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((dataset) => {
            const isImporting  = importingDatasetId === dataset.id;
            const isDeleting   = deletingDatasetId === dataset.id;
            const disableAll   = importingDatasetId !== null || deletingDatasetId !== null;

            return (
              <TableRow key={dataset.id} className={dataset.status === "ACTIVE" ? "bg-primary/5" : ""}>
                <TableCell className="font-medium">v{dataset.version}</TableCell>
                <TableCell>
                  <div className="truncate max-w-[150px]" title={dataset.filename}>{dataset.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {dataset.uploaded_at
                      ? new Date(dataset.uploaded_at?.seconds ? dataset.uploaded_at.seconds * 1000 : dataset.uploaded_at).toLocaleString()
                      : "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={
                    dataset.status === "ACTIVE"   ? "default"      :
                    dataset.status === "READY"    ? "secondary"    :
                    dataset.status === "PREVIEW"  ? "outline"      :
                    dataset.status === "FAILED"   ? "destructive"  : "outline"
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
                <TableCell>{dataset.total_rows ?? "—"} ({dataset.valid_rows ?? "—"})</TableCell>
                <TableCell>
                  <div className="text-xs space-y-1">
                    {(dataset.duplicate_rows ?? 0) > 0 && <div className="text-amber-500">{dataset.duplicate_rows} dupes</div>}
                    {(dataset.invalid_rows ?? 0) > 0 && <div className="text-red-500">{dataset.invalid_rows} invalid</div>}
                    {(dataset.blank_rows ?? 0) > 0 && <div className="text-muted-foreground">{dataset.blank_rows} blank</div>}
                    {!dataset.duplicate_rows && !dataset.invalid_rows && !dataset.blank_rows && (
                      <span className="text-green-500 flex items-center"><CheckCircle2 className="h-3 w-3 mr-1" />Clean</span>
                    )}
                  </div>
                </TableCell>
                {isInduction && (
                  <TableCell>
                    {(dataset.conflict_rows ?? 0) > 0
                      ? <span className="text-xs text-orange-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{dataset.conflict_rows}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                )}
                <TableCell className="text-right space-x-2 whitespace-nowrap">
                  {(dataset.status === "PREVIEW" || dataset.status === "FAILED") && (
                    <Button size="sm" onClick={() => onImport(dataset)} disabled={disableAll}>
                      {isImporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                      Import
                    </Button>
                  )}
                  {(dataset.status === "READY" || dataset.status === "ARCHIVED") && (
                    <Button size="sm" variant="secondary" onClick={() => onActivate(dataset.id)} disabled={disableAll}>
                      <Check className="h-4 w-4 mr-1" />Activate
                    </Button>
                  )}
                  {dataset.status === "ACTIVE" && (
                    <Button size="sm" variant="default" disabled>Active</Button>
                  )}
                  <Button
                    size="icon" variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    disabled={disableAll}
                    onClick={() => onDelete(dataset)}
                    title="Delete dataset"
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
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function DatasetsManager() {
  const getToken = async (): Promise<string> => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  };

  // ── Module selector state ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<DatasetType>("orientation");

  // ── Orientation state ─────────────────────────────────────────────────────────
  const [events, setEvents]               = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [datasets, setDatasets]           = useState<any[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [orientFile, setOrientFile]       = useState<File | null>(null);
  const [orientUploading, setOrientUploading] = useState(false);
  const orientFileRef = useRef<HTMLInputElement>(null);

  // ── Induction state ───────────────────────────────────────────────────────────
  const [inductionDatasets, setInductionDatasets]     = useState<any[]>([]);
  const [loadingInduction, setLoadingInduction]       = useState(false);
  const [inductionFile, setInductionFile]             = useState<File | null>(null);
  const [inductionUploading, setInductionUploading]   = useState(false);
  const inductionFileRef = useRef<HTMLInputElement>(null);

  // ── Shared action state ───────────────────────────────────────────────────────
  const [importingDatasetId, setImportingDatasetId]   = useState<string | null>(null);
  const [importProgress, setImportProgress]           = useState(0);
  const [deleteModalOpen, setDeleteModalOpen]         = useState(false);
  const [datasetToDelete, setDatasetToDelete]         = useState<any>(null);
  const [deletingDatasetId, setDeletingDatasetId]     = useState<string | null>(null);

  // ── Load events on mount ──────────────────────────────────────────────────────
  useEffect(() => { loadEvents(); }, []);

  // ── Load orientation datasets when event changes ──────────────────────────────
  useEffect(() => {
    if (selectedEventId) loadOrientationDatasets();
    else setDatasets([]);
  }, [selectedEventId]);

  // ── Load induction datasets when induction tab first shown ────────────────────
  useEffect(() => {
    if (activeTab === "induction" && inductionDatasets.length === 0) loadInductionDatasets();
  }, [activeTab]);

  const loadEvents = async () => {
    try { setEvents(await listEvents()); }
    catch (err: any) { toast.error("Failed to load events: " + err.message); }
  };

  const loadOrientationDatasets = async () => {
    if (!selectedEventId) return;
    setLoadingDatasets(true);
    try { setDatasets(await listDatasets(selectedEventId)); }
    catch (err: any) { toast.error("Failed to load datasets: " + err.message); }
    finally { setLoadingDatasets(false); }
  };

  const loadInductionDatasets = async () => {
    setLoadingInduction(true);
    try { setInductionDatasets(await listInductionDatasets()); }
    catch (err: any) { toast.error("Failed to load induction datasets: " + err.message); }
    finally { setLoadingInduction(false); }
  };

  // ── Shared import runner ──────────────────────────────────────────────────────
  const runImport = useCallback(async (dataset: any, batchFn: typeof importDatasetBatch) => {
    setImportingDatasetId(dataset.id);
    setImportProgress(0);
    try {
      let arrayBuffer: ArrayBuffer;
      // Prefer the locally-selected file if it matches, else download from Storage URL
      const localFile = activeTab === "induction" ? inductionFile : orientFile;
      if (localFile && localFile.name === dataset.filename && localFile.size === dataset.file_size) {
        arrayBuffer = await localFile.arrayBuffer();
      } else {
        toast.info("Downloading dataset for import...");
        const r = await fetch(dataset.download_url);
        if (!r.ok) throw new Error("Failed to download dataset from storage.");
        arrayBuffer = await r.arrayBuffer();
      }

      const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

      const token = await getToken();
      await batchFn(token, { dataset_id: dataset.id, action: "start" });

      const CHUNK_SIZE = 500;
      const startTs = Date.now();
      for (let i = 0; i < rawRows.length; i += CHUNK_SIZE) {
        const chunk = rawRows.slice(i, i + CHUNK_SIZE);
        const batchStart = Date.now();
        await batchFn(token, { dataset_id: dataset.id, action: "chunk", rows: chunk, batch_time_ms: Date.now() - batchStart });
        setImportProgress(Math.round(((i + chunk.length) / rawRows.length) * 100));
      }

      await batchFn(token, { dataset_id: dataset.id, action: "finish", import_duration_ms: Date.now() - startTs });
      toast.success("Dataset imported successfully!");
      if (activeTab === "induction") loadInductionDatasets(); else loadOrientationDatasets();
    } catch (err: any) {
      toast.error("Import failed: " + err.message);
    } finally {
      setImportingDatasetId(null);
    }
  }, [activeTab, inductionFile, orientFile, selectedEventId]);

  // ── Per-tab handlers ──────────────────────────────────────────────────────────
  const handleOrientUpload = async () => {
    if (!orientFile || !selectedEventId) return;
    setOrientUploading(true);
    try {
      const token = await getToken();
      const email = getAuth().currentUser?.email || "Admin";
      const result = await uploadDataset(token, orientFile, selectedEventId, email);
      if (result.data?.cross_module_warning) {
        const w = result.data.cross_module_warning;
        toast.warning(`This file was previously used in ${w.module} as "${w.dataset_name}". Uploaded here as a new Orientation dataset.`, { duration: 8000 });
      } else {
        toast.success("Dataset uploaded and validated successfully.");
      }
      setOrientFile(null);
      if (orientFileRef.current) orientFileRef.current.value = "";
      loadOrientationDatasets();
    } catch (err: any) { toast.error("Upload failed: " + err.message); }
    finally { setOrientUploading(false); }
  };

  const handleInductionUpload = async () => {
    if (!inductionFile) return;
    setInductionUploading(true);
    try {
      const token = await getToken();
      const email = getAuth().currentUser?.email || "Admin";
      const result = await uploadInductionDataset(token, inductionFile, email);
      if (result.data?.cross_module_warning) {
        const w = result.data.cross_module_warning;
        toast.warning(`This file was previously used in ${w.module} as "${w.dataset_name}". Uploaded here as a new Induction dataset.`, { duration: 8000 });
      } else {
        toast.success("Induction dataset uploaded and validated successfully.");
      }
      setInductionFile(null);
      if (inductionFileRef.current) inductionFileRef.current.value = "";
      loadInductionDatasets();
    } catch (err: any) { toast.error("Upload failed: " + err.message); }
    finally { setInductionUploading(false); }
  };

  const handleActivate = async (datasetId: string) => {
    try {
      const token = await getToken();
      const email = getAuth().currentUser?.email || "Admin";
      if (activeTab === "induction") {
        await activateInductionDataset(token, datasetId, email);
        toast.success("Induction dataset activated!");
        loadInductionDatasets();
      } else {
        await activateDataset(token, datasetId, email);
        toast.success("Dataset activated successfully!");
        await Promise.all([loadEvents(), loadOrientationDatasets()]);
      }
    } catch (err: any) { toast.error("Failed to activate: " + err.message); }
  };

  const promptDelete = (dataset: any) => { setDatasetToDelete(dataset); setDeleteModalOpen(true); };

  const executeDelete = async () => {
    if (!datasetToDelete) return;
    setDeletingDatasetId(datasetToDelete.id);
    const toastId = toast.loading("Deleting dataset...");
    try {
      const token = await getToken();
      const email = getAuth().currentUser?.email || "Admin";
      if (activeTab === "induction") {
        const result = await deleteInductionDataset(token, datasetToDelete.id, email);
        toast.success(`Deleted. Removed ${result.data?.deleted_participants ?? 0} participants.`, { id: toastId });
        loadInductionDatasets();
      } else {
        const result = await deleteDataset(token, datasetToDelete.id, email, selectedEventId);
        toast.success(`Deleted. Removed ${result.data?.deleted_participants ?? 0} participants.`, { id: toastId });
        await Promise.all([loadEvents(), loadOrientationDatasets()]);
      }
      setDeleteModalOpen(false);
      setDatasetToDelete(null);
    } catch (err: any) {
      toast.error("Failed to delete: " + err.message, { id: toastId });
    } finally {
      setDeletingDatasetId(null);
    }
  };

  const activeEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dataset Management</h1>
        <p className="text-muted-foreground mt-1">
          Upload and manage official participant datasets for Orientation and Induction modules.
        </p>
      </div>

      {/* ── Module selector ── */}
      <Card>
        <CardHeader>
          <CardTitle>Dataset Type</CardTitle>
          <CardDescription>Select which module this dataset belongs to. A dataset may only belong to one module at a time.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {(["orientation", "induction"] as DatasetType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 sm:flex-none px-6 py-2.5 rounded-md text-sm font-medium transition-colors border ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {tab === "orientation" ? "🎓 Orientation / Event" : "📋 Induction"}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════ ORIENTATION TAB ══════════════════════ */}
      {activeTab === "orientation" && (
        <>
          {/* Step 1 — Select Event */}
          <Card>
            <CardHeader>
              <CardTitle>1. Select Event</CardTitle>
              <CardDescription>Orientation datasets belong exclusively to a specific event.</CardDescription>
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

          {/* Step 2 — Upload */}
          {selectedEventId && (
            <Card>
              <CardHeader>
                <CardTitle>2. Upload New Dataset</CardTitle>
                <CardDescription>Upload a CSV or XLSX file containing participant data for {activeEvent?.title}.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <input
                    type="file" accept=".csv,.xlsx,.xls"
                    className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer border rounded-md p-2 w-full max-w-sm"
                    onChange={(e) => setOrientFile(e.target.files?.[0] || null)}
                    ref={orientFileRef}
                  />
                  <Button onClick={handleOrientUpload} disabled={!orientFile || orientUploading || !!importingDatasetId || !!deletingDatasetId}>
                    {orientUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Upload & Validate
                  </Button>
                </div>
                {orientFile && <p className="text-sm text-muted-foreground mt-2">Selected: {orientFile.name} ({(orientFile.size / 1024).toFixed(2)} KB)</p>}
              </CardContent>
            </Card>
          )}

          {/* Step 3 — Dataset Versions */}
          {selectedEventId && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>3. Dataset Versions</CardTitle>
                  <CardDescription>Manage uploaded datasets for {activeEvent?.title}.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadOrientationDatasets} disabled={loadingDatasets}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingDatasets ? "animate-spin" : ""}`} />Refresh
                </Button>
              </CardHeader>
              <CardContent>
                <DatasetTable
                  datasets={datasets}
                  importingDatasetId={importingDatasetId}
                  importProgress={importProgress}
                  deletingDatasetId={deletingDatasetId}
                  onImport={(d) => runImport(d, importDatasetBatch)}
                  onActivate={handleActivate}
                  onDelete={promptDelete}
                  isInduction={false}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ══════════════════════ INDUCTION TAB ══════════════════════ */}
      {activeTab === "induction" && (
        <>
          {/* Upload */}
          <Card>
            <CardHeader>
              <CardTitle>1. Upload Induction Dataset</CardTitle>
              <CardDescription>
                Induction datasets are platform-wide — no event selection needed.
                Upload a CSV or XLSX with student admission records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <input
                  type="file" accept=".csv,.xlsx,.xls"
                  className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer border rounded-md p-2 w-full max-w-sm"
                  onChange={(e) => setInductionFile(e.target.files?.[0] || null)}
                  ref={inductionFileRef}
                />
                <Button onClick={handleInductionUpload} disabled={!inductionFile || inductionUploading || !!importingDatasetId || !!deletingDatasetId}>
                  {inductionUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload & Validate
                </Button>
              </div>
              {inductionFile && <p className="text-sm text-muted-foreground mt-2">Selected: {inductionFile.name} ({(inductionFile.size / 1024).toFixed(2)} KB)</p>}
            </CardContent>
          </Card>

          {/* Dataset Versions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>2. Induction Dataset Versions</CardTitle>
                <CardDescription>
                  Only one induction dataset can be ACTIVE at a time. Activating a new one archives the previous.
                  Datasets with registered students cannot be deleted — only archived.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadInductionDatasets} disabled={loadingInduction}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingInduction ? "animate-spin" : ""}`} />Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <DatasetTable
                datasets={inductionDatasets}
                importingDatasetId={importingDatasetId}
                importProgress={importProgress}
                deletingDatasetId={deletingDatasetId}
                onImport={(d) => runImport(d, importInductionDatasetBatch)}
                onActivate={handleActivate}
                onDelete={promptDelete}
                isInduction={true}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Delete confirmation modal ── */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dataset?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeTab === "induction"
                ? "This will permanently remove this induction dataset and all PENDING participants imported from it. Students who have already completed registration will NOT be deleted — if any exist, deletion will be blocked and you will be prompted to archive instead."
                : "This will permanently remove this dataset and every participant record imported from it. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingDatasetId}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={executeDelete} disabled={!!deletingDatasetId}>
              {deletingDatasetId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Dataset
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
