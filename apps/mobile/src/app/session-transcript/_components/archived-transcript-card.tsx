import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ArchivedTranscriptResponse } from '@eduagent/schemas';

interface Props extends Omit<ArchivedTranscriptResponse, 'archived'> {
  onContinueTopic: () => void;
}

export function ArchivedTranscriptCard({
  archivedAt,
  summary,
  onContinueTopic,
}: Props) {
  const archivedDate = new Date(archivedAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <View testID="archived-transcript-card">
        <Text className="text-h3 font-semibold text-text-primary mb-2">
          This conversation was archived on {archivedDate}.
        </Text>
        <Text className="text-body text-text-secondary mb-4">
          Here&apos;s what you covered:
        </Text>

        <Text className="text-body text-text-primary mb-4">
          {summary.narrative}
        </Text>

        <View className="flex-row flex-wrap gap-2 mb-4">
          {summary.topicsCovered.map((topic) => (
            <View
              key={topic}
              testID="archived-topic-chip"
              className="bg-surface-elevated rounded-pill px-3 py-1"
            >
              <Text className="text-caption text-text-primary">{topic}</Text>
            </View>
          ))}
        </View>

        {summary.learnerRecap ? (
          <Text className="text-body text-text-secondary italic mb-4">
            {summary.learnerRecap}
          </Text>
        ) : null}

        <Text className="text-body text-text-primary mb-6">
          {summary.reEntryRecommendation}
        </Text>

        <Pressable
          testID="archived-continue-topic-cta"
          onPress={onContinueTopic}
          accessibilityRole="button"
          accessibilityLabel="Continue this topic"
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Continue this topic
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
