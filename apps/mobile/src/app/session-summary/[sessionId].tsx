import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  InteractionManager,
  Platform,
} from 'react-native';
import {
  useRouter,
  useLocalSearchParams,
  Redirect,
  type Href,
} from 'expo-router';
import { useAuth } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';
import { useProfile } from '../../lib/profile';
import { computeAgeBracket, getSessionEffectiveMode } from '@eduagent/schemas';
import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import { useNavigationContract } from '../../hooks/use-navigation-contract';
import { useParentProxy } from '../../hooks/use-parent-proxy';
import { useRatingPrompt } from '../../hooks/use-rating-prompt';
import { useAnnounce } from '../../hooks/use-announce';
import {
  useSession,
  useSessionTranscript,
  useSessionSummary,
  useSkipSummary,
  useSubmitSummary,
  useRetrySummaryFeedback,
  useRecallBridge,
} from '../../hooks/use-sessions';
import { useSessionBookmarks } from '../../hooks/use-bookmarks';
import { useTotalSessionCount } from '../../hooks/use-session-context';
import { useLearnerProfile } from '../../hooks/use-learner-profile';
import { useTopicSuggestions } from '../../hooks/use-topic-suggestions';
import { usePostSessionNotificationAsk } from '../../hooks/use-post-session-notification-ask';
import { goBackOrReplace, homeHrefForReturnTo } from '../../lib/navigation';
import { platformAlert } from '../../lib/platform-alert';
import { formatApiError, classifyApiError } from '../../lib/format-api-error';
import { Sentry } from '../../lib/sentry';
import {
  readSummaryDraft,
  writeSummaryDraft,
  clearSummaryDraft,
} from '../../lib/summary-draft';
import { getReflectionStarters } from '../../lib/reflection-starters';
import {
  Button,
  CheckmarkPopAnimation,
  BrandCelebration,
  ShimmerSkeleton,
  ErrorFallback,
} from '../../components/common';
import { FilingFailedBanner } from '../../components/session/FilingFailedBanner';
import { MentorMemoryCue } from '../../components/session-summary/MentorMemoryCue';
import { SessionSummaryLibraryFilingControls } from '../../components/session-summary/SessionSummaryLibraryFilingControls';
import {
  buildMilestoneLabels,
  buildSessionTakeaways,
  deriveSessionSummaryCopy,
  deriveSessionSummaryMode,
  deriveSessionSummaryVisibility,
  parseFastCelebrationsParam,
  parseMilestonesParam,
  resolveNumberParam,
} from './_view-models/session-summary-derived';

export default function SessionSummaryScreen() {
  const {
    sessionId,
    subjectName,
    exchangeCount,
    escalationRung,
    subjectId,
    topicId,
    wallClockSeconds,
    milestones,
    fastCelebrations,
    sessionType: sessionTypeParam,
    filedSubjectId,
    filedBookId,
    returnTo,
  } = useLocalSearchParams<{
    sessionId: string;
    subjectName?: string;
    exchangeCount?: string;
    escalationRung?: string;
    subjectId?: string;
    topicId?: string;
    wallClockSeconds?: string;
    milestones?: string;
    fastCelebrations?: string;
    sessionType?: string;
    filedSubjectId?: string;
    filedBookId?: string;
    returnTo?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const summaryHomeHref = homeHrefForReturnTo(returnTo);
  const colors = useThemeColors();
  const { t } = useTranslation();
  const announce = useAnnounce();
  // [BUG-134] Auth gate — this route is at the root, not under (app)/, so
  // the (app)/_layout.tsx auth guard does NOT fire on deep-link entry.
  // Without this check, an unauthenticated user opening a /session-summary
  // deep link hits the loading spinner → dead-end ErrorFallback with no
  // path to sign-in.
  const { isLoaded: authIsLoaded, isSignedIn } = useAuth();

  const [summaryText, setSummaryText] = useState('');
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedXp, setSubmittedXp] = useState<{
    baseXp: number | null;
    reflectionBonusXp: number | null;
  } | null>(null);
  const [recapTimedOut, setRecapTimedOut] = useState(false);
  // UX-DE-M2: timeout guard — escape from unbounded loading spinner.
  // `loadingStartedAtRef` anchors the deadline to the first frame where
  // the loading state appeared for this sessionId, so the 10s escape is
  // measured against wall-clock time, not React's isLoading transitions.
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const loadingStartedAtRef = useRef<number | null>(null);
  // Bulletproof drafting — until this flips true, the autosave effect is
  // gated off so it can't clobber a draft we're about to rehydrate.
  const [draftRehydrated, setDraftRehydrated] = useState(false);
  // Tracks whether autosave has ever written a draft for this session.
  // Prevents a spurious "clear on empty text" fire on a fresh mount when
  // nothing was ever stored to begin with.
  const draftWrittenRef = useRef(false);

  // R-3: Ref-based locks — isPending resets before Alert callbacks fire,
  // allowing double-submission if user taps rapidly.
  const submitInFlight = useRef(false);
  const skipInFlight = useRef(false);
  const feedbackRetryInFlight = useRef(false);
  const [feedbackRetryAttempted, setFeedbackRetryAttempted] = useState(false);

  const submitSummary = useSubmitSummary(sessionId ?? '');
  const retrySummaryFeedback = useRetrySummaryFeedback(sessionId ?? '');
  const skipSummary = useSkipSummary(sessionId ?? '');
  const session = useSession(sessionId ?? '');
  const transcript = useSessionTranscript(sessionId ?? '');
  const liveTranscript =
    transcript.data?.archived === false ? transcript.data : null;
  const { onSuccessfulRecall } = useRatingPrompt();
  const { activeProfile } = useProfile();
  // childProfile (consent status + id) is genuinely not exposed on the
  // navigation contract — it describes the target child for mentor-memory
  // navigation, not the active user's navigation state. The proxy-mode
  // gating that used to read `isParentProxy` from this hook now flows
  // through `contract.gates.showLearningActions` (= !isParentProxy).
  const { childProfile } = useParentProxy();
  const { gates: navigationGates } = useNavigationContract();
  const isProxyMode = !navigationGates.showLearningActions;
  const activeProfileRole = useActiveProfileRole();
  const ageBracket =
    activeProfile?.birthYear != null
      ? computeAgeBracket(activeProfile.birthYear)
      : 'adolescent';
  const recallBridge = useRecallBridge(sessionId ?? '');
  const totalSessionCount = useTotalSessionCount();
  const learnerProfile = useLearnerProfile();
  const topicSuggestions = useTopicSuggestions(
    filedSubjectId ?? subjectId ?? undefined,
    filedBookId ?? undefined,
  );
  // JIT notification permission ask — fires once after the user has
  // completed at least one session (the post-value moment). Skipped in
  // parent-proxy mode and dedup'd via SecureStore inside the hook.
  // Must be called before any early returns to satisfy Rules of Hooks.
  const [recallQuestions, setRecallQuestions] = useState<string[] | null>(null);

  // BUG-449: when the user re-enters this screen from Library → Shelf → Book →
  // (past session tap), we must render their previously-saved summary instead
  // of the empty "Your Words" prompt. The local `submitted` state only covers
  // the just-submitted case in the same render; persisted state comes from
  // GET /sessions/:sessionId/summary.
  const exchangeCountForRecap = resolveNumberParam(
    exchangeCount,
    liveTranscript?.session.exchangeCount ?? 0,
  );
  const persistedSummary = useSessionSummary(sessionId ?? '', {
    refetchInterval: (data) => {
      if (recapTimedOut || exchangeCountForRecap < 3) {
        return false;
      }

      return data?.learnerRecap ? false : 2000;
    },
  });
  const sessionBookmarks = useSessionBookmarks(sessionId ?? undefined);
  const persisted = persistedSummary.data ?? null;
  usePostSessionNotificationAsk(
    activeProfile?.id,
    totalSessionCount >= 1,
    isProxyMode,
    Boolean(persisted?.mentorNotice),
  );
  // Destructure `refetch` once: TanStack Query produces a new top-level
  // result object reference on every state slice change (isFetching, isStale,
  // dataUpdatedAt, background polling tick). If we depended on the whole
  // `persistedSummary` object in the 15s timeout effect, each polling tick
  // would clear and re-arm the timer — so `recapTimedOut` would never flip,
  // Sentry would never fire, and the manual retry UI would never appear
  // (the exact silent-failure BUG-890 is meant to fix). `refetch` is
  // referentially stable per-observer, so it's safe in deps.
  const { refetch: refetchPersistedSummary } = persistedSummary;
  const isPersistedSubmitted =
    persisted?.status === 'submitted' || persisted?.status === 'accepted';
  const isPersistedSkipped = persisted?.status === 'skipped';
  const isAlreadyPersisted = isPersistedSubmitted || isPersistedSkipped;
  const isRevisitedPersistedSummary = isAlreadyPersisted && !submitted;

  useEffect(() => {
    setRecapTimedOut(false);
    setAiFeedback(null);
    setFeedbackRetryAttempted(false);
    // A new session id resets the loading-escape anchor — otherwise an
    // in-flight 10s timer from a previous session would continue ticking
    // against the new session's load.
    loadingStartedAtRef.current = null;
    setLoadingTimedOut(false);
  }, [sessionId]);

  // [BUG-890] When the 15s recap-loading window elapses without a recap,
  // do NOT silently fall through to a manual "Tap to retry" affordance —
  // per AGENTS.md UX Resilience Rules and "Silent recovery without
  // escalation is banned", we must (a) escalate the failure to Sentry so
  // ops can see how often this fires, and (b) trigger one automatic
  // refetch attempt before the user has to discover the manual retry.
  // The manual retry UI remains as a last-resort affordance (the user
  // saw "still loading" + the auto-retry didn't produce a recap either).
  useEffect(() => {
    if (recapTimedOut || exchangeCountForRecap < 3 || persisted?.learnerRecap) {
      return;
    }

    const timer = setTimeout(() => {
      Sentry.captureMessage('session-summary recap load timed out', {
        level: 'warning',
        tags: { surface: 'session-summary', failure: 'recap-timeout' },
        extra: {
          sessionId,
          exchangeCount: exchangeCountForRecap,
          ageBracket,
        },
      });
      // One auto-retry: if the recap arrives on this refetch, the user
      // never sees the manual fallback. If it still doesn't arrive, the
      // manual "Tap to retry" affordance shows below as a last resort.
      void refetchPersistedSummary();
      setRecapTimedOut(true);
    }, 15_000);
    return () => clearTimeout(timer);
  }, [
    exchangeCountForRecap,
    persisted?.learnerRecap,
    recapTimedOut,
    sessionId,
    ageBracket,
    refetchPersistedSummary,
  ]);

  // UX-DE-M2: escape from the initial loading spinner. The previous
  // 15s timer rearmed on every `isLoading` transition, so a flicker
  // (auth/profile rehydration toggling the query's enabled state,
  // refetchOnWindowFocus, etc.) could indefinitely defer the fallback —
  // QA observed a 15s+ spinner with no escape. Anchor the deadline to a
  // sessionId-scoped wall-clock timestamp so flickers cannot reset it,
  // and tighten the threshold to 10s.
  useEffect(() => {
    if (transcript.data || transcript.isError) {
      loadingStartedAtRef.current = null;
      setLoadingTimedOut(false);
      return;
    }
    if (!transcript.isLoading) {
      return;
    }
    if (loadingStartedAtRef.current === null) {
      loadingStartedAtRef.current = Date.now();
    }
    const elapsed = Date.now() - loadingStartedAtRef.current;
    const remaining = Math.max(0, 10_000 - elapsed);
    if (remaining === 0) {
      setLoadingTimedOut(true);
      return;
    }
    const t = setTimeout(() => setLoadingTimedOut(true), remaining);
    return () => clearTimeout(t);
  }, [transcript.data, transcript.isError, transcript.isLoading]);

  // Bulletproof drafting — rehydrate any persisted reflection text from
  // SecureStore exactly once on mount. Never overwrite what the user has
  // already typed; if they've started composing, the autosave effect below
  // will simply replace whatever was on disk.
  useEffect(() => {
    if (draftRehydrated) return;
    if (!sessionId || !activeProfile?.id) return;
    let cancelled = false;
    void (async () => {
      const draft = await readSummaryDraft(activeProfile.id, sessionId);
      if (cancelled) return;
      if (draft) {
        draftWrittenRef.current = true;
        setSummaryText((prev) => (prev.length === 0 ? draft.content : prev));
      }
      setDraftRehydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftRehydrated, sessionId, activeProfile?.id]);

  // Debounced 300ms autosave on every keystroke. Runs only after rehydrate
  // completes and while the session is still open for editing. All failures
  // are swallowed inside summary-draft.ts and escalated to Sentry.
  useEffect(() => {
    if (!draftRehydrated) return;
    if (!sessionId || !activeProfile?.id) return;
    if (submitted || isPersistedSubmitted) return;
    if (summaryText.length === 0) {
      if (draftWrittenRef.current) {
        void clearSummaryDraft(activeProfile.id, sessionId);
        draftWrittenRef.current = false;
      }
      return;
    }
    const id = setTimeout(() => {
      draftWrittenRef.current = true;
      void writeSummaryDraft(activeProfile.id, sessionId, summaryText);
    }, 300);
    return () => clearTimeout(id);
  }, [
    summaryText,
    draftRehydrated,
    sessionId,
    activeProfile?.id,
    submitted,
    isPersistedSubmitted,
  ]);

  // A server-confirmed terminal state (submitted/accepted) means any local
  // draft is redundant — drop it so it can't resurface on next mount.
  useEffect(() => {
    if (!sessionId || !activeProfile?.id) return;
    if (!isPersistedSubmitted) return;
    void clearSummaryDraft(activeProfile.id, sessionId);
    draftWrittenRef.current = false;
  }, [isPersistedSubmitted, sessionId, activeProfile?.id]);

  const showSubmittedView = submitted || isPersistedSubmitted;
  const displayContent = submitted ? summaryText : (persisted?.content ?? '');
  const displayAiFeedback = aiFeedback ?? persisted?.aiFeedback ?? null;
  const displayFeedbackStatus = displayAiFeedback
    ? 'available'
    : submitted
      ? 'unavailable'
      : persisted?.feedbackStatus;
  const transcriptSessionType = liveTranscript?.session.sessionType;
  const sessionType = deriveSessionSummaryMode({
    sessionTypeParam,
    transcriptSessionType,
    effectiveSessionMode: getSessionEffectiveMode(session.data ?? {}),
  });
  const conversationLanguage = activeProfile?.conversationLanguage ?? 'en';
  const summaryPrompts = getReflectionStarters(
    sessionType,
    conversationLanguage,
  );
  const { recapHeader, reflectionPlaceholder } =
    deriveSessionSummaryCopy(sessionType);
  const baseXp = (submitted ? submittedXp?.baseXp : persisted?.baseXp) ?? null;
  const reflectionBonusXp =
    (submitted
      ? submittedXp?.reflectionBonusXp
      : persisted?.reflectionBonusXp) ?? null;
  const hasXpIncentive = baseXp != null && baseXp > 0;

  const isHomeworkSession = sessionType === 'homework';
  const isFreeformSession = sessionType === 'freeform';

  const fallbackSession = liveTranscript?.session;
  const exchanges = exchangeCountForRecap;
  const rung = parseInt(escalationRung ?? '1', 10) || 1;
  // [BUG-801] Same fix for wallClockSeconds: parseInt('0') yields 0 which is
  // truthy-falsy in `||`. Use Number.isFinite to preserve a legitimate 0.
  const trimmedWallClockSeconds = (wallClockSeconds ?? '').trim();
  const parsedWallClockSeconds =
    trimmedWallClockSeconds === '' ? NaN : Number(trimmedWallClockSeconds);
  const wallClockMinutes = Math.max(
    1,
    Math.round(
      (Number.isFinite(parsedWallClockSeconds)
        ? parsedWallClockSeconds
        : (fallbackSession?.wallClockSeconds ?? 0)) / 60,
    ),
  );
  const parsedMilestones = parseMilestonesParam({
    milestonesParam: milestones,
    fallbackMilestones: fallbackSession?.milestonesReached ?? [],
    reportNonArray: (milestonesParam) => {
      Sentry.captureMessage(
        'session-summary milestone param parsed to non-array',
        { level: 'warning', extra: { milestonesParam } },
      );
    },
    reportParseError: (err, milestonesParam) => {
      // [BUG-821 / F-MOB-23] Surface parse failures to telemetry — silent
      // fallback was hiding both URL-corruption and prod regressions.
      Sentry.captureException(err, {
        tags: { surface: 'session-summary', field: 'milestones' },
        extra: { milestonesParam },
      });
    },
  });
  const parsedFastCelebrations = parseFastCelebrationsParam(fastCelebrations);
  const isRecallSummary =
    liveTranscript?.session.verificationType === 'evaluate' ||
    liveTranscript?.session.verificationType === 'teach_back';

  const maybePromptForRecall = async (): Promise<void> => {
    if (!isRecallSummary) return;
    try {
      await onSuccessfulRecall();
    } catch {
      // Best effort only — store review availability varies by device/store.
    }
  };

  const finishSummaryNavigation = (): void => {
    if (filedSubjectId && filedBookId) {
      router.replace('/(app)/library' as Href);
      InteractionManager.runAfterInteractions(() => {
        // Push full ancestor chain so back-button restores shelf context.
        // See AGENTS.md "Cross-tab / cross-stack router.push" rule and
        // library.tsx handleBookPress for the canonical two-push pattern.
        router.push({
          pathname: '/(app)/shelf/[subjectId]',
          params: { subjectId: filedSubjectId },
        } as Href);
        router.push({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: { subjectId: filedSubjectId, bookId: filedBookId },
        } as Href);
      });
      return;
    }

    const effectiveTopicId = topicId ?? fallbackSession?.topicId;
    const effectiveSubjectId = subjectId ?? fallbackSession?.subjectId;
    if (isRevisitedPersistedSummary && effectiveTopicId && effectiveSubjectId) {
      router.replace({
        pathname: '/(app)/topic/[topicId]',
        params: { topicId: effectiveTopicId, subjectId: effectiveSubjectId },
      } as Href);
      return;
    }

    if (isRevisitedPersistedSummary) {
      goBackOrReplace(router, summaryHomeHref);
      return;
    }

    router.replace(summaryHomeHref as Href);
  };

  // [BUG-134] Auth gate (see comment at top of component).
  // Wait for Clerk to load — until then we don't know whether the user is
  // authenticated. Showing a spinner avoids a flicker-to-sign-in when the
  // user IS authenticated but Clerk hasn't hydrated yet.
  if (!authIsLoaded) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="session-summary-auth-loading"
      >
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }
  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  if (!sessionId) {
    return (
      <ErrorFallback
        variant="centered"
        title={t('sessionSummary.notFoundTitle')}
        message={t('sessionSummary.notFoundHeadHomeMessage')}
        primaryAction={{
          label: t('common.goHome'),
          onPress: () => goBackOrReplace(router, summaryHomeHref),
          testID: 'session-summary-missing-param',
        }}
      />
    );
  }

  // [BUG-139] Classify the transcript-load error through the shared
  // classifier, not via raw HTTP status duck-typing. Per AGENTS.md UX
  // Resilience Rules, "classification happens at the API client boundary"
  // and screens must NEVER parse HTTP status codes. `classifyApiError`
  // handles both typed error classes (NotFoundError, ResourceGoneError)
  // and status-tagged plain errors thrown by `assertOk()` — a single
  // surface so a future client refactor (e.g. switching `assertOk` to
  // throw typed classes) cannot silently mis-route the UX.
  const isSessionExpired =
    transcript.isError &&
    classifyApiError(transcript.error).category === 'not-found';

  if (isSessionExpired) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-3">
          {t('sessionSummary.expiredTitle')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('sessionSummary.expiredMessage')}
        </Text>
        <Button
          variant="primary"
          label={t('common.goHome')}
          onPress={() => goBackOrReplace(router, summaryHomeHref)}
          testID="expired-session-go-home"
        />
      </View>
    );
  }

  // [F-025] Catch-all for non-404 errors (e.g. 400 from a garbage session ID,
  // 500 from a server error). The original guard only covered 404.
  if (transcript.isError) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-3">
          {t('sessionSummary.notFoundTitle')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('sessionSummary.notFoundMessage')}
        </Text>
        <Button
          variant="primary"
          label={t('common.goHome')}
          onPress={() => goBackOrReplace(router, summaryHomeHref)}
          testID="session-not-found-go-home"
        />
      </View>
    );
  }

  // UX-DE-M2: timeout guard + goBackOrReplace
  if (
    !exchangeCount &&
    !wallClockSeconds &&
    transcript.isLoading &&
    !transcript.data
  ) {
    if (loadingTimedOut) {
      return (
        <ErrorFallback
          variant="centered"
          title={t('sessionSummary.loadTimeoutTitle')}
          message={t('sessionSummary.loadTimeoutMessage')}
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => {
              setLoadingTimedOut(false);
              void transcript.refetch();
            },
          }}
          secondaryAction={{
            label: t('common.goHome'),
            onPress: () => goBackOrReplace(router, summaryHomeHref),
          }}
        />
      );
    }
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
        <Text className="text-text-secondary text-body text-center mt-3">
          {t('sessionSummary.loadingSummary')}
        </Text>
      </View>
    );
  }

  // [F-025] If loading is done but we have no real data from either URL params
  // or the transcript query, this is a deep-link to a bogus session ID.
  // Guard against rendering phantom "1 minute" / "0 exchanges" summaries.
  if (
    !transcript.isLoading &&
    !transcript.data &&
    !exchangeCount &&
    !wallClockSeconds
  ) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-3">
          {t('sessionSummary.notFoundTitle')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('sessionSummary.couldNotLoadMessage')}
        </Text>
        <Button
          variant="primary"
          label={t('common.goHome')}
          onPress={() => router.replace(summaryHomeHref as Href)}
          testID="session-not-found-go-home"
        />
      </View>
    );
  }

  const handleSubmit = async (): Promise<boolean> => {
    if (
      summaryText.trim().length < 10 ||
      submitSummary.isPending ||
      submitInFlight.current
    )
      return false;
    submitInFlight.current = true;

    try {
      const result = await submitSummary.mutateAsync({
        content: summaryText.trim(),
      });
      setAiFeedback(result.summary.aiFeedback);
      setSubmitted(true);
      setSubmittedXp({
        baseXp: result.summary.baseXp ?? null,
        reflectionBonusXp: result.summary.reflectionBonusXp ?? null,
      });
      // Server accepted the reflection — the local draft is redundant.
      if (activeProfile?.id && sessionId) {
        void clearSummaryDraft(activeProfile.id, sessionId);
        draftWrittenRef.current = false;
      }

      // Story 10.8 Phase 0: summary_submitted event
      Sentry.addBreadcrumb({
        category: 'summary',
        message: 'summary_submitted',
        data: {
          sessionId,
          ageBracket,
          exchangeCount: exchanges,
          charCount: summaryText.trim().length,
        },
        level: 'info',
      });

      // W2 #11: fire the recall bridge on the submit path too. It used to live
      // only inside the skip-block in handleContinue, so a learner who SUBMITTED
      // a reflection never reached it. Firing here (not on the exit tap) keeps
      // the recall card part of the post-submit view and leaves the close
      // button meaning "leave". Best-effort — never block the reflection.
      if (isHomeworkSession && !recallQuestions) {
        try {
          const recall = await recallBridge.mutateAsync();
          if (recall.questions.length > 0) {
            setRecallQuestions(recall.questions);
          }
        } catch {
          // Best effort — store/network variance must not fail the submit.
        }
      }
      return true;
    } catch (err) {
      // Error state surfaced by submitSummary.isError inline in JSX [SC-1].
      // The draft stays on disk: on retry the user's text is preserved
      // even if the app is force-killed between attempts.
      console.error('[SessionSummary] handleSubmit failed:', err);
      // [BUG-800] Use formatApiError so typed server errors (400 word-limit,
      // 422 too-short, etc.) reach the user verbatim. The previous generic
      // 'Please try again.' hid actionable reasons — user could not self-correct.
      platformAlert(t('sessionSummary.saveErrorTitle'), formatApiError(err));
      return false;
    } finally {
      submitInFlight.current = false;
    }
  };

  const handleRetryFeedback = async (): Promise<void> => {
    if (
      retrySummaryFeedback.isPending ||
      feedbackRetryInFlight.current ||
      !sessionId
    ) {
      return;
    }
    feedbackRetryInFlight.current = true;
    try {
      const result = await retrySummaryFeedback.mutateAsync();
      setAiFeedback(result.summary.aiFeedback);
      setFeedbackRetryAttempted(true);
      announce(
        result.summary.aiFeedback
          ? `${t('sessionSummary.mateFeedback')}: ${result.summary.aiFeedback}`
          : t('sessionSummary.feedbackStillUnavailable'),
      );
      if (!isPersistedSubmitted) {
        setSubmitted(true);
      }
      await refetchPersistedSummary();
    } catch (error) {
      setFeedbackRetryAttempted(true);
      announce(t('sessionSummary.feedbackStillUnavailable'));
      Sentry.captureException(error, {
        tags: { surface: 'session-summary.feedback-retry' },
        extra: { sessionId },
      });
    } finally {
      feedbackRetryInFlight.current = false;
    }
  };

  // Promise-wrapped confirmation used by every exit path when the user has
  // typed something but not submitted. Returns the user's choice so the
  // caller can branch without relying on React state that hasn't flushed.
  const askDraftDecision = (): Promise<'submit' | 'discard' | 'keep'> =>
    new Promise((resolve) => {
      const canSubmit = summaryText.trim().length >= 10;
      const buttons = canSubmit
        ? [
            {
              text: t('sessionSummary.draftPrompt.keepWriting'),
              style: 'cancel' as const,
              onPress: () => resolve('keep'),
            },
            {
              text: t('sessionSummary.draftPrompt.submitNow'),
              onPress: () => resolve('submit'),
            },
            {
              text: t('sessionSummary.draftPrompt.discard'),
              style: 'destructive' as const,
              onPress: () => resolve('discard'),
            },
          ]
        : [
            {
              text: t('sessionSummary.draftPrompt.keepWriting'),
              style: 'cancel' as const,
              onPress: () => resolve('keep'),
            },
            {
              text: t('sessionSummary.draftPrompt.discard'),
              style: 'destructive' as const,
              onPress: () => resolve('discard'),
            },
          ];
      platformAlert(
        t('sessionSummary.draftPrompt.title'),
        canSubmit
          ? t('sessionSummary.draftPrompt.messageCanSubmit')
          : t('sessionSummary.draftPrompt.messageTooShort'),
        buttons,
      );
    });

  const handleContinue = async (): Promise<void> => {
    // Bulletproof drafting — every close/continue/skip affordance routes
    // through here, so this one gate catches every exit path. If the user
    // has typed anything that isn't yet submitted, NEVER silently discard
    // it: ask what to do.
    if (!submitted && summaryText.trim().length > 0) {
      const decision = await askDraftDecision();
      if (decision === 'keep') return;
      if (decision === 'submit') {
        // Stay on screen afterwards: on success the submitted view renders
        // AI feedback; on failure the user can retry. They tap Continue
        // again to navigate once they're done reading.
        await handleSubmit();
        return;
      }
      // decision === 'discard' — wipe the local draft so it can't resurface,
      // then fall through to the server-side skip + navigation flow.
      if (activeProfile?.id && sessionId) {
        await clearSummaryDraft(activeProfile.id, sessionId);
        draftWrittenRef.current = false;
      }
      setSummaryText('');
    }

    // BUG-449: Only run the skip flow for a fresh session that hasn't been
    // resolved yet. If the user is revisiting an already-submitted or
    // already-skipped summary (e.g., tapping a PAST SESSION from the book
    // page), calling skipSummary would wrongly mark their saved reflection
    // as "skipped" server-side.
    if (!submitted && !isAlreadyPersisted) {
      if (skipSummary.isPending || skipInFlight.current) return;
      skipInFlight.current = true;

      try {
        await skipSummary.mutateAsync();
      } catch {
        skipInFlight.current = false;
        // S-3: Surface skip failures — bare catch { return } was silent.
        platformAlert(
          t('sessionSummary.skipErrorTitle'),
          t('common.pleaseTryAgain'),
        );
        return;
      }
      skipInFlight.current = false;

      Sentry.addBreadcrumb({
        category: 'summary',
        message: 'summary_skipped',
        data: { sessionId, ageBracket, exchangeCount: exchanges },
        level: 'info',
      });

      // Fetch recall bridge for homework sessions BEFORE skip-warning alerts.
      // The 5-skip warning returns early, so the recall bridge was previously
      // unreachable for homework sessions in the 5-9 skip range (bug #12).
      if (isHomeworkSession && !recallQuestions) {
        try {
          const result = await recallBridge.mutateAsync();
          if (result.questions.length > 0) {
            setRecallQuestions(result.questions);
            return; // Stay on screen to show recall questions
          }
        } catch {
          // Best effort — continue to skip-warning flow
        }
      }
    }

    await maybePromptForRecall();
    finishSummaryNavigation();
  };

  // [LEARN-07] "See your Library" CTA must always navigate to Library.
  // The previous topic-detail branches were a mismatch with the CTA copy —
  // topicId/subjectId is context about the session, not a redirect target.
  const handleGoToLibrary = (): void => {
    router.replace('/(app)/library');
  };

  const handleOpenMentorMemory = (): void => {
    if (activeProfileRole === 'impersonated-child' && childProfile?.id) {
      router.push({
        pathname: '/(app)/child/[profileId]/mentor-memory',
        params: { profileId: childProfile.id },
      } as Href);
      return;
    }

    router.push('/(app)/mentor-memory' as Href);
  };

  // [BUG-805] Suppress the duration takeaway until we have a verified non-zero
  // wall-clock value. Math.max(1, ...) above masks missing data as "1 minute",
  // so without this guard the screen would briefly render "1 minute - great
  // session!" while the transcript loads and snap to "15 minutes" once data
  // arrives — readable as a glitch by learners. With the guard the takeaway
  // simply doesn't appear until duration is real.
  const hasResolvedDuration =
    (Number.isFinite(parsedWallClockSeconds) && parsedWallClockSeconds > 0) ||
    (fallbackSession?.wallClockSeconds != null &&
      fallbackSession.wallClockSeconds > 0);

  const takeaways = buildSessionTakeaways({
    hasResolvedDuration,
    wallClockMinutes,
    exchanges,
    rung,
    t,
  });
  const milestoneLabels = buildMilestoneLabels(parsedMilestones);
  const effectiveSubjectId = subjectId ?? fallbackSession?.subjectId ?? null;

  // Feature 1: "You mastered these" row
  const resolvedTopics: string[] =
    learnerProfile.data?.recentlyResolvedTopics ?? [];

  // Feature 2: "Try this next" topic suggestions rail
  const suggestionItems = (topicSuggestions.data ?? []).slice(0, 3);

  // Feature 3: Purged-transcript badge
  const transcriptPurgedAt = persisted?.purgedAt ?? null;
  const {
    shouldShowMentorMemoryCue,
    shouldShowBookmarkPrompt,
    shouldShowMasteredRow,
    shouldShowSuggestionsRail,
    isTranscriptPurged,
  } = deriveSessionSummaryVisibility({
    exchanges,
    bookmarkCount: sessionBookmarks.data?.length ?? 0,
    totalSessionCount,
    isProxyMode,
    childConsentStatus: childProfile?.consentStatus,
    childId: childProfile?.id,
    resolvedTopicCount: resolvedTopics.length,
    suggestionCount: suggestionItems.length,
    transcriptPurgedAt,
  });

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        className="px-4 py-3 bg-surface border-b border-surface-elevated"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => {
              void handleContinue();
            }}
            className="me-2 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityLabel={t('sessionSummary.a11yCloseGoHome')}
            accessibilityRole="button"
            testID="summary-close-button"
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <BrandCelebration size={56} />
          <Text
            className="text-h3 font-semibold text-text-primary ms-2"
            testID="summary-title"
          >
            {t('sessionSummary.title')}
          </Text>
        </View>
        {subjectName ? (
          <Text className="text-caption text-text-secondary mt-1">
            {subjectName}
          </Text>
        ) : null}
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {isFreeformSession ? (
          <SessionSummaryLibraryFilingControls sessionId={sessionId} />
        ) : isHomeworkSession ? (
          // W2 #11: homework now auto-files at exit. Reuse the same controls
          // for the quiet "Added → Remove" (keep-out) opt-out. Gated on the
          // mode-stable isHomeworkSession (survives the keep-out query
          // invalidation); alwaysFilingCandidate bypasses the freeform
          // exchangeCount>=5 floor so short homework still renders. The
          // component owns every homework filing state (added / pending /
          // kept-out / failed), so no FilingFailedBanner fallback is needed.
          <SessionSummaryLibraryFilingControls
            sessionId={sessionId}
            alwaysFilingCandidate
          />
        ) : session.data ? (
          <FilingFailedBanner session={session.data} />
        ) : null}

        {persisted?.closingLine ? (
          <Text
            className="text-body text-text-primary italic px-1 mb-3"
            testID="session-closing-line"
          >
            {persisted.closingLine}
          </Text>
        ) : null}

        {persisted?.mentorNotice ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="session-summary-mentor-notice"
          >
            <Text className="text-body font-semibold text-text-primary mb-1">
              {t('sessionSummary.mentorNotice.title')}
            </Text>
            <Text className="text-body text-text-primary">
              {persisted.mentorNotice.concept}
            </Text>
            {persisted.mentorNotice.correctionHint ? (
              <Text className="text-caption text-text-secondary mt-2">
                {persisted.mentorNotice.correctionHint}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Session takeaways (learner-friendly, no internal metrics) */}
        <View
          className="bg-surface rounded-card p-4 mb-4"
          testID="session-takeaways"
        >
          <Text className="text-body font-semibold text-text-primary mb-2">
            {t('sessionSummary.whatHappened')}
          </Text>
          {takeaways.map((t, i) => (
            <View key={i} className="flex-row items-start mt-1">
              <Text className="text-body text-text-secondary me-2">
                {'\u2022'}
              </Text>
              <Text className="text-body text-text-primary flex-1">{t}</Text>
            </View>
          ))}
          <Text className="text-caption text-text-secondary mt-3">
            {t('sessionSummary.checkInSoon')}
          </Text>
        </View>

        {/* Feature 1: "You mastered these" moment */}
        {shouldShowMasteredRow ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="session-summary-mastered-row"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('sessionSummary.masteredRow.title')}
            </Text>
            {resolvedTopics.map((topic) => (
              <View key={topic} className="flex-row items-start mt-1">
                <Text className="text-body text-text-secondary me-2">
                  {'•'}
                </Text>
                <Text className="text-body text-text-primary flex-1">
                  {topic}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/*
          Resume-this-session entry point. When the learner revisits a past
          session from Library \u2192 Book \u2192 past conversation, they expect to be
          able to re-open the chat itself, not just read the summary.
          Hidden in parent-proxy mode: parents must not access learner chat
          content (the (app)/session route also redirects parents away as a
          server-side belt-and-suspenders, but we hide the affordance here too
          so it never appears on the parent UI).
        */}
        {!isProxyMode && sessionId ? (
          <View className="mb-4">
            <Button
              variant="primary"
              label={t('sessionSummary.resumeSession')}
              onPress={() => {
                const resumeTopicId = topicId ?? fallbackSession?.topicId;
                const resumeSubjectId = subjectId ?? fallbackSession?.subjectId;
                router.push({
                  pathname: '/(app)/session',
                  params: {
                    mode: 'learning',
                    sessionId,
                    ...(resumeSubjectId ? { subjectId: resumeSubjectId } : {}),
                    ...(resumeTopicId ? { topicId: resumeTopicId } : {}),
                  },
                } as Href);
              }}
              testID="resume-session-cta"
            />
          </View>
        ) : null}

        {/* [BUG-889] Returning learners had no path to the actual chat history.
            The transcript exists server-side and powers session resume; this
            link surfaces it in a read-only screen so the learner can scroll
            back through what was discussed.
            [CR-PR129-M5] Hide transcript in parent-proxy mode: parents have
            read-only summary access only and must not see the full chat log.
            Feature 3: When the transcript has been purged (retention policy),
            show an archived notice instead of the "View full transcript" CTA. */}
        {!isProxyMode && sessionId ? (
          isTranscriptPurged ? (
            <View
              className="bg-surface rounded-card p-4 mb-4"
              testID="transcript-purged-badge"
            >
              <Text
                className="text-body font-semibold text-text-primary mb-1"
                testID="transcript-purged-badge-label"
              >
                {t('sessionSummary.transcriptPurged.badge')}
              </Text>
              <Text className="text-body-sm text-text-secondary">
                {t('sessionSummary.transcriptPurged.notice')}
              </Text>
            </View>
          ) : (
            <View className="mb-4">
              <Button
                variant="secondary"
                label={t('sessionSummary.viewTranscript')}
                onPress={() => {
                  // [M-8] session-transcript is a sibling fullScreenModal in
                  // the root stack (see _layout.tsx), not a child of
                  // session-summary. Both are presented as fullScreenModal,
                  // so Expo Router pushes transcript on top of summary —
                  // router.back() inside the transcript screen returns here
                  // correctly via goBackOrReplace. No ancestor-chain push
                  // needed; the cast to `as never` was masking a
                  // false-positive — the object already satisfies HrefObject
                  // (pathname: string, params?: UnknownInputParams).
                  router.push({
                    pathname: '/session-transcript/[sessionId]',
                    params: { sessionId },
                  });
                }}
                testID="view-transcript-cta"
              />
            </View>
          )
        ) : null}

        {persisted?.learnerRecap ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="session-recap-card"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              {recapHeader}
            </Text>
            {persisted.learnerRecap
              .split('\n')
              .filter(Boolean)
              .map((bullet, index) => (
                <View
                  key={`${bullet}-${index}`}
                  className="flex-row items-start mt-1"
                >
                  <Text className="text-body text-text-secondary me-2">
                    {'\u2022'}
                  </Text>
                  <Text className="text-body text-text-primary flex-1">
                    {bullet.replace(/^- /, '')}
                  </Text>
                </View>
              ))}
          </View>
        ) : exchangeCountForRecap >= 3 && recapTimedOut ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="session-recap-timeout"
          >
            <Text className="text-body-sm text-text-secondary text-center">
              {t('sessionSummary.recapStillLoading')}
            </Text>
            <Pressable
              onPress={() => {
                setRecapTimedOut(false);
                void refetchPersistedSummary();
              }}
              className="mt-3 items-center"
              accessibilityRole="button"
              accessibilityLabel={t('sessionSummary.a11yRetryRecap')}
              testID="session-recap-retry"
            >
              <Text className="text-body-sm font-semibold text-primary">
                {t('sessionSummary.tapToRetry')}
              </Text>
            </Pressable>
          </View>
        ) : exchangeCountForRecap >= 3 ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="session-recap-skeleton"
          >
            <ShimmerSkeleton>
              <View className="h-4 w-36 bg-surface-elevated rounded mb-3" />
              <View className="h-3 w-full bg-surface-elevated rounded mb-2" />
              <View className="h-3 w-5/6 bg-surface-elevated rounded mb-2" />
              <View className="h-3 w-4/5 bg-surface-elevated rounded" />
            </ShimmerSkeleton>
          </View>
        ) : null}

        {milestoneLabels.length > 0 ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="milestone-recap"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('sessionSummary.milestones')}
            </Text>
            {milestoneLabels.map((label) => (
              <View key={label} className="flex-row items-start mt-1">
                <Text className="text-body text-text-secondary me-2">
                  {'\u2022'}
                </Text>
                <Text className="text-body text-text-primary flex-1">
                  {label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* [WI-1553] four_strands session-end learning summary. Every row is
            positively omitted when its source field is empty/null — no
            negative placeholder copy (AC2). */}
        {persisted?.languageLearningSummary ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="language-practice-card"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('sessionSummary.languagePractice.title')}
            </Text>
            {persisted.languageLearningSummary.practicedScenario ? (
              <Text className="text-body text-text-primary mb-1">
                {t('sessionSummary.languagePractice.scenario', {
                  scenario: persisted.languageLearningSummary.practicedScenario,
                })}
              </Text>
            ) : null}
            {persisted.languageLearningSummary.newWords.length > 0 ? (
              <Text className="text-body text-text-secondary mb-1">
                {t('sessionSummary.languagePractice.newWords', {
                  words: persisted.languageLearningSummary.newWords
                    .map((word) => word.term)
                    .join(', '),
                })}
              </Text>
            ) : null}
            {persisted.languageLearningSummary.strengthenedWords.length > 0 ? (
              <Text className="text-body text-text-secondary mb-1">
                {t('sessionSummary.languagePractice.strengthenedWords', {
                  words: persisted.languageLearningSummary.strengthenedWords
                    .map((word) => word.term)
                    .join(', '),
                })}
              </Text>
            ) : null}
            {persisted.languageLearningSummary.grammarPatterns.length > 0 ? (
              <Text className="text-body text-text-secondary mb-1">
                {t('sessionSummary.languagePractice.grammarPattern', {
                  patterns:
                    persisted.languageLearningSummary.grammarPatterns.join(
                      ', ',
                    ),
                })}
              </Text>
            ) : null}
            {persisted.languageLearningSummary.comprehension ? (
              <Text className="text-body text-text-secondary mb-1">
                {t('sessionSummary.languagePractice.comprehension', {
                  correct:
                    persisted.languageLearningSummary.comprehension.correct,
                  total: persisted.languageLearningSummary.comprehension.total,
                })}
              </Text>
            ) : null}
            {persisted.languageLearningSummary.speakingAttempts > 0 ? (
              <Text className="text-body text-text-secondary mb-1">
                {t('sessionSummary.languagePractice.speakingAttempts', {
                  count: persisted.languageLearningSummary.speakingAttempts,
                })}
              </Text>
            ) : null}
            {persisted.languageLearningSummary.fluency ? (
              <Text className="text-body text-text-secondary mb-1">
                {t('sessionSummary.languagePractice.fluencyResult', {
                  correct: persisted.languageLearningSummary.fluency.correct,
                  total: persisted.languageLearningSummary.fluency.total,
                })}
              </Text>
            ) : null}
            {persisted.languageLearningSummary.nextRecommendationStrand ? (
              <Text className="text-body-sm text-text-secondary mt-2">
                {
                  // [i18n-keep: see scripts/i18n-keep.ts — dynamic strand key]
                  t(
                    `sessionSummary.languagePractice.nextRecommendation.${persisted.languageLearningSummary.nextRecommendationStrand}`,
                  )
                }
              </Text>
            ) : null}
          </View>
        ) : null}

        {shouldShowMentorMemoryCue ? (
          <MentorMemoryCue
            title={t('sessionSummary.mentorMemoryCue.title')}
            subtitle={t('sessionSummary.mentorMemoryCue.subtitle')}
            onPress={handleOpenMentorMemory}
          />
        ) : null}

        {persisted?.nextTopicId && persisted?.nextTopicTitle ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="session-next-topic-card"
          >
            <Text className="text-body font-semibold text-text-primary mb-1">
              {persisted.nextTopicReason
                ? t('sessionSummary.upNext')
                : t('sessionSummary.youMightAlsoLike')}
            </Text>
            {persisted.nextTopicReason ? (
              <Text className="text-body-sm text-text-secondary mb-2">
                {persisted.nextTopicReason}
              </Text>
            ) : null}
            <Text className="text-body text-text-primary mb-3">
              {persisted.nextTopicTitle}
            </Text>
            {effectiveSubjectId ? (
              <Button
                variant="primary"
                label={t('sessionSummary.continueLearning')}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/session',
                    params: {
                      mode: 'learning',
                      subjectId: effectiveSubjectId,
                      topicId: persisted.nextTopicId,
                      topicName: persisted.nextTopicTitle,
                    },
                  } as Href)
                }
                testID="session-next-topic-cta"
              />
            ) : null}
          </View>
        ) : null}

        {/* Feature 2: "Try this next" topic suggestions rail */}
        {shouldShowSuggestionsRail ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="topic-suggestions-rail"
          >
            <Text className="text-body font-semibold text-text-primary mb-3">
              {t('sessionSummary.topicSuggestions.title')}
            </Text>
            {suggestionItems.map((suggestion) => (
              <Pressable
                key={suggestion.id}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/topic/[topicId]',
                    params: {
                      topicId: suggestion.id,
                      // [S5-H1] Pass bookId + subjectId so the topic screen
                      // can pre-select the correct book and subject context,
                      // matching the direct-navigation path from the shelf.
                      bookId: suggestion.bookId,
                      ...((filedSubjectId ?? subjectId)
                        ? { subjectId: filedSubjectId ?? subjectId }
                        : {}),
                    },
                  } as Href)
                }
                className="flex-row items-center py-3 border-b border-surface-elevated"
                testID="topic-suggestion-card"
                accessibilityRole="button"
                accessibilityLabel={suggestion.title}
              >
                <Text className="text-body text-text-primary flex-1">
                  {suggestion.title}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
            ))}
          </View>
        ) : null}

        {shouldShowBookmarkPrompt ? (
          <View
            className="bg-surface rounded-card p-3 mb-4"
            testID="session-bookmark-nudge"
          >
            <Text className="text-body-sm text-text-secondary text-center">
              {t('sessionSummary.bookmarkNudge')}
            </Text>
          </View>
        ) : null}

        {parsedFastCelebrations.length > 0 ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="fast-celebrations"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('sessionSummary.freshWins')}
            </Text>
            {parsedFastCelebrations.map((celebration, index) => (
              <Text
                key={`${celebration.reason ?? 'celebration'}-${index}`}
                className="text-body text-text-primary mt-1"
              >
                {celebration.detail ?? t('sessionSummary.newAchievement')}
              </Text>
            ))}
          </View>
        ) : null}

        {hasXpIncentive && !showSubmittedView && !isPersistedSkipped ? (
          <View
            className="bg-reward-soft rounded-card p-4 mb-4 flex-row items-center"
            testID="xp-incentive-banner"
          >
            <Text className="text-body-sm mr-2">+</Text>
            <View className="flex-1">
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('sessionSummary.reflectionIncentive')}
              </Text>
              <Text className="text-caption text-text-secondary">
                {t('sessionSummary.xpBreakdown', {
                  base: baseXp,
                  total: baseXp + (reflectionBonusXp ?? 0),
                })}
              </Text>
            </View>
          </View>
        ) : null}

        {hasXpIncentive && showSubmittedView && reflectionBonusXp != null ? (
          <View
            className="bg-reward-soft rounded-card p-4 mb-4 flex-row items-center"
            testID="xp-bonus-earned"
          >
            <Text className="text-body-sm mr-2">+</Text>
            <Text className="text-body-sm font-semibold text-reward">
              {t('sessionSummary.bonusXpEarned', { xp: reflectionBonusXp })}
            </Text>
          </View>
        ) : null}

        {hasXpIncentive &&
        isPersistedSkipped &&
        summaryText.length === 0 &&
        reflectionBonusXp != null ? (
          <View className="rounded-card p-4 mb-4" testID="xp-bonus-missed">
            {/* BUG-150: Reframe "You missed +N XP" (punitive loss-framing)
                as a forward-looking invitation. Skipping reflection is a
                normal choice, not a failure to flag — the prior copy
                violated the "positive framing / no struggle" rule. */}
            <Text className="text-body-sm text-text-secondary">
              {t('sessionSummary.reflectionNextTime', {
                xp: reflectionBonusXp,
              })}
            </Text>
          </View>
        ) : null}

        {/* Recall bridge questions — shown after homework summary submit/skip (Story 2.7) */}
        {recallQuestions && (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="recall-bridge-questions"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('sessionSummary.recallCheckTitle')}
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              {t('sessionSummary.recallCheckIntro')}
            </Text>
            {recallQuestions.map((question, index) => (
              <View key={index} className="mb-3">
                <Text className="text-body text-text-primary">
                  {index + 1}. {question}
                </Text>
              </View>
            ))}
            <View className="mt-2">
              <Button
                variant="primary"
                label={t('sessionSummary.doneHeadHome')}
                onPress={() => {
                  void (async () => {
                    await maybePromptForRecall();
                    finishSummaryNavigation();
                  })();
                }}
                testID="recall-bridge-done-button"
              />
            </View>
          </View>
        )}

        {/* Your Words section — branches on four states:
            (a) submitted in this render OR persisted submitted/accepted → show saved content + feedback
            (b) persisted skipped AND no local draft → read-only skipped-state message
            (c) persisted skipped AND local draft rehydrated → input form + resume banner
                (lets users recover after the legacy "typed-then-closed" trap)
            (d) otherwise → input form with chips (happy path for just-ended sessions) */}
        {showSubmittedView ? (
          <View className="mb-4">
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('sessionSummary.yourWords')}
            </Text>
            <View
              className="bg-surface rounded-card p-4"
              testID="summary-submitted"
            >
              <View className="items-center mb-3">
                <CheckmarkPopAnimation size={80} />
              </View>
              <Text className="text-body text-text-primary mb-2">
                {displayContent}
              </Text>
              {Platform.OS === 'web' ? (
                <View
                  className="sr-only"
                  testID="feedback-retry-status"
                  role="status"
                  accessibilityLiveRegion="polite"
                >
                  <Text testID="feedback-retry-status-message">
                    {feedbackRetryAttempted
                      ? displayAiFeedback
                        ? `${t('sessionSummary.mateFeedback')}: ${displayAiFeedback}`
                        : displayFeedbackStatus === 'unavailable'
                          ? t('sessionSummary.feedbackStillUnavailable')
                          : ''
                      : ''}
                  </Text>
                </View>
              ) : null}
              {displayAiFeedback ? (
                <>
                  <View className="h-px bg-surface-elevated my-3" />
                  <Text className="text-body-sm font-semibold text-text-primary mb-1">
                    {t('sessionSummary.mateFeedback')}
                  </Text>
                  <Text
                    className="text-body-sm text-text-secondary"
                    testID="ai-feedback"
                  >
                    {displayAiFeedback}
                  </Text>
                </>
              ) : displayFeedbackStatus === 'unavailable' ? (
                <View
                  className="mt-3 border-t border-surface-elevated pt-3"
                  testID="feedback-unavailable"
                >
                  <Text className="text-body-sm font-semibold text-text-primary mb-1">
                    {t('sessionSummary.feedbackUnavailableTitle')}
                  </Text>
                  <Text className="text-body-sm text-text-secondary mb-3">
                    {feedbackRetryAttempted || retrySummaryFeedback.isError
                      ? t('sessionSummary.feedbackStillUnavailable')
                      : t('sessionSummary.feedbackUnavailableMessage')}
                  </Text>
                  <Button
                    variant="secondary"
                    label={
                      retrySummaryFeedback.isPending
                        ? t('sessionSummary.retryingFeedback')
                        : t('sessionSummary.retryFeedback')
                    }
                    onPress={() => {
                      void handleRetryFeedback();
                    }}
                    loading={retrySummaryFeedback.isPending}
                    testID="retry-feedback-button"
                  />
                </View>
              ) : null}
            </View>
          </View>
        ) : isPersistedSkipped && summaryText.length === 0 ? (
          <View className="mb-4" testID="summary-skipped-state">
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('sessionSummary.yourWords')}
            </Text>
            <View className="bg-surface rounded-card p-4">
              <Text className="text-body text-text-secondary">
                {t('sessionSummary.skippedNotice')}
              </Text>
            </View>
          </View>
        ) : (
          <View className="mb-4">
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('sessionSummary.yourWords')}
            </Text>
            {isPersistedSkipped ? (
              <View
                className="bg-surface-elevated rounded-card p-3 mb-3"
                testID="summary-resubmit-banner"
              >
                <Text className="text-body-sm text-text-secondary">
                  {t('sessionSummary.resumeReflectionBanner')}
                </Text>
              </View>
            ) : null}
            <Text className="text-body-sm text-text-secondary mb-3">
              {t('sessionSummary.writePrompt')}
            </Text>

            {/* BUG-33 Phase 1: Sentence starter chips */}
            <View
              className="flex-row flex-wrap gap-2 mb-3"
              testID="summary-prompt-chips"
              accessibilityLabel={t('sessionSummary.a11yStarters')}
            >
              {summaryPrompts.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => setSummaryText(prompt)}
                  className="bg-surface-elevated rounded-button px-3 py-2"
                  testID={`summary-prompt-chip-${prompt}`}
                  accessibilityLabel={prompt}
                  accessibilityRole="button"
                  accessibilityHint={t('sessionSummary.a11yStarterHint')}
                >
                  <Text className="text-caption text-text-secondary">
                    {prompt}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              className="bg-surface rounded-card px-4 py-3 text-body text-text-primary min-h-[120px]"
              placeholder={reflectionPlaceholder}
              placeholderTextColor={colors.muted}
              value={summaryText}
              onChangeText={setSummaryText}
              multiline
              maxLength={2000}
              textAlignVertical="top"
              editable={!submitSummary.isPending}
              testID="summary-input"
              accessibilityLabel={t('sessionSummary.a11yWriteSummary')}
            />
            <Text className="text-caption text-text-secondary mt-1 text-right">
              {summaryText.length}/2000
            </Text>

            {submitSummary.isError && (
              <Text
                className="text-body-sm text-danger mt-2"
                testID="summary-error"
              >
                {t('sessionSummary.saveError')}
              </Text>
            )}

            {skipSummary.isError && (
              <Text
                className="text-body-sm text-danger mt-2"
                testID="skip-summary-error"
              >
                {t('sessionSummary.skipError')}
              </Text>
            )}

            <View className="mt-3">
              <Button
                variant="primary"
                label={t('sessionSummary.submitSummary')}
                onPress={() => {
                  void handleSubmit();
                }}
                disabled={summaryText.trim().length < 10}
                loading={submitSummary.isPending}
                testID="submit-summary-button"
              />
            </View>
          </View>
        )}

        {/* Skip / Continue — skip is only shown for the unresolved / happy path */}
        {showSubmittedView || isPersistedSkipped ? (
          // Not converted to shared Button: this site's accessibilityLabel
          // (a11yContinueLearning / a11yContinueToHome) intentionally
          // diverges from its visible "Continue" label — Button has no
          // accessibilityLabel override (it derives SR text from `label`),
          // so converting would regress the more specific SR announcement.
          <Pressable
            onPress={() => {
              void handleContinue();
            }}
            className="bg-primary rounded-button py-3 items-center mt-2"
            testID="continue-button"
            accessibilityLabel={
              isRevisitedPersistedSummary
                ? t('sessionSummary.a11yContinueLearning')
                : t('sessionSummary.a11yContinueToHome')
            }
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('common.continue')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              void handleContinue();
            }}
            className="py-3 items-center"
            testID="skip-summary-button"
            accessibilityLabel={t('sessionSummary.a11ySkipSummary')}
            accessibilityRole="button"
          >
            <Text className="text-body-sm text-text-secondary">
              {skipSummary.isPending
                ? t('sessionSummary.skipping')
                : t('sessionSummary.skipForNow')}
            </Text>
          </Pressable>
        )}

        {/* Story 4.12: Post-session Library navigation */}
        <Pressable
          onPress={handleGoToLibrary}
          className="py-3 items-center mt-1"
          testID="go-to-library"
          accessibilityLabel={t('sessionSummary.seeYourLibrary')}
          accessibilityRole="link"
        >
          <Text className="text-caption text-text-secondary">
            {t('sessionSummary.seeYourLibrary')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
