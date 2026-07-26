import { useRef, useCallback, useEffect, type RefObject } from 'react';
import { type ScrollView, type LayoutChangeEvent } from 'react-native';

interface KeyboardScrollResult {
  /** Attach to the ScrollView wrapping the form. */
  scrollRef: RefObject<ScrollView | null>;
  /** Returns an onLayout handler that records a field's y-position. */
  onFieldLayout: (name: string) => (e: LayoutChangeEvent) => void;
  /** Returns an onFocus handler that scrolls the field into view. */
  onFieldFocus: (name: string) => () => void;
  /**
   * Attach to the ScrollView's `onLayout` so focus-scroll knows the current
   * (post-keyboard-resize) visible height. Optional — screens that don't
   * wire this up simply keep the field-relative fallback. [WI-2769]
   */
  onScrollViewLayout: (e: LayoutChangeEvent) => void;
  /**
   * Attach to the primary submit button's wrapping View so focus-scroll can
   * anchor on the button instead of a fixed field offset. Optional — see
   * onScrollViewLayout. [WI-2769]
   */
  onSubmitButtonLayout: (e: LayoutChangeEvent) => void;
}

// Fallback offset when a screen hasn't wired up onScrollViewLayout /
// onSubmitButtonLayout — 140px calibrated for compact Android phones (S10e)
// in edge-to-edge mode, where the keyboard sits higher than on typical
// devices.
const FIELD_FOCUS_FALLBACK_OFFSET = 140;
// Small breathing room kept below the submit button once it's scrolled
// into view, so it isn't flush against the keyboard's top edge.
const SUBMIT_BUTTON_BOTTOM_MARGIN = 16;

/**
 * Tracks field positions within a ScrollView and auto-scrolls to bring
 * the focused field into view when the keyboard opens (BUG-60).
 *
 * When a screen also wires up `onScrollViewLayout` (on the ScrollView) and
 * `onSubmitButtonLayout` (on the submit button's wrapping View), focus-scroll
 * anchors on the submit button instead of a fixed field offset, so the
 * button stays reachable above the keyboard on short viewports [WI-2769] —
 * a fixed field offset large enough for a tall phone was cutting the button
 * off on compact devices. Screens that don't wire these up keep the
 * original field-relative behavior.
 *
 * Usage:
 *   const {
 *     scrollRef,
 *     onFieldLayout,
 *     onFieldFocus,
 *     onScrollViewLayout,
 *     onSubmitButtonLayout,
 *   } = useKeyboardScroll();
 *
 *   <ScrollView ref={scrollRef} onLayout={onScrollViewLayout}>
 *     <View onLayout={onFieldLayout('email')}>
 *       <TextInput onFocus={onFieldFocus('email')} />
 *     </View>
 *     <View onLayout={onSubmitButtonLayout}>
 *       <Button ... />
 *     </View>
 *   </ScrollView>
 */
export function useKeyboardScroll(): KeyboardScrollResult {
  const scrollRef = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  const scrollViewHeight = useRef<number | null>(null);
  const submitButtonBottom = useRef<number | null>(null);
  // Tracking the scheduled scroll prevents a stale fire after the user
  // rapidly refocuses a different field or unmounts the screen — without
  // this, the timer can land on a stale ScrollView ref or run after the
  // hook owner is gone. [BUG-826 / F-CMP-001]
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (scrollTimerRef.current !== null) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    },
    [],
  );

  const onFieldLayout = useCallback(
    (name: string) => (e: LayoutChangeEvent) => {
      positions.current[name] = e.nativeEvent.layout.y;
    },
    [],
  );

  const onScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
    scrollViewHeight.current = e.nativeEvent.layout.height;
  }, []);

  const onSubmitButtonLayout = useCallback((e: LayoutChangeEvent) => {
    submitButtonBottom.current =
      e.nativeEvent.layout.y + e.nativeEvent.layout.height;
  }, []);

  const onFieldFocus = useCallback(
    (name: string) => () => {
      // Cancel any pending scroll from a prior focus so quick refocus does
      // not stack timers — only the latest focus wins.
      if (scrollTimerRef.current !== null) {
        clearTimeout(scrollTimerRef.current);
      }
      // Delay lets the keyboard-open animation finish and the ScrollView
      // settle into its new (smaller) visible area before we scroll.
      scrollTimerRef.current = setTimeout(() => {
        scrollTimerRef.current = null;
        const y = positions.current[name];
        if (y === undefined) return;

        const buttonBottom = submitButtonBottom.current;
        const viewportHeight = scrollViewHeight.current;

        // [WI-2769] When the button + viewport are both known, anchor the
        // scroll so the button's bottom (plus a small margin) lands at the
        // bottom of the visible (post-keyboard-resize) viewport — this
        // guarantees the button is reachable regardless of viewport height,
        // unlike the fixed field offset below. If the content already fits
        // (buttonBottom <= viewportHeight), Math.max clamps to 0 — no scroll
        // needed.
        const target =
          buttonBottom !== null && viewportHeight !== null
            ? Math.max(
                0,
                buttonBottom - viewportHeight + SUBMIT_BUTTON_BOTTOM_MARGIN,
              )
            : Math.max(0, y - FIELD_FOCUS_FALLBACK_OFFSET);

        scrollRef.current?.scrollTo({ y: target, animated: true });
      }, 300);
    },
    [],
  );

  return {
    scrollRef,
    onFieldLayout,
    onFieldFocus,
    onScrollViewLayout,
    onSubmitButtonLayout,
  };
}
