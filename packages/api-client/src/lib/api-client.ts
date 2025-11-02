import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from '../gen/openapi';

/**
 * Configuration for the API client factory
 */
export interface ApiClientConfig {
  /**
   * Base URL for all API requests
   * @default '/api'
   * @example 'http://localhost:3000/api'
   */
  baseUrl?: string;

  /** Optional default headers to include with all requests */
  headers?: Record<string, string>;

  /**
   * Optional custom fetch implementation for testing/mocking
   * @default globalThis.fetch
   */
  fetch?: typeof fetch;
}

/**
 * Type-safe API client with full autocomplete for all endpoints
 */
export type ApiClient = ReturnType<typeof createClient<paths>>;

/**
 * Creates a type-safe API client using openapi-fetch.
 *
 * @example
 * ```typescript
 * // Zero-config usage (uses default baseUrl: '/api')
 * const client = createApiClient();
 *
 * // Custom configuration
 * const client = createApiClient({
 *   baseUrl: 'http://localhost:3000/api',
 *   headers: { 'X-Client-Version': '1.0' }
 * });
 *
 * // Fully typed API calls
 * const { data, error } = await client.GET('/health');
 * if (data) {
 *   console.log(data.status); // Typed as "ok"
 * }
 * ```
 *
 * @param config - Optional client configuration
 * @returns Type-safe API client with methods for all endpoints
 */
export function createApiClient(config: ApiClientConfig = {}): ApiClient {
  const client = createClient<paths>({
    baseUrl: config.baseUrl ?? '/api',
    fetch: config.fetch ?? globalThis.fetch,
  });

  // Apply default headers via middleware (idiomatic openapi-fetch pattern)
  if (config.headers && Object.keys(config.headers).length > 0) {
    const headers = config.headers;
    const headerMiddleware: Middleware = {
      onRequest({ request }) {
        for (const [key, value] of Object.entries(headers)) {
          request.headers.set(key, value);
        }
        return request;
      },
    };
    client.use(headerMiddleware);
  }

  return client;
}
