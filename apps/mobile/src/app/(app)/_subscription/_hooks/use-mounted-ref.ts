import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

/**
 * Tracks component mount state so async callbacks can self-bail after
 * unmount. Returns a MutableRefObject — the cleanup write to `.current`
 * requires write access (React 19's narrower `RefObject<T>` is read-only).
 */
export function useMountedRef(): MutableRefObject<boolean> {
  const ref = useRef(true);
  useEffect(() => {
    return () => {
      ref.current = false;
    };
  }, []);
  return ref;
}
