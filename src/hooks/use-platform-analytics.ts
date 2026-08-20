import { useEffect, useState, useRef } from "react";

export const LIVE_IMPACT_ENABLED = false;

export interface PlatformStats {
  students: number;
  attendance: number;
  clubRegistrations: number;
  liveEvents: number;
  datasets: number;
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
    if (!LIVE_IMPACT_ENABLED) return;

    let cancelled = false;

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

    // Add visibility change listener to fetch immediately when tab becomes active again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchStats();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fresh]);

  if (!LIVE_IMPACT_ENABLED) {
    return { data: null, error: null, isLoading: false };
  }

  return { data, error, isLoading };
}
