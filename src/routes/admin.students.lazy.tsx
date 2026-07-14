import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Search, Download, UserPlus, Building2, RotateCcw, Layers, Eye, EyeOff, FileText, FileSpreadsheet, FileJson, File } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { localDb, ROOM_CONFIG, getTotalStudentCapacity, getRoomCapacity, generateAllRooms, type LocalStudent } from "@/lib/local-db";
import { listStudents, updateStudentsBatch } from "@/lib/admin.functions";

export const Route = createLazyFileRoute("/admin/students")({
  head: () => ({ meta: [{ title: "Students · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminStudents,
});

// Pure computation — safe to run at module level
const TOTAL_STUDENT_CAPACITY = getTotalStudentCapacity();
const SPECIAL_ROOM_KEYS = Object.keys(ROOM_CONFIG.specialRooms);


function formatDateTimeExport(isoString: string) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  } catch (e) {
    return isoString;
  }
}

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

function AdminStudents() {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("_all");
  const [students, setStudents] = useState<LocalStudent[]>([]);
  const [allStudents, setAllStudents] = useState<LocalStudent[]>([]);
  const [allocating, setAllocating] = useState(false);
  const [showOccupancy, setShowOccupancy] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);


  const refresh = useCallback(async () => {
    try {
      const res = await listStudents({ data: {} });
      const all = res.rows as unknown as LocalStudent[];
      setAllStudents(all);

      let filtered = all;
      if (q) {
        const qs = q.toLowerCase();
        filtered = filtered.filter(
          (s) =>
            s.full_name?.toLowerCase().includes(qs) ||
            s.enrollment_no?.toLowerCase().includes(qs)
        );
      }
      if (dept !== "_all") {
        filtered = filtered.filter((s) => s.branch?.includes(dept));
      }
      setStudents(filtered);
    } catch (e) {
      console.warn("Failed to fetch students from Firebase", e);
    }
  }, [q, dept]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const allocatedCount = allStudents.filter((s) => s.room_no && s.room_no !== "OVERFLOW").length;
  const overflowCount = allStudents.filter((s) => s.room_no === "OVERFLOW").length;
  const unassignedCount = allStudents.filter((s) => !s.room_no).length;
  const slotsRemaining = Math.max(0, TOTAL_STUDENT_CAPACITY - allocatedCount);

  // ── Actions ──────────────────────────────────────────────────────────────
  const onAllocate = () => {
    setAllocating(true);
    setTimeout(async () => {
      try {
        const allRooms = generateAllRooms();
        
        // Count occupancies
        const occupancy: Record<string, number> = {};
        allStudents.forEach(s => {
          if (s.room_no && s.room_no !== "OVERFLOW") {
            occupancy[s.room_no] = (occupancy[s.room_no] || 0) + 1;
          }
        });

        const unallocated = allStudents
          .filter(s => !s.room_no)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const skipped = allStudents.filter((s) => !!s.room_no).length;
        let allocated = 0;
        let overflow = 0;
        let roomIdx = 0;
        const newRoomsUsed = new Set<string>();
        const updates: { id: string, patch: any }[] = [];

        for (const student of unallocated) {
          while (roomIdx < allRooms.length) {
            const cap = getRoomCapacity(allRooms[roomIdx]);
            if ((occupancy[allRooms[roomIdx]] ?? 0) < cap) break;
            roomIdx++;
          }

          if (roomIdx >= allRooms.length) {
            updates.push({ id: student.id, patch: { room_no: "OVERFLOW" } });
            overflow++;
          } else {
            const room = allRooms[roomIdx];
            updates.push({ id: student.id, patch: { room_no: room } });
            occupancy[room] = (occupancy[room] ?? 0) + 1;
            newRoomsUsed.add(room);
            allocated++;
          }
        }

        if (updates.length > 0) {
          await updateStudentsBatch({ data: { updates } });
        }

        const result = { allocated, skipped, overflow, roomsUsed: newRoomsUsed.size };

        if (result.allocated === 0 && result.overflow === 0) {
          toast.info("All students already have rooms assigned.");
        } else {
          const parts: string[] = [];
          if (result.allocated > 0)
            parts.push(
              `${result.allocated} students placed across ${result.roomsUsed} room${result.roomsUsed !== 1 ? "s" : ""}`
            );
          if (result.skipped > 0) parts.push(`${result.skipped} already assigned`);
          if (result.overflow > 0) parts.push(`${result.overflow} overflow (capacity full)`);
          toast.success(parts.join(" · "));
        }
        refresh();
      } catch (e: any) {
        console.error("Allocation error", e);
        toast.error("Allocation failed. Please try again.");
      } finally {
        setAllocating(false);
      }
    }, 100);
  };

  const onReset = async () => {
    try {
      const updates = allStudents
        .filter(s => s.room_no)
        .map(s => ({ id: s.id, patch: { room_no: null } }));
      
      if (updates.length > 0) {
        await updateStudentsBatch({ data: { updates } });
      }
      
      toast.info(`Room allocations cleared for ${updates.length} student${updates.length !== 1 ? "s" : ""}.`);
      refresh();
    } catch (e) {
      console.error("Failed to reset rooms", e);
      toast.error("Failed to reset room allocations.");
    }
  };

  
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
    { format: "csv",  label: "CSV",   Icon: FileText },
    { format: "xlsx", label: "Excel", Icon: FileSpreadsheet },
    { format: "pdf",  label: "PDF",   Icon: File },
    { format: "json", label: "JSON",  Icon: FileJson },
  ];


  const getRoomSummary = () => {
    const occupancy: Record<string, number> = {};
    allStudents.forEach(s => {
      if (s.room_no && s.room_no !== "OVERFLOW") {
        occupancy[s.room_no] = (occupancy[s.room_no] || 0) + 1;
      }
    });

    return generateAllRooms().map((room_no) => {
      const capacity = getRoomCapacity(room_no);
      const occupied = Math.min(occupancy[room_no] ?? 0, capacity);
      return {
        room_no,
        capacity,
        occupied,
        available: capacity - occupied,
        isSpecial: room_no in ROOM_CONFIG.specialRooms,
        fillPct: capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
      };
    });
  };

  // Load occupancy summary only when the grid is visible
  const roomSummary = showOccupancy ? getRoomSummary() : [];

  return (
    <AdminShell title="Students" subtitle={`Managing ${allStudents.length} registered students.`}>

      {/* ── Stats Banner ──────────────────────────────────────────────────── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatPill label="Total Students" value={allStudents.length} color="bg-primary/10 text-primary" />
        <StatPill label="Students Assigned" value={allocatedCount} color="bg-emerald-500/10 text-emerald-600" />
        <StatPill label="Unassigned" value={unassignedCount} color="bg-amber-500/10 text-amber-600" />
        <StatPill
          label="Slots Remaining"
          value={slotsRemaining.toLocaleString()}
          color="bg-muted text-muted-foreground"
        />
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              id="student-search"
              placeholder="Search name, enrollment..."
              className="pl-9 glass-card-hero"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-[180px] glass-card-hero">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Departments</SelectItem>
              <SelectItem value="SOET">SOET</SelectItem>
              <SelectItem value="SOMS">SOMS</SelectItem>
              <SelectItem value="SOLS">SOLS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            id="allocate-rooms-btn"
            onClick={onAllocate}
            disabled={allocating || unassignedCount === 0}
            variant="liquidGlassDark"
            className="rounded-full shadow-sm"
          >
            <Building2 className="mr-2 h-4 w-4" />
            {allocating
              ? "Allocating…"
              : `Allocate Rooms${unassignedCount > 0 ? ` (${unassignedCount})` : ""}`}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                id="reset-rooms-btn"
                variant="liquidGlassWhite"
                className="rounded-full"
                disabled={allocatedCount === 0 && overflowCount === 0}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset Rooms
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all room allocations?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove room assignments from all {allStudents.length} students and reset
                  occupancy counts to zero. You can re-run "Allocate Rooms" afterwards.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onReset}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Reset All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          
          {exportButtons.map(({ format, label, Icon }) => (
            <Button
              key={format}
              variant="liquidGlassWhite"
              size="sm"
              disabled={allStudents.length === 0 || exporting !== null}
              onClick={() => handleExport(format)}
              className="h-10 gap-1.5 text-sm text-[#2c1208] shadow-sm rounded-full"
            >
              {exporting === format ? (
                <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              ) : (
                <Icon className="h-4 w-4 text-[#8a4a22]" />
              )}
              {label}
            </Button>
          ))}


          <Button variant="liquidGlassWhite" className="rounded-full" disabled>
            <UserPlus className="mr-2 h-4 w-4" /> Add Student
          </Button>
        </div>
      </div>

      {/* ── Capacity Info Bar ─────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between glass-card-hero px-4 py-2.5 text-xs text-[#5a2c14] font-semibold">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            Format:{" "}
            <strong className="text-foreground font-mono">[Block][Floor][Room]</strong>
            {" · "}Blocks:{" "}
            <strong className="text-foreground">{(ROOM_CONFIG.blocks as readonly string[]).join(", ")}</strong>
            {" · "}
            <strong className="text-foreground">{ROOM_CONFIG.floors.length}</strong> floors ·{" "}
            <strong className="text-foreground">{ROOM_CONFIG.roomsPerFloor}</strong> rooms/floor
            {" · "}Standard:{" "}
            <strong className="text-foreground">72 students</strong>
            {" · "}Special (
            <strong className="text-foreground font-mono">{SPECIAL_ROOM_KEYS.join(", ")}</strong>
            ):{" "}
            <strong className="text-foreground">100 students</strong>
            {" · "}Total capacity:{" "}
            <strong className="text-foreground">{TOTAL_STUDENT_CAPACITY.toLocaleString()}</strong>
          </span>
        </div>
        <Button
          variant="liquidGlassWhite"
          size="sm"
          id="toggle-occupancy-btn"
          className="ml-4 h-7 gap-1.5 text-xs shrink-0 rounded-full"
          onClick={() => setShowOccupancy((v) => !v)}
        >
          {showOccupancy ? (
            <><EyeOff className="h-3 w-3" /> Hide grid</>
          ) : (
            <><Eye className="h-3 w-3" /> Room occupancy</>
          )}
        </Button>
      </div>

      {/* ── Room Occupancy Grid (expandable) ─────────────────────────────── */}
      {showOccupancy && (
        <div className="mb-5 rounded-xl glass-card-hero shadow-sm overflow-hidden">
          <div className="bg-muted/30 px-5 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold">Room Occupancy</h3>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded bg-muted border" /> Empty
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded bg-emerald-500/40 border border-emerald-400/40" /> Filling
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded bg-amber-500/40 border border-amber-400/40" /> High (≥80%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded bg-red-500/40 border border-red-400/40" /> Full
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded ring-1 ring-primary/60 bg-primary/10" /> Special (100 cap)
              </span>
            </div>
          </div>

          <div className="p-5 space-y-6">
            {(ROOM_CONFIG.blocks as readonly string[]).map((block) => (
              <div key={block}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary rounded px-2 py-0.5">
                    Block {block}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2.5">
                  {(ROOM_CONFIG.floors as readonly number[]).map((floor) => {
                    const floorRooms = roomSummary.filter((r) =>
                      r.room_no.startsWith(block + String(floor))
                    );
                    return (
                      <div key={floor} className="flex items-start gap-3">
                        <span className="text-[10px] font-semibold text-muted-foreground w-5 pt-2.5 shrink-0 tabular-nums">
                          F{floor}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {floorRooms.map((room) => (
                            <RoomCell key={room.room_no} {...room} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Student Table ─────────────────────────────────────────────────── */}
      <div className="rounded-xl glass-card-hero shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Student</TableHead>
              <TableHead>Enrollment No.</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Room No.</TableHead>
              <TableHead>Registered At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No students found.
                </TableCell>
              </TableRow>
            ) : (
              students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.full_name}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs uppercase">{s.enrollment_no}</TableCell>
                  <TableCell>
                    <div className="text-sm">{s.branch}</div>
                    <div className="text-xs text-muted-foreground">{s.semester}</div>
                  </TableCell>
                  <TableCell>
                    <RoomBadge room_no={s.room_no} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(s.created_at).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', hour12: true
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${color}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

function RoomBadge({ room_no }: { room_no?: string }) {
  if (!room_no) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Unassigned
      </span>
    );
  }
  if (room_no === "OVERFLOW") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        Contact Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold font-mono text-emerald-700 dark:text-emerald-400">
      <Building2 className="h-3 w-3" />
      {room_no}
    </span>
  );
}

type RoomSummaryItem = {
  room_no: string;
  capacity: number;
  occupied: number;
  available: number;
  isSpecial: boolean;
  fillPct: number;
};

function RoomCell({ room_no, capacity, occupied, fillPct, isSpecial }: RoomSummaryItem) {
  const isEmpty = occupied === 0;
  const isFull = fillPct >= 100;
  const isHigh = !isFull && fillPct >= 80;

  const bgCls = isEmpty
    ? "bg-muted/40 border-border"
    : isFull
    ? "bg-red-500/15 border-red-400/40"
    : isHigh
    ? "bg-amber-500/15 border-amber-400/40"
    : "bg-emerald-500/10 border-emerald-400/30";

  return (
    <div
      className={`relative rounded-lg border px-2 py-1.5 min-w-[52px] cursor-default select-none ${bgCls} ${
        isSpecial ? "ring-1 ring-primary/50" : ""
      }`}
      title={`${room_no}: ${occupied}/${capacity} students (${fillPct}%)${
        isSpecial ? " · Special capacity (100)" : ""
      }`}
    >
      <div className="font-mono text-[10px] font-bold leading-tight">{room_no}</div>
      <div className="text-[9px] text-muted-foreground leading-tight">
        {occupied}/{capacity}
      </div>
      {occupied > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-lg overflow-hidden">
          <div
            className={
              isFull
                ? "h-full bg-red-500"
                : isHigh
                ? "h-full bg-amber-500"
                : "h-full bg-emerald-500"
            }
            style={{ width: `${Math.min(fillPct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
