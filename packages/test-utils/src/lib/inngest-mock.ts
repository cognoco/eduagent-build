/**
 * Creates a mock Inngest step object for testing Inngest functions.
 *
 * The `run` method executes the provided callback immediately, matching
 * Inngest's behavior of running each step to completion. `sleep`,
 * `waitForEvent`, and `sendEvent` are no-ops by default.
 *
 * Usage:
 *
 * ```ts
 * const step = createInngestStepMock();
 * const handler = (myFunction as any).fn;
 * await handler({ event: { data: { ... } }, step });
 * expect(step.run).toHaveBeenCalledWith('step-name', expect.any(Function));
 * ```
 */
export function createInngestStepMock() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn().mockResolvedValue(undefined),
    waitForEvent: jest.fn().mockResolvedValue(null),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}
