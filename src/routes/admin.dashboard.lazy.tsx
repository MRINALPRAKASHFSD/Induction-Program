import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Profile2User, ScanBarcode, MagicStar, Calendar1, Import, DocumentText, TableDocument, DocumentCode, Document } from "iconsax-react";
import { useLiveCount } from "@/hooks/use-live-count";
import { AdminShell } from "@/components/admin-shell";
import { collection, query, orderBy, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";

export const Route = createLazyFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard · KRMU Admin" }, { name: "robots", content: "noindex" }],
  }),
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

// ── Export Utilities ──────────────────────────────────────────────────────────
function exportCSV(data: any[]) {
  const headers = ["#", "Full Name", "Enrollment No", "Course", "Branch", "Semester", "Room No", "Registered At"];
  const rows = data.map((s, i) => [
    i + 1,
    s.full_name ?? "",
    s.enrollment_no ?? "",
    s.course ?? "",
    s.branch ?? "",
    s.semester ?? "",
    s.room_no ?? "",
    formatDateTimeExport(s.created_at),
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), "krmu_students.csv");
}

function exportJSON(data: any[]) {
  const json = JSON.stringify(
    data.map((s, i) => ({
      serial: i + 1,
      full_name: s.full_name,
      enrollment_no: s.enrollment_no,
      course: s.course,
      branch: s.branch,
      semester: s.semester,
      room_no: s.room_no,
      registered_at: formatDateTimeExport(s.created_at),
    })),
    null,
    2
  );
  downloadBlob(new Blob([json], { type: "application/json" }), "krmu_students.json");
}

async function exportXLSX(data: any[]) {
  const XLSX = await import("xlsx");
  const rows = data.map((s, i) => ({
    "#": i + 1,
    "Full Name": s.full_name ?? "",
    "Enrollment No": s.enrollment_no ?? "",
    "Course": s.course ?? "",
    "Branch": s.branch ?? "",
    "Semester": s.semester ?? "",
    "Room No": s.room_no ?? "",
    "Registered At": formatDateTimeExport(s.created_at),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  XLSX.writeFile(wb, "krmu_students.xlsx");
}

async function exportPDF(data: any[]) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.text("KRMU Induction — Student Registration Report", 14, 15);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}  |  Total: ${data.length} students`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [["#", "Full Name", "Enrollment No", "Course", "Branch", "Semester", "Room No", "Registered At"]],
    body: data.map((s, i) => [
      i + 1,
      s.full_name ?? "",
      s.enrollment_no ?? "",
      s.course ?? "",
      s.branch ?? "",
      s.semester ?? "",
      s.room_no ?? "",
      formatDateTimeExport(s.created_at),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [140, 44, 20] },
    alternateRowStyles: { fillColor: [252, 248, 244] },
  });

  doc.save("krmu_students.pdf");
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
  const [recent, setRecent] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);

  const students = useLiveCount("students");
  const scans = useLiveCount("attendance");
  const clubs = useLiveCount("club_registrations");
  const events = useLiveCount("events");

  // Live feed — latest 50 in real-time
  useEffect(() => {
    const q = query(collection(db, "students"), orderBy("created_at", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecent(docs.slice(0, 50));
      setAllStudents(docs); // keep full list for export
    });
    return () => unsubscribe();
  }, []);

  const handleExport = async (format: string) => {
    if (allStudents.length === 0) return;
    setExporting(format);
    try {
      const sorted = [...allStudents].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      if (format === "csv") exportCSV(sorted);
      else if (format === "json") exportJSON(sorted);
      else if (format === "xlsx") await exportXLSX(sorted);
      else if (format === "pdf") await exportPDF(sorted);
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
    <AdminShell title="Live dashboard" subtitle="Real-time numbers across the induction.">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Profile2User}     label="Students registered" value={students} accent="from-primary to-primary-glow" />
        <Kpi icon={ScanBarcode}    label="Total QR scans"      value={scans}    accent="from-accent to-primary-glow" />
        <Kpi icon={MagicStar}  label="Club joins"          value={clubs}    accent="from-chart-4 to-success" />
        <Kpi icon={Calendar1}  label="Events live"         value={events}   accent="from-chart-3 to-primary" />
      </div>

      {/* Live feed + export */}
      <section className="mt-8 rounded-2xl glass-card-hero p-5 shadow-sm">
        {/* Header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Live registration feed</h2>
            <p className="text-sm text-muted-foreground">
              {allStudents.length > 0 ? `${allStudents.length} students registered` : "Newest students appear instantly."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live dot */}
            <div className="flex items-center gap-1.5 text-xs text-success mr-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              live
            </div>

            {/* Export buttons */}
            {exportButtons.map(({ format, label, Icon }) => (
              <Button
                key={format}
                variant="liquidGlassWhite"
                size="sm"
                disabled={allStudents.length === 0 || exporting !== null}
                onClick={() => handleExport(format)}
                className="h-8 gap-1.5 text-xs text-[#2c1208] shadow-sm rounded-full"
              >
                {exporting === format ? (
                  <span className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
                ) : (
                  <Icon variant="TwoTone" className="h-3.5 w-3.5 text-[#8a4a22]" />
                )}
                {label}
              </Button>
            ))}

            <Button
              variant="liquidGlassMaroon"
              size="sm"
              disabled={allStudents.length === 0 || exporting !== null}
              onClick={() => handleExport("csv")}
              className="h-8 gap-1.5 text-xs shadow-sm rounded-full"
            >
              <Import variant="TwoTone" className="h-3.5 w-3.5" />
              Export All
            </Button>
          </div>
        </div>

        {/* Table header */}
        {recent.length > 0 && (
          <div className="mt-4 grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr_auto] gap-x-4 border-b pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Student</span>
            <span className="hidden sm:block text-left">Enrollment No</span>
            <span className="text-right">Registered At</span>
          </div>
        )}

        {/* Rows */}
        <div className="divide-y">
          {recent.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No registrations yet.</p>
          )}
          {recent.map((s, idx) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.02 }}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr_auto] gap-x-4 items-center py-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{s.full_name}</div>
                <div className="text-xs text-muted-foreground sm:hidden truncate">{s.enrollment_no}</div>
                {s.branch && <div className="text-xs text-muted-foreground truncate">{s.branch}{s.course ? ` · ${s.course}` : ""}</div>}
              </div>
              <div className="hidden sm:block text-xs text-muted-foreground font-mono text-left truncate">{s.enrollment_no}</div>
              <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                {formatDateTime(s.created_at)}
              </div>
            </motion.div>
          ))}
        </div>

        {allStudents.length > 50 && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Showing 50 most recent · All {allStudents.length} included in export
          </p>
        )}
      </section>
    </AdminShell>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: typeof Profile2User; label: string; value: number | null; accent: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl glass-card-hero p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#5a2c14]">{label}</span>
        <span className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${accent} text-primary-foreground shadow-sm`}>
          <Icon variant="TwoTone" className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums">{value ?? "—"}</div>
    </motion.div>
  );
}
