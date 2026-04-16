import {
  Component,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import {
  AppState,
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
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
  FluencyDrillStrip,
  type ChatMessage,
} from '../../../components/session';
import type { FluencyDrillEvent } from '../../../lib/sse';
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
import {
  useApiClient,
  type QuotaExceededDetails,
} from '../../../lib/api-client';
import { useThemeColors } from '../../../lib/theme';
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
  getConversationStage,
  type MessageFeedbackState,
  type PendingSubjectResolution,
} from './session-types';
import { useSessionStreaming } from './use-session-streaming';
import { useSubjectClassification } from './use-subject-classification';
import { useSessionActions } from './use-session-actions';
import { SessionMessageActions } from './SessionMessageActions';
import { SessionToolAccessory, SessionAccessory } from './SessionAccessories';
import { ParkingLotModal, TopicSwitcherModal } from './SessionModals';
import { SessionFooter } from './SessionFooter';
import { Sentry } from '../../../lib/sentry';

/**
 * Session-specific error boundary with visible diagnostics.
 * Uses inline styles so it always renders readable text regardless of theme context.
 */
class SessionErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null; componentStack: string | null }
> {
  override state = {
    hasError: false,
    error: null as Error | null,
    componentStack: null as string | null,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = info.componentStack ?? '';
    this.setState({ componentStack: stack });
    console.error(
      '[SessionScreen CRASH]',
      error.message,
      '\n\nError stack:',
      error.stack,
      '\n\nComponent stack:',
      stack
    );
    Sentry.captureException(error, {
      tags: { screen: 'session', crashLocation: 'SessionErrorBoundary' },
      extra: { componentStack: stack },
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: '#faf5ef' }}
          contentContainerStyle={{
            padding: 24,
            paddingTop: 60,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: 'bold',
              color: '#b91c1c',
              marginBottom: 12,
            }}
          >
            Session screen crashed
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: '#1a1a1a',
              marginBottom: 16,
              fontWeight: '600',
            }}
          >
            {this.state.error?.message ?? 'Unknown error'}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: '#444',
              fontFamily: 'monospace',
              marginBottom: 16,
            }}
            selectable
          >
            {this.state.error?.stack?.slice(0, 1200) ?? ''}
          </Text>
          {this.state.componentStack && (
            <View
              style={{
                backgroundColor: '#fee2e2',
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <Text
                style={{ fontSize: 10, color: '#333', fontFamily: 'monospace' }}
                selectable
              >
                {this.state.componentStack.trim().slice(0, 1000)}
              </Text>
            </View>
          )}
          <Pressable
            onPress={() =>
              this.setState({
                hasError: false,
                error: null,
                componentStack: null,
              })
            }
            style={{
              backgroundColor: '#0d9488',
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
              Try Again
            </Text>
          </Pressable>
        </ScrollView>
      );
    }
    return this.props.children;
  }
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

export default function SessionScreen() {
  return (
    <SessionErrorBoundary>
      <SessionScreenInner />
    </SessionErrorBoundary>
  );
}

function SessionScreenInner() {
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
    verificationType: routeVerificationType,
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
    verificationType?: string;
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
  const [fluencyDrill, setFluencyDrill] = useState<FluencyDrillEvent | null>(
    null
  );
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
            topicName: topicName ?? undefined,
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
    topicName: topicName ?? undefined,
    inputMode,
    rawInput: rawInput ?? undefined,
    verificationType: routeVerificationType ?? undefined,
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
    setFluencyDrill,
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

  // BUG-373: Exclude auto-sent messages (homework OCR, queued multi-problem)
  // so the voice/text toggle stays visible until the user deliberately types.
  // Defined here (before useSubjectClassification) so the greeting guard can
  // use it to decide whether to re-trigger classification.
  const userMessageCount = useMemo(
    () => messages.filter((m) => m.role === 'user' && !m.isAutoSent).length,
    [messages]
  );

  const hasSubject = !!(classifiedSubject?.subjectId || subjectId);
  const conversationStage = getConversationStage(
    userMessageCount,
    hasSubject,
    effectiveMode
  );

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
    animateResponse,
    userMessageCount,
    sessionExperience,
    animationCleanupRef,
    setIsStreaming,
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
    filing,
    retryFiling: async (input: {
      sessionId: string;
      sessionMode: 'freeform' | 'homework';
    }) => {
      const res = await apiClient.filing['request-retry'].$post({
        json: input,
      });
      if (!res.ok) throw new Error(`retry-filing failed: ${res.status}`);
    },
    router,
  });

  // BUG-358: Show End Session immediately for resumed sessions — the session
  // already exists, so the button should be available even before the transcript
  // loads and sets exchangeCount > 0.
  const showEndSession = exchangeCount > 0 || !!routeSessionId;

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
    <SessionToolAccessory
      isStreaming={isStreaming}
      handleQuickChip={handleQuickChip}
      stage={conversationStage}
    />
  );

  const drillStrip = fluencyDrill ? (
    <FluencyDrillStrip
      drill={fluencyDrill}
      onDismissScore={() => setFluencyDrill(null)}
    />
  ) : null;

  const sessionAccessory = (
    <SessionAccessory
      pendingSubjectResolution={pendingSubjectResolution}
      isStreaming={isStreaming}
      pendingClassification={pendingClassification}
      createSubject={createSubject}
      handleResolveSubject={handleResolveSubject}
      handleCreateSuggestedSubject={handleCreateSuggestedSubject}
      handleCreateResolveSuggestion={handleCreateResolveSuggestion}
      setPendingSubjectResolution={setPendingSubjectResolution}
      router={router}
      effectiveMode={effectiveMode}
      homeworkProblemsState={homeworkProblemsState}
      currentProblemIndex={currentProblemIndex}
      activeHomeworkProblem={activeHomeworkProblem}
      homeworkMode={homeworkMode}
      setHomeworkMode={setHomeworkMode}
      handleNextProblem={handleNextProblem}
      handleEndSession={handleEndSession}
    />
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
      stage={conversationStage}
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
        inputAccessory={
          drillStrip ? (
            <View>
              {drillStrip}
              {sessionAccessory}
            </View>
          ) : (
            sessionAccessory
          )
        }
        belowInput={sessionToolAccessory}
        onDraftChange={setDraftText}
        renderMessageActions={renderMessageActions}
        speechRecognitionLanguage={languageVoiceLocale}
        textToSpeechLanguage={languageVoiceLocale}
        footer={
          <SessionFooter
            showFilingPrompt={showFilingPrompt}
            filingDismissed={filingDismissed}
            filing={filing}
            activeSessionId={activeSessionId}
            effectiveMode={effectiveMode}
            filingTopicHint={
              rawInput ??
              messages
                .find((m) => m.role === 'user' && !m.isSystemPrompt)
                ?.content?.slice(0, 80) ??
              undefined
            }
            setShowFilingPrompt={setShowFilingPrompt}
            setFilingDismissed={setFilingDismissed}
            navigateToSessionSummary={navigateToSessionSummary}
            router={router}
            sessionExpired={sessionExpired}
            notePromptOffered={notePromptOffered}
            showNoteInput={showNoteInput}
            setShowNoteInput={setShowNoteInput}
            sessionNoteSavedRef={sessionNoteSavedRef}
            topicId={topicId ?? undefined}
            upsertNote={upsertNote}
            colors={colors}
            userMessageCount={userMessageCount}
            inputMode={inputMode}
            handleInputModeChange={handleInputModeChange}
            showQuestionCount={modeConfig.showQuestionCount}
            showBookLink={showBookLink}
          />
        }
      />
      <ParkingLotModal
        visible={showParkingLot}
        onClose={() => setShowParkingLot(false)}
        parkingLotDraft={parkingLotDraft}
        setParkingLotDraft={setParkingLotDraft}
        handleSaveParkingLot={handleSaveParkingLot}
        parkingLot={parkingLot}
        addParkingLotItem={addParkingLotItem}
        insetsBottom={insets.bottom}
      />
      <TopicSwitcherModal
        visible={showTopicSwitcher}
        onClose={() => setShowTopicSwitcher(false)}
        availableSubjects={availableSubjects}
        switcherSubjectId={switcherSubjectId}
        setTopicSwitcherSubjectId={setTopicSwitcherSubjectId}
        switcherCurriculum={switcherCurriculum}
        handleTopicSwitch={handleTopicSwitch}
        insetsBottom={insets.bottom}
        isSwitching={isClosing}
      />
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
