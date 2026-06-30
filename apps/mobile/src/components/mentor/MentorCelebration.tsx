import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import type { TranslateKey } from '../../i18n';

export interface MentorCelebrationProps {
  eventId: string;
  messageKey: TranslateKey;
  seenEventIds?: ReadonlySet<string>;
  onMarkSeen?: (eventId: string) => void;
}

export function MentorCelebration({
  eventId,
  messageKey,
  seenEventIds = new Set<string>(),
  onMarkSeen,
}: MentorCelebrationProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const alreadySeen = seenEventIds.has(eventId);

  // First-render burst: scale up with a spring overshoot while fading in.
  // Initialise to the rest state when reduced motion is active so the surface
  // is shown instantly with no animation.
  const scale = useSharedValue(reduceMotion ? 1 : 0.8);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!alreadySeen) {
      onMarkSeen?.(eventId);
    }
  }, [alreadySeen, eventId, onMarkSeen]);

  useEffect(() => {
    if (alreadySeen || reduceMotion) {
      return;
    }
    opacity.value = withTiming(1, { duration: 220 });
    scale.value = withSequence(
      withSpring(1.08, { damping: 6, stiffness: 220 }),
      withTiming(1, { duration: 140 }),
    );
  }, [alreadySeen, opacity, reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (alreadySeen) {
    return (
      <View testID="mentor-celebration-static" className="rounded-xl p-3">
        <Text className="text-text-primary">{t(messageKey)}</Text>
      </View>
    );
  }

  return (
    <Animated.View
      testID="mentor-celebration"
      style={animatedStyle}
      exiting={reduceMotion ? undefined : FadeOut.duration(200)}
      collapsable={false}
      className="rounded-xl border border-accent bg-surface p-3"
    >
      <Text className="font-semibold text-text-primary">{t(messageKey)}</Text>
    </Animated.View>
  );
}
