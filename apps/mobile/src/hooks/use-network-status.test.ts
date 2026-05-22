import { renderHook, act } from '@testing-library/react-native';
import { useNetworkStatus } from './use-network-status';

type Listener = (state: { isInternetReachable: boolean | null }) => void;

let mockListener: Listener | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: (listener: Listener) => {
    mockListener = listener;
    return mockUnsubscribe;
  },
  // BUG-101: Proactive initial check calls fetch() on mount
  fetch: jest.fn(() => Promise.resolve({ isInternetReachable: true })),
}));

describe('useNetworkStatus', () => {
  beforeEach(() => {
    mockListener = null;
    mockUnsubscribe.mockClear();
  });

  it('starts with isOffline false and isReady false', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOffline).toBe(false);
    expect(result.current.isReady).toBe(false);
  });

  it('sets isReady true after first event', () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      mockListener?.({ isInternetReachable: true });
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.isOffline).toBe(false);
  });

  it('detects offline when isInternetReachable is false', () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      mockListener?.({ isInternetReachable: false });
    });

    expect(result.current.isOffline).toBe(true);
    expect(result.current.isReady).toBe(true);
  });

  it('treats null isInternetReachable as online', () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      mockListener?.({ isInternetReachable: null });
    });

    expect(result.current.isOffline).toBe(false);
    expect(result.current.isReady).toBe(true);
  });

  it('recovers from offline to online', () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      mockListener?.({ isInternetReachable: false });
    });
    expect(result.current.isOffline).toBe(true);

    act(() => {
      mockListener?.({ isInternetReachable: true });
    });
    expect(result.current.isOffline).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('does not call setState after unmount when fetch resolves late (BUG-531)', async () => {
    // Regression guard: without a mounted-flag guard, the .then/.catch callbacks
    // call setState on an already-unmounted component. In React 19 this is silently
    // ignored, but the callbacks still execute (wasted closures). The mounted guard
    // short-circuits before touching setState.
    //
    // Note: React 19 changed the "Can't perform a React state update on an unmounted
    // component" warning — it no longer fires for this pattern. This test verifies
    // the cleanup path completes without any console.error output.
    let resolveDeferred!: (state: {
      isInternetReachable: boolean | null;
    }) => void;
    const deferredPromise = new Promise<{
      isInternetReachable: boolean | null;
    }>((resolve) => {
      resolveDeferred = resolve;
    });

    const NetInfo = jest.requireMock('@react-native-community/netinfo') as {
      fetch: jest.Mock;
    };
    NetInfo.fetch.mockReturnValueOnce(deferredPromise);

    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();

    // Resolve AFTER unmount — the mounted guard in the fix ensures the .then body
    // exits immediately without touching setState.
    resolveDeferred({ isInternetReachable: false });
    await deferredPromise;
    await Promise.resolve(); // flush microtask queue

    // Confirm no console.error fired from the post-unmount fetch resolution path.
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
