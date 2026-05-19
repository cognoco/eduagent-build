// ---------------------------------------------------------------------------
// use-shake-detector hook tests [Phase 6 / batch-A]
// ---------------------------------------------------------------------------
//
// The Accelerometer is imported as an optional native module via require() with
// a try/catch in the source. We mock expo-sensors at the package boundary
// (gc1-allow: expo-sensors is an external native module, not internal code).

import { renderHook, act } from '@testing-library/react-native';
import { Platform } from 'react-native';

// Import after jest.mock is hoisted so the module-level require('expo-sensors') picks up the mock.
import { useShakeDetector } from './use-shake-detector';

// ---- Accelerometer mock state -----------------------------------------------

type AccelListener = (data: { x: number; y: number; z: number }) => void;

let mockIsAvailable = true;
let capturedListener: AccelListener | null = null;

const mockSubscription = { remove: jest.fn() };
const mockSetUpdateInterval = jest.fn();
const mockAddListener = jest.fn((listener: AccelListener) => {
  capturedListener = listener;
  return mockSubscription;
});
const mockIsAvailableAsync = jest.fn(async () => mockIsAvailable);

// prettier-ignore
jest.mock('expo-sensors', () => ({ // gc1-allow: expo-sensors is an external native module boundary
  Accelerometer: {
    isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...(args as [])),
    setUpdateInterval: (...args: unknown[]) => mockSetUpdateInterval(...args),
    addListener: (listener: AccelListener) => mockAddListener(listener),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simulateShakes(count: number, magnitude = 3.0): void {
  // magnitude formula in source: sqrt(x^2+y^2+z^2) - 1
  // x=3 → sqrt(9) - 1 = 2.0 > SHAKE_THRESHOLD (1.8)
  for (let i = 0; i < count; i++) {
    capturedListener?.({ x: magnitude, y: 0, z: 0 });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useShakeDetector — initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedListener = null;
    mockIsAvailable = true;
    mockSubscription.remove.mockClear();
  });

  it('returns shakeAvailable=false initially before async availability check resolves', () => {
    const onShake = jest.fn();
    const { result } = renderHook(() => useShakeDetector(onShake));

    // Synchronous render — before availability promise settles
    expect(result.current.shakeAvailable).toBe(false);
  });

  it('sets shakeAvailable=true when accelerometer is available', async () => {
    mockIsAvailable = true;
    const onShake = jest.fn();

    const { result } = renderHook(() => useShakeDetector(onShake));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.shakeAvailable).toBe(true);
    expect(mockIsAvailableAsync).toHaveBeenCalled();
    expect(mockAddListener).toHaveBeenCalled();
    expect(mockSetUpdateInterval).toHaveBeenCalledWith(100);
  });

  it('leaves shakeAvailable=false when accelerometer is not available on device', async () => {
    mockIsAvailable = false;
    const onShake = jest.fn();

    const { result } = renderHook(() => useShakeDetector(onShake));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.shakeAvailable).toBe(false);
    expect(mockAddListener).not.toHaveBeenCalled();
  });

  it('removes subscription on unmount', async () => {
    const onShake = jest.fn();

    const { unmount } = renderHook(() => useShakeDetector(onShake));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockAddListener).toHaveBeenCalled();

    unmount();

    expect(mockSubscription.remove).toHaveBeenCalled();
  });

  it('does not add a second listener on re-render (no deps in useEffect)', async () => {
    const onShake = jest.fn();

    const { rerender } = renderHook(() => useShakeDetector(onShake));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    rerender({});

    // useEffect deps array is [], so addListener is called only once
    expect(mockAddListener).toHaveBeenCalledTimes(1);
  });
});

describe('useShakeDetector — shake detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedListener = null;
    mockIsAvailable = true;
    mockSubscription.remove.mockClear();
  });

  it('calls onShake when 3+ high-magnitude events occur within the window', async () => {
    const onShake = jest.fn();

    renderHook(() => useShakeDetector(onShake));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      simulateShakes(3);
    });

    expect(onShake).toHaveBeenCalledTimes(1);
  });

  it('does not call onShake for low-magnitude movements (below threshold 1.8)', async () => {
    const onShake = jest.fn();

    renderHook(() => useShakeDetector(onShake));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      // magnitude = sqrt(0.5^2) - 1 = 0.5 - 1 = -0.5, well below SHAKE_THRESHOLD
      capturedListener?.({ x: 0.5, y: 0, z: 0 });
      capturedListener?.({ x: 0.5, y: 0, z: 0 });
      capturedListener?.({ x: 0.5, y: 0, z: 0 });
    });

    expect(onShake).not.toHaveBeenCalled();
  });

  it('respects 2-second cooldown: does not fire a second shake immediately after the first', async () => {
    const onShake = jest.fn();

    renderHook(() => useShakeDetector(onShake));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // First shake burst
    act(() => {
      simulateShakes(3);
    });
    expect(onShake).toHaveBeenCalledTimes(1);

    // Second burst immediately — should be blocked by 2s cooldown
    act(() => {
      simulateShakes(3);
    });
    expect(onShake).toHaveBeenCalledTimes(1);
  });

  it('uses latest onShake callback via ref (avoids stale closure)', async () => {
    const firstCallback = jest.fn();
    const secondCallback = jest.fn();

    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useShakeDetector(cb),
      { initialProps: { cb: firstCallback } },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Swap the callback
    rerender({ cb: secondCallback });

    act(() => {
      simulateShakes(3);
    });

    // The ref-based pattern should invoke the new callback, not the stale one
    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });

  it('does not fire onShake after unmount (cancelled flag prevents late-resolving async call)', async () => {
    // The source uses a `cancelled` flag to prevent the async IIFE from
    // subscribing after the component has already unmounted.
    mockIsAvailableAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          // Resolve after a delay — unmount happens before resolution
          setTimeout(() => resolve(true), 50);
        }),
    );

    const onShake = jest.fn();
    const { unmount } = renderHook(() => useShakeDetector(onShake));

    // Unmount immediately before the async check resolves
    unmount();

    // Let the delayed availability check settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // cancelled=true prevents addListener from being called
    expect(mockAddListener).not.toHaveBeenCalled();
    expect(onShake).not.toHaveBeenCalled();
  });
});

describe('useShakeDetector — web platform (no-op)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedListener = null;
    mockIsAvailable = true;
  });

  it('returns shakeAvailable=false on web without subscribing to accelerometer', async () => {
    const platformMut = Platform as { OS: string };
    const original = platformMut.OS;
    platformMut.OS = 'web';

    try {
      const onShake = jest.fn();
      const { result } = renderHook(() => useShakeDetector(onShake));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // Web stub returns false immediately, no Accelerometer subscription
      expect(result.current.shakeAvailable).toBe(false);
      expect(mockIsAvailableAsync).not.toHaveBeenCalled();
      expect(mockAddListener).not.toHaveBeenCalled();
    } finally {
      platformMut.OS = original;
    }
  });
});
