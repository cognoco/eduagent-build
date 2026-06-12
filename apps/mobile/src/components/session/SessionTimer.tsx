import { useState, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatTimer } from '../../lib/format-relative-date';

export function SessionTimer() {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <View
      className="ms-2 px-3 py-2 rounded-button bg-surface-elevated min-h-[44px] items-center justify-center"
      testID="session-timer"
      accessibilityLabel={t('session.a11ySessionTime', {
        time: formatTimer(elapsed),
      })}
      accessibilityRole="timer"
    >
      <Text className="text-body-sm font-mono text-text-secondary">
        {formatTimer(elapsed)}
      </Text>
    </View>
  );
}
