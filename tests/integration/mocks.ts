/**
 * Inngest client mock for integration tests.
 *
 * INTENTIONALLY mocks an internal module. Unlike other internal mocks
 * (which have been migrated to fetch interceptors), this prevents real
 * Inngest event dispatch during tests. The alternative — letting events
 * dispatch to a real/dev Inngest server — would make tests flaky and
 * environment-dependent.
 *
 * The Inngest functions themselves are tested directly (session-completed,
 * trial-expiry, etc.) by calling the handler with a mock step runner.
 *
 * Usage:
 *   import { inngestClientMock } from './mocks';
 *   jest.mock('../../apps/api/src/inngest/client', () => inngestClientMock());
 */

/**
 * Mock `../../apps/api/src/inngest/client`.
 *
 * The `inngest.createFunction()` call happens at import time for every Inngest
 * function module. The `serve()` handler calls `fn.getConfig()` during setup.
 * This factory satisfies both requirements.
 *
 * @param sendMock - Optional pre-created jest.fn() for `inngest.send` (useful
 *   when tests need to assert on sent events).
 */
export function inngestClientMock(sendMock?: jest.Mock): {
  inngest: Record<string, jest.Mock>;
} {
  let fnCounter = 0;
  return {
    inngest: {
      send: sendMock ?? jest.fn().mockResolvedValue({ ids: [] }),
      createFunction: jest.fn().mockImplementation((config) => {
        const id = config?.id ?? `mock-fn-${fnCounter++}`;
        const fn = jest.fn();
        (fn as any).getConfig = () => [
          { id, name: id, triggers: [], steps: {} },
        ];
        return fn;
      }),
    },
  };
}
