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

/**
 * Returns every Inngest event captured by the fetch interceptor since the
 * test process started (or since the last `clearFetchCalls()` call).
 *
 * # Strict exact-array assertions are the house style
 *
 * Tests typically pin the dispatch list with `toEqual([...])`:
 *
 *     const events = getCapturedInngestEvents();
 *     expect(events).toEqual([
 *       expect.objectContaining({ name: 'app/consent.requested', data: ... }),
 *     ]);
 *
 * This is **intentional**. Strict assertions detect both regressions
 * ("we stopped sending the consent event") and silent escalations ("the
 * handler now also emits a duplicate event before/after the real one"),
 * which a `toContainEqual(...)` style assertion would miss.
 *
 * # When you add intermediate emissions
 *
 * If a code change legitimately adds another `inngest.send()` to the same
 * flow, the existing tests **will fail** — that is the point. To resolve,
 * choose one of:
 *
 * 1. **Extend the expected array** so it lists every event in dispatch
 *    order. This is the right answer when the new emission is part of the
 *    same logical phase and the test cares about both events.
 *
 * 2. **Phase the assertion** by calling `clearFetchCalls()` from
 *    `./fetch-interceptor` between the setup phase and the
 *    "what-this-test-cares-about" phase, so the captured list only
 *    contains events from the under-test phase. Example:
 *
 *        await setupFixture();
 *        clearFetchCalls();              // drop bookkeeping events
 *        await act();
 *        expect(getCapturedInngestEvents()).toEqual([...]);
 *
 * 3. **Scope by event name** when an upstream module emits unrelated
 *    background events you do not own — filter before asserting:
 *
 *        const relevant = getCapturedInngestEvents()
 *          .filter((e) => e.name.startsWith('app/consent.'));
 *        expect(relevant).toEqual([...]);
 *
 * Do **not** loosen the assertion to `toContainEqual(...)` or
 * `expect.arrayContaining([...])` just to make a failing test pass — that
 * removes the regression-detection value the strict pattern exists for.
 * See CLAUDE.md → "Tests Must Reflect Reality" for the project rule.
 *
 * Tracked by Notion bug BUG-1021 (LOW finding ADV-2 from cleanup PR).
 */
export function getCapturedInngestEvents(): CapturedInngestEvent[] {
  return getFetchCalls('inn.gs/e/').flatMap((call) => {
    if (!call.body) {
      return [];
    }

    const body = JSON.parse(call.body) as CapturedInngestEvent[];
    return Array.isArray(body) ? body : [body];
  });
}
