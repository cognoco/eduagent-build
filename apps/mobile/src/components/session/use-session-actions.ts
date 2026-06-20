import { useCallback, useRef } from 'react';
import i18next from 'i18next';
// Alert import removed — all calls migrated to platformAlert [F-029]
import { platformAlert } from '../../lib/platform-alert';
import type {
  InputMode,
  HomeworkProblem,
  PendingCelebration,
  CelebrationReason,
} from '@eduagent/schemas';
import type { Router, Href } from 'expo-router';
import type { ChatMessage } from './ChatShell';
import type {
  useCloseSession,
  useRecordSystemPrompt,
  useRecordSessionEvent,
  useFlagSessionContent,
  useAddParkingLotItem,
  useSetSessionInputMode,
} from '../../hooks/use-sessions';
import { clearSessionRecoveryMarker } from '../../lib/session-recovery';
import * as SecureStore from '../../lib/secure-storage';
import { classifyApiError, recoveryActions } from '../../lib/format-api-error';
import { homeHrefForReturnTo } from '../../lib/navigation';
import { withProblemMode } from '../homework/problem-cards';
import {
  getInputModeKey,
  serializeMilestones,
  serializeCelebrations,
  quickChipPrompt,
  chipConfirmationMessage,
  type QuickChipId,
  type MessageFeedbackState,
} from './session-types';

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
    opts?: { isAutoSent?: boolean; imageUri?: string },
  ) => Promise<void>;
  syncHomeworkMetadata: (
    sessionId: string,
    problems: HomeworkProblem[],
    problemIndex: number,
  ) => Promise<void>;
  fetchFastCelebrations: () => Promise<PendingCelebration[]>;
  showConfirmation: (message: string) => void;
  onSessionClosed?: (event: {
    sessionId: string;
    wallClockSeconds: number;
    fastCelebrations: PendingCelebration[];
  }) => boolean;
  router: Router;
  returnTo?: string;
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
    onSessionClosed,
    router,
    returnTo,
  } = opts;
  const topicSwitchInFlightRef = useRef(false);

  const handleInputModeChange = useCallback(
    (nextInputMode: InputMode) => {
      const previousInputMode = inputMode;
      setInputMode(nextInputMode);

      // Persist preference so next session restores it.
      if (activeProfileId) {
        void SecureStore.setItemAsync(
          getInputModeKey(activeProfileId),
          nextInputMode,
        ).catch((err) =>
          console.warn('[Session] Failed to persist input mode:', err),
        );
      }

      if (!activeSessionId) {
        return;
      }
      void setSessionInputMode
        .mutateAsync({ inputMode: nextInputMode })
        .catch(() => {
          setInputMode(previousInputMode);
          showConfirmation(i18next.t('session.inputMode.saveError'));
        });
    },
    [
      activeProfileId,
      activeSessionId,
      inputMode,
      setInputMode,
      setSessionInputMode,
      showConfirmation,
    ],
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
          nextProblemIndex,
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

  const navigateToSessionSummary = useCallback(
    (filedSubjectId?: string, filedBookId?: string) => {
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
          sessionType:
            effectiveMode === 'homework'
              ? 'homework'
              : effectiveMode === 'freeform'
                ? 'freeform'
                : 'learning',
          ...(filedSubjectId ? { filedSubjectId } : {}),
          ...(filedBookId ? { filedBookId } : {}),
          ...(returnTo ? { returnTo } : {}),
        },
      } as Href);
    },
    [
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
      returnTo,
    ],
  );

  const navigateToSummary = useCallback(
    (
      sessionId: string,
      wallClockSeconds: number,
      fastCelebrations: PendingCelebration[],
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
          sessionType:
            effectiveMode === 'homework'
              ? 'homework'
              : effectiveMode === 'freeform'
                ? 'freeform'
                : 'learning',
          ...(returnTo ? { returnTo } : {}),
        },
      } as Href);
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
      returnTo,
    ],
  );

  const handleEndSession = useCallback(async () => {
    if (!activeSessionId || isClosing) return;

    // BUG-352: Set isClosing immediately so a second tap in the same render
    // frame cannot pass the guard.
    setIsClosing(true);

    // [F-029] Use platformAlert instead of Alert.alert — on React Native Web,
    // Alert.alert is a no-op that never invokes callbacks, leaving isClosing=true
    // permanently and trapping the user in "Wrapping up..." state.
    platformAlert(
      i18next.t('session.endPrompt.title'),
      '',
      [
        {
          text: i18next.t('common.continue'),
          style: 'cancel',
          onPress: () => setIsClosing(false),
        },
        {
          text: i18next.t('session.endPrompt.confirm'),
          onPress: async () => {
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            try {
              const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(
                  () => reject(new Error('Session close timed out')),
                  CLOSE_TIMEOUT_MS,
                );
              });
              const result = await Promise.race([
                closeSession.mutateAsync({
                  reason: 'user_ended',
                  summaryStatus: 'pending',
                  milestonesReached,
                }),
                timeoutPromise,
              ]);
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              if (
                onSessionClosed?.({
                  sessionId: activeSessionId,
                  wallClockSeconds: result.wallClockSeconds,
                  fastCelebrations: [],
                })
              ) {
                closedSessionRef.current = {
                  wallClockSeconds: result.wallClockSeconds,
                  fastCelebrations: [],
                };
                await clearSessionRecoveryMarker(activeProfileId);
                setIsClosing(false);
                return;
              }

              const fastCelebrations = await fetchFastCelebrations();
              await clearSessionRecoveryMarker(activeProfileId);

              // Store close result for deferred navigation
              closedSessionRef.current = {
                wallClockSeconds: result.wallClockSeconds,
                fastCelebrations,
              };

              if (effectiveMode === 'homework') {
                setShowFilingPrompt(true);
                setIsClosing(false);
              } else {
                navigateToSummary(
                  activeSessionId,
                  result.wallClockSeconds,
                  fastCelebrations,
                );
              }
            } catch (err: unknown) {
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              setIsClosing(false);
              const classified = classifyApiError(err);
              const actions = recoveryActions(classified, {
                retry: () => setIsClosing(false),
                goBack: () => setIsClosing(false),
                goHome: () =>
                  router.replace(
                    (returnTo
                      ? homeHrefForReturnTo(returnTo)
                      : '/(app)/home') as never,
                  ),
              });
              const buttons: Array<{
                text: string;
                style?: 'cancel' | 'destructive';
                onPress?: () => void;
              }> = [];
              if (actions.primary) {
                buttons.push({
                  text: actions.primary.label,
                  style: 'cancel',
                  onPress: actions.primary.onPress,
                });
              }
              if (actions.secondary) {
                buttons.push({
                  text: actions.secondary.label,
                  onPress: actions.secondary.onPress,
                });
              }
              platformAlert(
                i18next.t('session.endPrompt.errorTitle'),
                classified.message,
                buttons,
              );
            }
          },
        },
      ],
      { cancelable: true, onDismiss: () => setIsClosing(false) },
    );
  }, [
    activeSessionId,
    isClosing,
    closeSession,
    fetchFastCelebrations,
    activeProfileId,
    milestonesReached,
    effectiveMode,
    navigateToSummary,
    onSessionClosed,
    returnTo,
    router,
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
          platformAlert(
            i18next.t('session.parkingLot.startFirstTitle'),
            i18next.t('session.parkingLot.startFirstMessage'),
          );
          return;
        }
        setShowParkingLot(true);
        return;
      }

      const chipPrompt = quickChipPrompt(chip);

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
          // WI-373: send the intent token; the server owns the prompt text.
          await recordSystemPrompt.mutateAsync({ kind: 'quick_chip', chip });
        } catch (err) {
          console.warn(
            '[Session] Quick-chip system prompt failed to persist:',
            err,
          );
          // Best effort only. The visible prompt still continues below.
        }
      }

      if (sourceMessageId) {
        setConsumedQuickChipMessageId(sourceMessageId);
      }

      showConfirmation(chipConfirmationMessage(chip));

      await handleSend(chipPrompt);
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
    ],
  );

  const handleMessageFeedback = useCallback(
    async (message: ChatMessage, action: MessageFeedbackState) => {
      if (!message.eventId || !activeSessionId || isStreaming) return;

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

        // WI-373: send the intent token; the server owns the prompt text.
        await recordSystemPrompt.mutateAsync({
          kind: 'message_feedback',
          action,
          eventId: message.eventId,
        });
        setMessageFeedback((prev) => ({ ...prev, [message.id]: action }));
        showConfirmation(
          action === 'helpful'
            ? i18next.t('session.feedbackConfirm.helpful')
            : action === 'not_helpful'
              ? i18next.t('session.feedbackConfirm.notHelpful')
              : i18next.t('session.feedbackConfirm.incorrect'),
        );

        const followUpPrompt = followUpPromptByAction[action];
        if (followUpPrompt) {
          await handleSend(followUpPrompt);
        }
      } catch (err: unknown) {
        platformAlert(
          i18next.t('session.feedbackErrorTitle'),
          classifyApiError(err).message,
        );
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
    ],
  );

  const handleSaveParkingLot = useCallback(async () => {
    if (!activeSessionId) {
      platformAlert(
        i18next.t('session.parkingLot.startFirstTitle'),
        i18next.t('session.parkingLot.startFirstMessage'),
      );
      return;
    }

    if (!parkingLotDraft.trim()) return;

    try {
      await addParkingLotItem.mutateAsync({ question: parkingLotDraft.trim() });
      setParkingLotDraft('');
      showConfirmation(i18next.t('session.parkingLot.savedConfirmation'));
    } catch (err: unknown) {
      platformAlert(
        i18next.t('session.parkingLot.saveErrorTitle'),
        classifyApiError(err).message,
      );
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
      nextSubjectName: string,
    ) => {
      if (topicSwitchInFlightRef.current) return;
      topicSwitchInFlightRef.current = true;
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
        } as Href);
      } catch (err: unknown) {
        setIsClosing(false);
        platformAlert(
          i18next.t('session.topicSwitchErrorTitle'),
          classifyApiError(err).message,
        );
      } finally {
        topicSwitchInFlightRef.current = false;
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
    ],
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
