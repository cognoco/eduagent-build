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
import { SuggestionCard } from '../../../../components/library/SuggestionCard';
import { useBookSuggestions } from '../../../../hooks/use-book-suggestions';
import { useBooks } from '../../../../hooks/use-books';
import { useFiling } from '../../../../hooks/use-filing';
import { useSubjects } from '../../../../hooks/use-subjects';
import { useThemeColors } from '../../../../lib/theme';

interface BookSuggestion {
  id: string;
  title: string;
  emoji?: string | null;
  description?: string | null;
}

export default function ShelfScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const params = useLocalSearchParams<{ subjectId: string }>();
  const subjectId = params.subjectId;

  const booksQuery = useBooks(subjectId);
  const subjectsQuery = useSubjects();

  const books = booksQuery.data ?? [];
  const subject = subjectsQuery.data?.find((s) => s.id === subjectId);

  const { data: rawBookSuggestions } = useBookSuggestions(subjectId);
  const bookSuggestions = (rawBookSuggestions ?? []) as BookSuggestion[];
  const filing = useFiling();

  const handlePickBookSuggestion = async (suggestion: BookSuggestion) => {
    try {
      const result = await filing.mutateAsync({
        rawInput: suggestion.title,
        selectedSuggestion: suggestion.title,
        pickedSuggestionId: suggestion.id,
      });
      router.push({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: { subjectId: result.shelfId, bookId: result.bookId },
      } as never);
    } catch {
      Alert.alert('Error', "Couldn't set up that book.", [{ text: 'OK' }]);
    }
  };

  // Single-book auto-skip: navigate directly to the book screen
  useEffect(() => {
    if (booksQuery.data && booksQuery.data.length === 1 && subjectId) {
      const onlyBook = booksQuery.data[0]!;
      router.replace({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: { subjectId, bookId: onlyBook.id },
      } as never);
    }
  }, [booksQuery.data, subjectId, router]);

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

  const isLoading = booksQuery.isLoading || subjectsQuery.isLoading;

  const failedQuery = booksQuery.isError
    ? booksQuery
    : subjectsQuery.isError
    ? subjectsQuery
    : null;
  const isError = failedQuery !== null;

  const handleRetry = (): void => {
    void booksQuery.refetch();
    void subjectsQuery.refetch();
  };

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
              pathname: '/(app)/subject/[subjectId]',
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

      {/* Study next suggestions */}
      {bookSuggestions.length > 0 && (
        <View className="px-4 mb-4">
          <Text className="text-sm font-semibold text-text-muted mb-3">
            Study next
          </Text>
          <View className="flex-row gap-3">
            {bookSuggestions.slice(0, 2).map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                title={suggestion.title}
                emoji={suggestion.emoji}
                description={suggestion.description}
                onPress={() => void handlePickBookSuggestion(suggestion)}
                testID={`shelf-suggestion-${suggestion.id}`}
              />
            ))}
          </View>
        </View>
      )}

      {/* Browse all link when more than 2 suggestions */}
      {bookSuggestions.length > 2 && (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/(app)/pick-book/[subjectId]',
              params: { subjectId },
            } as never)
          }
          className="mx-4 mb-4 border border-dashed border-border rounded-xl py-3 items-center"
          testID="shelf-browse-all-suggestions"
          accessibilityRole="button"
          accessibilityLabel="Browse all suggestions"
        >
          <Text className="text-text-muted">Browse all suggestions</Text>
        </Pressable>
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
                pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
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
