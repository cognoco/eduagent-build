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

// [WI-2769] The submit button had no anchor: scrolling always targeted
// `focusedFieldY - 140`, a fixed offset calibrated for one device (S10e).
// On shorter viewports that offset leaves too little of the (post-keyboard)
// viewport below the field, cutting the submit button off below the fold.
describe('useKeyboardScroll — submit-button anchor (WI-2769)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function focusAndDrain(
    result: { current: ReturnType<typeof useKeyboardScroll> },
    fieldName: string,
  ) {
    act(() => {
      result.current.onFieldFocus(fieldName)();
      jest.advanceTimersByTime(300);
    });
  }

  it('anchors on the submit button bottom (minus viewport height, plus margin) when both are registered, ignoring the field offset', () => {
    const { result } = renderHook(() => useKeyboardScroll());
    const scrollSpy = jest.fn();
    (
      result.current.scrollRef as { current: { scrollTo: jest.Mock } | null }
    ).current = { scrollTo: scrollSpy };

    act(() => {
      result.current.onFieldLayout('password')({
        nativeEvent: { layout: { x: 0, y: 300, width: 0, height: 0 } },
      } as never);
      // Post-keyboard-resize viewport is short (compact device) — 400px.
      result.current.onScrollViewLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 0, height: 400 } },
      } as never);
      // Submit button sits at y=520, 48px tall → bottom = 568.
      result.current.onSubmitButtonLayout({
        nativeEvent: { layout: { x: 0, y: 520, width: 0, height: 48 } },
      } as never);
    });

    focusAndDrain(result, 'password');

    // target = max(0, buttonBottom - viewportHeight + margin)
    //        = max(0, 568 - 400 + 16) = 184
    // NOT the old field-relative value (max(0, 300 - 140) = 160).
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({ y: 184, animated: true });
  });

  it('clamps to 0 when the button already fits within the known viewport', () => {
    const { result } = renderHook(() => useKeyboardScroll());
    const scrollSpy = jest.fn();
    (
      result.current.scrollRef as { current: { scrollTo: jest.Mock } | null }
    ).current = { scrollTo: scrollSpy };

    act(() => {
      result.current.onFieldLayout('email')({
        nativeEvent: { layout: { x: 0, y: 100, width: 0, height: 0 } },
      } as never);
      result.current.onScrollViewLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 0, height: 800 } },
      } as never);
      result.current.onSubmitButtonLayout({
        nativeEvent: { layout: { x: 0, y: 300, width: 0, height: 48 } },
      } as never);
    });

    focusAndDrain(result, 'email');

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({ y: 0, animated: true });
  });

  it('falls back to the field-relative offset when the button/viewport are not registered', () => {
    const { result } = renderHook(() => useKeyboardScroll());
    const scrollSpy = jest.fn();
    (
      result.current.scrollRef as { current: { scrollTo: jest.Mock } | null }
    ).current = { scrollTo: scrollSpy };

    act(() => {
      result.current.onFieldLayout('email')({
        nativeEvent: { layout: { x: 0, y: 250, width: 0, height: 0 } },
      } as never);
    });

    focusAndDrain(result, 'email');

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      y: Math.max(0, 250 - 140),
      animated: true,
    });
  });
});
