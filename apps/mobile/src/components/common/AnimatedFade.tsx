import type { ReactNode } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface AnimatedFadeProps {
  children: ReactNode;
  duration?: number;
}

export function AnimatedFade({ children, duration = 200 }: AnimatedFadeProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(duration)}
      exiting={FadeOut.duration(duration)}
    >
      {children}
    </Animated.View>
  );
}
