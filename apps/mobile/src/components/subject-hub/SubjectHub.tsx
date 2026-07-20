import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SubjectInventory } from '@eduagent/schemas';

import { ErrorFallback } from '../common/ErrorFallback';
import { withOpacity } from '../../lib/color-opacity';
import { useSubjectTint } from '../../lib/theme';
import {
  applyHubFilter,
  type HubNextUp,
  type SubjectHubData,
} from './_view-models/subject-hub-state';
import {
  SubjectHubSearchFilter,
  type SubjectHubVoiceRequest,
} from './SubjectHubSearchFilter';
import { SubjectHubChapterSection } from './SubjectHubChapterSection';
import { SubjectHubNextUp } from './SubjectHubNextUp';
import { SubjectHubNotesSection } from './SubjectHubNotesSection';
import { SubjectHubProgressSummary } from './SubjectHubProgressSummary';
import { TopicDetailSheet } from './TopicDetailSheet';

// Spec section 6.3: this hub renders only the data it is handed. Future supporter
// scopes mask the data before it reaches this component.
interface SubjectHubProps {
  data: SubjectHubData;
  vocabulary?: SubjectInventory['vocabulary'];
  onOpenVocabulary?: () => void;
  isVocabularyLoading?: boolean;
  vocabularyError?: boolean;
  onRetryVocabulary?: () => void;
  onNextUpPress?: (nextUp: HubNextUp) => void;
  onStudyTopic?: (topicId: string) => void;
  onReviewTopic?: (topicId: string) => void;
  onSearchVoice?: (request: SubjectHubVoiceRequest) => void;
  // Topic-scoped note authoring (felt-knowing loop Flow 1). Threaded to the focused
  // topic's detail sheet; the subject-level notes section stays read-only.
  onAddNote?: (topicId: string, content: string) => void | Promise<void>;
  isAddingNote?: boolean;
}

export function SubjectHub({
  data,
  vocabulary,
  onOpenVocabulary,
  isVocabularyLoading = false,
  vocabularyError = false,
  onRetryVocabulary,
  onNextUpPress,
  onStudyTopic,
  onReviewTopic,
  onSearchVoice,
  onAddNote,
  isAddingNote = false,
}: SubjectHubProps): React.ReactElement {
  const { t } = useTranslation();
  const tint = useSubjectTint(data.subjectId);
  const [query, setQuery] = useState('');
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);
  const filteredChapters = useMemo(
    () => applyHubFilter(data.chapters, query),
    [data.chapters, query],
  );
  const selectedTopic = useMemo(() => {
    for (const chapter of data.chapters) {
      const match = chapter.topics.find(
        (hubTopic) => hubTopic.topic.id === openTopicId,
      );
      if (match) return match;
    }
    return null;
  }, [data.chapters, openTopicId]);
  const selectedTopicNotes = selectedTopic
    ? data.notes.filter((note) => note.topicId === selectedTopic.topic.id)
    : [];
  // Render the notes section whenever the learner can study (so the empty-state
  // add-note affordance is reachable, not a dead end — spec §5.4 / S2 T7) OR when
  // there are notes to show (a masked supporter with canStudy=false still sees
  // existing notes read-only). canStudy=false + no notes → nothing to render.
  const showNotes = data.canStudy || data.notes.length > 0;

  return (
    <>
      <ScrollView
        testID="subject-hub"
        className="flex-1 bg-background"
        contentContainerClassName="px-5 pb-10 pt-5"
      >
        <View
          className="rounded-card border p-5"
          style={{
            backgroundColor: tint.soft,
            borderColor: withOpacity(tint.solid, 0.28),
          }}
        >
          <Text className="text-h2 font-semibold text-text-primary">
            {data.subjectName}
          </Text>
          <SubjectHubProgressSummary aggregate={data.aggregate} />
        </View>

        <SubjectHubNextUp
          nextUp={data.nextUp}
          canStudy={data.canStudy}
          onPressNextUp={onNextUpPress}
        />

        {isVocabularyLoading ? (
          <View
            className="mt-5 flex-row items-center gap-3 rounded-card bg-surface p-4"
            testID="subject-hub-vocabulary-loading"
          >
            <ActivityIndicator accessibilityLabel={t('common.loading')} />
            <Text className="text-body-sm text-text-secondary">
              {t('progress.subject.loadingTitle')}
            </Text>
          </View>
        ) : vocabularyError && onRetryVocabulary ? (
          <View className="mt-5">
            <ErrorFallback
              variant="card"
              title={t('progress.vocabulary.errorTitle')}
              message={t('progress.vocabulary.errorMessage')}
              primaryAction={{
                label: t('common.tryAgain'),
                onPress: onRetryVocabulary,
                testID: 'subject-hub-vocabulary-retry',
              }}
              testID="subject-hub-vocabulary-error"
            />
          </View>
        ) : vocabulary ? (
          <View
            className="mt-5 rounded-card bg-surface p-4"
            testID="subject-hub-vocabulary"
          >
            <Text className="text-h3 font-semibold text-text-primary">
              {t('progress.subject.vocabularyTitle')}
            </Text>
            <Text className="mt-1 text-body-sm text-text-secondary">
              {t('progress.subject.wordsTracked', {
                count: vocabulary.total,
              })}
            </Text>
            <Text className="mt-1 text-body-sm text-text-secondary">
              {t('progress.subject.vocabularyBreakdown', {
                mastered: vocabulary.mastered,
                learning: vocabulary.learning,
                new: vocabulary.new,
              })}
            </Text>
            <View className="mt-4 gap-2">
              {Object.entries(vocabulary.byCefrLevel).map(([level, count]) => (
                <View
                  key={level}
                  className="flex-row items-center justify-between"
                >
                  <Text className="text-body-sm font-medium text-text-primary">
                    {level}
                  </Text>
                  <Text className="text-body-sm text-text-secondary">
                    {t('progress.subject.wordCount', { count })}
                  </Text>
                </View>
              ))}
            </View>
            {onOpenVocabulary ? (
              <Pressable
                onPress={onOpenVocabulary}
                className="mt-3 min-h-[44px] self-start justify-center py-2"
                accessibilityRole="button"
                accessibilityLabel={t('progress.subject.viewAllVocab')}
                testID="subject-hub-vocabulary-open"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  {t('progress.subject.viewAllVocabLink')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {data.showSearchFilter ? (
          <SubjectHubSearchFilter
            query={query}
            onQueryChange={setQuery}
            onVoiceSearch={onSearchVoice}
          />
        ) : null}

        {filteredChapters.length > 0 ? (
          filteredChapters.map((chapter, index) => (
            <SubjectHubChapterSection
              key={chapter.chapter}
              chapter={chapter}
              defaultExpanded={filteredChapters.length === 1 || index === 0}
              onOpenTopic={setOpenTopicId}
            />
          ))
        ) : (
          <Text className="mt-5 text-center text-body-sm text-text-secondary">
            {t('subjectHub.search.noResults')}
          </Text>
        )}

        {showNotes ? (
          <SubjectHubNotesSection notes={data.notes} canStudy={data.canStudy} />
        ) : null}
      </ScrollView>

      <TopicDetailSheet
        topic={selectedTopic}
        notes={selectedTopicNotes}
        canStudy={data.canStudy}
        onClose={() => setOpenTopicId(null)}
        onStudyTopic={onStudyTopic}
        onReviewTopic={onReviewTopic}
        onAddNote={onAddNote}
        isAddingNote={isAddingNote}
      />
    </>
  );
}
