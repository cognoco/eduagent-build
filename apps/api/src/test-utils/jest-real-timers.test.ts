const REAL_TIMER_FUNCTIONS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
] as const;

async function expectRealTimerApisToBeUsable(): Promise<void> {
  for (const timerFunction of REAL_TIMER_FUNCTIONS) {
    expect(typeof globalThis[timerFunction]).toBe('function');
  }

  const timeout = globalThis.setTimeout(() => undefined, 60_000);
  globalThis.clearTimeout(timeout);

  const interval = globalThis.setInterval(() => undefined, 60_000);
  globalThis.clearInterval(interval);

  const immediate = globalThis.setImmediate(() => undefined);
  globalThis.clearImmediate(immediate);

  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

describe('API Jest real-timer isolation', () => {
  describe('after file-local fake-timer cleanup', () => {
    let simulateNode26Poison = false;

    afterEach(() => {
      jest.useRealTimers();

      if (!simulateNode26Poison) {
        return;
      }
      simulateNode26Poison = false;

      // Node 26.3.0 can leave these globals undefined when Sinon uninstalls
      // Jest's modern fake timers. Reproduce that state deterministically from
      // a file-local hook so restoration runs after every other afterEach.
      Object.defineProperty(globalThis, 'setTimeout', {
        configurable: true,
        value: undefined,
        writable: true,
      });
      Object.defineProperty(globalThis, 'clearTimeout', {
        configurable: true,
        value: undefined,
        writable: true,
      });
    });

    it('contains a poisoned fake-timer teardown to the test that caused it', () => {
      jest.useFakeTimers();
      globalThis.setTimeout(() => undefined, 1);
      expect(jest.getTimerCount()).toBe(1);
      simulateNode26Poison = true;
    });

    it('keeps unrelated real-timer APIs usable in the next test', async () => {
      await expectRealTimerApisToBeUsable();
    });
  });

  describe('when a test leaves fake timers active', () => {
    it('contains an auto-advancing modern clock to its test', () => {
      jest.useFakeTimers({ advanceTimers: true });
      globalThis.setInterval(() => undefined, 1_000);
      expect(jest.getTimerCount()).toBe(1);
    });

    it('restores real timers after an active modern clock', async () => {
      await expectRealTimerApisToBeUsable();
    });

    it('contains an active legacy clock to its test', () => {
      jest.useFakeTimers({ legacyFakeTimers: true });
      globalThis.setInterval(() => undefined, 1_000);
      expect(jest.getTimerCount()).toBe(1);
    });

    it('restores real timers after an active legacy clock', async () => {
      await expectRealTimerApisToBeUsable();
    });
  });
});
