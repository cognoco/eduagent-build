import { useCallback } from 'react';
import { Alert } from 'react-native';
import type {
  InputMode,
  HomeworkProblem,
  PendingCelebration,
  CelebrationReason,
} from '@eduagent/schemas';
import type { Router } from 'expo-router';
import type { ChatMessage } from '../../../../components/session';
import type {
  useCloseSession,
  useRecordSystemPrompt,
  useRecordSessionEvent,
  useFlagSessionContent,
  useAddParkingLotItem,
  useSetSessionInputMode,
} from '../../../../hooks/use-sessions';
import { clearSessionRecoveryMarker } from '../../../../lib/session-recovery';
import * as SecureStore from '../../../../lib/secure-storage';
import { formatApiError } from '../../../../lib/format-api-error';
import { withProblemMode } from '../../homework/_helpers/problem-cards';
import {
  getInputModeKey,
  serializeMilestones,
  serializeCelebrations,
  QUICK_CHIP_CONFIG,
  CONFIRMATION_BY_CHIP,
  type QuickChipId,
  type MessageFeedbackState,
} from './session-types';

/** Conditions for silent auto-filing of freeform sessions at close */
export function shouldAutoFile(params: {
  effectiveMode: string;
  effectiveSubjectId: string | null | undefined;
  exchangeCount: number;
  topicId: string | undefined;
}): boolean {
  return (
    params.effectiveMode === 'freeform' &&
    !!params.effectiveSubjectId &&
    params.exchangeCount >= 5 &&
    !params.topicId
  );
}

export interface UseSessionActionsOptions {
  // State
  activeSessionId: string | null;
  isStreaming: boolean;
  isClosing: boolean;
  setIsClosing: React.Dispatch<React.SetStateAction<boolean>>;
  exchangeCount: number;
  escalationRung: number;
  effectiveMode: string;
  effectiveSubjectId: string | null | undefined;
  effectiveSubjectName: string | null | undefined;
  topicId: string | undefined;
  milestonesReached: CelebrationReason[];
  inputMode: InputMode;
  setInputMode: React.Dispatch<React.SetStateAction<InputMode>>;
  setShowWrongSubjectChip: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTopicSwitcher: React.Dispatch<React.SetStateAction<boolean>>;
  setShowParkingLot: React.Dispatch<React.SetStateAction<boolean>>;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setConsumedQuickChipMessageId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  setMessageFeedback: React.Dispatch<
    React.SetStateAction<Record<string, MessageFeedbackState>>
  >;
  homeworkProblemsState: HomeworkProblem[];
  setHomeworkProblemsState: React.Dispatch<
    React.SetStateAction<HomeworkProblem[]>
  >;
  currentProblemIndex: number;
  setCurrentProblemIndex: React.Dispatch<React.SetStateAction<number>>;
  homeworkMode: 'help_me' | 'check_answer' | undefined;
  setHomeworkMode: React.Dispatch<
    React.SetStateAction<'help_me' | 'check_answer' | undefined>
  >;
  activeHomeworkProblem: HomeworkProblem | undefined;
  parkingLotDraft: string;
  setParkingLotDraft: React.Dispatch<React.SetStateAction<string>>;
  closedSessionRef: React.MutableRefObject<{
    wallClockSeconds: number;
    fastCelebrations: PendingCelebration[];
  } | null>;
  queuedProblemTextRef: React.MutableRefObject<string | null>;

  // Profile
  activeProfileId: string | undefined;

  // Mutation hooks
  closeSession: ReturnType<typeof useCloseSession>;
  recordSystemPrompt: ReturnType<typeof useRecordSystemPrompt>;
  recordSessionEvent: ReturnType<typeof useRecordSessionEvent>;
  flagSessionContent: ReturnType<typeof useFlagSessionContent>;
  addParkingLotItem: ReturnType<typeof useAddParkingLotItem>;
  setSessionInputMode: ReturnType<typeof useSetSessionInputMode>;

  // Functions from other hooks
  handleSend: (
    text: string,
    opts?: { isAutoSent?: boolean; imageUri?: string }
  ) => Promise<void>;
  syncHomeworkMetadata: (
    sessionId: string,
    problems: HomeworkProblem[],
    problemIndex: number
  ) => Promise<void>;
  fetchFastCelebrations: () => Promise<PendingCelebration[]>;
  showConfirmation: (message: string) => void;
  /** Filing mutation for auto-filing freeform sessions */
  filing?: {
    mutateAsync: (input: {
      sessionId: string;
      sessionMode: 'freeform';
    }) => Promise<{ shelfId: string; bookId: string }>;
  };

  /** Best-effort retry: POST /filing/request-retry to queue via Inngest */
  retryFiling?: (input: {
    sessionId: string;
    sessionMode: 'freeform' | 'homework';
  }) => Promise<void>;

  router: Router;
}

const CLOSE_TIMEOUT_MS = 15_000;

export function useSessionActions(opts: UseSessionActionsOptions) {
  const {
    activeSessionId,
    isStreaming,
    isClosing,
    setIsClosing,
    exchangeCount,
    escalationRung,
    effectiveMode,
    effectiveSubjectId,
    effectiveSubjectName,
    topicId,
    milestonesReached,
    inputMode,
    setInputMode,
    setShowWrongSubjectChip,
    setShowTopicSwitcher,
    setShowParkingLot,
    setShowFilingPrompt,
    setConsumedQuickChipMessageId,
    setMessageFeedback,
    homeworkProblemsState,
    setHomeworkProblemsState,
    currentProblemIndex,
    setCurrentProblemIndex,
    homeworkMode,
    setHomeworkMode,
    activeHomeworkProblem,
    parkingLotDraft,
    setParkingLotDraft,
    closedSessionRef,
    queuedProblemTextRef,
    activeProfileId,
    closeSession,
    recordSystemPrompt,
    recordSessionEvent,
    flagSessionContent,
    addParkingLotItem,
    setSessionInputMode,
    handleSend,
    syncHomeworkMetadata,
    fetchFastCelebrations,
    showConfirmation,
    filing,
    retryFiling,
    router,
  } = opts;

  const handleInputModeChange = useCallback(
    (nextInputMode: InputMode) => {
      const previousInputMode = inputMode;
      setInputMode(nextInputMode);

      // Persist preference so next session restores it.
      if (activeProfileId) {
        void SecureStore.setItemAsync(
          getInputModeKey(activeProfileId),
          nextInputMode
        ).catch((err) =>
          console.warn('[Session] Failed to persist input mode:', err)
        );
      }

      if (!activeSessionId) {
        return;
      }
      void setSessionInputMode
        .mutateAsync({ inputMode: nextInputMode })
        .catch(() => {
          setInputMode(previousInputMode);
          showConfirmation("Couldn't save that mode just now.");
        });
    },
    [
      activeProfileId,
      activeSessionId,
      inputMode,
      setSessionInputMode,
      showConfirmation,
    ]
  );

  const handleNextProblem = useCallback(async () => {
    if (
      effectiveMode !== 'homework' ||
      isStreaming ||
      currentProblemIndex >= homeworkProblemsState.length - 1
    ) {
      return;
    }

    const nextProblemIndex = currentProblemIndex + 1;
    const currentProblemId = activeHomeworkProblem?.id;
    const updatedProblems =
      currentProblemId != null
        ? withProblemMode(homeworkProblemsState, currentProblemId, homeworkMode)
        : homeworkProblemsState;

    const nextProblem = updatedProblems[nextProblemIndex];
    if (nextProblem) {
      queuedProblemTextRef.current = nextProblem.text;
    }

    setHomeworkProblemsState(updatedProblems);
    setCurrentProblemIndex(nextProblemIndex);
    setHomeworkMode(undefined);

    if (activeSessionId) {
      try {
        await syncHomeworkMetadata(
          activeSessionId,
          updatedProblems,
          nextProblemIndex
        );
      } catch (err) {
        console.warn('[Session] Homework metadata sync failed:', err);
        // Keep the local flow moving even if metadata sync fails.
      }
    }
  }, [
    effectiveMode,
    isStreaming,
    currentProblemIndex,
    homeworkProblemsState,
    activeHomeworkProblem,
    homeworkMode,
    activeSessionId,
    syncHomeworkMetadata,
    queuedProblemTextRef,
    setHomeworkProblemsState,
    setCurrentProblemIndex,
    setHomeworkMode,
  ]);

  const navigateToSessionSummary = useCallback(() => {
    const saved = closedSessionRef.current;
    if (!activeSessionId || !saved) return;
    router.replace({
      pathname: `/session-summary/${activeSessionId}`,
      params: {
        subjectName: effectiveSubjectName ?? '',
        exchangeCount: String(exchangeCount),
        escalationRung: String(escalationRung),
        subjectId: effectiveSubjectId ?? '',
        topicId: topicId ?? '',
        wallClockSeconds: String(saved.wallClockSeconds),
        milestones: serializeMilestones(milestonesReached),
        fastCelebrations: serializeCelebrations(saved.fastCelebrations),
        sessionType: effectiveMode === 'homework' ? 'homework' : 'learning',
      },
    } as never);
  }, [
    activeSessionId,
    router,
    effectiveSubjectName,
    effectiveSubjectId,
    topicId,
    exchangeCount,
    escalationRung,
    milestonesReached,
    effectiveMode,
    closedSessionRef,
  ]);

  const navigateToSummary = useCallback(
    (
      sessionId: string,
      wallClockSeconds: number,
      fastCelebrations: PendingCelebration[]
    ) => {
      router.replace({
        pathname: `/session-summary/${sessionId}`,
        params: {
          subjectName: effectiveSubjectName ?? '',
          exchangeCount: String(exchangeCount),
          escalationRung: String(escalationRung),
          subjectId: effectiveSubjectId ?? '',
          topicId: topicId ?? '',
          wallClockSeconds: String(wallClockSeconds),
          milestones: serializeMilestones(milestonesReached),
          fastCelebrations: serializeCelebrations(fastCelebrations),
          sessionType: effectiveMode,
        },
      } as never);
    },
    [
      router,
      effectiveSubjectName,
      exchangeCount,
      escalationRung,
      effectiveSubjectId,
      topicId,
      milestonesReached,
      effectiveMode,
    ]
  );

  const handleEndSession = useCallback(async () => {
    if (!activeSessionId || isClosing) return;

    // BUG-352: Set isClosing immediately so a second tap in the same render
    // frame cannot pass the guard.
    setIsClosing(true);

    Alert.alert(
      'End session?',
      '',
      [
        {
          text: 'Continue',
          style: 'cancel',
          onPress: () => setIsClosing(false),
        },
        {
          text: 'End Session',
          onPress: async () => {
            try {
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error('Session close timed out')),
                  CLOSE_TIMEOUT_MS
                )
              );
              const result = await Promise.race([
                closeSession.mutateAsync({
                  reason: 'user_ended',
                  summaryStatus: 'pending',
                  milestonesReached,
                }),
                timeoutPromise,
              ]);
              const fastCelebrations = await fetchFastCelebrations();
              await clearSessionRecoveryMarker(activeProfileId);

              // Store close result for deferred navigation
              closedSessionRef.current = {
                wallClockSeconds: result.wallClockSeconds,
                fastCelebrations,
              };

              // Freeform: auto-file silently if conditions met, else show prompt
              // Homework: always show filing prompt
              if (
                effectiveMode === 'freeform' ||
                effectiveMode === 'homework'
              ) {
                if (
                  shouldAutoFile({
                    effectiveMode,
                    effectiveSubjectId,
                    exchangeCount,
                    topicId,
                  }) &&
                  filing
                ) {
                  // Auto-file silently — no modal, no decision for the kid
                  try {
                    await filing.mutateAsync({
                      sessionId: activeSessionId,
                      sessionMode: 'freeform',
                    });
                    showConfirmation(
                      `Saved to your ${effectiveSubjectName ?? 'library'} shelf`
                    );
                  } catch {
                    try {
                      await retryFiling?.({
                        sessionId: activeSessionId,
                        sessionMode: 'freeform',
                      });
                    } catch {
                      // Best-effort — session data is safe
                    }
                    showConfirmation?.(
                      "Couldn't save to library — retrying in the background"
                    );
                  }
                  navigateToSummary(
                    activeSessionId,
                    result.wallClockSeconds,
                    fastCelebrations
                  );
                } else {
                  setShowFilingPrompt(true);
                }
              } else {
                navigateToSummary(
                  activeSessionId,
                  result.wallClockSeconds,
                  fastCelebrations
                );
              }
            } catch (err: unknown) {
              Alert.alert(
                'Could not end this session cleanly',
                `${formatApiError(
                  err
                )} You can keep trying, or go home now and come back later.`,
                [
                  {
                    text: 'Keep trying',
                    style: 'cancel',
                    onPress: () => setIsClosing(false),
                  },
                  {
                    text: 'Go Home',
                    onPress: () => {
                      router.replace('/(app)/home' as never);
                    },
                  },
                ]
              );
            }
          },
        },
      ],
      { cancelable: true, onDismiss: () => setIsClosing(false) }
    );
  }, [
    activeSessionId,
    isClosing,
    closeSession,
    fetchFastCelebrations,
    activeProfileId,
    milestonesReached,
    effectiveMode,
    effectiveSubjectId,
    effectiveSubjectName,
    exchangeCount,
    topicId,
    filing,
    retryFiling,
    showConfirmation,
    navigateToSummary,
    setIsClosing,
    setShowFilingPrompt,
    closedSessionRef,
  ]);

  const handleQuickChip = useCallback(
    async (chip: QuickChipId, sourceMessageId?: string) => {
      if (
        isStreaming &&
        chip !== 'switch_topic' &&
        chip !== 'park' &&
        chip !== 'wrong_subject'
      ) {
        return;
      }

      if (chip === 'wrong_subject') {
        setShowTopicSwitcher(true);
        return;
      }

      if (chip === 'switch_topic') {
        setShowTopicSwitcher(true);
        return;
      }

      if (chip === 'park') {
        if (!activeSessionId) {
          Alert.alert(
            'Start the conversation first',
            'Send one message so this session has somewhere to save your parking lot.'
          );
          return;
        }
        setShowParkingLot(true);
        return;
      }

      const config = QUICK_CHIP_CONFIG[chip];
      if (!config) return;

      if (activeSessionId) {
        try {
          await recordSessionEvent.mutateAsync({
            eventType: 'quick_action',
            content: chip,
            metadata: {
              chip,
              ...(sourceMessageId ? { sourceMessageId } : {}),
            },
          });
        } catch {
          // Best effort only. The visible prompt still continues below.
        }

        try {
          await recordSystemPrompt.mutateAsync({
            content: config.systemPrompt,
            metadata: { type: 'quick_chip', chip },
          });
        } catch (err) {
          console.warn(
            '[Session] Quick-chip system prompt failed to persist:',
            err
          );
          // Best effort only. The visible prompt still continues below.
        }
      }

      if (sourceMessageId) {
        setConsumedQuickChipMessageId(sourceMessageId);
      }

      const confirmation = CONFIRMATION_BY_CHIP[chip];
      if (confirmation) {
        showConfirmation(confirmation);
      }

      await handleSend(config.prompt);
    },
    [
      activeSessionId,
      handleSend,
      isStreaming,
      recordSessionEvent,
      recordSystemPrompt,
      showConfirmation,
      setShowTopicSwitcher,
      setShowParkingLot,
      setConsumedQuickChipMessageId,
    ]
  );

  const handleMessageFeedback = useCallback(
    async (message: ChatMessage, action: MessageFeedbackState) => {
      if (!message.eventId || !activeSessionId || isStreaming) return;

      const systemPromptByAction: Record<MessageFeedbackState, string> = {
        helpful:
          'The learner marked the previous answer as helpful. Keep the same pace and level of guidance.',
        not_helpful:
          'The learner marked the previous answer as not helpful. Re-explain more clearly with one new example.',
        incorrect:
          'The learner believes the previous answer was incorrect. Correct it clearly, explain what changed, and continue from there.',
      };
      const followUpPromptByAction: Partial<
        Record<MessageFeedbackState, string>
      > = {
        not_helpful: 'Can you explain that differently?',
        incorrect:
          'I think that answer is incorrect. Can you correct it and explain what changed?',
      };

      try {
        try {
          await recordSessionEvent.mutateAsync({
            eventType: 'user_feedback',
            content: action,
            metadata: {
              value: action,
              eventId: message.eventId,
            },
          });
        } catch {
          // Best effort only. We still want the visible correction flow.
        }

        if (action === 'incorrect') {
          await flagSessionContent.mutateAsync({
            eventId: message.eventId,
            reason: 'Learner marked response as incorrect',
          });
        }

        await recordSystemPrompt.mutateAsync({
          content: systemPromptByAction[action],
          metadata: {
            type: 'message_feedback',
            value: action,
            eventId: message.eventId,
          },
        });
        setMessageFeedback((prev) => ({ ...prev, [message.id]: action }));
        showConfirmation(
          action === 'helpful'
            ? 'Keeping this pace.'
            : action === 'not_helpful'
            ? 'Adjusting the explanation.'
            : "I'll correct that."
        );

        const followUpPrompt = followUpPromptByAction[action];
        if (followUpPrompt) {
          await handleSend(followUpPrompt);
        }
      } catch (err: unknown) {
        Alert.alert('Could not save feedback', formatApiError(err));
      }
    },
    [
      activeSessionId,
      flagSessionContent,
      handleSend,
      isStreaming,
      recordSessionEvent,
      recordSystemPrompt,
      showConfirmation,
      setMessageFeedback,
    ]
  );

  const handleSaveParkingLot = useCallback(async () => {
    if (!activeSessionId) {
      Alert.alert(
        'Start the conversation first',
        'Send one message so this session has somewhere to save your parking lot.'
      );
      return;
    }

    if (!parkingLotDraft.trim()) return;

    try {
      await addParkingLotItem.mutateAsync({ question: parkingLotDraft.trim() });
      setParkingLotDraft('');
      showConfirmation('Saved to your parking lot.');
    } catch (err: unknown) {
      Alert.alert('Could not save parking lot item', formatApiError(err));
    }
  }, [
    activeSessionId,
    addParkingLotItem,
    parkingLotDraft,
    showConfirmation,
    setParkingLotDraft,
  ]);

  const handleTopicSwitch = useCallback(
    async (
      nextTopicId: string,
      nextSubjectId: string,
      nextSubjectName: string
    ) => {
      try {
        setIsClosing(true);
        if (activeSessionId) {
          await closeSession.mutateAsync({
            reason: 'user_ended',
            summaryStatus: 'skipped',
          });
          await clearSessionRecoveryMarker(activeProfileId);
        }

        setShowWrongSubjectChip(false);
        setShowTopicSwitcher(false);
        router.replace({
          pathname: '/(app)/session',
          params: {
            mode: effectiveMode === 'freeform' ? 'learning' : effectiveMode,
            subjectId: nextSubjectId,
            subjectName: nextSubjectName,
            topicId: nextTopicId,
          },
        } as never);
      } catch (err: unknown) {
        setIsClosing(false);
        Alert.alert('Could not switch topic', formatApiError(err));
      }
    },
    [
      activeProfileId,
      activeSessionId,
      closeSession,
      effectiveMode,
      router,
      setIsClosing,
      setShowWrongSubjectChip,
      setShowTopicSwitcher,
    ]
  );

  return {
    handleInputModeChange,
    handleNextProblem,
    navigateToSessionSummary,
    navigateToSummary,
    handleEndSession,
    handleQuickChip,
    handleMessageFeedback,
    handleSaveParkingLot,
    handleTopicSwitch,
  };
}
