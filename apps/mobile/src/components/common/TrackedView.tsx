import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, ViewProps } from 'react-native';
import { View } from 'react-native';

import { track, type AnalyticsProperties } from '../../lib/analytics';

interface TrackedViewProps extends ViewProps {
  eventName: string;
  properties?: AnalyticsProperties;
  dwellMs?: number;
  disabled?: boolean;
}

export function TrackedView({
  eventName,
  properties,
  dwellMs = 1000,
  disabled = false,
  onLayout,
  children,
  ...props
}: TrackedViewProps): React.ReactElement {
  const [mounted, setMounted] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!mounted || disabled || firedRef.current) return undefined;
    const timer = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      track(eventName, properties);
    }, dwellMs);

    return () => clearTimeout(timer);
  }, [disabled, dwellMs, eventName, mounted, properties]);

  const handleLayout = (event: LayoutChangeEvent): void => {
    setMounted(true);
    onLayout?.(event);
  };

  return (
    <View {...props} onLayout={handleLayout}>
      {children}
    </View>
  );
}
