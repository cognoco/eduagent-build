import { useState, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}`;
}

export function SessionTimer() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <View
      className="ml-2 px-3 py-2 rounded-button bg-surface-elevated min-h-[44px] items-center justify-center"
      testID="session-timer"
      accessibilityLabel={`Session time: ${formatTime(elapsed)}`}
      accessibilityRole="timer"
    >
      <Text className="text-body-sm font-mono text-text-secondary">
        {formatTime(elapsed)}
      </Text>
    </View>
  );
}
