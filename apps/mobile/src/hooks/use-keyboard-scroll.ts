import { useRef, useCallback, useEffect, type RefObject } from 'react';
import { type ScrollView, type LayoutChangeEvent } from 'react-native';

interface KeyboardScrollResult {
  /** Attach to the ScrollView wrapping the form. */
  scrollRef: RefObject<ScrollView | null>;
  /** Returns an onLayout handler that records a field's y-position. */
  onFieldLayout: (name: string) => (e: LayoutChangeEvent) => void;
  /** Returns an onFocus handler that scrolls the field into view. */
  onFieldFocus: (name: string) => () => void;
}

/**
 * Tracks field positions within a ScrollView and auto-scrolls to bring
 * the focused field into view when the keyboard opens (BUG-60).
 *
 * Usage:
 *   const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();
 *
 *   <ScrollView ref={scrollRef}>
 *     <View onLayout={onFieldLayout('email')}>
 *       <TextInput onFocus={onFieldFocus('email')} />
 *     </View>
 *   </ScrollView>
 */
export function useKeyboardScroll(): KeyboardScrollResult {
  const scrollRef = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
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
        if (y !== undefined) {
          // 140px: calibrated for compact Android phones (S10e) in edge-to-edge
          // mode, where the keyboard sits higher than on typical devices.
          scrollRef.current?.scrollTo({
            y: Math.max(0, y - 140),
            animated: true,
          });
        }
      }, 300);
    },
    [],
  );

  return { scrollRef, onFieldLayout, onFieldFocus };
}
