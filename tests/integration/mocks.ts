/**
 * Shared integration-test HTTP boundary stubs.
 *
 * Keep app modules real here. These helpers register fetch-interceptor
 * handlers for external transports that the app reaches through HTTP.
 */

import {
  addFetchHandler,
  getFetchCalls,
  jsonResponse,
  type FetchHandler,
} from './fetch-interceptor';

export interface MockHandle {
  /**
   * Override the response for the next matching fetch call only.
   * After one use, reverts to the default response.
   */
  nextResponse: (responseFn: () => Response) => void;
  /**
   * Replace the default response factory permanently (until changed again).
   *
   * Accepts a factory function because Response bodies are single-use.
   */
  setDefault: (responseFn: () => Response) => void;
}

export interface CapturedInngestEvent {
  name: string;
  data?: Record<string, unknown>;
  id?: string;
  ts?: number;
}

function createMockHandle(
  pattern: string | RegExp,
  defaultResponseFn: () => Response,
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

/**
 * Intercepts the real Inngest client's event transport.
 *
 * The application imports and uses the real `inngest` client. This handler
 * stubs only the outbound Inngest HTTP event API so integration tests can
 * assert on dispatched payloads without mocking the internal client module.
 */
export function mockInngestEvents(): MockHandle {
  return createMockHandle('inn.gs/e/', () =>
    jsonResponse({ ids: ['mock-inngest-event-id'], status: 200 }),
  );
}

export function getCapturedInngestEvents(): CapturedInngestEvent[] {
  return getFetchCalls('inn.gs/e/').flatMap((call) => {
    if (!call.body) {
      return [];
    }

    try {
      const body = JSON.parse(call.body) as CapturedInngestEvent[];
      return Array.isArray(body) ? body : [body];
    } catch {
      return [];
    }
  });
}
