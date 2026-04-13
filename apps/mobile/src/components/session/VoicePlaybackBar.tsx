// ---------------------------------------------------------------------------
// VoicePlaybackBar — TTS playback controls (replay, pause/resume, stop, speed)
// (FR147: Voice Session Controls)
// Shown below messages when voice mode is enabled.
// ---------------------------------------------------------------------------

import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

const RATE_CYCLE: readonly number[] = [0.75, 1.0, 1.25];

export interface VoicePlaybackBarProps {
  isSpeaking: boolean;
  isPaused: boolean;
  rate: number;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onReplay: () => void;
  onRateChange: (rate: number) => void;
}

function nextRate(current: number): number {
  const idx = RATE_CYCLE.indexOf(current);
  const safeIdx = idx === -1 ? 0 : idx;
  return RATE_CYCLE[(safeIdx + 1) % RATE_CYCLE.length]!;
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
}: VoicePlaybackBarProps) {
  const colors = useThemeColors();

  return (
    <View
      className="px-4 py-2 bg-surface border-t border-surface-elevated"
      testID="voice-playback-bar"
    >
      <View className="flex-row items-center gap-2">
        {/* Replay */}
        <Pressable
          onPress={onReplay}
          disabled={isSpeaking && !isPaused}
          accessibilityState={{ disabled: isSpeaking && !isPaused }}
          className="min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityLabel="Replay last AI message"
          accessibilityRole="button"
          testID="voice-replay-button"
        >
          <Ionicons
            name="play-back"
            size={22}
            color={isSpeaking && !isPaused ? colors.muted : colors.primary}
          />
        </Pressable>

        {/* Pause/Resume (visible when speaking or paused) */}
        {(isSpeaking || isPaused) && (
          <Pressable
            onPress={isPaused ? onResume : onPause}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityLabel={isPaused ? 'Resume speaking' : 'Pause speaking'}
            accessibilityRole="button"
            testID="voice-pause-resume-button"
          >
            <Ionicons
              name={isPaused ? 'play' : 'pause'}
              size={22}
              color={colors.primary}
            />
          </Pressable>
        )}

        {/* Stop (visible when speaking or paused) */}
        {(isSpeaking || isPaused) && (
          <Pressable
            onPress={onStop}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityLabel="Stop speaking"
            accessibilityRole="button"
            testID="voice-stop-button"
          >
            <Ionicons name="stop" size={22} color={colors.primary} />
          </Pressable>
        )}

        {/* Speed badge */}
        <Pressable
          onPress={() => onRateChange(nextRate(rate))}
          className="min-h-[44px] px-3 items-center justify-center rounded-button bg-surface-elevated"
          accessibilityLabel={`Speech speed ${rate}x. Tap to change.`}
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
