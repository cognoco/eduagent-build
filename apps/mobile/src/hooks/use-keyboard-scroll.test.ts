import { renderHook, act } from '@testing-library/react-native';
import { useKeyboardScroll } from './use-keyboard-scroll';

// [BUG-826 / F-CMP-001] Lifecycle: setTimeout from onFieldFocus must not fire
// after unmount or stack across rapid refocus.

describe('useKeyboardScroll — timer lifecycle (BUG-826)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('clears the pending scroll timer on unmount so it cannot fire on a stale ScrollView ref', () => {
    const { result, unmount } = renderHook(() => useKeyboardScroll());
    const scrollSpy = jest.fn();
    // Replace scrollRef.current with a spy so a stray scrollTo call is observable.
    (
      result.current.scrollRef as { current: { scrollTo: jest.Mock } | null }
    ).current = { scrollTo: scrollSpy };

    // Record a layout y so the timer body would actually call scrollTo.
    act(() => {
      result.current.onFieldLayout('email')({
        nativeEvent: { layout: { x: 0, y: 200, width: 0, height: 0 } },
      } as never);
      result.current.onFieldFocus('email')();
    });

    unmount();
    // Advance past the 300ms delay; if cleanup didn't run, scrollTo would fire.
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('cancels the prior timer when a new focus happens within the debounce window', () => {
    const { result } = renderHook(() => useKeyboardScroll());
    const scrollSpy = jest.fn();
    (
      result.current.scrollRef as { current: { scrollTo: jest.Mock } | null }
    ).current = { scrollTo: scrollSpy };

    act(() => {
      result.current.onFieldLayout('email')({
        nativeEvent: { layout: { x: 0, y: 200, width: 0, height: 0 } },
      } as never);
      result.current.onFieldLayout('password')({
        nativeEvent: { layout: { x: 0, y: 400, width: 0, height: 0 } },
      } as never);

      result.current.onFieldFocus('email')();
      // Refocus the next field before the prior timer fires.
      jest.advanceTimersByTime(100);
      result.current.onFieldFocus('password')();
      // Now drain past the original 300ms — the email timer was cancelled,
      // only the password timer should land.
      jest.advanceTimersByTime(300);
    });

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      y: Math.max(0, 400 - 140),
      animated: true,
    });
  });
});
