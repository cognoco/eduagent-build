// ---------------------------------------------------------------------------
// VoiceToggle — Session-level AI TTS mute/unmute (FR138-143)
// TEACH_BACK defaults voice-on; other types default voice-off.
// Session-scoped only — NOT a persistent preference.
// ---------------------------------------------------------------------------

import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';

interface VoiceToggleProps {
  isVoiceEnabled: boolean;
  onToggle: () => void;
}

export function VoiceToggle({ isVoiceEnabled, onToggle }: VoiceToggleProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onToggle}
      className="p-2 min-h-[44px] min-w-[44px] items-center justify-center"
      accessibilityLabel={
        isVoiceEnabled
          ? t('session.voiceToggle.a11yMute')
          : t('session.voiceToggle.a11yUnmute')
      }
      accessibilityRole="button"
      accessibilityState={{ checked: isVoiceEnabled }}
      testID="voice-toggle"
    >
      <Ionicons
        name={isVoiceEnabled ? 'volume-high' : 'volume-mute'}
        size={22}
        color={isVoiceEnabled ? colors.primary : colors.muted}
      />
    </Pressable>
  );
}
