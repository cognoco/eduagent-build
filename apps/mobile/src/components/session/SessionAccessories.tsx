import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HomeworkProblem } from '@eduagent/schemas';
import type { Router } from 'expo-router';
import type { useCreateSubject } from '../../hooks/use-subjects';
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
  const { t } = useTranslation();
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
            { id: 'switch_topic', label: t('session.accessories.switchTopic') },
            { id: 'park', label: t('session.accessories.parkIt') },
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
  const { t } = useTranslation();
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
        {t('session.accessories.pickSubject')}
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
                  ? t('session.accessories.adding')
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
                {createSubject.isPending
                  ? t('session.accessories.adding')
                  : `+ ${suggestion.name}`}
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
            accessibilityLabel={t('session.accessories.createNewSubjectLabel')}
            accessibilityState={{
              disabled: isStreaming || pendingClassification,
            }}
            testID="subject-resolution-new"
          >
            <Text className="text-body-sm font-semibold text-primary">
              {t('session.accessories.newSubject')}
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
          accessibilityLabel={t('session.accessories.createNewSubjectLabel')}
          testID="subject-resolution-create-new"
        >
          <Text className="text-body-sm font-semibold text-text-inverse">
            {t('session.accessories.createNewSubject')}
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
  const { t } = useTranslation();
  const [problemExpanded, setProblemExpanded] = useState(true);

  if (effectiveMode !== 'homework') return null;

  return (
    <View className="bg-surface border-t border-surface-elevated">
      {homeworkProblemsState.length > 0 && (
        <View className="flex-row items-center justify-between px-4 pt-3">
          <Pressable
            onPress={() => setProblemExpanded((v) => !v)}
            className="flex-1 pr-2"
            accessibilityRole="button"
            accessibilityLabel={
              problemExpanded ? 'Hide problem text' : 'Show problem text'
            }
            accessibilityState={{ expanded: problemExpanded }}
            testID="homework-problem-toggle"
          >
            <View className="flex-row items-center gap-1">
              <Text
                className="text-body-sm font-semibold text-text-primary"
                testID="homework-problem-progress"
              >
                {t('session.accessories.problemProgress', {
                  current: String(currentProblemIndex + 1),
                  total: String(homeworkProblemsState.length),
                })}
              </Text>
              <Text className="text-body-sm text-text-secondary">
                {problemExpanded ? '▾' : '▸'}
              </Text>
            </View>
            {problemExpanded && (
              <Text
                className="text-caption text-text-secondary mt-0.5"
                testID="homework-problem-text"
              >
                {activeHomeworkProblem?.text.slice(0, 70) ?? ''}
              </Text>
            )}
          </Pressable>
          <View className="flex-row items-center gap-2">
            {currentProblemIndex < homeworkProblemsState.length - 1 ? (
              <>
                {/* [BUG-468] Human override: let user finish early from any problem */}
                <Pressable
                  onPress={handleEndSession}
                  className="rounded-full bg-surface-elevated px-3 py-2"
                  testID="finish-homework-early-chip"
                  accessibilityRole="button"
                  accessibilityLabel={t('session.accessories.finishEarlyLabel')}
                >
                  <Text className="text-body-sm font-semibold text-text-secondary">
                    {t('session.accessories.imDone')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleNextProblem}
                  className="rounded-full bg-primary/10 px-3 py-2"
                  testID="next-problem-chip"
                  accessibilityRole="button"
                  accessibilityLabel={t('session.accessories.nextProblemLabel')}
                >
                  <Text className="text-body-sm font-semibold text-primary">
                    {t('session.accessories.nextProblem')}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={handleEndSession}
                className="rounded-full bg-success/15 px-3 py-2"
                testID="finish-homework-chip"
                accessibilityRole="button"
                accessibilityLabel={t(
                  'session.accessories.finishHomeworkLabel'
                )}
              >
                <Text className="text-body-sm font-semibold text-success">
                  {t('session.accessories.finishHomework')}
                </Text>
              </Pressable>
            )}
          </View>
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
            accessibilityLabel={t('session.accessories.walkMeThrough')}
            accessibilityState={{ selected: homeworkMode === 'help_me' }}
          >
            <Text
              className={`text-body-sm font-semibold ${
                homeworkMode === 'help_me'
                  ? 'text-text-inverse'
                  : 'text-text-primary'
              }`}
            >
              {t('session.accessories.walkMeThrough')}
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
            accessibilityLabel={t('session.accessories.checkMyAnswer')}
            accessibilityState={{ selected: homeworkMode === 'check_answer' }}
          >
            <Text
              className={`text-body-sm font-semibold ${
                homeworkMode === 'check_answer'
                  ? 'text-text-inverse'
                  : 'text-text-primary'
              }`}
            >
              {t('session.accessories.checkMyAnswer')}
            </Text>
          </Pressable>
        </View>
      ) : (
        /* M6: Zero-problems fallback — add escape action so user isn't stuck */
        <View className="px-4 py-3" testID="homework-no-problems">
          <Text className="text-body-sm text-text-secondary text-center mb-2">
            {t('session.accessories.noProblemsLoaded')}
          </Text>
          <Pressable
            onPress={handleEndSession}
            className="rounded-button bg-surface-elevated py-2 items-center min-h-[44px] justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('session.accessories.endSessionLabel')}
            testID="homework-no-problems-end-btn"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              {t('session.accessories.endSession')}
            </Text>
          </Pressable>
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
