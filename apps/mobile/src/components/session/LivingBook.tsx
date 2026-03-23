import { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';
import type { Persona } from '../../lib/theme';

interface LivingBookProps {
  /** Number of user–AI exchanges so far. */
  exchangeCount: number;
  /** True when interview/session is finished. */
  isComplete: boolean;
  /** Controls animation expressiveness and sparkle visibility. */
  persona: Persona;
}

/**
 * A small book icon in the chat header that visually fills up as the user
 * contributes answers. Plays a micro-animation on each new exchange and a
 * completion flourish when the interview finishes.
 *
 * Phase 1 — Interview screen only (Story 10.7).
 */
export function LivingBook({
  exchangeCount,
  isComplete,
  persona,
}: LivingBookProps): React.ReactElement {
  const colors = useThemeColors();
  const prevCount = useRef(exchangeCount);

  // Shared values for animations
  const pageFlip = useSharedValue(0);
  const bookScale = useSharedValue(1);
  const sparkleOpacity = useSharedValue(0);
  const completionGlow = useSharedValue(0);

  const isExpressive = persona === 'learner';

  // Page-flip animation on each new exchange
  useEffect(() => {
    if (exchangeCount > prevCount.current) {
      prevCount.current = exchangeCount;

      // Page flip: rotate 15° then back
      pageFlip.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 300 })
      );

      // Subtle scale bump
      bookScale.value = withSequence(
        withSpring(1.15, { damping: 8, stiffness: 200 }),
        withSpring(1, { damping: 10, stiffness: 150 })
      );

      // Sparkle (learner only)
      if (isExpressive) {
        sparkleOpacity.value = withSequence(
          withTiming(1, { duration: 150 }),
          withTiming(0, { duration: 400 })
        );
      }
    }
  }, [exchangeCount, isExpressive, pageFlip, bookScale, sparkleOpacity]);

  // Completion flourish
  useEffect(() => {
    if (isComplete) {
      completionGlow.value = withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0.4, { duration: 600 }),
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 800 })
      );

      bookScale.value = withSequence(
        withSpring(1.25, { damping: 6, stiffness: 180 }),
        withSpring(1, { damping: 10, stiffness: 150 })
      );
    }
  }, [isComplete, completionGlow, bookScale]);

  const bookAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: bookScale.value },
      { rotateY: `${interpolate(pageFlip.value, [0, 1], [0, 15])}deg` },
    ],
  }));

  const sparkleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sparkleOpacity.value,
    position: 'absolute' as const,
    top: -4,
    right: -4,
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: completionGlow.value,
    position: 'absolute' as const,
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
  }));

  return (
    <View
      className="items-center me-2"
      testID="living-book"
      accessibilityLabel={`Book progress: ${exchangeCount} ${
        exchangeCount === 1 ? 'page' : 'pages'
      }`}
      accessibilityRole="image"
    >
      <Animated.View style={bookAnimatedStyle}>
        <View style={{ position: 'relative' }}>
          {/* Completion glow ring */}
          {isComplete && <Animated.View style={glowAnimatedStyle} />}

          {/* Book icon — size scales with thickness */}
          <Ionicons
            name="book"
            size={isExpressive ? 28 : 24}
            color={isComplete ? colors.primary : colors.textSecondary}
          />

          {/* Sparkle (learner only) */}
          {isExpressive && (
            <Animated.View
              style={sparkleAnimatedStyle}
              testID="living-book-sparkle"
            >
              <Ionicons name="sparkles" size={12} color={colors.warning} />
            </Animated.View>
          )}
        </View>
      </Animated.View>

      {/* Page counter — subtle text below icon */}
      <Text
        className="text-caption text-text-secondary mt-0.5"
        style={{ fontSize: 10 }}
        testID="living-book-counter"
      >
        {exchangeCount === 0
          ? ''
          : `${exchangeCount} ${exchangeCount === 1 ? 'page' : 'pages'}`}
      </Text>
    </View>
  );
}
