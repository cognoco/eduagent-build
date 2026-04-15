import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { FluencyDrillEvent } from '../../lib/sse';

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface FluencyDrillStripProps {
  drill: FluencyDrillEvent;
  onDismissScore: () => void;
}

/**
 * Compact strip shown above the text input during language fluency drills.
 *
 * When `drill.active === true`: shows a countdown timer from `durationSeconds`.
 * When `drill.active === false` and `drill.score` exists: shows the score card
 * with a dismiss button.
 */
export function FluencyDrillStrip({
  drill,
  onDismissScore,
}: FluencyDrillStripProps) {
  const [remaining, setRemaining] = useState(drill.durationSeconds ?? 60);
  const startRef = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset timer when a new drill starts
  useEffect(() => {
    if (!drill.active) return;
    const duration = drill.durationSeconds ?? 60;
    setRemaining(duration);
    startRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
      if (left <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [drill.active, drill.durationSeconds]);

  const handleDismiss = useCallback(() => {
    onDismissScore();
  }, [onDismissScore]);

  // Score display (drill ended)
  if (!drill.active && drill.score) {
    const { correct, total } = drill.score;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
      <View
        className="flex-row items-center justify-between bg-surface-elevated mx-4 my-1.5 px-4 py-2.5 rounded-button"
        testID="fluency-drill-score"
        accessibilityRole="summary"
        accessibilityLabel={`Drill complete: ${correct} out of ${total} correct, ${pct} percent`}
      >
        <View className="flex-row items-center gap-2">
          <Text className="text-body-sm font-semibold text-success">
            {correct}/{total}
          </Text>
          <Text className="text-caption text-text-secondary">
            {pct}% correct
          </Text>
        </View>
        <Pressable
          onPress={handleDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss drill score"
          testID="fluency-drill-dismiss"
        >
          <Text className="text-caption text-text-tertiary">Dismiss</Text>
        </Pressable>
      </View>
    );
  }

  // Active drill — countdown timer
  if (!drill.active) return null;

  const isUrgent = remaining <= 10;

  return (
    <View
      className="flex-row items-center justify-between bg-surface-elevated mx-4 my-1.5 px-4 py-2.5 rounded-button"
      testID="fluency-drill-timer"
      accessibilityRole="timer"
      accessibilityLabel={`Fluency drill: ${formatCountdown(
        remaining
      )} remaining`}
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-caption font-semibold text-primary">
          Fluency drill
        </Text>
      </View>
      <Text
        className={`text-body-sm font-mono font-semibold ${
          isUrgent ? 'text-error' : 'text-text-primary'
        }`}
      >
        {formatCountdown(remaining)}
      </Text>
    </View>
  );
}
