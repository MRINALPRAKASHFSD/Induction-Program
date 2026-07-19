import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { listActivityLogs } from "@/lib/admin.functions";
import type { LocalActivityLog } from "@/lib/local-db";

export const Route = createLazyFileRoute("/admin/activity")({
  head: () => ({ meta: [{ title: "Activity log · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminActivity,
});

function AdminActivity() {
  const [rows, setRows] = useState<LocalActivityLog[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await listActivityLogs({ data: {} });
        if (active) setRows(data as unknown as LocalActivityLog[]);
      } catch (e) {
        console.error("Failed to load activity logs", e);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  return (
    <AdminShell title="Activity log" subtitle="Recent admin and coordinator actions.">
      {!rows ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border glass-card-hero p-8 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border glass-card-hero shadow-sm">
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
