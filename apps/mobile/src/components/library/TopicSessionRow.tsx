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
        justifyContent: 'space-between',
        minHeight: 52,
        marginHorizontal: 20,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: colors.textPrimary,
          }}
          numberOfLines={1}
        >
          {date}
        </Text>
      </View>

      <View style={{ width: 64, alignItems: 'flex-end' }}>
        <Text
          style={{ fontSize: 13, color: colors.textSecondary }}
          numberOfLines={1}
        >
          {formatDuration(durationSeconds)}
        </Text>
      </View>

      <View style={{ width: 88, alignItems: 'flex-end', paddingLeft: 8 }}>
        <Text
          style={{
            fontSize: 13,
            color: colors.textSecondary,
            textTransform: 'capitalize',
          }}
          numberOfLines={1}
        >
          {sessionType}
        </Text>
      </View>
    </Pressable>
  );
}
