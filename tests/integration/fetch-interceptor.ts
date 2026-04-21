/**
 * Composable fetch interceptor for integration tests.
 *
 * Replaces `globalThis.fetch` with a spy that dispatches to registered
 * URL-pattern handlers. Unmatched URLs throw — no silent external HTTP
 * calls during tests.
 *
 * Usage:
 *   beforeAll(() => { installFetchInterceptor(); });
 *   afterAll(() => { restoreFetch(); });
 *
 * Then compose per-boundary mocks:
 *   mockClerkJWKS();   // from external-mocks.ts
 *   mockVoyageAI();
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FetchHandler = (
  url: string,
  init: RequestInit | undefined
) => Response | Promise<Response>;

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
}

interface RegisteredHandler {
  pattern: string | RegExp;
  handler: FetchHandler;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch | null = null;
let handlers: RegisteredHandler[] = [];
let calls: FetchCall[] = [];
let installed = false;

// ---------------------------------------------------------------------------
// URL matching
// ---------------------------------------------------------------------------

function urlMatches(url: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return url.includes(pattern);
  }
  return pattern.test(url);
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

function extractMethod(
  input: RequestInfo | URL,
  init: RequestInit | undefined
): string {
  if (init?.method) return init.method;
  if (typeof input !== 'string' && !(input instanceof URL)) {
    return (input as Request).method ?? 'GET';
  }
  return 'GET';
}

function extractHeaders(init: RequestInit | undefined): Record<string, string> {
  if (!init?.headers) return {};
  if (init.headers instanceof Headers) {
    const result: Record<string, string> = {};
    init.headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(init.headers)) {
    return Object.fromEntries(init.headers);
  }
  return { ...init.headers } as Record<string, string>;
}

async function extractBody(
  init: RequestInit | undefined
): Promise<string | null> {
  if (!init?.body) return null;
  if (typeof init.body === 'string') return init.body;
  if (init.body instanceof ArrayBuffer) {
    return new TextDecoder().decode(init.body);
  }
  // ReadableStream or other — best-effort
  return '[non-string body]';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface InterceptorOptions {
  /**
   * When true, unmatched URLs pass through to the real fetch instead of
   * throwing. Used during migration — once all test files use explicit
   * handlers, this should be false (the default).
   */
  passthrough?: boolean;
}

/**
 * Installs the fetch interceptor. Call once in `beforeAll` or setup.
 * Safe to call multiple times — only installs once.
 */
export function installFetchInterceptor(options?: InterceptorOptions): void {
  if (installed) return;

  const passthrough = options?.passthrough ?? false;
  originalFetch = globalThis.fetch;
  installed = true;

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = extractUrl(input);
    const method = extractMethod(input, init);

    // Record the call for later assertion
    const call: FetchCall = {
      url,
      method,
      headers: extractHeaders(init),
      body: await extractBody(init),
      timestamp: Date.now(),
    };
    calls.push(call);

    // Try registered handlers (first match wins)
    for (const { pattern, handler } of handlers) {
      if (urlMatches(url, pattern)) {
        return handler(url, init);
      }
    }

    // No match — fail loudly or pass through
    if (passthrough && originalFetch) {
      return originalFetch(input, init);
    }

    throw new Error(
      `[fetch-interceptor] Unexpected fetch to: ${method} ${url}\n` +
        'Register a handler with addFetchHandler() or use a per-boundary mock.'
    );
  }) as typeof globalThis.fetch;
}

/**
 * Restores the original `globalThis.fetch`. Call in `afterAll`.
 */
export function restoreFetch(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
  handlers = [];
  calls = [];
  installed = false;
}

/**
 * Registers a URL-pattern handler. First matching handler wins.
 *
 * @param pattern — string (substring match) or RegExp
 * @param handler — receives (url, init) and returns a Response
 */
export function addFetchHandler(
  pattern: string | RegExp,
  handler: FetchHandler
): void {
  handlers.push({ pattern, handler });
}

/**
 * Removes all handlers matching a specific pattern.
 */
export function removeFetchHandler(pattern: string | RegExp): void {
  handlers = handlers.filter((h) => {
    if (typeof pattern === 'string' && typeof h.pattern === 'string') {
      return h.pattern !== pattern;
    }
    if (pattern instanceof RegExp && h.pattern instanceof RegExp) {
      return h.pattern.source !== pattern.source;
    }
    return true;
  });
}

/**
 * Removes all registered handlers. Useful in `beforeEach` for test isolation.
 * Does NOT restore original fetch — just clears handler registrations.
 */
export function clearFetchHandlers(): void {
  handlers = [];
}

/**
 * Clears recorded fetch calls. Useful in `beforeEach` to isolate assertions.
 */
export function clearFetchCalls(): void {
  calls = [];
}

/**
 * Returns captured fetch calls, optionally filtered by URL pattern.
 */
export function getFetchCalls(pattern?: string | RegExp): FetchCall[] {
  if (!pattern) return [...calls];
  return calls.filter((c) => urlMatches(c.url, pattern));
}

/**
 * Helper: creates a JSON Response (common in handler implementations).
 */
export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
