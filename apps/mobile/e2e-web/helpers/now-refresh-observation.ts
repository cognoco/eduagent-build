/**
 * [WI-2833] Production-compatible observation of the exact self-scoped
 * Now-feed refresh the Session→Mentor Back gate fires on the way out of a
 * resumed session (WI-2818, apps/mobile/src/app/(app)/session/index.tsx's
 * `MENTOR_RETURN_REFRESH_WAIT_MS`, currently 2_000ms at index.tsx:218).
 *
 * Unlike the WI-2234/WI-2838 held-response pattern (page.route()-based pause
 * + manual release, removed by this WI as its only call site), this never
 * pauses or holds the request at the network layer — it only races
 * a response promise the caller has already armed (e.g. via
 * `page.waitForResponse`) BEFORE the triggering action, against a window at
 * least as long as the production bound. Holding the response hostage until
 * after unrelated post-action assertions is exactly the WI-2833 regression:
 * under load, production's own bound can already have fired — and Mentor
 * already reached — before a test-side release ever happens.
 */

/** Mirrors session/index.tsx's MENTOR_RETURN_REFRESH_WAIT_MS. Production-owned;
 * this repo forbids changing production code from a test-only WI (AC3), so this
 * is a cited constant, not an import. */
export const PRODUCTION_MENTOR_RETURN_REFRESH_BOUND_MS = 2_000;

/** Slack above the production bound for real network/serialization time. */
const OBSERVATION_SLACK_MS = 3_000;

/** The observation window: long enough that a refresh production itself
 * would still have honored is never mistakenly reported as unsettled. */
export const NOW_REFRESH_OBSERVATION_WINDOW_MS =
  PRODUCTION_MENTOR_RETURN_REFRESH_BOUND_MS + OBSERVATION_SLACK_MS;

export type NowRefreshOutcome<Response> =
  | { kind: 'settled'; response: Response }
  | { kind: 'rejected'; error: unknown }
  | { kind: 'unsettled' };

/**
 * Throws when the observation was armed at or after the triggering action —
 * the exact hold-then-late-wait ordering bug this WI fixes. Arming must
 * happen strictly before the action so the observation window has any chance
 * of covering the same interval production's own bound is racing.
 */
export function assertArmedBeforeAction(
  armedAtMs: number,
  actionAtMs: number,
): void {
  if (armedAtMs >= actionAtMs) {
    throw new Error(
      `[now-refresh:ordering] Observation armed at ${armedAtMs}ms, at or after the triggering action at ${actionAtMs}ms. Arm strictly before the action — arming late can lose the race against the WI-2818 production bound (WI-2833 regression: hold-then-late-wait).`,
    );
  }
}

/**
 * Races an already-armed response promise against `windowMs` (default
 * `NOW_REFRESH_OBSERVATION_WINDOW_MS`). Never throws for a rejected or
 * unsettled outcome — both are legitimate production behavior per WI-2818,
 * not test failures. Only a late arm throws, and it throws before racing
 * anything.
 */
export async function observeExactNowRefresh<Response>(
  responsePromise: Promise<Response>,
  options: { armedAtMs: number; actionAtMs: number; windowMs?: number },
): Promise<NowRefreshOutcome<Response>> {
  assertArmedBeforeAction(options.armedAtMs, options.actionAtMs);
  const windowMs = options.windowMs ?? NOW_REFRESH_OBSERVATION_WINDOW_MS;

  const UNSETTLED = Symbol('unsettled');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof UNSETTLED>((resolve) => {
    timer = setTimeout(() => resolve(UNSETTLED), windowMs);
  });

  try {
    const result = await Promise.race([responsePromise, timeoutPromise]);
    if (result === UNSETTLED) {
      return { kind: 'unsettled' };
    }
    return { kind: 'settled', response: result as Response };
  } catch (error) {
    return { kind: 'rejected', error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
