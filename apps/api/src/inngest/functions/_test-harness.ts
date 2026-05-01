export interface ReplayHarness {
  step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> };
  reset(): void;
  cache: Map<string, unknown>;
}

export function makeReplayHarness(): ReplayHarness {
  const cache = new Map<string, unknown>();
  return {
    cache,
    reset() {
      cache.clear();
    },
    step: {
      run: async (name, fn) => {
        if (cache.has(name)) return cache.get(name);
        const result = await fn();
        cache.set(name, result);
        return result;
      },
    },
  };
}
