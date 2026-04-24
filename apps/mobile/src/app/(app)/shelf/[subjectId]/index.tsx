import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BookProgressStatus, BookSuggestion } from '@eduagent/schemas';
import { BookPageFlipAnimation } from '../../../../components/common';
import { ErrorFallback } from '../../../../components/common/ErrorFallback';
import { BookCard } from '../../../../components/library/BookCard';
import { SuggestionCard } from '../../../../components/library/SuggestionCard';
import { useBookSuggestions } from '../../../../hooks/use-book-suggestions';
import { useBooks } from '../../../../hooks/use-books';
import { useFiling } from '../../../../hooks/use-filing';
import { useSubjects } from '../../../../hooks/use-subjects';
import {
  classifyApiError,
  recoveryActions,
} from '../../../../lib/format-api-error';
import { goBackOrReplace } from '../../../../lib/navigation';
import { useThemeColors } from '../../../../lib/theme';

export default function ShelfScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const params = useLocalSearchParams<{ subjectId: string }>();
  const subjectId = params.subjectId;

  const booksQuery = useBooks(subjectId);
  const subjectsQuery = useSubjects();

  // BUG-418: Use Array.isArray instead of ?? — TanStack Query's `select` is
  // bypassed when `enabled` is false, so `data` can be a wrapped object rather
  // than an array. The ?? operator only catches null/undefined, not objects.
  const books = Array.isArray(booksQuery.data) ? booksQuery.data : [];
  const subject = subjectsQuery.data?.find((s) => s.id === subjectId);

  const { data: rawBookSuggestions } = useBookSuggestions(subjectId);
  const bookSuggestions = rawBookSuggestions ?? [];
  const filing = useFiling();

  const handleBack = useCallback(() => {
    goBackOrReplace(router, '/(app)/library');
  }, [router]);

  // Filing overlay: show spinner + skip button after 15s (same pattern as pick-book)
  const [showSkip, setShowSkip] = useState(false);
  // Error state for filing failures — shown as an ErrorFallback overlay
  const [filingError, setFilingError] = useState<{
    message: string;
    suggestion: BookSuggestion;
  } | null>(null);

  useEffect(() => {
    if (filing.isPending) {
      const timer = setTimeout(() => setShowSkip(true), 15_000);
      return () => clearTimeout(timer);
    }
    setShowSkip(false);
    return undefined;
  }, [filing.isPending]);

  // R-1: Ref-based lock — backported from pick-book BUG-361 fix.
  // isPending resets before Alert callbacks fire, allowing double-submission.
  const filingInFlight = useRef(false);

  const handlePickBookSuggestion = async (suggestion: BookSuggestion) => {
    // BUG-323 + R-1: Double guard — isPending (React state) + ref lock
    if (filing.isPending || filingInFlight.current) return;
    filingInFlight.current = true;
    setFilingError(null);
    try {
      const result = await filing.mutateAsync({
        rawInput: suggestion.title,
        selectedSuggestion: suggestion.title,
        pickedSuggestionId: suggestion.id,
        subjectId,
      });
      // Reset the in-flight lock before navigating so a back-navigation
      // doesn't leave filingInFlight permanently true. [CR-fix-3]
      filingInFlight.current = false;
      // M-12: Pass autoStart so the book screen begins a session immediately
      router.push({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: {
          subjectId: result.shelfId,
          bookId: result.bookId,
          autoStart: 'true',
        },
      } as never);
    } catch (err) {
      filingInFlight.current = false;
      const classified = classifyApiError(err);
      setFilingError({ message: classified.message, suggestion });
    }
  };

  // Single-book auto-skip REMOVED — user testing confirmed it was
  // disorienting. The shelf screen always shows, even with one book.
  // See spec flag: "if the auto-skip feels disorienting, revert."

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
          onPress={handleBack}
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

  // Status is now server-computed and returned in the book object itself.
  // Fall back to topicsGenerated heuristic only if status is absent (old cache).
  const getBookStatus = (bookId: string): BookProgressStatus => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return 'NOT_STARTED';
    if (book.status) return book.status;
    if (!book.topicsGenerated) return 'NOT_STARTED';
    return 'IN_PROGRESS';
  };

  const suggestedBookId = (() => {
    const reviewDue = books.find((b) => getBookStatus(b.id) === 'REVIEW_DUE');
    if (reviewDue) return reviewDue.id;
    const inProgress = books.find((b) => getBookStatus(b.id) === 'IN_PROGRESS');
    if (inProgress) return inProgress.id;
    const notStarted = books.find((b) => getBookStatus(b.id) === 'NOT_STARTED');
    if (notStarted) return notStarted.id;
    return null;
  })();

  // Aggregate progress from all books on this shelf
  const totalTopics = books.reduce((sum, b) => sum + (b.topicCount ?? 0), 0);
  const completedTopics = books.reduce(
    (sum, b) => sum + (b.completedTopicCount ?? 0),
    0
  );
  const showProgress = totalTopics > 0;

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
        testID="shelf-loading"
      >
        <BookPageFlipAnimation size={140} color={themeColors.accent} />
        <Text className="text-body-sm text-text-secondary mt-3">
          Loading this shelf...
        </Text>
        <Pressable
          onPress={handleBack}
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
    const classified = classifyApiError(failedQuery?.error);
    const errorMessage =
      classified.message !== 'Something unexpected happened. Please try again.'
        ? classified.message
        : 'Unable to load this shelf. Please try again.';
    const actions = recoveryActions(classified, {
      retry: handleRetry,
      goBack: handleBack,
      goHome: () => router.replace('/(app)/home' as never),
    });

    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top }}
        testID="shelf-error"
      >
        <ErrorFallback
          variant="centered"
          title="Couldn't load this shelf"
          message={errorMessage}
          primaryAction={actions.primary}
          secondaryAction={actions.secondary}
        />
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
          onPress={handleBack}
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
          {showProgress && (
            <View className="mt-2">
              <Text
                className="text-caption text-text-secondary mb-1"
                testID="shelf-progress-label"
              >
                {completedTopics}/{totalTopics} topics
              </Text>
              <View className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                <View
                  className="h-full bg-primary rounded-full"
                  style={{
                    width: `${Math.round(
                      (completedTopics / totalTopics) * 100
                    )}%`,
                  }}
                  testID="shelf-progress-bar"
                />
              </View>
            </View>
          )}
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
              onPress={handleBack}
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

      {/* Loading overlay during filing */}
      {filing.isPending ? (
        <View
          className="absolute inset-0 bg-background/80 items-center justify-center"
          testID="shelf-filing-overlay"
        >
          <BookPageFlipAnimation size={140} color={themeColors.accent} />
          <Text className="text-body-sm text-text-secondary mt-3">
            Organizing your library...
          </Text>
          {showSkip && (
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: '/(app)/shelf/[subjectId]',
                  params: { subjectId },
                } as never)
              }
              className="mt-6 bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
              testID="shelf-filing-skip"
              accessibilityLabel="Skip and start learning anyway"
            >
              <Text className="text-body font-semibold text-text-primary">
                Skip — start learning anyway
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Error overlay when filing (adding a suggestion) fails */}
      {filingError ? (
        <View
          className="absolute inset-0 bg-background/90 items-center justify-center px-5"
          testID="shelf-filing-error-overlay"
        >
          <ErrorFallback
            variant="centered"
            title="Couldn't add that book"
            message={filingError.message}
            primaryAction={{
              label: 'Try Again',
              onPress: () =>
                void handlePickBookSuggestion(filingError.suggestion),
              testID: 'shelf-filing-error-retry',
            }}
            secondaryAction={{
              label: 'Go Back',
              onPress: handleBack,
              testID: 'shelf-filing-error-back',
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
