import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RetentionSignal } from '../../components/RetentionSignal';

const TOPICS = [
  {
    name: 'Quadratic equations',
    subject: 'Math',
    retention: 'strong' as const,
    lastPracticed: '2 days ago',
    sessions: 4,
  },
  {
    name: "Newton's laws",
    subject: 'Science',
    retention: 'fading' as const,
    lastPracticed: '1 week ago',
    sessions: 3,
  },
  {
    name: 'Essay structure',
    subject: 'English',
    retention: 'strong' as const,
    lastPracticed: '3 days ago',
    sessions: 5,
  },
  {
    name: 'Electromagnetic forces',
    subject: 'Science',
    retention: 'weak' as const,
    lastPracticed: '2 weeks ago',
    sessions: 2,
  },
  {
    name: 'Fractions',
    subject: 'Math',
    retention: 'strong' as const,
    lastPracticed: '1 day ago',
    sessions: 7,
  },
  {
    name: 'World War II causes',
    subject: 'History',
    retention: 'fading' as const,
    lastPracticed: '10 days ago',
    sessions: 1,
  },
  {
    name: 'Periodic table groups',
    subject: 'Science',
    retention: 'strong' as const,
    lastPracticed: '4 days ago',
    sessions: 3,
  },
];

export default function LearningBookScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-text-primary">
          Learning Book
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1">
          {TOPICS.length} topics across{' '}
          {new Set(TOPICS.map((t) => t.subject)).size} subjects
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {TOPICS.map((topic) => (
          <View
            key={topic.name}
            className="bg-surface rounded-card px-4 py-3 mb-2"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-body font-medium text-text-primary">
                  {topic.name}
                </Text>
                <Text className="text-caption text-text-secondary mt-1">
                  {topic.subject} · {topic.lastPracticed} · {topic.sessions}{' '}
                  sessions
                </Text>
              </View>
              <RetentionSignal status={topic.retention} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
