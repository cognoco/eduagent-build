import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { SubjectStatus } from '@eduagent/schemas';

import { useSubjectTint, useThemeColors } from '../../lib/theme';

interface ShelfRowProps {
  subjectId: string;
  name: string;
  bookCount: number;
  topicProgress: string; // "18/32"
  reviewDueCount: number;
  isFinished: boolean;
  isPaused?: boolean;
  status?: SubjectStatus;
  onPress: (subjectId: string) => void;
  testID?: string;
}

export function ShelfRow({
  subjectId,
  name,
  bookCount,
  topicProgress,
  reviewDueCount,
  isFinished,
  isPaused = false,
  status,
  onPress,
  testID,
}: ShelfRowProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const tint = useSubjectTint(name || subjectId);
  const rowStatus = status ?? (isPaused ? 'paused' : 'active');
  const isInactive = rowStatus !== 'active';
  const statusSuffix =
    rowStatus === 'paused'
      ? t('library.row.shelfPausedSuffix')
      : rowStatus === 'archived'
        ? t('library.row.shelfArchivedSuffix')
        : '';
  const statusChip =
    rowStatus === 'paused'
      ? {
          testID: `shelf-row-paused-${subjectId}`,
          label: t('library.row.paused'),
          backgroundColor: colors.warning + '22',
          color: colors.warning,
        }
      : rowStatus === 'archived'
        ? {
            testID: `shelf-row-archived-${subjectId}`,
            label: t('library.row.archived'),
            backgroundColor: colors.textSecondary + '22',
            color: colors.textSecondary,
          }
        : null;

  // i18next pluralization picks shelfSubtitle_one vs shelfSubtitle_other based
  // on count, so the singular/plural form moves with the locale's plural rules
  // (e.g. Polish/Russian use multiple plural buckets — a hardcoded pair is wrong).
  const subtitle = t('library.row.shelfSubtitle', {
    count: bookCount,
    progress: topicProgress,
  });

  const needsReview = reviewDueCount > 0;
  const showFinished = isFinished && !needsReview;

  return (
    <View style={{ opacity: isInactive ? 0.65 : 1 }}>
      {/* Header row */}
      <Pressable
        testID={testID ?? `shelf-row-header-${subjectId}`}
        onPress={() => onPress(subjectId)}
        accessibilityRole="button"
        accessibilityLabel={t('library.row.shelfAccessibilityLabel', {
          name,
          subtitle,
          pausedSuffix: statusSuffix,
          reviewSuffix: needsReview
            ? t('library.row.shelfReviewSuffix')
            : showFinished
              ? t('library.row.shelfFinishedSuffix')
              : '',
          action: t('library.row.shelfActionOpen'),
        })}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 16,
          gap: 12,
        }}
      >
        {/* Tinted icon tile — Ionicons "library" in subject's tint color */}
        <View
          testID={`shelf-row-icon-${subjectId}`}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: tint.soft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="library" size={22} color={tint.solid} />
        </View>

        {/* Name + subtitle */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: 'bold',
              color: colors.textPrimary,
            }}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text
            style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>

        {/* Right side: paused chip + status pill + chevron */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {statusChip ? (
            <View
              testID={statusChip.testID}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 10,
                backgroundColor: statusChip.backgroundColor,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '500',
                  color: statusChip.color,
                }}
              >
                {statusChip.label}
              </Text>
            </View>
          ) : null}

          {needsReview ? (
            <View
              testID={`shelf-row-review-${subjectId}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 10,
                backgroundColor: colors.retentionWeak + '22',
              }}
            >
              <Ionicons
                name="alert-circle"
                size={12}
                color={colors.retentionWeak}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.retentionWeak,
                }}
              >
                {t('library.row.review')}
              </Text>
            </View>
          ) : null}

          {showFinished ? (
            <View
              testID={`shelf-row-finished-${subjectId}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 10,
                backgroundColor: colors.success + '22',
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={12}
                color={colors.success}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.success,
                }}
              >
                {t('library.row.finished')}
              </Text>
            </View>
          ) : null}

          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </View>
      </Pressable>
    </View>
  );
}
