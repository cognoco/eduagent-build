import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
import { useThemeColors } from '../../../../lib/theme';

export default function ShelfScreen() {
  const { t } = useTranslation();
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
    router.replace('/(app)/library' as never);
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
  // [BUG-692] Tracks whether the user pressed Skip during a filing round-trip.
  // TanStack Query does not abort in-flight mutations on navigation, so the
  // resolved onSuccess push would otherwise yank the user back into the book
  // they just skipped.
  const filingSkipped = useRef(false);

  const handlePickBookSuggestion = async (suggestion: BookSuggestion) => {
    // BUG-323 + R-1: Double guard — isPending (React state) + ref lock
    if (filing.isPending || filingInFlight.current) return;
    filingInFlight.current = true;
    filingSkipped.current = false;
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
      // [BUG-692] If the user pressed Skip during the network round-trip,
      // they have already navigated away — do not push them into the book.
      if (filingSkipped.current) return;
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
          {t('library.shelf.missingParam')}
        </Text>
        <Pressable
          onPress={handleBack}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          testID="shelf-missing-param-back"
        >
          <Text className="text-text-primary text-body font-semibold">
            {t('common.back')}
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
  const chooseBookButtonLabel =
    bookSuggestions.length > 2
      ? t('library.shelf.browseAll')
      : books.length > 0
      ? t('library.shelf.chooseAnotherBook')
      : t('library.shelf.chooseBook');

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
        testID="shelf-loading"
      >
        <BookPageFlipAnimation size={140} color={themeColors.accent} />
        <Text className="text-body-sm text-text-secondary mt-3">
          {t('library.shelf.loading')}
        </Text>
        <Pressable
          onPress={handleBack}
          className="mt-6 px-5 py-3"
          accessibilityLabel={t('common.back')}
          testID="shelf-loading-back"
        >
          <Text className="text-body text-primary font-semibold">
            {t('common.back')}
          </Text>
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
          title={t('library.shelf.errorTitle')}
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
          accessibilityLabel={t('common.back')}
          testID="shelf-back"
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.accent} />
        </Pressable>

        <View className="flex-1">
          <Text
            className="text-h1 font-bold text-text-primary"
            numberOfLines={1}
          >
            {subject?.name ?? t('library.shelf.fallbackTitle')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('library.shelf.bookCount', { count: books.length })}
          </Text>
          {showProgress && (
            <View className="mt-2">
              <Text
                className="text-caption text-text-secondary mb-1"
                testID="shelf-progress-label"
              >
                {t('library.shelf.topicProgress', {
                  completed: completedTopics,
                  total: totalTopics,
                })}
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
          accessibilityLabel={t('library.shelf.settingsAccessibilityLabel')}
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
            {t('library.shelf.studyNext')}
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

      <Pressable
        onPress={() =>
          router.push({
            pathname: '/(app)/pick-book/[subjectId]',
            params: { subjectId },
          } as never)
        }
        className="mx-4 mb-4 border border-dashed border-border rounded-xl py-3 items-center justify-center flex-row gap-2"
        testID="shelf-choose-book"
        accessibilityRole="button"
        accessibilityLabel={chooseBookButtonLabel}
      >
        <Ionicons
          name={
            bookSuggestions.length > 2 ? 'albums-outline' : 'add-circle-outline'
          }
          size={18}
          color={themeColors.textSecondary}
        />
        <Text className="text-text-muted">{chooseBookButtonLabel}</Text>
      </Pressable>

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
          // [BUG-868] When there are no books yet but suggestions render
          // above, "Check back soon" wrongly told the user to wait passively
          // — the curriculum is already there to pick from. Show a Pick-a-
          // book prompt in that case; only show the "still being built"
          // copy when there's truly nothing to act on.
          bookSuggestions.length > 0 ? (
            <View
              className="bg-surface rounded-card px-4 py-6 items-center"
              testID="shelf-empty-pick-suggestion"
            >
              <Text className="text-body font-semibold text-text-primary text-center mb-2">
                {t('library.shelf.emptyPickTitle')}
              </Text>
              <Text className="text-body-sm text-text-secondary text-center">
                {t('library.shelf.emptyPickMessage')}
              </Text>
            </View>
          ) : (
            <View
              className="bg-surface rounded-card px-4 py-8 items-center"
              testID="shelf-empty"
            >
              <Text className="text-body font-semibold text-text-primary text-center mb-2">
                {t('library.shelf.emptyTitle')}
              </Text>
              <Text className="text-body-sm text-text-secondary text-center mb-5">
                {t('library.shelf.emptyMessage')}
              </Text>
              <Pressable
                onPress={handleRetry}
                className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3 w-full"
                testID="shelf-empty-retry"
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
              >
                <Text className="text-text-inverse text-body font-semibold">
                  {t('common.retry')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleBack}
                className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center w-full"
                testID="shelf-empty-back"
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
              >
                <Text className="text-text-primary text-body font-semibold">
                  {t('common.back')}
                </Text>
              </Pressable>
            </View>
          )
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
            {t('library.shelf.organizing')}
          </Text>
          {showSkip && (
            <Pressable
              onPress={() => {
                // [BUG-692] Mark the in-flight filing as skipped so the
                // resolved onSuccess push won't navigate the user away from
                // the shelf they just chose to stay on.
                filingSkipped.current = true;
                router.replace({
                  pathname: '/(app)/shelf/[subjectId]',
                  params: { subjectId },
                } as never);
              }}
              className="mt-6 bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
              testID="shelf-filing-skip"
              accessibilityLabel={t('library.shelf.skipAccessibilityLabel')}
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('library.shelf.skip')}
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
            title={t('library.shelf.filingErrorTitle')}
            message={filingError.message}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () =>
                void handlePickBookSuggestion(filingError.suggestion),
              testID: 'shelf-filing-error-retry',
            }}
            secondaryAction={{
              label: t('common.goBack'),
              onPress: handleBack,
              testID: 'shelf-filing-error-back',
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
