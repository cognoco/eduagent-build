import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { useApiReachability } from './use-api-reachability';

// Ensure getApiUrl() resolves via env var rather than expo-constants native module.
// test-utils/app-hook-test-utils sets EXPO_PUBLIC_API_URL, but this test does not
// import that module, so we set the var directly here.
process.env.EXPO_PUBLIC_API_URL ??= 'http://localhost:8787';

const mockFetch = jest.fn();
beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('useApiReachability', () => {
  let appStateListener: ((s: AppStateStatus) => void) | null = null;
  const mockRemove = jest.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    appStateListener = null;
    mockRemove.mockReset();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((event, listener) => {
        if (event === 'change') {
          appStateListener = listener as (s: AppStateStatus) => void;
        }
        return { remove: mockRemove } as unknown as ReturnType<
          typeof AppState.addEventListener
        >;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('issues exactly one /health request on mount even if recheck is called rapidly while in flight [BUG-561]', async () => {
    // Repro: a tight render loop or concurrent AppState 'active' events used to
    // fire many overlapping fetches because there was no in-flight guard.
    let resolveFetch: ((value: Response) => void) | undefined;
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>((res) => {
          resolveFetch = res;
        }),
    );

    const { result } = renderHook(() => useApiReachability());

    // The mount-time check fires immediately. Now call recheck many times
    // while it is still pending — the pendingRef guard MUST dedupe them.
    await act(async () => {
      for (let i = 0; i < 50; i++) {
        void result.current.recheck();
      }
    });

    // Despite 50 invocations + the mount-time check, only ONE fetch is in flight.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Drain the pending request so the test exits cleanly.
    await act(async () => {
      resolveFetch?.({ ok: true } as Response);
    });
  });

  it('does NOT subscribe to AppState changes on web [BUG-561]', () => {
    // Repro: AppState 'change' fires on every DOM focus/blur on web,
    // turning the foreground re-check into continuous polling.
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      mockFetch.mockResolvedValue({ ok: true } as Response);
      renderHook(() => useApiReachability());
      // On web the AppState branch returns early — listener must remain null.
      expect(appStateListener).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', {
        value: original,
        configurable: true,
      });
    }
  });

  it('subscribes to AppState changes on native platforms', () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    try {
      mockFetch.mockResolvedValue({ ok: true } as Response);
      renderHook(() => useApiReachability());
      expect(appStateListener).not.toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', {
        value: original,
        configurable: true,
      });
    }
  });

  it('marks API unreachable when fetch rejects', async () => {
    let rejectFetch: ((reason?: unknown) => void) | undefined;
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectFetch = reject;
        }),
    );
    const { result } = renderHook(() => useApiReachability());

    await act(async () => {
      rejectFetch?.(new Error('network down'));
      await Promise.resolve();
    });

    expect(result.current.isChecked).toBe(true);
    expect(result.current.isApiReachable).toBe(false);
  });

  it('clears the health timeout when fetch rejects', async () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    try {
      let rejectFetch: ((reason?: unknown) => void) | undefined;
      mockFetch.mockImplementation(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectFetch = reject;
          }),
      );
      const { result } = renderHook(() => useApiReachability());

      await act(async () => {
        rejectFetch?.(new Error('network down'));
        await Promise.resolve();
      });

      expect(result.current.isChecked).toBe(true);
      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });

  it('marks API reachable when fetch responds ok', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    const { result } = renderHook(() => useApiReachability());

    await waitFor(() => {
      expect(result.current.isChecked).toBe(true);
    });
    expect(result.current.isApiReachable).toBe(true);
  });

  it('does not call setState after unmount when fetch resolves late [BUG-532]', async () => {
    // Arrange: a fetch that we resolve manually AFTER unmount.
    let resolveFetch: ((value: Response) => void) | undefined;
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>((res) => {
          resolveFetch = res;
        }),
    );

    // Capture act() warnings — an unmounted-setState will surface as a console.error
    // containing "Warning: Can't perform a React state update on an unmounted component"
    // or in React 18 as "Warning: An update to ... inside a test was not wrapped in act(...)".
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const { unmount } = renderHook(() => useApiReachability());

    // Unmount BEFORE the fetch resolves.
    unmount();

    // Now resolve the fetch — this should NOT cause setState to fire.
    await act(async () => {
      resolveFetch?.({ ok: true } as Response);
      // Flush microtasks so any pending promise continuations run.
      await Promise.resolve();
    });

    // Assert: no console.error calls mentioning state updates or act warnings.
    const stateUpdateWarnings = consoleErrorSpy.mock.calls.filter((args) =>
      args.some(
        (arg) =>
          typeof arg === 'string' &&
          (arg.includes('unmounted') ||
            arg.includes('not wrapped in act') ||
            arg.includes('state update')),
      ),
    );
    expect(stateUpdateWarnings).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it('returns a referentially stable object + recheck across re-renders once settled [WI-964]', async () => {
    // recheck (checkHealth) is useCallback([]) and the return object is
    // useMemo'd over [isApiReachable, isChecked, checkHealth], so once the
    // mount-time check settles, a parent re-render must not mint a new object
    // or a new recheck — consumers depending on either identity must not re-run
    // their effects.
    mockFetch.mockResolvedValue({ ok: true } as Response);

    const { result, rerender } = renderHook(() => useApiReachability());

    await waitFor(() => {
      expect(result.current.isChecked).toBe(true);
    });

    const firstObject = result.current;
    const firstRecheck = result.current.recheck;

    rerender(undefined);

    expect(result.current).toBe(firstObject);
    expect(result.current.recheck).toBe(firstRecheck);
  });
});
