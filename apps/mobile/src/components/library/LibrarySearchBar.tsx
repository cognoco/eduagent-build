import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';

interface LibrarySearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}

export function LibrarySearchBar({
  value,
  onChangeText,
  placeholder,
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
        className="flex-1 text-body text-text-primary ms-2 py-1"
        testID="library-search-input"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => Keyboard.dismiss()}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          className="p-1"
          testID="library-search-clear"
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
