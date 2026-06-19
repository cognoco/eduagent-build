import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

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
import { SubjectHubProgressSummary } from './SubjectHubProgressSummary';
import { TopicDetailSheet } from './TopicDetailSheet';

// Spec section 6.3: this hub renders only the data it is handed. Future supporter
// scopes mask the data before it reaches this component.
interface SubjectHubProps {
  data: SubjectHubData;
  onNextUpPress?: (nextUp: HubNextUp) => void;
  onStudyTopic?: (topicId: string) => void;
  onReviewTopic?: (topicId: string) => void;
  onSearchVoice?: (request: SubjectHubVoiceRequest) => void;
}

export function SubjectHub({
  data,
  onNextUpPress,
  onStudyTopic,
  onReviewTopic,
  onSearchVoice,
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
  const showNotes = data.canStudy && data.notes.length > 0;

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
          <View className="mt-5 rounded-card bg-surface p-4">
            <Text className="text-caption font-semibold uppercase text-text-secondary">
              {t('subjectHub.notes.heading')}
            </Text>
            {data.notes.map((note) => (
              <View key={note.id} className="mt-3 border-t border-border pt-3">
                <Text className="text-caption font-semibold text-text-secondary">
                  {note.authorLabel}
                </Text>
                <Text className="mt-1 text-body-sm text-text-primary">
                  {note.content}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <TopicDetailSheet
        topic={selectedTopic}
        notes={selectedTopicNotes}
        canStudy={data.canStudy}
        onClose={() => setOpenTopicId(null)}
        onStudyTopic={onStudyTopic}
        onReviewTopic={onReviewTopic}
      />
    </>
  );
}
