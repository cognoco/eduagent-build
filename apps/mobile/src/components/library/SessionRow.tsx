import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';

interface SessionRowProps {
  emoji?: string | null;
  title: string;
  relativeDate: string;
  hasNote: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  testID?: string;
}

export function SessionRow({
  emoji,
  title,
  relativeDate,
  hasNote,
  onPress,
  onLongPress,
  testID,
}: SessionRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      className="flex-row items-center px-4 py-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      accessibilityRole="button"
      accessibilityLabel={
        hasNote
          ? t('library.sessionRow.a11yWithNote', { title, date: relativeDate })
          : t('library.sessionRow.a11y', { title, date: relativeDate })
      }
    >
      <Text className="text-body me-3">{emoji ?? '📖'}</Text>

      <Text className="flex-1 text-body-sm text-text-primary" numberOfLines={1}>
        {title}
      </Text>

      {hasNote ? (
        <View testID="session-note-indicator" className="me-2">
          <Ionicons
            name="document-text"
            size={14}
            color={colors.textSecondary}
          />
        </View>
      ) : null}

      <Text className="text-caption text-text-tertiary">{relativeDate}</Text>
    </Pressable>
  );
}
