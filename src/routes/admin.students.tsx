import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listStudents, exportStudentsCsv } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/students")({
  head: () => ({ meta: [{ title: "Students · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminStudents,
});

type Row = {
  id: string; full_name: string; enrollment_no: string; email: string;
  phone: string; course: string; year: number; department_id: string; created_at: string;
};

const PAGE = 50;

function AdminStudents() {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("all");
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const list = useServerFn(listStudents);
  const exp = useServerFn(exportStudentsCsv);

  useEffect(() => {
    supabase.from("departments").select("id, name").order("name").then(({ data }) => setDepts(data ?? []));
  }, []);

  const load = async (nextOffset = 0) => {
    setBusy(true);
    try {
      const res = await list({ data: { q: q || undefined, department_id: dept === "all" ? null : dept, limit: PAGE, offset: nextOffset } });
      setRows(res.rows as Row[]); setTotal(res.total); setOffset(nextOffset);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  useEffect(() => { load(0); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const t = setTimeout(() => load(0), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q, dept]);

  const download = async () => {
    try {
      const { csv } = await exp({ data: undefined as any });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `krmu-students-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (e: any) { toast.error(e.message); }
  };

  const deptName = (id: string) => depts.find((d) => d.id === id)?.name ?? "—";

  return (
    <AdminShell title="Students" subtitle={`${total.toLocaleString()} registered`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, enrollment, email…" className="pl-9" />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="All departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={download} variant="outline"><Download className="mr-1 h-4 w-4" /> CSV</Button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-sm">
        {!rows ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No students match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Enrollment</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Course</th>
                <th className="px-4 py-2">Year</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Registered</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{r.full_name}</td>
                  <td className="px-4 py-2 tabular-nums">{r.enrollment_no}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.email}</td>
                  <td className="px-4 py-2">{r.course}</td>
                  <td className="px-4 py-2">{r.year}</td>
                  <td className="px-4 py-2">{deptName(r.department_id)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {rows && rows.length > 0 && `Showing ${offset + 1}–${offset + rows.length} of ${total}`}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={busy || offset === 0} onClick={() => load(Math.max(0, offset - PAGE))}>Prev</Button>
          <Button variant="outline" size="sm" disabled={busy || offset + PAGE >= total} onClick={() => load(offset + PAGE)}>Next</Button>
        </div>
      </div>
    </AdminShell>
  );
}
