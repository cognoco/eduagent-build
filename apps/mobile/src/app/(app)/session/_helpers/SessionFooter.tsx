import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { QuestionCounter, LibraryPrompt } from '../../../../components/session';
import { NoteInput } from '../../../../components/library/NoteInput';
import type { useFiling } from '../../../../hooks/use-filing';
import type { useUpsertNote } from '../../../../hooks/use-notes';
import { formatApiError } from '../../../../lib/format-api-error';
import type { Router } from 'expo-router';
import type { useThemeColors } from '../../../../lib/theme';
import type { DepthEvaluation, DetectedTopic } from '@eduagent/schemas';

export interface SessionFooterProps {
  showFilingPrompt: boolean;
  filingDismissed: boolean;
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  effectiveMode: string;
  filingTopicHint?: string;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: () => void;
  router: Router;
  depthEvaluation: DepthEvaluation | null;
  depthEvaluating: boolean;
  onAskAnother?: () => void;
  onFileTopic?: (topic: DetectedTopic) => Promise<void>;
  sessionExpired: boolean;
  notePromptOffered: boolean;
  showNoteInput: boolean;
  setShowNoteInput: React.Dispatch<React.SetStateAction<boolean>>;
  sessionNoteSavedRef: React.MutableRefObject<boolean>;
  topicId: string | undefined;
  upsertNote: ReturnType<typeof useUpsertNote>;
  colors: ReturnType<typeof useThemeColors>;
  userMessageCount: number;
  showQuestionCount: boolean;
  showBookLink: boolean;
}

export function SessionFooter({
  showFilingPrompt,
  filingDismissed,
  filing,
  activeSessionId,
  effectiveMode,
  filingTopicHint,
  setShowFilingPrompt,
  setFilingDismissed,
  navigateToSessionSummary,
  router,
  depthEvaluation,
  depthEvaluating,
  onAskAnother,
  onFileTopic,
  sessionExpired,
  notePromptOffered,
  showNoteInput,
  setShowNoteInput,
  sessionNoteSavedRef,
  topicId,
  upsertNote,
  colors,
  userMessageCount,
  showQuestionCount,
  showBookLink,
}: SessionFooterProps) {
  const isFreeform = effectiveMode === 'freeform';

  return (
    <>
      {showFilingPrompt && !filingDismissed ? (
        isFreeform ? (
          <FreeformFilingArea
            depthEvaluating={depthEvaluating}
            depthEvaluation={depthEvaluation}
            filing={filing}
            activeSessionId={activeSessionId}
            filingTopicHint={filingTopicHint}
            setShowFilingPrompt={setShowFilingPrompt}
            setFilingDismissed={setFilingDismissed}
            navigateToSessionSummary={navigateToSessionSummary}
            router={router}
            onAskAnother={onAskAnother}
            onFileTopic={onFileTopic}
          />
        ) : (
          <StandardFilingPrompt
            filing={filing}
            activeSessionId={activeSessionId}
            effectiveMode={effectiveMode}
            filingTopicHint={filingTopicHint}
            setShowFilingPrompt={setShowFilingPrompt}
            setFilingDismissed={setFilingDismissed}
            navigateToSessionSummary={navigateToSessionSummary}
            router={router}
          />
        )
      ) : null}
      {sessionExpired ? (
        <View className="bg-surface rounded-card p-4 mt-2 mb-4">
          <Text className="text-body font-semibold text-text-primary mb-2">
            Session expired
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            This session is no longer available. Start a new one from home or
            your library.
          </Text>
          <Pressable
            onPress={() => router.replace('/(app)/home' as never)}
            className="bg-primary rounded-button py-3 items-center"
            testID="session-expired-go-home"
            accessibilityRole="button"
            accessibilityLabel="Go home"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Go Home
            </Text>
          </Pressable>
        </View>
      ) : null}
      {notePromptOffered && !showNoteInput && !sessionNoteSavedRef.current ? (
        <Pressable
          className="bg-primary/10 rounded-lg px-4 py-3 mx-4 mb-2 flex-row items-center"
          onPress={() => setShowNoteInput(true)}
          testID="session-note-prompt"
          accessibilityRole="button"
          accessibilityLabel="Write a note"
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={colors.primary}
          />
          <Text className="text-body text-primary font-semibold ml-2">
            Write a note
          </Text>
        </Pressable>
      ) : null}
      {showNoteInput ? (
        <View className="px-4 mb-2">
          <NoteInput
            onSave={(content) => {
              if (!topicId) {
                Alert.alert(
                  'Cannot save note',
                  'No topic selected for this session.'
                );
                return;
              }
              const separator = !sessionNoteSavedRef.current
                ? `--- ${new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })} ---\n`
                : '';
              upsertNote.mutate(
                {
                  topicId,
                  content: `${separator}${content}`,
                  append: true,
                },
                {
                  onSuccess: () => {
                    sessionNoteSavedRef.current = true;
                    setShowNoteInput(false);
                  },
                  onError: (error) => {
                    Alert.alert(
                      "Couldn't save your note",
                      formatApiError(error)
                    );
                  },
                }
              );
            }}
            onCancel={() => setShowNoteInput(false)}
            saving={upsertNote.isPending}
          />
        </View>
      ) : null}
      {showQuestionCount ? <QuestionCounter count={userMessageCount} /> : null}
      {showBookLink ? <LibraryPrompt /> : null}
    </>
  );
}

function FreeformFilingArea({
  depthEvaluating,
  depthEvaluation,
  filing,
  activeSessionId,
  filingTopicHint,
  setShowFilingPrompt,
  setFilingDismissed,
  navigateToSessionSummary,
  router,
  onAskAnother,
  onFileTopic,
}: {
  depthEvaluating: boolean;
  depthEvaluation: DepthEvaluation | null;
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  filingTopicHint?: string;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: () => void;
  router: Router;
  onAskAnother?: () => void;
  onFileTopic?: (topic: DetectedTopic) => Promise<void>;
}) {
  if (depthEvaluating || !depthEvaluation) {
    return (
      <View
        className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
        testID="depth-evaluating-skeleton"
      >
        <View className="h-5 w-48 bg-surface rounded mb-3" />
        <View className="h-4 w-64 bg-surface rounded mb-4" />
        <View className="flex-row gap-3">
          <View className="flex-1 h-11 bg-surface rounded-xl" />
          <View className="w-24 h-11 bg-surface rounded-xl" />
        </View>
      </View>
    );
  }

  if (!depthEvaluation.meaningful) {
    return (
      <View
        className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
        testID="not-meaningful-close"
      >
        <Text className="text-lg font-semibold text-text-primary mb-2">
          Got it!
        </Text>
        <Text className="text-body-sm text-text-secondary mb-4">
          Anything else on your mind?
        </Text>
        <View className="flex-row gap-3">
          <Pressable
            onPress={() => {
              setShowFilingPrompt(false);
              onAskAnother?.();
            }}
            className="flex-1 bg-primary rounded-xl py-3 items-center min-h-[44px] justify-center"
            testID="ask-another-button"
            accessibilityRole="button"
            accessibilityLabel="Ask another question"
          >
            <Text className="text-text-inverse font-semibold">
              Ask another question
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setFilingDismissed(true);
              navigateToSessionSummary();
            }}
            className="px-4 py-3 min-h-[44px] justify-center"
            testID="done-button"
            accessibilityRole="button"
            accessibilityLabel="I'm done"
          >
            <Text className="text-text-secondary">I'm done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const fileableTopics = depthEvaluation.topics.filter(
    (topic) => topic.depth === 'substantial' || topic.depth === 'partial'
  );

  if (fileableTopics.length >= 2) {
    return (
      <MultiTopicFiling
        topics={fileableTopics}
        filing={filing}
        activeSessionId={activeSessionId}
        setFilingDismissed={setFilingDismissed}
        navigateToSessionSummary={navigateToSessionSummary}
        onFileTopic={onFileTopic}
      />
    );
  }

  const topicSummary = fileableTopics[0]?.summary ?? filingTopicHint;
  return (
    <StandardFilingPrompt
      filing={filing}
      activeSessionId={activeSessionId}
      effectiveMode="freeform"
      filingTopicHint={topicSummary}
      setShowFilingPrompt={setShowFilingPrompt}
      setFilingDismissed={setFilingDismissed}
      navigateToSessionSummary={navigateToSessionSummary}
      router={router}
    />
  );
}

function MultiTopicFiling({
  topics,
  filing,
  activeSessionId,
  setFilingDismissed,
  navigateToSessionSummary,
  onFileTopic,
}: {
  topics: DetectedTopic[];
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: () => void;
  onFileTopic?: (topic: DetectedTopic) => Promise<void>;
}) {
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [filingTopics, setFilingTopics] = useState<Set<string>>(new Set());
  const [failedTopics, setFailedTopics] = useState<Set<string>>(new Set());
  const [filedTopics, setFiledTopics] = useState<Set<string>>(new Set());

  const toggleTopic = (summary: string) => {
    setSelectedTopics((current) => {
      const next = new Set(current);
      if (next.has(summary)) {
        next.delete(summary);
      } else {
        next.add(summary);
      }
      return next;
    });
  };

  const handleFileSelected = async () => {
    const topicsToFile = topics.filter((topic) =>
      selectedTopics.has(topic.summary)
    );

    for (const topic of topicsToFile) {
      setFilingTopics((current) => new Set(current).add(topic.summary));
      try {
        if (onFileTopic) {
          await onFileTopic(topic);
        } else {
          await filing.mutateAsync({
            sessionId: activeSessionId ?? undefined,
            sessionMode: 'freeform',
            selectedSuggestion: topic.summary,
          });
        }
        setFiledTopics((current) => new Set(current).add(topic.summary));
      } catch {
        setFailedTopics((current) => new Set(current).add(topic.summary));
      } finally {
        setFilingTopics((current) => {
          const next = new Set(current);
          next.delete(topic.summary);
          return next;
        });
      }
    }

    navigateToSessionSummary();
  };

  return (
    <View
      className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
      testID="multi-topic-filing"
    >
      <Text className="text-lg font-semibold text-text-primary mb-2">
        You touched on a few things today!
      </Text>
      <Text className="text-body-sm text-text-secondary mb-4">
        Any of these you'd want to explore more?
      </Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {topics.map((topic) => {
          const isSelected = selectedTopics.has(topic.summary);
          const isFiling = filingTopics.has(topic.summary);
          const isFailed = failedTopics.has(topic.summary);
          const isFiled = filedTopics.has(topic.summary);

          return (
            <Pressable
              key={topic.summary}
              onPress={() => {
                if (isFailed) {
                  setFailedTopics((current) => {
                    const next = new Set(current);
                    next.delete(topic.summary);
                    return next;
                  });
                }
                if (!isFiling && !isFiled) {
                  toggleTopic(topic.summary);
                }
              }}
              disabled={isFiling || isFiled}
              className={`px-3 py-2 rounded-full border min-h-[36px] justify-center ${
                isFiled
                  ? 'bg-primary/10 border-primary'
                  : isFailed
                  ? 'bg-danger/10 border-danger'
                  : isSelected
                  ? 'bg-primary/20 border-primary'
                  : 'bg-surface border-surface-elevated'
              }`}
              testID={`topic-chip-${topic.summary
                .replace(/\s+/g, '-')
                .toLowerCase()}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected || isFiled }}
            >
              <View className="flex-row items-center gap-1">
                {isFiling ? <ActivityIndicator size="small" /> : null}
                {isFiled ? (
                  <Ionicons name="checkmark-circle" size={14} color="#00BFA5" />
                ) : null}
                {isFailed ? (
                  <Ionicons name="alert-circle" size={14} color="#FF5252" />
                ) : null}
                <Text
                  className={`text-body-sm ${
                    isSelected || isFiled
                      ? 'text-primary font-semibold'
                      : 'text-text-primary'
                  }`}
                >
                  {topic.summary}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row gap-3">
        {selectedTopics.size > 0 ? (
          <Pressable
            onPress={handleFileSelected}
            disabled={filing.isPending}
            className="flex-1 bg-primary rounded-xl py-3 items-center min-h-[44px] justify-center"
            testID="file-selected-topics"
            accessibilityRole="button"
            accessibilityLabel={`Add ${selectedTopics.size} topic${
              selectedTopics.size > 1 ? 's' : ''
            } to library`}
          >
            {filing.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-text-inverse font-semibold">
                Add to library
              </Text>
            )}
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            setFilingDismissed(true);
            navigateToSessionSummary();
          }}
          className="px-4 py-3 min-h-[44px] justify-center"
          testID="filing-dismiss-all"
          accessibilityRole="button"
          accessibilityLabel="I'm good, skip filing"
        >
          <Text className="text-text-secondary">I'm good</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StandardFilingPrompt({
  filing,
  activeSessionId,
  effectiveMode,
  filingTopicHint,
  setShowFilingPrompt,
  setFilingDismissed,
  navigateToSessionSummary,
  router,
}: {
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  effectiveMode: string;
  filingTopicHint?: string;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: () => void;
  router: Router;
}) {
  return (
    <View
      className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
      testID="filing-prompt"
    >
      <Text className="text-lg font-semibold text-text-primary mb-2">
        Add to your library?
      </Text>
      <Text className="text-body-sm text-text-secondary mb-4">
        {filingTopicHint
          ? `You explored "${filingTopicHint}". Keep it in your library?`
          : 'We can organize what you learned into your library.'}
      </Text>
      <View className="flex-row gap-3">
        <Pressable
          onPress={async () => {
            try {
              const result = await filing.mutateAsync({
                sessionId: activeSessionId ?? undefined,
                sessionMode: effectiveMode as 'freeform' | 'homework',
              });
              setShowFilingPrompt(false);
              router.replace({
                pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
                params: {
                  subjectId: result.shelfId,
                  bookId: result.bookId,
                },
              } as never);
            } catch {
              Alert.alert(
                "Couldn't add to library",
                'Your session is still saved.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setFilingDismissed(true);
                      navigateToSessionSummary();
                    },
                  },
                ]
              );
            }
          }}
          disabled={filing.isPending}
          className="flex-1 bg-primary rounded-xl py-3 items-center min-h-[44px] justify-center"
          testID="filing-prompt-accept"
          accessibilityRole="button"
          accessibilityLabel={
            filing.isPending ? 'Adding to library' : 'Yes, add to library'
          }
        >
          {filing.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-text-inverse font-semibold">Yes, add it</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => {
            setFilingDismissed(true);
            navigateToSessionSummary();
          }}
          disabled={filing.isPending}
          className="px-4 py-3 min-h-[44px] justify-center"
          testID="filing-prompt-dismiss"
          accessibilityRole="button"
          accessibilityLabel="No thanks, skip"
        >
          <Text className="text-text-secondary">No thanks</Text>
        </Pressable>
      </View>
    </View>
  );
}
