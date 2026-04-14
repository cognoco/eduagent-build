import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  AppState,
  View,
  Text,
  Pressable,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  HomeworkCaptureSource,
  HomeworkProblem,
  InputMode,
  PendingCelebration,
} from '@eduagent/schemas';
import {
  ChatShell,
  animateResponse,
  getModeConfig,
  getOpeningMessage,
  SessionTimer,
  QuestionCounter,
  LibraryPrompt,
  SessionInputModeToggle,
  QuotaExceededCard,
  type ChatMessage,
} from '../../../components/session';
import {
  useStreamMessage,
  useStartSession,
  useCloseSession,
  useSessionTranscript,
  useRecordSystemPrompt,
  useRecordSessionEvent,
  useSetSessionInputMode,
  useFlagSessionContent,
  useParkingLot,
  useAddParkingLotItem,
} from '../../../hooks/use-sessions';
import { useClassifySubject } from '../../../hooks/use-classify-subject';
import { useResolveSubject } from '../../../hooks/use-resolve-subject';
import { useFiling } from '../../../hooks/use-filing';
import { useStreaks } from '../../../hooks/use-streaks';
import { useOverallProgress } from '../../../hooks/use-progress';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import { useApiReachability } from '../../../hooks/use-api-reachability';
import { useCelebrationLevel } from '../../../hooks/use-settings';
import { useCelebration } from '../../../hooks/use-celebration';
import { useSubjects, useCreateSubject } from '../../../hooks/use-subjects';
import { useCurriculum } from '../../../hooks/use-curriculum';
import {
  celebrationForReason,
  createMilestoneTrackerStateFromMilestones,
  normalizeMilestoneTrackerState,
  useMilestoneTracker,
} from '../../../hooks/use-milestone-tracker';
import { Ionicons } from '@expo/vector-icons';
import {
  useApiClient,
  QuotaExceededError,
  type QuotaExceededDetails,
} from '../../../lib/api-client';
import { formatApiError } from '../../../lib/format-api-error';
import { useThemeColors } from '../../../lib/theme';
import { NoteInput } from '../../../components/library/NoteInput';
import { useUpsertNote } from '../../../hooks/use-notes';
import { getVoiceLocaleForLanguage } from '../../../lib/language-locales';
import { useProfile } from '../../../lib/profile';
import {
  clearSessionRecoveryMarker,
  readSessionRecoveryMarker,
  writeSessionRecoveryMarker,
} from '../../../lib/session-recovery';
import * as SecureStore from '../../../lib/secure-storage';
import {
  buildHomeworkSessionMetadata,
  parseHomeworkProblems,
  withProblemMode,
} from '../homework/problem-cards';
import {
  computePaceMultiplier,
  getInputModeKey,
  serializeMilestones,
  serializeCelebrations,
  isReconnectableSessionError,
  isTimeoutError,
  errorHasStatus,
  getContextualQuickChips,
  RECONNECT_PROMPT,
  TIMEOUT_PROMPT,
  CONFIRMATION_BY_CHIP,
  QUICK_CHIP_CONFIG,
  type QuickChipId,
  type MessageFeedbackState,
  type PendingSubjectResolution,
} from './session-types';

function MilestoneDots({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <View className="ms-2 flex-row items-center gap-1" testID="milestone-dots">
      {Array.from({ length: Math.min(count, 6) }).map((_, index) => (
        <View key={index} className="w-2 h-2 rounded-full bg-primary" />
      ))}
    </View>
  );
}

export default function SessionScreen() {
  const {
    mode,
    subjectId,
    subjectName,
    sessionId: routeSessionId,
    topicId,
    topicName,
    problemText,
    homeworkProblems,
    ocrText,
    captureSource,
    rawInput,
  } = useLocalSearchParams<{
    mode?: string;
    subjectId?: string;
    subjectName?: string;
    sessionId?: string;
    topicId?: string;
    topicName?: string;
    problemText?: string;
    homeworkProblems?: string;
    ocrText?: string;
    captureSource?: HomeworkCaptureSource;
    rawInput?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const colors = useThemeColors();

  const effectiveMode = mode ?? 'freeform';
  const normalizedOcrText = Array.isArray(ocrText) ? ocrText[0] : ocrText;
  const normalizedCaptureSource = Array.isArray(captureSource)
    ? captureSource[0]
    : captureSource;
  const homeworkCaptureSource: HomeworkCaptureSource | undefined =
    normalizedCaptureSource === 'camera' ||
    normalizedCaptureSource === 'gallery'
      ? normalizedCaptureSource
      : undefined;
  const initialHomeworkProblems = useMemo(
    () =>
      effectiveMode === 'homework'
        ? parseHomeworkProblems(homeworkProblems, problemText)
        : [],
    [effectiveMode, homeworkProblems, problemText]
  );
  const initialProblemText =
    initialHomeworkProblems[0]?.text ?? problemText ?? undefined;
  const modeConfig = getModeConfig(effectiveMode);
  const { data: streak } = useStreaks();
  const { data: overallProgress } = useOverallProgress();
  const { data: celebrationLevel = 'all' } = useCelebrationLevel();
  const showBookLink =
    effectiveMode !== 'homework' &&
    (overallProgress?.totalTopicsCompleted ?? 0) > 0;
  const sessionExperience = streak?.longestStreak ?? 0;
  const openingContent = getOpeningMessage(
    effectiveMode,
    sessionExperience,
    initialProblemText,
    topicName ?? undefined,
    subjectName ?? undefined,
    rawInput ?? undefined
  );

  const { isOffline } = useNetworkStatus();
  const { isApiReachable, isChecked: apiChecked } = useApiReachability();

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'assistant', content: openingContent },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [escalationRung, setEscalationRung] = useState(1);
  const [isClosing, setIsClosing] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    routeSessionId ?? null
  );
  const [pendingClassification, setPendingClassification] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [classifiedSubject, setClassifiedSubject] = useState<{
    subjectId: string;
    subjectName: string;
  } | null>(null);
  const [pendingSubjectResolution, setPendingSubjectResolution] =
    useState<PendingSubjectResolution | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('text');
  // CR-9: Guard so profile refetches don't overwrite the user's in-session choice.
  const hasRestoredInputModeRef = useRef(false);

  // Restore the user's last-used input mode from SecureStore on mount.
  useEffect(() => {
    if (!activeProfile?.id) return;
    // CR-9: Only restore once — ignore subsequent profile refetches.
    if (hasRestoredInputModeRef.current) return;
    let cancelled = false;
    void SecureStore.getItemAsync(getInputModeKey(activeProfile.id))
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'voice' || stored === 'text') {
          setInputMode(stored);
        }
        hasRestoredInputModeRef.current = true;
      })
      .catch(() => {
        // Non-critical preference — silent fallback to 'text' default.
        hasRestoredInputModeRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id]);

  const [homeworkProblemsState, setHomeworkProblemsState] = useState<
    HomeworkProblem[]
  >(initialHomeworkProblems);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [homeworkMode, setHomeworkMode] = useState<
    'help_me' | 'check_answer' | undefined
  >(undefined);
  const [draftText, setDraftText] = useState('');
  const [resumedBanner, setResumedBanner] = useState(false);
  const [responseHistory, setResponseHistory] = useState<
    Array<{ actualSeconds: number; expectedMinutes: number }>
  >([]);
  const [showParkingLot, setShowParkingLot] = useState(false);
  const [parkingLotDraft, setParkingLotDraft] = useState('');
  const [showTopicSwitcher, setShowTopicSwitcher] = useState(false);
  const [topicSwitcherSubjectId, setTopicSwitcherSubjectId] = useState<
    string | null
  >(subjectId ?? null);
  const [showWrongSubjectChip, setShowWrongSubjectChip] = useState(false);
  const [consumedQuickChipMessageId, setConsumedQuickChipMessageId] = useState<
    string | null
  >(null);
  const [messageFeedback, setMessageFeedback] = useState<
    Record<string, MessageFeedbackState>
  >({});
  const [confirmationToast, setConfirmationToast] = useState<string | null>(
    null
  );
  const [notePromptOffered, setNotePromptOffered] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showFilingPrompt, setShowFilingPrompt] = useState(false);
  const [filingDismissed, setFilingDismissed] = useState(false);
  const [quotaError, setQuotaError] = useState<QuotaExceededDetails | null>(
    null
  );

  const sessionNoteSavedRef = useRef(false);
  const closedSessionRef = useRef<{
    wallClockSeconds: number;
    fastCelebrations: PendingCelebration[];
  } | null>(null);
  const animationCleanupRef = useRef<(() => void) | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAiAtRef = useRef<number | null>(null);
  const lastExpectedMinutesRef = useRef(10);
  const hasAutoSentRef = useRef(false);
  const hasHydratedRecoveryRef = useRef(false);
  const queuedProblemTextRef = useRef<string | null>(null);
  const localMessageIdRef = useRef(0);
  const lastRetryPayloadRef = useRef<{
    text: string;
    options?: {
      sessionSubjectId?: string;
      sessionSubjectName?: string;
    };
  } | null>(null);

  const transcript = useSessionTranscript(routeSessionId ?? '');
  const recordSystemPrompt = useRecordSystemPrompt(activeSessionId ?? '');
  const recordSessionEvent = useRecordSessionEvent(activeSessionId ?? '');
  const setSessionInputMode = useSetSessionInputMode(activeSessionId ?? '');
  const flagSessionContent = useFlagSessionContent(activeSessionId ?? '');
  const parkingLot = useParkingLot(activeSessionId ?? '');
  const addParkingLotItem = useAddParkingLotItem(activeSessionId ?? '');
  const { data: availableSubjects = [] } = useSubjects();
  const createSubject = useCreateSubject();
  const {
    milestonesReached,
    trackerState,
    trackExchange,
    hydrate,
    reset: resetMilestones,
  } = useMilestoneTracker();
  // BUG-350: Ref mirrors trackerState so silence timer always reads the
  // current value, not a stale closure capture from when setTimeout was created.
  const trackerStateRef = useRef(trackerState);
  trackerStateRef.current = trackerState;
  const { CelebrationOverlay, trigger } = useCelebration({
    celebrationLevel,
    audience: 'child',
  });

  // Reset state when screen regains focus (prevents stale state loop)
  useFocusEffect(
    useCallback(() => {
      animationCleanupRef.current?.();
      setMessages([
        { id: 'opening', role: 'assistant', content: openingContent },
      ]);
      setIsStreaming(false);
      setExchangeCount(0);
      setEscalationRung(1);
      setIsClosing(false);
      setActiveSessionId(routeSessionId ?? null);
      setPendingClassification(false);
      setClassifyError(null);
      setClassifiedSubject(null);
      setPendingSubjectResolution(null);
      // BUG-357: Don't reset inputMode to 'text' — preserve the user's
      // stored preference (restored from SecureStore on mount).
      setDraftText('');
      setResumedBanner(false);
      setResponseHistory([]);
      setShowParkingLot(false);
      setParkingLotDraft('');
      setShowTopicSwitcher(false);
      setTopicSwitcherSubjectId(subjectId ?? null);
      setShowWrongSubjectChip(false);
      setConsumedQuickChipMessageId(null);
      setMessageFeedback({});
      setConfirmationToast(null);
      setNotePromptOffered(false);
      setShowNoteInput(false);
      setShowFilingPrompt(false);
      setFilingDismissed(false);
      setQuotaError(null);
      closedSessionRef.current = null;
      sessionNoteSavedRef.current = false;
      hasHydratedRecoveryRef.current = false;
      resetMilestones();
      setHomeworkProblemsState(initialHomeworkProblems);
      setCurrentProblemIndex(0);
      setHomeworkMode(undefined);
      hasAutoSentRef.current = false;
    }, [
      openingContent,
      resetMilestones,
      routeSessionId,
      initialHomeworkProblems,
      subjectId,
    ])
  );

  useEffect(() => {
    return () => {
      animationCleanupRef.current?.();
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!confirmationToast) return undefined;

    const timer = setTimeout(() => {
      setConfirmationToast(null);
    }, 2200);

    return () => clearTimeout(timer);
  }, [confirmationToast]);

  const effectiveSubjectId = classifiedSubject?.subjectId ?? subjectId ?? '';
  const effectiveSubjectName = classifiedSubject?.subjectName ?? subjectName;
  const activeSubject = availableSubjects.find(
    (availableSubject) => availableSubject.id === effectiveSubjectId
  );
  const languageVoiceLocale =
    activeSubject?.pedagogyMode === 'four_strands'
      ? getVoiceLocaleForLanguage(activeSubject.languageCode)
      : undefined;
  const switcherSubjectId = topicSwitcherSubjectId ?? effectiveSubjectId;
  const switcherCurriculum = useCurriculum(switcherSubjectId);

  useEffect(() => {
    if (effectiveSubjectId) {
      setTopicSwitcherSubjectId((current) => current ?? effectiveSubjectId);
      return;
    }
    if (availableSubjects.length > 0) {
      setTopicSwitcherSubjectId(
        (current) => current ?? availableSubjects[0]!.id
      );
    }
  }, [availableSubjects, effectiveSubjectId]);

  const apiClient = useApiClient();
  const classifySubject = useClassifySubject();
  const resolveSubject = useResolveSubject();
  const upsertNote = useUpsertNote(effectiveSubjectId || undefined, undefined);
  const filing = useFiling();
  const startSession = useStartSession(effectiveSubjectId);
  const closeSession = useCloseSession(activeSessionId ?? '');
  const { stream: streamMessage } = useStreamMessage(activeSessionId ?? '');
  const activeHomeworkProblem = homeworkProblemsState[currentProblemIndex];
  const sessionExpired =
    !!routeSessionId && errorHasStatus(transcript.error, 404);

  const showConfirmation = useCallback((message: string) => {
    setConfirmationToast(message);
  }, []);

  const createLocalMessageId = useCallback((prefix: 'user' | 'ai') => {
    localMessageIdRef.current += 1;
    return `${prefix}-${Date.now()}-${localMessageIdRef.current}`;
  }, []);

  const syncHomeworkMetadata = useCallback(
    async (
      targetSessionId: string,
      problems: HomeworkProblem[],
      problemIndex: number
    ) => {
      if (effectiveMode !== 'homework' || problems.length === 0) {
        return;
      }

      const res = await apiClient.sessions[':sessionId'][
        'homework-state'
      ].$post({
        param: { sessionId: targetSessionId },
        json: {
          metadata: buildHomeworkSessionMetadata(
            problems,
            problemIndex,
            normalizedOcrText,
            homeworkCaptureSource
          ),
        },
      });

      if (!res.ok) {
        throw new Error(`Homework state sync failed: ${res.status}`);
      }
    },
    [apiClient, effectiveMode, normalizedOcrText, homeworkCaptureSource]
  );

  useEffect(() => {
    if (!routeSessionId || !transcript.data) return;

    const transcriptMessages = transcript.data.exchanges
      .filter((entry, index, all) => {
        if (entry.role !== 'user') return true;
        return index !== all.length - 1 || all[index + 1]?.role === 'assistant';
      })
      .map((entry, index) => ({
        id: `${entry.isSystemPrompt ? 'system' : entry.role}-${index}-${
          entry.timestamp
        }`,
        role:
          entry.role === 'assistant'
            ? ('assistant' as const)
            : ('user' as const),
        content: entry.content,
        eventId: entry.eventId,
        isSystemPrompt: entry.isSystemPrompt,
        escalationRung: entry.escalationRung,
      }));

    setMessages(
      transcriptMessages.length > 0
        ? transcriptMessages
        : [{ id: 'opening', role: 'assistant', content: openingContent }]
    );
    setExchangeCount(transcript.data.session.exchangeCount);
    setEscalationRung(
      transcript.data.exchanges
        .filter((entry) => entry.role === 'assistant' && !entry.isSystemPrompt)
        .at(-1)?.escalationRung ?? 1
    );
    setInputMode(transcript.data.session.inputMode ?? 'text');
    setActiveSessionId(routeSessionId);
    setResumedBanner(true);
  }, [openingContent, routeSessionId, transcript.data]);

  useEffect(() => {
    if (!sessionExpired) return;

    setMessages([
      {
        id: 'session-expired',
        role: 'assistant',
        content: 'Session expired. Start a new one to keep going.',
        isSystemPrompt: true,
        kind: 'session_expired',
      },
    ]);
    setResumedBanner(false);
  }, [sessionExpired]);

  useEffect(() => {
    if (!routeSessionId || hasHydratedRecoveryRef.current) return;

    let cancelled = false;

    void (async () => {
      try {
        const marker = await readSessionRecoveryMarker(activeProfile?.id);
        if (cancelled || hasHydratedRecoveryRef.current) return;

        if (marker?.sessionId === routeSessionId && marker.milestoneTracker) {
          hydrate(normalizeMilestoneTrackerState(marker.milestoneTracker));
          hasHydratedRecoveryRef.current = true;
          return;
        }

        const transcriptMilestones =
          transcript.data?.session.milestonesReached ?? [];
        if (transcriptMilestones.length > 0) {
          hydrate(
            createMilestoneTrackerStateFromMilestones(transcriptMilestones)
          );
          hasHydratedRecoveryRef.current = true;
        }
      } catch {
        /* SecureStore unavailable — skip recovery hydration */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeProfile?.id,
    hydrate,
    routeSessionId,
    transcript.data?.session.milestonesReached,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        (nextState === 'background' || nextState === 'inactive') &&
        activeSessionId
      ) {
        void writeSessionRecoveryMarker(
          {
            sessionId: activeSessionId,
            profileId: activeProfile?.id ?? undefined,
            subjectId: effectiveSubjectId || undefined,
            subjectName: effectiveSubjectName || undefined,
            topicId: topicId ?? undefined,
            mode: effectiveMode,
            milestoneTracker: trackerState,
            updatedAt: new Date().toISOString(),
          },
          activeProfile?.id
        ).catch(() => undefined);
      }
    });

    return () => subscription.remove();
  }, [
    activeSessionId,
    activeProfile?.id,
    effectiveMode,
    effectiveSubjectId,
    effectiveSubjectName,
    trackerState,
    topicId,
  ]);

  const scheduleSilencePrompt = useCallback(
    (sessionIdToUse: string, expectedResponseMinutes: number) => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      const thresholdMinutes = Math.min(
        20,
        Math.max(
          2,
          expectedResponseMinutes * computePaceMultiplier(responseHistory)
        )
      );

      silenceTimerRef.current = setTimeout(async () => {
        if (draftText.trim()) return;

        const prompt =
          "Still working on it? Take your time - I'm here when you're ready.";

        setMessages((prev) => {
          if (prev.some((message) => message.id === 'silence-prompt')) {
            return prev;
          }
          return [
            ...prev,
            {
              id: 'silence-prompt',
              role: 'assistant',
              content: prompt,
              isSystemPrompt: true,
            },
          ];
        });

        try {
          await recordSystemPrompt.mutateAsync({ content: prompt });
        } catch {
          // Best effort only.
        }

        await writeSessionRecoveryMarker(
          {
            sessionId: sessionIdToUse,
            profileId: activeProfile?.id ?? undefined,
            subjectId: effectiveSubjectId || undefined,
            subjectName: effectiveSubjectName || undefined,
            topicId: topicId ?? undefined,
            mode: effectiveMode,
            milestoneTracker: trackerStateRef.current,
            updatedAt: new Date().toISOString(),
          },
          activeProfile?.id
        ).catch(() => undefined);
      }, thresholdMinutes * 60 * 1000);
    },
    [
      activeProfile?.id,
      draftText,
      effectiveMode,
      effectiveSubjectId,
      effectiveSubjectName,
      recordSystemPrompt,
      responseHistory,
      topicId,
    ]
  );

  const ensureSession = useCallback(
    async (overrideSubjectId?: string): Promise<string | null> => {
      if (activeSessionId) return activeSessionId;

      const sid = overrideSubjectId ?? effectiveSubjectId;
      if (!sid) return null;

      const sessionType =
        effectiveMode === 'homework'
          ? ('homework' as const)
          : ('learning' as const);

      // Errors propagate to continueWithMessage's catch block, which handles
      // them with proper user-facing UI (error messages, reconnect prompts).
      let newId: string;
      if (overrideSubjectId) {
        // Use API client directly — useStartSession's URL param may be
        // stale when called in the same render cycle as setClassifiedSubject.
        const res = await apiClient.subjects[':subjectId'].sessions.$post({
          param: { subjectId: overrideSubjectId },
          json: {
            subjectId: overrideSubjectId,
            topicId: topicId ?? undefined,
            sessionType,
            inputMode,
            ...(rawInput ? { rawInput } : {}),
            ...(effectiveMode === 'homework' && homeworkProblemsState.length > 0
              ? {
                  metadata: {
                    inputMode,
                    homework: buildHomeworkSessionMetadata(
                      homeworkProblemsState,
                      currentProblemIndex,
                      normalizedOcrText,
                      homeworkCaptureSource
                    ),
                  },
                }
              : {}),
          },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`API error ${res.status}: ${body || res.statusText}`);
        }
        const data = (await res.json()) as { session: { id: string } };
        newId = data.session.id;
      } else {
        const result = await startSession.mutateAsync({
          subjectId: sid,
          topicId: topicId ?? undefined,
          sessionType,
          inputMode,
          ...(rawInput ? { rawInput } : {}),
          ...(effectiveMode === 'homework' && homeworkProblemsState.length > 0
            ? {
                metadata: {
                  inputMode,
                  homework: buildHomeworkSessionMetadata(
                    homeworkProblemsState,
                    currentProblemIndex,
                    normalizedOcrText,
                    homeworkCaptureSource
                  ),
                },
              }
            : {}),
        });
        newId = result.session.id;
      }
      setActiveSessionId(newId);
      if (effectiveMode === 'homework' && homeworkProblemsState.length > 0) {
        try {
          await syncHomeworkMetadata(
            newId,
            homeworkProblemsState,
            currentProblemIndex
          );
        } catch {
          // Keep the session alive even if homework metadata sync fails.
        }
      }
      return newId;
    },
    [
      activeSessionId,
      // BUG-339: Removed activeProfile?.id — it is not read inside
      // ensureSession. Including it caused the callback (and every downstream
      // dependency like continueWithMessage) to be recreated on every profile
      // refetch, risking dropped in-flight state.
      effectiveSubjectId,
      topicId,
      effectiveMode,
      inputMode,
      apiClient,
      startSession,
      homeworkProblemsState,
      currentProblemIndex,
      normalizedOcrText,
      homeworkCaptureSource,
      syncHomeworkMetadata,
    ]
  );

  const handleInputModeChange = useCallback(
    (nextInputMode: InputMode) => {
      const previousInputMode = inputMode;
      setInputMode(nextInputMode);

      // Persist preference so next session restores it.
      if (activeProfile?.id) {
        void SecureStore.setItemAsync(
          getInputModeKey(activeProfile.id),
          nextInputMode
        ).catch(() => undefined);
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
      activeProfile?.id,
      activeSessionId,
      inputMode,
      setSessionInputMode,
      showConfirmation,
    ]
  );

  const openSubjectResolution = useCallback(
    (
      text: string,
      prompt: string,
      candidates: Array<{ subjectId: string; subjectName: string }>,
      suggestedSubjectName?: string | null,
      resolveSuggestions?: Array<{
        name: string;
        description: string;
        focus?: string;
      }>
    ) => {
      const dedupedCandidates = candidates.filter(
        (candidate, index, all) =>
          all.findIndex(
            (entry) =>
              entry.subjectId === candidate.subjectId &&
              entry.subjectName === candidate.subjectName
          ) === index
      );

      setPendingSubjectResolution({
        originalText: text,
        prompt,
        candidates: dedupedCandidates,
        suggestedSubjectName,
        resolveSuggestions,
      });
    },
    []
  );

  const continueWithMessage = useCallback(
    async (
      text: string,
      options?: {
        sessionSubjectId?: string;
        sessionSubjectName?: string;
      }
    ) => {
      let streamId: string | null = null;
      try {
        const sessionSubjectId = options?.sessionSubjectId;
        const sessionSubjectName = options?.sessionSubjectName;
        const currentHomeworkProblemId =
          effectiveMode === 'homework' ? activeHomeworkProblem?.id : undefined;
        const updatedProblems =
          effectiveMode === 'homework' && currentHomeworkProblemId
            ? withProblemMode(
                homeworkProblemsState,
                currentHomeworkProblemId,
                homeworkMode
              )
            : homeworkProblemsState;

        if (updatedProblems !== homeworkProblemsState) {
          setHomeworkProblemsState(updatedProblems);
        }

        // BUG-331: Update retry payload BEFORE ensureSession so that if
        // ensureSession fails and the user reconnects, we replay the correct
        // (current) message — not the payload from the previous send.
        lastRetryPayloadRef.current = {
          text,
          options,
        };

        const sid = await ensureSession(sessionSubjectId);
        if (!sid) {
          const hasSubject = !!(
            subjectId ||
            classifiedSubject ||
            sessionSubjectId
          );
          const errorMessage = hasSubject
            ? "Couldn't start your session. Check your connection and try again."
            : 'Please select a subject first so I can help you learn.';
          animationCleanupRef.current = animateResponse(
            errorMessage,
            setMessages,
            setIsStreaming
          );
          return;
        }

        await writeSessionRecoveryMarker(
          {
            sessionId: sid,
            profileId: activeProfile?.id ?? undefined,
            subjectId: (sessionSubjectId ?? effectiveSubjectId) || undefined,
            subjectName:
              sessionSubjectName ?? effectiveSubjectName ?? undefined,
            topicId: topicId ?? undefined,
            mode: effectiveMode,
            // CR-2: Read from ref so this callback doesn't re-create on every
            // milestone tracker tick (stale closure fix).
            milestoneTracker: trackerStateRef.current,
            updatedAt: new Date().toISOString(),
          },
          activeProfile?.id
        );

        if (effectiveMode === 'homework' && updatedProblems.length > 0) {
          try {
            await syncHomeworkMetadata(
              sid,
              updatedProblems,
              currentProblemIndex
            );
          } catch {
            // Don't block the tutoring exchange on metadata sync.
          }
        }

        streamId = createLocalMessageId('ai');
        const previousAiAt = lastAiAtRef.current;
        setMessages((prev) => [
          ...prev,
          { id: streamId!, role: 'assistant', content: '', streaming: true },
        ]);
        setIsStreaming(true);

        await streamMessage(
          text,
          (accumulated) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId ? { ...m, content: accumulated } : m
              )
            );
          },
          async (result) => {
            const { triggered, trackerState: nextTrackerState } = trackExchange(
              {
                userMessage: text,
                escalationRung: result.escalationRung,
              }
            );
            triggered.forEach((reason) => {
              trigger({
                celebration: celebrationForReason(reason),
                reason,
                detail: null,
              });
            });

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== streamId) return m;
                // Strip notePrompt JSON annotation from visible message text
                let content = m.content;
                if (result.notePrompt) {
                  content = content
                    .replace(
                      /\n?\{"notePrompt":\s*true(?:,\s*"postSession":\s*true)?\}\s*$/,
                      ''
                    )
                    .trimEnd();
                }
                return {
                  ...m,
                  content,
                  streaming: false,
                  eventId: result.aiEventId,
                  escalationRung: result.escalationRung,
                };
              })
            );
            setIsStreaming(false);
            setExchangeCount(result.exchangeCount);
            setEscalationRung(result.escalationRung);

            // Handle note prompt triggers
            if (result.notePrompt && !notePromptOffered) {
              setNotePromptOffered(true);
            }
            if (result.notePromptPostSession) {
              setShowNoteInput(true);
            }

            if (previousAiAt) {
              setResponseHistory((prev) => [
                ...prev,
                {
                  actualSeconds: Math.round((Date.now() - previousAiAt) / 1000),
                  expectedMinutes: lastExpectedMinutesRef.current,
                },
              ]);
            }
            const expectedResponseMinutes =
              result.expectedResponseMinutes ?? 10;
            lastExpectedMinutesRef.current = expectedResponseMinutes;
            lastAiAtRef.current = Date.now();
            scheduleSilencePrompt(sid, expectedResponseMinutes);
            await writeSessionRecoveryMarker(
              {
                sessionId: sid,
                profileId: activeProfile?.id ?? undefined,
                subjectId:
                  (sessionSubjectId ?? effectiveSubjectId) || undefined,
                subjectName:
                  sessionSubjectName ?? effectiveSubjectName ?? undefined,
                topicId: topicId ?? undefined,
                mode: effectiveMode,
                milestoneTracker: nextTrackerState,
                updatedAt: new Date().toISOString(),
              },
              activeProfile?.id
            );
          },
          sid,
          effectiveMode === 'homework' && homeworkMode
            ? { homeworkMode }
            : undefined
        );
      } catch (err: unknown) {
        // Detect quota before reconnect classification — QuotaExceededError is
        // never reconnectable and needs a structured card, not a text bubble.
        if (err instanceof QuotaExceededError) {
          setIsStreaming(false);
          setQuotaError(err.details);
          if (streamId) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamId
                  ? {
                      ...message,
                      content: '',
                      streaming: false,
                      kind: 'quota_exceeded' as const,
                      isSystemPrompt: true,
                    }
                  : message
              )
            );
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: createLocalMessageId('ai'),
                role: 'assistant',
                content: '',
                isSystemPrompt: true,
                kind: 'quota_exceeded' as const,
              },
            ]);
          }
          return;
        }

        const reconnectable = isReconnectableSessionError(err);
        const formattedError = formatApiError(err);
        // [3B.1] Classify: timeout -> specific message, network -> reconnect, fatal -> server msg
        const errorMessage = reconnectable
          ? isTimeoutError(err)
            ? TIMEOUT_PROMPT
            : RECONNECT_PROMPT
          : formattedError;

        setIsStreaming(false);
        if (streamId) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === streamId
                ? {
                    ...message,
                    content: errorMessage,
                    streaming: false,
                    kind: reconnectable ? 'reconnect_prompt' : undefined,
                    isSystemPrompt: reconnectable,
                  }
                : message
            )
          );
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: createLocalMessageId('ai'),
            role: 'assistant',
            content: errorMessage,
            isSystemPrompt: reconnectable,
            kind: reconnectable ? 'reconnect_prompt' : undefined,
          },
        ]);
      }
    },
    [
      activeHomeworkProblem,
      activeProfile?.id,
      classifiedSubject,
      createLocalMessageId,
      currentProblemIndex,
      effectiveMode,
      effectiveSubjectId,
      effectiveSubjectName,
      ensureSession,
      homeworkMode,
      homeworkProblemsState,
      notePromptOffered,
      scheduleSilencePrompt,
      streamMessage,
      subjectId,
      syncHomeworkMetadata,
      topicId,
      trackExchange,
      // CR-2: trackerState removed — reads trackerStateRef.current inside body.
      // CR-3: Removed duplicate createLocalMessageId entry.
      trigger,
    ]
  );

  const handleReconnect = useCallback(
    async (messageId: string) => {
      // CR-5: Also guard on quotaError — reconnecting into a quota wall just
      // replays the send that will fail again immediately.
      if (
        !lastRetryPayloadRef.current ||
        isStreaming ||
        sessionExpired ||
        quotaError
      ) {
        return;
      }

      const retryPayload = lastRetryPayloadRef.current;
      // Remove both the error message AND the user's preceding message to
      // prevent the AI from seeing a duplicate exchange (the replay via
      // continueWithMessage re-adds the user message to the transcript).
      setMessages((prev) => {
        const errorIndex = prev.findIndex((m) => m.id === messageId);
        if (errorIndex < 0) return prev;
        // The user message that triggered the failed stream is immediately
        // before the error AI message.
        const userIndex =
          errorIndex > 0 && prev[errorIndex - 1]?.role === 'user'
            ? errorIndex - 1
            : -1;
        return prev.filter((_, i) => i !== errorIndex && i !== userIndex);
      });
      await continueWithMessage(retryPayload.text, retryPayload.options);
    },
    [continueWithMessage, isStreaming, sessionExpired, quotaError]
  );

  const handleResolveSubject = useCallback(
    async (candidate: { subjectId: string; subjectName: string }) => {
      if (!pendingSubjectResolution || isStreaming || pendingClassification) {
        return;
      }

      setPendingSubjectResolution(null);
      setClassifiedSubject(candidate);
      setShowWrongSubjectChip(false);
      setMessages((prev) => [
        ...prev,
        {
          id: createLocalMessageId('ai'),
          role: 'assistant',
          content: `Got it, we're working on ${candidate.subjectName}.`,
          isSystemPrompt: true,
        },
      ]);
      await continueWithMessage(pendingSubjectResolution.originalText, {
        sessionSubjectId: candidate.subjectId,
        sessionSubjectName: candidate.subjectName,
      });
    },
    [
      continueWithMessage,
      createLocalMessageId,
      isStreaming,
      pendingClassification,
      pendingSubjectResolution,
    ]
  );

  // Create a new subject from a resolve API suggestion
  const handleCreateResolveSuggestion = useCallback(
    async (suggestion: {
      name: string;
      description: string;
      focus?: string;
    }) => {
      if (isStreaming || pendingClassification || !pendingSubjectResolution)
        return;

      const originalText = pendingSubjectResolution.originalText;
      setPendingSubjectResolution(null);
      setMessages((prev) => [
        ...prev,
        {
          id: createLocalMessageId('ai'),
          role: 'assistant',
          content: `Adding ${suggestion.name} and getting started...`,
          isSystemPrompt: true,
        },
      ]);

      try {
        const result = await createSubject.mutateAsync({
          name: suggestion.name,
          rawInput: suggestion.focus ?? originalText,
        });
        setClassifiedSubject({
          subjectId: result.subject.id,
          subjectName: result.subject.name,
        });
        setShowWrongSubjectChip(false);
        await continueWithMessage(originalText, {
          sessionSubjectId: result.subject.id,
          sessionSubjectName: result.subject.name,
        });
      } catch {
        showConfirmation(
          `Could not create ${suggestion.name}. Please try again or pick an existing subject.`
        );
      }
    },
    [
      continueWithMessage,
      createLocalMessageId,
      createSubject,
      isStreaming,
      pendingClassification,
      pendingSubjectResolution,
      showConfirmation,
    ]
  );

  // BUG-233: Create a new subject from the classifier's suggestion
  const handleCreateSuggestedSubject = useCallback(async () => {
    if (
      !pendingSubjectResolution?.suggestedSubjectName ||
      isStreaming ||
      pendingClassification
    ) {
      return;
    }

    const suggestedName = pendingSubjectResolution.suggestedSubjectName;
    const originalText = pendingSubjectResolution.originalText;

    setPendingSubjectResolution(null);
    setMessages((prev) => [
      ...prev,
      {
        id: createLocalMessageId('ai'),
        role: 'assistant',
        content: `Adding ${suggestedName} and getting started...`,
        isSystemPrompt: true,
      },
    ]);

    try {
      const result = await createSubject.mutateAsync({
        name: suggestedName,
        rawInput: originalText,
      });
      setClassifiedSubject({
        subjectId: result.subject.id,
        subjectName: result.subject.name,
      });
      setShowWrongSubjectChip(false);
      await continueWithMessage(originalText, {
        sessionSubjectId: result.subject.id,
        sessionSubjectName: result.subject.name,
      });
    } catch {
      showConfirmation(
        `Could not create ${suggestedName}. Please try again or pick an existing subject.`
      );
    }
  }, [
    continueWithMessage,
    createLocalMessageId,
    createSubject,
    isStreaming,
    pendingClassification,
    pendingSubjectResolution,
    showConfirmation,
  ]);

  const handleSend = useCallback(
    async (text: string, opts?: { isAutoSent?: boolean }) => {
      // CR-1: Guard on quotaError so programmatic callers (quick chips, homework
      // auto-send, queued problems) can't bypass the UI-disabled input guard.
      if (isStreaming || pendingClassification || quotaError) return;
      if (pendingSubjectResolution) {
        showConfirmation("Pick the subject first, then I'll keep going.");
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: createLocalMessageId('user'),
          role: 'user',
          content: text,
          isAutoSent: opts?.isAutoSent,
        },
      ]);
      setResumedBanner(false);

      // Classify subject from first message when none was provided.
      // Freeform sessions auto-pick the best match silently (no picker).
      let sessionSubjectId: string | undefined;
      let sessionSubjectName: string | undefined;
      if (!subjectId && !classifiedSubject && messages.length <= 1) {
        setPendingClassification(true);
        setClassifyError(null);
        try {
          const result = await classifySubject.mutateAsync({ text });
          if (!result.needsConfirmation && result.candidates.length === 1) {
            const candidate = result.candidates[0]!;
            setClassifiedSubject({
              subjectId: candidate.subjectId,
              subjectName: candidate.subjectName,
            });
            setShowWrongSubjectChip(false);
            sessionSubjectId = candidate.subjectId;
            sessionSubjectName = candidate.subjectName;
            setMessages((prev) => [
              ...prev,
              {
                id: createLocalMessageId('ai'),
                role: 'assistant',
                content: `Got it, this sounds like ${candidate.subjectName}.`,
                isSystemPrompt: true,
              },
            ]);
          } else if (effectiveMode === 'freeform') {
            // BUG-31: When multiple candidates exist, don't silently pick —
            // ask the user which subject they meant. Single-candidate or
            // zero-candidate cases still auto-pick for a frictionless start.
            if (result.candidates.length > 1) {
              const freeformCandidates = result.candidates.map((c) => ({
                subjectId: c.subjectId,
                subjectName: c.subjectName,
              }));
              const promptMessage = `This sounds like it could be ${freeformCandidates
                .slice(0, 3)
                .map((c) => c.subjectName)
                .join(' or ')}. Which one are we working on?`;
              openSubjectResolution(
                text,
                promptMessage,
                freeformCandidates,
                result.suggestedSubjectName
              );
              return;
            }
            // Single candidate or fallback to first enrolled subject
            const best =
              result.candidates[0] ??
              (availableSubjects[0]
                ? {
                    subjectId: availableSubjects[0].id,
                    subjectName: availableSubjects[0].name,
                  }
                : undefined);
            if (best) {
              setClassifiedSubject({
                subjectId: best.subjectId,
                subjectName: best.subjectName,
              });
              setShowWrongSubjectChip(true);
              sessionSubjectId = best.subjectId;
              sessionSubjectName = best.subjectName;
            }
            // If no candidates at all, proceed without subject —
            // continueWithMessage will show an appropriate error.
          } else {
            const subjectCandidates =
              result.candidates.length > 0
                ? result.candidates.map((candidate) => ({
                    subjectId: candidate.subjectId,
                    subjectName: candidate.subjectName,
                  }))
                : availableSubjects.map((candidate) => ({
                    subjectId: candidate.id,
                    subjectName: candidate.name,
                  }));

            if (subjectCandidates[0]) {
              setTopicSwitcherSubjectId(subjectCandidates[0].subjectId);
            }
            setShowWrongSubjectChip(false);

            // BUG-233: When the classifier suggests a new subject and no enrolled
            // subject matched, show the suggestion instead of a dead-end message
            const suggested = result.suggestedSubjectName ?? null;
            let promptMessage: string;
            if (result.candidates.length > 1) {
              promptMessage = `This sounds like it could be ${subjectCandidates
                .slice(0, 3)
                .map((candidate) => candidate.subjectName)
                .join(' or ')}. Which one are we working on?`;
            } else if (suggested && result.candidates.length === 0) {
              promptMessage =
                subjectCandidates.length > 0
                  ? `This sounds like ${suggested}. Pick a subject below, or tap "+ ${suggested}" to add it.`
                  : `This sounds like ${suggested}. Tap below to add it and start learning.`;
            } else if (
              result.candidates.length === 0 &&
              subjectCandidates.length === 0
            ) {
              // BUG-233: No enrolled subjects AND classifier failed to suggest —
              // fall back to subjects.resolve for rich LLM suggestions
              try {
                const resolveResult = await resolveSubject.mutateAsync({
                  rawInput: text,
                });
                const suggestions = resolveResult.suggestions ?? [];
                const resolvePrompt =
                  resolveResult.displayMessage ||
                  'Pick a subject that fits, or create your own.';
                openSubjectResolution(
                  text,
                  resolvePrompt,
                  subjectCandidates,
                  null,
                  suggestions
                );
              } catch {
                openSubjectResolution(
                  text,
                  "I couldn't figure out the subject. You can create a new one below.",
                  subjectCandidates
                );
              }
              return;
            } else {
              promptMessage =
                subjectCandidates.length > 0
                  ? 'Pick the subject that fits best:'
                  : "I couldn't place that yet. Pick the closest subject and we'll get moving.";
            }

            openSubjectResolution(
              text,
              promptMessage,
              subjectCandidates,
              suggested
            );
            return;
          }
        } catch {
          if (effectiveMode === 'freeform') {
            // BUG-31: When classification fails and there are multiple enrolled
            // subjects, show a picker instead of silently picking the first one.
            if (availableSubjects.length > 1) {
              const fallbackCandidates = availableSubjects.map((s) => ({
                subjectId: s.id,
                subjectName: s.name,
              }));
              openSubjectResolution(
                text,
                "I couldn't figure out the subject. Which one fits?",
                fallbackCandidates
              );
              return;
            }
            // Single enrolled subject — auto-pick with "wrong subject?" chip
            const fallback = availableSubjects[0];
            if (fallback) {
              setClassifiedSubject({
                subjectId: fallback.id,
                subjectName: fallback.name,
              });
              setShowWrongSubjectChip(true);
              sessionSubjectId = fallback.id;
              sessionSubjectName = fallback.name;
            }
          } else {
            const fallbackCandidates = availableSubjects.map((candidate) => ({
              subjectId: candidate.id,
              subjectName: candidate.name,
            }));
            setShowWrongSubjectChip(false);

            if (fallbackCandidates.length > 0) {
              setClassifyError(
                "Could not identify the subject automatically. Pick one below and we'll keep going."
              );
              openSubjectResolution(
                text,
                'Pick the subject that fits best:',
                fallbackCandidates
              );
            } else {
              // No enrolled subjects — try resolve for suggestions
              try {
                const resolveResult = await resolveSubject.mutateAsync({
                  rawInput: text,
                });
                openSubjectResolution(
                  text,
                  resolveResult.displayMessage ||
                    'Pick a subject that fits, or create your own.',
                  [],
                  null,
                  resolveResult.suggestions ?? []
                );
              } catch {
                setClassifyError(
                  'Could not identify the subject. Create a new subject to get started.'
                );
                openSubjectResolution(
                  text,
                  "I couldn't figure out the subject. You can create a new one below.",
                  []
                );
              }
            }
            return;
          }
        } finally {
          setPendingClassification(false);
        }
      }

      await continueWithMessage(text, {
        sessionSubjectId,
        sessionSubjectName,
      });
    },
    [
      isStreaming,
      pendingClassification,
      // CR-1: quotaError added so the callback re-creates when quota state changes.
      quotaError,
      pendingSubjectResolution,
      createLocalMessageId,
      subjectId,
      classifiedSubject,
      messages.length,
      effectiveMode,
      classifySubject,
      resolveSubject,
      availableSubjects,
      continueWithMessage,
      openSubjectResolution,
      showConfirmation,
    ]
  );

  useEffect(() => {
    if (!queuedProblemTextRef.current) {
      return undefined;
    }

    const queuedProblemText = queuedProblemTextRef.current;
    queuedProblemTextRef.current = null;
    const timer = setTimeout(() => {
      // BUG-373: Mark queued multi-problem sends as auto-sent so the
      // voice/text toggle stays visible until the user deliberately types.
      void handleSend(queuedProblemText, { isAutoSent: true });
    }, 0);

    return () => clearTimeout(timer);
  }, [currentProblemIndex, handleSend]);

  useEffect(() => {
    if (problemText && !routeSessionId && !hasAutoSentRef.current) {
      hasAutoSentRef.current = true;
      const timer = setTimeout(() => {
        // BUG-373: Mark homework auto-send as auto-sent
        void handleSend(problemText, { isAutoSent: true });
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [problemText, handleSend, routeSessionId]);

  const fetchFastCelebrations = useCallback(async (): Promise<
    PendingCelebration[]
  > => {
    try {
      const startedAt = Date.now();

      while (Date.now() - startedAt < 3000) {
        const res = await apiClient.celebrations.pending.$get();
        if (res.ok) {
          const data = await res.json();
          if (data.pendingCelebrations.length > 0) {
            await apiClient.celebrations.seen.$post({
              json: { viewer: 'child' },
            });
            return data.pendingCelebrations;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      return [];
    } catch (error) {
      console.error('[Session] Failed to fetch celebrations:', error);
      return [];
    }
  }, [apiClient]);

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
      } catch {
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
  ]);

  const handleEndSession = useCallback(async () => {
    if (!activeSessionId || isClosing) return;

    // BUG-352: Set isClosing immediately — before Alert.alert renders — so a
    // second tap in the same render frame cannot pass the guard and produce a
    // duplicate confirmation dialog.
    setIsClosing(true);

    Alert.alert(
      'Ready to wrap up?',
      'Keep going or finish this session now.',
      [
        {
          text: 'Keep Going',
          style: 'cancel',
          onPress: () => setIsClosing(false),
        },
        {
          text: "I'm Done",
          onPress: async () => {
            try {
              const result = await closeSession.mutateAsync({
                reason: 'user_ended',
                summaryStatus: 'pending',
                milestonesReached,
              });
              const fastCelebrations = await fetchFastCelebrations();
              await clearSessionRecoveryMarker(activeProfile?.id);

              // Store close result for deferred navigation
              closedSessionRef.current = {
                wallClockSeconds: result.wallClockSeconds,
                fastCelebrations,
              };

              // Freeform/homework: show filing prompt before navigating
              if (
                effectiveMode === 'freeform' ||
                effectiveMode === 'homework'
              ) {
                setShowFilingPrompt(true);
              } else {
                router.replace({
                  pathname: `/session-summary/${activeSessionId}`,
                  params: {
                    subjectName: effectiveSubjectName ?? '',
                    exchangeCount: String(exchangeCount),
                    escalationRung: String(escalationRung),
                    subjectId: effectiveSubjectId ?? '',
                    topicId: topicId ?? '',
                    wallClockSeconds: String(result.wallClockSeconds),
                    milestones: serializeMilestones(milestonesReached),
                    fastCelebrations: serializeCelebrations(fastCelebrations),
                    sessionType: 'learning',
                  },
                } as never);
              }
            } catch (err: unknown) {
              // R-2: Do NOT reset isClosing here — keep End Session button
              // disabled while the Alert is visible. Reset inside the callback.
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
      // BUG-352: Reset isClosing when the dialog is dismissed without choosing
      // (e.g. Android back button). Without this the "I'm Done" button stays
      // permanently disabled after a dismiss.
      { cancelable: true, onDismiss: () => setIsClosing(false) }
    );
  }, [
    activeSessionId,
    isClosing,
    closeSession,
    router,
    effectiveSubjectName,
    effectiveSubjectId,
    topicId,
    exchangeCount,
    escalationRung,
    fetchFastCelebrations,
    activeProfile?.id,
    milestonesReached,
    effectiveMode,
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
        } catch {
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
  }, [activeSessionId, addParkingLotItem, parkingLotDraft, showConfirmation]);

  const handleTopicSwitch = useCallback(
    async (
      nextTopicId: string,
      nextSubjectId: string,
      nextSubjectName: string
    ) => {
      try {
        if (activeSessionId) {
          await closeSession.mutateAsync({
            reason: 'user_ended',
            summaryStatus: 'skipped',
          });
          await clearSessionRecoveryMarker(activeProfile?.id);
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
        Alert.alert('Could not switch topic', formatApiError(err));
      }
    },
    [activeProfile?.id, activeSessionId, closeSession, effectiveMode, router]
  );

  // BUG-358: Show End Session immediately for resumed sessions — the session
  // already exists, so the button should be available even before the transcript
  // loads and sets exchangeCount > 0.
  const showEndSession = exchangeCount > 0 || !!routeSessionId;

  // BUG-373: Exclude auto-sent messages (homework OCR, queued multi-problem)
  // so the voice/text toggle stays visible until the user deliberately types.
  const userMessageCount = useMemo(
    () => messages.filter((m) => m.role === 'user' && !m.isAutoSent).length,
    [messages]
  );
  const latestAiMessageId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === 'assistant' && !message.streaming)
        ?.id ?? null,
    [messages]
  );

  const endSessionButton = showEndSession ? (
    <Pressable
      onPress={handleEndSession}
      disabled={isClosing || isStreaming}
      className="ms-2 px-3 py-2 rounded-button bg-surface-elevated min-h-[44px] items-center justify-center"
      testID="end-session-button"
      accessibilityLabel="I'm done"
      accessibilityRole="button"
    >
      <Text className="text-body-sm font-semibold text-text-secondary">
        {isClosing ? 'Wrapping up...' : "I'm Done"}
      </Text>
    </Pressable>
  ) : null;

  const agencyLabel = escalationRung >= 3 ? 'Guided' : 'Independent';
  const agencyBadge = (
    <Pressable
      onPress={() =>
        Alert.alert(
          agencyLabel === 'Guided' ? 'Guided mode' : 'Independent mode',
          agencyLabel === 'Guided'
            ? "I'm giving more structure right now because the conversation needed extra support."
            : "I'm mostly letting you drive and checking in with lighter guidance."
        )
      }
      className="ms-2 px-3 py-2 rounded-button bg-surface-elevated min-h-[44px] items-center justify-center"
      accessibilityRole="button"
      accessibilityLabel={`Session mode: ${agencyLabel}`}
      testID="agency-badge"
    >
      <Text className="text-body-sm font-semibold text-text-secondary">
        {agencyLabel}
      </Text>
    </Pressable>
  );

  const headerRight = (
    <View className="flex-row items-center">
      {modeConfig.showTimer && <SessionTimer />}
      {agencyBadge}
      <MilestoneDots count={milestonesReached.length} />
      {endSessionButton}
    </View>
  );

  const subtitle = pendingClassification
    ? 'Figuring out what this is about...'
    : classifyError
    ? classifyError
    : sessionExpired
    ? 'Session expired - start a new one.'
    : resumedBanner
    ? 'Welcome back - your session is ready.'
    : apiChecked && !isApiReachable
    ? 'Server unreachable - messages may fail'
    : modeConfig.subtitle;

  const sessionToolAccessory = (
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

  const subjectResolutionAccessory = pendingSubjectResolution ? (
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
  ) : null;

  const homeworkModeChips =
    effectiveMode === 'homework' ? (
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
                homeworkMode === 'help_me'
                  ? 'bg-primary'
                  : 'bg-surface-elevated'
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
    ) : undefined;

  const sessionAccessory = (
    <>
      {subjectResolutionAccessory}
      {homeworkModeChips}
    </>
  );

  const renderMessageActions = (message: ChatMessage): React.ReactNode => {
    if (
      message.role !== 'assistant' ||
      message.streaming ||
      message.isSystemPrompt
    ) {
      if (message.kind === 'reconnect_prompt') {
        return (
          <Pressable
            onPress={() => void handleReconnect(message.id)}
            disabled={isStreaming}
            className="rounded-full bg-primary/15 px-3 py-1.5 self-start"
            testID={`session-reconnect-${message.id}`}
          >
            <Text className="text-caption font-semibold text-primary">
              Reconnect
            </Text>
          </Pressable>
        );
      }
      if (message.kind === 'quota_exceeded' && quotaError) {
        return (
          <QuotaExceededCard
            details={quotaError}
            isOwner={activeProfile?.isOwner === true}
          />
        );
      }
      return null;
    }

    if (isStreaming) {
      return null;
    }

    const feedbackState = messageFeedback[message.id];
    const feedbackTestIdSuffix = message.eventId ?? message.id;
    const contextualQuickChips =
      userMessageCount > 0 &&
      message.id !== 'opening' &&
      message.id === latestAiMessageId &&
      message.id !== consumedQuickChipMessageId
        ? getContextualQuickChips(message)
        : [];
    const messageControlChips: Array<{
      id: QuickChipId;
      label: string;
    }> = [
      ...contextualQuickChips.map((chipId) => ({
        id: chipId as QuickChipId,
        label: QUICK_CHIP_CONFIG[chipId].label,
      })),
      ...(showWrongSubjectChip && message.id === latestAiMessageId
        ? [{ id: 'wrong_subject' as QuickChipId, label: 'Wrong subject' }]
        : []),
    ];
    const showFeedbackButtons = !!message.eventId;

    if (messageControlChips.length === 0 && !showFeedbackButtons) {
      return null;
    }

    return (
      <View className="gap-2">
        {messageControlChips.length > 0 && (
          <View className="flex-row flex-wrap gap-2">
            {messageControlChips.map((chip) => {
              return (
                <Pressable
                  key={`${message.id}-${chip.id}`}
                  onPress={() => void handleQuickChip(chip.id, message.id)}
                  disabled={isStreaming}
                  className="rounded-full bg-surface-elevated px-3 py-1.5"
                  testID={`quick-chip-${chip.id}`}
                >
                  <Text className="text-caption font-semibold text-text-secondary">
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {showFeedbackButtons && (
          <View className="flex-row flex-wrap gap-2">
            <Pressable
              onPress={() => void handleMessageFeedback(message, 'helpful')}
              disabled={feedbackState === 'incorrect' || isStreaming}
              className={
                feedbackState === 'helpful'
                  ? 'rounded-full bg-primary/15 px-3 py-1.5'
                  : 'rounded-full bg-surface-elevated px-3 py-1.5'
              }
              testID={`message-feedback-helpful-${feedbackTestIdSuffix}`}
            >
              <Text
                className={
                  feedbackState === 'helpful'
                    ? 'text-caption font-semibold text-primary'
                    : 'text-caption font-semibold text-text-secondary'
                }
              >
                Helpful
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleMessageFeedback(message, 'not_helpful')}
              disabled={feedbackState === 'incorrect' || isStreaming}
              className={
                feedbackState === 'not_helpful'
                  ? 'rounded-full bg-warning/15 px-3 py-1.5'
                  : 'rounded-full bg-surface-elevated px-3 py-1.5'
              }
              testID={`message-feedback-not-helpful-${feedbackTestIdSuffix}`}
            >
              <Text
                className={
                  feedbackState === 'not_helpful'
                    ? 'text-caption font-semibold text-warning'
                    : 'text-caption font-semibold text-text-secondary'
                }
              >
                Not helpful
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleMessageFeedback(message, 'incorrect')}
              disabled={isStreaming}
              className={
                feedbackState === 'incorrect'
                  ? 'rounded-full bg-danger/15 px-3 py-1.5'
                  : 'rounded-full bg-surface-elevated px-3 py-1.5'
              }
              testID={`message-feedback-incorrect-${feedbackTestIdSuffix}`}
            >
              <Text
                className={
                  feedbackState === 'incorrect'
                    ? 'text-caption font-semibold text-danger'
                    : 'text-caption font-semibold text-text-secondary'
                }
              >
                That&apos;s incorrect
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1">
      <ChatShell
        title={modeConfig.title}
        subtitle={subtitle}
        placeholder={modeConfig.placeholder}
        messages={messages}
        onSend={handleSend}
        isStreaming={isStreaming}
        inputDisabled={
          isOffline ||
          pendingClassification ||
          !!pendingSubjectResolution ||
          sessionExpired ||
          !!quotaError ||
          // CR-6: Disable input while session close is in flight.
          isClosing
        }
        disabledReason={
          isOffline
            ? "You're offline — input will return when you reconnect"
            : sessionExpired
            ? 'This session has ended'
            : quotaError
            ? 'Your session limit has been reached'
            : undefined
        }
        verificationType={
          transcript.data?.session.verificationType ?? undefined
        }
        inputMode={inputMode}
        onInputModeChange={handleInputModeChange}
        rightAction={headerRight}
        inputAccessory={sessionAccessory}
        belowInput={sessionToolAccessory}
        onDraftChange={setDraftText}
        renderMessageActions={renderMessageActions}
        speechRecognitionLanguage={languageVoiceLocale}
        textToSpeechLanguage={languageVoiceLocale}
        footer={
          <>
            {showFilingPrompt && !filingDismissed && (
              <View
                className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
                testID="filing-prompt"
              >
                <Text className="text-lg font-semibold text-text-primary mb-2">
                  Add to your library?
                </Text>
                <Text className="text-body-sm text-text-secondary mb-4">
                  We can organize what you learned into your library.
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
                      filing.isPending
                        ? 'Adding to library'
                        : 'Yes, add to library'
                    }
                  >
                    {filing.isPending ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-text-inverse font-semibold">
                        Yes, add it
                      </Text>
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
            )}
            {sessionExpired && (
              <View className="bg-surface rounded-card p-4 mt-2 mb-4">
                <Text className="text-body font-semibold text-text-primary mb-2">
                  Session expired
                </Text>
                <Text className="text-body-sm text-text-secondary mb-3">
                  This session is no longer available. Start a new one from home
                  or your library.
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
            )}
            {notePromptOffered &&
              !showNoteInput &&
              !sessionNoteSavedRef.current && (
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
              )}
            {showNoteInput && (
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
                        onError: (err) => {
                          Alert.alert(
                            "Couldn't save your note",
                            formatApiError(err)
                          );
                        },
                      }
                    );
                  }}
                  onCancel={() => setShowNoteInput(false)}
                  saving={upsertNote.isPending}
                />
              </View>
            )}
            {/* BUG-356: Use userMessageCount instead of exchangeCount — the server
                counts system messages (quick chips, auto-sent text) in exchangeCount,
                which hides the mode toggle before the user has deliberately typed. */}
            {userMessageCount === 0 && (
              <SessionInputModeToggle
                mode={inputMode}
                onModeChange={handleInputModeChange}
              />
            )}
            {modeConfig.showQuestionCount && (
              <QuestionCounter count={userMessageCount} />
            )}
            {showBookLink && <LibraryPrompt />}
          </>
        }
      />
      <Modal
        visible={showParkingLot}
        transparent
        animationType="slide"
        onRequestClose={() => setShowParkingLot(false)}
      >
        <View className="flex-1 bg-black/40 justify-end">
          <View
            className="bg-background rounded-t-3xl px-5 pt-5"
            style={{ paddingBottom: Math.max(insets.bottom, 24) }}
          >
            <View className="items-center mb-4">
              <View className="w-10 h-1 rounded-full bg-text-secondary/30" />
            </View>
            <Text className="text-h3 font-semibold text-text-primary mb-2">
              Parking lot
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              Save side questions for later so you can stay focused on this
              session.
            </Text>

            <TextInput
              value={parkingLotDraft}
              onChangeText={setParkingLotDraft}
              placeholder="What do you want to come back to later?"
              className="bg-surface rounded-input px-4 py-3 text-body text-text-primary"
              multiline
              testID="parking-lot-input"
            />

            <Pressable
              onPress={() => void handleSaveParkingLot()}
              disabled={!parkingLotDraft.trim() || addParkingLotItem.isPending}
              className={
                parkingLotDraft.trim()
                  ? 'bg-primary rounded-button py-3 mt-4 items-center'
                  : 'bg-surface-elevated rounded-button py-3 mt-4 items-center'
              }
              testID="parking-lot-save"
            >
              {addParkingLotItem.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  className={
                    parkingLotDraft.trim()
                      ? 'text-body font-semibold text-text-inverse'
                      : 'text-body font-semibold text-text-secondary'
                  }
                >
                  Save question
                </Text>
              )}
            </Pressable>

            <ScrollView className="mt-4" style={{ maxHeight: 220 }}>
              {(parkingLot.data ?? []).map((item) => (
                <View
                  key={item.id}
                  className="bg-surface rounded-card px-4 py-3 mb-2"
                  testID={`parking-lot-item-${item.id}`}
                >
                  <Text className="text-body text-text-primary">
                    {item.question}
                  </Text>
                  <Text className="text-caption text-text-secondary mt-1">
                    Saved for later
                  </Text>
                </View>
              ))}
              {parkingLot.isLoading ? (
                <View className="py-4 items-center">
                  <ActivityIndicator />
                </View>
              ) : parkingLot.data?.length ? null : (
                <Text className="text-body-sm text-text-secondary mt-3">
                  Nothing parked yet.
                </Text>
              )}
            </ScrollView>

            <Pressable
              onPress={() => setShowParkingLot(false)}
              className="items-center py-3 mt-3"
            >
              <Text className="text-body font-semibold text-text-secondary">
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showTopicSwitcher}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTopicSwitcher(false)}
      >
        <View className="flex-1 bg-black/40 justify-end">
          <View
            className="bg-background rounded-t-3xl px-5 pt-5"
            style={{ paddingBottom: Math.max(insets.bottom, 24) }}
          >
            <View className="items-center mb-4">
              <View className="w-10 h-1 rounded-full bg-text-secondary/30" />
            </View>
            <Text className="text-h3 font-semibold text-text-primary mb-2">
              Switch topic
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              Start a new learning thread in another topic without losing this
              conversation.
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
              className="mb-4"
            >
              {availableSubjects.map((subject) => (
                <Pressable
                  key={subject.id}
                  onPress={() => setTopicSwitcherSubjectId(subject.id)}
                  className={
                    switcherSubjectId === subject.id
                      ? 'rounded-full bg-primary px-4 py-2'
                      : 'rounded-full bg-surface-elevated px-4 py-2'
                  }
                  testID={`switch-subject-${subject.id}`}
                >
                  <Text
                    className={
                      switcherSubjectId === subject.id
                        ? 'text-body-sm font-semibold text-text-inverse'
                        : 'text-body-sm font-semibold text-text-secondary'
                    }
                  >
                    {subject.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView style={{ maxHeight: 280 }}>
              {switcherCurriculum.isLoading ? (
                <View className="py-6 items-center">
                  <ActivityIndicator />
                </View>
              ) : (
                (switcherCurriculum.data?.topics ?? [])
                  .filter((topic) => !topic.skipped)
                  .map((topic) => {
                    const subjectForTopic = availableSubjects.find(
                      (subject) => subject.id === switcherSubjectId
                    );
                    if (!subjectForTopic) return null;
                    return (
                      <Pressable
                        key={topic.id}
                        onPress={() =>
                          handleTopicSwitch(
                            topic.id,
                            subjectForTopic.id,
                            subjectForTopic.name
                          )
                        }
                        className="bg-surface rounded-card px-4 py-3 mb-2"
                        testID={`switch-topic-${topic.id}`}
                      >
                        <Text className="text-body font-semibold text-text-primary">
                          {topic.title}
                        </Text>
                        <Text className="text-body-sm text-text-secondary mt-1">
                          {topic.description}
                        </Text>
                      </Pressable>
                    );
                  })
              )}
            </ScrollView>

            <Pressable
              onPress={() => setShowTopicSwitcher(false)}
              className="items-center py-3 mt-3"
            >
              <Text className="text-body font-semibold text-text-secondary">
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {confirmationToast ? (
        <View
          pointerEvents="none"
          className="absolute left-4 right-4 z-50 items-center"
          style={{ bottom: Math.max(insets.bottom, 16) + 88 }}
          testID="session-confirmation-toast"
        >
          <View className="rounded-full bg-text-primary px-4 py-3">
            <Text className="text-body-sm font-semibold text-text-inverse">
              {confirmationToast}
            </Text>
          </View>
        </View>
      ) : null}
      {CelebrationOverlay}
    </View>
  );
}
