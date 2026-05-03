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
        durationSeconds
      )}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 80 }}>
        <Text
          style={{ fontSize: 13, color: colors.textSecondary }}
          numberOfLines={1}
        >
          {date}
        </Text>
      </View>

      <View style={{ width: 60 }}>
        <Text style={{ fontSize: 13, color: colors.textSecondary }}>
          {formatDuration(durationSeconds)}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 13, color: colors.textPrimary }}
          numberOfLines={1}
        >
          {sessionType}
        </Text>
      </View>
    </Pressable>
  );
}
