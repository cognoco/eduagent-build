// ---------------------------------------------------------------------------
// VoiceRecordButton — Microphone button for STT input (FR138-143, FR147)
// Tap to start, tap to stop. Shows transcript preview before sending.
// Haptic feedback on state transitions (FR147).
// ---------------------------------------------------------------------------

import { View, Text, Pressable, TextInput } from 'react-native';
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
import { hapticLight, hapticMedium, hapticSuccess } from '../../lib/haptics';

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
        true,
      );
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isListening, pulseScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const handlePress = () => {
    if (isListening) {
      hapticMedium();
    } else {
      hapticLight();
    }
    onPress();
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        className={`rounded-full p-3 min-h-[44px] min-w-[44px] items-center justify-center ${
          isListening ? 'bg-danger' : 'bg-surface-elevated'
        }`}
        accessibilityLabel={isListening ? 'Stop recording' : 'Start recording'}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        testID="voice-record-button"
      >
        {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
        <View
          testID="voice-record-icon"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons
            name={isListening ? 'stop' : 'mic'}
            size={22}
            color={isListening ? colors.textInverse : colors.primary}
          />
        </View>
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
  /** Lets the user tap into the transcript and correct STT mistakes before sending. */
  onTranscriptChange?: (text: string) => void;
}

export function VoiceTranscriptPreview({
  transcript,
  onSend,
  onDiscard,
  onReRecord,
  onTranscriptChange,
}: VoiceTranscriptPreviewProps) {
  const colors = useThemeColors();
  if (!transcript) return null;

  const handleSend = () => {
    hapticSuccess();
    onSend();
  };

  const handleDiscard = () => {
    hapticLight();
    onDiscard();
  };

  return (
    <View className="mx-4 mb-2 p-3 bg-surface-elevated rounded-xl">
      <TextInput
        className="text-body text-text-primary mb-2 p-0"
        value={transcript}
        onChangeText={onTranscriptChange}
        editable={Boolean(onTranscriptChange)}
        multiline
        maxLength={5000}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel="Voice transcript — tap to edit"
        testID="voice-transcript-input"
      />
      {/* [BUG-715 / ACC-12] Secondary buttons collapse to icon-only on the 360pt-budget row. accessibilityLabel preserved for screen readers; Send keeps text + flex-1 prominence. */}
      <View className="flex-row gap-2">
        <Pressable
          onPress={handleSend}
          className="flex-1 bg-primary rounded-button py-2 items-center min-h-[44px] justify-center"
          accessibilityLabel="Send voice message"
          accessibilityRole="button"
          testID="voice-send-button"
        >
          <Text className="text-text-inverse font-semibold">Send</Text>
        </Pressable>
        <Pressable
          onPress={onReRecord}
          className="bg-surface rounded-button items-center justify-center min-h-[44px] min-w-[44px]"
          accessibilityLabel="Re-record"
          accessibilityRole="button"
          testID="voice-rerecord-button"
        >
          <Ionicons
            name="refresh-outline"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
        <Pressable
          onPress={handleDiscard}
          className="bg-surface rounded-button items-center justify-center min-h-[44px] min-w-[44px]"
          accessibilityLabel="Discard recording"
          accessibilityRole="button"
          testID="voice-discard-button"
        >
          <Ionicons
            name="trash-outline"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}
