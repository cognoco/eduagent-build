import {
  _clearProviders,
  _resetCircuits,
  registerProvider,
  routeAndCall,
  routeAndStream,
  setLlmRoutingV2Enabled,
} from './router';
import { createMockProvider } from './providers/mock';
import { makeChatStreamResult } from './types';

function createFailingChatStream() {
  const stream: AsyncIterable<string> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          throw new Error('transient stream failure');
        },
      };
    },
  };
  return makeChatStreamResult(stream, Promise.resolve('unknown'));
}

describe('routeAndCall cancellation [WI-2183]', () => {
  beforeEach(() => {
    setLlmRoutingV2Enabled(true);
    _clearProviders();
    _resetCircuits();
  });

  afterEach(() => {
    setLlmRoutingV2Enabled(false);
    _clearProviders();
    _resetCircuits();
  });

  it('aborts provider work without retrying or falling back', async () => {
    _clearProviders();
    _resetCircuits();
    const controller = new AbortController();
    let primaryCalls = 0;
    let fallbackCalls = 0;
    let resolveEnteredProvider!: () => void;
    const enteredProvider = new Promise<void>((resolve) => {
      resolveEnteredProvider = resolve;
    });

    registerProvider({
      ...createMockProvider('cerebras'),
      chat: (_messages, _config, signal) => {
        primaryCalls += 1;
        resolveEnteredProvider();
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        });
      },
    });
    registerProvider({
      ...createMockProvider('openai'),
      async chat(...args) {
        fallbackCalls += 1;
        return createMockProvider('openai').chat(...args);
      },
    });

    const call = routeAndCall([{ role: 'user', content: 'test' }], 1, {
      signal: controller.signal,
    });
    await enteredProvider;
    controller.abort(new Error('summary timeout'));

    await expect(call).rejects.toThrow('summary timeout');
    expect(primaryCalls).toBe(1);
    expect(fallbackCalls).toBe(0);
  });

  it('cancels an in-progress retry delay without a later attempt', async () => {
    _clearProviders();
    _resetCircuits();
    const controller = new AbortController();
    let primaryCalls = 0;
    let fallbackCalls = 0;

    registerProvider({
      ...createMockProvider('cerebras'),
      async chat() {
        primaryCalls += 1;
        throw new Error('transient provider failure');
      },
    });
    registerProvider({
      ...createMockProvider('openai'),
      async chat(...args) {
        fallbackCalls += 1;
        return createMockProvider('openai').chat(...args);
      },
    });

    const call = routeAndCall([{ role: 'user', content: 'test' }], 1, {
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort(new Error('summary timeout'));

    await expect(
      Promise.race([
        call,
        new Promise((_resolve, reject) => {
          setTimeout(
            () => reject(new Error('retry delay ignored cancellation')),
            100,
          );
        }),
      ]),
    ).rejects.toThrow('summary timeout');
    expect(primaryCalls).toBe(1);
    expect(fallbackCalls).toBe(0);
  });

  it('releases a half-open circuit probe when the caller aborts', async () => {
    _clearProviders();
    _resetCircuits();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    try {
      registerProvider({
        ...createMockProvider('cerebras'),
        chatStream() {
          return createFailingChatStream();
        },
      });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await routeAndStream(
          [{ role: 'user', content: 'test' }],
          1,
        );
        await expect(async () => {
          for await (const _chunk of result.stream) {
            // Drain the lazy stream so the failure opens the text circuit.
          }
        }).rejects.toThrow('transient stream failure');
      }

      nowSpy.mockReturnValue(62_000);
      const controller = new AbortController();
      let resolveEnteredProvider!: () => void;
      const enteredProvider = new Promise<void>((resolve) => {
        resolveEnteredProvider = resolve;
      });
      registerProvider({
        ...createMockProvider('cerebras'),
        chat: (_messages, _config, signal) => {
          resolveEnteredProvider();
          return new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          });
        },
      });

      const probe = routeAndCall([{ role: 'user', content: 'test' }], 1, {
        signal: controller.signal,
      });
      await enteredProvider;
      controller.abort(new Error('summary timeout'));
      await expect(probe).rejects.toThrow('summary timeout');

      registerProvider(createMockProvider('cerebras'));
      await expect(
        routeAndCall([{ role: 'user', content: 'test' }], 1),
      ).resolves.toMatchObject({ provider: 'cerebras' });
    } finally {
      nowSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('does not count caller cancellation against the fallback circuit', async () => {
    _clearProviders();
    _resetCircuits();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    try {
      registerProvider({
        ...createMockProvider('cerebras'),
        chatStream() {
          return createFailingChatStream();
        },
      });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await routeAndStream(
          [{ role: 'user', content: 'test' }],
          1,
        );
        await expect(async () => {
          for await (const _chunk of result.stream) {
            // Drain the lazy stream so the primary text circuit opens.
          }
        }).rejects.toThrow('transient stream failure');
      }

      registerProvider(createMockProvider('cerebras'));
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const controller = new AbortController();
        let resolveEnteredFallback!: () => void;
        const enteredFallback = new Promise<void>((resolve) => {
          resolveEnteredFallback = resolve;
        });
        registerProvider({
          ...createMockProvider('openai'),
          chat: (_messages, _config, signal) => {
            resolveEnteredFallback();
            return new Promise((_resolve, reject) => {
              signal?.addEventListener('abort', () => reject(signal.reason), {
                once: true,
              });
            });
          },
        });

        const call = routeAndCall([{ role: 'user', content: 'test' }], 1, {
          signal: controller.signal,
        });
        await enteredFallback;
        controller.abort(new Error('summary timeout'));
        await expect(call).rejects.toThrow('summary timeout');
      }

      registerProvider(createMockProvider('openai'));
      await expect(
        routeAndCall([{ role: 'user', content: 'test' }], 1),
      ).resolves.toMatchObject({ provider: 'openai' });
    } finally {
      nowSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
