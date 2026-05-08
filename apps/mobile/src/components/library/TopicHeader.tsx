import { Text, View } from 'react-native';
import type { RetentionStatus } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';
import { RetentionPill } from './RetentionPill';

interface TopicHeaderProps {
  name: string;
  chapter: string | null;
  retentionStatus: RetentionStatus | null;
  daysSinceLastReview?: number | null;
  lastStudiedText: string;
}

export function TopicHeader({
  name,
  chapter,
  retentionStatus,
  daysSinceLastReview,
  lastStudiedText,
}: TopicHeaderProps) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
      }}
    >
      <Text
        style={{
          fontSize: 22,
          fontWeight: 'bold',
          color: colors.textPrimary,
        }}
        accessibilityRole="header"
      >
        {name}
      </Text>

      {chapter != null ? (
        <Text
          style={{
            fontSize: 14,
            color: colors.textSecondary,
            marginTop: 4,
          }}
        >
          {chapter}
        </Text>
      ) : null}

      {retentionStatus != null ? (
        <View style={{ marginTop: 8 }}>
          <RetentionPill
            status={retentionStatus}
            daysSinceLastReview={daysSinceLastReview}
            size="large"
          />
        </View>
      ) : null}

      <Text
        style={{
          fontSize: 13,
          color: colors.textSecondary,
          fontStyle: 'italic',
          marginTop: 8,
        }}
      >
        {lastStudiedText}
      </Text>
    </View>
  );
}
