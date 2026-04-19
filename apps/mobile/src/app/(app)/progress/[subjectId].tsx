import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrReplace } from '../../../lib/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorFallback } from '../../../components/common';
import { ProgressBar } from '../../../components/progress';
import {
  useProgressInventory,
  useSubjectProgress,
} from '../../../hooks/use-progress';
import { useLanguageProgress } from '../../../hooks/use-language-progress';

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <View className="bg-surface rounded-card p-4 flex-1">
      <Text className="text-caption text-text-secondary">{label}</Text>
      <Text className="text-h3 font-semibold text-text-primary mt-2">
        {value}
      </Text>
    </View>
  );
}

export default function ProgressSubjectScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const inventoryQuery = useProgressInventory();
  const subjectProgressQuery = useSubjectProgress(subjectId ?? '');
  const languageProgressQuery = useLanguageProgress(subjectId ?? '');
  const languageProgress = languageProgressQuery.data;

  const subject = inventoryQuery.data?.subjects.find(
    (entry) => entry.subjectId === subjectId
  );
  const legacyProgress = subjectProgressQuery.data;
  const isLanguageSubject =
    subject?.pedagogyMode === 'four_strands' || !!languageProgress;

  // [EP15-C6] Every state must have at least one action. The prior
  // implementation jumped straight to the render tree when `!subjectId`
  // or `!subject` with no "go back" pressable — a genuine dead-end.
  if (!subjectId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="progress-subject-missing"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          No subject selected
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          Pick a subject from your progress page to see details.
        </Text>
        <Pressable
          onPress={() => router.replace('/(app)/progress' as never)}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel="Back to progress"
          testID="progress-subject-missing-back"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Back to progress
          </Text>
        </Pressable>
      </View>
    );
  }

  // [EP15-C6] Loading state. Previously the screen rendered immediately
  // with `subject?.subjectName ?? 'Subject progress'` and an empty body,
  // which is indistinguishable from a "this subject is gone" state.
  if (inventoryQuery.isLoading) {
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top }}
        testID="progress-subject-loading"
      >
        <View className="px-5 pt-4">
          <View className="bg-border rounded h-6 w-1/2 mb-4" />
          <View className="bg-coaching-card rounded-card p-5">
            <View className="bg-border rounded h-5 w-2/3 mb-3" />
            <View className="bg-border rounded h-4 w-full mb-2" />
            <View className="bg-border rounded h-4 w-3/4" />
          </View>
        </View>
      </View>
    );
  }

  // [EP15-C6] Error state — query failure gets a retry + go back.
  if (inventoryQuery.isError) {
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <ErrorFallback
          variant="centered"
          title="We couldn't load this subject"
          message={
            inventoryQuery.error?.message?.includes('API error')
              ? 'Something went wrong on our end. Tap below to retry.'
              : 'Check your connection and try again.'
          }
          primaryAction={{
            label: 'Try again',
            onPress: () => void inventoryQuery.refetch(),
            testID: 'progress-subject-error-retry',
          }}
          secondaryAction={{
            label: 'Go back',
            onPress: () => router.replace('/(app)/progress' as never),
            testID: 'progress-subject-error-back',
          }}
          testID="progress-subject-error"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center mt-4">
          <Pressable
            onPress={() => goBackOrReplace(router, '/(app)/progress' as const)}
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="progress-subject-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {subject?.subjectName ?? 'Subject progress'}
            </Text>
            {subject?.estimatedProficiencyLabel ||
            subject?.estimatedProficiency ? (
              <Text className="text-body-sm text-text-secondary mt-0.5">
                {subject?.estimatedProficiencyLabel ??
                  subject?.estimatedProficiency}
              </Text>
            ) : null}
          </View>
        </View>

        {subject ? (
          <>
            <View className="bg-coaching-card rounded-card p-5 mt-4">
              <Text className="text-h3 font-semibold text-text-primary">
                {subject.topics.total != null
                  ? `${subject.topics.mastered}/${subject.topics.total} planned topics mastered`
                  : `${Math.max(
                      subject.topics.explored,
                      subject.topics.mastered + subject.topics.inProgress
                    )} topics explored`}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-2">
                {subject.vocabulary.total > 0
                  ? `${subject.vocabulary.total} words tracked in this subject`
                  : `${subject.sessionsCount} sessions completed`}
              </Text>
              {subject.topics.total != null ? (
                <View className="mt-4">
                  <ProgressBar
                    value={subject.topics.mastered}
                    max={Math.max(1, subject.topics.total)}
                    testID="progress-subject-bar"
                  />
                </View>
              ) : null}
            </View>

            <View className="flex-row gap-3 mt-4">
              <StatCard
                label="In progress"
                value={String(subject.topics.inProgress)}
              />
              <StatCard
                label="Not started"
                value={String(subject.topics.notStarted)}
              />
            </View>

            <View className="flex-row gap-3 mt-3">
              <StatCard
                label="Minutes"
                value={String(
                  subject.wallClockMinutes || subject.activeMinutes
                )}
              />
              <StatCard
                label="Sessions"
                value={String(subject.sessionsCount)}
              />
            </View>

            {subject.vocabulary.total > 0 ? (
              <View className="bg-surface rounded-card p-4 mt-4">
                <Text className="text-h3 font-semibold text-text-primary">
                  Vocabulary
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  {subject.vocabulary.mastered} mastered •{' '}
                  {subject.vocabulary.learning} learning •{' '}
                  {subject.vocabulary.new} new
                </Text>
                <View className="mt-4 gap-2">
                  {Object.entries(subject.vocabulary.byCefrLevel).map(
                    ([level, count]) => (
                      <View
                        key={level}
                        className="flex-row items-center justify-between"
                      >
                        <Text className="text-body-sm text-text-primary">
                          {level}
                        </Text>
                        <Text className="text-body-sm text-text-secondary">
                          {count} words
                        </Text>
                      </View>
                    )
                  )}
                </View>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/vocabulary/[subjectId]',
                      params: { subjectId: subject.subjectId },
                    } as never)
                  }
                  className="mt-3 py-2 self-start"
                  accessibilityRole="button"
                  accessibilityLabel="View all vocabulary"
                  testID="vocab-view-all"
                >
                  <Text className="text-body-sm font-semibold text-primary">
                    View all vocabulary →
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {isLanguageSubject && (
              <View
                className="bg-coaching-card rounded-card p-5 mt-4"
                testID="cefr-milestone-card"
              >
                <Text className="text-h3 font-semibold text-text-primary">
                  Language milestone
                </Text>

                {languageProgressQuery.isLoading ? (
                  <View className="mt-3">
                    <View className="bg-border rounded h-4 w-2/3 mb-2" />
                    <View className="bg-border rounded h-3 w-full" />
                  </View>
                ) : languageProgressQuery.isError ? (
                  <View className="mt-3">
                    <Text className="text-body-sm text-text-secondary mb-2">
                      Could not load milestone data.
                    </Text>
                    <Pressable
                      onPress={() => void languageProgressQuery.refetch()}
                      className="bg-surface-elevated rounded-button px-4 py-2.5 self-start min-h-[44px] items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel="Retry loading milestone"
                      testID="cefr-milestone-retry"
                    >
                      <Text className="text-body-sm font-semibold text-text-primary">
                        Retry
                      </Text>
                    </Pressable>
                  </View>
                ) : languageProgress?.currentMilestone ? (
                  <>
                    <Text className="text-body-sm text-text-secondary mt-1">
                      {languageProgress.currentLevel} ·{' '}
                      {languageProgress.currentMilestone.milestoneTitle}
                    </Text>
                    <View className="mt-3">
                      <View className="flex-row justify-between mb-1">
                        <Text className="text-caption text-text-muted">
                          {languageProgress.currentMilestone.wordsMastered}/
                          {languageProgress.currentMilestone.wordsTarget} words
                        </Text>
                        <Text className="text-caption text-text-muted">
                          {languageProgress.currentMilestone.chunksMastered}/
                          {languageProgress.currentMilestone.chunksTarget}{' '}
                          phrases
                        </Text>
                      </View>
                      <View className="bg-border rounded-full h-2 overflow-hidden">
                        <View
                          className="bg-primary h-full rounded-full"
                          style={{
                            width: `${Math.round(
                              languageProgress.currentMilestone
                                .milestoneProgress * 100
                            )}%`,
                          }}
                        />
                      </View>
                    </View>
                    {languageProgress.nextMilestone && (
                      <Text className="text-caption text-text-muted mt-2">
                        Up next: {languageProgress.nextMilestone.level} —{' '}
                        {languageProgress.nextMilestone.milestoneTitle}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text className="text-body-sm text-text-secondary mt-2">
                    Complete a session to start tracking your milestone
                    progress.
                  </Text>
                )}
              </View>
            )}

            {subjectProgressQuery.isError ? (
              <View
                className="bg-surface rounded-card p-4 mt-4"
                testID="progress-subject-retention-error"
              >
                <Text className="text-h3 font-semibold text-text-primary">
                  Current retention
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1 mb-3">
                  We couldn't load retention data right now.
                </Text>
                <Pressable
                  onPress={() => void subjectProgressQuery.refetch()}
                  className="bg-surface-elevated rounded-button px-4 py-2.5 self-start min-h-[44px] items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading retention"
                  testID="progress-subject-retention-retry"
                >
                  <Text className="text-body-sm font-semibold text-text-primary">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : legacyProgress ? (
              <View className="bg-surface rounded-card p-4 mt-4">
                <Text className="text-h3 font-semibold text-text-primary">
                  Current retention
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  {legacyProgress.retentionStatus === 'strong'
                    ? 'Knowledge feels stable right now.'
                    : legacyProgress.retentionStatus === 'fading'
                    ? 'A light review would help keep this fresh.'
                    : 'This subject would benefit from some extra attention.'}
                </Text>
              </View>
            ) : null}

            <View className="flex-row gap-3 mt-6">
              <Pressable
                onPress={() =>
                  router.push(
                    `/(app)/session?mode=freeform&subjectId=${subject.subjectId}` as never
                  )
                }
                className="bg-primary rounded-button px-4 py-3 items-center flex-1"
                accessibilityRole="button"
                accessibilityLabel="Continue learning"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  Keep learning
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(app)/shelf/[subjectId]',
                    params: { subjectId: subject.subjectId },
                  } as never)
                }
                className="bg-surface rounded-button px-4 py-3 items-center flex-1"
                accessibilityRole="button"
                accessibilityLabel="Open library shelf"
              >
                <Text className="text-body font-semibold text-text-primary">
                  Open shelf
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          // [EP15-C6] Dead-end fix — the prior version showed only text
          // with zero actionable elements. Users scrolling into a deleted
          // subject had nothing to press besides the OS back gesture.
          <View
            className="bg-surface rounded-card p-5 mt-4"
            testID="progress-subject-gone"
          >
            <Text className="text-h3 font-semibold text-text-primary">
              This subject is no longer available
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              It may have been removed or merged into another subject.
            </Text>
            <Pressable
              onPress={() => router.replace('/(app)/progress' as never)}
              className="bg-primary rounded-button px-4 py-3 items-center mt-4 min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel="Back to progress"
              testID="progress-subject-gone-back"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Back to progress
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
