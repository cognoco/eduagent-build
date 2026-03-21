// ---------------------------------------------------------------------------
// VoicePlaybackBar — TTS playback controls (replay, stop, speed) (Epic 8)
// Shown below messages when voice mode is enabled.
// ---------------------------------------------------------------------------

import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

const RATE_CYCLE: readonly number[] = [0.75, 1.0, 1.25];

export interface VoicePlaybackBarProps {
  isSpeaking: boolean;
  rate: number;
  onStop: () => void;
  onReplay: () => void;
  onRateChange: (rate: number) => void;
}

function nextRate(current: number): number {
  const idx = RATE_CYCLE.indexOf(current);
  return RATE_CYCLE[(idx + 1) % RATE_CYCLE.length];
}

export function VoicePlaybackBar({
  isSpeaking,
  rate,
  onStop,
  onReplay,
  onRateChange,
}: VoicePlaybackBarProps) {
  const colors = useThemeColors();

  return (
    <View
      className="flex-row items-center gap-2 px-4 py-2 bg-surface border-t border-surface-elevated"
      testID="voice-playback-bar"
    >
      {/* Replay */}
      <Pressable
        onPress={onReplay}
        disabled={isSpeaking}
        className="min-h-[44px] min-w-[44px] items-center justify-center"
        accessibilityLabel="Replay last AI message"
        accessibilityRole="button"
        testID="voice-replay-button"
      >
        <Ionicons
          name="play-back"
          size={22}
          color={isSpeaking ? colors.muted : colors.primary}
        />
      </Pressable>

      {/* Stop (only visible when speaking) */}
      {isSpeaking && (
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
  );
}
