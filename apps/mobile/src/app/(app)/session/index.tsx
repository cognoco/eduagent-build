import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { platformAlert } from '../../../lib/platform-alert';
import { goBackOrReplace } from '../../../lib/navigation';
import { shouldShowBookLink } from '../../../lib/show-book-link';
import {
  useRouter,
  useLocalSearchParams,
  useFocusEffect,
  type Href,
} from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  HomeworkCaptureSource,
  HomeworkProblem,
  InputMode,
  PendingCelebration,
  ChallengeRoundSessionState,
} from '@eduagent/schemas';
import {
  ChatShell,
  animateResponse,
  getModeConfig,
  getOpeningMessage,
  FluencyDrillStrip,
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
import { useActiveSessionForTopic } from '../../../hooks/use-progress';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import {
  useTotalTopicsCompleted,
  useIsFirstSession,
} from '../../../hooks/use-session-context';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import { useApiReachability } from '../../../hooks/use-api-reachability';
import { useCelebrationLevel } from '../../../hooks/use-settings';
import { useLearnerProfile } from '../../../hooks/use-learner-profile';
import { useCelebration } from '../../../hooks/use-celebration';
import { useSubjects, useCreateSubject } from '../../../hooks/use-subjects';
import { useCurriculum } from '../../../hooks/use-curriculum';
import { useMilestoneTracker } from '../../../hooks/use-milestone-tracker';
import { useChallengeRound } from '../../../hooks/use-challenge-round';
import {
  useApiClient,
  type QuotaExceededDetails,
} from '../../../lib/api-client';
import { classifyApiError } from '../../../lib/format-api-error';
import { useThemeColors } from '../../../lib/theme';
import { useCreateNote } from '../../../hooks/use-notes';
import { getVoiceLocaleForLanguage } from '../../../lib/language-locales';
import { useProfile } from '../../../lib/profile';
import * as SecureStore from '../../../lib/secure-storage';
import {
  getInputModeKey,
  getConversationStage,
  type MessageFeedbackState,
  type PendingSubjectResolution,
} from '../../../components/session/session-types';
import {
  useSessionStreaming,
  type ContinueMessageOptions,
} from '../../../components/session/use-session-streaming';
import { ChallengeOfferCard } from '../../../components/session/ChallengeOfferCard';
import { ChallengeRoundBanner } from '../../../components/session/ChallengeRoundBanner';
import { DraftedNoteReview } from '../../../components/session/DraftedNoteReview';
import { useSubjectClassification } from '../../../components/session/use-subject-classification';
import { useSessionActions } from '../../../components/session/use-session-actions';
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
import { OutboxFailedBanner } from '../../../components/durability/OutboxFailedBanner';
import { useTranslation } from 'react-i18next';
import { track } from '../../../lib/analytics';
import { SessionErrorBoundary } from './_components/SessionErrorBoundary';
import { ConfirmationToast } from './_components/ConfirmationToast';
import { SessionScreenChrome } from './_components/SessionScreenChrome';
import { useImageBase64 } from './_hooks/use-image-base64';
import { useBookmarkHandler } from './_hooks/use-bookmark-handler';
import { useSessionRecovery } from './_hooks/use-session-recovery';
import { useSessionTranscriptHydration } from './_hooks/use-session-transcript-hydration';
import { renderSessionMessageActions } from './_components/MessageActionsRenderer';
import {
  countLearnerMessages,
  countPersistedAiResponses,
  deriveSessionSubjectState,
  getLatestAiMessageId,
  getLearnerTurnCount,
} from './_view-models/session-derived-state';
import { getSessionRouteParams } from './_view-models/session-route-params';
import type {
  ChallengeRoundOfferEvent,
  DraftedChallengeNoteEvent,
} from '../../../lib/sse';

function isChallengeRoundInFlight(
  round: ChallengeRoundSessionState | null,
): boolean {
  return (
    round?.state === 'offered' ||
    round?.state === 'accepted' ||
    round?.state === 'active' ||
    round?.state === 'drafting'
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
    recap,
    resumeFromSessionId,
    gaps: rawGaps,
    returnTo: rawReturnTo,
    returnId: rawReturnId,
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
    returnTo?: string | string[];
    returnId?: string | string[];
    verificationType?: string;
    imageUri?: string;
    imageMimeType?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const navigationContract = useNavigationContract();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const {
    effectiveMode,
    imageUri,
    imageMimeType,
    returnTo,
    returnId,
    gaps,
    normalizedOcrText,
    homeworkCaptureSource,
    initialHomeworkProblems,
    initialProblemText,
    homeBackHref,
    chatBackFallback,
  } = useMemo(
    () =>
      getSessionRouteParams({
        mode,
        subjectId,
        problemText,
        homeworkProblems,
        ocrText,
        captureSource,
        gaps: rawGaps,
        returnTo: rawReturnTo,
        returnId: rawReturnId,
        imageUri: rawImageUri,
        imageMimeType: rawImageMimeType,
      }),
    [
      captureSource,
      homeworkProblems,
      mode,
      ocrText,
      problemText,
      rawGaps,
      rawImageMimeType,
      rawImageUri,
      rawReturnId,
      rawReturnTo,
      subjectId,
    ],
  );
  // [BUG-867] String-templated dynamic paths (`/(app)/shelf/${subjectId}`)
  // don't always resolve on web — the chevron looked clickable but the URL
  // never changed. Supplying an explicit handler that uses Expo Router's
  // typed object form makes the navigation reliable across web + native.
  const handleChatBackPress = useCallback(() => {
    if (returnTo) {
      router.replace(homeBackHref as Href);
      return;
    }
    if (subjectId) {
      router.replace({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId },
      } as Href);
      return;
    }
    router.replace('/(app)/home' as Href);
  }, [returnTo, subjectId, homeBackHref, router]);
  const handleHomeBack = useCallback(() => {
    if (returnTo) {
      router.replace(homeBackHref as Href);
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
        ...(returnId ? { returnId } : {}),
      },
    } as Href);
  }, [
    mode,
    returnId,
    returnTo,
    router,
    subjectId,
    subjectName,
    topicId,
    topicName,
  ]);
  const modeConfig = getModeConfig(effectiveMode);
  const { data: streak } = useStreaks();
  const totalTopicsCompleted = useTotalTopicsCompleted();
  const isFirstSession = useIsFirstSession();
  const { data: celebrationLevel = 'all' } = useCelebrationLevel();
  const { data: learnerProfile } = useLearnerProfile();
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
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // [BUG-919] Hide the "Go to the Library" hint once the conversation
  // starts. See shouldShowBookLink for the full rationale.
  const showBookLink = shouldShowBookLink({
    effectiveMode,
    totalTopicsCompleted,
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
    null,
  );
  const [notePromptOffered, setNotePromptOffered] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [fluencyDrill, setFluencyDrill] = useState<FluencyDrillEvent | null>(
    null,
  );
  const [challengeRound, setChallengeRound] =
    useState<ChallengeRoundSessionState | null>(null);
  const [challengeOffer, setChallengeOffer] =
    useState<ChallengeRoundOfferEvent | null>(null);
  const [draftedNote, setDraftedNote] =
    useState<DraftedChallengeNoteEvent | null>(null);
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
    options?: ContinueMessageOptions;
    outboxEntryId?: string;
  } | null>(null);
  const challengeActionInFlightRef = useRef(false);

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
  const hasLocalLearnerTurn = messages.some(
    (message) => message.role === 'user' && !message.eventId,
  );
  const shouldLookupActiveSession =
    effectiveMode === 'learning' &&
    !!topicId &&
    !routeSessionId &&
    !activeSessionId &&
    !isStreaming &&
    !hasLocalLearnerTurn;
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

  const { bookmarkState, handleToggleBookmark } = useBookmarkHandler({
    sessionId: activeSessionId ?? routeSessionId ?? undefined,
  });
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
  const { imageBase64Ref, imageMimeTypeRef, imageAttachmentStatus } =
    useImageBase64(imageUri, imageMimeType);
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
      setChallengeRound(null);
      setChallengeOffer(null);
      setDraftedNote(null);
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
      hasHydratedRecoveryRef,
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

  // '' is intentional: all consumers gate on truthiness or convert via `|| undefined`
  // before use as a route param or API argument (see ensureSession, writeSessionRecoveryMarker).
  const {
    effectiveSubjectId,
    effectiveSubjectName,
    noteSubjectId,
    noteTopicId,
  } = deriveSessionSubjectState({
    classifiedSubject,
    routeSubjectId: subjectId,
    routeSubjectName: subjectName ?? undefined,
    transcriptSubjectId: liveTranscript?.session.subjectId ?? undefined,
    activeSessionSubjectId: activeSession.data?.subjectId ?? undefined,
    routeTopicId: topicId ?? undefined,
    transcriptTopicId: liveTranscript?.session.topicId ?? undefined,
    activeSessionTopicId: activeSession.data?.topicId ?? undefined,
  });
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
  const challengeRoundActions = useChallengeRound({
    sessionId: activeSessionId,
    topicId: noteTopicId || topicId || undefined,
    subjectId: noteSubjectId || effectiveSubjectId || undefined,
  });
  const filing = useFiling();
  const startSession = useStartSession(effectiveSubjectId);
  const closeSession = useCloseSession(activeSessionId ?? '');
  const { stream: streamMessage } = useStreamMessage(activeSessionId ?? '');
  const activeHomeworkProblem = homeworkProblemsState[currentProblemIndex];
  const sessionExpired =
    !!routeSessionId &&
    classifyApiError(transcript.error).category === 'not-found';

  useEffect(() => {
    const round = activeSession.data?.metadata?.challengeRound;
    if (round) {
      setChallengeRound(round);
    }
  }, [activeSession.data?.metadata?.challengeRound]);

  const showConfirmation = useCallback((message: string) => {
    setConfirmationToast(message);
  }, []);

  const createLocalMessageId = useCallback((prefix: 'user' | 'ai') => {
    localMessageIdRef.current += 1;
    return `${prefix}-${Date.now()}-${localMessageIdRef.current}`;
  }, []);

  useSessionTranscriptHydration({
    routeSessionId,
    liveTranscript,
    messagesRef,
    openingContentRef,
    setMessages,
    setExchangeCount,
    setEscalationRung,
    setInputMode,
    setActiveSessionId,
    setResumedBanner,
  });

  useEffect(() => {
    if (!sessionExpired) return;

    setMessages([
      {
        id: 'session-expired',
        role: 'assistant',
        content: t('session.expiredSystemMessage'),
        isSystemPrompt: true,
        kind: 'session_expired',
      },
    ]);
    setResumedBanner(false);
  }, [sessionExpired, t]);

  useSessionRecovery({
    activeProfileId: activeProfile?.id,
    activeSessionId,
    routeSessionId,
    effectiveMode,
    effectiveSubjectId,
    effectiveSubjectName,
    topicId,
    topicName,
    trackerState,
    liveTranscriptMilestones: liveTranscript?.session.milestonesReached,
    hydrate,
    hasHydratedRecoveryRef,
  });

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
    setChallengeRound,
    setChallengeOffer,
    setDraftedNote,
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
    () => countLearnerMessages(messages),
    [messages],
  );
  // Resumed sessions can receive exchangeCount before UI message history
  // hydrates; keep the server turn count so returning learners stay in-loop.
  const learnerTurnCount = getLearnerTurnCount({
    userMessageCount,
    exchangeCount,
  });

  const hasSubject = !!(classifiedSubject?.subjectId || subjectId);
  const conversationStage = getConversationStage(
    learnerTurnCount,
    hasSubject,
    effectiveMode,
  );

  const {
    handleResolveSubject,
    handleCreateResolveSuggestion,
    handleCreateSuggestedSubject,
    handleTypeSubject,
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
    if (initialProblemText && !routeSessionId && !hasAutoSentRef.current) {
      if (imageUri && imageAttachmentStatus === 'loading') {
        return undefined;
      }

      // [HOMEWORK-06] If the learner attached a photo but conversion failed
      // or timed out (>2.5s), surface a visible system message and emit a
      // structured analytics event before falling back to text-only auto-send.
      // Silent fallback is banned by CLAUDE.md "Fix Development Rules".
      const imageAttachFailed =
        !!imageUri &&
        (imageAttachmentStatus === 'failed' ||
          imageAttachmentStatus === 'timeout');

      const timer = setTimeout(() => {
        if (hasAutoSentRef.current) return;
        hasAutoSentRef.current = true;

        if (imageAttachFailed) {
          track('homework_image_attach_dropped', {
            reason: imageAttachmentStatus,
            captureSource: homeworkCaptureSource ?? null,
            hasOcrText: !!normalizedOcrText,
          });
          setMessages((prev) => [
            ...prev,
            {
              id: createLocalMessageId('ai'),
              role: 'assistant',
              content:
                imageAttachmentStatus === 'timeout'
                  ? "Your photo took too long to load, so I'm starting with the text only. If something looks off, tap the camera again to retry."
                  : "I couldn't open your photo, so I'm starting with the text only. If something looks off, tap the camera again to retry.",
              isSystemPrompt: true,
            },
          ]);
        }

        // BUG-373: Mark homework auto-send as auto-sent
        // [WI-87 review / DS-195 defense-in-depth] Only forward imageUri to
        // the send pipeline (which both attaches the base64 to the LLM call
        // AND renders the URI inline in the chat thread via
        // ChatShell's <Image>) when the URI passed the useImageBase64
        // allowlist — `imageAttachmentStatus === 'ready'` is true iff the
        // hook successfully read the file, which only happens for URIs the
        // allowlist accepted. Without this gate, a deep-link-controlled
        // URI rejected by the read step would still flow to <Image source>
        // and render an attacker-pointed file inline.
        const safeImageUri =
          imageAttachmentStatus === 'ready'
            ? (imageUri ?? undefined)
            : undefined;
        void handleSend(initialProblemText, {
          isAutoSent: true,
          imageUri: safeImageUri,
          attachImage: imageAttachmentStatus === 'ready',
        });
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [
    initialProblemText,
    handleSend,
    routeSessionId,
    imageUri,
    imageAttachmentStatus,
    createLocalMessageId,
    homeworkCaptureSource,
    normalizedOcrText,
  ]);

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

  const applyChallengeRouteResponse = useCallback(
    (response: { challengeRound?: ChallengeRoundSessionState } | undefined) => {
      if (response?.challengeRound) {
        setChallengeRound(response.challengeRound);
      }
      setChallengeOffer(null);
    },
    [],
  );

  const runChallengeAction = useCallback(
    async (
      action: () => Promise<{ challengeRound?: ChallengeRoundSessionState }>,
      title: string,
    ) => {
      if (challengeActionInFlightRef.current) return;
      challengeActionInFlightRef.current = true;
      try {
        const response = await action();
        applyChallengeRouteResponse(response);
      } catch {
        platformAlert(title, 'Please try again.');
      } finally {
        challengeActionInFlightRef.current = false;
      }
    },
    [applyChallengeRouteResponse],
  );

  const handleAcceptChallengeRound = useCallback(() => {
    void runChallengeAction(
      () => challengeRoundActions.accept(),
      "Couldn't start the challenge round",
    );
  }, [challengeRoundActions, runChallengeAction]);

  const handleDeclineChallengeRound = useCallback(
    (dontAskAgain: boolean) => {
      void runChallengeAction(
        () => challengeRoundActions.decline(dontAskAgain),
        "Couldn't update the challenge round",
      );
    },
    [challengeRoundActions, runChallengeAction],
  );

  const handleSaveDraftedNote = useCallback(
    async (content: string) => {
      if (challengeActionInFlightRef.current) return;
      challengeActionInFlightRef.current = true;
      try {
        await challengeRoundActions.saveNote(content);
        setDraftedNote(null);
        showConfirmation('Note saved.');
      } catch {
        platformAlert("Couldn't save the note", 'Please try again.');
      } finally {
        challengeActionInFlightRef.current = false;
      }
    },
    [challengeRoundActions, showConfirmation],
  );

  const handleSkipDraftedNote = useCallback(() => {
    setDraftedNote(null);
    void challengeRoundActions.skipNote();
  }, [challengeRoundActions]);

  const latestAiMessageId = useMemo(
    () => getLatestAiMessageId({ messages, isStreaming }),
    [messages, isStreaming],
  );

  const aiResponseCount = useMemo(
    () => countPersistedAiResponses(messages),
    [messages],
  );

  const showSkipWarmup =
    activeSession.data?.metadata?.continuationDepth === 'low' ||
    activeSession.data?.metadata?.continuationDepth === 'mid' ||
    activeSession.data?.metadata?.continuationDepth === 'high';
  const handleRetryClassification = useCallback(() => {
    setClassifyError(null);
    if (lastRetryPayloadRef.current) {
      void handleSend(lastRetryPayloadRef.current.text);
    }
  }, [handleSend]);
  const handleChangeTopic = useCallback(() => {
    setShowTopicSwitcher(true);
  }, []);
  const handleSkipWarmup = useCallback(async () => {
    try {
      await clearContinuationDepth.mutateAsync();
    } catch {
      platformAlert('Could not skip warm-up', 'Please try again.');
    }
  }, [clearContinuationDepth]);

  const { headerRight, headerBelow, subtitle } = SessionScreenChrome({
    activeSessionId,
    isClosing,
    isStreaming,
    showFilingPrompt,
    modeSubtitle: modeConfig.subtitle,
    showTimer: modeConfig.showTimer,
    milestoneCount: milestonesReached.length,
    pendingClassification,
    classifyError,
    sessionExpired,
    resumedBanner,
    topicName,
    apiChecked,
    isApiReachable,
    showSkipWarmup,
    isSkippingWarmup: clearContinuationDepth.isPending,
    onEndSession: handleEndSession,
    onHomeBack: handleHomeBack,
    onRetryClassification: handleRetryClassification,
    onChangeTopic: handleChangeTopic,
    onSkipWarmup: handleSkipWarmup,
  });

  const isSubjectFlowBlockingComposer =
    pendingClassification || !!pendingSubjectResolution;

  const showSessionToolAccessory =
    conversationStage === 'teaching' &&
    !isSubjectFlowBlockingComposer &&
    !isOffline &&
    !sessionExpired &&
    !quotaError &&
    !isClosing;

  const sessionToolAccessory = showSessionToolAccessory ? (
    <SessionToolAccessory
      isStreaming={isStreaming}
      handleQuickChip={handleQuickChip}
      stage={conversationStage}
      onAddNote={() => setShowNoteInput(true)}
      embedded
    />
  ) : null;

  const drillStrip = fluencyDrill ? (
    <FluencyDrillStrip
      drill={fluencyDrill}
      onDismissScore={() => setFluencyDrill(null)}
    />
  ) : null;
  const challengeRoundInFlight = isChallengeRoundInFlight(challengeRound);
  const challengeBanner =
    challengeRound?.state === 'active' ? (
      <ChallengeRoundBanner
        questionIndex={challengeRound.questionIndex ?? 0}
        totalQuestions={challengeRound.totalQuestions ?? 3}
      />
    ) : null;
  const challengeOfferCard = challengeOffer ? (
    <View className="mb-3">
      <ChallengeOfferCard
        pitch={challengeOffer.pitch}
        onAccept={handleAcceptChallengeRound}
        onDecline={() => handleDeclineChallengeRound(false)}
        onDontAskAgain={() => handleDeclineChallengeRound(true)}
      />
    </View>
  ) : null;
  const draftedNoteReview = draftedNote ? (
    <View className="mb-3">
      <DraftedNoteReview
        key={draftedNote.id}
        initialContent={draftedNote.body}
        fallbackPrompt={draftedNote.fallbackPrompt}
        onSave={handleSaveDraftedNote}
        onSkip={handleSkipDraftedNote}
      />
    </View>
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
      handleTypeSubject={handleTypeSubject}
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

  const renderMessageActions = (message: ChatMessage): React.ReactNode =>
    renderSessionMessageActions(message, {
      birthYear: activeProfile?.birthYear ?? null,
      lowConfidenceMessageId,
      setLowConfidenceMessageId,
      continueWithMessage,
      handleStartNewSession,
      handleHomeBack,
      isStreaming,
      actionProps: {
        isStreaming,
        latestAiMessageId,
        consumedQuickChipMessageId,
        userMessageCount: learnerTurnCount,
        showWrongSubjectChip,
        messageFeedback,
        bookmarkState,
        quotaError,
        isOwner: navigationContract.gates.sessionIsOwner,
        stage: conversationStage,
        challengeRoundInFlight,
        handleQuickChip,
        handleMessageFeedback,
        onToggleBookmark: handleToggleBookmark,
        handleReconnect,
      },
    });

  return (
    <View className="flex-1" testID="session-screen">
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
          pendingClassification ||
          isSubjectFlowBlockingComposer ||
          sessionExpired ||
          !!quotaError ||
          (showFilingPrompt && !filingDismissed) ||
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
                : showFilingPrompt && !filingDismissed
                  ? 'Choose where to save this session'
                  : pendingClassification
                    ? t('session.chatShell.classifyingSubject')
                    : undefined
        }
        verificationType={liveTranscript?.session.verificationType ?? undefined}
        inputMode={inputMode}
        onInputModeChange={handleInputModeChange}
        rightAction={headerRight}
        footerScrollSignal={`${showFilingPrompt}-${filingDismissed}`}
        inputAccessory={
          <>
            {challengeBanner}
            {drillStrip}
            {sessionAccessory}
          </>
        }
        composerAccessory={sessionToolAccessory}
        belowInput={null}
        onDraftChange={setDraftText}
        renderMessageActions={renderMessageActions}
        speechRecognitionLanguage={languageVoiceLocale}
        textToSpeechLanguage={languageVoiceLocale}
        footer={
          <>
            {challengeOfferCard}
            {draftedNoteReview}
            <BookmarkNudgeTooltip
              aiResponseCount={aiResponseCount}
              isFirstSession={isFirstSession}
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
      <ConfirmationToast
        message={confirmationToast}
        insetsBottom={insets.bottom}
      />
      {CelebrationOverlay}
    </View>
  );
}
