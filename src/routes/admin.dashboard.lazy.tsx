import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Profile2User, ScanBarcode, MagicStar, Calendar1, Import, DocumentText, TableDocument, DocumentCode, Document } from "iconsax-react";
import { AdminShell } from "@/components/admin-shell";
import { collection, query, orderBy, getDocs, onSnapshot, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";

export const Route = createLazyFileRoute("/admin/dashboard")({
  component: AdminDashboard,
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDateTime(raw: string | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatDateTimeExport(raw: string | undefined): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

const getValidationStatus = (s: any) => s.admission_status === "ACTIVE" ? "Valid" : "Invalid";
const getRegistrationStatus = (s: any) => s.registration_status === "REGISTERED" ? "Registered" : "Pending";
const getOrientationStatus = (s: any) => s.attendance_status === "present" ? "Completed" : "Pending";
const getClubStatus = (s: any, clubRegs: Set<string>) => clubRegs.has(s.application_number) ? "Joined" : "Pending";

// ── Export Utilities ──────────────────────────────────────────────────────────
function exportCSV(data: any[], clubRegs: Set<string>) {
  const headers = ["Enrollment Number", "Student Name", "Validation Status", "Registration Status", "Club Status", "Orientation Status", "Last Activity"];
  const rows = data.map((s) => [
    s.application_number ?? s.enrollment_no ?? "",
    s.student_name ?? "",
    getValidationStatus(s),
    getRegistrationStatus(s),
    getClubStatus(s, clubRegs),
    getOrientationStatus(s),
    formatDateTimeExport(s.last_updated_at || s.created_at),
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), "dataset_progress.csv");
}

function exportJSON(data: any[], clubRegs: Set<string>) {
  const json = JSON.stringify(
    data.map((s) => ({
      enrollment_number: s.application_number ?? s.enrollment_no,
      student_name: s.student_name,
      validation_status: getValidationStatus(s),
      registration_status: getRegistrationStatus(s),
      club_status: getClubStatus(s, clubRegs),
      orientation_status: getOrientationStatus(s),
      last_activity: formatDateTimeExport(s.last_updated_at || s.created_at),
    })),
    null,
    2
  );
  downloadBlob(new Blob([json], { type: "application/json" }), "dataset_progress.json");
}

async function exportXLSX(data: any[], clubRegs: Set<string>) {
  const XLSX = await import("xlsx");
  const rows = data.map((s) => ({
    "Enrollment Number": s.application_number ?? s.enrollment_no ?? "",
    "Student Name": s.student_name ?? "",
    "Validation Status": getValidationStatus(s),
    "Registration Status": getRegistrationStatus(s),
    "Club Status": getClubStatus(s, clubRegs),
    "Orientation Status": getOrientationStatus(s),
    "Last Activity": formatDateTimeExport(s.last_updated_at || s.created_at),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Progress");
  XLSX.writeFile(wb, "dataset_progress.xlsx");
}

async function exportPDF(data: any[], clubRegs: Set<string>) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.text("KRMU Induction — Dataset Progress Report", 14, 15);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}  |  Total: ${data.length} records`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [["Enrollment Number", "Student Name", "Validation Status", "Registration Status", "Club Status", "Orientation Status", "Last Activity"]],
    body: data.map((s) => [
      s.application_number ?? s.enrollment_no ?? "",
      s.student_name ?? "",
      getValidationStatus(s),
      getRegistrationStatus(s),
      getClubStatus(s, clubRegs),
      getOrientationStatus(s),
      formatDateTimeExport(s.last_updated_at || s.created_at),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [140, 44, 20] },
    alternateRowStyles: { fillColor: [252, 248, 244] },
  });

  doc.save("dataset_progress.pdf");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────
function AdminDashboard() {
  const [activeDataset, setActiveDataset] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [clubRegistrations, setClubRegistrations] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);

  // 1. Fetch active dataset
  useEffect(() => {
    const q = query(collection(db, "induction_datasets"), where("status", "==", "ACTIVE"), limit(1));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setActiveDataset({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setActiveDataset(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch participants
  useEffect(() => {
    if (!activeDataset?.id) {
      setParticipants([]);
      return;
    }
    const q = query(collection(db, "induction_participants"), where("dataset_id", "==", activeDataset.id));
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setParticipants(docs);
    });
    return () => unsubscribe();
  }, [activeDataset?.id]);

  // 3. Fetch club registrations
  useEffect(() => {
    const q = query(collection(db, "club_registrations"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const studentIds = new Set<string>();
      snap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.student_id) {
          studentIds.add(data.student_id);
        }
      });
      setClubRegistrations(studentIds);
    });
    return () => unsubscribe();
  }, []);

  // Memoized filtered participants based on search
  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) {
      return [...participants].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    const queryLower = searchQuery.toLowerCase();
    return participants.filter(p => 
      (p.application_number || "").toLowerCase().includes(queryLower) ||
      (p.enrollment_no || "").toLowerCase().includes(queryLower) ||
      (p.student_name || "").toLowerCase().includes(queryLower) ||
      (p.email || "").toLowerCase().includes(queryLower)
    ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [participants, searchQuery]);

  // Memoized KPIs
  const kpis = useMemo(() => {
    let validated = 0;
    let clubs = 0;
    let orientation = 0;
    
    participants.forEach((p) => {
      if (getValidationStatus(p) === "Valid") validated++;
      if (getClubStatus(p, clubRegistrations) === "Joined") clubs++;
      if (getOrientationStatus(p) === "Completed") orientation++;
    });

    return {
      datasetSize: participants.length,
      validated,
      clubs,
      orientation,
    };
  }, [participants, clubRegistrations]);

  const handleExport = async (format: string) => {
    if (filteredParticipants.length === 0) return;
    setExporting(format);
    try {
      if (format === "csv") exportCSV(filteredParticipants, clubRegistrations);
      else if (format === "json") exportJSON(filteredParticipants, clubRegistrations);
      else if (format === "xlsx") await exportXLSX(filteredParticipants, clubRegistrations);
      else if (format === "pdf") await exportPDF(filteredParticipants, clubRegistrations);
    } finally {
      setExporting(null);
    }
  };

  const exportButtons = [
    { format: "csv",  label: "CSV",   Icon: DocumentText },
    { format: "xlsx", label: "Excel", Icon: TableDocument },
    { format: "pdf",  label: "PDF",   Icon: Document },
    { format: "json", label: "JSON",  Icon: DocumentCode },
  ];

  return (
    <AdminShell title="Live dashboard" subtitle="Real-time numbers across the active dataset.">
      
      {/* Dataset Info Card */}
      {activeDataset ? (
        <section className="mb-6 admin-card bg-muted/30 border-primary/10 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-border/60">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <DocumentText className="w-5 h-5 text-primary" variant="TwoTone" />
                Dataset Information
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Source of truth for all dashboard metrics.</p>
            </div>
            <div className="mt-4 sm:mt-0">
              <span className="admin-badge-success shadow-sm px-3 py-1 ring-1 ring-success/20">Active Dataset</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                <DocumentText className="w-3.5 h-3.5" /> Dataset Name
              </p>
              <p className="text-sm font-bold text-foreground truncate" title={activeDataset.filename || activeDataset.name || "N/A"}>
                {activeDataset.filename || activeDataset.name || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                <Calendar1 className="w-3.5 h-3.5" /> Upload Date
              </p>
              <p className="text-sm font-semibold text-foreground">{formatDateTimeExport(activeDataset.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                <Profile2User className="w-3.5 h-3.5" /> Total Records
              </p>
              <p className="text-sm font-bold tabular-nums text-foreground">{activeDataset.total_rows ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-success/80 font-semibold mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                <ScanBarcode className="w-3.5 h-3.5" /> Valid Records
              </p>
              <p className="text-sm font-bold tabular-nums text-success">{activeDataset.valid_rows ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-destructive/80 font-semibold mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                <ScanBarcode className="w-3.5 h-3.5" /> Invalid Records
              </p>
              <p className="text-sm font-bold tabular-nums text-destructive">{activeDataset.invalid_rows ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                <Calendar1 className="w-3.5 h-3.5" /> Last Updated
              </p>
              <p className="text-sm font-semibold text-foreground">{formatDateTimeExport(activeDataset.last_updated_at)}</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="mb-6 admin-card">
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <h2 className="admin-section-title mb-2">No Active Dataset</h2>
            <p className="text-sm text-muted-foreground">Upload and activate an induction dataset to view analytics.</p>
          </div>
        </section>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Profile2User} label="Dataset Size" value={kpis.datasetSize} accent="text-indigo-600 bg-indigo-600/10 dark:text-indigo-400 dark:bg-indigo-400/10" trendLabel="Active Dataset" />
        <Kpi icon={ScanBarcode} label="Validated" value={kpis.validated} accent="text-emerald-600 bg-emerald-600/10 dark:text-emerald-400 dark:bg-emerald-400/10" trendLabel="All Valid" />
        <Kpi icon={MagicStar} label="Club Registrations" value={kpis.clubs} accent="text-violet-600 bg-violet-600/10 dark:text-violet-400 dark:bg-violet-400/10" trendLabel="Clubs Joined" />
        <Kpi icon={Calendar1} label="Orientation Completed" value={kpis.orientation} accent="text-amber-600 bg-amber-600/10 dark:text-amber-400 dark:bg-amber-400/10" trendLabel="Orientation Progress" />
      </div>

      {/* Live feed + export */}
      <section className="mt-8 admin-card">
        {/* Header row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="admin-section-title">Dataset Progress</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredParticipants.length > 0 ? `${filteredParticipants.length} students tracking` : "No matching students found."}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Functional search */}
            <div className="relative max-w-sm">
              <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </span>
              <input 
                type="text" 
                placeholder="Search students..." 
                className="admin-input-enhanced pl-9 h-9 w-full sm:w-64" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Export actions */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-success mr-1 bg-success/10 px-2 py-1 rounded-full border border-success/20">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span className="font-medium">live</span>
              </div>
              
              {exportButtons.map(({ format, label, Icon }) => (
                <Button
                  key={format}
                  variant="outline"
                  size="sm"
                  disabled={filteredParticipants.length === 0 || exporting !== null}
                  onClick={() => handleExport(format)}
                  className="h-9 gap-1.5 text-xs shadow-sm rounded-lg"
                >
                  {exporting === format ? (
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full" />
                  ) : (
                    <Icon variant="TwoTone" className="h-4 w-4 text-muted-foreground" />
                  )}
                  {label}
                </Button>
              ))}

              <Button
                variant="default"
                size="sm"
                disabled={filteredParticipants.length === 0 || exporting !== null}
                onClick={() => handleExport("csv")}
                className="h-9 gap-1.5 text-xs shadow-sm rounded-lg admin-btn-success"
              >
                <Import variant="TwoTone" className="h-4 w-4" />
                Export All
              </Button>
            </div>
          </div>
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          <table className="admin-table w-full whitespace-nowrap">
            <thead className="sticky top-0 bg-muted/50 z-10">
              <tr>
                <th className="text-left font-semibold py-3 px-4">Enrollment Number</th>
                <th className="text-left font-semibold py-3 px-4">Student Name</th>
                <th className="text-left font-semibold py-3 px-4">Validation Status</th>
                <th className="text-left font-semibold py-3 px-4">Registration Status</th>
                <th className="text-left font-semibold py-3 px-4">Club Status</th>
                <th className="text-left font-semibold py-3 px-4">Orientation Status</th>
                <th className="text-right font-semibold py-3 px-4">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground admin-empty-state">
                    No participants found.
                  </td>
                </tr>
              )}
              {filteredParticipants.slice(0, 100).map((s, idx) => {
                const valStatus = getValidationStatus(s);
                const regStatus = getRegistrationStatus(s);
                const clubStatus = getClubStatus(s, clubRegistrations);
                const orStatus = getOrientationStatus(s);

                return (
                  <motion.tr 
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.01 }}
                    className="hover:bg-muted/60 even:bg-muted/20 transition-colors border-b border-border/50 last:border-0"
                  >
                    <td className="font-mono text-sm text-foreground py-3 px-4">{s.application_number ?? s.enrollment_no ?? "—"}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-sm text-foreground">{s.student_name}</div>
                      {s.email && <div className="text-xs text-muted-foreground mt-0.5">{s.email}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <span className={valStatus === "Valid" ? "admin-badge-success" : "admin-badge-destructive"}>
                        {valStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={regStatus === "Registered" ? "admin-badge-success" : "admin-badge-warning"}>
                        {regStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={clubStatus === "Joined" ? "admin-badge-success" : "admin-badge-warning"}>
                        {clubStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={orStatus === "Completed" ? "admin-badge-success" : "admin-badge-warning"}>
                        {orStatus}
                      </span>
                    </td>
                    <td className="text-right text-xs text-muted-foreground py-3 px-4">{formatDateTime(s.last_updated_at || s.created_at)}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredParticipants.length > 100 && (
          <p className="mt-4 text-center text-xs text-muted-foreground font-medium">
            Showing 100 most recent · All {filteredParticipants.length} included in export
          </p>
        )}
      </section>
    </AdminShell>
  );
}

function Kpi({ icon: Icon, label, value, accent, trendLabel }: { icon: typeof Profile2User; label: string; value: number | null; accent: string; trendLabel: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="admin-metric-card h-full transition-transform border border-border/50 bg-card shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-secondary font-medium tracking-tight">{label}</span>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
          <Icon variant="TwoTone" className="h-6 w-6" />
        </span>
      </div>
      <div className="mt-4 text-4xl text-foreground font-bold tabular-nums tracking-tight">{value ?? "—"}</div>
      <div className="mt-3 text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
        {trendLabel}
      </div>
    </motion.div>
  );
}
