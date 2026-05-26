import { useCallback } from 'react';
import { useMountedRef } from './use-mounted-ref';

export type PollOutcome = 'confirmed' | 'unconfirmed' | 'unmounted';

export interface PollConfig<T> {
  /** Called on each attempt to fetch the latest server-side state. */
  fetchProbe: () => Promise<T>;
  /** Pure predicate — returns true once the desired state has arrived. */
  isConfirmed: (probe: T) => boolean;
  /** Optional one-shot side-effect fired 10s into polling (top-up uses this for the "still confirming" copy). */
  onSlowPoll?: () => void;
  /** Default: 15. */
  maxAttempts?: number;
  /** Default: 2000. */
  pollIntervalMs?: number;
}

export interface PurchaseConfirmationPoll {
  run: <T>(config: PollConfig<T>) => Promise<PollOutcome>;
  isMounted: () => boolean;
}

/**
 * Dedup of the three identical post-purchase polling loops in subscription.tsx
 * (`handleRestore`, `handlePurchase`, `handleTopUp`). Each call:
 *   1. Checks mount, sleeps `pollIntervalMs`, checks mount.
 *   2. Calls `fetchProbe`; on rejection, continues to next attempt.
 *   3. Checks mount after `fetchProbe` resolves (extra guard from `handleTopUp`).
 *   4. Returns `'confirmed'` when `isConfirmed(probe)` is true.
 * After `maxAttempts` (default 15) attempts, returns `'unconfirmed'`.
 * `onSlowPoll` fires exactly once at the 10s mark and is cleared on every
 * exit path via try/finally.
 *
 * `run` is stable across renders (useCallback with `[]` deps) so call-site
 * handlers do not need to add `poll` to their own dep arrays. Mount state is
 * read through `mountedRef.current`, not captured in the closure.
 */
export function usePurchaseConfirmationPoll(): PurchaseConfirmationPoll {
  const mountedRef = useMountedRef();

  const isMounted = useCallback(() => mountedRef.current, [mountedRef]);

  const run = useCallback(
    async <T>(config: PollConfig<T>): Promise<PollOutcome> => {
      const maxAttempts = config.maxAttempts ?? 15;
      const intervalMs = config.pollIntervalMs ?? 2000;

      const slowTimer = setTimeout(() => {
        if (mountedRef.current) config.onSlowPoll?.();
      }, 10_000);

      try {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (!mountedRef.current) return 'unmounted';
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
          if (!mountedRef.current) return 'unmounted';
          let probe: T;
          try {
            probe = await config.fetchProbe();
          } catch {
            continue;
          }
          if (!mountedRef.current) return 'unmounted';
          if (config.isConfirmed(probe)) return 'confirmed';
        }
        return 'unconfirmed';
      } finally {
        clearTimeout(slowTimer);
      }
    },
    // mountedRef is stable across renders (useRef object identity is fixed),
    // so including it keeps `run` referentially stable AND satisfies
    // react-hooks/exhaustive-deps. Call-site useCallbacks therefore do not
    // need to add `poll` as a dep.
    [mountedRef],
  );

  return { run, isMounted };
}
