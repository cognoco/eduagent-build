import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ArchivedTranscriptResponse } from '@eduagent/schemas';
import { useThemeColors } from '../../../lib/theme';

interface Props extends Omit<ArchivedTranscriptResponse, 'archived'> {
  onContinueTopic: () => void;
  onBack: () => void;
}

export function ArchivedTranscriptCard({
  archivedAt,
  summary,
  onContinueTopic,
  onBack,
}: Props) {
  const { i18n, t } = useTranslation();
  const colors = useThemeColors();
  const hasTopics = summary.topicsCovered.length > 0;
  const canContinueTopic = summary.topicId != null;
  const archivedDate = new Date(archivedAt).toLocaleDateString(i18n.language, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <View testID="archived-transcript-card">
        <Pressable
          testID="archived-transcript-back"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          className="mb-4 min-h-[44px] min-w-[44px] self-start items-center justify-center"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>

        <Text className="text-h3 font-semibold text-text-primary mb-2">
          {t('sessionTranscript.archived.title', {
            date: archivedDate,
            defaultValue: 'This conversation was archived on {{date}}.',
          })}
        </Text>

        <Text className="text-body text-text-primary mb-4">
          {summary.narrative}
        </Text>

        {hasTopics ? (
          <>
            <Text className="text-body text-text-secondary mb-3">
              {t('sessionTranscript.archived.intro', {
                defaultValue: "Here's what you covered:",
              })}
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {summary.topicsCovered.map((topic) => (
                <View
                  key={topic}
                  testID="archived-topic-chip"
                  className="bg-surface-elevated rounded-pill px-3 py-1"
                >
                  <Text className="text-caption text-text-primary">
                    {topic}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {summary.learnerRecap ? (
          <Text className="text-body text-text-secondary italic mb-4">
            {summary.learnerRecap}
          </Text>
        ) : null}

        <Text className="text-body text-text-primary mb-6">
          {summary.reEntryRecommendation}
        </Text>

        {canContinueTopic ? (
          <Pressable
            testID="archived-continue-topic-cta"
            onPress={onContinueTopic}
            accessibilityRole="button"
            accessibilityLabel={t('sessionTranscript.archived.continueCta', {
              defaultValue: 'Continue this topic',
            })}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('sessionTranscript.archived.continueCta', {
                defaultValue: 'Continue this topic',
              })}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}
