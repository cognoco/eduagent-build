import { View, Text, Pressable, ScrollView } from 'react-native';
import type { HomeworkProblem } from '@eduagent/schemas';
import type { Router } from 'expo-router';
import type { useCreateSubject } from '../../../../hooks/use-subjects';
import {
  type QuickChipId,
  type PendingSubjectResolution,
  type ConversationStage,
} from './session-types';

// ─── SessionToolAccessory ────────────────────────────────────────────────────

export interface SessionToolAccessoryProps {
  isStreaming: boolean;
  handleQuickChip: (chip: QuickChipId) => Promise<void>;
  stage: ConversationStage;
}

export function SessionToolAccessory({
  isStreaming,
  handleQuickChip,
  stage,
}: SessionToolAccessoryProps) {
  if (stage !== 'teaching') return null;

  return (
    <View className="bg-surface px-4 py-1.5">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6 }}
        testID="session-quick-chips"
      >
        {(
          [
            { id: 'switch_topic', label: 'Switch topic' },
            { id: 'park', label: 'Park it' },
          ] as Array<{ id: QuickChipId; label: string }>
        ).map((chip) => (
          <Pressable
            key={chip.id}
            onPress={() => void handleQuickChip(chip.id)}
            disabled={isStreaming}
            className={`rounded-full px-3 py-1 ${
              isStreaming ? 'bg-surface' : 'bg-surface-elevated'
            }`}
            accessibilityRole="button"
            accessibilityLabel={chip.label}
            accessibilityState={{ disabled: isStreaming }}
            testID={`quick-chip-${chip.id}`}
          >
            <Text className="text-caption text-text-secondary">
              {chip.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── SubjectResolutionAccessory ──────────────────────────────────────────────

export interface SubjectResolutionAccessoryProps {
  pendingSubjectResolution: PendingSubjectResolution | null;
  isStreaming: boolean;
  pendingClassification: boolean;
  createSubject: ReturnType<typeof useCreateSubject>;
  handleResolveSubject: (candidate: {
    subjectId: string;
    subjectName: string;
  }) => Promise<void>;
  handleCreateSuggestedSubject: () => Promise<void>;
  handleCreateResolveSuggestion: (suggestion: {
    name: string;
    description: string;
    focus?: string;
  }) => Promise<void>;
  setPendingSubjectResolution: React.Dispatch<
    React.SetStateAction<PendingSubjectResolution | null>
  >;
  router: Router;
}

export function SubjectResolutionAccessory({
  pendingSubjectResolution,
  isStreaming,
  pendingClassification,
  createSubject,
  handleResolveSubject,
  handleCreateSuggestedSubject,
  handleCreateResolveSuggestion,
  setPendingSubjectResolution,
  router,
}: SubjectResolutionAccessoryProps) {
  if (!pendingSubjectResolution) return null;

  return (
    <View
      className="bg-surface border-t border-surface-elevated px-4 py-3"
      style={{
        paddingBottom:
          pendingSubjectResolution.candidates.length === 0 ? 16 : undefined,
      }}
    >
      <Text className="text-body-sm font-semibold text-text-primary">
        Pick the subject
      </Text>
      <Text className="text-body-sm text-text-secondary mt-1 mb-3">
        {pendingSubjectResolution.prompt}
      </Text>
      {pendingSubjectResolution.candidates.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          testID="session-subject-resolution"
        >
          {pendingSubjectResolution.candidates.map((candidate) => (
            <Pressable
              key={candidate.subjectId}
              onPress={() => void handleResolveSubject(candidate)}
              disabled={isStreaming || pendingClassification}
              className="rounded-full bg-surface-elevated px-4 py-2"
              accessibilityRole="button"
              accessibilityLabel={`Choose ${candidate.subjectName}`}
              accessibilityState={{
                disabled: isStreaming || pendingClassification,
              }}
              testID={`subject-resolution-${candidate.subjectId}`}
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                {candidate.subjectName}
              </Text>
            </Pressable>
          ))}
          {/* BUG-233: When classifier suggests a subject, offer to create it inline */}
          {pendingSubjectResolution.suggestedSubjectName && (
            <Pressable
              onPress={() => void handleCreateSuggestedSubject()}
              disabled={
                isStreaming || pendingClassification || createSubject.isPending
              }
              className="rounded-full bg-primary/20 px-4 py-2"
              accessibilityRole="button"
              accessibilityLabel={`Add ${pendingSubjectResolution.suggestedSubjectName} as a new subject`}
              accessibilityState={{
                disabled:
                  isStreaming ||
                  pendingClassification ||
                  createSubject.isPending,
              }}
              testID="subject-resolution-create-new"
            >
              <Text className="text-body-sm font-semibold text-primary">
                {createSubject.isPending
                  ? 'Adding...'
                  : `+ ${pendingSubjectResolution.suggestedSubjectName}`}
              </Text>
            </Pressable>
          )}
          {/* Render rich suggestions from the resolve API */}
          {pendingSubjectResolution.resolveSuggestions?.map((suggestion) => (
            <Pressable
              key={suggestion.name}
              onPress={() => void handleCreateResolveSuggestion(suggestion)}
              disabled={
                isStreaming || pendingClassification || createSubject.isPending
              }
              className="rounded-full bg-primary/20 px-4 py-2"
              accessibilityRole="button"
              accessibilityLabel={`Add ${suggestion.name} as a new subject`}
              accessibilityState={{
                disabled:
                  isStreaming ||
                  pendingClassification ||
                  createSubject.isPending,
              }}
              testID={`subject-resolution-resolve-${suggestion.name}`}
            >
              <Text className="text-body-sm font-semibold text-primary">
                {createSubject.isPending ? 'Adding...' : `+ ${suggestion.name}`}
              </Text>
            </Pressable>
          ))}
          {/* BUG-236: Generic new-subject escape hatch — returns to chat after creation */}
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/create-subject',
                params: {
                  returnTo: 'chat',
                  chatTopic: pendingSubjectResolution.originalText,
                },
              } as never)
            }
            disabled={isStreaming || pendingClassification}
            className="rounded-full border border-border px-4 py-2"
            accessibilityRole="button"
            accessibilityLabel="Create a new subject"
            accessibilityState={{
              disabled: isStreaming || pendingClassification,
            }}
            testID="subject-resolution-new"
          >
            <Text className="text-body-sm font-semibold text-primary">
              + New subject
            </Text>
          </Pressable>
        </ScrollView>
      ) : (
        /* BUG-234: Zero-candidates fallback with BUG-236 returnTo=chat */
        <Pressable
          onPress={() => {
            setPendingSubjectResolution(null);
            router.push({
              pathname: '/create-subject',
              params: {
                returnTo: 'chat',
                chatTopic: pendingSubjectResolution.originalText,
              },
            } as never);
          }}
          className="rounded-button bg-primary py-3 items-center min-h-[44px] justify-center"
          accessibilityRole="button"
          accessibilityLabel="Create a new subject"
          testID="subject-resolution-create-new"
        >
          <Text className="text-body-sm font-semibold text-text-inverse">
            Create a new subject
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── HomeworkModeChips ───────────────────────────────────────────────────────

export interface HomeworkModeChipsProps {
  effectiveMode: string;
  homeworkProblemsState: HomeworkProblem[];
  currentProblemIndex: number;
  activeHomeworkProblem: HomeworkProblem | undefined;
  homeworkMode: 'help_me' | 'check_answer' | undefined;
  setHomeworkMode: React.Dispatch<
    React.SetStateAction<'help_me' | 'check_answer' | undefined>
  >;
  handleNextProblem: () => Promise<void>;
  handleEndSession: () => Promise<void>;
}

export function HomeworkModeChips({
  effectiveMode,
  homeworkProblemsState,
  currentProblemIndex,
  activeHomeworkProblem,
  homeworkMode,
  setHomeworkMode,
  handleNextProblem,
  handleEndSession,
}: HomeworkModeChipsProps) {
  if (effectiveMode !== 'homework') return null;

  return (
    <View className="bg-surface border-t border-surface-elevated">
      {homeworkProblemsState.length > 0 && (
        <View className="flex-row items-center justify-between px-4 pt-3">
          <View>
            <Text
              className="text-body-sm font-semibold text-text-primary"
              testID="homework-problem-progress"
            >
              Problem {currentProblemIndex + 1} of{' '}
              {homeworkProblemsState.length}
            </Text>
            <Text className="text-caption text-text-secondary mt-0.5">
              {activeHomeworkProblem?.text.slice(0, 70) ?? ''}
            </Text>
          </View>
          {currentProblemIndex < homeworkProblemsState.length - 1 ? (
            <Pressable
              onPress={handleNextProblem}
              className="rounded-full bg-primary/10 px-3 py-2"
              testID="next-problem-chip"
              accessibilityRole="button"
              accessibilityLabel="Move to the next homework problem"
            >
              <Text className="text-body-sm font-semibold text-primary">
                Next problem
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleEndSession}
              className="rounded-full bg-success/15 px-3 py-2"
              testID="finish-homework-chip"
              accessibilityRole="button"
              accessibilityLabel="Finish homework session"
            >
              <Text className="text-body-sm font-semibold text-success">
                Finish homework
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {homeworkProblemsState.length > 0 ? (
        <View className="flex-row px-4 py-3 gap-2">
          <Pressable
            onPress={() => setHomeworkMode('help_me')}
            className={`flex-1 rounded-button py-2 items-center ${
              homeworkMode === 'help_me' ? 'bg-primary' : 'bg-surface-elevated'
            }`}
            testID="homework-mode-help-me"
            accessibilityRole="button"
            accessibilityLabel="Help me solve it"
            accessibilityState={{ selected: homeworkMode === 'help_me' }}
          >
            <Text
              className={`text-body-sm font-semibold ${
                homeworkMode === 'help_me'
                  ? 'text-text-inverse'
                  : 'text-text-primary'
              }`}
            >
              Help me solve it
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setHomeworkMode('check_answer')}
            className={`flex-1 rounded-button py-2 items-center ${
              homeworkMode === 'check_answer'
                ? 'bg-primary'
                : 'bg-surface-elevated'
            }`}
            testID="homework-mode-check-answer"
            accessibilityRole="button"
            accessibilityLabel="Check my answer"
            accessibilityState={{ selected: homeworkMode === 'check_answer' }}
          >
            <Text
              className={`text-body-sm font-semibold ${
                homeworkMode === 'check_answer'
                  ? 'text-text-inverse'
                  : 'text-text-primary'
              }`}
            >
              Check my answer
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="px-4 py-3" testID="homework-no-problems">
          <Text className="text-body-sm text-text-secondary text-center">
            No problems loaded. Type your question directly in the chat.
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── SessionAccessory ────────────────────────────────────────────────────────
// Combines SubjectResolutionAccessory and HomeworkModeChips

export interface SessionAccessoryProps
  extends SubjectResolutionAccessoryProps,
    HomeworkModeChipsProps {}

export function SessionAccessory(props: SessionAccessoryProps) {
  return (
    <>
      <SubjectResolutionAccessory
        pendingSubjectResolution={props.pendingSubjectResolution}
        isStreaming={props.isStreaming}
        pendingClassification={props.pendingClassification}
        createSubject={props.createSubject}
        handleResolveSubject={props.handleResolveSubject}
        handleCreateSuggestedSubject={props.handleCreateSuggestedSubject}
        handleCreateResolveSuggestion={props.handleCreateResolveSuggestion}
        setPendingSubjectResolution={props.setPendingSubjectResolution}
        router={props.router}
      />
      <HomeworkModeChips
        effectiveMode={props.effectiveMode}
        homeworkProblemsState={props.homeworkProblemsState}
        currentProblemIndex={props.currentProblemIndex}
        activeHomeworkProblem={props.activeHomeworkProblem}
        homeworkMode={props.homeworkMode}
        setHomeworkMode={props.setHomeworkMode}
        handleNextProblem={props.handleNextProblem}
        handleEndSession={props.handleEndSession}
      />
    </>
  );
}
