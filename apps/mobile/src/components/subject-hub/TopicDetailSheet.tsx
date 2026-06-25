import { Pressable, ScrollView, Text, View } from 'react-native';
import { BottomSheet } from '../common/BottomSheet';
import { useTranslation } from 'react-i18next';

import type { TranslateKey } from '../../i18n';
import type {
  HubTopic,
  HubTopicState,
  SubjectHubNote,
} from './_view-models/subject-hub-state';

interface TopicDetailSheetProps {
  topic: HubTopic | null;
  notes: SubjectHubNote[];
  canStudy: boolean;
  onClose: () => void;
  onStudyTopic?: (topicId: string) => void;
  onReviewTopic?: (topicId: string) => void;
  onSeeFullTopic?: (topicId: string) => void;
}

const STATE_KEY: Record<HubTopicState, TranslateKey> = {
  'continue-now': 'subjectHub.topic.continueNow',
  started: 'subjectHub.topic.started',
  'up-next': 'subjectHub.topic.upNext',
  later: 'subjectHub.topic.later',
  done: 'subjectHub.topic.done',
  mastered: 'subjectHub.topic.mastered',
};

export function TopicDetailSheet({
  topic,
  notes,
  canStudy,
  onClose,
  onStudyTopic,
  onReviewTopic,
  onSeeFullTopic,
}: TopicDetailSheetProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!topic) return null;

  const description = topic.topic.description.trim();
  const masteryLabel = t(STATE_KEY[topic.state]);

  return (
    <BottomSheet
      visible
      onClose={onClose}
      backdropDismissible
      backdropAccessibilityLabel={t('subjectHub.sheet.close')}
    >
      <View
        testID="subject-hub-topic-sheet"
        className="bg-background px-5 pb-8 pt-5"
      >
        <View className="mb-4 items-center">
          <View className="h-1 w-10 rounded-full bg-text-secondary/30" />
        </View>

        <ScrollView
          style={{ maxHeight: 440 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-h3 font-semibold text-text-primary">
                {topic.topic.title}
              </Text>
              <Text className="mt-3 text-caption font-semibold uppercase text-text-secondary">
                {t('subjectHub.sheet.about')}
              </Text>
            </View>
            <Pressable
              testID="subject-hub-topic-sheet-close"
              accessibilityRole="button"
              accessibilityLabel={t('subjectHub.sheet.close')}
              className="rounded-full bg-surface px-3 py-2"
              onPress={onClose}
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('subjectHub.sheet.close')}
              </Text>
            </Pressable>
          </View>

          {description.length > 0 ? (
            <Text
              testID="subject-hub-topic-description"
              className="mt-3 text-body text-text-primary"
            >
              {description}
            </Text>
          ) : null}

          <Text className="mt-4 text-body-sm text-text-secondary">
            {t('subjectHub.sheet.masteryLine', { state: masteryLabel })}
          </Text>

          {notes.length > 0 ? (
            <View className="mt-5">
              <Text className="text-caption font-semibold uppercase text-text-secondary">
                {t('subjectHub.notes.heading')}
              </Text>
              {notes.map((note) => (
                <View
                  key={note.id}
                  className="mt-2 rounded-card bg-surface p-3"
                >
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

          {canStudy ? (
            <View className="mt-5 flex-row flex-wrap gap-2">
              <Pressable
                accessibilityRole="button"
                className="rounded-full bg-primary px-4 py-2"
                onPress={() => onStudyTopic?.(topic.topic.id)}
              >
                <Text className="text-body-sm font-semibold text-text-inverse">
                  {t('subjectHub.sheet.study')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="rounded-full bg-surface px-4 py-2"
                onPress={() => onReviewTopic?.(topic.topic.id)}
              >
                <Text className="text-body-sm font-semibold text-text-primary">
                  {t('subjectHub.sheet.review')}
                </Text>
              </Pressable>
              {onSeeFullTopic ? (
                <Pressable
                  accessibilityRole="button"
                  className="rounded-full bg-surface px-4 py-2"
                  onPress={() => onSeeFullTopic(topic.topic.id)}
                >
                  <Text className="text-body-sm font-semibold text-text-primary">
                    {t('subjectHub.sheet.seeFullTopic')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
