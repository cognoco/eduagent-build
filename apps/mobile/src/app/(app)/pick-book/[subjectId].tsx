import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BookSuggestion } from '@eduagent/schemas';
import { useBookSuggestions } from '../../../hooks/use-book-suggestions';
import { useFiling } from '../../../hooks/use-filing';
import { useSubjects } from '../../../hooks/use-subjects';
import { SuggestionCard } from '../../../components/library/SuggestionCard';
import { useThemeColors } from '../../../lib/theme';
import { formatApiError } from '../../../lib/format-api-error';
import { goBackOrReplace } from '../../../lib/navigation';
import {
  BookPageFlipAnimation,
  MagicPenAnimation,
} from '../../../components/common';
import { platformAlert } from '../../../lib/platform-alert';

// [BUG-539] Cycling messages mirror the quiz/launch.tsx pattern so users
// see visual activity during the Neon + Worker cold-start window.
const LOADING_MESSAGES = [
  'Finding what to explore...',
  'Building your options...',
  'Almost there...',
];

export default function PickBookScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();

  const suggestionsQuery = useBookSuggestions(subjectId);
  const { data: subjects } = useSubjects();
  const filing = useFiling();

  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const [showSkip, setShowSkip] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [loadingSlow, setLoadingSlow] = useState(false);

  // BUG-361: Synchronous mutex — filing.isPending has React batching delay,
  // so an alert "Try again" callback and a "Go" button tap in the same frame
  // can both pass the isPending guard. The ref is checked and set atomically.
  const filingInFlight = useRef(false);

  const handleBack = useCallback(() => {
    if (subjectId) {
      goBackOrReplace(router, {
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId },
      } as never);
      return;
    }

    goBackOrReplace(router, '/(app)/library');
  }, [router, subjectId]);

  // M12: Filing overlay timeout — show skip button after 8 seconds (was 15)
  useEffect(() => {
    if (filing.isPending) {
      const timer = setTimeout(() => setShowSkip(true), 8_000);
      return () => clearTimeout(timer);
    }
    setShowSkip(false);
    return undefined;
  }, [filing.isPending]);

  // [BUG-539] Cycle loading messages every 1.5s while suggestions are loading
  useEffect(() => {
    if (!suggestionsQuery.isLoading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [suggestionsQuery.isLoading]);

  // [BUG-539] Show "taking longer" hint after 8s of loading
  useEffect(() => {
    if (!suggestionsQuery.isLoading) {
      setLoadingSlow(false);
      return;
    }
    const timer = setTimeout(() => setLoadingSlow(true), 8_000);
    return () => clearTimeout(timer);
  }, [suggestionsQuery.isLoading]);

  const suggestions = suggestionsQuery.data ?? [];
  const subject = subjects?.find((s) => s.id === subjectId);

  // BUG-318: Auto-open custom input when suggestions load empty — the user
  // shouldn't have to find and tap "Something else..." when there's nothing to pick.
  useEffect(() => {
    if (
      !suggestionsQuery.isLoading &&
      !suggestionsQuery.isError &&
      suggestions.length === 0
    ) {
      setShowCustomInput(true);
    }
  }, [
    suggestionsQuery.isLoading,
    suggestionsQuery.isError,
    suggestions.length,
  ]);

  const handlePickSuggestion = async (suggestion: BookSuggestion) => {
    // BUG-323 + BUG-361: Double guard — isPending (React state) + ref lock
    // (synchronous). The ref closes the window between mutation error and
    // the next render where both Alert retry and the Go button can fire.
    if (filing.isPending || filingInFlight.current) return;
    filingInFlight.current = true;
    try {
      const result = await filing.mutateAsync({
        rawInput: suggestion.title,
        selectedSuggestion: suggestion.title,
        pickedSuggestionId: suggestion.id,
        subjectId,
      });
      filingInFlight.current = false;
      router.push({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: {
          subjectId: result.shelfId,
          bookId: result.bookId,
        },
      } as never);
    } catch {
      filingInFlight.current = false;
      platformAlert(
        'Something went wrong',
        "Couldn't set up that book. Try again?",
        [
          {
            text: 'Try again',
            onPress: () => void handlePickSuggestion(suggestion),
          },
          { text: 'Go back', onPress: handleBack },
        ]
      );
    }
  };

  const MIN_TOPIC_INPUT_LENGTH = 3;

  const handleCustomSubmit = async () => {
    const trimmed = customText.trim();
    // BUG-323 + BUG-361: Double guard — isPending + ref lock
    // BUG-490: Require at least 3 characters to prevent stub book titles
    if (
      trimmed.length < MIN_TOPIC_INPUT_LENGTH ||
      filing.isPending ||
      filingInFlight.current
    )
      return;
    filingInFlight.current = true;
    try {
      // M-10: Include subject name as context so the filing LLM places
      // the custom topic within the correct shelf/subject.
      const result = await filing.mutateAsync({
        rawInput: trimmed,
        selectedSuggestion: subject?.name ?? null,
        subjectId,
      });
      filingInFlight.current = false;
      router.push({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: {
          subjectId: result.shelfId,
          bookId: result.bookId,
        },
      } as never);
    } catch (err) {
      filingInFlight.current = false;
      platformAlert('Something went wrong', formatApiError(err), [
        { text: 'Try again', onPress: () => void handleCustomSubmit() },
        { text: 'Go back', onPress: handleBack },
      ]);
    }
  };

  // Guard: param must exist
  if (!subjectId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
        testID="pick-book-missing-param"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          Missing subject. Please go back and try again.
        </Text>
        <Pressable
          onPress={handleBack}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          testID="pick-book-missing-param-back"
        >
          <Text className="text-text-primary text-body font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  // [BUG-539] Loading state with cycling messages and slow-loading hint
  if (suggestionsQuery.isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top }}
        testID="pick-book-loading"
      >
        <MagicPenAnimation size={100} color={colors.accent} />
        <Text className="text-body text-text-secondary mt-4">
          {LOADING_MESSAGES[loadingMessageIndex]}
        </Text>
        {loadingSlow ? (
          <Text
            className="text-body-sm text-text-secondary text-center mt-2"
            testID="pick-book-loading-slow"
          >
            This is taking a bit longer than usual...
          </Text>
        ) : null}
        <Pressable
          onPress={handleBack}
          className="mt-10 px-5 py-3 min-h-[44px] items-center justify-center"
          accessibilityLabel="Go back"
          testID="pick-book-loading-back"
        >
          <Text className="text-body font-semibold text-primary">Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Error state
  if (suggestionsQuery.isError) {
    const errorMessage =
      suggestionsQuery.error instanceof Error
        ? formatApiError(suggestionsQuery.error)
        : 'Unable to load suggestions.';

    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
        testID="pick-book-error"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          {errorMessage}
        </Text>
        <Pressable
          onPress={() => void suggestionsQuery.refetch()}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
          testID="pick-book-retry-button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Retry
          </Text>
        </Pressable>
        <Pressable
          onPress={handleBack}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          testID="pick-book-back-button"
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
      testID="pick-book-screen"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="flex-row items-center mb-2">
          <Pressable
            onPress={handleBack}
            className="p-2 -ms-2 me-2"
            accessibilityLabel="Back"
            testID="pick-book-back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.accent} />
          </Pressable>
          <Text
            className="text-h1 font-bold text-text-primary flex-1"
            numberOfLines={1}
          >
            {subject?.name ?? 'Subject'}
          </Text>
        </View>

        <Text className="text-body text-text-secondary mb-6">
          Pick what interests you
        </Text>

        {/* Suggestion grid */}
        <View className="flex-row flex-wrap gap-3 mb-6">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              title={suggestion.title}
              emoji={suggestion.emoji}
              description={suggestion.description}
              onPress={() => void handlePickSuggestion(suggestion)}
              testID={`pick-book-suggestion-${suggestion.id}`}
            />
          ))}
        </View>

        {/* Empty state for suggestions */}
        {suggestions.length === 0 && (
          <View
            className="bg-surface rounded-card px-4 py-6 items-center mb-6"
            testID="pick-book-empty"
          >
            <Text className="text-body text-text-secondary text-center">
              No suggestions yet. Type what you want to learn below.
            </Text>
          </View>
        )}

        {/* Something else... */}
        {showCustomInput ? (
          <View className="mb-6" testID="pick-book-custom-section">
            <TextInput
              className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-3 border border-border"
              placeholder="What do you want to learn about?"
              placeholderTextColor={colors.muted}
              value={customText}
              onChangeText={setCustomText}
              onSubmitEditing={() => void handleCustomSubmit()}
              autoFocus
              returnKeyType="go"
              testID="pick-book-custom-input"
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => void handleCustomSubmit()}
                disabled={
                  customText.trim().length < MIN_TOPIC_INPUT_LENGTH ||
                  filing.isPending
                }
                className="flex-1 bg-primary rounded-button py-3 items-center min-h-[48px] justify-center"
                style={{
                  opacity:
                    customText.trim().length >= MIN_TOPIC_INPUT_LENGTH &&
                    !filing.isPending
                      ? 1
                      : 0.5,
                }}
                testID="pick-book-custom-submit"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  {filing.isPending ? 'Setting up...' : 'Go'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowCustomInput(false);
                  setCustomText('');
                }}
                className="px-4 py-3 min-h-[48px] justify-center"
                testID="pick-book-custom-cancel"
              >
                <Text className="text-body text-text-secondary">Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowCustomInput(true)}
            className="border border-dashed border-border rounded-card px-4 py-4 items-center mb-6"
            testID="pick-book-something-else"
            accessibilityRole="button"
            accessibilityLabel="Something else"
          >
            <Text className="text-body text-text-secondary">
              Something else...
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Loading overlay during filing */}
      {filing.isPending ? (
        <View
          className="absolute inset-0 bg-background/80 items-center justify-center"
          testID="pick-book-filing-overlay"
        >
          <BookPageFlipAnimation size={80} color={colors.accent} />
          <Text className="text-body-sm text-text-secondary mt-3">
            Organizing your library...
          </Text>
          {showSkip && (
            <Pressable
              onPress={() =>
                // BUG-319: Navigate to shelf instead of router.back() which
                // would return to create-subject. The subject already exists.
                router.replace({
                  pathname: '/(app)/shelf/[subjectId]',
                  params: { subjectId },
                } as never)
              }
              className="mt-6 bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
              testID="pick-book-filing-skip"
              accessibilityLabel="Skip and start learning anyway"
            >
              <Text className="text-body font-semibold text-text-primary">
                Skip — start learning anyway
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}
