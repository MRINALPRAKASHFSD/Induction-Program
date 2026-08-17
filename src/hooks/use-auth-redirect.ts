import { useEffect, useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";

type Options = {
  /** If set and user IS authenticated, navigate here immediately. */
  redirectIfAuthenticated?: string;
  /** If set and user is NOT authenticated after auth resolves, navigate here. */
  redirectIfUnauthenticated?: string;
};

/**
 * Observes Firebase Auth state and optionally redirects based on result.
 *
 * Firebase is the single source of truth.
 * Never reads localStorage to determine auth status.
 *
 * Usage:
 *   // On /login — redirect to dashboard if already signed in
 *   const { user, loading } = useAuthRedirect({ redirectIfAuthenticated: '/' });
 *
 *   // On / — redirect to login if not signed in (if it were a protected route)
 *   const { user, loading } = useAuthRedirect({ redirectIfUnauthenticated: '/login' });
 *
 *   // Just observe, no redirect
 *   const { user, loading } = useAuthRedirect();
 */
export function useAuthRedirect(options: Options = {}) {
  const { redirectIfAuthenticated, redirectIfUnauthenticated } = options;
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  // Prevent double-redirect in StrictMode
  const redirected = useRef(false);

  useEffect(() => {
    let unsubscribe = () => {};

    Promise.all([
      import("@/lib/firebase/config"),
      import("firebase/auth"),
    ])
      .then(([{ auth }, { onAuthStateChanged }]) => {
        unsubscribe = onAuthStateChanged(auth, (firebaseUser: any) => {
          setUser(firebaseUser);
          setLoading(false);

          if (redirected.current) return;

          if (firebaseUser && redirectIfAuthenticated) {
            redirected.current = true;
            navigate({ to: redirectIfAuthenticated as any, replace: true });
          } else if (!firebaseUser && redirectIfUnauthenticated) {
            redirected.current = true;
            navigate({ to: redirectIfUnauthenticated as any, replace: true });
          }
        });
      })
      .catch((err: any) => {
        console.error("useAuthRedirect: Firebase failed to load", err);
        setLoading(false);
      });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, loading };
}
