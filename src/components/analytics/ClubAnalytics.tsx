import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsClubs } from "@/lib/admin.functions";
import { WidgetCard } from "./WidgetCard";
import type { AnalyticsFilters } from "./GlobalFilters";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface Props {
  token: string;
  filters: AnalyticsFilters;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function ClubAnalytics({ token, filters }: Props) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics-clubs", filters],
    queryFn: () => getAnalyticsClubs(token, filters),
  });

  const clubData = data?.data;
  const isError = error as Error | null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <WidgetCard
        title="Club Registrations Breakdown"
        id="clubs-pie"
        loading={isLoading}
        error={isError}
        empty={!clubData?.clubs?.length}
        onRetry={refetch}
        csvData={clubData?.clubs}
        csvFilename="clubs_registrations"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={clubData?.clubs}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="registrations"
              nameKey="name"
            >
              {clubData?.clubs?.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </WidgetCard>

      <WidgetCard
        title="Registration Trend"
        id="clubs-trend"
        loading={isLoading}
        error={isError}
        empty={!clubData?.trend?.length}
        onRetry={refetch}
        csvData={clubData?.trend}
        csvFilename="clubs_trend"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={clubData?.trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
            <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
            />
            <Line type="monotone" dataKey="registrations" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </WidgetCard>
    </div>
  );
}
