import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  supporteeStructuralSubjectsResponseSchema,
  type ScopeDescriptor,
  type SupporteeStructuralBook,
  type SupporteeStructuralSubject,
  type SupporteeStructuralTopic,
} from '@eduagent/schemas';

import { EmptyStateCard, ErrorFallback } from '../common';
import { SubjectHubSurface } from '../learning-surface';
import {
  shouldShowSearchFilter,
  type HubChapter,
  type HubNextUp,
  type HubTopicState,
  type SubjectHubData,
} from '../subject-hub';
import { useApiQuery } from '../../hooks/use-api-query';
import { useApiClient } from '../../lib/api-client';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

interface PersonScopeStructuralSubjectsProps {
  scope: PersonScope;
}

function topicState(topic: SupporteeStructuralTopic): HubTopicState {
  switch (topic.progressState) {
    case 'mastered':
      return 'mastered';
    case 'learning':
      return 'started';
    case 'review-due':
    case 'not-started':
    default:
      return 'later';
  }
}

function topicChapter(
  book: SupporteeStructuralBook,
  topic: SupporteeStructuralTopic,
): string {
  const chapter = topic.chapter?.trim();
  return chapter ? `${book.title} / ${chapter}` : book.title;
}

function buildMaskedHubData(
  subject: SupporteeStructuralSubject,
): SubjectHubData {
  const chaptersByName = new Map<string, HubChapter['topics']>();
  const activeTopics = subject.books.flatMap((book) =>
    book.topics
      .filter((topic) => !topic.skipped)
      .map((topic) => ({ book, topic })),
  );

  for (const { book, topic } of activeTopics) {
    const chapter = topicChapter(book, topic);
    const topics = chaptersByName.get(chapter) ?? [];
    topics.push({
      topic: {
        id: topic.id,
        title: topic.title,
        description: topic.description,
        sortOrder: topic.sortOrder,
        relevance: 'core',
        estimatedMinutes: topic.estimatedMinutes,
        bookId: book.id,
        chapter,
        skipped: topic.skipped,
      },
      state: topicState(topic),
      sessionCount: 0,
    });
    chaptersByName.set(chapter, topics);
  }

  const chapters: HubChapter[] = [...chaptersByName.entries()].map(
    ([chapter, topics]) => ({
      chapter,
      topics: [...topics].sort((a, b) => a.topic.sortOrder - b.topic.sortOrder),
    }),
  );
  const dueReviewEntry = activeTopics.find(
    ({ topic }) => topic.progressState === 'review-due',
  );
  const nextUp: HubNextUp = dueReviewEntry
    ? {
        kind: 'review-due',
        topicId: dueReviewEntry.topic.id,
        bookId: dueReviewEntry.book.id,
        topicTitle: dueReviewEntry.topic.title,
      }
    : {
        kind: 'none',
        topicId: null,
        bookId: null,
        topicTitle: null,
      };

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    aggregate: {
      mastered: activeTopics.filter(
        ({ topic }) => topic.progressState === 'mastered',
      ).length,
      learning: activeTopics.filter(
        ({ topic }) => topic.progressState === 'learning',
      ).length,
      total: activeTopics.length,
      reviewsDue: activeTopics.filter(
        ({ topic }) => topic.progressState === 'review-due',
      ).length,
      weeklyMasteredDelta: 0,
      recentPracticePoints: null,
    },
    nextUp,
    chapters,
    notes: [],
    showSearchFilter: shouldShowSearchFilter(chapters),
    canStudy: false,
  };
}

export function PersonScopeStructuralSubjects({
  scope,
}: PersonScopeStructuralSubjectsProps): React.ReactElement {
  const { t } = useTranslation();
  const client = useApiClient();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    null,
  );
  const query = useApiQuery({
    queryKey: ['supportee-structural-subjects', scope.personId, scope.edgeId],
    fetch: (signal) =>
      client.scopes[':personId'].subjects.$get(
        { param: { personId: scope.personId } },
        { init: { signal } },
      ),
    select: (json: unknown) =>
      supporteeStructuralSubjectsResponseSchema.parse(json),
  });
  const subjects = query.data?.subjects ?? [];
  const selectedSubject = subjects.find(
    (subject) => subject.id === selectedSubjectId,
  );
  const selectedHubData = useMemo(
    () => (selectedSubject ? buildMaskedHubData(selectedSubject) : null),
    [selectedSubject],
  );

  if (query.isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="person-scope-structural-subjects"
      >
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (query.isError && !query.data) {
    return (
      <View
        className="flex-1 bg-background p-5"
        testID="person-scope-structural-subjects"
      >
        <ErrorFallback
          variant="card"
          title={t('supportHub.subjects.errorTitle')}
          message={t('supportHub.subjects.errorMessage')}
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => void query.refetch(),
            testID: 'person-scope-subjects-retry',
          }}
        />
      </View>
    );
  }

  if (selectedHubData) {
    return (
      <View className="flex-1 bg-background" testID="person-scope-subject-hub">
        <View className="border-b border-border px-5 py-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            className="self-start rounded-full bg-surface px-4 py-2"
            onPress={() => setSelectedSubjectId(null)}
            testID="person-scope-subject-hub-back"
          >
            <Text className="text-body-sm font-semibold text-text-primary">
              {t('common.back')}
            </Text>
          </Pressable>
          <Text className="mt-3 text-body-sm text-text-secondary">
            {t('supportHub.subjects.structuralOnly')}
          </Text>
        </View>
        <SubjectHubSurface data={selectedHubData} mode="supporter-readonly" />
      </View>
    );
  }

  return (
    <ScrollView
      testID="person-scope-structural-subjects"
      className="flex-1 bg-background"
      contentContainerClassName="px-5 py-4"
    >
      <Text className="text-h2 font-semibold text-text-primary">
        {scope.displayName}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('supportHub.subjects.structuralOnly')}
      </Text>

      <View className="mt-4 gap-3">
        {subjects.length === 0 ? (
          <EmptyStateCard
            title={t('supportHub.subjects.personEmptyTitle')}
            message={t('supportHub.subjects.personEmptyMessage')}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => void query.refetch(),
              testID: 'person-scope-subjects-empty-refresh',
            }}
            testID="person-scope-subjects-empty-state"
          />
        ) : (
          subjects.map((subject) => (
            <Pressable
              key={subject.id}
              accessibilityRole="button"
              accessibilityLabel={subject.name}
              className="rounded-card border border-border bg-surface p-4"
              onPress={() => setSelectedSubjectId(subject.id)}
              testID={`person-scope-subject-${subject.id}`}
            >
              <Text className="text-h3 font-semibold text-text-primary">
                {subject.name}
              </Text>
              <Text className="mt-1 text-body-sm text-text-secondary">
                {t('supportHub.subjects.bookCount', {
                  count: subject.books.length,
                })}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}
