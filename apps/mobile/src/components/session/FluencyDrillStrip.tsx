import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FluencyDrillEvent } from '../../lib/sse';
import { formatTimer } from '../../lib/format-relative-date';

export interface FluencyDrillStripProps {
  drill: FluencyDrillEvent;
  onDismissScore: () => void;
  /** M7: Optional callback to let the user skip/dismiss an active drill early. */
  onSkipDrill?: () => void;
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
  onSkipDrill,
}: FluencyDrillStripProps) {
  const { t } = useTranslation();
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
        accessibilityLabel={t('session.fluencyDrill.a11yScore', {
          correct,
          total,
          pct,
        })}
      >
        <View className="flex-row items-center gap-2">
          <Text className="text-body-sm font-semibold text-success">
            {correct}/{total}
          </Text>
          <Text className="text-caption text-text-secondary">
            {t('session.fluencyDrill.percentCorrect', { pct: String(pct) })}
          </Text>
        </View>
        <Pressable
          onPress={handleDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('session.fluencyDrill.dismissLabel')}
          testID="fluency-drill-dismiss"
        >
          <Text className="text-caption text-text-tertiary">
            {t('session.fluencyDrill.dismiss')}
          </Text>
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
      accessibilityLabel={t('session.fluencyDrill.a11yTimer', {
        time: formatTimer(remaining),
      })}
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-caption font-semibold text-primary">
          {t('session.fluencyDrill.title')}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Text
          className={`text-body-sm font-mono font-semibold ${
            isUrgent ? 'text-error' : 'text-text-primary'
          }`}
        >
          {formatTimer(remaining)}
        </Text>
        {/* M7: Skip button so users can exit a drill they don't want to complete */}
        {onSkipDrill && (
          <Pressable
            onPress={onSkipDrill}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('session.fluencyDrill.skipLabel')}
            testID="fluency-drill-skip"
          >
            <Text className="text-caption text-text-tertiary">
              {t('session.fluencyDrill.skip')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
