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
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { platformAlert } from '../../../lib/platform-alert';
import { goBackOrReplace, homeHrefForReturnTo } from '../../../lib/navigation';
import { firstParam } from '../../../lib/route-params';
import { shouldShowBookLink } from '../../../lib/show-book-link';
import {
  router,
  useRouter,
  useLocalSearchParams,
  useFocusEffect,
} from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  HomeworkCaptureSource,
  HomeworkProblem,
  InputMode,
  LearningMode,
  PendingCelebration,
} from '@eduagent/schemas';
import {
  ChatShell,
  animateResponse,
  getModeConfig,
  getOpeningMessage,
  SessionTimer,
  FluencyDrillStrip,
  MilestoneDots,
  type ChatMessage,
} from '../../../components/session';
import type { FluencyDrillEvent } from '../../../lib/sse';
import {
  useStreamMessage,
  useStartSession,
  useCloseSession,
  useSession,
  useSessionTranscript,
  useRecordSystemPrompt,
  useRecordSessionEvent,
  useSetSessionInputMode,
  useClearContinuationDepth,
  useFlagSessionContent,
  useParkingLot,
  useAddParkingLotItem,
} from '../../../hooks/use-sessions';
import { useClassifySubject } from '../../../hooks/use-classify-subject';
import { useResolveSubject } from '../../../hooks/use-resolve-subject';
import { useFiling } from '../../../hooks/use-filing';
import { useStreaks } from '../../../hooks/use-streaks';
import {
  useOverallProgress,
  useProgressInventory,
  useActiveSessionForTopic,
} from '../../../hooks/use-progress';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import { useApiReachability } from '../../../hooks/use-api-reachability';
import {
  useCelebrationLevel,
  useLearningMode,
  useUpdateLearningMode,
} from '../../../hooks/use-settings';
import { useLearnerProfile } from '../../../hooks/use-learner-profile';
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
  NotFoundError,
  type QuotaExceededDetails,
} from '../../../lib/api-client';
import { useThemeColors } from '../../../lib/theme';
import { tokens } from '../../../lib/design-tokens';
import { useCreateNote } from '../../../hooks/use-notes';
import { getVoiceLocaleForLanguage } from '../../../lib/language-locales';
import { useProfile } from '../../../lib/profile';
import {
  useCreateBookmark,
  useDeleteBookmark,
  useSessionBookmarks,
} from '../../../hooks/use-bookmarks';
import {
  readSessionRecoveryMarker,
  writeSessionRecoveryMarker,
} from '../../../lib/session-recovery';
import * as SecureStore from '../../../lib/secure-storage';
import * as FileSystem from 'expo-file-system';
import { parseHomeworkProblems } from '../../../components/homework/problem-cards';
import {
  getInputModeKey,
  getConversationStage,
  type MessageFeedbackState,
  type PendingSubjectResolution,
} from '../../../components/session/session-types';
import { useSessionStreaming } from '../../../components/session/use-session-streaming';
import { useSubjectClassification } from '../../../components/session/use-subject-classification';
import { useSessionActions } from '../../../components/session/use-session-actions';
import { SessionMessageActions } from '../../../components/session/SessionMessageActions';
import { BookmarkNudgeTooltip } from '../../../components/session/BookmarkNudgeTooltip';
import {
  SessionToolAccessory,
  SessionAccessory,
} from '../../../components/session/SessionAccessories';
import {
  ParkingLotModal,
  TopicSwitcherModal,
} from '../../../components/session/SessionModals';
import { SessionFooter } from '../../../components/session/SessionFooter';
import { SessionTopicHeader } from '../../../components/session/SessionTopicHeader';
import { getResumeBannerCopy } from '../../../components/session/resume-banner-copy';
import { Sentry } from '../../../lib/sentry';
import { OutboxFailedBanner } from '../../../components/durability/OutboxFailedBanner';
import { useTranslation } from 'react-i18next';

/**
 * Session-specific error boundary with visible diagnostics.
 * Uses hardcoded hex colors intentionally — theme context may not be
 * available during a crash, so inline styles guarantee readable text
 * regardless of whether ThemeProvider is mounted. Do not replace with
 * semantic tokens.
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
      stack,
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
          style={{ flex: 1, backgroundColor: tokens.light.colors.background }}
          contentContainerStyle={{
            padding: 24,
            paddingTop: 60,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: 'bold',
              color: tokens.light.colors.danger,
              marginBottom: 12,
            }}
          >
            Session screen crashed
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: tokens.light.colors.textPrimary,
              marginBottom: 16,
              fontWeight: '600',
            }}
          >
            {this.state.error?.message ?? 'Unknown error'}
          </Text>
          {__DEV__ && (
            <>
              <Text
                style={{
                  fontSize: 11,
                  color: tokens.light.colors.textSecondary,
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
                    backgroundColor: tokens.light.colors.dangerSoft,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: tokens.light.colors.textPrimary,
                      fontFamily: 'monospace',
                    }}
                    selectable
                  >
                    {this.state.componentStack.trim().slice(0, 1000)}
                  </Text>
                </View>
              )}
            </>
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
              backgroundColor: tokens.light.colors.primary,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: tokens.light.colors.textInverse,
                fontSize: 16,
                fontWeight: '600',
              }}
            >
              Try Again
            </Text>
          </Pressable>
          {/* [UX-DE-M3] Secondary escape so a crash-loop doesn't trap the user.
              Hardcoded hex intentional — ThemeProvider may not be available.
              Uses the imperative expo-router `router` (module-level singleton)
              since class components cannot call the useRouter hook. */}
          <Pressable
            onPress={() => {
              this.setState({
                hasError: false,
                error: null,
                componentStack: null,
              });
              router.replace('/(app)/home' as never);
            }}
            style={{
              backgroundColor: tokens.light.colors.border,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
            }}
            testID="session-error-boundary-go-home"
            accessibilityRole="button"
            accessibilityLabel="Go Home"
          >
            <Text
              style={{
                color: tokens.light.colors.textSecondary,
                fontSize: 16,
                fontWeight: '600',
              }}
            >
              Go Home
            </Text>
          </Pressable>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function SessionScreen() {
  return (
    <SessionErrorBoundary>
      <SessionScreenInner />
    </SessionErrorBoundary>
  );
}

/**
 * Age-aware copy for the F6 confidence affordance. Three variants keep the
 * metacognitive intent (learner signals uncertainty about their own
 * understanding) but adjust phrasing to fit the learner's voice.
 *
 * Brackets follow `computeAgeBracket` thresholds (under 13 / 13–17 / 18+).
 * `null` birthYear falls back to the middle bracket — neutral default.
 */
function getConfidenceCopy(birthYear: number | null): {
  label: string;
  accessibilityLabel: string;
  retryMessage: string;
} {
  const age = birthYear == null ? null : new Date().getFullYear() - birthYear;
  if (age != null && age < 13) {
    return {
      label: 'Does this feel right? Tap to ask',
      accessibilityLabel:
        "If something doesn't make sense yet, that's okay! Tap here to ask the mentor to explain it a different way.",
      retryMessage: "I don't get this — can you say it another way?",
    };
  }
  if (age != null && age >= 18) {
    return {
      label: 'Not sure about this? Tap to ask',
      accessibilityLabel:
        'Need a different angle? Tap to ask for clarification or an alternate explanation.',
      retryMessage:
        "I'm not sure that was right — can you explain it differently?",
    };
  }
  return {
    label: 'Is this right? Tap to ask',
    accessibilityLabel:
      'Stuck on this answer? Tap to get it explained differently or work through it together.',
    retryMessage: "I'm not sure I get this — can you explain it differently?",
  };
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
    recap,
    resumeFromSessionId,
    gaps: rawGaps,
    returnTo,
    verificationType: routeVerificationType,
    imageUri: rawImageUri,
    imageMimeType: rawImageMimeType,
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
    recap?: string;
    resumeFromSessionId?: string;
    gaps?: string;
    returnTo?: string;
    verificationType?: string;
    imageUri?: string;
    imageMimeType?: string;
  }>();
  // [BUG-635] Coerce Expo Router's `string | string[]` to a single string.
  const imageUri = firstParam(rawImageUri);
  const imageMimeType = firstParam(rawImageMimeType);
  const gaps = useMemo(() => {
    const raw = firstParam(rawGaps);
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return undefined;
      return parsed
        .map((gap) => String(gap).trim())
        .filter((gap) => gap.length > 0)
        .slice(0, 8);
    } catch {
      return undefined;
    }
  }, [rawGaps]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const effectiveMode = mode ?? 'freeform';
  const homeBackHref = homeHrefForReturnTo(returnTo);
  const chatBackFallback = returnTo
    ? (homeBackHref as string)
    : subjectId
      ? `/(app)/shelf/${subjectId}`
      : undefined;
  // [BUG-867] String-templated dynamic paths (`/(app)/shelf/${subjectId}`)
  // don't always resolve on web — the chevron looked clickable but the URL
  // never changed. Supplying an explicit handler that uses Expo Router's
  // typed object form makes the navigation reliable across web + native.
  const handleChatBackPress = useCallback(() => {
    if (returnTo) {
      router.replace(homeBackHref as never);
      return;
    }
    if (subjectId) {
      router.replace({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId },
      } as never);
      return;
    }
    router.replace('/(app)/home' as never);
  }, [returnTo, subjectId, homeBackHref, router]);
  const handleHomeBack = useCallback(() => {
    if (returnTo) {
      router.replace(homeBackHref as never);
      return;
    }

    goBackOrReplace(router, homeBackHref);
  }, [homeBackHref, returnTo, router]);
  const handleStartNewSession = useCallback(() => {
    router.replace({
      pathname: '/(app)/session',
      params: {
        ...(mode ? { mode } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(subjectName ? { subjectName } : {}),
        ...(topicId ? { topicId } : {}),
        ...(topicName ? { topicName } : {}),
        ...(returnTo ? { returnTo } : {}),
      },
    } as never);
  }, [mode, returnTo, router, subjectId, subjectName, topicId, topicName]);
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
    [effectiveMode, homeworkProblems, problemText],
  );
  const initialProblemText =
    initialHomeworkProblems[0]?.text ?? problemText ?? undefined;
  const modeConfig = getModeConfig(effectiveMode);
  const { data: streak } = useStreaks();
  const { data: overallProgress } = useOverallProgress();
  const progressInventory = useProgressInventory();
  const { data: celebrationLevel = 'all' } = useCelebrationLevel();
  const { data: learnerProfile } = useLearnerProfile();
  const { data: learningMode, isLoading: learningModeLoading } =
    useLearningMode();
  const updateLearningMode = useUpdateLearningMode();
  const sessionExperience = streak?.longestStreak ?? 0;
  const openingContent = getOpeningMessage(
    effectiveMode,
    sessionExperience,
    initialProblemText,
    topicName ?? undefined,
    subjectName ?? undefined,
    rawInput ?? undefined,
    recap ?? undefined,
  );
  // [M-7] Capture openingContent in a ref at render time so the transcript
  // hydration effect can use a stable reference. Without this, streak data
  // arriving asynchronously after the first render causes openingContent to
  // change, which triggers the hydration effect to re-run mid-conversation
  // and re-inject the opening greeting, wiping out any user messages.
  const openingContentRef = useRef<string>(openingContent);

  const { isOffline } = useNetworkStatus();
  const { isApiReachable, isChecked: apiChecked } = useApiReachability();

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'assistant', content: openingContent },
  ]);
  // [BUG-919] Hide the "Go to the Library" hint once the conversation
  // starts. See shouldShowBookLink for the full rationale.
  const showBookLink = shouldShowBookLink({
    effectiveMode,
    totalTopicsCompleted: overallProgress?.totalTopicsCompleted ?? 0,
    messagesLength: messages.length,
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [escalationRung, setEscalationRung] = useState(1);
  const [isClosing, setIsClosing] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    routeSessionId ?? null,
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
  const [showLearningModeSheet, setShowLearningModeSheet] = useState(false);
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
  const [bookmarkState, setBookmarkState] = useState<
    Record<string, string | null>
  >({});
  const [confirmationToast, setConfirmationToast] = useState<string | null>(
    null,
  );
  const [notePromptOffered, setNotePromptOffered] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [fluencyDrill, setFluencyDrill] = useState<FluencyDrillEvent | null>(
    null,
  );
  const [showFilingPrompt, setShowFilingPrompt] = useState(false);
  const [filingDismissed, setFilingDismissed] = useState(false);
  const [quotaError, setQuotaError] = useState<QuotaExceededDetails | null>(
    null,
  );
  /** F6: ID of the latest AI message where the LLM reported confidence=low */
  const [lowConfidenceMessageId, setLowConfidenceMessageId] = useState<
    string | null
  >(null);

  const sessionNoteSavedRef = useRef(false);
  const bookmarkStateRef = useRef<Record<string, string | null>>({});
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
  const activeSession = useSession(activeSessionId ?? '');
  const clearContinuationDepth = useClearContinuationDepth(
    activeSessionId ?? '',
  );
  const liveTranscript =
    transcript.data?.archived === false ? transcript.data : null;

  // Auto-resume the latest active/paused session when the user re-enters a
  // learning topic (e.g. tapping "Continue learning" on the topic screen,
  // selecting a topic from the bookshelf, etc.) without an explicit sessionId.
  // We look up the existing session for the topic and backfill `sessionId`
  // into the route params via setParams — that triggers the existing transcript
  // hydration path the same way the home-screen Continue card does, so chat
  // history loads everywhere instead of dropping the learner into a blank chat.
  // Scoped to learning mode only: review/homework/freeform intentionally start
  // fresh.
  const shouldLookupActiveSession =
    effectiveMode === 'learning' && !!topicId && !routeSessionId;
  const activeSessionLookup = useActiveSessionForTopic(
    shouldLookupActiveSession ? topicId : undefined,
  );
  const hasResolvedActiveSessionRef = useRef(false);
  useEffect(() => {
    if (hasResolvedActiveSessionRef.current) return;
    if (!shouldLookupActiveSession) return;
    const resumedSessionId = activeSessionLookup.data?.sessionId;
    if (!resumedSessionId) return;
    hasResolvedActiveSessionRef.current = true;
    router.setParams({ sessionId: resumedSessionId });
  }, [activeSessionLookup.data?.sessionId, shouldLookupActiveSession, router]);

  const sessionBookmarksQuery = useSessionBookmarks(
    activeSessionId ?? routeSessionId ?? undefined,
  );
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
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
  const imageBase64Ref = useRef<string | null>(null);
  const imageMimeTypeRef = useRef<
    'image/jpeg' | 'image/png' | 'image/webp' | null
  >(null);
  const { CelebrationOverlay, trigger } = useCelebration({
    celebrationLevel,
    accommodationMode: learnerProfile?.accommodationMode,
    audience: 'child',
  });

  // Reset state when screen regains focus (prevents stale state loop)
  useFocusEffect(
    useCallback(() => {
      animationCleanupRef.current?.();
      // When resuming a session (routeSessionId set), leave messages,
      // exchangeCount, and escalationRung alone — the transcript hydration
      // useEffect below owns them. Blanking here on every focus would race
      // the cached-transcript path: React Query returns the same data ref,
      // so the hydration effect's deps don't change and it never re-fires,
      // leaving the user staring at just the opening greeting.
      if (!routeSessionId) {
        // [M-7] Refresh the ref for new sessions so the opening message is
        // always current. Resuming sessions skip this because hydration owns
        // the message list via transcript.data.
        openingContentRef.current = openingContent;
        setMessages([
          { id: 'opening', role: 'assistant', content: openingContent },
        ]);
        setExchangeCount(0);
        setEscalationRung(1);
      }
      setIsStreaming(false);
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
      setLowConfidenceMessageId(null);
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
    ]),
  );

  useEffect(() => {
    // Capture ref objects (not .current) so the cleanup reads the latest
    // value at unmount without triggering react-hooks/exhaustive-deps.
    const animCleanupRef = animationCleanupRef;
    const silenceRef = silenceTimerRef;
    return () => {
      animCleanupRef.current?.();
      if (silenceRef.current) {
        clearTimeout(silenceRef.current);
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

  useEffect(() => {
    const activeBookmarkState: Record<string, string | null> = {};
    for (const bookmark of sessionBookmarksQuery.data ?? []) {
      activeBookmarkState[bookmark.eventId] = bookmark.bookmarkId;
    }
    bookmarkStateRef.current = activeBookmarkState;
    setBookmarkState(activeBookmarkState);
  }, [sessionBookmarksQuery.data, activeSessionId, routeSessionId]);

  // '' is intentional: all consumers gate on truthiness or convert via `|| undefined`
  // before use as a route param or API argument (see ensureSession, writeSessionRecoveryMarker).
  const effectiveSubjectId = classifiedSubject?.subjectId ?? subjectId ?? '';
  const effectiveSubjectName = classifiedSubject?.subjectName ?? subjectName;
  const noteSubjectId =
    effectiveSubjectId ||
    liveTranscript?.session.subjectId ||
    activeSession.data?.subjectId ||
    undefined;
  const noteTopicId =
    topicId ??
    liveTranscript?.session.topicId ??
    activeSession.data?.topicId ??
    undefined;
  const activeSubject = availableSubjects.find(
    (availableSubject) => availableSubject.id === effectiveSubjectId,
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
    const [firstSubject] = availableSubjects;
    if (firstSubject) {
      setTopicSwitcherSubjectId((current) => current ?? firstSubject.id);
    }
  }, [availableSubjects, effectiveSubjectId]);

  const apiClient = useApiClient();
  const classifySubject = useClassifySubject();
  const resolveSubject = useResolveSubject();
  const createNote = useCreateNote(noteSubjectId, undefined);
  const filing = useFiling();
  const startSession = useStartSession(effectiveSubjectId);
  const closeSession = useCloseSession(activeSessionId ?? '');
  const { stream: streamMessage } = useStreamMessage(activeSessionId ?? '');
  const activeHomeworkProblem = homeworkProblemsState[currentProblemIndex];
  const sessionExpired =
    !!routeSessionId && transcript.error instanceof NotFoundError;

  const showConfirmation = useCallback((message: string) => {
    setConfirmationToast(message);
  }, []);

  const createLocalMessageId = useCallback((prefix: 'user' | 'ai') => {
    localMessageIdRef.current += 1;
    return `${prefix}-${Date.now()}-${localMessageIdRef.current}`;
  }, []);

  useEffect(() => {
    if (!routeSessionId || !liveTranscript) return;

    const transcriptMessages = liveTranscript.exchanges
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
        : // [M-7] Use the ref so late-arriving streak data (which changes
          // openingContent reactively) doesn't re-trigger this effect and
          // wipe out in-progress conversation messages.
          [
            {
              id: 'opening',
              role: 'assistant',
              content: openingContentRef.current,
            },
          ],
    );
    setExchangeCount(liveTranscript.session.exchangeCount);
    setEscalationRung(
      liveTranscript.exchanges
        .filter((entry) => entry.role === 'assistant' && !entry.isSystemPrompt)
        .at(-1)?.escalationRung ?? 1,
    );
    setInputMode(liveTranscript.session.inputMode ?? 'text');
    setActiveSessionId(routeSessionId);
    setResumedBanner(true);
  }, [liveTranscript, routeSessionId]);

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
          liveTranscript?.session.milestonesReached ?? [];
        if (transcriptMilestones.length > 0) {
          hydrate(
            createMilestoneTrackerStateFromMilestones(transcriptMilestones),
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
    liveTranscript?.session.milestonesReached,
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
          activeProfile?.id,
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
    topicName,
  ]);

  useEffect(() => {
    if (!imageUri) return;
    // Capture as a narrowed const so the inner async closure sees a defined
    // string without re-asserting non-null at every reference.
    const uri = imageUri;
    let cancelled = false;

    async function convertImage() {
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
        if (!cancelled) {
          imageBase64Ref.current = base64;
          // [IMP-1] Prefer route-supplied mimeType from image picker over
          // extension sniffing. Camera captures are always JPEG; gallery
          // picks provide OS-level mimeType. Falls back to extension
          // sniffing for backward compat with deep links or missing values.
          const ext = uri.split('.').pop()?.toLowerCase();
          const mimeType: 'image/jpeg' | 'image/png' | 'image/webp' =
            imageMimeType === 'image/png'
              ? 'image/png'
              : imageMimeType === 'image/webp'
                ? 'image/webp'
                : imageMimeType?.includes('jpeg') ||
                    imageMimeType?.includes('jpg')
                  ? 'image/jpeg'
                  : ext === 'png'
                    ? 'image/png'
                    : ext === 'webp'
                      ? 'image/webp'
                      : 'image/jpeg';
          imageMimeTypeRef.current = mimeType;
        }
      } catch (err) {
        console.warn('[Session] Failed to read image as base64:', err);
      }
    }

    void convertImage();
    return () => {
      cancelled = true;
    };
  }, [imageUri, imageMimeType]);

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
    resumeFromSessionId: resumeFromSessionId ?? undefined,
    gaps,
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
    setLowConfidenceMessageId,
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
    imageBase64Ref,
    imageMimeTypeRef,
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
    [messages],
  );

  const hasSubject = !!(classifiedSubject?.subjectId || subjectId);
  const conversationStage = getConversationStage(
    userMessageCount,
    hasSubject,
    effectiveMode,
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
        void handleSend(problemText, {
          isAutoSent: true,
          imageUri: imageUri ?? undefined,
        });
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [problemText, handleSend, routeSessionId, imageUri]);

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
    returnTo: returnTo ?? undefined,
  });

  const latestAiMessageId = useMemo(
    () =>
      isStreaming
        ? null
        : ([...messages]
            .reverse()
            .find(
              (message) => message.role === 'assistant' && !message.streaming,
            )?.id ?? null),
    [messages, isStreaming],
  );

  const aiResponseCount = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.role === 'assistant' &&
          !message.streaming &&
          !message.isSystemPrompt &&
          !!message.eventId,
      ).length,
    [messages],
  );

  const updateBookmarkEntry = useCallback(
    (eventId: string, value: string | null) => {
      setBookmarkState((prev) => {
        const next = { ...prev, [eventId]: value };
        bookmarkStateRef.current = next;
        return next;
      });
    },
    [],
  );

  const handleToggleBookmark = useCallback(
    async (message: ChatMessage) => {
      const eventId = message.eventId;
      if (!eventId) return;

      const existingBookmarkId = bookmarkStateRef.current[eventId] ?? null;
      if (existingBookmarkId === 'pending') {
        return;
      }

      if (existingBookmarkId) {
        updateBookmarkEntry(eventId, null);
        try {
          await deleteBookmark.mutateAsync(existingBookmarkId);
        } catch (error) {
          updateBookmarkEntry(eventId, existingBookmarkId);
          platformAlert(
            'Could not remove bookmark',
            error instanceof Error ? error.message : 'Please try again.',
          );
        }
        return;
      }

      updateBookmarkEntry(eventId, 'pending');
      try {
        const result = await createBookmark.mutateAsync({ eventId });
        updateBookmarkEntry(eventId, result.bookmark.id);
      } catch (error) {
        updateBookmarkEntry(eventId, null);
        platformAlert(
          'Could not save bookmark',
          error instanceof Error ? error.message : 'Please try again.',
        );
      }
    },
    [createBookmark, deleteBookmark, updateBookmarkEntry],
  );

  // [UX-DE-H5] Exit button is always rendered (no gating on session existence).
  // Before session exists → "Exit" navigates home. After → normal "I'm Done".
  const endSessionButton = (
    <Pressable
      onPress={activeSessionId ? handleEndSession : handleHomeBack}
      disabled={isClosing || isStreaming}
      className="ms-2 px-3 py-2 rounded-button bg-surface-elevated min-h-[44px] items-center justify-center"
      testID="end-session-button"
      accessibilityLabel={activeSessionId ? "I'm done" : 'Exit'}
      accessibilityRole="button"
    >
      <Text className="text-body-sm font-semibold text-text-secondary">
        {isClosing ? 'Wrapping up...' : activeSessionId ? "I'm Done" : 'Exit'}
      </Text>
    </Pressable>
  );

  const learningModeOptions: Array<{
    mode: LearningMode;
    title: string;
    description: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      mode: 'casual',
      title: t('more.learningMode.casual.title'),
      description: t('more.learningMode.casual.description'),
      icon: 'compass-outline',
    },
    {
      mode: 'serious',
      title: t('more.learningMode.serious.title'),
      description: t('more.learningMode.serious.description'),
      icon: 'trophy-outline',
    },
  ];
  const selectedLearningMode = learningModeOptions.find(
    (option) => option.mode === learningMode,
  );
  const learningModeButtonDisabled =
    !learningMode || learningModeLoading || updateLearningMode.isPending;
  const handleSelectLearningMode = (nextMode: LearningMode) => {
    if (updateLearningMode.isPending) return;
    if (nextMode === learningMode) {
      setShowLearningModeSheet(false);
      return;
    }
    updateLearningMode.mutate(nextMode, {
      onSuccess: () => {
        setShowLearningModeSheet(false);
      },
      onError: () => {
        platformAlert(
          t('more.errors.couldNotSaveSetting'),
          t('more.errors.tryAgain'),
        );
      },
    });
  };
  const learningModeButton = (
    <Pressable
      onPress={() => setShowLearningModeSheet(true)}
      disabled={learningModeButtonDisabled}
      className={`ms-1 px-2 py-2 rounded-button bg-surface-elevated min-h-[44px] min-w-[44px] items-center justify-center flex-row ${
        learningModeButtonDisabled ? 'opacity-50' : ''
      }`}
      accessibilityRole="button"
      accessibilityLabel={
        selectedLearningMode
          ? `Learning mode: ${selectedLearningMode.title}`
          : 'Learning mode loading'
      }
      accessibilityState={{ disabled: learningModeButtonDisabled }}
      testID="learning-mode-header-button"
    >
      <Ionicons
        name={selectedLearningMode?.icon ?? 'options-outline'}
        size={20}
        color={colors.textSecondary}
      />
      {selectedLearningMode ? (
        <Text className="ms-1 text-caption font-semibold text-text-secondary">
          {selectedLearningMode.title}
        </Text>
      ) : null}
    </Pressable>
  );

  const headerRight = (
    <View className="flex-row items-center">
      {modeConfig.showTimer && <SessionTimer />}
      {learningModeButton}
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
          ? getResumeBannerCopy(topicName)
          : apiChecked && !isApiReachable
            ? 'Server unreachable - messages may fail'
            : modeConfig.subtitle;

  // [M6] Retry chip shown below the header when subject classification failed.
  const classifyErrorChip = classifyError ? (
    <View className="flex-row items-center gap-2 px-4 pb-2">
      <Pressable
        onPress={() => {
          setClassifyError(null);
          if (lastRetryPayloadRef.current) {
            void handleSend(lastRetryPayloadRef.current.text);
          }
        }}
        className="bg-surface-elevated rounded-full px-3 py-1.5 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="Retry classification"
        testID="classify-error-retry"
      >
        <Text className="text-body-sm font-semibold text-text-secondary">
          Retry classification
        </Text>
      </Pressable>
    </View>
  ) : null;

  const topicHeaderStrip = topicName ? (
    <SessionTopicHeader
      topicName={topicName}
      onChangeTopic={() => setShowTopicSwitcher(true)}
    />
  ) : null;

  const showSkipWarmup =
    activeSession.data?.metadata?.continuationDepth === 'low' ||
    activeSession.data?.metadata?.continuationDepth === 'mid' ||
    activeSession.data?.metadata?.continuationDepth === 'high';
  const skipWarmupChip = showSkipWarmup ? (
    <View className="flex-row items-center gap-2 px-4 pb-2">
      <Pressable
        onPress={async () => {
          try {
            await clearContinuationDepth.mutateAsync();
          } catch {
            platformAlert('Could not skip warm-up', 'Please try again.');
          }
        }}
        disabled={clearContinuationDepth.isPending}
        className="bg-surface-elevated rounded-full px-3 py-1.5 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="Skip the warm-up, jump in"
        testID="session-skip-warmup"
      >
        <Text className="text-body-sm font-semibold text-text-secondary">
          Skip the warm-up, jump in
        </Text>
      </Pressable>
    </View>
  ) : null;

  const headerBelow =
    topicHeaderStrip || classifyErrorChip || skipWarmupChip ? (
      <View className="gap-2">
        {topicHeaderStrip}
        {classifyErrorChip}
        {skipWarmupChip}
      </View>
    ) : null;

  const sessionToolAccessory = (
    <SessionToolAccessory
      isStreaming={isStreaming}
      handleQuickChip={handleQuickChip}
      stage={conversationStage}
    />
  );

  const isSubjectFlowBlockingComposer =
    pendingClassification || !!pendingSubjectResolution;

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

  const renderMessageActions = (message: ChatMessage): React.ReactNode => {
    // [M5] Session-expired message: offer escape actions instead of normal chips.
    if (message.kind === 'session_expired') {
      return (
        <View className="flex-row gap-2 mt-2">
          <Pressable
            onPress={handleStartNewSession}
            className="bg-primary rounded-button px-4 py-2.5 items-center justify-center min-h-[40px]"
            accessibilityRole="button"
            accessibilityLabel="Start new session"
            testID="session-expired-new-session"
          >
            <Text className="text-body-sm font-semibold text-text-inverse">
              Start new session
            </Text>
          </Pressable>
          <Pressable
            onPress={handleHomeBack}
            className="bg-surface-elevated rounded-button px-4 py-2.5 items-center justify-center min-h-[40px]"
            accessibilityRole="button"
            accessibilityLabel="Go Home"
            testID="session-expired-go-home"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              Go Home
            </Text>
          </Pressable>
        </View>
      );
    }

    const messageActions = (
      <SessionMessageActions
        message={message}
        isStreaming={isStreaming}
        latestAiMessageId={latestAiMessageId}
        consumedQuickChipMessageId={consumedQuickChipMessageId}
        userMessageCount={userMessageCount}
        showWrongSubjectChip={showWrongSubjectChip}
        messageFeedback={messageFeedback}
        bookmarkState={bookmarkState}
        quotaError={quotaError}
        isOwner={activeProfile?.isOwner === true}
        stage={conversationStage}
        handleQuickChip={handleQuickChip}
        handleMessageFeedback={handleMessageFeedback}
        onToggleBookmark={handleToggleBookmark}
        handleReconnect={handleReconnect}
      />
    );

    // F6: Confidence indicator — shown only when the LLM reports low confidence
    // on this specific AI message. Dismissed when the learner taps it (sends a
    // follow-up) or when a new exchange completes (lowConfidenceMessageId resets).
    // Copy varies by age bracket so the metacognitive prompt fits the learner's
    // voice — younger ages get softer phrasing, adults get more direct.
    const showConfidenceIndicator =
      message.id === lowConfidenceMessageId &&
      !message.streaming &&
      !isStreaming;
    const confidenceCopy = getConfidenceCopy(activeProfile?.birthYear ?? null);
    const confidenceIndicator = showConfidenceIndicator ? (
      <Pressable
        onPress={() => {
          setLowConfidenceMessageId(null);
          void continueWithMessage(confidenceCopy.retryMessage);
        }}
        className="rounded-full bg-surface-elevated px-3 py-1.5 self-start mt-1"
        testID="confidence-low-indicator"
        accessibilityRole="button"
        accessibilityLabel={confidenceCopy.accessibilityLabel}
      >
        <Text className="text-caption font-semibold text-text-secondary">
          {confidenceCopy.label}
        </Text>
      </Pressable>
    ) : null;

    if (!messageActions && !confidenceIndicator) return null;
    if (!messageActions) return confidenceIndicator;
    if (!confidenceIndicator) return messageActions;
    return (
      <View className="gap-1">
        {messageActions}
        {confidenceIndicator}
      </View>
    );
  };

  return (
    <View className="flex-1">
      <ChatShell
        title={modeConfig.title}
        subtitle={subtitle}
        headerBelow={headerBelow}
        placeholder={modeConfig.placeholder}
        backFallback={chatBackFallback}
        backBehavior={chatBackFallback ? 'replace' : undefined}
        onBackPress={handleChatBackPress}
        messages={messages}
        onSend={handleSend}
        isStreaming={isStreaming}
        inputDisabled={
          isOffline ||
          isSubjectFlowBlockingComposer ||
          sessionExpired ||
          !!quotaError ||
          // CR-6: Disable input while session close is in flight.
          isClosing
        }
        showDisabledBanner={
          pendingClassification || !isSubjectFlowBlockingComposer
        }
        disabledReason={
          isOffline
            ? "You're offline — input will return when you reconnect"
            : sessionExpired
              ? 'This session has ended'
              : quotaError
                ? 'Your session limit has been reached'
                : pendingClassification
                  ? t('session.chatShell.classifyingSubject')
                  : undefined
        }
        verificationType={liveTranscript?.session.verificationType ?? undefined}
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
        belowInput={
          isSubjectFlowBlockingComposer ||
          isOffline ||
          sessionExpired ||
          !!quotaError ||
          isClosing
            ? null
            : sessionToolAccessory
        }
        onDraftChange={setDraftText}
        renderMessageActions={renderMessageActions}
        speechRecognitionLanguage={languageVoiceLocale}
        textToSpeechLanguage={languageVoiceLocale}
        footer={
          <>
            <BookmarkNudgeTooltip
              aiResponseCount={aiResponseCount}
              isFirstSession={
                (progressInventory.data?.global.totalSessions ?? 0) === 0
              }
              profileId={activeProfile?.id}
            />
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
              homeHref={homeBackHref}
              sessionExpired={sessionExpired}
              notePromptOffered={notePromptOffered}
              showNoteInput={showNoteInput}
              setShowNoteInput={setShowNoteInput}
              sessionNoteSavedRef={sessionNoteSavedRef}
              topicId={noteTopicId}
              sessionId={activeSessionId ?? undefined}
              createNote={createNote}
              colors={colors}
              userMessageCount={userMessageCount}
              showQuestionCount={modeConfig.showQuestionCount}
              showBookLink={showBookLink}
            />
          </>
        }
      />
      <Modal
        visible={showLearningModeSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLearningModeSheet(false)}
        testID="learning-mode-modal"
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => setShowLearningModeSheet(false)}
          testID="learning-mode-sheet-backdrop"
        >
          <Pressable
            className="bg-background rounded-t-card px-5 pt-4 pb-6"
            onPress={() => undefined}
            testID="learning-mode-sheet"
          >
            <Text className="text-title-sm font-semibold text-text-primary mb-1">
              {t('more.learningMode.sheetTitle')}
            </Text>
            <Text
              className="text-caption text-text-secondary mb-3"
              testID="learning-mode-next-message-copy"
            >
              {t('more.learningMode.sheetEffectMessage')}
            </Text>
            {learningModeOptions.map((option) => {
              const selected = learningMode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  onPress={() => handleSelectLearningMode(option.mode)}
                  disabled={updateLearningMode.isPending}
                  className={`bg-surface rounded-card px-4 py-3.5 mb-2 border-2 ${
                    selected ? 'border-primary' : 'border-transparent'
                  } ${updateLearningMode.isPending ? 'opacity-50' : ''}`}
                  accessibilityLabel={`${option.title}: ${option.description}`}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected,
                    disabled: updateLearningMode.isPending,
                  }}
                  testID={`session-learning-mode-${option.mode}`}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                      <Ionicons
                        name={option.icon}
                        size={20}
                        color={colors.textSecondary}
                      />
                      <Text className="ms-2 text-body font-semibold text-text-primary">
                        {option.title}
                      </Text>
                    </View>
                    {selected ? (
                      <Text className="text-primary text-body font-semibold">
                        {t('more.active')}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-body-sm text-text-secondary mt-1">
                    {option.description}
                  </Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
      {activeProfile?.id ? (
        <OutboxFailedBanner profileId={activeProfile.id} flow="session" />
      ) : null}
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
          className="absolute left-4 right-4 z-50 items-center"
          style={{
            pointerEvents: 'none',
            bottom: Math.max(insets.bottom, 16) + 88,
          }}
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
