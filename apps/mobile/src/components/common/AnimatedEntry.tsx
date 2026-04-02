import type { ReactNode } from 'react';

interface AnimatedEntryProps {
  children: ReactNode;
  delay?: number;
}

export function AnimatedEntry({ children, delay = 0 }: AnimatedEntryProps) {
  void delay;

  // Keep home content visible even if release animations fail to start.
  // The original Reanimated entry effect could leave entire sections at
  // opacity 0 on device builds.
  return <>{children}</>;
}
