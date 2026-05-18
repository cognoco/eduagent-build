import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { SubjectStatus } from '@eduagent/schemas';

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

function getProgressRatio(topicProgress: string): number {
  const [completedRaw, totalRaw] = topicProgress.split('/');
  const completed = Number(completedRaw);
  const total = Number(totalRaw);

  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, completed / total));
}

function ShelfBooksMotif({
  subjectId,
  tint,
}: {
  subjectId: string;
  tint: LearningSubjectTint;
}): React.ReactElement {
  const colors = useThemeColors();
  const spineStyles = [
    { height: 38, width: 9, left: 0, opacity: 0.72 },
    { height: 52, width: 11, left: 10, opacity: 1 },
    { height: 43, width: 10, left: 23, opacity: 0.84, rotate: '-6deg' },
    { height: 48, width: 10, left: 35, opacity: 0.92 },
    { height: 35, width: 8, left: 48, opacity: 0.66, rotate: '3deg' },
  ];

  return (
    <View
      testID={`shelf-row-bookshelf-${subjectId}`}
      style={{
        width: 88,
        minHeight: 108,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: 8,
          bottom: 28,
          width: 64,
          height: 66,
          borderRadius: 16,
          backgroundColor: colors.surface,
          borderColor: 'rgba(255,255,255,0.84)',
          borderWidth: 1,
          paddingHorizontal: 7,
          paddingTop: 7,
          paddingBottom: 8,
          shadowColor: colors.textPrimary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.08,
          shadowRadius: 13,
          elevation: 2,
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 7,
            right: 7,
            bottom: 7,
            height: 8,
            borderRadius: 999,
            backgroundColor: colors.textPrimary,
            opacity: 0.08,
          }}
        />
        <View style={{ height: 52, position: 'relative' }}>
          {spineStyles.map((spine, index) => (
            <View
              key={index}
              style={{
                position: 'absolute',
                left: spine.left,
                bottom: 5,
                width: spine.width,
                height: spine.height,
                borderRadius: 4,
                backgroundColor: tint.solid,
                opacity: spine.opacity,
                transform: spine.rotate
                  ? [{ rotate: spine.rotate }]
                  : undefined,
              }}
            >
              <View
                style={{
                  width: 2,
                  height: Math.max(10, Math.round(spine.height * 0.62)),
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.42)',
                  alignSelf: 'center',
                  marginTop: 8,
                }}
              />
            </View>
          ))}
        </View>
        <View
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: 7,
            height: 4,
            borderRadius: 999,
            backgroundColor: tint.solid,
            opacity: 0.68,
          }}
        />
      </View>

      <View
        testID={`shelf-row-plank-${subjectId}`}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 20,
          height: 13,
          borderRadius: 8,
          borderColor: tint.solid + '33',
          borderWidth: 1,
          backgroundColor: tint.solid + '22',
          shadowColor: tint.solid,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.11,
          shadowRadius: 10,
          elevation: 1,
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 9,
            right: 9,
            top: 2,
            height: 2,
            borderRadius: 999,
            backgroundColor: colors.surface,
            opacity: 0.48,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 5,
            right: 5,
            bottom: -5,
            height: 6,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 8,
            backgroundColor: colors.textSecondary,
            opacity: 0.11,
          }}
        />
      </View>
    </View>
  );
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
  const progressRatio = getProgressRatio(topicProgress);
  return (
    <View
      style={{
        opacity: isInactive ? 0.72 : 1,
        marginBottom: 10,
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
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: tint.soft,
          borderColor: tint.solid + '33',
          borderRadius: 20,
          borderWidth: 1,
          minHeight: 136,
          paddingTop: 12,
          paddingBottom: 14,
          paddingHorizontal: 14,
          shadowColor: colors.textPrimary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 0,
        }}
      >
        <View
          testID={`shelf-row-shelf-band-${subjectId}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 24,
            height: 18,
            backgroundColor: tint.solid,
            opacity: 0.08,
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'stretch',
            gap: 14,
          }}
        >
          <ShelfBooksMotif subjectId={subjectId} tint={tint} />

          <View
            style={{
              flex: 1,
              minWidth: 0,
              gap: 8,
              paddingTop: 9,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text
                style={{
                  flex: 1,
                  fontSize: 20,
                  lineHeight: 23,
                  fontWeight: 'bold',
                  color: colors.textPrimary,
                  paddingRight: 8,
                }}
                numberOfLines={1}
              >
                {name}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textSecondary}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </View>
            <Text
              style={{
                fontSize: 13,
                color: isUnstarted ? tint.solid : colors.textSecondary,
                fontWeight: isUnstarted ? '500' : 'normal',
                lineHeight: 18,
              }}
              numberOfLines={2}
            >
              {subtitle}
            </Text>

            <View style={{ minHeight: 20 }}>
              <View
                testID={`shelf-row-chip-row-${subjectId}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {statusChip ? (
                  <View
                    testID={statusChip.testID}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
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
                      paddingVertical: 3,
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
                      paddingVertical: 3,
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
              </View>
            </View>

            <View
              testID={`shelf-row-rail-${subjectId}`}
              style={{
                height: 5,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.58)',
                overflow: 'hidden',
                width: '100%',
                marginTop: 2,
              }}
            >
              <View
                testID={`shelf-row-progress-${subjectId}`}
                style={{
                  height: '100%',
                  width: `${Math.round(progressRatio * 100)}%`,
                  borderRadius: 999,
                  backgroundColor: tint.solid,
                }}
              />
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
