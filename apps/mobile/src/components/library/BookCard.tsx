import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BookProgressStatus, CurriculumBook } from '@eduagent/schemas';
import { displayBookDescription } from '../../lib/book-display';
import type { SubjectTint } from '../../lib/design-tokens';
import { withOpacity } from '../../lib/color-opacity';
import { useThemeColors } from '../../lib/theme';

interface BookCardProps {
  book: CurriculumBook;
  status: BookProgressStatus;
  highlighted?: boolean;
  tint?: SubjectTint;
  onPress: () => void;
}

const STATUS_STYLES: Record<BookProgressStatus, string> = {
  NOT_STARTED: 'bg-surface',
  IN_PROGRESS: 'bg-primary/10',
  REVIEW_DUE: 'bg-warning/10',
};

export function BookCard({
  book,
  status,
  highlighted = false,
  tint,
  onPress,
}: BookCardProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const progressLabel = book.topicsGenerated
    ? t('library.book.readyToOpen')
    : t('library.book.buildThisBook');
  const statusLabel = t(`library.book.status.${status}`);
  const isMastered = book.masteredAt != null;
  const totalTopics = book.topicCount ?? 0;
  const masteredTopics = Math.min(book.masteredTopicCount ?? 0, totalTopics);
  const learningTopics = Math.max(
    0,
    Math.min(
      (book.completedTopicCount ?? 0) - masteredTopics,
      Math.max(0, totalTopics - masteredTopics),
    ),
  );
  const masteredWidth =
    totalTopics > 0 ? Math.round((masteredTopics / totalTopics) * 100) : 0;
  const learningWidth =
    totalTopics > 0 ? Math.round((learningTopics / totalTopics) * 100) : 0;
  const solid = tint?.solid ?? colors.primary;
  const learning = withOpacity(solid, 0.38);
  const shownDescription = displayBookDescription(book.title, book.description);

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-card px-4 py-4 mb-3 ${STATUS_STYLES[status]} ${
        highlighted ? 'border border-primary' : ''
      }`}
      style={
        tint
          ? {
              borderWidth: 1,
              borderColor: highlighted ? tint.solid : tint.soft,
            }
          : undefined
      }
      accessibilityRole="button"
      accessibilityLabel={t('library.bookCard.a11y', {
        title: book.title,
        status: statusLabel,
        progress: progressLabel,
      })}
      testID={`book-card-${book.id}`}
    >
      <View className="flex-row items-start">
        <View
          className="w-12 h-12 rounded-2xl bg-surface-elevated items-center justify-center me-3"
          style={
            tint
              ? {
                  backgroundColor: tint.soft,
                  borderWidth: 1,
                  borderColor: tint.solid,
                }
              : undefined
          }
          testID={`book-card-icon-${book.id}`}
        >
          <Text className="text-2xl">{book.emoji ?? '📘'}</Text>
        </View>

        <View className="flex-1">
          <View className="flex-row items-start justify-between">
            <Text className="text-body font-semibold text-text-primary flex-1 me-3">
              {book.title}
            </Text>
            <View className="items-end gap-1">
              {isMastered ? (
                <Text
                  testID={`book-card-mastered-${book.id}`}
                  className="text-caption font-semibold text-success"
                >
                  {t('library.book.mastered')}
                </Text>
              ) : null}
              <Text className="text-caption font-semibold text-text-secondary">
                {statusLabel}
              </Text>
              {status === 'REVIEW_DUE' ? (
                <Text
                  testID={`book-card-review-${book.id}`}
                  className="text-caption font-semibold text-warning"
                >
                  {t('library.book.reviewDue')}
                </Text>
              ) : null}
            </View>
          </View>

          {shownDescription && (
            <Text className="text-body-sm text-text-secondary mt-1">
              {shownDescription}
            </Text>
          )}

          <Text className="text-caption text-text-tertiary mt-3">
            {progressLabel}
          </Text>

          {totalTopics > 0 ? (
            <View
              testID={`book-card-rail-${book.id}`}
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-elevated"
            >
              <View
                testID={`book-card-progress-mastered-${book.id}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  height: '100%',
                  width: `${masteredWidth}%`,
                  backgroundColor: solid,
                }}
              />
              <View
                testID={`book-card-progress-learning-${book.id}`}
                style={{
                  position: 'absolute',
                  left: `${masteredWidth}%`,
                  height: '100%',
                  width: `${learningWidth}%`,
                  backgroundColor: learning,
                }}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
