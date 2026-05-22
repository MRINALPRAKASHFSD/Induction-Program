import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let subscription: any;
    let isMounted = true;
    
    const timeout = setTimeout(() => {
      if (isMounted && loading) {
        console.error("Supabase session fetch timed out after 3s");
        setLoading(false);
      }
    }, 3000);

    // Bypass Supabase Auth completely for testing
    setUserId("fake-admin-user-id");
    setLoading(false);
    
    return () => {
      isMounted = false;
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, []);

  return { userId, loading };
}
