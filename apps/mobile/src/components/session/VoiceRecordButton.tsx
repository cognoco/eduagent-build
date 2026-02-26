// ---------------------------------------------------------------------------
// VoiceRecordButton — Microphone button for STT input (FR138-143)
// Tap to start, tap to stop. Shows transcript preview before sending.
// ---------------------------------------------------------------------------

import { View, Text, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface VoiceRecordButtonProps {
  isListening: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function VoiceRecordButton({
  isListening,
  onPress,
  disabled = false,
}: VoiceRecordButtonProps) {
  const colors = useThemeColors();
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (isListening) {
      pulseScale.value = withRepeat(
        withTiming(1.15, { duration: 800 }),
        -1,
        true
      );
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isListening, pulseScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        className={`rounded-full p-3 min-h-[44px] min-w-[44px] items-center justify-center ${
          isListening ? 'bg-error' : 'bg-surface-elevated'
        }`}
        accessibilityLabel={isListening ? 'Stop recording' : 'Start recording'}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        testID="voice-record-button"
      >
        <Ionicons
          name={isListening ? 'stop' : 'mic'}
          size={22}
          color={isListening ? colors.inverse : colors.primary}
        />
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// VoiceTranscriptPreview — Shows transcript before sending
// ---------------------------------------------------------------------------

interface VoiceTranscriptPreviewProps {
  transcript: string;
  onSend: () => void;
  onDiscard: () => void;
  onReRecord: () => void;
}

export function VoiceTranscriptPreview({
  transcript,
  onSend,
  onDiscard,
  onReRecord,
}: VoiceTranscriptPreviewProps) {
  if (!transcript) return null;

  return (
    <View className="mx-4 mb-2 p-3 bg-surface-elevated rounded-xl">
      <Text className="text-body text-text-primary mb-2">{transcript}</Text>
      <View className="flex-row gap-2">
        <Pressable
          onPress={onSend}
          className="flex-1 bg-primary rounded-button py-2 items-center min-h-[44px] justify-center"
          accessibilityLabel="Send voice message"
          accessibilityRole="button"
          testID="voice-send-button"
        >
          <Text className="text-text-inverse font-semibold">Send</Text>
        </Pressable>
        <Pressable
          onPress={onReRecord}
          className="bg-surface rounded-button px-4 py-2 items-center min-h-[44px] justify-center"
          accessibilityLabel="Re-record"
          accessibilityRole="button"
          testID="voice-rerecord-button"
        >
          <Text className="text-text-secondary font-semibold">Re-record</Text>
        </Pressable>
        <Pressable
          onPress={onDiscard}
          className="bg-surface rounded-button px-4 py-2 items-center min-h-[44px] justify-center"
          accessibilityLabel="Discard recording"
          accessibilityRole="button"
          testID="voice-discard-button"
        >
          <Text className="text-text-secondary font-semibold">Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}
