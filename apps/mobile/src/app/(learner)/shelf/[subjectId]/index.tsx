import { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BookProgressStatus } from '@eduagent/schemas';
import { BookCard } from '../../../../components/library/BookCard';
import { useBooks } from '../../../../hooks/use-books';
import { useSubjects } from '../../../../hooks/use-subjects';
import { useOverallProgress } from '../../../../hooks/use-progress';
import { useThemeColors } from '../../../../lib/theme';

// Module-level debug tracker — survives the crash
let _lastStep = 'module-load';

export default function ShelfScreen() {
  _lastStep = 'start';
  const router = useRouter();
  _lastStep = 'after-useRouter';
  const insets = useSafeAreaInsets();
  _lastStep = 'after-useSafeAreaInsets';
  const themeColors = useThemeColors();
  _lastStep = 'after-useThemeColors';
  const params = useLocalSearchParams<{ subjectId: string }>();
  const subjectId = params.subjectId;
  _lastStep = 'after-useLocalSearchParams(' + subjectId + ')';

  const booksQuery = useBooks(subjectId);
  _lastStep = 'after-useBooks';
  const subjectsQuery = useSubjects();
  _lastStep = 'after-useSubjects';
  const progressQuery = useOverallProgress();
  _lastStep = 'after-useOverallProgress';

  const books = booksQuery.data ?? [];
  _lastStep = 'after-books-derive';
  const subject = subjectsQuery.data?.find((s) => s.id === subjectId);
  _lastStep = 'after-subject-find';
  const subjectProgress = (progressQuery.data?.subjects ?? []).find(
    (s: { subjectId: string }) => s.subjectId === subjectId
  );
  _lastStep = 'after-subjectProgress-find';

  // Show debug alert on mount so we know the component rendered
  useEffect(() => {
    Alert.alert(
      'Shelf Debug',
      `Reached: ${_lastStep}\nsubjectId: ${subjectId}\nbooksLoading: ${booksQuery.isLoading}\nsubjectsLoading: ${subjectsQuery.isLoading}\nprogressLoading: ${progressQuery.isLoading}`
    );
  }, []);

  // Single-book auto-skip: navigate directly to the book screen
  useEffect(() => {
    if (booksQuery.data && booksQuery.data.length === 1 && subjectId) {
      const onlyBook = booksQuery.data[0]!;
      router.replace({
        pathname: '/(learner)/shelf/[subjectId]/book/[bookId]',
        params: { subjectId, bookId: onlyBook.id },
      } as never);
    }
  }, [booksQuery.data, subjectId, router]);

  _lastStep = 'before-guards';

  // Guard: param must exist
  if (!subjectId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
        testID="shelf-missing-param"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          Missing subject. Please go back and try again.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          testID="shelf-missing-param-back"
        >
          <Text className="text-text-primary text-body font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  // Return null while auto-redirecting to the single book
  if (booksQuery.data && booksQuery.data.length === 1) {
    return null;
  }

  _lastStep = 'before-isLoading';

  const isLoading =
    booksQuery.isLoading || subjectsQuery.isLoading || progressQuery.isLoading;

  const failedQuery = booksQuery.isError
    ? booksQuery
    : subjectsQuery.isError
    ? subjectsQuery
    : progressQuery.isError
    ? progressQuery
    : null;
  const isError = failedQuery !== null;

  _lastStep = 'before-handlers';

  const handleRetry = (): void => {
    void booksQuery.refetch();
    void subjectsQuery.refetch();
    void progressQuery.refetch();
  };

  const completedCount = subjectProgress?.topicsCompleted ?? 0;
  const totalCount = subjectProgress?.topicsTotal ?? 0;
  const progressRatio = totalCount > 0 ? completedCount / totalCount : 0;

  const getBookStatus = (bookId: string): BookProgressStatus => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return 'NOT_STARTED';
    if (!book.topicsGenerated) return 'NOT_STARTED';
    return 'IN_PROGRESS';
  };

  const suggestedBookId = (() => {
    const inProgress = books.find((b) => getBookStatus(b.id) === 'IN_PROGRESS');
    if (inProgress) return inProgress.id;
    const notStarted = books.find((b) => getBookStatus(b.id) === 'NOT_STARTED');
    if (notStarted) return notStarted.id;
    return null;
  })();

  _lastStep = 'before-render-states';

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
        testID="shelf-loading"
      >
        <ActivityIndicator size="large" color={themeColors.accent} />
        <Text className="text-body-sm text-text-secondary mt-3">
          Loading this shelf...
        </Text>
        <Text className="text-caption text-text-tertiary mt-1">
          debug: {_lastStep}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 px-5 py-3"
          accessibilityLabel="Go back"
          testID="shelf-loading-back"
        >
          <Text className="text-body text-primary font-semibold">Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (isError) {
    const errorMessage =
      failedQuery?.error instanceof Error
        ? failedQuery.error.message
        : 'Unable to load this shelf.';

    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
        testID="shelf-error"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          {errorMessage}
        </Text>
        <Pressable
          onPress={handleRetry}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
          testID="shelf-retry-button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Retry
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          testID="shelf-back-button"
        >
          <Text className="text-text-primary text-body font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  _lastStep = 'before-main-render';

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="shelf-screen"
    >
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="p-2 -ms-2 me-2"
          accessibilityLabel="Back"
          testID="shelf-back"
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.accent} />
        </Pressable>

        <View className="flex-1">
          <Text
            className="text-h1 font-bold text-text-primary"
            numberOfLines={1}
          >
            {subject?.name ?? 'Shelf'}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {books.length} {books.length === 1 ? 'book' : 'books'}
          </Text>
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/(learner)/subject/[subjectId]',
              params: { subjectId },
            } as never)
          }
          className="p-2 -me-2"
          accessibilityLabel="Subject settings"
          testID="shelf-settings"
        >
          <Ionicons
            name="settings-outline"
            size={22}
            color={themeColors.textSecondary}
          />
        </Pressable>
      </View>

      {/* Subject progress bar */}
      {totalCount > 0 && (
        <View className="px-5 pb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-caption text-text-secondary">
              {completedCount}/{totalCount} topics completed
            </Text>
          </View>
          <View className="h-2 bg-surface-elevated rounded-full overflow-hidden">
            <View
              className="h-2 bg-primary rounded-full"
              style={{ width: `${Math.round(progressRatio * 100)}%` }}
            />
          </View>
        </View>
      )}

      {/* Book list */}
      <FlatList
        data={books}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 80,
        }}
        renderItem={({ item }) => (
          <BookCard
            book={item}
            status={getBookStatus(item.id)}
            highlighted={item.id === suggestedBookId}
            onPress={() =>
              router.push({
                pathname: '/(learner)/shelf/[subjectId]/book/[bookId]',
                params: { subjectId, bookId: item.id },
              } as never)
            }
          />
        )}
        ListEmptyComponent={
          <View
            className="bg-surface rounded-card px-4 py-8 items-center"
            testID="shelf-empty"
          >
            <Text className="text-body font-semibold text-text-primary text-center mb-2">
              No books on this shelf yet.
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mb-5">
              Your curriculum is still being built. Check back soon.
            </Text>
            <Pressable
              onPress={() => router.back()}
              className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
              testID="shelf-empty-back"
            >
              <Text className="text-text-primary text-body font-semibold">
                Go back
              </Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}
