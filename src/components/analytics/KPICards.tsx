import React from "react";
import { Users, UserCheck, Activity, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsOverview } from "@/lib/admin.functions";
import type { AnalyticsFilters } from "./GlobalFilters";

interface KPICardsProps {
  token: string;
  filters: AnalyticsFilters;
}

export function KPICards({ token, filters }: KPICardsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics-overview", filters],
    queryFn: () => getAnalyticsOverview(token, filters),
    refetchInterval: 60000, // 1 minute
  });

  const stats = data?.data ? {
    totalStudents: data.data.registrations?.total ?? 0,
    activeStudents: data.data.registrations?.active ?? 0,
    averageAttendance: data.data.attendance?.percentage ?? 0,
    totalScans: data.data.qrActivity?.scans ?? 0
  } : {
    totalStudents: 0,
    activeStudents: 0,
    averageAttendance: 0,
    totalScans: 0
  };

  const isWarning = (stat: number, threshold: number) => stat < threshold;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <KPICard
        title="Total Students"
        value={stats.totalStudents}
        icon={<Users className="w-5 h-5 text-blue-500" />}
        loading={isLoading}
        error={error as Error}
        color="blue"
      />
      <KPICard
        title="Active Students"
        value={stats.activeStudents}
        icon={<UserCheck className="w-5 h-5 text-emerald-500" />}
        loading={isLoading}
        error={error as Error}
        color="emerald"
        warning={isWarning(stats.activeStudents, stats.totalStudents * 0.5) ? "Low activity" : undefined}
      />
      <KPICard
        title="Avg. Attendance"
        value={`${stats.averageAttendance}%`}
        icon={<Activity className="w-5 h-5 text-amber-500" />}
        loading={isLoading}
        error={error as Error}
        color="amber"
        warning={isWarning(stats.averageAttendance, 70) ? "Below 70%" : undefined}
      />
      <KPICard
        title="Total Scans"
        value={stats.totalScans}
        icon={<Search className="w-5 h-5 text-indigo-500" />}
        loading={isLoading}
        error={error as Error}
        color="indigo"
      />
    </div>
  );
}

function KPICard({ 
  title, 
  value, 
  icon, 
  loading, 
  error, 
  color, 
  warning 
}: { 
  title: string, 
  value: string | number, 
  icon: React.ReactNode, 
  loading: boolean, 
  error?: Error | null,
  color: string,
  warning?: string
}) {
  const bgColors: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-500/10",
    emerald: "bg-emerald-50 dark:bg-emerald-500/10",
    amber: "bg-amber-50 dark:bg-amber-500/10",
    indigo: "bg-indigo-50 dark:bg-indigo-500/10"
  };

  return (
    <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-white/20 shadow-sm rounded-2xl p-5 flex flex-col justify-between h-[120px] relative overflow-hidden group">
      {/* Background glow */}
      <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity ${bgColors[color] || 'bg-gray-50'}`} />
      
      <div className="flex items-start justify-between relative z-10">
        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h4>
        <div className={`p-2 rounded-xl ${bgColors[color]}`}>
          {icon}
        </div>
      </div>
      
      <div className="relative z-10">
        {loading ? (
          <div className="h-8 w-24 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        ) : error ? (
          <p className="text-sm text-red-500 font-medium">Error loading</p>
        ) : (
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
            {warning && (
              <span className="text-xs font-medium text-red-500 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full mb-1">
                {warning}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
