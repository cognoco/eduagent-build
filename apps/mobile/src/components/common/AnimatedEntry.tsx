import type { ReactNode } from 'react';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

interface AnimatedEntryProps {
  children: ReactNode;
  delay?: number;
}

export function AnimatedEntry({ children, delay = 0 }: AnimatedEntryProps) {
  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(300)}
      exiting={FadeOutDown.duration(200)}
    >
      {children}
    </Animated.View>
  );
}
