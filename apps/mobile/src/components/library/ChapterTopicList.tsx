import { Pressable, Text, View } from 'react-native';
import type { CurriculumTopic } from '@eduagent/schemas';

interface ChapterTopicListProps {
  topics: CurriculumTopic[];
  onTopicPress: (topicId: string, topicName: string) => void;
  suggestedNextId?: string;
}

function groupTopicsByChapter(
  topics: CurriculumTopic[]
): Array<{ title: string; topics: CurriculumTopic[] }> {
  const groups = new Map<string, CurriculumTopic[]>();

  for (const topic of topics) {
    const chapter = topic.chapter?.trim() || 'Topics';
    const existing = groups.get(chapter) ?? [];
    existing.push(topic);
    groups.set(chapter, existing);
  }

  return [...groups.entries()].map(([title, groupTopics]) => ({
    title,
    topics: [...groupTopics].sort(
      (left, right) => left.sortOrder - right.sortOrder
    ),
  }));
}

export function ChapterTopicList({
  topics,
  onTopicPress,
  suggestedNextId,
}: ChapterTopicListProps): React.ReactElement {
  const chapters = groupTopicsByChapter(topics);

  if (topics.length === 0) {
    return (
      <View className="bg-surface rounded-card px-4 py-6 items-center">
        <Text className="text-body text-text-secondary">
          This book is still waiting for its first topics.
        </Text>
      </View>
    );
  }

  return (
    <View testID="chapter-topic-list">
      {chapters.map((chapter) => (
        <View key={chapter.title} className="mb-4">
          <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wide mb-2 px-1">
            {chapter.title}
          </Text>

          <View className="bg-surface rounded-card overflow-hidden">
            {chapter.topics.map((topic) => {
              const isSuggested = topic.id === suggestedNextId;
              return (
                <Pressable
                  key={topic.id}
                  onPress={() => onTopicPress(topic.id, topic.title)}
                  className={`px-4 py-3 border-b border-border ${
                    isSuggested ? 'bg-primary/5' : ''
                  } ${topic.skipped ? 'opacity-50' : ''}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${topic.sortOrder + 1}. ${topic.title}${
                    isSuggested ? ', suggested next' : ''
                  }`}
                  testID={`chapter-topic-${topic.id}`}
                >
                  <View className="flex-row items-start">
                    <Text className="text-body-sm font-semibold text-text-secondary me-3">
                      {topic.sortOrder + 1}.
                    </Text>
                    <View className="flex-1">
                      <View className="flex-row items-start justify-between">
                        <Text className="text-body font-medium text-text-primary flex-1 me-3">
                          {topic.title}
                        </Text>
                        {isSuggested && (
                          <Text className="text-caption font-semibold text-primary">
                            Next
                          </Text>
                        )}
                      </View>
                      <Text className="text-body-sm text-text-secondary mt-1">
                        {topic.description}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
