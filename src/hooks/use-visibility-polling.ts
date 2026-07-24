/**
 * src/hooks/use-visibility-polling.ts
 *
 * Smart polling hook that leverages the Page Visibility API.
 *
 * Behavior:
 *   - Polls `callback` at `intervalMs` while the tab is visible.
 *   - Pauses immediately when the tab is hidden (user switches to another tab).
 *   - Resumes immediately (and fires once) when the user returns.
 *   - Stops cleanly on component unmount.
 *   - Returns a `refresh` function for manual on-demand refresh.
 *   - Does nothing when `enabled` is false (use to pause programmatically).
 *
 * Usage:
 *   const { refresh } = useVisibilityPolling(fetchData, 15_000);
 */

import { useCallback, useEffect, useRef } from 'react';

export interface UseVisibilityPollingOptions {
  /** Whether polling is active. Default true. Set to false to pause. */
  enabled?: boolean;
}

export function useVisibilityPolling(
  callback: () => void,
  intervalMs: number,
  options: UseVisibilityPollingOptions = {},
): { refresh: () => void } {
  const { enabled = true } = options;

  // Stable ref to the latest callback — avoids stale closures
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; }, [callback]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    }, intervalMs);
  }, [intervalMs]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const refresh = useCallback(() => {
    callbackRef.current();
    // Reset the interval so next poll is `intervalMs` after the manual refresh
    if (enabled) startPolling();
  }, [enabled, startPolling]);

  useEffect(() => {
    if (!enabled) {
      stopPolling();
      return;
    }

    // Page Visibility API handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Resume — fire immediately on return, then restart interval
        callbackRef.current();
        startPolling();
      } else {
        stopPolling();
      }
    };

    // Start polling immediately if tab is visible
    if (document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
    };
  }, [enabled, startPolling, stopPolling]);

  return { refresh };
}
