import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsEvents } from "@/lib/admin.functions";
import { WidgetCard } from "./WidgetCard";
import type { AnalyticsFilters } from "./GlobalFilters";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

interface Props {
  token: string;
  filters: AnalyticsFilters;
}

export function EventAnalytics({ token, filters }: Props) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics-events", filters],
    queryFn: () => getAnalyticsEvents(token, filters),
  });

  const eventData = data?.data?.events || [];
  const isError = error as Error | null;

  return (
    <div className="mb-6">
      <WidgetCard
        title="Event Attendance Performance"
        subtitle="Comparing attendance vs capacity for active events"
        id="events-performance"
        loading={isLoading}
        error={isError}
        empty={!eventData.length}
        onRetry={refetch}
        csvData={eventData}
        csvFilename="events_performance"
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={eventData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
            <XAxis dataKey="title" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
              cursor={{ fill: 'rgba(236, 72, 153, 0.1)' }}
            />
            <Bar dataKey="attendance" name="Attendance" radius={[4, 4, 0, 0]} maxBarSize={50}>
              {eventData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={entry.percentage < 50 ? '#f43f5e' : entry.percentage > 90 ? '#10b981' : '#ec4899'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </WidgetCard>
    </div>
  );
}
