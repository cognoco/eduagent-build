import { ScrollView, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorFallback } from '../../../components/common';
import { useProgressInventory } from '../../../hooks/use-progress';
import { goBackOrReplace } from '../../../lib/navigation';
import { isNewLearner } from '../../../lib/progressive-disclosure';
import type { SubjectInventory } from '@eduagent/schemas';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function sortCefrEntries(entries: [string, number][]): [string, number][] {
  return [...entries].sort(([a], [b]) => {
    const ai = CEFR_ORDER.indexOf(a);
    const bi = CEFR_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function SubjectVocabSection({
  subject,
}: {
  subject: SubjectInventory;
}): React.ReactElement {
  const cefrEntries = sortCefrEntries(
    Object.entries(subject.vocabulary.byCefrLevel)
  );

  return (
    <View className="bg-surface rounded-card p-4 mt-4">
      <Text className="text-h3 font-semibold text-text-primary">
        {subject.subjectName}
      </Text>
      <Text className="text-body-sm text-text-secondary mt-1">
        {subject.vocabulary.total} words — {subject.vocabulary.mastered}{' '}
        mastered
        {subject.vocabulary.learning > 0
          ? `, ${subject.vocabulary.learning} learning`
          : ''}
      </Text>
      {cefrEntries.length > 0 ? (
        <View className="mt-3 gap-2">
          {cefrEntries.map(([level, count]) => (
            <View key={level} className="flex-row items-center justify-between">
              <Text className="text-body-sm text-text-primary">{level}</Text>
              <Text className="text-body-sm text-text-secondary">
                {count} words
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SkeletonRow(): React.ReactElement {
  return (
    <View className="bg-surface rounded-card p-4 mt-4">
      <View className="bg-border rounded h-5 w-1/3 mb-2" />
      <View className="bg-border rounded h-4 w-1/2 mb-3" />
      <View className="bg-border rounded h-4 w-full mb-1" />
      <View className="bg-border rounded h-4 w-3/4" />
    </View>
  );
}

export default function VocabularyBrowserScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    data: inventory,
    isLoading,
    isError,
    refetch,
  } = useProgressInventory();

  const subjectsWithVocab =
    inventory?.subjects.filter((s) => s.vocabulary.total > 0) ?? [];
  const totalVocab = inventory?.global.vocabularyTotal ?? 0;
  const isEmpty = !isLoading && !isError && totalVocab === 0;
  const newLearner = isNewLearner(inventory?.global.totalSessions);
  // [F-013] If the user already has a language subject but zero words yet,
  // suggest practicing it by name rather than implying they need a new one.
  // `four_strands` is the language-pedagogy discriminator used across the app.
  const existingLanguageSubjects =
    inventory?.subjects
      .filter((s) => s.pedagogyMode === 'four_strands')
      .map((s) => s.subjectName) ?? [];
  const hasLanguageSubject = existingLanguageSubjects.length > 0;
  const emptyMessage =
    existingLanguageSubjects.length === 1
      ? `Practice ${existingLanguageSubjects[0]} to start building your word list.`
      : existingLanguageSubjects.length > 1
      ? 'Practice a language subject to start building your word list.'
      : 'Start a language subject and the words you learn will appear here.';

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/progress' as const)}
          className="me-3 py-2 pe-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="vocab-browser-back"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            Your Vocabulary
          </Text>
          {!isLoading && !isError && totalVocab > 0 ? (
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {totalVocab} words across all subjects
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      >
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : isError ? (
          <View testID="vocab-browser-error">
            <ErrorFallback
              title="We couldn't load your vocabulary"
              message="Check your connection and try again."
              primaryAction={{
                label: 'Try again',
                onPress: () => void refetch(),
                testID: 'vocab-browser-retry',
              }}
              secondaryAction={{
                label: 'Go back',
                onPress: () =>
                  goBackOrReplace(router, '/(app)/progress' as const),
                testID: 'vocab-browser-go-back',
              }}
              testID="vocab-browser-error-fallback"
            />
          </View>
        ) : !isLoading && !isError && !hasLanguageSubject ? (
          <View
            className="flex-1 items-center justify-center px-6"
            testID="vocab-browser-no-language"
          >
            <Text className="text-text-secondary text-center text-base">
              Vocabulary tracking is available for language subjects.
            </Text>
            <Pressable
              onPress={() =>
                goBackOrReplace(router, '/(app)/progress' as const)
              }
              className="mt-4 rounded-lg bg-primary px-6 py-3"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="vocab-browser-no-language-back"
            >
              <Text className="text-text-inverse font-medium">Go Back</Text>
            </Pressable>
          </View>
        ) : isEmpty && newLearner ? (
          <View
            className="bg-surface rounded-card p-5 mt-4 items-center"
            testID="vocab-browser-new-learner"
          >
            <Text className="text-h3 font-semibold text-text-primary text-center">
              Your vocabulary will grow here
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              Keep learning and the words you discover will appear here.
            </Text>
            <Pressable
              onPress={() =>
                goBackOrReplace(router, '/(app)/progress' as const)
              }
              className="bg-background rounded-button px-5 py-3 mt-4"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="vocab-browser-new-learner-back"
            >
              <Text className="text-body font-semibold text-text-primary">
                Go back
              </Text>
            </Pressable>
          </View>
        ) : isEmpty ? (
          <View
            className="bg-surface rounded-card p-5 mt-4 items-center"
            testID="vocab-browser-empty"
          >
            <Text className="text-h3 font-semibold text-text-primary text-center">
              No vocabulary yet
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              {emptyMessage}
            </Text>
            <Pressable
              onPress={() =>
                goBackOrReplace(router, '/(app)/progress' as const)
              }
              className="bg-background rounded-button px-5 py-3 mt-4"
              accessibilityRole="button"
              accessibilityLabel="Go back to Journey"
              testID="vocab-browser-empty-back"
            >
              <Text className="text-body font-semibold text-text-primary">
                Go back
              </Text>
            </Pressable>
          </View>
        ) : (
          subjectsWithVocab.map((subject) => (
            <SubjectVocabSection key={subject.subjectId} subject={subject} />
          ))
        )}
      </ScrollView>
    </View>
  );
}
