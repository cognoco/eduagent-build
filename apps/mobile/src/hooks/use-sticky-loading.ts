import { useEffect, useRef, useState } from 'react';

/**
 * Returns a value that mirrors `active`, but stays `true` for at least
 * `minMs` after it first turned on. Prevents loading animations from
 * flashing by when the underlying request resolves faster than the user
 * can perceive the indicator.
 *
 * If `active` flips off and back on within the sticky window, the timer
 * is canceled and the original start time is preserved (no reset to
 * the new `true` edge).
 *
 * Trade-off of preserving the original start time: a rapid true→false→
 * true→false sequence within the window will use the *original* start
 * for the second off-edge calculation, so the second cycle has a
 * shorter (or zero) sticky hold. This is intentional — a brief flicker
 * of `false` between two retries should not extend the loading
 * indicator past the user's expectation. A new sticky window only
 * begins after the indicator has actually turned off (startedAtRef is
 * cleared by the timer callback or the immediate-drop branch).
 */
export function useStickyLoading(active: boolean, minMs = 1200): boolean {
  const [sticky, setSticky] = useState(active);
  const startedAtRef = useRef<number | null>(active ? Date.now() : null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (active) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (startedAtRef.current === null) {
        startedAtRef.current = Date.now();
      }
      setSticky(true);
      return;
    }

    const start = startedAtRef.current;
    if (start === null) {
      setSticky(false);
      return;
    }

    const remaining = minMs - (Date.now() - start);
    if (remaining <= 0) {
      startedAtRef.current = null;
      setSticky(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      startedAtRef.current = null;
      timerRef.current = null;
      setSticky(false);
    }, remaining);
  }, [active, minMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return sticky;
}
