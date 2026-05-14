import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { platformAlert } from '../../../lib/platform-alert';
import { goBackOrReplace, homeHrefForReturnTo } from '../../../lib/navigation';
import { firstParam } from '../../../lib/route-params';
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
import { useActiveSessionForTopic } from '../../../hooks/use-progress';
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
import {
  useApiClient,
  NotFoundError,
  type QuotaExceededDetails,
} from '../../../lib/api-client';
import { useThemeColors } from '../../../lib/theme';
import { useCreateNote } from '../../../hooks/use-notes';
import { getVoiceLocaleForLanguage } from '../../../lib/language-locales';
import { useProfile } from '../../../lib/profile';
import * as SecureStore from '../../../lib/secure-storage';
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
import { OutboxFailedBanner } from '../../../components/durability/OutboxFailedBanner';
import { useTranslation } from 'react-i18next';
import { SessionErrorBoundary } from './_components/SessionErrorBoundary';
import { ConfirmationToast } from './_components/ConfirmationToast';
import { useLearningModeControl } from './_components/LearningModeControl';
import { useImageBase64 } from './_hooks/use-image-base64';
import { useBookmarkHandler } from './_hooks/use-bookmark-handler';
import { useSessionRecovery } from './_hooks/use-session-recovery';
import { renderSessionMessageActions } from './_components/MessageActionsRenderer';

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
      },
    } as Href);
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
  const { imageBase64Ref, imageMimeTypeRef } = useImageBase64(
    imageUri,
    imageMimeType,
  );
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
  const learnerTurnCount = Math.max(userMessageCount, exchangeCount);

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

  const { button: learningModeButton, sheet: learningModeSheet } =
    useLearningModeControl();

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
      onAddNote={() => setShowNoteInput(true)}
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
        isOwner: activeProfile?.isOwner === true,
        stage: conversationStage,
        handleQuickChip,
        handleMessageFeedback,
        onToggleBookmark: handleToggleBookmark,
        handleReconnect,
      },
    });

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
      {learningModeSheet}
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
