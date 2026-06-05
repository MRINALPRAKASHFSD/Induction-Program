import { useEffect, useState } from "react";

export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    // The admin panel relies on a local session state for access
    const isLogged = !!sessionStorage.getItem("krmu_admin_session");
    
    if (isMounted) {
      setUserId(isLogged ? "admin-user" : null);
      setLoading(false);
    }
    
    return () => {
      isMounted = false;
    };
  }, []);

  return { userId, loading };
}
