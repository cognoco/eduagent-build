import { ScrollView, Text, View, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const router = useRouter();
  const cefrEntries = sortCefrEntries(
    Object.entries(subject.vocabulary.byCefrLevel),
  );

  return (
    <Pressable
      onPress={() =>
        router.push(`/(app)/vocabulary/${subject.subjectId}` as never)
      }
      accessibilityRole="button"
      accessibilityLabel={t('progress.vocabulary.viewSubjectLabel', {
        subject: subject.subjectName,
      })}
      testID={`vocab-subject-${subject.subjectId}`}
      className="bg-surface rounded-card p-4 mt-4"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-h3 font-semibold text-text-primary flex-1">
          {subject.subjectName}
        </Text>
        <Text className="text-body-sm text-primary font-semibold">
          {t('progress.vocabulary.viewAllLink')}
        </Text>
      </View>
      <Text className="text-body-sm text-text-secondary mt-1">
        {t('progress.vocabulary.wordsSummary', {
          total: subject.vocabulary.total,
          mastered: subject.vocabulary.mastered,
        })}
        {subject.vocabulary.learning > 0
          ? t('progress.vocabulary.learningAppend', {
              count: subject.vocabulary.learning,
            })
          : ''}
      </Text>
      {cefrEntries.length > 0 ? (
        <View className="mt-3 gap-2">
          {cefrEntries.map(([level, count]) => (
            <View key={level} className="flex-row items-center justify-between">
              <Text className="text-body-sm text-text-primary">{level}</Text>
              <Text className="text-body-sm text-text-secondary">
                {t('progress.subject.wordCount', { count })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
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
  const { t } = useTranslation();
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
      ? t('progress.vocabulary.emptyMessageOne', {
          subject: existingLanguageSubjects[0],
        })
      : existingLanguageSubjects.length > 1
        ? t('progress.vocabulary.emptyMessageMany')
        : t('progress.vocabulary.emptyMessageNone');

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/progress' as const)}
          className="me-3 py-2 pe-2"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="vocab-browser-back"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {t('progress.vocabulary.pageTitle')}
          </Text>
          {!isLoading && !isError && totalVocab > 0 ? (
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {t('progress.vocabulary.totalWords', { count: totalVocab })}
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
        ) : isError && !inventory ? (
          <View testID="vocab-browser-error">
            <ErrorFallback
              title={t('progress.vocabulary.errorTitle')}
              message={t('progress.vocabulary.errorMessage')}
              primaryAction={{
                label: t('common.tryAgain'),
                onPress: () => void refetch(),
                testID: 'vocab-browser-retry',
              }}
              secondaryAction={{
                label: t('common.goBack'),
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
              {t('progress.vocabulary.noLanguageMessage')}
            </Text>
            <Pressable
              onPress={() => router.replace('/(app)/progress' as never)}
              className="mt-4 rounded-lg bg-primary px-6 py-3"
              accessibilityRole="button"
              accessibilityLabel={t('common.goBack')}
              testID="vocab-browser-no-language-back"
            >
              <Text className="text-text-inverse font-medium">
                {t('common.goBack')}
              </Text>
            </Pressable>
          </View>
        ) : isEmpty && newLearner ? (
          <View
            className="bg-surface rounded-card p-5 mt-4 items-center"
            testID="vocab-browser-new-learner"
          >
            <Text className="text-h3 font-semibold text-text-primary text-center">
              {t('progress.vocabulary.newLearnerTitle')}
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              {t('progress.vocabulary.newLearnerSubtitle')}
            </Text>
            <Pressable
              onPress={() => router.replace('/(app)/progress' as never)}
              className="bg-background rounded-button px-5 py-3 mt-4"
              accessibilityRole="button"
              accessibilityLabel={t('common.goBack')}
              testID="vocab-browser-new-learner-back"
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('common.goBack')}
              </Text>
            </Pressable>
          </View>
        ) : isEmpty ? (
          <View
            className="bg-surface rounded-card p-5 mt-4 items-center"
            testID="vocab-browser-empty"
          >
            <Text className="text-h3 font-semibold text-text-primary text-center">
              {t('progress.vocabulary.emptyTitle')}
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              {emptyMessage}
            </Text>
            <Pressable
              onPress={() => router.replace('/(app)/progress' as never)}
              className="bg-background rounded-button px-5 py-3 mt-4"
              accessibilityRole="button"
              accessibilityLabel={t('progress.vocabulary.emptyBackLabel')}
              testID="vocab-browser-empty-back"
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('common.goBack')}
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
