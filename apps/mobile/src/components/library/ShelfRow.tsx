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

  return (
    <View style={{ marginBottom: 12, opacity: isInactive ? 0.65 : 1 }}>
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
        style={({ pressed }) => ({
          backgroundColor: tint.soft,
          borderColor: tint.solid + '33',
          borderRadius: 16,
          borderWidth: 1,
          flexDirection: 'row',
          alignItems: 'flex-start',
          minHeight: 108,
          paddingHorizontal: 16,
          paddingVertical: 18,
          opacity: pressed ? 0.76 : 1,
        })}
      >
        <SubjectBookshelfMotif
          testID={`shelf-row-bookshelf-${subjectId}`}
          tint={tint}
        />

        <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 19,
              fontWeight: '700',
              color: colors.textPrimary,
            }}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: isUnstarted ? tint.solid : colors.textSecondary,
              fontWeight: isUnstarted ? '600' : '400',
              marginTop: 4,
            }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>

          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 10,
            }}
          >
            {statusChip ? (
              <View
                testID={statusChip.testID}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: statusChip.backgroundColor,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
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
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: colors.retentionWeak + '22',
                }}
              >
                <Ionicons
                  name="refresh-circle"
                  size={13}
                  color={colors.retentionWeak}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
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
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: colors.success + '22',
                }}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={13}
                  color={colors.success}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.success,
                  }}
                >
                  {t('library.row.finished')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ paddingTop: 8 }}>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={colors.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </View>
      </Pressable>
    </View>
  );
}
