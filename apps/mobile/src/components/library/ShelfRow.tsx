import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { SubjectStatus } from '@eduagent/schemas';

import { SubjectBookshelfMotif } from '../common/SubjectBookshelfMotif';
import type { LearningSubjectTint } from '../../lib/learning-subject-tints';
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
  tint?: LearningSubjectTint;
  onPress: (subjectId: string) => void;
  testID?: string;
  variant?: 'row' | 'card';
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
  tint: providedTint,
  onPress,
  testID,
  variant = 'row',
}: ShelfRowProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const fallbackTint = useSubjectTint(subjectId);
  const tint = providedTint ?? fallbackTint;
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

  const isUnstarted = bookCount === 0;
  const subtitle = isUnstarted
    ? t('library.row.shelfSubtitleUnstarted')
    : t('library.row.shelfSubtitle', {
        count: bookCount,
        progress: topicProgress,
      });

  const needsReview = reviewDueCount > 0;
  const showFinished = isFinished && !needsReview;
  const openLabel = t('library.row.shelfActionOpen');
  const openDisplayLabel =
    openLabel.length > 0
      ? openLabel.charAt(0).toUpperCase() + openLabel.slice(1)
      : 'Open';
  const cardStatusLabel = isUnstarted
    ? t('library.row.shelfSubtitleUnstarted')
    : rowStatus === 'paused'
      ? t('library.row.paused')
      : rowStatus === 'archived'
        ? t('library.row.archived')
        : needsReview
          ? t('library.row.review')
          : showFinished
            ? t('library.row.finished')
            : openDisplayLabel;
  const cardStatusColor =
    rowStatus === 'paused'
      ? colors.warning
      : rowStatus === 'archived'
        ? colors.textSecondary
        : needsReview
          ? colors.retentionWeak
          : showFinished
            ? colors.success
            : isUnstarted
              ? tint.solid
              : colors.textSecondary;
  const topicCountLabel = t('library.row.bookTopics', {
    progress: topicProgress,
  });

  if (variant === 'card') {
    return (
      <View
        style={{
          opacity: isInactive ? 0.65 : 1,
          minHeight: 154,
          position: 'relative',
        }}
      >
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
            minHeight: 148,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: tint.solid + '1F',
            backgroundColor: tint.soft,
            paddingHorizontal: 12,
            paddingTop: 12,
            paddingBottom: 11,
            justifyContent: 'space-between',
            shadowColor: tint.solid,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          <View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <SubjectBookshelfMotif
                testID={`shelf-row-bookshelf-${subjectId}`}
                tint={tint}
              />
              <Ionicons
                name="chevron-forward"
                size={15}
                color={colors.textSecondary}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ marginTop: 4 }}
              />
            </View>
            <Text
              style={{
                fontSize: 16,
                fontWeight: 'bold',
                color: colors.textPrimary,
                marginTop: 12,
              }}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: cardStatusColor,
                fontWeight: isUnstarted || needsReview ? '600' : '400',
                marginTop: 4,
              }}
              numberOfLines={1}
            >
              {cardStatusLabel}
            </Text>
          </View>

          <View>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: colors.textPrimary,
              }}
              numberOfLines={1}
            >
              {topicCountLabel}
            </Text>
            <View
              testID={`shelf-row-rail-${subjectId}`}
              style={{
                height: 4,
                borderRadius: 999,
                backgroundColor: tint.solid,
                opacity: 0.25,
                marginTop: 7,
                width: '100%',
              }}
            />
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        opacity: isInactive ? 0.65 : 1,
        marginBottom: 16,
        minHeight: 98,
        position: 'relative',
      }}
    >
      <View
        testID={`shelf-row-backboard-${subjectId}`}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 38,
          right: 10,
          top: 8,
          bottom: 18,
          borderRadius: 8,
          backgroundColor: tint.soft,
          borderColor: tint.solid + '18',
          borderWidth: 1,
        }}
      />
      <View
        testID={`shelf-row-depth-${subjectId}`}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 18,
          borderRadius: 9,
          backgroundColor: tint.solid + '2A',
          borderColor: tint.solid + '24',
          borderWidth: 1,
        }}
      >
        <View
          style={{
            height: 3,
            borderTopLeftRadius: 9,
            borderTopRightRadius: 9,
            backgroundColor: tint.solid,
            opacity: 0.24,
          }}
        />
      </View>
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
          minHeight: 90,
          paddingTop: 12,
          paddingBottom: 20,
          paddingHorizontal: 16,
          gap: 12,
          borderRadius: 10,
          borderWidth: 0,
          backgroundColor: 'transparent',
          shadowColor: tint.solid,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 0,
          zIndex: 1,
        }}
      >
        <SubjectBookshelfMotif
          testID={`shelf-row-bookshelf-${subjectId}`}
          tint={tint}
        />

        <View style={{ flex: 1, minWidth: 0 }}>
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
            style={{
              fontSize: 12,
              color: isUnstarted ? tint.solid : colors.textSecondary,
              fontWeight: isUnstarted ? '500' : 'normal',
              marginTop: 1,
            }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
          <View
            testID={`shelf-row-rail-${subjectId}`}
            style={{
              height: 4,
              borderRadius: 999,
              backgroundColor: tint.solid,
              opacity: 0.42,
              marginTop: 8,
              width: '72%',
            }}
          />
        </View>

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
                name="refresh-circle"
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
