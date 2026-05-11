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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';
import { computeAgeBracket } from '@eduagent/schemas';
import { useProfile } from '../../lib/profile';
import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import { useParentProxy } from '../../hooks/use-parent-proxy';
import { useRatingPrompt } from '../../hooks/use-rating-prompt';
import {
  useSession,
  useSessionTranscript,
  useSessionSummary,
  useSkipSummary,
  useSubmitSummary,
  useRecallBridge,
} from '../../hooks/use-sessions';
import { useSessionBookmarks } from '../../hooks/use-bookmarks';
import { useDepthEvaluation } from '../../hooks/use-depth-evaluation';
import { useProgressInventory } from '../../hooks/use-progress';
import { usePostSessionNotificationAsk } from '../../hooks/use-post-session-notification-ask';
import { goBackOrReplace } from '../../lib/navigation';
import { platformAlert } from '../../lib/platform-alert';
import { formatApiError } from '../../lib/format-api-error';
import { Sentry } from '../../lib/sentry';
import {
  readSummaryDraft,
  writeSummaryDraft,
  clearSummaryDraft,
} from '../../lib/summary-draft';
import { getReflectionStarters } from '../../lib/reflection-starters';
import {
  CheckmarkPopAnimation,
  BrandCelebration,
  ShimmerSkeleton,
  ErrorFallback,
} from '../../components/common';
import { FilingFailedBanner } from '../../components/session/FilingFailedBanner';
import { MentorMemoryCue } from '../../components/session-summary/MentorMemoryCue';

const SKIP_NUDGE_THRESHOLD = 3;
const SKIP_WARNING_THRESHOLD = 5;

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
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [summaryText, setSummaryText] = useState('');
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedXp, setSubmittedXp] = useState<{
    baseXp: number | null;
    reflectionBonusXp: number | null;
  } | null>(null);
  const [recapTimedOut, setRecapTimedOut] = useState(false);
  // UX-DE-M2: timeout guard — escape from unbounded loading spinner
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
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

  const submitSummary = useSubmitSummary(sessionId ?? '');
  const skipSummary = useSkipSummary(sessionId ?? '');
  const session = useSession(sessionId ?? '');
  const transcript = useSessionTranscript(sessionId ?? '');
  const liveTranscript =
    transcript.data?.archived === false ? transcript.data : null;
  const { onSuccessfulRecall } = useRatingPrompt();
  const { activeProfile } = useProfile();
  const { isParentProxy, childProfile } = useParentProxy();
  const activeProfileRole = useActiveProfileRole();
  const ageBracket =
    activeProfile?.birthYear != null
      ? computeAgeBracket(activeProfile.birthYear)
      : 'adolescent';
  const recallBridge = useRecallBridge(sessionId ?? '');
  const depthEvaluation = useDepthEvaluation();
  const progressInventory = useProgressInventory();
  // JIT notification permission ask — fires once after the user has
  // completed at least one session (the post-value moment). Skipped in
  // parent-proxy mode and dedup'd via SecureStore inside the hook.
  // Must be called before any early returns to satisfy Rules of Hooks.
  usePostSessionNotificationAsk(
    activeProfile?.id,
    (progressInventory.data?.global.totalSessions ?? 0) >= 1,
    isParentProxy,
  );
  const [recallQuestions, setRecallQuestions] = useState<string[] | null>(null);

  // BUG-449: when the user re-enters this screen from Library → Shelf → Book →
  // (past session tap), we must render their previously-saved summary instead
  // of the empty "Your Words" prompt. The local `submitted` state only covers
  // the just-submitted case in the same render; persisted state comes from
  // GET /sessions/:sessionId/summary.
  // [BUG-801] Use Number.isFinite + ?? rather than `||` to preserve an
  // explicit 0 from the URL param. parseInt(...,'') returned NaN which
  // chained into `||` and silently fell back to the server count, but a
  // legitimate 0-exchange session was indistinguishable from missing data.
  const trimmedExchangeCount = (exchangeCount ?? '').trim();
  const parsedExchangeCount =
    trimmedExchangeCount === '' ? NaN : Number(trimmedExchangeCount);
  const exchangeCountForRecap = Number.isFinite(parsedExchangeCount)
    ? parsedExchangeCount
    : (liveTranscript?.session.exchangeCount ?? 0);
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
  const isPersistedSubmitted =
    persisted?.status === 'submitted' || persisted?.status === 'accepted';
  const isPersistedSkipped = persisted?.status === 'skipped';
  const isAlreadyPersisted = isPersistedSubmitted || isPersistedSkipped;

  // Fire depth evaluation for fresh sessions to trigger server-side telemetry
  // (session quality gating, topic detection). Fire-and-forget — the result
  // drives analytics, not UI. Skip for revisited/persisted sessions.
  // Ref (not state) because the guard must be synchronous: Strict Mode and
  // rapid rerenders can re-run this effect before a setState would flush,
  // but the ref assignment lands immediately so the second pass short-circuits.
  const depthFiredRef = useRef(false);
  useEffect(() => {
    if (sessionId && !isAlreadyPersisted && !depthFiredRef.current) {
      depthFiredRef.current = true;
      depthEvaluation.mutate({ sessionId });
    }
  }, [sessionId, isAlreadyPersisted, depthEvaluation]);

  useEffect(() => {
    setRecapTimedOut(false);
  }, [sessionId]);

  useEffect(() => {
    if (recapTimedOut || exchangeCountForRecap < 3 || persisted?.learnerRecap) {
      return;
    }

    const timer = setTimeout(() => setRecapTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [exchangeCountForRecap, persisted?.learnerRecap, recapTimedOut]);

  // UX-DE-M2: 15s escape from the initial loading spinner
  useEffect(() => {
    if (!transcript.isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const t = setTimeout(() => setLoadingTimedOut(true), 15_000);
    return () => clearTimeout(t);
  }, [transcript.isLoading]);

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
  const displayAiFeedback = submitted
    ? aiFeedback
    : (persisted?.aiFeedback ?? null);
  const transcriptSessionType = liveTranscript?.session.sessionType;
  const sessionType: 'learning' | 'freeform' | 'homework' =
    sessionTypeParam === 'homework' || transcriptSessionType === 'homework'
      ? 'homework'
      : sessionTypeParam === 'freeform'
        ? 'freeform'
        : 'learning';
  const conversationLanguage = activeProfile?.conversationLanguage ?? 'en';
  const summaryPrompts = getReflectionStarters(
    sessionType,
    conversationLanguage,
  );
  const recapHeader =
    sessionType === 'homework'
      ? 'What you practiced'
      : sessionType === 'freeform'
        ? 'What you asked about'
        : 'What you explored';
  const reflectionPlaceholder =
    sessionType === 'homework'
      ? 'What I practiced...'
      : sessionType === 'freeform'
        ? 'What I found out...'
        : 'In my own words...';
  const baseXp = (submitted ? submittedXp?.baseXp : persisted?.baseXp) ?? null;
  const reflectionBonusXp =
    (submitted
      ? submittedXp?.reflectionBonusXp
      : persisted?.reflectionBonusXp) ?? null;
  const hasXpIncentive = baseXp != null && baseXp > 0;

  const isHomeworkSession = sessionType === 'homework';

  const fallbackSession = liveTranscript?.session;
  // [BUG-801] Same parseInt-||-fallback anti-pattern as exchangeCountForRecap
  // above. An explicit "0" param must be honored, not silently overridden by
  // the server count. Reuses the trimmed/parsed result from line 124-126.
  const exchanges = Number.isFinite(parsedExchangeCount)
    ? parsedExchangeCount
    : (fallbackSession?.exchangeCount ?? 0);
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
  const parsedMilestones = (() => {
    if (!milestones) {
      return fallbackSession?.milestonesReached ?? [];
    }

    try {
      // [BUG-821 / F-MOB-23] Type-guard parsed values are strings before
      // render so a malformed param can't crash the celebration list.
      const raw = JSON.parse(decodeURIComponent(milestones)) as unknown;
      if (!Array.isArray(raw)) {
        Sentry.captureMessage(
          'session-summary milestone param parsed to non-array',
          { level: 'warning', extra: { milestonesParam: milestones } },
        );
        return fallbackSession?.milestonesReached ?? [];
      }
      return raw.filter((v): v is string => typeof v === 'string');
    } catch (err) {
      // [BUG-821 / F-MOB-23] Surface parse failures to telemetry — silent
      // fallback was hiding both URL-corruption and prod regressions.
      Sentry.captureException(err, {
        tags: { surface: 'session-summary', field: 'milestones' },
        extra: { milestonesParam: milestones },
      });
      return fallbackSession?.milestonesReached ?? [];
    }
  })();
  const parsedFastCelebrations = (() => {
    try {
      return JSON.parse(decodeURIComponent(fastCelebrations ?? '[]')) as Array<{
        reason?: string;
        detail?: string | null;
      }>;
    } catch {
      return [] as Array<{ reason?: string; detail?: string | null }>;
    }
  })();
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
      router.replace('/(app)/library' as never);
      InteractionManager.runAfterInteractions(() => {
        router.push({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: { subjectId: filedSubjectId, bookId: filedBookId },
        } as never);
      });
      return;
    }

    const effectiveTopicId = topicId ?? fallbackSession?.topicId;
    const effectiveSubjectId = subjectId ?? fallbackSession?.subjectId;
    if (isAlreadyPersisted && effectiveTopicId && effectiveSubjectId) {
      router.replace({
        pathname: '/(app)/topic/[topicId]',
        params: { topicId: effectiveTopicId, subjectId: effectiveSubjectId },
      } as never);
      return;
    }

    goBackOrReplace(router, '/(app)/home');
  };

  if (!sessionId) {
    return (
      <ErrorFallback
        variant="centered"
        title="Session not found"
        message="We couldn't find this session. Head home to start a new one."
        primaryAction={{
          label: 'Go Home',
          onPress: () => goBackOrReplace(router, '/(app)/home'),
          testID: 'session-summary-missing-param',
        }}
      />
    );
  }

  const isSessionExpired =
    transcript.isError &&
    typeof transcript.error === 'object' &&
    transcript.error !== null &&
    'status' in transcript.error &&
    (transcript.error as { status?: unknown }).status === 404;

  if (isSessionExpired) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-3">
          This session has expired
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          This session is no longer available. Head home to start a new one.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home')}
          className="bg-primary rounded-button py-3 px-8 items-center"
          testID="expired-session-go-home"
          accessibilityLabel="Go home"
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Go Home
          </Text>
        </Pressable>
      </View>
    );
  }

  // [F-025] Catch-all for non-404 errors (e.g. 400 from a garbage session ID,
  // 500 from a server error). The original guard only covered 404.
  if (transcript.isError) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-3">
          Session not found
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          We couldn&apos;t load this session. It may no longer exist.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home')}
          className="bg-primary rounded-button py-3 px-8 items-center"
          testID="session-not-found-go-home"
          accessibilityLabel="Go home"
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Go Home
          </Text>
        </Pressable>
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
          title="Taking longer than expected"
          message="We couldn't load your session summary. Check your connection and try again."
          primaryAction={{
            label: 'Try Again',
            onPress: () => {
              setLoadingTimedOut(false);
              void transcript.refetch();
            },
          }}
          secondaryAction={{
            label: 'Go Home',
            onPress: () => goBackOrReplace(router, '/(app)/home'),
          }}
        />
      );
    }
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <ActivityIndicator />
        <Text className="text-text-secondary text-body text-center mt-3">
          Loading your session summary...
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
          Session not found
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          This session could not be loaded. Head home to start a new one.
        </Text>
        <Pressable
          onPress={() => router.replace('/(app)/home')}
          className="bg-primary rounded-button py-3 px-8 items-center"
          testID="session-not-found-go-home"
          accessibilityLabel="Go home"
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Go Home
          </Text>
        </Pressable>
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
        baseXp: result.summary.baseXp,
        reflectionBonusXp: result.summary.reflectionBonusXp,
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
      return true;
    } catch (err) {
      // Error state surfaced by submitSummary.isError inline in JSX [SC-1].
      // The draft stays on disk: on retry the user's text is preserved
      // even if the app is force-killed between attempts.
      console.error('[SessionSummary] handleSubmit failed:', err);
      // [BUG-800] Use formatApiError so typed server errors (400 word-limit,
      // 422 too-short, etc.) reach the user verbatim. The previous generic
      // 'Please try again.' hid actionable reasons — user could not self-correct.
      platformAlert('Could not save', formatApiError(err));
      return false;
    } finally {
      submitInFlight.current = false;
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
              text: 'Keep writing',
              style: 'cancel' as const,
              onPress: () => resolve('keep'),
            },
            { text: 'Submit now', onPress: () => resolve('submit') },
            {
              text: 'Discard',
              style: 'destructive' as const,
              onPress: () => resolve('discard'),
            },
          ]
        : [
            {
              text: 'Keep writing',
              style: 'cancel' as const,
              onPress: () => resolve('keep'),
            },
            {
              text: 'Discard',
              style: 'destructive' as const,
              onPress: () => resolve('discard'),
            },
          ];
      platformAlert(
        'Save your reflection?',
        canSubmit
          ? "You typed a reflection but haven't submitted it. Submit it now, discard it, or keep writing?"
          : 'Your reflection is too short to submit (it needs at least 10 characters). Discard it or keep writing?',
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

      let skipResult:
        | Awaited<ReturnType<typeof skipSummary.mutateAsync>>
        | undefined;
      try {
        skipResult = await skipSummary.mutateAsync();
      } catch {
        skipInFlight.current = false;
        // S-3: Surface skip failures — bare catch { return } was silent.
        platformAlert('Could not skip', 'Please try again.');
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

      if (skipResult?.consecutiveSummarySkips === SKIP_NUDGE_THRESHOLD) {
        platformAlert(
          'Give it a try?',
          'Reflecting helps you remember. Give it a try next time?',
          [
            {
              text: t('common.ok'),
              onPress: () => {
                void (async () => {
                  await maybePromptForRecall();
                  finishSummaryNavigation();
                })();
              },
            },
          ],
        );
        return;
      }

      if (
        skipResult?.consecutiveSummarySkips != null &&
        skipResult.consecutiveSummarySkips >= SKIP_WARNING_THRESHOLD
      ) {
        platformAlert(
          'Summaries help you learn',
          'Students who reflect remember 2x more. Try it next time!',
          [
            {
              text: 'Got it',
              onPress: () => {
                void (async () => {
                  await maybePromptForRecall();
                  finishSummaryNavigation();
                })();
              },
            },
          ],
        );
        return;
      }
    }

    await maybePromptForRecall();
    finishSummaryNavigation();
  };

  const handleGoToLibrary = (): void => {
    if (topicId && subjectId) {
      router.replace({
        pathname: '/(app)/topic/[topicId]',
        params: { topicId, subjectId },
      } as never);
    } else if (fallbackSession?.topicId && fallbackSession.subjectId) {
      router.replace({
        pathname: '/(app)/topic/[topicId]',
        params: {
          topicId: fallbackSession.topicId,
          subjectId: fallbackSession.subjectId,
        },
      } as never);
    } else {
      router.replace('/(app)/library');
    }
  };

  const handleOpenMentorMemory = (): void => {
    if (activeProfileRole === 'impersonated-child' && childProfile?.id) {
      router.push({
        pathname: '/(app)/child/[profileId]/mentor-memory',
        params: { profileId: childProfile.id },
      } as never);
      return;
    }

    router.push('/(app)/mentor-memory');
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

  const takeaways: string[] = [];
  if (hasResolvedDuration) {
    takeaways.push(
      `${wallClockMinutes} minute${
        wallClockMinutes === 1 ? '' : 's'
      } - great session!`,
    );
  }
  if (exchanges > 0) {
    takeaways.push(
      `You worked through ${exchanges} exchange${exchanges === 1 ? '' : 's'}`,
    );
  }
  if (rung >= 3) {
    takeaways.push('You tackled some challenging concepts with guidance');
  } else if (exchanges > 0) {
    takeaways.push('You showed strong independent thinking');
  }
  if (takeaways.length === 0) {
    takeaways.push('Great effort today');
  }

  const milestoneLabels = parsedMilestones.map((milestone) => {
    switch (milestone) {
      case 'polar_star':
        return 'Polar Star - first independent answer';
      case 'deep_diver':
        return 'Deep Diver - great thoughtful responses';
      case 'comet':
        return 'Comet - you had a breakthrough!';
      case 'orions_belt':
        return "Orion's Belt - 5 in a row without help!";
      case 'persistent':
        return 'Persistent - you kept going';
      case 'twin_stars':
        return 'Twin Stars - three strong answers in a row';
      default:
        return milestone;
    }
  });
  const effectiveSubjectId = subjectId ?? fallbackSession?.subjectId ?? null;
  const completedSessionCount = progressInventory.data?.global.totalSessions;
  const hasMentorMemorySignal =
    completedSessionCount !== undefined && completedSessionCount >= 2;
  const hasParentProxyMemoryAccess =
    !isParentProxy ||
    (childProfile?.consentStatus === 'CONSENTED' && !!childProfile.id);
  const shouldShowMentorMemoryCue =
    hasMentorMemorySignal && hasParentProxyMemoryAccess;
  const shouldShowBookmarkPrompt =
    exchanges >= 5 &&
    (sessionBookmarks.data?.length ?? 0) === 0 &&
    (progressInventory.data?.global.totalSessions ?? 0) <= 3;

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
            accessibilityLabel="Close and go home"
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
            Session Complete
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
        {session.data ? <FilingFailedBanner session={session.data} /> : null}

        {persisted?.closingLine ? (
          <Text
            className="text-body text-text-primary italic px-1 mb-3"
            testID="session-closing-line"
          >
            {persisted.closingLine}
          </Text>
        ) : null}

        {/* Session takeaways (learner-friendly, no internal metrics) */}
        <View
          className="bg-surface rounded-card p-4 mb-4"
          testID="session-takeaways"
        >
          <Text className="text-body font-semibold text-text-primary mb-2">
            What happened
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
            I'll check in with you soon
          </Text>
        </View>

        {/*
          Resume-this-session entry point. When the learner revisits a past
          session from Library \u2192 Book \u2192 past conversation, they expect to be
          able to re-open the chat itself, not just read the summary.
          Hidden in parent-proxy mode: parents must not access learner chat
          content (the (app)/session route also redirects parents away as a
          server-side belt-and-suspenders, but we hide the affordance here too
          so it never appears on the parent UI).
        */}
        {!isParentProxy && sessionId ? (
          <Pressable
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
              } as never);
            }}
            className="bg-primary rounded-button py-3 items-center mb-4"
            accessibilityRole="button"
            accessibilityLabel="Resume this session"
            testID="resume-session-cta"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Resume this session
            </Text>
          </Pressable>
        ) : null}

        {/* [BUG-889] Returning learners had no path to the actual chat history.
            The transcript exists server-side and powers session resume; this
            link surfaces it in a read-only screen so the learner can scroll
            back through what was discussed.
            [CR-PR129-M5] Hide transcript in parent-proxy mode: parents have
            read-only summary access only and must not see the full chat log. */}
        {!isParentProxy && sessionId ? (
          <Pressable
            onPress={() => {
              // [M-8] session-transcript is a sibling fullScreenModal in the
              // root stack (see _layout.tsx), not a child of session-summary.
              // Both are presented as fullScreenModal, so Expo Router pushes
              // transcript on top of summary — router.back() inside the
              // transcript screen returns here correctly via goBackOrReplace.
              // No ancestor-chain push needed; the cast to `as never` was
              // masking a false-positive — the object already satisfies
              // HrefObject (pathname: string, params?: UnknownInputParams).
              router.push({
                pathname: '/session-transcript/[sessionId]',
                params: { sessionId },
              });
            }}
            className="bg-surface rounded-button py-3 items-center mb-4"
            accessibilityRole="button"
            accessibilityLabel="View full transcript"
            testID="view-transcript-cta"
          >
            <Text className="text-text-primary text-body font-semibold">
              View full transcript
            </Text>
          </Pressable>
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
              Your learner recap is still loading.
            </Text>
            <Pressable
              onPress={() => {
                setRecapTimedOut(false);
                void persistedSummary.refetch();
              }}
              className="mt-3 items-center"
              accessibilityRole="button"
              accessibilityLabel="Retry loading session recap"
              testID="session-recap-retry"
            >
              <Text className="text-body-sm font-semibold text-primary">
                Tap to retry
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
              Milestones
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
              {persisted.nextTopicReason ? 'Up next' : 'You might also like'}
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
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(app)/session',
                    params: {
                      mode: 'learning',
                      subjectId: effectiveSubjectId,
                      topicId: persisted.nextTopicId,
                      topicName: persisted.nextTopicTitle,
                    },
                  } as never)
                }
                className="bg-primary rounded-button py-3 items-center"
                accessibilityRole="button"
                accessibilityLabel="Continue learning"
                testID="session-next-topic-cta"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  Continue learning
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {shouldShowBookmarkPrompt ? (
          <View
            className="bg-surface rounded-card p-3 mb-4"
            testID="session-bookmark-nudge"
          >
            <Text className="text-body-sm text-text-secondary text-center">
              Some great explanations in this session — you can bookmark them
              next time.
            </Text>
          </View>
        ) : null}

        {parsedFastCelebrations.length > 0 ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="fast-celebrations"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              Fresh wins
            </Text>
            {parsedFastCelebrations.map((celebration, index) => (
              <Text
                key={`${celebration.reason ?? 'celebration'}-${index}`}
                className="text-body text-text-primary mt-1"
              >
                {celebration.detail ??
                  'A new achievement landed right after your session.'}
              </Text>
            ))}
          </View>
        ) : null}

        {hasXpIncentive && !showSubmittedView && !isPersistedSkipped ? (
          <View
            className="bg-surface-elevated rounded-card p-4 mb-4 flex-row items-center"
            testID="xp-incentive-banner"
          >
            <Text className="text-body-sm mr-2">+</Text>
            <View className="flex-1">
              <Text className="text-body-sm font-semibold text-text-primary">
                Write a reflection to earn 1.5x XP
              </Text>
              <Text className="text-caption text-text-secondary">
                Base: {baseXp} XP → With reflection:{' '}
                {baseXp + (reflectionBonusXp ?? 0)} XP
              </Text>
            </View>
          </View>
        ) : null}

        {hasXpIncentive && showSubmittedView && reflectionBonusXp != null ? (
          <View
            className="bg-success/10 rounded-card p-4 mb-4 flex-row items-center"
            testID="xp-bonus-earned"
          >
            <Text className="text-body-sm mr-2">+</Text>
            <Text className="text-body-sm font-semibold text-success">
              +{reflectionBonusXp} bonus XP earned!
            </Text>
          </View>
        ) : null}

        {hasXpIncentive &&
        isPersistedSkipped &&
        summaryText.length === 0 &&
        reflectionBonusXp != null ? (
          <View className="rounded-card p-4 mb-4" testID="xp-bonus-missed">
            <Text className="text-body-sm text-text-secondary">
              You missed +{reflectionBonusXp} XP
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
              Quick recall check
            </Text>
            <Text className="text-body-sm text-text-secondary mb-4">
              Nice work on that homework! Can you answer these about the method
              you used?
            </Text>
            {recallQuestions.map((question, index) => (
              <View key={index} className="mb-3">
                <Text className="text-body text-text-primary">
                  {index + 1}. {question}
                </Text>
              </View>
            ))}
            <Pressable
              className="bg-primary rounded-button py-3 items-center mt-2"
              onPress={() => {
                void (async () => {
                  await maybePromptForRecall();
                  finishSummaryNavigation();
                })();
              }}
              testID="recall-bridge-done-button"
              accessibilityLabel="Done, head home"
              accessibilityRole="button"
            >
              <Text className="text-text-inverse text-body font-semibold">
                Done — head home
              </Text>
            </Pressable>
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
              Your Words
            </Text>
            <View
              className="bg-surface rounded-card p-4"
              testID="summary-submitted"
            >
              <View className="items-center mb-3">
                <CheckmarkPopAnimation size={56} />
              </View>
              <Text className="text-body text-text-primary mb-2">
                {displayContent}
              </Text>
              {displayAiFeedback ? (
                <>
                  <View className="h-px bg-surface-elevated my-3" />
                  <Text className="text-body-sm font-semibold text-text-primary mb-1">
                    Mate feedback
                  </Text>
                  <Text
                    className="text-body-sm text-text-secondary"
                    testID="ai-feedback"
                  >
                    {displayAiFeedback}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        ) : isPersistedSkipped && summaryText.length === 0 ? (
          <View className="mb-4" testID="summary-skipped-state">
            <Text className="text-body font-semibold text-text-primary mb-2">
              Your Words
            </Text>
            <View className="bg-surface rounded-card p-4">
              <Text className="text-body text-text-secondary">
                You skipped writing a summary for this session.
              </Text>
            </View>
          </View>
        ) : (
          <View className="mb-4">
            <Text className="text-body font-semibold text-text-primary mb-2">
              Your Words
            </Text>
            {isPersistedSkipped ? (
              <View
                className="bg-surface-elevated rounded-card p-3 mb-3"
                testID="summary-resubmit-banner"
              >
                <Text className="text-body-sm text-text-secondary">
                  You started a reflection but didn&apos;t submit it last time.
                  Finish it below and submit to save your words.
                </Text>
              </View>
            ) : null}
            <Text className="text-body-sm text-text-secondary mb-3">
              Write a short summary of what you learned. This helps you remember
              and helps me plan what comes next.
            </Text>

            {/* BUG-33 Phase 1: Sentence starter chips */}
            <View
              className="flex-row flex-wrap gap-2 mb-3"
              testID="summary-prompt-chips"
              accessibilityLabel="Sentence starter suggestions"
            >
              {summaryPrompts.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => setSummaryText(prompt)}
                  className="bg-surface-elevated rounded-button px-3 py-2"
                  testID={`summary-prompt-chip-${prompt}`}
                  accessibilityLabel={prompt}
                  accessibilityRole="button"
                  accessibilityHint="Tap to use this sentence starter"
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
              accessibilityLabel="Write your learning summary"
            />
            <Text className="text-caption text-text-secondary mt-1 text-right">
              {summaryText.length}/2000
            </Text>

            {submitSummary.isError && (
              <Text
                className="text-body-sm text-danger mt-2"
                testID="summary-error"
              >
                Couldn't save your summary. Check your connection and try again
                — your work won't be lost.
              </Text>
            )}

            {skipSummary.isError && (
              <Text
                className="text-body-sm text-danger mt-2"
                testID="skip-summary-error"
              >
                Couldn't skip your summary right now. Check your connection and
                try again.
              </Text>
            )}

            <Pressable
              onPress={() => {
                void handleSubmit();
              }}
              disabled={
                summaryText.trim().length < 10 || submitSummary.isPending
              }
              className={`rounded-button py-3 items-center mt-3 ${
                summaryText.trim().length >= 10 && !submitSummary.isPending
                  ? 'bg-primary'
                  : 'bg-surface-elevated'
              }`}
              testID="submit-summary-button"
              accessibilityLabel="Submit summary"
              accessibilityRole="button"
            >
              {submitSummary.isPending ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text
                  className={`text-body font-semibold ${
                    summaryText.trim().length >= 10
                      ? 'text-text-inverse'
                      : 'text-text-secondary'
                  }`}
                >
                  Submit Summary
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Skip / Continue — skip is only shown for the unresolved / happy path */}
        {showSubmittedView || isPersistedSkipped ? (
          <Pressable
            onPress={() => {
              void handleContinue();
            }}
            className="bg-primary rounded-button py-3 items-center mt-2"
            testID="continue-button"
            accessibilityLabel={
              isAlreadyPersisted ? 'Continue learning' : 'Continue to home'
            }
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Continue
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              void handleContinue();
            }}
            className="py-3 items-center"
            testID="skip-summary-button"
            accessibilityLabel="Skip summary"
            accessibilityRole="button"
          >
            <Text className="text-body-sm text-text-secondary">
              {skipSummary.isPending ? 'Skipping...' : 'Skip for now'}
            </Text>
          </Pressable>
        )}

        {/* Story 4.12: Post-session Library navigation */}
        <Pressable
          onPress={handleGoToLibrary}
          className="py-3 items-center mt-1"
          testID="go-to-library"
          accessibilityLabel="See your Library"
          accessibilityRole="link"
        >
          <Text className="text-caption text-text-secondary">
            See your Library
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
