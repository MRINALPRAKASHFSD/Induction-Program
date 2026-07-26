import React from "react";
import { AlertCircle, TrendingUp, TrendingDown, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsOverview } from "@/lib/admin.functions";

interface Props {
  token: string;
}

export function InsightsPanel({ token }: Props) {
  const { data } = useQuery({
    queryKey: ["analytics-overview-insights"],
    queryFn: () => getAnalyticsOverview(token),
  });

  const stats = data?.data;
  
  // Deterministic insights generation
  const insights = [];

  if (stats) {
    if (stats.averageAttendance < 65) {
      insights.push({
        type: 'warning',
        title: 'Low Overall Attendance',
        message: 'Average attendance is below 65%. Consider sending SMS reminders to students.',
        icon: <AlertCircle className="w-5 h-5 text-red-500" />,
        bg: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
      });
    }

    if (stats.totalScans > 5000) {
      insights.push({
        type: 'positive',
        title: 'High Engagement',
        message: 'Over 5,000 successful scans recorded. The induction is proceeding at high volume.',
        icon: <TrendingUp className="w-5 h-5 text-emerald-500" />,
        bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
      });
    }
    
    // Add generic info if none apply
    if (insights.length === 0) {
      insights.push({
        type: 'info',
        title: 'System Stable',
        message: 'Metrics are within expected ranges. No urgent anomalies detected.',
        icon: <Info className="w-5 h-5 text-blue-500" />,
        bg: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20'
      });
    }
  }

  if (!stats) return null;

  return (
    <div className="mb-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        Key Insights
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {insights.map((insight, idx) => (
          <div key={idx} className={`p-4 rounded-xl border ${insight.bg} flex items-start gap-3`}>
            <div className="mt-0.5">{insight.icon}</div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">{insight.title}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">{insight.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
