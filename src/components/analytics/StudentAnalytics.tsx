import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsStudents } from "@/lib/admin.functions";
import { WidgetCard } from "./WidgetCard";
import type { AnalyticsFilters } from "./GlobalFilters";
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";

interface Props {
  token: string;
  filters: AnalyticsFilters;
}

export function StudentAnalytics({ token, filters }: Props) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics-students", filters],
    queryFn: () => getAnalyticsStudents(token, filters),
  });

  const studentData = data?.data;
  const isError = error as Error | null;

  return (
    <div className="mb-6">
      <WidgetCard
        title="Student Pipeline & Status"
        id="students-status"
        loading={isLoading}
        error={isError}
        empty={!studentData}
        onRetry={refetch}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full h-full p-4">
          <StatusBox 
            title="Verified" 
            count={studentData?.verified} 
            total={studentData?.total} 
            icon={<CheckCircle className="text-emerald-500 w-6 h-6" />} 
          />
          <StatusBox 
            title="Pending" 
            count={studentData?.pending} 
            total={studentData?.total} 
            icon={<Clock className="text-amber-500 w-6 h-6" />} 
          />
          <StatusBox 
            title="Inactive" 
            count={studentData?.inactive} 
            total={studentData?.total} 
            icon={<AlertTriangle className="text-orange-500 w-6 h-6" />} 
          />
          <StatusBox 
            title="Suspended" 
            count={studentData?.suspended} 
            total={studentData?.total} 
            icon={<XCircle className="text-red-500 w-6 h-6" />} 
          />
        </div>
      </WidgetCard>
    </div>
  );
}

function StatusBox({ title, count, total, icon }: { title: string, count?: number, total?: number, icon: React.ReactNode }) {
  if (count === undefined || total === undefined || total === 0) return null;
  const percentage = Math.round((count / total) * 100);
  
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
      <div className="mb-2">{icon}</div>
      <h4 className="text-2xl font-bold text-gray-900 dark:text-white">{count}</h4>
      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-2">{title}</p>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-auto">
        <div 
          className="bg-indigo-500 h-1.5 rounded-full" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <span className="text-xs text-gray-400 mt-1">{percentage}% of total</span>
    </div>
  );
}
