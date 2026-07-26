import { createLazyFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/config";
import { AdminShell } from "@/components/admin-shell";
import { GlobalFilters, AnalyticsFilters } from "@/components/analytics/GlobalFilters";
import { KPICards } from "@/components/analytics/KPICards";
import { AttendanceAnalytics } from "@/components/analytics/AttendanceAnalytics";
import { EventAnalytics } from "@/components/analytics/EventAnalytics";
import { ClubAnalytics } from "@/components/analytics/ClubAnalytics";
import { StudentAnalytics } from "@/components/analytics/StudentAnalytics";
import { QRAnalytics } from "@/components/analytics/QRAnalytics";
import { LiveActivityFeed } from "@/components/analytics/LiveActivityFeed";
import { InsightsPanel } from "@/components/analytics/InsightsPanel";
import { ExportCentre } from "@/components/analytics/ExportCentre";
import { Loader2 } from "lucide-react";

export const Route = createLazyFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics Dashboard · KRMU Admin" },
    ],
  }),
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const [token, setToken] = useState<string | null>(null);
  const [filters, setFilters] = useState<AnalyticsFilters>({ dateRange: "last7" });

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const t = await user.getIdToken();
        setToken(t);
      } else {
        setToken(null);
      }
    });
    return () => unsub();
  }, []);

  if (!token) {
    return (
      <AdminShell title="Analytics Dashboard">
        <div className="flex items-center justify-center h-64 w-full">
          <div className="flex flex-col items-center justify-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
            <p>Loading analytics engine...</p>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell 
      title="Analytics Dashboard" 
      subtitle="Central intelligence for the induction platform. Track attendance, event performance, and student engagement."
    >
      <div className="max-w-7xl mx-auto space-y-2 pb-12">
        <ExportCentre token={token} />
        
        <GlobalFilters 
          filters={filters} 
          onChange={setFilters} 
          onClear={() => setFilters({ dateRange: "last7" })} 
        />
        
        <InsightsPanel token={token} />
        
        <KPICards token={token} filters={filters} />
        
        <AttendanceAnalytics token={token} filters={filters} />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EventAnalytics token={token} filters={filters} />
          <StudentAnalytics token={token} filters={filters} />
        </div>
        
        <ClubAnalytics token={token} filters={filters} />
        
        <QRAnalytics token={token} filters={filters} />
        
        <LiveActivityFeed token={token} />
      </div>
    </AdminShell>
  );
}
