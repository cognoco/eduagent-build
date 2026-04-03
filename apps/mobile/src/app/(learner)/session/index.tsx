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
import type { PendingCelebration, HomeworkProblem } from '@eduagent/schemas';
import {
  ChatShell,
  animateResponse,
  getModeConfig,
  getOpeningMessage,
  SessionTimer,
  QuestionCounter,
  LearningBookPrompt,
  SessionInputModeToggle,
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
import { useStreaks } from '../../../hooks/use-streaks';
import { useOverallProgress } from '../../../hooks/use-progress';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import { useApiReachability } from '../../../hooks/use-api-reachability';
import { useCelebrationLevel } from '../../../hooks/use-settings';
import { useCelebration } from '../../../hooks/use-celebration';
import { useSubjects } from '../../../hooks/use-subjects';
import { useCurriculum } from '../../../hooks/use-curriculum';
import {
  celebrationForReason,
  createMilestoneTrackerStateFromMilestones,
  normalizeMilestoneTrackerState,
  useMilestoneTracker,
} from '../../../hooks/use-milestone-tracker';
import { useApiClient } from '../../../lib/api-client';
import { formatApiError } from '../../../lib/format-api-error';
import { useProfile } from '../../../lib/profile';
import {
  clearSessionRecoveryMarker,
  readSessionRecoveryMarker,
  writeSessionRecoveryMarker,
} from '../../../lib/session-recovery';
import {
  buildHomeworkSessionMetadata,
  parseHomeworkProblems,
  withProblemMode,
} from '../homework/problem-cards';

function computePaceMultiplier(
  history: Array<{ actualSeconds: number; expectedMinutes: number }>
): number {
  if (history.length < 3) return 1;
  const ratios = history
    .map(
      (entry) => entry.actualSeconds / Math.max(60, entry.expectedMinutes * 60)
    )
    .sort((a, b) => a - b);
  const middle = Math.floor(ratios.length / 2);
  const median =
    ratios.length % 2 === 0
      ? (ratios[middle - 1]! + ratios[middle]!) / 2
      : ratios[middle]!;
  return Math.min(3, Math.max(0.5, Number(median.toFixed(2))));
}

function serializeMilestones(milestones: string[]): string {
  return encodeURIComponent(JSON.stringify(milestones));
}

function serializeCelebrations(celebrations: PendingCelebration[]): string {
  return encodeURIComponent(JSON.stringify(celebrations));
}

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

type QuickChipId =
  | 'hint'
  | 'example'
  | 'know_this'
  | 'explain_differently'
  | 'too_easy'
  | 'too_hard'
  | 'wrong_subject'
  | 'switch_topic'
  | 'park';

type ContextualQuickChipId = Exclude<
  QuickChipId,
  'switch_topic' | 'park' | 'wrong_subject'
>;

type MessageFeedbackState = 'helpful' | 'not_helpful' | 'incorrect';

interface PendingSubjectResolution {
  originalText: string;
  prompt: string;
  candidates: Array<{
    subjectId: string;
    subjectName: string;
  }>;
}

const CONFIRMATION_BY_CHIP: Partial<Record<ContextualQuickChipId, string>> = {
  hint: 'Adding a hint.',
  example: 'Pulling a fresh example.',
  know_this: 'Moving ahead.',
  explain_differently: 'Trying a different angle.',
  too_easy: 'Raising the challenge.',
  too_hard: 'Breaking it down more.',
};

const QUICK_CHIP_CONFIG: Record<
  ContextualQuickChipId,
  {
    label: string;
    prompt: string;
    systemPrompt: string;
  }
> = {
  hint: {
    label: 'Hint',
    prompt: 'Give me a hint.',
    systemPrompt:
      'The learner tapped the hint chip. Give one short hint, not a full solution.',
  },
  example: {
    label: 'Example',
    prompt: 'Can you show a similar example?',
    systemPrompt:
      'The learner wants a fresh worked example. Use one similar example and keep it concise.',
  },
  know_this: {
    label: 'I know this',
    prompt: 'I know this part already. Can we move ahead?',
    systemPrompt:
      'The learner says they already know this. Briefly verify, then move forward or increase the challenge slightly.',
  },
  explain_differently: {
    label: 'Explain differently',
    prompt: 'Can you explain that differently?',
    systemPrompt:
      'The learner wants a different explanation. Re-explain with a new angle and one concrete example.',
  },
  too_easy: {
    label: 'Too easy',
    prompt: 'That feels too easy. Can you make it more challenging?',
    systemPrompt:
      'The learner says this is too easy. Raise the challenge a little and ask for more independent thinking.',
  },
  too_hard: {
    label: 'Too hard',
    prompt: 'That feels too hard. Can you break it down more?',
    systemPrompt:
      'The learner says this is too hard. Lower the difficulty, add more structure, and keep the next step small.',
  },
};

function getContextualQuickChips(
  message: ChatMessage | undefined
): ContextualQuickChipId[] {
  if (!message) return [];

  const questionLike = /\?(\s|$)/.test(message.content);
  if (questionLike) {
    return ['too_hard', 'explain_differently', 'hint'];
  }

  return ['know_this', 'explain_differently', 'too_easy', 'example'];
}

export default function SessionScreen() {
  const {
    mode,
    subjectId,
    subjectName,
    sessionId: routeSessionId,
    topicId,
    problemText,
    homeworkProblems,
    ocrText,
  } = useLocalSearchParams<{
    mode?: string;
    subjectId?: string;
    subjectName?: string;
    sessionId?: string;
    topicId?: string;
    problemText?: string;
    homeworkProblems?: string;
    ocrText?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();

  const effectiveMode = mode ?? 'freeform';
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
    initialProblemText
  );

  const { isOffline } = useNetworkStatus();
  const { isApiReachable, isChecked: apiChecked } = useApiReachability();

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'ai', content: openingContent },
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
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
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

  const animationCleanupRef = useRef<(() => void) | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAiAtRef = useRef<number | null>(null);
  const lastExpectedMinutesRef = useRef(10);
  const hasAutoSentRef = useRef(false);
  const hasHydratedRecoveryRef = useRef(false);
  const queuedProblemTextRef = useRef<string | null>(null);
  const localMessageIdRef = useRef(0);

  const transcript = useSessionTranscript(routeSessionId ?? '');
  const recordSystemPrompt = useRecordSystemPrompt(activeSessionId ?? '');
  const recordSessionEvent = useRecordSessionEvent(activeSessionId ?? '');
  const setSessionInputMode = useSetSessionInputMode(activeSessionId ?? '');
  const flagSessionContent = useFlagSessionContent(activeSessionId ?? '');
  const parkingLot = useParkingLot(activeSessionId ?? '');
  const addParkingLotItem = useAddParkingLotItem(activeSessionId ?? '');
  const { data: availableSubjects = [] } = useSubjects();
  const {
    milestonesReached,
    trackerState,
    trackExchange,
    hydrate,
    reset: resetMilestones,
  } = useMilestoneTracker();
  const { CelebrationOverlay, trigger } = useCelebration({
    celebrationLevel,
    audience: 'child',
  });

  // Reset state when screen regains focus (prevents stale state loop)
  useFocusEffect(
    useCallback(() => {
      animationCleanupRef.current?.();
      setMessages([{ id: 'opening', role: 'ai', content: openingContent }]);
      setIsStreaming(false);
      setExchangeCount(0);
      setEscalationRung(1);
      setIsClosing(false);
      setActiveSessionId(routeSessionId ?? null);
      setPendingClassification(false);
      setClassifyError(null);
      setClassifiedSubject(null);
      setPendingSubjectResolution(null);
      setInputMode('text');
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
  const startSession = useStartSession(effectiveSubjectId);
  const closeSession = useCloseSession(activeSessionId ?? '');
  const { stream: streamMessage } = useStreamMessage(activeSessionId ?? '');
  const activeHomeworkProblem = homeworkProblemsState[currentProblemIndex];

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
            Array.isArray(ocrText) ? ocrText[0] : ocrText
          ),
        },
      });

      if (!res.ok) {
        throw new Error(`Homework state sync failed: ${res.status}`);
      }
    },
    [apiClient, effectiveMode, ocrText]
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
        role: entry.role === 'assistant' ? ('ai' as const) : ('user' as const),
        content: entry.content,
        eventId: entry.eventId,
        isSystemPrompt: entry.isSystemPrompt,
        escalationRung: entry.escalationRung,
      }));

    setMessages(
      transcriptMessages.length > 0
        ? transcriptMessages
        : [{ id: 'opening', role: 'ai', content: openingContent }]
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
    if (!routeSessionId || hasHydratedRecoveryRef.current) return;

    let cancelled = false;

    void (async () => {
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
        );
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
              role: 'ai',
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
            milestoneTracker: trackerState,
            updatedAt: new Date().toISOString(),
          },
          activeProfile?.id
        );
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
      trackerState,
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

      try {
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
              ...(effectiveMode === 'homework' &&
              homeworkProblemsState.length > 0
                ? {
                    metadata: {
                      inputMode,
                      homework: buildHomeworkSessionMetadata(
                        homeworkProblemsState,
                        currentProblemIndex,
                        Array.isArray(ocrText) ? ocrText[0] : ocrText
                      ),
                    },
                  }
                : {}),
            },
          });
          if (!res.ok) throw new Error(`Session start failed: ${res.status}`);
          const data = (await res.json()) as { session: { id: string } };
          newId = data.session.id;
        } else {
          const result = await startSession.mutateAsync({
            subjectId: sid,
            topicId: topicId ?? undefined,
            sessionType,
            inputMode,
            ...(effectiveMode === 'homework' && homeworkProblemsState.length > 0
              ? {
                  metadata: {
                    inputMode,
                    homework: buildHomeworkSessionMetadata(
                      homeworkProblemsState,
                      currentProblemIndex,
                      Array.isArray(ocrText) ? ocrText[0] : ocrText
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
      } catch {
        return null;
      }
    },
    [
      activeSessionId,
      activeProfile?.id,
      effectiveSubjectId,
      topicId,
      effectiveMode,
      inputMode,
      apiClient,
      startSession,
      homeworkProblemsState,
      currentProblemIndex,
      ocrText,
      inputMode,
      syncHomeworkMetadata,
    ]
  );

  const handleInputModeChange = useCallback(
    (nextInputMode: 'text' | 'voice') => {
      setInputMode(nextInputMode);
      if (!activeSessionId) {
        return;
      }
      void setSessionInputMode
        .mutateAsync({ inputMode: nextInputMode })
        .catch(() => {
          showConfirmation("Couldn't save that mode just now.");
        });
    },
    [activeSessionId, setSessionInputMode, showConfirmation]
  );

  const openSubjectResolution = useCallback(
    (
      text: string,
      prompt: string,
      candidates: Array<{ subjectId: string; subjectName: string }>
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
      });
      setMessages((prev) => [
        ...prev,
        {
          id: createLocalMessageId('ai'),
          role: 'ai',
          content: prompt,
          isSystemPrompt: true,
        },
      ]);
    },
    [createLocalMessageId]
  );

  const continueWithMessage = useCallback(
    async (
      text: string,
      options?: {
        sessionSubjectId?: string;
        sessionSubjectName?: string;
      }
    ) => {
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
            milestoneTracker: trackerState,
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

        const streamId = createLocalMessageId('ai');
        const previousAiAt = lastAiAtRef.current;
        setMessages((prev) => [
          ...prev,
          { id: streamId, role: 'ai', content: '', streaming: true },
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
              prev.map((m) =>
                m.id === streamId
                  ? {
                      ...m,
                      streaming: false,
                      eventId: result.aiEventId,
                      escalationRung: result.escalationRung,
                    }
                  : m
              )
            );
            setIsStreaming(false);
            setExchangeCount(result.exchangeCount);
            setEscalationRung(result.escalationRung);
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
        animationCleanupRef.current = animateResponse(
          'Lost connection to your session. Tap send to reconnect.',
          setMessages,
          setIsStreaming
        );
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
      scheduleSilencePrompt,
      streamMessage,
      subjectId,
      syncHomeworkMetadata,
      topicId,
      trackExchange,
      trackerState,
      trigger,
    ]
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
          role: 'ai',
          content: `Got it, we’re working on ${candidate.subjectName}.`,
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

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming || pendingClassification) return;
      if (pendingSubjectResolution) {
        showConfirmation('Pick the subject first, then I’ll keep going.');
        return;
      }

      setMessages((prev) => [
        ...prev,
        { id: createLocalMessageId('user'), role: 'user', content: text },
      ]);
      setResumedBanner(false);

      // Classify subject from first message when none was provided
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
                role: 'ai',
                content: `Got it, this sounds like ${candidate.subjectName}.`,
                isSystemPrompt: true,
              },
            ]);
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
            openSubjectResolution(
              text,
              result.candidates.length > 1
                ? `This sounds like it could be ${subjectCandidates
                    .slice(0, 3)
                    .map((candidate) => candidate.subjectName)
                    .join(' or ')}. Which one are we working on?`
                : "I couldn't place that yet. Pick the closest subject and we'll get moving.",
              subjectCandidates
            );
            return;
          }
        } catch {
          const fallbackCandidates = availableSubjects.map((candidate) => ({
            subjectId: candidate.id,
            subjectName: candidate.name,
          }));
          setShowWrongSubjectChip(false);
          setClassifyError(
            'Could not identify the subject automatically. Pick one below and we’ll keep going.'
          );
          if (fallbackCandidates.length > 0) {
            openSubjectResolution(
              text,
              "I couldn't place that yet. Pick the closest subject and we'll get moving.",
              fallbackCandidates
            );
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
      pendingSubjectResolution,
      createLocalMessageId,
      subjectId,
      classifiedSubject,
      messages.length,
      classifySubject,
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
      void handleSend(queuedProblemText);
    }, 0);

    return () => clearTimeout(timer);
  }, [currentProblemIndex, handleSend]);

  useEffect(() => {
    if (problemText && !routeSessionId && !hasAutoSentRef.current) {
      hasAutoSentRef.current = true;
      const timer = setTimeout(() => {
        void handleSend(problemText);
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [problemText, handleSend, routeSessionId]);

  const fetchFastCelebrations = useCallback(async (): Promise<
    PendingCelebration[]
  > => {
    const celebrationsClient = (apiClient as Record<string, any>)[
      'celebrations'
    ];
    const startedAt = Date.now();

    while (Date.now() - startedAt < 3000) {
      const res = await celebrationsClient.pending.$get();
      if (res.ok) {
        const data = (await res.json()) as {
          pendingCelebrations: PendingCelebration[];
        };
        if (data.pendingCelebrations.length > 0) {
          await celebrationsClient.seen.$post({
            json: { viewer: 'child' },
          });
          return data.pendingCelebrations;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return [];
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

  const handleEndSession = useCallback(async () => {
    if (!activeSessionId || isClosing) return;

    Alert.alert('Ready to wrap up?', 'Keep going or finish this session now.', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: "I'm Done",
        onPress: async () => {
          setIsClosing(true);
          try {
            const result = await closeSession.mutateAsync({
              reason: 'user_ended',
              summaryStatus: 'pending',
              milestonesReached,
            });
            const fastCelebrations = await fetchFastCelebrations();
            await clearSessionRecoveryMarker(activeProfile?.id);
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
                sessionType:
                  effectiveMode === 'homework' ? 'homework' : 'learning',
              },
            } as never);
          } catch (err: unknown) {
            setIsClosing(false);
            Alert.alert('Error', formatApiError(err));
          }
        },
      },
    ]);
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
          pathname: '/(learner)/session',
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

  const showEndSession = exchangeCount > 0;

  const userMessageCount = useMemo(
    () => messages.filter((m) => m.role === 'user').length,
    [messages]
  );
  const latestAiMessageId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === 'ai' && !message.streaming)?.id ??
      null,
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
            ? 'Your mate is giving more structure right now because the conversation needed extra support.'
            : 'Your mate is mostly letting you drive and checking in with lighter guidance.'
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
    : resumedBanner
    ? 'Welcome back - your session is ready.'
    : apiChecked && !isApiReachable
    ? 'Server unreachable - messages may fail'
    : modeConfig.subtitle;

  const sessionToolAccessory = (
    <View className="bg-surface border-t border-surface-elevated px-4 py-3">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
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
            className={`rounded-full px-4 py-2 ${
              isStreaming ? 'bg-surface' : 'bg-surface-elevated'
            }`}
            accessibilityRole="button"
            accessibilityLabel={chip.label}
            accessibilityState={{ disabled: isStreaming }}
            testID={`quick-chip-${chip.id}`}
          >
            <Text className="text-body-sm font-semibold text-text-primary">
              {chip.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  const subjectResolutionAccessory = pendingSubjectResolution ? (
    <View className="bg-surface border-t border-surface-elevated px-4 py-3">
      <Text className="text-body-sm font-semibold text-text-primary">
        Pick the subject
      </Text>
      <Text className="text-body-sm text-text-secondary mt-1 mb-3">
        {pendingSubjectResolution.prompt}
      </Text>
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
      </ScrollView>
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
            {currentProblemIndex < homeworkProblemsState.length - 1 && (
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
            )}
          </View>
        )}
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
      </View>
    ) : undefined;

  const sessionAccessory = (
    <>
      {subjectResolutionAccessory}
      {sessionToolAccessory}
      {homeworkModeChips}
    </>
  );

  const renderMessageActions = (message: ChatMessage): React.ReactNode => {
    if (message.role !== 'ai' || message.streaming || message.isSystemPrompt) {
      return null;
    }

    if (isStreaming) {
      return null;
    }

    const feedbackState = messageFeedback[message.id];
    const feedbackTestIdSuffix = message.eventId ?? message.id;
    const contextualQuickChips =
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
          isOffline || pendingClassification || !!pendingSubjectResolution
        }
        verificationType={
          transcript.data?.session.verificationType ?? undefined
        }
        inputMode={inputMode}
        onInputModeChange={handleInputModeChange}
        rightAction={headerRight}
        inputAccessory={sessionAccessory}
        onDraftChange={setDraftText}
        renderMessageActions={renderMessageActions}
        initialVoiceEnabled={inputMode === 'voice'}
        footer={
          <>
            {exchangeCount === 0 && (
              <SessionInputModeToggle
                mode={inputMode}
                onModeChange={setInputMode}
              />
            )}
            {modeConfig.showQuestionCount && (
              <QuestionCounter count={userMessageCount} />
            )}
            {showBookLink && <LearningBookPrompt />}
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
