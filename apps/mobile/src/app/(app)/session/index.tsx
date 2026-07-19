import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { platformAlert } from '../../../lib/platform-alert';
import { goBackOrReplace, MENTOR_RETURN_TO } from '../../../lib/navigation';
import { shouldShowBookLink } from '../../../lib/show-book-link';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
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
  GradedInputCard,
  MeaningOutputCard,
  SpeakingPracticeActivity,
  type ChatMessage,
} from '../../../components/session';
import { FirstSessionGreeting } from '../../../components/session/FirstSessionGreeting';
import { ReturningSessionGreeting } from '../../../components/session/ReturningSessionGreeting';
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
  useSubmitSummary,
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
import { nowFeedQueryKey } from '../../../hooks/use-now-feed';
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
import { useProfile } from '../../../lib/profile';
import * as SecureStore from '../../../lib/secure-storage';
import {
  getInputModeKey,
  getConversationStage,
  type MessageFeedbackState,
  type PendingSubjectResolution,
} from '../../../components/session/session-types';
import {
  mentorOpenerIdempotencyKey,
  useSessionStreaming,
  type ContinueMessageOptions,
} from '../../../components/session/use-session-streaming';
import { getOutboxEntry } from '../../../lib/message-outbox';
import { ChallengeOfferCard } from '../../../components/session/ChallengeOfferCard';
import { ChallengeRoundBanner } from '../../../components/session/ChallengeRoundBanner';
import { DraftedNoteReview } from '../../../components/session/DraftedNoteReview';
import { useSubjectClassification } from '../../../components/session/use-subject-classification';
import { useSessionActions } from '../../../components/session/use-session-actions';
import { BookmarkNudgeTooltip } from '../../../components/session/BookmarkNudgeTooltip';
import {
  SessionToolAccessory,
  SessionAccessory,
  MentorHomeworkFirstResponse,
} from '../../../components/session/SessionAccessories';
import {
  ParkingLotModal,
  TopicSwitcherModal,
} from '../../../components/session/SessionModals';
import { SessionFooter } from '../../../components/session/SessionFooter';
import { OutboxFailedBanner } from '../../../components/durability/OutboxFailedBanner';
import {
  MentorCelebration,
  RewardReceiptCard,
} from '../../../components/mentor';
import { MentorBirthAnimation } from '../../../components/common/MentorBirthAnimation';
import { useTranslation } from 'react-i18next';
import { track } from '../../../lib/analytics';
import { Sentry } from '../../../lib/sentry';
import { formatApiError } from '../../../lib/format-api-error';
import { SessionErrorBoundary } from './_components/SessionErrorBoundary';
import { ConfirmationToast } from './_components/ConfirmationToast';
import { SessionScreenChrome } from './_components/SessionScreenChrome';
import { useImageBase64 } from './_hooks/use-image-base64';
import { useBookmarkHandler } from './_hooks/use-bookmark-handler';
import { useFreeformKeepHandler } from './_hooks/use-freeform-keep-handler';
import { useSessionRecovery } from './_hooks/use-session-recovery';
import { useSessionTranscriptHydration } from './_hooks/use-session-transcript-hydration';
import { renderSessionMessageActions } from './_components/MessageActionsRenderer';
import {
  countLearnerMessages,
  countPersistedAiResponses,
  deriveSessionSubjectState,
  getLatestAiMessageId,
  getLatestBookmarkableEventId,
  getLearnerTurnCount,
  resolveLanguageVoiceLocale,
} from './_view-models/session-derived-state';
import { getSessionRouteParams } from './_view-models/session-route-params';
import { mentorBirthSeenKey } from '../../../lib/secure-store-keys';
import type {
  ChallengeRoundOfferEvent,
  DraftedChallengeNoteEvent,
  LanguageLearningActivityEvent,
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

const MENTOR_BIRTH_SESSION_TIME_SCALE = 0.35;

interface FirstSessionWrapUpCardProps {
  value: string;
  isSubmitting: boolean;
  hasError: boolean;
  reflectionTotalXp: number | null;
  celebrationEventId: string;
  seenCelebrationEventIds: ReadonlySet<string>;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onMarkCelebrationSeen: (eventId: string) => void;
}

function FirstSessionWrapUpCard({
  value,
  isSubmitting,
  hasError,
  reflectionTotalXp,
  celebrationEventId,
  seenCelebrationEventIds,
  onChangeText,
  onSubmit,
  onMarkCelebrationSeen,
}: FirstSessionWrapUpCardProps) {
  const { t } = useTranslation();
  const canSubmit = value.trim().length >= 10 && !isSubmitting;

  return (
    <View
      testID="first-session-wrap-up"
      className="mx-4 mb-3 rounded-xl border border-border bg-surface p-4"
    >
      <Text className="text-xs font-semibold text-text-secondary">
        {t('sessionSummary.yourWords')}
      </Text>
      <Text className="mt-1 text-sm text-text-primary">
        {t('sessionSummary.writePrompt')}
      </Text>
      <TextInput
        testID="first-session-reflection-input"
        accessibilityLabel={t('sessionSummary.yourWords')}
        multiline
        value={value}
        onChangeText={onChangeText}
        editable={!isSubmitting}
        className="mt-3 min-h-20 rounded-xl border border-border px-3 py-2 text-text-primary"
      />
      {hasError ? (
        <Text className="mt-2 text-xs text-danger">
          {t('sessionSummary.saveError')}
        </Text>
      ) : null}
      <Pressable
        testID="first-session-wrap-submit"
        accessibilityRole="button"
        accessibilityLabel={t('sessionSummary.submitSummary')}
        disabled={!canSubmit}
        onPress={onSubmit}
        className={`mt-3 rounded-xl px-4 py-3 ${
          canSubmit ? 'bg-primary' : 'bg-surface-elevated'
        }`}
      >
        <Text
          className={`text-center font-semibold ${
            canSubmit ? 'text-text-inverse' : 'text-text-secondary'
          }`}
        >
          {isSubmitting
            ? t('common.saving')
            : t('sessionSummary.submitSummary')}
        </Text>
      </Pressable>
      {reflectionTotalXp != null ? (
        <View testID="first-session-wrap-receipt" className="mt-3">
          <RewardReceiptCard
            receipt={{
              kind: 'reflection_bonus',
              multiplier: 1.5,
              totalXp: reflectionTotalXp,
            }}
          />
        </View>
      ) : null}
      {reflectionTotalXp != null ? (
        <View testID="first-session-wrap-celebration" className="mt-3">
          <MentorCelebration
            eventId={celebrationEventId}
            messageKey="mentorHome.celebration.ownChoice"
            seenEventIds={seenCelebrationEventIds}
            onMarkSeen={onMarkCelebrationSeen}
          />
        </View>
      ) : null}
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
    entrySource,
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
    entrySource?: string;
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
  const queryClient = useQueryClient();
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
    mentorHomeworkWrapUpFrame,
  } = useMemo(
    () =>
      getSessionRouteParams({
        mode,
        subjectId,
        problemText,
        homeworkProblems,
        ocrText,
        captureSource,
        entrySource,
        gaps: rawGaps,
        returnTo: rawReturnTo,
        returnId: rawReturnId,
        imageUri: rawImageUri,
        imageMimeType: rawImageMimeType,
      }),
    [
      captureSource,
      entrySource,
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
  const refreshMentorFeedBeforeReturn = useCallback(() => {
    if (returnTo !== MENTOR_RETURN_TO || !activeProfile?.id) return;
    void queryClient.invalidateQueries({
      queryKey: nowFeedQueryKey(activeProfile.id),
      exact: true,
    });
  }, [activeProfile?.id, queryClient, returnTo]);
  const handleChatBackPress = useCallback(() => {
    if (returnTo) {
      refreshMentorFeedBeforeReturn();
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
  }, [
    returnTo,
    subjectId,
    homeBackHref,
    refreshMentorFeedBeforeReturn,
    router,
  ]);
  const handleHomeBack = useCallback(() => {
    if (returnTo) {
      refreshMentorFeedBeforeReturn();
      router.replace(homeBackHref as Href);
      return;
    }

    goBackOrReplace(router, homeBackHref);
  }, [homeBackHref, refreshMentorFeedBeforeReturn, returnTo, router]);
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
  const [showMentorBirthMoment, setShowMentorBirthMoment] = useState(false);
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
  // T23: V2 mentor-homework round-trip. The captured photo lands back in the
  // session thread as the learner's image bubble with two deterministic
  // first-response actions (help me solve / check my answer). Once the learner
  // picks one, the deterministic block is consumed and the tutoring turn begins.
  const isMentorHomeworkFrame = mentorHomeworkWrapUpFrame === 'mentor-homework';
  const [mentorHomeworkChoice, setMentorHomeworkChoice] = useState<
    'help_me' | 'check_answer' | null
  >(null);
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
  const [languageLearning, setLanguageLearning] =
    useState<LanguageLearningActivityEvent | null>(null);
  const [challengeRound, setChallengeRound] =
    useState<ChallengeRoundSessionState | null>(null);
  const [challengeOffer, setChallengeOffer] =
    useState<ChallengeRoundOfferEvent | null>(null);
  const [draftedNote, setDraftedNote] =
    useState<DraftedChallengeNoteEvent | null>(null);
  const [quotaError, setQuotaError] = useState<QuotaExceededDetails | null>(
    null,
  );
  /** F6: ID of the latest AI message where the LLM reported confidence=low */
  const [lowConfidenceMessageId, setLowConfidenceMessageId] = useState<
    string | null
  >(null);
  const [firstSessionWrapUp, setFirstSessionWrapUp] = useState<{
    sessionId: string;
    wallClockSeconds: number;
    fastCelebrations: PendingCelebration[];
  } | null>(null);
  const [firstSessionReflectionText, setFirstSessionReflectionText] =
    useState('');
  const [firstSessionReflectionError, setFirstSessionReflectionError] =
    useState(false);
  const [firstSessionReflectionTotalXp, setFirstSessionReflectionTotalXp] =
    useState<number | null>(null);
  const [seenFirstSessionCelebrationIds, setSeenFirstSessionCelebrationIds] =
    useState<ReadonlySet<string>>(() => new Set<string>());

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
  const mentorOpenerLaunchKeyRef = useRef<string | null>(null);
  const internallyBackfilledSessionIdRef = useRef<string | null>(null);
  const hasHydratedRecoveryRef = useRef(false);
  const queuedProblemTextRef = useRef<string | null>(null);
  const localMessageIdRef = useRef(0);
  const lastRetryPayloadRef = useRef<{
    text: string;
    options?: ContinueMessageOptions;
    outboxEntryId?: string;
  } | null>(null);
  const challengeActionInFlightRef = useRef(false);
  const firstSessionWrapShownRef = useRef(false);
  const mentorBirthAttemptedProfilesRef = useRef<Set<string>>(new Set());

  const transcript = useSessionTranscript(routeSessionId ?? '');
  const activeSession = useSession(activeSessionId ?? '');
  const clearContinuationDepth = useClearContinuationDepth(
    activeSessionId ?? '',
  );
  const liveTranscript =
    transcript.data?.archived === false ? transcript.data : null;
  const isV2MentorEntry =
    FEATURE_FLAGS.MODE_NAV_V2_ENABLED && entrySource === 'mentor';
  const mentorOpenerText =
    isV2MentorEntry && effectiveMode === 'freeform' && rawInput?.trim().length
      ? rawInput
      : undefined;
  const mentorOpenerAlreadyPersisted = !!(
    mentorOpenerText &&
    liveTranscript?.exchanges.some(
      (exchange, index, exchanges) =>
        exchange.role === 'user' &&
        exchange.content === mentorOpenerText &&
        exchanges[index + 1]?.role === 'assistant' &&
        !exchanges[index + 1]?.isSystemPrompt,
    )
  );

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

  // New sessions allocate their ID inside the streaming hook. Put that ID
  // back into the route immediately so transcript hydration and restoration
  // use the same canonical session after remount/retry.
  useEffect(() => {
    if (
      !mentorOpenerText ||
      !activeSessionId ||
      routeSessionId === activeSessionId
    ) {
      return;
    }
    internallyBackfilledSessionIdRef.current = activeSessionId;
    router.setParams({ sessionId: activeSessionId });
  }, [activeSessionId, mentorOpenerText, routeSessionId, router]);

  useEffect(() => {
    const profileId = activeProfile?.id;
    const sessionIdForEntry = routeSessionId ?? activeSessionId;
    if (!profileId || !sessionIdForEntry) return;
    if (navigationContract.gates.sessionIsOwner) return;
    if (effectiveMode !== 'learning' || !isFirstSession) return;
    if (mentorBirthAttemptedProfilesRef.current.has(profileId)) return;

    mentorBirthAttemptedProfilesRef.current.add(profileId);
    const key = mentorBirthSeenKey(profileId);
    let cancelled = false;

    void (async () => {
      try {
        const seen = await SecureStore.getItemAsync(key);
        if (cancelled || seen === 'true') return;
        await SecureStore.setItemAsync(key, 'true');
        if (!cancelled) {
          setShowMentorBirthMoment(true);
        }
      } catch (error) {
        console.warn('[Session] Mentor birth latch unavailable:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeProfile?.id,
    activeSessionId,
    effectiveMode,
    isFirstSession,
    navigationContract.gates.sessionIsOwner,
    routeSessionId,
  ]);

  const { bookmarkState, handleToggleBookmark } = useBookmarkHandler({
    sessionId: activeSessionId ?? routeSessionId ?? undefined,
  });
  const { keepPending, keepSaved, handleKeepNow, resetKeepSaved } =
    useFreeformKeepHandler();
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
    profileId: activeProfile?.id,
    celebrationLevel,
    accommodationMode: learnerProfile?.accommodationMode,
    audience: 'child',
  });

  // Reset state when screen regains focus (prevents stale state loop)
  useFocusEffect(
    useCallback(() => {
      const isInternalSessionIdBackfill =
        !!routeSessionId &&
        internallyBackfilledSessionIdRef.current === routeSessionId;
      internallyBackfilledSessionIdRef.current = null;
      if (isInternalSessionIdBackfill) {
        return;
      }

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
      setQuotaError(null);
      setLowConfidenceMessageId(null);
      closedSessionRef.current = null;
      sessionNoteSavedRef.current = false;
      resetKeepSaved();
      hasHydratedRecoveryRef.current = false;
      resetMilestones();
      setHomeworkProblemsState(initialHomeworkProblems);
      setCurrentProblemIndex(0);
      setHomeworkMode(undefined);
      setMentorHomeworkChoice(null);
      hasAutoSentRef.current = false;
    }, [
      hasHydratedRecoveryRef,
      openingContent,
      resetKeepSaved,
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
  const languageVoiceLocale = resolveLanguageVoiceLocale({
    activeSubject,
    conversationLanguage: activeProfile?.conversationLanguage,
  });
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
  const submitFirstSessionSummary = useSubmitSummary(activeSessionId ?? '');
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
    hasInitialMentorOpener: !!mentorOpenerText,
    mentorOpenerAlreadyPersisted,
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
    setLanguageLearning,
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

  // T25: V2 "mentor-is-the-app" turn-1 subject resolution — flag-gated and
  // scoped to the mentor entry (both freeform questions and homework/camera
  // launched from the mentor bar). Drives non-blocking, no-grid subject
  // resolution in useSubjectClassification and relaxes the composer gate below.
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
    isV2MentorEntry,
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
    const profileId = activeProfile?.id;
    if (!profileId || !mentorOpenerText || sessionExpired) return;
    if (mentorOpenerAlreadyPersisted) {
      mentorOpenerLaunchKeyRef.current = `${profileId}:${mentorOpenerText}`;
      return;
    }
    if (routeSessionId && transcript.isFetching && !transcript.data) return;
    if (
      isStreaming ||
      pendingClassification ||
      pendingSubjectResolution ||
      quotaError
    ) {
      return;
    }

    const launchKey = `${profileId}:${mentorOpenerText}`;
    if (mentorOpenerLaunchKeyRef.current === launchKey) return;
    mentorOpenerLaunchKeyRef.current = launchKey;

    void (async () => {
      const sessionId = routeSessionId ?? activeSessionId;
      if (sessionId) {
        const existingEntry = await getOutboxEntry(
          profileId,
          'session',
          mentorOpenerIdempotencyKey(sessionId),
        );
        await handleSend(mentorOpenerText, {
          isAutoSent: true,
          initialMentorOpener: true,
          ...(effectiveSubjectId
            ? { sessionSubjectId: effectiveSubjectId }
            : {}),
          ...(effectiveSubjectName
            ? { sessionSubjectName: effectiveSubjectName }
            : {}),
          ...(existingEntry ? { existingEntry } : {}),
        });
        return;
      }

      await handleSend(mentorOpenerText, {
        isAutoSent: true,
        initialMentorOpener: true,
      });
    })().catch((error) => {
      mentorOpenerLaunchKeyRef.current = null;
      Sentry.captureException(error, {
        tags: { screen: 'session', action: 'persist_mentor_opener' },
      });
    });
  }, [
    activeProfile?.id,
    activeSessionId,
    effectiveSubjectId,
    effectiveSubjectName,
    handleSend,
    isStreaming,
    mentorOpenerAlreadyPersisted,
    mentorOpenerText,
    pendingClassification,
    pendingSubjectResolution,
    quotaError,
    routeSessionId,
    sessionExpired,
    transcript.data,
    transcript.isFetching,
  ]);

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
    // T23: For the V2 mentor-homework frame the deterministic help/check
    // buttons are the first actionable response — defer the OCR auto-send
    // until the learner picks one (mentorHomeworkChoice set). This keeps the
    // image bubble + buttons as the genuine first turn with no LLM/subject
    // preamble. For every other entry the auto-send fires as before.
    if (isMentorHomeworkFrame && !mentorHomeworkChoice) {
      return undefined;
    }
    if (initialProblemText && !routeSessionId && !hasAutoSentRef.current) {
      if (imageUri && imageAttachmentStatus === 'loading') {
        return undefined;
      }

      // [HOMEWORK-06] If the learner attached a photo but conversion failed
      // or timed out (>2.5s), surface a visible system message and emit a
      // structured analytics event before falling back to text-only auto-send.
      // Silent fallback is banned by AGENTS.md "Fix Development Rules".
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
                  ? t('session.imageAttach.timeout')
                  : t('session.imageAttach.failed'),
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
    isMentorHomeworkFrame,
    mentorHomeworkChoice,
  ]);

  const shouldUseFirstSessionWrapUp = isV2MentorEntry && isFirstSession;
  const handleFirstSessionClosed = useCallback(
    (event: {
      sessionId: string;
      wallClockSeconds: number;
      fastCelebrations: PendingCelebration[];
    }): boolean => {
      if (!shouldUseFirstSessionWrapUp || firstSessionWrapShownRef.current) {
        return false;
      }

      firstSessionWrapShownRef.current = true;
      const recapSubject = effectiveSubjectName ?? topicName ?? subjectName;
      const recapLine = recapSubject
        ? t('session.firstWrap.recapWithSubject', { subject: recapSubject })
        : t('session.firstWrap.recap');
      const mentorTurn = [
        recapLine,
        t('mentorHome.celebration.ownChoice'),
        t('mentorHome.coldStart.firstSessionTeach'),
      ].join('\n\n');

      setFirstSessionWrapUp(event);
      setFirstSessionReflectionText('');
      setFirstSessionReflectionError(false);
      setFirstSessionReflectionTotalXp(null);
      setMessages((prev) =>
        prev.some((message) => message.id === 'first-session-wrap-up-turn')
          ? prev
          : [
              ...prev,
              {
                id: 'first-session-wrap-up-turn',
                role: 'assistant',
                content: mentorTurn,
                isSystemPrompt: true,
              },
            ],
      );
      return true;
    },
    [
      effectiveSubjectName,
      shouldUseFirstSessionWrapUp,
      subjectName,
      t,
      topicName,
    ],
  );

  const handleFirstSessionCelebrationSeen = useCallback((eventId: string) => {
    setSeenFirstSessionCelebrationIds((current) => {
      if (current.has(eventId)) return current;
      const next = new Set(current);
      next.add(eventId);
      return next;
    });
  }, []);

  const handleFirstSessionReflectionSubmit = useCallback(async () => {
    if (!firstSessionWrapUp || firstSessionReflectionTotalXp != null) return;
    const content = firstSessionReflectionText.trim();
    if (content.length < 10) return;

    try {
      setFirstSessionReflectionError(false);
      const result = await submitFirstSessionSummary.mutateAsync({ content });
      setMessages((prev) => [
        ...prev,
        {
          id: 'first-session-reflection',
          role: 'user',
          content,
        },
      ]);
      const totalXp =
        (result.summary.baseXp ?? 0) + (result.summary.reflectionBonusXp ?? 0);
      setFirstSessionReflectionTotalXp(totalXp > 0 ? totalXp : null);
    } catch (err) {
      setFirstSessionReflectionError(true);
      Sentry.captureException(err, {
        tags: { screen: 'session', action: 'first_session_reflection' },
      });
    }
  }, [
    firstSessionReflectionText,
    firstSessionReflectionTotalXp,
    firstSessionWrapUp,
    submitFirstSessionSummary,
  ]);

  const {
    handleInputModeChange,
    handleNextProblem,
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
    filing,
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
    onSessionClosed: handleFirstSessionClosed,
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
      } catch (err) {
        // [UX-FM] Surface the classified reason instead of a generic retry
        // string, and capture so the swallowed failure is observable.
        Sentry.captureException(err, {
          tags: { screen: 'session', action: 'runChallengeAction' },
        });
        platformAlert(title, formatApiError(err));
      } finally {
        challengeActionInFlightRef.current = false;
      }
    },
    [applyChallengeRouteResponse],
  );

  const handleAcceptChallengeRound = useCallback(() => {
    void runChallengeAction(
      () => challengeRoundActions.accept(),
      t('session.challenge.startErrorTitle'),
    );
  }, [challengeRoundActions, runChallengeAction, t]);

  const handleDeclineChallengeRound = useCallback(
    (dontAskAgain: boolean) => {
      void runChallengeAction(
        () => challengeRoundActions.decline(dontAskAgain),
        t('session.challenge.updateErrorTitle'),
      );
    },
    [challengeRoundActions, runChallengeAction, t],
  );

  const handleSaveDraftedNote = useCallback(
    async (content: string) => {
      if (challengeActionInFlightRef.current) return;
      challengeActionInFlightRef.current = true;
      try {
        await challengeRoundActions.saveNote(content);
        setDraftedNote(null);
        showConfirmation(t('session.challenge.noteSaved'));
      } catch (err) {
        Sentry.captureException(err, {
          tags: { screen: 'session', action: 'saveDraftedNote' },
        });
        platformAlert(
          t('session.challenge.noteSaveErrorTitle'),
          formatApiError(err),
        );
      } finally {
        challengeActionInFlightRef.current = false;
      }
    },
    [challengeRoundActions, showConfirmation, t],
  );

  const handleSkipDraftedNote = useCallback(() => {
    setDraftedNote(null);
    void challengeRoundActions.skipNote();
  }, [challengeRoundActions]);

  const latestAiMessageId = useMemo(
    () => getLatestAiMessageId({ messages, isStreaming }),
    [messages, isStreaming],
  );

  const bookmarkableEventId = useMemo(
    () => getLatestBookmarkableEventId({ messages, isStreaming }),
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
    } catch (err) {
      Sentry.captureException(err, {
        tags: { screen: 'session', action: 'skipWarmup' },
      });
      platformAlert(t('session.skipWarmupErrorTitle'), formatApiError(err));
    }
  }, [clearContinuationDepth, t]);

  // T23: Deterministic V2 mentor-homework first-response handlers. Picking a
  // mode records the learner's intent and re-enables the (previously deferred)
  // OCR auto-send with the chosen homeworkMode — no subject-picker preamble.
  const handleMentorHomeworkHelpMeSolve = useCallback(() => {
    if (mentorHomeworkChoice) return;
    setHomeworkMode('help_me');
    setMentorHomeworkChoice('help_me');
  }, [mentorHomeworkChoice]);
  const handleMentorHomeworkCheckMyAnswer = useCallback(() => {
    if (mentorHomeworkChoice) return;
    setHomeworkMode('check_answer');
    setMentorHomeworkChoice('check_answer');
  }, [mentorHomeworkChoice]);

  const { headerRight, headerBelow, subtitle } = SessionScreenChrome({
    activeSessionId,
    isClosing,
    isStreaming,
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

  // T25: V2 mentor entry is non-blocking — a pending subject disambiguation
  // shows inline chips but never disables the composer; the learner can keep
  // typing and the new message supersedes the prompt.
  const isSubjectFlowBlockingComposer =
    pendingClassification || (!isV2MentorEntry && !!pendingSubjectResolution);

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
  const gradedInputCard = languageLearning?.gradedInput ? (
    <GradedInputCard
      activity={languageLearning}
      textToSpeechLanguage={languageVoiceLocale}
      onDismiss={() => setLanguageLearning(null)}
    />
  ) : null;
  const meaningOutputCard = languageLearning?.meaningOutput ? (
    <MeaningOutputCard
      activity={languageLearning}
      onDismiss={() => setLanguageLearning(null)}
    />
  ) : null;
  // WI-1777: `key` on the target sentence forces a remount (fresh transcript
  // + feedback state) whenever the server rotates to a new target — retry
  // (same target) never remounts, only a genuinely new turn does.
  const speakingPracticeSessionId = activeSessionId ?? routeSessionId;
  const speakingPracticeCard =
    languageLearning?.speakingPractice &&
    speakingPracticeSessionId &&
    subjectId ? (
      <SpeakingPracticeActivity
        key={languageLearning.speakingPractice.targetText}
        activity={languageLearning}
        sessionId={speakingPracticeSessionId}
        subjectId={subjectId}
        textToSpeechLanguage={languageVoiceLocale}
      />
    ) : null;
  const firstSessionWrapUpCard = firstSessionWrapUp ? (
    <FirstSessionWrapUpCard
      value={firstSessionReflectionText}
      isSubmitting={submitFirstSessionSummary.isPending}
      hasError={
        firstSessionReflectionError || submitFirstSessionSummary.isError
      }
      reflectionTotalXp={firstSessionReflectionTotalXp}
      celebrationEventId={`first-session-wrap-up:${firstSessionWrapUp.sessionId}`}
      seenCelebrationEventIds={seenFirstSessionCelebrationIds}
      onChangeText={setFirstSessionReflectionText}
      onSubmit={() => {
        void handleFirstSessionReflectionSubmit();
      }}
      onMarkCelebrationSeen={handleFirstSessionCelebrationSeen}
    />
  ) : null;

  // T23: Render the deterministic homework first-response only for the V2
  // mentor-homework frame and only until the learner picks help/check. It is
  // the FIRST actionable response in-thread — image bubble + two buttons, with
  // no subject-picking preamble.
  const mentorHomeworkFirstResponse =
    isMentorHomeworkFrame && !mentorHomeworkChoice ? (
      <MentorHomeworkFirstResponse
        imageUri={imageUri}
        disabled={isStreaming || isClosing || !!quotaError}
        onHelpMeSolve={handleMentorHomeworkHelpMeSolve}
        onCheckMyAnswer={handleMentorHomeworkCheckMyAnswer}
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
      suppress={isMentorHomeworkFrame && !mentorHomeworkChoice}
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
        emptyStateGreeting={
          isFirstSession ? (
            <FirstSessionGreeting
              name={activeProfile?.displayName}
              subject={subjectName ?? undefined}
              interest={learnerProfile?.interests?.[0]?.label}
            />
          ) : (
            <ReturningSessionGreeting
              name={activeProfile?.displayName}
              subject={subjectName ?? undefined}
            />
          )
        }
        onSend={handleSend}
        isStreaming={isStreaming}
        inputDisabled={
          isOffline ||
          pendingClassification ||
          isSubjectFlowBlockingComposer ||
          sessionExpired ||
          !!quotaError ||
          !!firstSessionWrapUp ||
          // CR-6: Disable input while session close is in flight.
          isClosing
        }
        showDisabledBanner={
          firstSessionWrapUp
            ? false
            : pendingClassification || !isSubjectFlowBlockingComposer
        }
        disabledReason={
          isOffline
            ? t('session.disabledReason.offline')
            : sessionExpired
              ? t('session.disabledReason.expired')
              : quotaError
                ? t('session.disabledReason.quotaReached')
                : pendingClassification
                  ? t('session.chatShell.classifyingSubject')
                  : undefined
        }
        verificationType={liveTranscript?.session.verificationType ?? undefined}
        inputMode={inputMode}
        onInputModeChange={handleInputModeChange}
        rightAction={headerRight}
        inputAccessory={
          <>
            {challengeBanner}
            {drillStrip}
            {mentorHomeworkFirstResponse}
            {sessionAccessory}
          </>
        }
        composerAccessory={sessionToolAccessory}
        belowInput={firstSessionWrapUpCard}
        onDraftChange={setDraftText}
        renderMessageActions={renderMessageActions}
        speechRecognitionLanguage={languageVoiceLocale}
        textToSpeechLanguage={languageVoiceLocale}
        footer={
          <>
            {gradedInputCard}
            {meaningOutputCard}
            {speakingPracticeCard}
            {challengeOfferCard}
            {draftedNoteReview}
            <BookmarkNudgeTooltip
              aiResponseCount={aiResponseCount}
              isFirstSession={isFirstSession}
              profileId={activeProfile?.id}
            />
            <SessionFooter
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
              bookmarkableEventId={bookmarkableEventId}
              keepPending={keepPending}
              keepSaved={keepSaved}
              onKeepNow={handleKeepNow}
            />
          </>
        }
      />
      {showMentorBirthMoment ? (
        <View testID="mentor-birth-overlay" style={styles.mentorBirthOverlay}>
          <MentorBirthAnimation
            readyLabel={t('onboarding.mentorBirth.ready')}
            onComplete={() => setShowMentorBirthMoment(false)}
            timeScale={MENTOR_BIRTH_SESSION_TIME_SCALE}
          />
        </View>
      ) : null}
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

const styles = StyleSheet.create({
  mentorBirthOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 20,
  },
});
