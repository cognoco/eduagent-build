// ---------------------------------------------------------------------------
// VoicePlaybackBar — TTS playback controls (replay, pause/resume, stop, speed)
// (FR147: Voice Session Controls)
// Shown below messages when voice mode is enabled.
// ---------------------------------------------------------------------------

import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

const RATE_CYCLE: readonly [number, ...number[]] = [0.75, 1.0, 1.25];

export interface VoicePlaybackBarProps {
  isSpeaking: boolean;
  isPaused: boolean;
  rate: number;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onReplay: () => void;
  onRateChange: (rate: number) => void;
  variant?: 'bar' | 'inline';
}

function nextRate(current: number): number {
  const idx = RATE_CYCLE.indexOf(current);
  const safeIdx = idx === -1 ? 0 : idx;
  return RATE_CYCLE[(safeIdx + 1) % RATE_CYCLE.length] ?? RATE_CYCLE[0];
}

export function VoicePlaybackBar({
  isSpeaking,
  isPaused,
  rate,
  onStop,
  onPause,
  onResume,
  onReplay,
  onRateChange,
  variant = 'bar',
}: VoicePlaybackBarProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isInline = variant === 'inline';

  return (
    <View
      className={
        isInline ? '' : 'px-4 py-2 bg-surface border-t border-surface-elevated'
      }
      testID="voice-playback-bar"
    >
      <View className="flex-row items-center" style={{ gap: isInline ? 4 : 8 }}>
        {/* Replay */}
        <Pressable
          onPress={onReplay}
          disabled={isSpeaking && !isPaused}
          accessibilityState={{ disabled: isSpeaking && !isPaused }}
          className="min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityLabel={t('session.voice.a11yReplay')}
          accessibilityRole="button"
          testID="voice-replay-button"
        >
          {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
          <View
            testID="voice-replay-icon"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons
              name="play-back"
              size={22}
              color={isSpeaking && !isPaused ? colors.muted : colors.primary}
            />
          </View>
        </Pressable>

        {/* Pause/Resume (visible when speaking or paused) */}
        {(isSpeaking || isPaused) && (
          <Pressable
            onPress={isPaused ? onResume : onPause}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityLabel={
              isPaused
                ? t('session.voice.a11yResume')
                : t('session.voice.a11yPause')
            }
            accessibilityRole="button"
            testID="voice-pause-resume-button"
          >
            {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
            <View
              testID="voice-pause-resume-icon"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons
                name={isPaused ? 'play' : 'pause'}
                size={22}
                color={colors.primary}
              />
            </View>
          </Pressable>
        )}

        {/* Stop (visible when speaking or paused) */}
        {(isSpeaking || isPaused) && (
          <Pressable
            onPress={onStop}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityLabel={t('session.voice.a11yStop')}
            accessibilityRole="button"
            testID="voice-stop-button"
          >
            {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
            <View
              testID="voice-stop-icon"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons name="stop" size={22} color={colors.primary} />
            </View>
          </Pressable>
        )}

        {/* Speed badge */}
        <Pressable
          onPress={() => onRateChange(nextRate(rate))}
          className="min-h-[44px] px-3 items-center justify-center rounded-button bg-surface-elevated"
          accessibilityLabel={t('session.voice.a11ySpeed', { rate })}
          accessibilityRole="button"
          testID="voice-rate-button"
        >
          <Text className="text-caption font-semibold text-text-secondary">
            {rate}x
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
