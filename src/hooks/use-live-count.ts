import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export function useLiveCount(table: "students" | "attendance" | "club_registrations" | "events") {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const tableRef = collection(db, table);
    const unsubscribe = onSnapshot(tableRef, (snap) => {
      setCount(snap.size);
    }, (error) => {
      console.error(`Error fetching live count for ${table}:`, error);
    });

    return () => unsubscribe();
  }, [table]);

  return count;
}
