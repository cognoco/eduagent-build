import { Text, View } from 'react-native';
import type { RetentionStatus } from '@eduagent/schemas';
import { withOpacity } from '../../lib/color-opacity';
import { useThemeColors } from '../../lib/theme';
import { RetentionPill } from './RetentionPill';

interface TopicHeaderProps {
  name: string;
  chapter: string | null;
  retentionStatus: RetentionStatus | null;
  daysSinceLastReview?: number | null;
  lastStudiedText: string;
  description?: string | null;
}

export function TopicHeader({
  name,
  chapter,
  retentionStatus,
  daysSinceLastReview,
  lastStudiedText,
  description,
}: TopicHeaderProps) {
  const colors = useThemeColors();
  const trimmedDescription = description?.trim();

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

      {trimmedDescription ? (
        <View
          testID="topic-covers-card"
          style={{
            marginTop: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: withOpacity(colors.accent, 0.18),
            backgroundColor: withOpacity(colors.accent, 0.08),
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              color: colors.accent,
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 0,
              lineHeight: 14,
              textTransform: 'uppercase',
            }}
          >
            This topic covers
          </Text>
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 15,
              lineHeight: 21,
              marginTop: 5,
            }}
          >
            {trimmedDescription}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
