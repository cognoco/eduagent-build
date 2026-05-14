import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '../../lib/theme';

interface TopicSessionRowProps {
  sessionId: string;
  date: string;
  durationSeconds: number | null;
  sessionType: string;
  onPress: (sessionId: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return '<1 min';
  return `${Math.floor(seconds / 60)} min`;
}

export function TopicSessionRow({
  sessionId,
  date,
  durationSeconds,
  sessionType,
  onPress,
}: TopicSessionRowProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      testID={`session-row-${sessionId}`}
      onPress={() => onPress(sessionId)}
      accessibilityRole="button"
      accessibilityLabel={`${sessionType}, ${date}, ${formatDuration(
        durationSeconds,
      )}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        minHeight: 72,
        marginHorizontal: 20,
        marginBottom: 10,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
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
        style={{
          minWidth: 64,
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
          {formatDuration(durationSeconds)}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.textSecondary}
        style={{ marginLeft: 8 }}
      />
    </Pressable>
  );
}
