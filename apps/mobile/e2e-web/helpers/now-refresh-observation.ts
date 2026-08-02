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

export interface CapturedNowRefreshPayload<Response, Payload> {
  response: Response;
  payload: Payload;
}

export type NowRefreshPayloadReadResult<Payload> =
  | { kind: 'parsed'; payload: Payload }
  | { kind: 'body-read-failed'; error: unknown };

export type NowRefreshCaptureResult<Response, Payload> =
  | { kind: 'response-rejected'; error: unknown }
  | {
      kind: 'response-settled';
      response: Response;
      payloadRead: Promise<NowRefreshPayloadReadResult<Payload>>;
    };

interface NowRefreshPayloadCapturePage<Response> {
  on(event: 'response', listener: (response: Response) => void): void;
  off(event: 'response', listener: (response: Response) => void): void;
}

interface NowRefreshPayloadCaptureOptions<Response> {
  page: NowRefreshPayloadCapturePage<Response>;
  matchesResponse: (response: Response) => boolean;
}

async function readNowRefreshPayload<Payload>(
  readPayload: () => Promise<Payload>,
): Promise<NowRefreshPayloadReadResult<Payload>> {
  try {
    return { kind: 'parsed', payload: await readPayload() };
  } catch (error) {
    return { kind: 'body-read-failed', error };
  }
}

/**
 * [WI-2961] Starts consuming the response body as soon as the already-armed
 * Playwright response promise settles. Response rejection and body-read
 * failure remain separate results so an observer can allow the former without
 * hiding the latter. Call this before the navigation action: Chromium may
 * release the Network body once navigation completes, while the plain
 * `Response` handle itself remains settled and otherwise looks healthy.
 */
export async function captureNowRefreshPayload<Response, Payload>(
  responsePromise: Promise<Response>,
  readPayload: (response: Response) => Promise<Payload>,
  options?: NowRefreshPayloadCaptureOptions<Response>,
): Promise<NowRefreshCaptureResult<Response, Payload>> {
  let capturedResponse: Response | undefined;
  let capturedPayloadRead:
    | Promise<NowRefreshPayloadReadResult<Payload>>
    | undefined;
  const onResponse = (response: Response): void => {
    if (
      capturedPayloadRead === undefined &&
      options?.matchesResponse(response)
    ) {
      capturedResponse = response;
      capturedPayloadRead = readNowRefreshPayload(() => readPayload(response));
    }
  };

  if (options) options.page.on('response', onResponse);

  const cleanup = (): void => {
    if (options) options.page.off('response', onResponse);
  };

  let response: Response;
  try {
    response = await responsePromise;
  } catch (error) {
    cleanup();
    return { kind: 'response-rejected', error };
  }

  cleanup();
  return {
    kind: 'response-settled',
    response,
    payloadRead:
      capturedResponse === response && capturedPayloadRead !== undefined
        ? capturedPayloadRead
        : readNowRefreshPayload(() => readPayload(response)),
  };
}

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

  let result: Response | typeof UNSETTLED;
  try {
    result = await Promise.race([responsePromise, timeoutPromise]);
  } catch (error) {
    return { kind: 'rejected', error };
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (result === UNSETTLED) {
    return { kind: 'unsettled' };
  }
  return { kind: 'settled', response: result as Response };
}

/**
 * Observes the discriminated capture result. Response rejection and bounded
 * response non-settlement keep their WI-2818 meanings, but a body-read failure
 * after response settlement propagates as a hard test failure.
 */
export async function observeCapturedNowRefresh<Response, Payload>(
  capturePromise: Promise<NowRefreshCaptureResult<Response, Payload>>,
  options: { armedAtMs: number; actionAtMs: number; windowMs?: number },
): Promise<NowRefreshOutcome<CapturedNowRefreshPayload<Response, Payload>>> {
  const captureOutcome = await observeExactNowRefresh(capturePromise, options);
  if (captureOutcome.kind !== 'settled') {
    return captureOutcome;
  }

  const capture = captureOutcome.response;
  if (capture.kind === 'response-rejected') {
    return { kind: 'rejected', error: capture.error };
  }

  const payloadRead = await capture.payloadRead;
  if (payloadRead.kind === 'body-read-failed') {
    throw payloadRead.error;
  }
  return {
    kind: 'settled',
    response: { response: capture.response, payload: payloadRead.payload },
  };
}

/**
 * [WI-2833 rework] Independent observation of whether the post-Back
 * `/v1/now?scope=self` REQUEST was actually dispatched, decoupled from
 * whatever happens to its response. `observeExactNowRefresh` alone cannot
 * prove this: a production regression that stops sending the request
 * entirely looks identical to a legitimate rejection/non-settlement from
 * `observeExactNowRefresh`'s point of view (its response promise just times
 * out either way). This function must be armed (e.g. via
 * `page.waitForRequest`) BEFORE the triggering action, exactly like
 * `observeExactNowRefresh`, and races that promise against the same
 * production-compatible window. "No matching request observed" is always
 * `{ kind: 'not-attempted' }` -- whether because none ever fired, or because
 * the underlying promise itself rejected (e.g. Playwright's own
 * `waitForRequest` timeout) -- so a caller can assert it as a hard failure
 * distinct from a response-side rejection/abort.
 */
export type NowRefreshRequestOutcome<Request> =
  | { kind: 'attempted'; request: Request }
  | { kind: 'not-attempted' };

export async function observeNowRefreshRequestAttempt<Request>(
  requestPromise: Promise<Request>,
  options: { armedAtMs: number; actionAtMs: number; windowMs?: number },
): Promise<NowRefreshRequestOutcome<Request>> {
  assertArmedBeforeAction(options.armedAtMs, options.actionAtMs);
  const windowMs = options.windowMs ?? NOW_REFRESH_OBSERVATION_WINDOW_MS;

  const NOT_ATTEMPTED = Symbol('not-attempted');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof NOT_ATTEMPTED>((resolve) => {
    timer = setTimeout(() => resolve(NOT_ATTEMPTED), windowMs);
  });

  try {
    const result = await Promise.race([
      // A rejection here (e.g. Playwright's own waitForRequest timeout) means
      // no matching request was observed -- fold it into NOT_ATTEMPTED rather
      // than rethrowing, so "not attempted" always resolves rather than
      // requiring every caller to also catch this promise.
      requestPromise.catch(() => NOT_ATTEMPTED),
      timeoutPromise,
    ]);
    if (result === NOT_ATTEMPTED) {
      return { kind: 'not-attempted' };
    }
    return { kind: 'attempted', request: result as Request };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Asserts a request-attempt outcome actually fired, narrowing the type.
 * Call this for EVERY accepted variant (settled, aborted/rejected, or
 * bounded-unsettled response) so a production regression that stops sending
 * the post-Back refresh request fails the spec instead of being silently
 * absorbed into the response's rejected/unsettled classification.
 */
export function assertRequestAttempted<Request>(
  outcome: NowRefreshRequestOutcome<Request>,
): asserts outcome is { kind: 'attempted'; request: Request } {
  if (outcome.kind === 'not-attempted') {
    throw new Error(
      '[now-refresh:not-attempted] No matching /v1/now?scope=self request was observed within the observation window. Production must attempt this refresh even when its response is later aborted or bounded away -- a missing request is a regression, not a legitimate rejected/unsettled response variant.',
    );
  }
}
