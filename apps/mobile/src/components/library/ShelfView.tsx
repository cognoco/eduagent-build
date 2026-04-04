import { ScrollView, Text, View } from 'react-native';
import type { CurriculumBook, BookProgressStatus } from '@eduagent/schemas';
import { BookCard } from './BookCard';

export interface ShelfBookSummary {
  topicCount?: number;
  completedCount?: number;
  status: BookProgressStatus;
}

interface ShelfViewProps {
  books: CurriculumBook[];
  summaries?: Record<string, ShelfBookSummary>;
  suggestedBookId?: string;
  onBookPress: (bookId: string) => void;
}

export function ShelfView({
  books,
  summaries,
  suggestedBookId,
  onBookPress,
}: ShelfViewProps): React.ReactElement {
  if (books.length === 0) {
    return (
      <View className="bg-surface rounded-card px-4 py-6 items-center">
        <Text className="text-body text-text-secondary">
          No books on this shelf yet.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 16 }}
      testID="shelf-view"
    >
      {books.map((book) => {
        const summary = summaries?.[book.id];
        return (
          <BookCard
            key={book.id}
            book={book}
            status={
              summary?.status ??
              (book.topicsGenerated ? 'IN_PROGRESS' : 'NOT_STARTED')
            }
            topicCount={summary?.topicCount}
            completedCount={summary?.completedCount}
            highlighted={suggestedBookId === book.id}
            onPress={() => onBookPress(book.id)}
          />
        );
      })}
    </ScrollView>
  );
}
