import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { AdminShell } from "@/components/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getAnalytics } from "@/lib/admin.functions";

export const Route = createLazyFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminAnalytics,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

type Data = {
  totals: { students: number; attendance: number; clubs: number; events: number; };
  byDept: { name: string; value: number }[];
  byYear: { name: string; value: number }[];
  byEvent: { name: string; value: number }[];
  byHour: { name: string; value: number }[];
  byClub: { name: string; count: number }[];
};

function AdminAnalytics() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      try {
        const stats = await getAnalytics();
        if (active) {
          setData(stats);
        }
      } catch (e) {
        console.error("Failed to fetch analytics", e);
      }
    };
    fetchStats();
    return () => { active = false; };
  }, []);

  if (!data) return <AdminShell title="Analytics"><div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div></AdminShell>;

  return (
    <AdminShell title="Analytics" subtitle="Department spread, attendance peaks, club popularity.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Students by department">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.byDept}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={60} className="text-xs" />
              <YAxis allowDecimals={false} className="text-xs" />
              <Tooltip />
              <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Students by year">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data.byYear} dataKey="value" nameKey="name" outerRadius={100} label>
                {data.byYear.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend /><Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Attendance by session">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.byEvent} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" allowDecimals={false} className="text-xs" />
              <YAxis dataKey="name" type="category" width={160} className="text-xs" />
              <Tooltip />
              <Bar dataKey="value" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Scans by hour of day">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.byHour}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis allowDecimals={false} className="text-xs" />
              <Tooltip />
              <Bar dataKey="value" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Club popularity" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.byClub}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={70} className="text-xs" />
              <YAxis allowDecimals={false} className="text-xs" />
              <Tooltip />
              <Bar dataKey="count" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </AdminShell>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border glass-card-hero p-4 shadow-sm ${className}`}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
