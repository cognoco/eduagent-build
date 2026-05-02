/// <reference types="jest" />
/**
 * Shared mock-fetch utility for screen tests that need real hooks to run.
 *
 * Instead of mocking every hook individually, screen tests mock only
 * `lib/api-client` (the fetch boundary) and configure canned responses
 * per API route. This lets React Query, hooks, and `assertOk` run as
 * production code — catching return-shape drift that hook-level mocks hide.
 */

type RouteHandler = (
  url: string,
  init?: RequestInit
) => unknown | Promise<unknown>;

type RouteEntry = unknown | RouteHandler;

export interface RoutedMockFetch extends jest.Mock {
  setRoute(pattern: string, handler: RouteEntry): void;
}

export function createRoutedMockFetch(
  routes: Record<string, RouteEntry> = {}
): RoutedMockFetch {
  const routeMap = new Map(Object.entries(routes));

  const mockFn = jest
    .fn()
    .mockImplementation(
      async (
        input: RequestInfo | URL,
        init?: RequestInit
      ): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.toString()
            : (input as Request).url;

        for (const [pattern, handler] of routeMap) {
          if (url.includes(pattern)) {
            const result =
              typeof handler === 'function'
                ? await (handler as RouteHandler)(url, init)
                : handler;
            if (result instanceof Response) {
              return result;
            }
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    ) as RoutedMockFetch;

  mockFn.setRoute = (pattern: string, handler: RouteEntry) => {
    routeMap.set(pattern, handler);
  };

  return mockFn;
}

export function mockApiClientFactory(mockFetch: jest.Mock) {
  return {
    useApiClient: () => {
      const { hc } = require('hono/client');
      return hc('http://localhost', { fetch: mockFetch });
    },
    setActiveProfileId: jest.fn(),
    setProxyMode: jest.fn(),
    setOnAuthExpired: jest.fn(),
    clearOnAuthExpired: jest.fn(),
    resetAuthExpiredGuard: jest.fn(),
    getProxyMode: jest.fn().mockReturnValue(false),
    withIdempotencyKey: jest.fn((headers: Record<string, string>) => headers),
    isIdempotencyReplay: jest.fn().mockReturnValue(false),
    NetworkError: class NetworkError extends Error {},
    BadRequestError: class BadRequestError extends Error {},
    ConflictError: class ConflictError extends Error {},
    ForbiddenError: class ForbiddenError extends Error {},
    NotFoundError: class NotFoundError extends Error {},
    QuotaExceededError: class QuotaExceededError extends Error {},
    RateLimitedError: class RateLimitedError extends Error {},
    ResourceGoneError: class ResourceGoneError extends Error {},
    UpstreamError: class UpstreamError extends Error {},
  };
}

export function fetchCallsMatching(
  mockFetch: jest.Mock,
  pattern: string
): Array<{ url: string; init?: RequestInit }> {
  return (mockFetch.mock.calls as [RequestInfo | URL, RequestInit?][])
    .map(([input, init]) => ({
      url:
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url,
      init,
    }))
    .filter(({ url }) => url.includes(pattern));
}

export function extractJsonBody<T>(init?: RequestInit): T | undefined {
  if (!init?.body || typeof init.body !== 'string') return undefined;
  return JSON.parse(init.body) as T;
}
