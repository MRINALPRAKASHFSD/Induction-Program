import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsAttendance } from "@/lib/admin.functions";
import { WidgetCard } from "./WidgetCard";
import type { AnalyticsFilters } from "./GlobalFilters";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";

interface Props {
  token: string;
  filters: AnalyticsFilters;
}

export function AttendanceAnalytics({ token, filters }: Props) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics-attendance", filters],
    queryFn: () => getAnalyticsAttendance(token, filters),
  });

  const attendanceData = data?.data;
  const isError = error as Error | null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <WidgetCard
        title="Attendance Over Time"
        id="attendance-trend"
        loading={isLoading}
        error={isError}
        empty={!attendanceData?.attendanceOverTime?.length}
        onRetry={refetch}
        csvData={attendanceData?.attendanceOverTime}
        csvFilename="attendance_trend"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={attendanceData?.attendanceOverTime} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
          </AreaChart>
        </ResponsiveContainer>
      </WidgetCard>

      <WidgetCard
        title="Attendance by School"
        id="attendance-school"
        loading={isLoading}
        error={isError}
        empty={!attendanceData?.bySchool?.length}
        onRetry={refetch}
        csvData={attendanceData?.bySchool}
        csvFilename="attendance_school"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={attendanceData?.bySchool} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
              cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
            />
            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </WidgetCard>
    </div>
  );
}
