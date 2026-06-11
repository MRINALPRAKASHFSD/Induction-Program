import { useEffect, useState } from "react";
import { collection, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export function useLiveCount(table: "students" | "attendance" | "club_registrations" | "events") {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const coll = collection(db, table);
        const snapshot = await getCountFromServer(coll);
        if (!cancelled) {
          setCount(snapshot.data().count);
        }
      } catch (err) {
        console.error(`Failed to fetch count for ${table}:`, err);
      }
    }

    // Fetch immediately, then poll every 15 seconds
    fetchCount();
    const interval = setInterval(fetchCount, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [table]);

  return count;
}
