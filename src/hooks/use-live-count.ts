import { useEffect, useState } from "react";
import { localDb } from "@/lib/local-db";

export function useLiveCount(table: "students" | "attendance" | "club_registrations" | "events") {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const load = () => {
      let c = 0;
      if (table === "students") c = localDb.getStudents().length;
      if (table === "attendance") c = localDb.getAllAttendance().length;
      if (table === "club_registrations") c = localDb.getClubRegistrations().length;
      if (table === "events") c = localDb.getEvents().length;
      setCount(c);
    };

    load();

    const handler = () => load();
    window.addEventListener("local-db-update", handler);
    return () => window.removeEventListener("local-db-update", handler);
  }, [table]);

  return count;
}
