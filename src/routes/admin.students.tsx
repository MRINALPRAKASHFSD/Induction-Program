import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, Download, UserPlus } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localDb, type LocalStudent } from "@/lib/local-db";

export const Route = createFileRoute("/admin/students")({
  head: () => ({ meta: [{ title: "Students · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminStudents,
});

function AdminStudents() {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("_all");
  const [students, setStudents] = useState<LocalStudent[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let all = localDb.getStudents();
    
    if (q) {
      const qs = q.toLowerCase();
      all = all.filter(s => 
        s.full_name.toLowerCase().includes(qs) || 
        s.enrollment_no.toLowerCase().includes(qs)
      );
    }

    if (dept !== "_all") {
      // Very basic filtering based on string match in branch
      all = all.filter(s => s.branch.includes(dept));
    }

    setStudents(all);
    setTotal(all.length);
  }, [q, dept]);

  const onExport = () => {
    const all = localDb.getStudents();
    const header = ["enrollment_no", "full_name", "branch", "semester", "created_at"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      header.join(","),
      ...all.map(r => [r.enrollment_no, r.full_name, r.branch, r.semester, r.created_at].map(esc).join(","))
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
    <AdminShell title="Students" subtitle={`Managing ${total} registered students.`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={onExport} disabled={total === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" /> Add Student
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Student</TableHead>
              <TableHead>Enrollment No.</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Registered At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
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
