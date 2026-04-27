import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { useApiReachability } from './use-api-reachability';

jest.mock('../lib/api', () => ({
  getApiUrl: () => 'https://api-test.example.com',
}));

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
        })
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
    mockFetch.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useApiReachability());

    await waitFor(() => {
      expect(result.current.isChecked).toBe(true);
    });
    expect(result.current.isApiReachable).toBe(false);
  });

  it('marks API reachable when fetch responds ok', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    const { result } = renderHook(() => useApiReachability());

    await waitFor(() => {
      expect(result.current.isChecked).toBe(true);
    });
    expect(result.current.isApiReachable).toBe(true);
  });
});
