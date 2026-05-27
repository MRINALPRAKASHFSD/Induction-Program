import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Search, Download, UserPlus, Building2, RotateCcw, Layers } from "lucide-react";
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
import { localDb, ROOM_CONFIG, generateAllRooms, type LocalStudent } from "@/lib/local-db";

export const Route = createFileRoute("/admin/students")({
  head: () => ({ meta: [{ title: "Students · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminStudents,
});

const TOTAL_ROOMS = ROOM_CONFIG.blocks.length * ROOM_CONFIG.floors.length * ROOM_CONFIG.roomsPerFloor;

function AdminStudents() {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("_all");
  const [students, setStudents] = useState<LocalStudent[]>([]);
  const [allStudents, setAllStudents] = useState<LocalStudent[]>([]);
  const [allocating, setAllocating] = useState(false);

  const refresh = useCallback(() => {
    const all = localDb.getStudents();
    setAllStudents(all);

    let filtered = all;
    if (q) {
      const qs = q.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.full_name.toLowerCase().includes(qs) ||
          s.enrollment_no.toLowerCase().includes(qs)
      );
    }
    if (dept !== "_all") {
      filtered = filtered.filter((s) => s.branch.includes(dept));
    }
    setStudents(filtered);
  }, [q, dept]);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("local-db-update", handler);
    return () => window.removeEventListener("local-db-update", handler);
  }, [refresh]);

  // ── Stats derived from all students ─────────────────────────────────────
  const allocated = allStudents.filter((s) => s.room_no && s.room_no !== "OVERFLOW").length;
  const overflow = allStudents.filter((s) => s.room_no === "OVERFLOW").length;
  const unassigned = allStudents.filter((s) => !s.room_no).length;
  const remaining = Math.max(0, TOTAL_ROOMS - allocated);

  // ── Actions ──────────────────────────────────────────────────────────────
  const onAllocate = () => {
    setAllocating(true);
    setTimeout(() => {
      try {
        const result = localDb.allocateRooms();
        if (result.allocated === 0 && result.overflow === 0) {
          toast.info("All students already have rooms assigned.");
        } else {
          const parts: string[] = [];
          if (result.allocated > 0) parts.push(`✓ ${result.allocated} room${result.allocated !== 1 ? "s" : ""} assigned`);
          if (result.skipped > 0) parts.push(`${result.skipped} already had rooms`);
          if (result.overflow > 0) parts.push(`⚠ ${result.overflow} overflow (capacity exceeded)`);
          toast.success(parts.join(" · "));
        }
        refresh();
      } catch (err) {
        toast.error("Allocation failed. Please try again.");
      } finally {
        setAllocating(false);
      }
    }, 100); // small tick so the button shows its loading state
  };

  const onReset = () => {
    const result = localDb.resetRoomAllocations();
    toast.info(`Room allocations cleared for ${result.cleared} student${result.cleared !== 1 ? "s" : ""}.`);
    refresh();
  };

  const onExport = () => {
    const all = localDb.getStudents();
    const header = ["enrollment_no", "full_name", "branch", "semester", "room_no", "created_at"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      header.join(","),
      ...all.map((r) =>
        [r.enrollment_no, r.full_name, r.branch, r.semester, r.room_no ?? "", r.created_at]
          .map(esc)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `krmu_students_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AdminShell title="Students" subtitle={`Managing ${allStudents.length} registered students.`}>

      {/* ── Allocation Stats Banner ────────────────────────────────────────── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatPill label="Total Students" value={allStudents.length} color="bg-primary/10 text-primary" />
        <StatPill label="Rooms Assigned" value={allocated} color="bg-emerald-500/10 text-emerald-600" />
        <StatPill label="Unassigned" value={unassigned} color="bg-amber-500/10 text-amber-600" />
        <StatPill label="Capacity Remaining" value={remaining} color="bg-muted text-muted-foreground" />
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
              className="pl-9 bg-card"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-[180px] bg-card">
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
            disabled={allocating || unassigned === 0}
            className="bg-gradient-to-r from-primary to-primary/80 shadow-sm"
          >
            <Building2 className="mr-2 h-4 w-4" />
            {allocating ? "Allocating…" : `Allocate Rooms${unassigned > 0 ? ` (${unassigned})` : ""}`}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                id="reset-rooms-btn"
                variant="outline"
                disabled={allocated === 0 && overflow === 0}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset Rooms
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all room allocations?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove room assignments from all {allStudents.length} students.
                  You can run "Allocate Rooms" again afterwards. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Reset All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button variant="outline" onClick={onExport} disabled={allStudents.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>

          <Button variant="outline" disabled>
            <UserPlus className="mr-2 h-4 w-4" /> Add Student
          </Button>
        </div>
      </div>

      {/* ── Capacity Info ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-2 rounded-lg border bg-card/60 px-4 py-2.5 text-xs text-muted-foreground">
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span>
          Room format: <strong className="text-foreground font-mono">[Block][Floor][Room]</strong>
          {" "}e.g. <strong className="text-foreground font-mono">A109</strong> ·
          Blocks: <strong className="text-foreground">{ROOM_CONFIG.blocks.join(", ")}</strong> ·
          Floors: <strong className="text-foreground">{ROOM_CONFIG.floors.join("–")}</strong> ·
          {" "}<strong className="text-foreground">{ROOM_CONFIG.roomsPerFloor}</strong> rooms/floor ·
          Total capacity: <strong className="text-foreground">{TOTAL_ROOMS}</strong>
        </span>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
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
                    {new Date(s.created_at).toLocaleDateString()}
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

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
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
