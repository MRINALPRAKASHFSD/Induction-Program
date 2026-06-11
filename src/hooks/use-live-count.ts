import { useQuery } from "@tanstack/react-query";

async function fetchLiveImpact() {
  const res = await fetch("/api/live-impact");
  if (!res.ok) {
    throw new Error("Failed to fetch live impact counts");
  }
  return res.json();
}

export function useLiveCount(table: "students" | "attendance" | "club_registrations" | "events") {
  const { data } = useQuery({
    queryKey: ["live-impact"],
    queryFn: fetchLiveImpact,
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 5000,
    retry: 2,
  });

  if (!data) return null;

  switch (table) {
    case "students": return data.students ?? null;
    case "attendance": return data.attendance ?? null;
    case "club_registrations": return data.clubs ?? null;
    default: return null;
  }
}
