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
  getModeConfig,
  getOpeningMessage,
  SessionTimer,
  QuestionCounter,
  LibraryPrompt,
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
  createMilestoneTrackerStateFromMilestones,
  normalizeMilestoneTrackerState,
  useMilestoneTracker,
} from '../../../hooks/use-milestone-tracker';
import { Ionicons } from '@expo/vector-icons';
import {
  useApiClient,
  type QuotaExceededDetails,
} from '../../../lib/api-client';
import { formatApiError } from '../../../lib/format-api-error';
import { useThemeColors } from '../../../lib/theme';
import { NoteInput } from '../../../components/library/NoteInput';
import { useUpsertNote } from '../../../hooks/use-notes';
import { getVoiceLocaleForLanguage } from '../../../lib/language-locales';
import { useProfile } from '../../../lib/profile';
import {
  readSessionRecoveryMarker,
  writeSessionRecoveryMarker,
} from '../../../lib/session-recovery';
import * as SecureStore from '../../../lib/secure-storage';
import { parseHomeworkProblems } from '../homework/problem-cards';
import {
  getInputModeKey,
  errorHasStatus,
  type QuickChipId,
  type MessageFeedbackState,
  type PendingSubjectResolution,
} from './session-types';
import { useSessionStreaming } from './use-session-streaming';
import { useSubjectClassification } from './use-subject-classification';
import { useSessionActions } from './use-session-actions';
import { SessionMessageActions } from './SessionMessageActions';

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

  const {
    syncHomeworkMetadata,
    continueWithMessage,
    handleReconnect,
    fetchFastCelebrations,
  } = useSessionStreaming({
    activeSessionId,
    setActiveSessionId,
    effectiveSubjectId,
    effectiveSubjectName,
    effectiveMode,
    topicId: topicId ?? undefined,
    inputMode,
    rawInput: rawInput ?? undefined,
    normalizedOcrText,
    homeworkCaptureSource,
    messages,
    setMessages,
    setIsStreaming,
    setExchangeCount,
    setEscalationRung,
    setQuotaError,
    setNotePromptOffered,
    setShowNoteInput,
    setResponseHistory,
    setHomeworkProblemsState,
    homeworkProblemsState,
    currentProblemIndex,
    activeHomeworkProblem,
    homeworkMode,
    subjectId: subjectId ?? undefined,
    classifiedSubject,
    isStreaming,
    sessionExpired,
    quotaError,
    draftText,
    notePromptOffered,
    animationCleanupRef,
    silenceTimerRef,
    lastAiAtRef,
    lastExpectedMinutesRef,
    lastRetryPayloadRef,
    trackerStateRef,
    activeProfileId: activeProfile?.id,
    apiClient,
    startSession,
    streamMessage,
    recordSystemPrompt,
    trackExchange,
    trigger,
    createLocalMessageId,
    responseHistory,
  });

  const {
    handleResolveSubject,
    handleCreateResolveSuggestion,
    handleCreateSuggestedSubject,
    handleSend,
  } = useSubjectClassification({
    isStreaming,
    pendingClassification,
    setPendingClassification,
    quotaError,
    pendingSubjectResolution,
    setPendingSubjectResolution,
    classifiedSubject,
    setClassifiedSubject,
    setShowWrongSubjectChip,
    setClassifyError,
    setTopicSwitcherSubjectId,
    messages,
    setMessages,
    setResumedBanner,
    subjectId: subjectId ?? undefined,
    effectiveMode,
    availableSubjects,
    classifySubject,
    resolveSubject,
    createSubject,
    continueWithMessage,
    createLocalMessageId,
    showConfirmation,
  });

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

  const {
    handleInputModeChange,
    handleNextProblem,
    navigateToSessionSummary,
    handleEndSession,
    handleQuickChip,
    handleMessageFeedback,
    handleSaveParkingLot,
    handleTopicSwitch,
  } = useSessionActions({
    activeSessionId,
    isStreaming,
    isClosing,
    setIsClosing,
    exchangeCount,
    escalationRung,
    effectiveMode,
    effectiveSubjectId,
    effectiveSubjectName,
    topicId: topicId ?? undefined,
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
    activeProfileId: activeProfile?.id,
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
    router,
  });

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

  const renderMessageActions = (message: ChatMessage): React.ReactNode => (
    <SessionMessageActions
      message={message}
      isStreaming={isStreaming}
      latestAiMessageId={latestAiMessageId}
      consumedQuickChipMessageId={consumedQuickChipMessageId}
      userMessageCount={userMessageCount}
      showWrongSubjectChip={showWrongSubjectChip}
      messageFeedback={messageFeedback}
      quotaError={quotaError}
      isOwner={activeProfile?.isOwner === true}
      handleQuickChip={handleQuickChip}
      handleMessageFeedback={handleMessageFeedback}
      handleReconnect={handleReconnect}
    />
  );

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
