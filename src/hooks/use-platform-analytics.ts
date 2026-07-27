import { useEffect, useState, useRef } from "react";

export interface PlatformStats {
  students: number;
  attendance: number;
  clubRegistrations: number;
  liveEvents: number;
  datasets: number;
  participants: number;
  announcements: number;
  campusLocations: number;
  communities: number;
}

export interface PlatformAnalyticsResponse {
  stats: PlatformStats;
  generatedAt: string;
  cacheAge: number;
  version: string;
  serviceStatus: "healthy" | "degraded" | "failed";
  stale: boolean;
  error?: string;
}

// Global cache for instant SWR-like display across component mounts
let globalCache: PlatformAnalyticsResponse | null = null;

export function usePlatformAnalytics({ fresh = false } = {}) {
  const [data, setData] = useState<PlatformAnalyticsResponse | null>(globalCache);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!globalCache);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    const fetchStats = async () => {
      // Prevent overlapping fetches
      if (isFetchingRef.current) return;
      
      // Smart polling: don't fetch if tab is hidden
      if (document.hidden) return;

      isFetchingRef.current = true;

      try {
        const url = `/api/v1/live-impact${fresh ? "?fresh=true" : ""}`;
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        
        const json: PlatformAnalyticsResponse = await res.json();
        
        if (!cancelled) {
          globalCache = json;
          setData(json);
          setError(null);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Platform Analytics fetch failed:", err);
          setError(err);
          // Do not overwrite data with null on error so we keep showing stale data if we had it
          setIsLoading(false);
        }
      } finally {
        isFetchingRef.current = false;
      }
    };

    // Fetch immediately on mount
    fetchStats();

    // Set up polling interval (15 seconds)
    timer = setInterval(fetchStats, 15000);

    // Add visibility change listener to fetch immediately when tab becomes active again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchStats();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fresh]);

  return { data, error, isLoading };
}
