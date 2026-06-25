import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { SubjectStatus } from '@eduagent/schemas';

import type { LearningSubjectTint } from '../../lib/subject-tints';
import { useSubjectTint, useThemeColors } from '../../lib/theme';
import { withOpacity } from '../../lib/color-opacity';

interface ShelfRowProps {
  subjectId: string;
  name: string;
  bookCount: number;
  topicsMastered: number;
  topicsLearning: number;
  topicsTotal: number;
  reviewDueCount: number;
  isFinished: boolean;
  isPaused?: boolean;
  status?: SubjectStatus;
  tint?: LearningSubjectTint;
  /** ISO timestamp: show urgency badge when this is in the future */
  urgencyBoostUntil?: string | null;
  /** Human-readable reason, used as chip label */
  urgencyBoostReason?: string | null;
  onPress: (subjectId: string) => void;
  testID?: string;
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
    { height: 24, width: 7, left: 0, opacity: 0.72 },
    { height: 32, width: 8, left: 9, opacity: 1 },
    { height: 28, width: 8, left: 19, opacity: 0.84, rotate: '-6deg' },
    { height: 30, width: 8, left: 29, opacity: 0.92 },
  ];

  return (
    <View
      testID={`shelf-row-bookshelf-${subjectId}`}
      style={{
        width: 48,
        height: 46,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <View
        style={{
          width: 48,
          height: 46,
          borderRadius: 14,
          backgroundColor: colors.surface,
          borderColor: 'rgba(255,255,255,0.84)',
          borderWidth: 1,
          paddingHorizontal: 6,
          paddingTop: 6,
          paddingBottom: 7,
          shadowColor: colors.textPrimary,
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.08,
          shadowRadius: 9,
          elevation: 2,
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 7,
            right: 7,
            bottom: 7,
            height: 5,
            borderRadius: 999,
            backgroundColor: colors.textPrimary,
            opacity: 0.08,
          }}
        />
        <View style={{ height: 30, position: 'relative' }}>
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
            left: 7,
            right: 7,
            bottom: 7,
            height: 4,
            borderRadius: 999,
            backgroundColor: tint.solid,
            opacity: 0.68,
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
  topicsMastered,
  topicsLearning,
  topicsTotal,
  reviewDueCount,
  isFinished,
  isPaused = false,
  status,
  tint: providedTint,
  urgencyBoostUntil,
  urgencyBoostReason,
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
          backgroundColor: withOpacity(colors.warning, 0.133),
          color: colors.warning,
        }
      : rowStatus === 'archived'
        ? {
            testID: `shelf-row-archived-${subjectId}`,
            label: t('library.row.archived'),
            backgroundColor: withOpacity(colors.textSecondary, 0.133),
            color: colors.textSecondary,
          }
        : null;

  const isUrgent =
    !!urgencyBoostUntil && new Date(urgencyBoostUntil).getTime() > Date.now();
  const urgencyChip = isUrgent
    ? {
        testID: `subject-urgency-badge-${subjectId}`,
        label: urgencyBoostReason
          ? t('library.row.urgencyBadge', { reason: urgencyBoostReason })
          : t('library.row.urgencyBadge', { reason: '!' }),
      }
    : null;

  const safeTotal = Math.max(0, topicsTotal);
  const safeMastered = Math.max(0, Math.min(topicsMastered, safeTotal));
  const safeLearning = Math.max(
    0,
    Math.min(topicsLearning, Math.max(0, safeTotal - safeMastered)),
  );
  const topicProgress = `${safeMastered}/${safeTotal}`;
  const isUnstarted = safeMastered === 0 && safeLearning === 0;
  const subtitle = isUnstarted
    ? t('library.row.shelfSubtitleUnstarted')
    : safeMastered > 0
      ? t('library.row.shelfSubtitleMastered', {
          count: bookCount,
          mastered: safeMastered,
          learning: safeLearning,
        })
      : t('library.row.shelfSubtitleLearningOnly', {
          count: bookCount,
          learning: safeLearning,
        });

  const needsReview = reviewDueCount > 0;
  const showFinished = isFinished && !needsReview;
  const hasChips = needsReview || showFinished || !!statusChip || !!urgencyChip;
  const masteredWidth =
    safeTotal > 0 ? Math.round((safeMastered / safeTotal) * 100) : 0;
  const learningWidth =
    safeTotal > 0 ? Math.round((safeLearning / safeTotal) * 100) : 0;
  const learningColor = withOpacity(tint.solid, 0.38);
  return (
    <View
      style={{
        opacity: isInactive ? 0.72 : 1,
        marginBottom: 8,
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
          borderColor: withOpacity(tint.solid, 0.2),
          borderRadius: 18,
          borderWidth: 1,
          minHeight: 92,
          paddingTop: 12,
          paddingBottom: 13,
          paddingHorizontal: 16,
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
            left: 10,
            right: 10,
            bottom: 8,
            height: 17,
            borderRadius: 12,
            backgroundColor: colors.surface,
            opacity: 0.28,
          }}
        />

        <View
          testID={`shelf-row-plank-${subjectId}`}
          style={{
            position: 'absolute',
            left: 84,
            right: 29,
            bottom: 17,
            height: 4,
            borderRadius: 999,
            backgroundColor: colors.surface,
            shadowColor: colors.textPrimary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 4,
            elevation: 1,
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <ShelfBooksMotif subjectId={subjectId} tint={tint} />

          <View
            style={{
              flex: 1,
              minWidth: 0,
              paddingTop: 0,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 16,
                  lineHeight: 18,
                  fontWeight: 'bold',
                  color: colors.textPrimary,
                }}
                numberOfLines={1}
              >
                {name}
              </Text>
              <Text
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  lineHeight: 16,
                  fontWeight: 'bold',
                  color: colors.textPrimary,
                }}
              >
                {topicProgress}
              </Text>
            </View>
            <Text
              style={{
                marginTop: 7,
                fontSize: 12,
                color: isUnstarted ? tint.solid : colors.textSecondary,
                fontWeight: isUnstarted ? '500' : 'normal',
                lineHeight: 15,
              }}
              numberOfLines={2}
            >
              {subtitle}
            </Text>

            <View
              style={{
                marginTop: 6,
                minHeight: hasChips ? 18 : 0,
              }}
            >
              <View
                testID={`shelf-row-chip-row-${subjectId}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {urgencyChip ? (
                  <View
                    testID={urgencyChip.testID}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 10,
                      backgroundColor: withOpacity(colors.warning, 0.133),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '500',
                        color: colors.warning,
                      }}
                      numberOfLines={1}
                    >
                      {urgencyChip.label}
                    </Text>
                  </View>
                ) : null}

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
                      backgroundColor: withOpacity(colors.retentionWeak, 0.133),
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
                      {t('library.row.review', { count: reviewDueCount })}
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
                      backgroundColor: withOpacity(colors.success, 0.133),
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
              testID={`shelf-row-progress-${subjectId}`}
              style={{
                height: 3,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.86)',
                overflow: 'hidden',
                width: '100%',
                marginTop: hasChips ? 4 : 14,
              }}
            >
              <View
                testID={`shelf-row-progress-mastered-${subjectId}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  height: '100%',
                  width: `${masteredWidth}%`,
                  borderRadius: 999,
                  backgroundColor: tint.solid,
                }}
              />
              <View
                testID={`shelf-row-progress-learning-${subjectId}`}
                style={{
                  position: 'absolute',
                  left: `${masteredWidth}%`,
                  height: '100%',
                  width: `${learningWidth}%`,
                  borderRadius: 999,
                  backgroundColor: learningColor,
                }}
              />
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
