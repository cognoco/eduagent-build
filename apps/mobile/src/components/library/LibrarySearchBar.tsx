import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';
import { VoiceInputControl } from '../common/VoiceInputControl';

interface LibrarySearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Accessible name for the search field; falls back to the placeholder. */
  accessibilityLabel?: string;
  /** Voice locale for the search mic (WI-2552), resolved by the screen. */
  voiceLocale?: string;
}

export function LibrarySearchBar({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  voiceLocale,
}: LibrarySearchBarProps): React.ReactElement {
  const { t } = useTranslation();
  const themeColors = useThemeColors();

  return (
    <View className="flex-row items-center bg-surface rounded-card px-3 py-2 mb-3">
      <Ionicons name="search" size={18} color={themeColors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={themeColors.muted}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        className="flex-1 text-body text-text-primary ms-2 py-1"
        testID="library-search-input"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => Keyboard.dismiss()}
      />
      {/* WI-2552: shared transcription-only mic; the final transcript
          REPLACES the query through the same onChangeText path as typing. */}
      <VoiceInputControl
        value={value}
        voiceLocale={voiceLocale}
        testID="library-search-mic"
        onTranscript={onChangeText}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          className="p-1"
          testID="library-search-clear"
          accessibilityRole="button"
          accessibilityLabel={t('library.a11yClearSearch')}
        >
          {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
          <View
            testID="library-search-clear-icon"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons
              name="close-circle"
              size={18}
              color={themeColors.textSecondary}
            />
          </View>
        </Pressable>
      )}
    </View>
  );
}
