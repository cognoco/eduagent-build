import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../lib/theme';
import { useDurationLabel } from '../../hooks/use-time-format';

interface TopicSessionRowProps {
  sessionId: string;
  date: string;
  durationSeconds: number | null;
  sessionType: string;
  onPress: (sessionId: string) => void;
}

export function TopicSessionRow({
  sessionId,
  date,
  durationSeconds,
  sessionType,
  onPress,
}: TopicSessionRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const durationLabel = useDurationLabel();
  const formattedDuration = durationLabel(durationSeconds);

  return (
    <Pressable
      testID={`session-row-${sessionId}`}
      onPress={() => onPress(sessionId)}
      accessibilityRole="button"
      accessibilityLabel={t('library.topicSessionRow.a11y', {
        type: sessionType,
        date,
        duration: formattedDuration,
      })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        width: '100%',
        maxWidth: '100%',
        minHeight: 72,
        marginBottom: 10,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <View
        testID={`session-row-icon-${sessionId}`}
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceElevated,
          marginRight: 12,
        }}
      >
        <Ionicons name="time-outline" size={22} color={colors.primary} />
      </View>

      <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: colors.textPrimary,
          }}
          numberOfLines={1}
        >
          {date}
        </Text>
        <Text
          style={{
            marginTop: 3,
            fontSize: 13,
            color: colors.textSecondary,
            textTransform: 'capitalize',
          }}
          numberOfLines={1}
        >
          {sessionType}
        </Text>
      </View>

      <View
        testID={`session-row-duration-${sessionId}`}
        style={{
          minWidth: 64,
          flexShrink: 0,
          alignSelf: 'center',
          alignItems: 'center',
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text
          style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}
          numberOfLines={1}
        >
          {formattedDuration}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.textSecondary}
        style={{ marginLeft: 8, flexShrink: 0 }}
      />
    </Pressable>
  );
}
