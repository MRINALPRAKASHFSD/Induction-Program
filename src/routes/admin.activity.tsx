import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { listActivityLogs } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/activity")({
  head: () => ({ meta: [{ title: "Activity log · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminActivity,
});

type Row = { id: string; actor_id: string | null; action: string; entity: string; entity_id: string | null; meta: any; created_at: string };

function AdminActivity() {
  const fn = useServerFn(listActivityLogs);
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { fn({ data: { limit: 200 } }).then((r) => setRows(r as Row[])); }, [fn]);

  return (
    <AdminShell title="Activity log" subtitle="Recent admin and coordinator actions.">
      {!rows ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Entity</th><th className="px-4 py-2">Details</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-2">{r.entity}</td>
                  <td className="px-4 py-2 max-w-md"><pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(r.meta, null, 0)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
