/**
 * Per-boundary fetch interceptors for integration tests.
 *
 * Each function registers a URL-pattern handler via the fetch interceptor.
 * Tests compose only the boundaries they touch:
 *
 *   beforeAll(() => {
 *     installFetchInterceptor();
 *     mockClerkJWKS();          // auth tests
 *     mockExpoPush();           // notification tests
 *   });
 *
 * Each interceptor returns a handle for per-test response overrides.
 */

import {
  addFetchHandler,
  jsonResponse,
  type FetchHandler,
} from './fetch-interceptor';
import { TEST_JWKS } from './test-keys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MockHandle {
  /**
   * Override the response for the next matching fetch call only.
   * After one use, reverts to the default response.
   */
  nextResponse: (responseFn: () => Response) => void;
  /**
   * Replace the default response factory permanently (until changed again).
   *
   * Accepts a factory function (not a Response instance) because Response
   * bodies are single-use — calling `.json()` consumes the stream.
   */
  setDefault: (responseFn: () => Response) => void;
}

// ---------------------------------------------------------------------------
// Handle factory
// ---------------------------------------------------------------------------

function createMockHandle(
  pattern: string | RegExp,
  defaultResponseFn: () => Response
): MockHandle {
  let oneShot: (() => Response) | null = null;
  let customDefault: (() => Response) | null = null;

  const handler: FetchHandler = () => {
    if (oneShot) {
      const factory = oneShot;
      oneShot = null;
      return factory();
    }
    return customDefault ? customDefault() : defaultResponseFn();
  };

  addFetchHandler(pattern, handler);

  return {
    nextResponse: (responseFn: () => Response) => {
      oneShot = responseFn;
    },
    setDefault: (responseFn: () => Response) => {
      customDefault = responseFn;
    },
  };
}

// ---------------------------------------------------------------------------
// Clerk JWKS
// ---------------------------------------------------------------------------

/**
 * Intercepts JWKS fetch requests and returns the test public key.
 *
 * Pattern matches any URL containing `.well-known/jwks.json` — this
 * covers `https://clerk.test/.well-known/jwks.json` used in
 * `buildIntegrationEnv()`.
 *
 * With this interceptor active, the real `jwt.ts` verification path runs
 * end-to-end: fetchJWKS → decodeJWTHeader → importRSAPublicKey →
 * crypto.subtle.verify. The only fake is the network call.
 */
export function mockClerkJWKS(): MockHandle {
  return createMockHandle('.well-known/jwks.json', () =>
    jsonResponse(TEST_JWKS)
  );
}

// ---------------------------------------------------------------------------
// Expo Push Notifications
// ---------------------------------------------------------------------------

/**
 * Intercepts Expo Push API calls.
 *
 * Default response matches Expo's success shape:
 * `{ data: { id: 'mock-receipt-id', status: 'ok' } }`
 *
 * The real `sendPushNotification` function in `notifications.ts` parses
 * `result.data?.id` as the ticket ID.
 */
export function mockExpoPush(): MockHandle {
  return createMockHandle('exp.host/--/api/v2/push/send', () =>
    jsonResponse({
      data: { id: 'mock-receipt-id', status: 'ok' },
    })
  );
}

// ---------------------------------------------------------------------------
// Resend Email
// ---------------------------------------------------------------------------

/**
 * Intercepts Resend email API calls.
 *
 * Default response: `{ id: 'mock-email-id' }`
 *
 * The real `sendEmailNotification` in `notifications.ts` parses
 * `json.id` as the message ID.
 */
export function mockResendEmail(): MockHandle {
  return createMockHandle('api.resend.com/emails', () =>
    jsonResponse({ id: 'mock-email-id' })
  );
}

// ---------------------------------------------------------------------------
// Voyage AI Embeddings
// ---------------------------------------------------------------------------

/**
 * Intercepts Voyage AI embedding API calls.
 *
 * Default response matches the shape that `generateEmbedding` in
 * `embeddings.ts` expects: `{ data: [{ embedding: [...] }] }`.
 *
 * Returns a 1024-dimensional zero vector (matching voyage-3.5 config).
 */
export function mockVoyageAI(): MockHandle {
  return createMockHandle('api.voyageai.com/v1/embeddings', () =>
    jsonResponse({
      data: [{ embedding: new Array(1024).fill(0) }],
      model: 'voyage-3.5',
      usage: { total_tokens: 10 },
    })
  );
}

// ---------------------------------------------------------------------------
// Convenience: mock all external boundaries at once
// ---------------------------------------------------------------------------

export interface AllMockHandles {
  jwks: MockHandle;
  expoPush: MockHandle;
  resendEmail: MockHandle;
  voyageAI: MockHandle;
}

/**
 * Registers handlers for ALL external boundaries with sensible defaults.
 *
 * Convenience for test files that just need "everything mocked" without
 * fine-grained control. Tests that need per-boundary error scenarios
 * should compose individual interceptors instead.
 */
export function mockAllExternalBoundaries(): AllMockHandles {
  return {
    jwks: mockClerkJWKS(),
    expoPush: mockExpoPush(),
    resendEmail: mockResendEmail(),
    voyageAI: mockVoyageAI(),
  };
}
