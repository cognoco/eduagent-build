import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBookSuggestions } from '../../../hooks/use-book-suggestions';
import { useFiling } from '../../../hooks/use-filing';
import { useSubjects } from '../../../hooks/use-subjects';
import { SuggestionCard } from '../../../components/library/SuggestionCard';
import { useThemeColors } from '../../../lib/theme';
import { formatApiError } from '../../../lib/format-api-error';

interface BookSuggestion {
  id: string;
  title: string;
  emoji?: string | null;
  description?: string | null;
}

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

  const suggestions = (suggestionsQuery.data ?? []) as BookSuggestion[];
  const subject = subjects?.find((s) => s.id === subjectId);

  const handlePickSuggestion = async (suggestion: BookSuggestion) => {
    try {
      const result = await filing.mutateAsync({
        rawInput: suggestion.title,
        selectedSuggestion: suggestion.title,
        pickedSuggestionId: suggestion.id,
      });
      router.push({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: {
          subjectId: result.shelfId,
          bookId: result.bookId,
        },
      } as never);
    } catch {
      Alert.alert(
        'Something went wrong',
        "Couldn't set up that book. Try again?",
        [
          {
            text: 'Try again',
            onPress: () => void handlePickSuggestion(suggestion),
          },
          { text: 'Go back', onPress: () => router.back() },
        ]
      );
    }
  };

  const handleCustomSubmit = async () => {
    const trimmed = customText.trim();
    if (!trimmed) return;
    try {
      const result = await filing.mutateAsync({
        rawInput: trimmed,
      });
      router.push({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: {
          subjectId: result.shelfId,
          bookId: result.bookId,
        },
      } as never);
    } catch {
      Alert.alert(
        'Something went wrong',
        "Couldn't set up that topic. Try again?",
        [{ text: 'OK' }]
      );
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
          onPress={() => router.back()}
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

  // Loading state
  if (suggestionsQuery.isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
        testID="pick-book-loading"
      >
        <ActivityIndicator size="large" color={colors.accent} />
        <Text className="text-body-sm text-text-secondary mt-3">
          Loading suggestions...
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 px-5 py-3"
          accessibilityLabel="Go back"
          testID="pick-book-loading-back"
        >
          <Text className="text-body text-primary font-semibold">Go back</Text>
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
          onPress={() => router.back()}
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
            onPress={() => router.back()}
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
                disabled={!customText.trim() || filing.isPending}
                className="flex-1 bg-primary rounded-button py-3 items-center min-h-[48px] justify-center"
                style={{ opacity: customText.trim() ? 1 : 0.5 }}
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
          <ActivityIndicator size="large" color={colors.accent} />
          <Text className="text-body-sm text-text-secondary mt-3">
            Organizing your library...
          </Text>
        </View>
      ) : null}
    </View>
  );
}
