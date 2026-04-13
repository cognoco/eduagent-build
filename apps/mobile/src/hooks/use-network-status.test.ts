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
});
