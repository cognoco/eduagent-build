// ---------------------------------------------------------------------------
// [WI-2353 rework] Genuine integration-level regression tests for the
// Authorization-header redaction and the pre-existing cookie-stripping
// guard — Gate-2 review (reviewer:codex:global) bounced the original
// sentry.test.ts unit tests for calling scrubSentryEvent() directly instead
// of exercising the real Sentry.withSentry / requestDataIntegration /
// beforeSend pipeline. These tests drive a REAL authenticated request
// (an actual fetch-API Request carrying a literal Authorization: Bearer
// <jwt> header, or a real Cookie header) through the REAL, unmocked
// `@sentry/cloudflare` SDK — the same `Sentry.withSentry(...)` wrapper and
// `beforeSend: scrubSentryEvent` wiring apps/api/src/index.ts uses in
// production — with a route handler that throws. The only boundary mocked
// is the outbound network fetch() Sentry's transport uses to ship the
// envelope; that is an external-boundary mock (matches the repo's Stripe/
// Clerk-JWKS mocking convention), not an internal mock of anything under
// test.
//
// Production wiring recap (apps/api/src/index.ts): the app does NOT rely on
// @sentry/cloudflare's automatic Hono error-capture (that only auto-wires
// when the wrapped handler exposes onError/errorHandler props directly;
// index.ts passes `{ fetch: app.fetch }`, not the Hono app object, to
// withSentry). Instead the app's own `app.onError(...)` handler explicitly
// calls captureException(). This test's tiny throwing app mirrors that
// exact shape so the pipeline under test matches production precisely.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import * as Sentry from '@sentry/cloudflare';
import { captureException, scrubSentryEvent } from './sentry';

/**
 * Sentry's IsolatedPromiseBuffer (used by makeCloudflareTransport) only
 * invokes a queued send when `.drain()` runs -- which happens via
 * `core.flush(...)`, itself only triggered through the real SDK's
 * `ctx.waitUntil(...)` calls inside wrapRequestHandler. This fake
 * ExecutionContext collects every waitUntil'd promise so the test can await
 * them after the request resolves, guaranteeing the transport's fetch() has
 * actually fired before assertions run.
 */
function createTestExecutionContext() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
      // Cloudflare's ExecutionContext requires this method; never invoked
      // by the code path under test (no passthrough-on-exception behavior
      // is exercised here), so it's intentionally a no-op stub.
      passThroughOnException: () => undefined,
    },
    async drain() {
      await Promise.allSettled(pending);
    },
  };
}

/** Parses a Sentry envelope body (newline-delimited JSON: an envelope
 *  header line, then one [item-header, item-payload] line pair per item)
 *  and returns the error-event payload (the item carrying `.exception`) --
 *  not the envelope/item header lines, and not a transaction/span item. */
function findCapturedErrorEvent(envelopeBody: string): {
  request?: {
    headers?: Record<string, unknown>;
    url?: string;
    query_string?: string;
  };
} {
  const lines = envelopeBody.split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { exception?: unknown };
      if (parsed && typeof parsed === 'object' && parsed.exception) {
        return parsed as {
          request?: {
            headers?: Record<string, unknown>;
            url?: string;
            query_string?: string;
          };
        };
      }
    } catch {
      // envelope header / item header lines aren't event JSON -- skip.
    }
  }
  throw new Error(
    `no captured error event found in envelope body: ${envelopeBody.slice(0, 500)}`,
  );
}

/** Same envelope-parsing approach as findCapturedErrorEvent, but selects the
 *  TRANSACTION item's EVENT PAYLOAD line (Sentry.TransactionEvent's
 *  `type: 'transaction'` discriminant, which error events never carry) --
 *  NOT the item header line, which is also `{"type":"transaction"}` but
 *  carries no `request`/`contexts`/`spans` fields. Matching on `type` alone
 *  would silently return the header (a false pass: `request` reads as
 *  `undefined` whether or not the fix redacts anything), so this also
 *  requires the `contexts` field the header never has. */
function findCapturedTransactionEvent(envelopeBodies: string[]): {
  request?: { headers?: Record<string, unknown> };
} {
  for (const body of envelopeBodies) {
    const lines = body.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as {
          type?: string;
          contexts?: unknown;
        };
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.type === 'transaction' &&
          parsed.contexts
        ) {
          return parsed as { request?: { headers?: Record<string, unknown> } };
        }
      } catch {
        // envelope header / item header lines aren't event JSON -- skip.
      }
    }
  }
  throw new Error(
    `no captured transaction event found across ${envelopeBodies.length} envelope body/bodies`,
  );
}

/** Builds a Sentry-wrapped Hono app with a single throwing route, wired
 *  exactly like apps/api/src/index.ts's production default export
 *  (Sentry.withSentry + beforeSend: scrubSentryEvent + beforeSendTransaction:
 *  scrubSentryEvent [WI-2353 rework] + an app.onError that explicitly calls
 *  captureException). `tracesSampleRate` defaults to 0 (no transaction
 *  envelope shipped) for the AC-1/AC-4 error-event cases; the transaction
 *  case below passes 1 to force a sampled transaction event, since
 *  wrapRequestHandler wraps every request in a span regardless of whether
 *  the handler throws. */
function buildThrowingSentryApp(tracesSampleRate = 0) {
  const app = new Hono();
  app.onError((err, c) => {
    captureException(err, { requestPath: c.req.path });
    return c.json({ error: 'boom' }, 500);
  });
  app.get('/throws', () => {
    throw new Error('WI-2353 integration-test forced failure');
  });

  return Sentry.withSentry(
    () => ({
      dsn: 'https://public@o0.ingest.sentry.io/1',
      tracesSampleRate,
      beforeSend: scrubSentryEvent,
      beforeSendTransaction: scrubSentryEvent,
    }),
    { fetch: app.fetch } as unknown as {
      fetch: (
        request: Request,
        env: unknown,
        ctx: unknown,
      ) => Promise<Response>;
    },
  );
}

describe('Sentry.withSentry request pipeline (WI-2353 rework — AC-1, AC-4)', () => {
  let originalFetch: typeof fetch;
  let envelopeBodies: string[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    envelopeBodies = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const href = typeof url === 'string' ? url : url.toString();
      if (href.includes('/envelope/')) {
        envelopeBodies.push(String(init?.body ?? ''));
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // AC-1's named case, exactly: a route handler throws during an
  // authenticated request carrying Authorization: Bearer <jwt>, captured
  // through the real Sentry.withSentry/requestDataIntegration/beforeSend
  // path (not scrubSentryEvent called directly). Guaranteed property
  // asserted: the captured event's request.headers.authorization is absent.
  // Reverting the scrubAuthorizationHeader wiring in sentry.ts makes this
  // exact assertion fail (verified manually: red before the fix, green
  // after) -- nothing else in this test could mask that revert.
  it('AC-1: authenticated request throws, Authorization bearer header is absent from the event Sentry.withSentry actually ships', async () => {
    const wrapped = buildThrowingSentryApp();
    const { ctx, drain } = createTestExecutionContext();

    const request = new Request('https://api.example.com/throws', {
      headers: {
        authorization:
          'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.integration-test-jwt-body.sig',
      },
    });

    const response = await wrapped.fetch(request, {} as never, ctx as never);
    expect(response.status).toBe(500);
    await drain();

    expect(envelopeBodies.length).toBeGreaterThan(0);
    const event = findCapturedErrorEvent(
      envelopeBodies[envelopeBodies.length - 1]!,
    );
    expect(event.request?.headers?.authorization).toBeUndefined();
  });

  // AC-4's named case, exactly: a request carrying a REAL Cookie header
  // (not a header nobody supplied) is captured through the same real
  // pipeline as AC-1, and the SDK's own requestDataIntegration cookie
  // exclusion (`include: { cookies: false }`, unrelated to this WI's fix)
  // must still strip it -- proving the new authorization redaction was
  // added ALONGSIDE the existing cookie guard, not IN PLACE of the SDK
  // mechanism that produces it. Guaranteed property asserted: only the
  // cookie header. No authorization header is asserted here -- that
  // guarantee belongs to AC-1's case above, not this one.
  it('AC-4: a real Cookie header on the same thrown request is still stripped by the SDK cookie-exclusion guard, unregressed by the fix', async () => {
    const wrapped = buildThrowingSentryApp();
    const { ctx, drain } = createTestExecutionContext();

    const request = new Request('https://api.example.com/throws', {
      headers: {
        cookie: '__session=integration-test-cookie-value',
      },
    });

    const response = await wrapped.fetch(request, {} as never, ctx as never);
    expect(response.status).toBe(500);
    await drain();

    expect(envelopeBodies.length).toBeGreaterThan(0);
    const event = findCapturedErrorEvent(
      envelopeBodies[envelopeBodies.length - 1]!,
    );
    expect(event.request?.headers?.cookie).toBeUndefined();
  });

  // Bounce#2 finding: beforeSend fires on ERROR events only. With
  // tracesSampleRate non-zero (0.1 prod, 1.0 dev/preview/staging in
  // production), requestDataIntegration attaches the SAME event.request.headers
  // to sampled TRANSACTION events too, and those events bypass beforeSend
  // entirely -- they only go through beforeSendTransaction. This is a
  // DIFFERENT named case from AC-1 (transaction event, not error event):
  // an authenticated request that gets sampled into a transaction must have
  // its Authorization header redacted (and its Cookie header still SDK-
  // stripped) in that transaction event, not just in the error event the
  // same request also produces. Reverting the beforeSendTransaction wiring
  // in index.ts (equivalently: removing scrubSentryEvent from this test's
  // beforeSendTransaction option) makes this exact assertion fail -- the
  // bearer token surfaces in the captured transaction event.
  it('transaction event: a sampled transaction produced by the same authenticated thrown request also has its Authorization header redacted and Cookie header stripped', async () => {
    const wrapped = buildThrowingSentryApp(1);
    const { ctx, drain } = createTestExecutionContext();

    const request = new Request('https://api.example.com/throws', {
      headers: {
        authorization:
          'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.integration-test-transaction.sig',
        cookie: '__session=integration-test-cookie-value',
      },
    });

    const response = await wrapped.fetch(request, {} as never, ctx as never);
    expect(response.status).toBe(500);
    await drain();

    const transactionEvent = findCapturedTransactionEvent(envelopeBodies);
    expect(transactionEvent.request?.headers?.authorization).toBeUndefined();
    expect(transactionEvent.request?.headers?.cookie).toBeUndefined();
  });

  // [WI-2339] Named case: a request carrying a secret-bearing query string
  // (`?token=SECRET-abc123`) throws and is captured through the SAME real
  // Sentry.withSentry/requestDataIntegration/beforeSend pipeline as AC-1/AC-4
  // above -- not scrubSentryEvent called directly. Verified empirically
  // (see sentry.ts's stripQueryString doc comment) that
  // requestDataIntegration attaches event.request.query_string and the
  // query segment of event.request.url regardless of sendDefaultPii, unlike
  // cookies/authorization. Guaranteed property asserted: the literal secret
  // is absent from both fields on the event Sentry.withSentry actually
  // ships. Reverting the scrubRequestUrlFields wiring in sentry.ts makes
  // this exact assertion fail (verified manually: red before the fix, green
  // after).
  it('WI-2339: a request with a secret query param throws, the secret is absent from request.query_string and request.url in the event Sentry.withSentry actually ships', async () => {
    const wrapped = buildThrowingSentryApp();
    const { ctx, drain } = createTestExecutionContext();

    const request = new Request(
      'https://api.example.com/throws?token=SECRET-abc123&foo=bar',
    );

    const response = await wrapped.fetch(request, {} as never, ctx as never);
    expect(response.status).toBe(500);
    await drain();

    expect(envelopeBodies.length).toBeGreaterThan(0);
    const event = findCapturedErrorEvent(
      envelopeBodies[envelopeBodies.length - 1]!,
    );
    expect(event.request?.query_string).not.toContain('SECRET-abc123');
    expect(event.request?.url).not.toContain('SECRET-abc123');
  });
});
