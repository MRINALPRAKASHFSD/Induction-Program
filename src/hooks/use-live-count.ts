import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Subscribe to a table's row count, updating live via realtime postgres_changes. */
export function useLiveCount(table: "students" | "attendance" | "club_registrations" | "events") {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { count: c } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (!cancelled) setCount(c ?? 0);
    };
    load();

    const channel = supabase
      .channel(`live-${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [table]);

  return count;
}
