import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsQR } from "@/lib/admin.functions";
import { WidgetCard } from "./WidgetCard";
import type { AnalyticsFilters } from "./GlobalFilters";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

interface Props {
  token: string;
  filters: AnalyticsFilters;
}

export function QRAnalytics({ token, filters }: Props) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics-qr", filters],
    queryFn: () => getAnalyticsQR(token, filters),
  });

  const qrData = data?.data;
  const isError = error as Error | null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <WidgetCard
        title="Scan Velocity"
        subtitle="Scans per minute across events"
        id="qr-velocity"
        loading={isLoading}
        error={isError}
        empty={!qrData?.scansPerMinute?.length}
        onRetry={refetch}
        className="lg:col-span-2"
        csvData={qrData?.scansPerMinute}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={qrData?.scansPerMinute} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorScans" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="minute" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
            />
            <Area type="monotone" dataKey="scans" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorScans)" />
          </AreaChart>
        </ResponsiveContainer>
      </WidgetCard>

      <WidgetCard
        title="QR Error Breakdown"
        id="qr-errors"
        loading={isLoading}
        error={isError}
        empty={!qrData}
        onRetry={refetch}
      >
        <div className="flex flex-col justify-center h-full gap-4 px-4 w-full">
          <ErrorRow label="Successful" count={qrData?.successful} color="text-emerald-500" />
          <ErrorRow label="Failed (Generic)" count={qrData?.failed} color="text-red-500" />
          <ErrorRow label="Duplicates" count={qrData?.duplicates} color="text-amber-500" />
          <ErrorRow label="Invalid Token" count={qrData?.invalid} color="text-orange-500" />
          <ErrorRow label="Rate Limited" count={qrData?.rateLimited} color="text-purple-500" />
        </div>
      </WidgetCard>
    </div>
  );
}

function ErrorRow({ label, count, color }: { label: string, count?: number | null, color: string }) {
  if (count === undefined) return null;
  if (count === null) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-sm font-medium text-gray-500 italic">— Not Tracked</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <span className={`text-lg font-bold ${color}`}>{count}</span>
    </div>
  );
}
