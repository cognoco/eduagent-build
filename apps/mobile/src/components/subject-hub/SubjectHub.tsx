import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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
import { SubjectHubNotesSection } from './SubjectHubNotesSection';
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
  onEmptySubjectPress?: () => void;
}

export function SubjectHub({
  data,
  onNextUpPress,
  onStudyTopic,
  onReviewTopic,
  onSearchVoice,
  onEmptySubjectPress,
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
  const hasChapters = data.chapters.length > 0;

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
        ) : hasChapters ? (
          <Text className="mt-5 text-center text-body-sm text-text-secondary">
            {t('subjectHub.search.noResults')}
          </Text>
        ) : (
          <View
            testID="subject-hub-empty"
            className="mt-5 items-center rounded-card border border-border bg-surface p-5"
          >
            <Text className="text-center text-body font-semibold text-text-primary">
              {t('subjectHub.empty.heading')}
            </Text>
            <Text className="mt-2 text-center text-body-sm text-text-secondary">
              {t('subjectHub.empty.body')}
            </Text>
            {data.canStudy && onEmptySubjectPress ? (
              <Pressable
                testID="subject-hub-empty-action"
                accessibilityRole="button"
                accessibilityLabel={t('subjectHub.empty.action')}
                className="mt-4 rounded-full bg-primary px-4 py-2"
                onPress={onEmptySubjectPress}
              >
                <Text className="text-body-sm font-semibold text-text-inverse">
                  {t('subjectHub.empty.action')}
                </Text>
              </Pressable>
            ) : null}
          </View>
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
      />
    </>
  );
}
