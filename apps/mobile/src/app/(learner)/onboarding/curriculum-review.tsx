import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../lib/theme';
import {
  useCurriculum,
  useSkipTopic,
  useChallengeCurriculum,
} from '../../../hooks/use-curriculum';

const RELEVANCE_BG: Record<string, string> = {
  core: 'bg-primary/20',
  recommended: 'bg-accent/20',
  contemporary: 'bg-warning/20',
  emerging: 'bg-success/20',
};

const RELEVANCE_TEXT: Record<string, string> = {
  core: 'text-primary',
  recommended: 'text-accent',
  contemporary: 'text-warning',
  emerging: 'text-success',
};

export default function CurriculumScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data: curriculum, isLoading } = useCurriculum(subjectId ?? '');
  const skipTopic = useSkipTopic(subjectId ?? '');
  const challengeCurriculum = useChallengeCurriculum(subjectId ?? '');
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [challengeFeedback, setChallengeFeedback] = useState('');

  if (!subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-text-secondary">No subject selected</Text>
      </View>
    );
  }

  const handleChallenge = async () => {
    if (!challengeFeedback.trim()) return;
    try {
      await challengeCurriculum.mutateAsync(challengeFeedback.trim());
      setChallengeFeedback('');
      setShowChallengeModal(false);
    } catch {
      Alert.alert(
        'Something went wrong',
        'We couldn\u2019t regenerate your curriculum. Please try again.'
      );
    }
  };

  const firstAvailableTopic = curriculum?.topics.find((t) => !t.skipped);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          testID="curriculum-back"
        >
          <Text className="text-primary text-h3">&larr;</Text>
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          Your Curriculum
        </Text>
        <Pressable
          onPress={() => setShowChallengeModal(true)}
          className="bg-surface-elevated rounded-button px-3 py-1.5 min-h-[44px] items-center justify-center"
          testID="challenge-button"
        >
          <Text className="text-body-sm text-primary font-semibold">
            Challenge
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" testID="curriculum-loading" />
          <Text className="text-text-secondary mt-2">
            Loading curriculum...
          </Text>
        </View>
      ) : !curriculum ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text
            className="text-h3 font-semibold text-text-primary text-center mb-2"
            testID="curriculum-empty"
          >
            No curriculum yet
          </Text>
          <Text className="text-body text-text-secondary text-center">
            Complete the assessment interview to generate your learning path.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <Text className="text-body-sm text-text-secondary mb-4">
            Version {curriculum.version} — {curriculum.topics.length} topics
          </Text>

          {curriculum.topics.map((topic) => (
            <View
              key={topic.id}
              className={`bg-surface rounded-card px-4 py-3 mb-3 ${
                topic.skipped ? 'opacity-50' : ''
              }`}
              testID={`topic-${topic.id}`}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-body font-semibold text-text-primary">
                    {topic.sortOrder + 1}. {topic.title}
                  </Text>
                  <Text className="text-body-sm text-text-secondary mt-1">
                    {topic.description}
                  </Text>
                  <View className="flex-row mt-2 items-center">
                    <View
                      className={`rounded-full px-2 py-0.5 mr-2 ${
                        RELEVANCE_BG[topic.relevance] ?? 'bg-surface-elevated'
                      }`}
                    >
                      <Text
                        className={`text-caption ${
                          RELEVANCE_TEXT[topic.relevance] ??
                          'text-text-secondary'
                        }`}
                      >
                        {topic.relevance}
                      </Text>
                    </View>
                    <Text className="text-caption text-text-secondary">
                      ~{topic.estimatedMinutes} min
                    </Text>
                  </View>
                </View>
                {!topic.skipped && (
                  <Pressable
                    onPress={() => skipTopic.mutate(topic.id)}
                    className="bg-surface-elevated rounded-button px-3 py-1 min-h-[44px] min-w-[44px] items-center justify-center"
                    testID={`skip-${topic.id}`}
                  >
                    <Text className="text-caption text-text-secondary">
                      Skip
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Start learning button */}
      {firstAvailableTopic && (
        <View
          className="px-5 pb-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(learner)/session',
                params: {
                  mode: 'learning',
                  subjectId,
                  topicId: firstAvailableTopic.id,
                },
              })
            }
            className="bg-primary rounded-button py-3.5 items-center"
            testID="start-learning-button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Start learning: {firstAvailableTopic.title}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Challenge modal */}
      <Modal visible={showChallengeModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View
            className="bg-background rounded-t-3xl px-5 pt-6 pb-8"
            style={{ paddingBottom: Math.max(insets.bottom, 24) }}
          >
            <Text className="text-h3 font-bold text-text-primary mb-3">
              Challenge your curriculum
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              Tell us what you'd change and we'll regenerate your learning path.
            </Text>
            <TextInput
              className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
              placeholder="e.g. I already know the basics, skip intro topics..."
              placeholderTextColor={colors.muted}
              value={challengeFeedback}
              onChangeText={setChallengeFeedback}
              multiline
              maxLength={2000}
              testID="challenge-feedback"
            />
            <View className="flex-row">
              <Pressable
                onPress={() => setShowChallengeModal(false)}
                className="flex-1 rounded-button py-3 items-center bg-surface mr-2"
                testID="challenge-cancel"
              >
                <Text className="text-body text-text-primary">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleChallenge}
                disabled={
                  !challengeFeedback.trim() || challengeCurriculum.isPending
                }
                className={`flex-1 rounded-button py-3 items-center ${
                  challengeFeedback.trim()
                    ? 'bg-primary'
                    : 'bg-surface-elevated'
                }`}
                testID="challenge-submit"
              >
                {challengeCurriculum.isPending ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text
                    className={`text-body font-semibold ${
                      challengeFeedback.trim()
                        ? 'text-text-inverse'
                        : 'text-text-secondary'
                    }`}
                  >
                    Regenerate
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
