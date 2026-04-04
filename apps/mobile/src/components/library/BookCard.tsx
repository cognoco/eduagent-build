import { Pressable, Text, View } from 'react-native';
import type { BookProgressStatus, CurriculumBook } from '@eduagent/schemas';

interface BookCardProps {
  book: CurriculumBook;
  status: BookProgressStatus;
  topicCount?: number;
  completedCount?: number;
  highlighted?: boolean;
  onPress: () => void;
}

const STATUS_STYLES: Record<BookProgressStatus, string> = {
  NOT_STARTED: 'bg-surface',
  IN_PROGRESS: 'bg-primary/10',
  COMPLETED: 'bg-success/10',
  REVIEW_DUE: 'bg-warning/10',
};

const STATUS_LABELS: Record<BookProgressStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Complete',
  REVIEW_DUE: 'Review due',
};

export function BookCard({
  book,
  status,
  topicCount,
  completedCount,
  highlighted = false,
  onPress,
}: BookCardProps): React.ReactElement {
  const progressLabel =
    typeof topicCount === 'number'
      ? `${completedCount ?? 0}/${topicCount} topics`
      : book.topicsGenerated
      ? 'Ready to open'
      : 'Build this book';

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-card px-4 py-4 mb-3 ${STATUS_STYLES[status]} ${
        highlighted ? 'border border-primary' : ''
      }`}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}. ${STATUS_LABELS[status]}. ${progressLabel}.`}
      testID={`book-card-${book.id}`}
    >
      <View className="flex-row items-start">
        <View className="w-12 h-12 rounded-2xl bg-surface-elevated items-center justify-center me-3">
          <Text className="text-2xl">{book.emoji ?? '📘'}</Text>
        </View>

        <View className="flex-1">
          <View className="flex-row items-start justify-between">
            <Text className="text-body font-semibold text-text-primary flex-1 me-3">
              {book.title}
            </Text>
            <Text className="text-caption font-semibold text-text-secondary">
              {STATUS_LABELS[status]}
            </Text>
          </View>

          {book.description && (
            <Text className="text-body-sm text-text-secondary mt-1">
              {book.description}
            </Text>
          )}

          <Text className="text-caption text-text-tertiary mt-3">
            {progressLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
