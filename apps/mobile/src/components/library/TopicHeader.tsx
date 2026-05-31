import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  strongReviews?: number;
  strongReviewsTarget?: number;
  masteredAt?: string | null;
  /** Localized level label ("Topic") shown as an eyebrow above the name so the
   *  user always knows which library level they are on. */
  levelLabel?: string;
}

export function TopicHeader({
  name,
  chapter,
  retentionStatus,
  daysSinceLastReview,
  lastStudiedText,
  description,
  strongReviews = 0,
  strongReviewsTarget = 1,
  masteredAt = null,
  levelLabel,
}: TopicHeaderProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const trimmedDescription = description?.trim();
  const safeStrongReviewsTarget = Math.max(1, strongReviewsTarget);
  const strongReviewsClamped = Math.max(
    0,
    Math.min(strongReviews, safeStrongReviewsTarget),
  );
  const strongReviewRatio = strongReviewsClamped / safeStrongReviewsTarget;

  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
      }}
    >
      {levelLabel ? (
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: colors.textSecondary,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {levelLabel}
        </Text>
      ) : null}

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
        <View
          style={{
            marginTop: 8,
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <RetentionPill
            status={retentionStatus}
            daysSinceLastReview={daysSinceLastReview}
            size="large"
          />
          <View
            testID="topic-strong-reviews"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: withOpacity(colors.success, 0.28),
              backgroundColor: withOpacity(colors.success, 0.08),
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: withOpacity(colors.success, 0.32),
                overflow: 'hidden',
                justifyContent: 'flex-end',
              }}
            >
              <View
                testID="topic-strong-reviews-fill"
                style={{
                  height: `${Math.round(strongReviewRatio * 100)}%`,
                  backgroundColor: colors.success,
                }}
              />
            </View>
            <Text
              style={{
                color: colors.success,
                fontSize: 12,
                fontWeight: '700',
              }}
            >
              {masteredAt != null
                ? t('library.topic.mastered')
                : t('library.topic.strongReviewProgress', {
                    strong: strongReviewsClamped,
                    total: safeStrongReviewsTarget,
                  })}
            </Text>
          </View>
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
            {t('library.topic.covers')}
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
