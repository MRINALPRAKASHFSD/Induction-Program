import { useEffect, useState } from "react";

export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};

    Promise.all([
      import("@/lib/firebase/config"),
      import("firebase/auth")
    ]).then(([{ auth }, { onAuthStateChanged }]) => {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          setUserId(null);
        }
        setLoading(false);
      });
    }).catch(err => {
      console.error("Failed to load Firebase auth in useSession", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { userId, loading };
}
