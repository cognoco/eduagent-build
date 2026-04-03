// ---------------------------------------------------------------------------
// SessionInputModeToggle — Text/Voice mode selector (FR144, Story 8.1)
// Shown at session start before the first exchange.
// ---------------------------------------------------------------------------

import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';
import type { InputMode } from '@eduagent/schemas';

export interface SessionInputModeToggleProps {
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
}

export function SessionInputModeToggle({
  mode,
  onModeChange,
}: SessionInputModeToggleProps) {
  const colors = useThemeColors();

  return (
    <View
      className="flex-row items-center justify-center gap-1 mx-4 my-2 p-1 bg-surface-elevated rounded-xl"
      testID="session-input-mode-toggle"
    >
      <Pressable
        onPress={() => onModeChange('text')}
        className={`flex-1 flex-row items-center justify-center gap-2 py-2 rounded-lg min-h-[44px] ${
          mode === 'text' ? 'bg-primary' : ''
        }`}
        accessibilityLabel="Text mode"
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'text' }}
        testID="input-mode-text"
      >
        <Ionicons
          name="chatbubble-outline"
          size={18}
          color={mode === 'text' ? colors.textInverse : colors.textSecondary}
        />
        <Text
          className={`font-semibold ${
            mode === 'text' ? 'text-text-inverse' : 'text-text-secondary'
          }`}
        >
          Text
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onModeChange('voice')}
        className={`flex-1 flex-row items-center justify-center gap-2 py-2 rounded-lg min-h-[44px] ${
          mode === 'voice' ? 'bg-primary' : ''
        }`}
        accessibilityLabel="Voice mode"
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'voice' }}
        testID="input-mode-voice"
      >
        <Ionicons
          name="mic-outline"
          size={18}
          color={mode === 'voice' ? colors.textInverse : colors.textSecondary}
        />
        <Text
          className={`font-semibold ${
            mode === 'voice' ? 'text-text-inverse' : 'text-text-secondary'
          }`}
        >
          Voice
        </Text>
      </Pressable>
    </View>
  );
}
