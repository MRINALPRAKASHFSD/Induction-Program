import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsActivity } from "@/lib/admin.functions";
import { WidgetCard } from "./WidgetCard";
import { Clock, User } from "lucide-react";

interface Props {
  token: string;
}

export function LiveActivityFeed({ token }: Props) {
  // Feed only needs limit, no complex filters for now
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics-activity"],
    queryFn: () => getAnalyticsActivity(token, 15),
    refetchInterval: 15000, // Every 15 seconds
  });

  const feedData = data?.data || [];
  const isError = error as Error | null;

  return (
    <div className="mb-6">
      <WidgetCard
        title="Live System Activity"
        subtitle="Real-time audit log of platform actions"
        id="activity-feed"
        loading={isLoading}
        error={isError}
        empty={!feedData.length}
        onRetry={refetch}
        csvData={feedData}
      >
        <div className="overflow-y-auto pr-2 custom-scrollbar w-full" style={{ maxHeight: "400px" }}>
          <div className="space-y-4 pt-2">
            {feedData.map((log: any) => (
              <div key={log.id} className="flex gap-4 group">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 group-hover:scale-150 transition-transform"></div>
                  <div className="w-px h-full bg-gray-200 dark:bg-gray-800 -mb-4 mt-2"></div>
                </div>
                <div className="pb-4 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                    <span className="font-semibold text-gray-900 dark:text-white">{log.action}</span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{log.details}</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 font-medium">
                    <User className="w-3 h-3" />
                    {log.user}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </WidgetCard>
    </div>
  );
}
