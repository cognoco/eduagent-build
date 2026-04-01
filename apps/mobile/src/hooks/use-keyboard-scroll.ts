import { useRef, useCallback, type RefObject } from 'react';
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

  const onFieldLayout = useCallback(
    (name: string) => (e: LayoutChangeEvent) => {
      positions.current[name] = e.nativeEvent.layout.y;
    },
    []
  );

  const onFieldFocus = useCallback(
    (name: string) => () => {
      // Delay lets the keyboard-open animation finish and the ScrollView
      // settle into its new (smaller) visible area before we scroll.
      setTimeout(() => {
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
    []
  );

  return { scrollRef, onFieldLayout, onFieldFocus };
}
