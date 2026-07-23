import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  Bookmark,
  CurriculumTopic,
  RetentionStatus,
} from '@eduagent/schemas';
import type { Translate } from '../../../i18n';
import { useBookWithTopics } from '../../../hooks/use-books';
import {
  useTopicProgress,
  useActiveSessionForTopic,
  useResolveTopicSubject,
  useLearningResumeTarget,
} from '../../../hooks/use-progress';
import { useTopicRetention } from '../../../hooks/use-retention';
import {
  useTopicNotes,
  useConceptMasterySignals,
  useCreateNote,
  useUpdateNote,
  useDeleteNoteById,
} from '../../../hooks/use-notes';
import { useTopicSessions } from '../../../hooks/use-topic-sessions';
import { useRelativeDate } from '../../../hooks/use-time-format';
import { useBookmarks } from '../../../hooks/use-bookmarks';
import { withOpacity } from '../../../lib/color-opacity';
import { formatShortDate } from '../../../lib/format-datetime';
import { useThemeColors } from '../../../lib/theme';
import { formatSourceLine } from '../../../lib/format-note-source';
import { deriveRetentionStatus } from '../../../lib/retention-utils';
import {
  goBackOrReplace,
  homeHrefForReturnTo,
  pushLearningResumeTarget,
  SUBJECT_HUB_RETURN_TO,
} from '../../../lib/navigation';
import { consumeHubToTopicTransition } from '../../../lib/navigation-transition-provenance';
import { TimeoutLoader } from '../../../components/common';
import { ShimmerSkeleton } from '../../../components/common/ShimmerSkeleton';
import { TopicHeader } from '../../../components/library/TopicHeader';
import { InlineNoteCard } from '../../../components/library/InlineNoteCard';
import { BookmarkCard } from '../../../components/library/BookmarkCard';
import { showNoteContextMenu } from '../../../components/library/NoteContextMenu';
import { TopicSessionRow } from '../../../components/library/TopicSessionRow';
import { StudyCTA } from '../../../components/library/StudyCTA';
import { NoteInput } from '../../../components/library/NoteInput';
import { formatApiError } from '../../../lib/format-api-error';
import { platformAlert } from '../../../lib/platform-alert';
import { useProfile } from '../../../lib/profile';
import { useActiveProfileRole } from '../../../hooks/use-active-profile-role';
import { buildSessionDetailHref } from '../../../lib/session-detail-navigation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noop() {
  // intentional no-op for disabled button
}

function getMostRecentSessionCreatedAt(
  sessions: { createdAt: string }[] | undefined,
): string | null {
  if (!sessions || sessions.length === 0) return null;

  return sessions.reduce<string | null>((latest, session) => {
    if (!latest) return session.createdAt;
    return new Date(session.createdAt).getTime() > new Date(latest).getTime()
      ? session.createdAt
      : latest;
  }, null);
}

function formatSessionDate(
  createdAt: string,
  locale: string | undefined,
): string {
  return formatShortDate(createdAt, locale, {
    month: 'short',
    day: 'numeric',
  });
}

function formatSessionsSummary(
  sessions: { durationSeconds: number | null }[] | undefined,
  t: Translate,
): string | null {
  if (!sessions || sessions.length === 0) return null;

  const totalSeconds = sessions.reduce(
    (total, session) => total + (session.durationSeconds ?? 0),
    0,
  );
  const totalMinutes =
    totalSeconds > 0 && totalSeconds < 60
      ? '<1'
      : String(Math.floor(totalSeconds / 60));
  return `${t('library.sessionCount', { count: sessions.length })}${t('library.topic.minTotalSuffix', { minutes: totalMinutes })}`;
}

function formatBookmarkSourceLine(
  bookmark: Bookmark,
  locale: string | undefined,
  t: Translate,
): string {
  return t('library.topic.bookmarkFromChat', {
    date: formatSessionDate(bookmark.createdAt, locale),
  });
}

interface TopicSectionStripProps {
  testID: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  summary: string;
  meta: string;
  expanded: boolean;
  accentColor: string;
  onPress: () => void;
}

function TopicSectionStrip({
  testID,
  icon,
  label,
  summary,
  meta,
  expanded,
  accentColor,
  onPress,
}: TopicSectionStripProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        expanded
          ? t('library.book.a11ySectionCollapse', { label, summary })
          : t('library.book.a11ySectionExpand', { label, summary })
      }
      style={{
        marginHorizontal: 20,
        marginTop: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: withOpacity(accentColor, 0.18),
        backgroundColor: withOpacity(accentColor, 0.08),
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
          }}
        >
          <Ionicons name={icon} size={18} color={accentColor} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 11,
              lineHeight: 14,
              fontWeight: '700',
              color: withOpacity(accentColor, 0.92),
            }}
          >
            {label}
          </Text>
          <Text
            style={{
              marginTop: 3,
              fontSize: 15,
              lineHeight: 20,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
            numberOfLines={expanded ? 2 : 1}
          >
            {summary}
          </Text>
        </View>

        <View
          style={{
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              lineHeight: 16,
              fontWeight: '700',
              color: colors.textPrimary,
            }}
          >
            {meta}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textSecondary}
          />
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// StudyCTA derivation
// ---------------------------------------------------------------------------

function deriveStudyCTA(
  completionStatus: string | undefined,
  retentionStatus: RetentionStatus,
  t: TFunction,
): { label: string; variant: 'primary' | 'outline' } {
  if (!completionStatus || completionStatus === 'not_started') {
    return { label: t('topic.ctaStartStudying'), variant: 'primary' };
  }
  if (
    completionStatus === 'completed' ||
    completionStatus === 'verified' ||
    completionStatus === 'stable'
  ) {
    if (retentionStatus === 'strong') {
      return { label: t('topic.ctaPracticeAgain'), variant: 'outline' };
    }
  }
  return { label: t('topic.ctaReview'), variant: 'primary' };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TopicDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t, i18n } = useTranslation();
  const relativeDate = useRelativeDate();
  const { activeProfile } = useProfile();
  const activeProfileRole = useActiveProfileRole();
  const canWrite = activeProfileRole !== 'impersonated-child';
  const proxyChildProfileId =
    activeProfileRole === 'impersonated-child' ? activeProfile?.id : undefined;
  const {
    subjectId: paramSubjectId,
    bookId: paramBookId,
    topicId,
    chapter: paramChapter,
    mode: deepLinkMode,
    returnTo: rawReturnTo,
  } = useLocalSearchParams<{
    subjectId: string;
    bookId?: string;
    topicId: string;
    chapter: string;
    mode?: string;
    returnTo?: string | string[];
  }>();
  const returnTo = Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo;

  // [H9] Attempt counter — incremented on Retry to force a new query key and a fresh network call.
  // Must be declared before useResolveTopicSubject so it can be passed as a key segment.
  const [resolveAttempt, setResolveAttempt] = useState(0);

  // [F-009] Resolve subjectId when deep-linked with topicId only
  const needsResolve = !paramSubjectId && !!topicId;
  const { data: resolved, isLoading: resolveLoading } = useResolveTopicSubject(
    needsResolve ? topicId : undefined,
    resolveAttempt,
  );
  const subjectId = paramSubjectId || resolved?.subjectId;
  const hubTransitionKey =
    returnTo === SUBJECT_HUB_RETURN_TO && subjectId && topicId
      ? `${subjectId}:${topicId}`
      : undefined;
  const [hubPredecessorKey, setHubPredecessorKey] = useState<
    string | undefined
  >();
  useEffect(() => {
    if (
      hubTransitionKey &&
      subjectId &&
      topicId &&
      consumeHubToTopicTransition(subjectId, topicId)
    ) {
      setHubPredecessorKey(hubTransitionKey);
      return;
    }
    setHubPredecessorKey((current) =>
      current === hubTransitionKey ? current : undefined,
    );
  }, [hubTransitionKey, subjectId, topicId]);
  const hasHubPredecessor =
    !!hubTransitionKey && hubPredecessorKey === hubTransitionKey;
  const topicBackFallback = useMemo(
    (): Href =>
      returnTo === SUBJECT_HUB_RETURN_TO && subjectId
        ? homeHrefForReturnTo(returnTo, subjectId)
        : subjectId && paramBookId
          ? ({
              pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
              params: { subjectId, bookId: paramBookId },
            } as Href)
          : ('/(app)/library' as Href),
    [paramBookId, returnTo, subjectId],
  );
  const handleTopicBack = useCallback(() => {
    // Only the consumed in-memory Hub → Topic transition proves the immediate
    // parent. Crafted/refreshed URLs retain the deterministic Hub replacement.
    if (hasHubPredecessor) {
      goBackOrReplace(router, topicBackFallback);
      return;
    }
    router.replace(topicBackFallback);
  }, [hasHubPredecessor, router, topicBackFallback]);

  const { data: resumeTarget } = useLearningResumeTarget({
    subjectId: subjectId ?? undefined,
    topicId: topicId ?? undefined,
  });

  const {
    data: topicProgress,
    isLoading: progressLoading,
    isError: progressError,
    refetch: refetchProgress,
  } = useTopicProgress(subjectId ?? '', topicId ?? '');

  const {
    data: retentionCard,
    isLoading: retentionLoading,
    isError: retentionError,
    refetch: refetchRetention,
  } = useTopicRetention(topicId ?? '');

  // F-4: Resume active/paused session instead of creating a new one
  const { data: activeSession } = useActiveSessionForTopic(topicId);

  // Related topics: fetch book data (connections live in bookWithTopicsSchema)
  const { data: bookWithTopics } = useBookWithTopics(subjectId, paramBookId);

  // Library v3: notes and sessions
  const { data: notesData, isLoading: notesLoading } = useTopicNotes(
    subjectId,
    topicId,
  );
  const conceptSignalsQuery = useConceptMasterySignals(
    topicId ? [topicId] : [],
  );
  const { data: topicSessions, isLoading: sessionsLoading } = useTopicSessions(
    subjectId,
    topicId,
  );
  const bookmarksQuery = useBookmarks({
    subjectId,
    topicId,
    limit: 50,
  });
  const { mutate: createNote, isPending: creatingNote } = useCreateNote(
    subjectId,
    undefined,
  );
  const { mutate: updateNote, isPending: updatingNote } = useUpdateNote();
  const { mutate: deleteNote } = useDeleteNoteById();

  // Note input state: null = hidden, 'new' = adding new note, string = editing note id
  const [noteInputMode, setNoteInputMode] = useState<null | 'new' | string>(
    null,
  );
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [bookmarksExpanded, setBookmarksExpanded] = useState(false);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);

  const isResolveSpinning = !!(needsResolve && resolveLoading);

  const isCriticalLoading = progressLoading || retentionLoading;
  const retentionStatus = deriveRetentionStatus(retentionCard);
  const topicName = topicProgress?.title ?? '';

  // Signal 1: Related topics derived from topic_connections
  const relatedTopics = useMemo((): CurriculumTopic[] => {
    if (!topicId || !bookWithTopics) return [];
    const { connections, topics } = bookWithTopics;
    const topicMap = new Map(topics.map((t) => [t.id, t]));
    return connections
      .filter((c) => c.topicAId === topicId || c.topicBId === topicId)
      .map((c) => {
        const otherId = c.topicAId === topicId ? c.topicBId : c.topicAId;
        return topicMap.get(otherId);
      })
      .filter((t): t is CurriculumTopic => t !== undefined && t.id !== topicId);
  }, [topicId, bookWithTopics]);

  // Signal 2: Challenge-round mastery verification.
  // Phase 5: read the server-resolved state, not the raw timestamp. `'fresh'`
  // means verified AND no later weak-spot evidence has accumulated; `'stale'`
  // means a pending_review/active needs_deepening row was created after
  // verification and the badge should NOT be shown. See
  // docs/plans/2026-05-18-challenge-round-targets.md Phase 5.
  const isChallengeVerified =
    topicProgress?.masteryVerificationState === 'fresh';

  // Signal 3: Practiced-often hint (failureCount >= 3 on retention card)
  const showPracticedOftenHint = (retentionCard?.failureCount ?? 0) >= 3;

  const lastReviewedAt =
    retentionCard?.lastReviewedAt ??
    getMostRecentSessionCreatedAt(topicSessions) ??
    null;
  const lastStudiedText = lastReviewedAt
    ? t('topic.lastStudied', { when: relativeDate(lastReviewedAt) })
    : t('topic.neverStudied');
  const sessionsSummary = formatSessionsSummary(topicSessions, t);
  const topicBookmarks = useMemo(
    () =>
      bookmarksQuery.data?.pages.flatMap((page) => page.bookmarks ?? []) ?? [],
    [bookmarksQuery.data],
  );
  const noteCount = notesData?.notes.length ?? 0;
  const bookmarkCount = topicBookmarks.length;
  const sessionCount = topicSessions?.length ?? 0;
  const noteSummary = notesLoading
    ? t('library.book.loadingNotes')
    : noteCount === 0
      ? t('topic.addFirstNoteSummary')
      : t('library.topic.notesSavedCount', { count: noteCount });
  const bookmarkSummary = bookmarksQuery.isLoading
    ? t('topic.loadingBookmarks')
    : bookmarkCount === 0
      ? t('library.topic.bookmarks.emptyShort')
      : bookmarkCount === 1
        ? (topicBookmarks[0]?.content ??
          t('library.topic.bookmarks.savedExplanations', { count: 1 }))
        : t('library.topic.bookmarks.savedExplanations', {
            count: bookmarkCount,
          });
  const sessionSummaryText = sessionsLoading
    ? t('topic.loadingSessions')
    : (sessionsSummary ?? t('topic.noSessionsSummary'));

  const studyCTA = useMemo(() => {
    if (deepLinkMode === 'review') {
      return { label: t('topic.ctaReview'), variant: 'primary' as const };
    }
    if (deepLinkMode === 'challenge') {
      return {
        label: t('topic.ctaStartChallenge'),
        variant: 'primary' as const,
      };
    }
    return deriveStudyCTA(topicProgress?.completionStatus, retentionStatus, t);
  }, [deepLinkMode, topicProgress?.completionStatus, retentionStatus, t]);

  useEffect(() => {
    if (noteInputMode !== null) {
      setNotesExpanded(true);
    }
  }, [noteInputMode]);

  const handleStudyPress = useMemo(() => {
    // Deep-link mode overrides: route directly to the appropriate mode entry point.
    if (deepLinkMode === 'review' && subjectId && topicId) {
      return () =>
        router.push({
          pathname: '/(app)/session',
          params: { mode: 'review', subjectId, topicId, topicName },
        } as Href);
    }
    // [WI-2112] Challenge Round is not a standalone screen — it is an
    // in-session offer/accept flow (useChallengeRound) gated server-side by
    // evaluateChallengeReadiness(), which only ever offers a Challenge Round
    // when sessionType === 'learning' and the CURRENT session has
    // accumulated enough exchanges/streak. Resume an already-active session
    // for this topic when one exists (same F-4 resume behavior as the
    // default path below) so in-progress eligibility state isn't discarded;
    // otherwise start a fresh learning session anchored to the topic.
    // Either way this routes into the one path where the existing Challenge
    // Round machinery can trigger, instead of the unrelated recall-test
    // recall quiz.
    if (deepLinkMode === 'challenge' && topicId) {
      return () => {
        if (resumeTarget) {
          pushLearningResumeTarget(router, resumeTarget);
          return;
        }
        router.push({
          pathname: '/(app)/session',
          params: {
            mode: 'learning',
            subjectId,
            topicId,
            topicName,
            ...(activeSession?.sessionId && {
              sessionId: activeSession.sessionId,
            }),
          },
        } as Href);
      };
    }

    if (!topicProgress) return noop;

    const completionStatus = topicProgress.completionStatus;
    if (completionStatus === 'not_started') {
      return () =>
        router.push({
          pathname: '/(app)/session',
          params: { mode: 'learning', subjectId, topicId, topicName },
        } as Href);
    }

    const isOverdue =
      !!retentionCard?.nextReviewAt &&
      new Date(retentionCard.nextReviewAt).getTime() < Date.now();

    if (
      isOverdue &&
      ['completed', 'verified', 'stable'].includes(completionStatus)
    ) {
      return () =>
        router.push({
          pathname: '/(app)/session',
          params: { mode: 'review', subjectId, topicId, topicName },
        } as Href);
    }

    return () => {
      if (resumeTarget) {
        pushLearningResumeTarget(router, resumeTarget);
        return;
      }
      router.push({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId,
          topicId,
          topicName,
          ...(activeSession?.sessionId && {
            sessionId: activeSession.sessionId,
          }),
        },
      } as Href);
    };
  }, [
    activeSession?.sessionId,
    deepLinkMode,
    retentionCard?.nextReviewAt,
    resumeTarget,
    router,
    subjectId,
    topicId,
    topicName,
    topicProgress,
  ]);

  // Note handlers
  const handleNoteCreate = (content: string) => {
    if (!canWrite || !topicId) return;
    createNote(
      { topicId, content },
      { onSuccess: () => setNoteInputMode(null) },
    );
  };

  const handleNoteUpdate = (content: string) => {
    if (
      !canWrite ||
      typeof noteInputMode !== 'string' ||
      noteInputMode === 'new'
    ) {
      return;
    }
    updateNote(
      { noteId: noteInputMode, content },
      { onSuccess: () => setNoteInputMode(null) },
    );
  };

  const handleNoteLongPress = (noteId: string) => {
    if (!canWrite) return;
    const note = notesData?.notes.find((n) => n.id === noteId);
    if (!note) return;
    showNoteContextMenu({
      noteId,
      content: note.content,
      onEdit: (id, currentContent) => {
        setEditingNoteContent(currentContent);
        setNoteInputMode(id);
      },
      onDelete: (id) =>
        deleteNote(id, {
          onError: (err) => {
            platformAlert(
              t('library.book.noteDeleteErrorTitle'),
              formatApiError(err),
            );
          },
        }),
    });
  };

  const handleSessionPress = (sessionId: string) => {
    router.push(
      buildSessionDetailHref({
        sessionId,
        subjectId,
        topicId,
        bookId: paramBookId,
        childProfileId: proxyChildProfileId,
      }),
    );
  };

  // ---------------------------------------------------------------------------
  // Guard: deep-link resolve timeout
  // ---------------------------------------------------------------------------

  if (needsResolve && resolveLoading) {
    return (
      <View className="flex-1 bg-background">
        <TimeoutLoader
          key={resolveAttempt}
          isLoading={isResolveSpinning}
          title={t('topic.resolveTimeoutTitle')}
          message={t('topic.resolveTimeoutMessage')}
          loadingLabel={t('common.loading')}
          primaryAction={{
            label: t('common.retry'),
            onPress: () => setResolveAttempt((n) => n + 1),
            testID: 'topic-resolve-timeout-retry',
          }}
          secondaryAction={{
            label: t('topic.recallTest.goToLibrary'),
            onPress: handleTopicBack,
            testID: 'topic-resolve-timeout-library',
          }}
          testID="topic-resolve-loading"
          fallbackTestID="topic-resolve-timeout"
        />
      </View>
    );
  }

  if (!subjectId || !topicId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          {t('topic.notFoundTitle')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('topic.notFoundMessage')}
        </Text>
        <Pressable
          onPress={handleTopicBack}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBackAction')}
          testID="topic-detail-missing-params-back"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('common.goBackAction')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (
    ((progressError && !topicProgress) || (retentionError && !retentionCard)) &&
    !isCriticalLoading
  ) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          {t('topic.loadErrorTitle')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('topic.loadErrorMessage')}
        </Text>
        <Pressable
          onPress={() => {
            void refetchProgress();
            void refetchRetention();
          }}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mb-3"
          accessibilityRole="button"
          accessibilityLabel={t('topic.a11yRetryTopic')}
          testID="topic-detail-retry"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('common.retry')}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleTopicBack}
          className="bg-surface rounded-button px-6 py-3 min-h-[48px] items-center justify-center mb-3"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBackAction')}
          testID="topic-detail-go-back"
        >
          <Text className="text-body font-semibold text-text-primary">
            {t('common.goBackAction')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(app)/home' as Href)}
          className="py-2 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goHome')}
          testID="topic-detail-go-home"
        >
          <Text className="text-body-sm text-primary">
            {t('common.goHome')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Back nav */}
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={handleTopicBack}
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          testID="topic-detail-back"
          accessibilityLabel={t('common.goBackAction')}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={26} color={colors.primary} />
        </Pressable>
        <Text
          className="text-body-sm text-text-secondary flex-1"
          numberOfLines={1}
        >
          {resolved?.subjectName ?? ''}
        </Text>
      </View>

      {isCriticalLoading ? (
        <>
          <View
            className="flex-1 items-center justify-center"
            testID="topic-detail-loading"
          >
            <ActivityIndicator
              size="large"
              color={colors.muted}
              accessibilityLabel={t('common.loading')}
            />
            <Text className="text-text-secondary mt-2">
              {t('topic.loadingTopic')}
            </Text>
          </View>
          {/* CTA visible but disabled while data loads */}
          <StudyCTA
            label={t('common.loading')}
            variant="primary"
            onPress={noop}
            disabled
            testID="study-cta"
          />
        </>
      ) : !topicProgress ? (
        <View
          className="flex-1 items-center justify-center px-8"
          testID="topic-detail-empty"
        >
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            {t('topic.notFoundTitle')}
          </Text>
          <Text className="text-body text-text-secondary text-center">
            {t('topic.removedHint')}
          </Text>
          <Pressable
            onPress={handleTopicBack}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mt-6"
            testID="topic-detail-empty-back"
            accessibilityRole="button"
            accessibilityLabel={t('topic.a11yBackPrevious')}
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.goBackAction')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: insets.bottom + 76 }}
            testID="topic-detail-scroll"
          >
            {/* Topic header: name, chapter, retention pill, last studied */}
            <TopicHeader
              levelLabel={t('library.shelf.levelTopic')}
              name={topicProgress.title}
              chapter={paramChapter ?? null}
              description={topicProgress.description}
              retentionStatus={topicProgress.retentionStatus ?? null}
              daysSinceLastReview={topicProgress.daysSinceLastReview}
              lastStudiedText={lastStudiedText}
              strongReviews={topicProgress.strongReviews}
              strongReviewsTarget={topicProgress.strongReviewsTarget}
              masteredAt={topicProgress.masteredAt}
            />

            {/* Signal 2: Challenge-verified badge */}
            {isChallengeVerified ? (
              <View
                testID="topic-challenge-verified-badge"
                style={{
                  marginHorizontal: 20,
                  marginTop: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  gap: 6,
                  backgroundColor: withOpacity(colors.success, 0.12),
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                }}
                accessibilityLabel={t('library.topic.challengeVerifiedBadge')}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={14}
                  color={colors.success}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.success,
                    lineHeight: 16,
                  }}
                >
                  {t('library.topic.challengeVerifiedBadge')}
                </Text>
              </View>
            ) : null}

            {/* Signal 3: Practiced-often hint */}
            {showPracticedOftenHint ? (
              <View
                testID="topic-practiced-often-hint"
                style={{
                  marginHorizontal: 20,
                  marginTop: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: withOpacity(colors.primary, 0.08),
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <Ionicons
                  name="sparkles-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text
                  style={{
                    flex: 1,
                    fontSize: 13,
                    lineHeight: 18,
                    color: colors.textPrimary,
                    fontWeight: '500',
                  }}
                >
                  {t('library.topic.practicedOftenHint')}
                </Text>
              </View>
            ) : null}

            <TopicSectionStrip
              testID="topic-notes-strip"
              icon="create-outline"
              label={t('topic.notesSection')}
              summary={noteSummary}
              meta={notesLoading ? '...' : String(noteCount)}
              expanded={notesExpanded}
              accentColor={colors.accent}
              onPress={() => setNotesExpanded((current) => !current)}
            />

            {notesExpanded ? (
              <View className="mt-3 mb-1">
                {notesLoading ? (
                  <ShimmerSkeleton testID="notes-loading">
                    <View className="px-5">
                      {[0, 1].map((i) => (
                        <View
                          key={i}
                          style={{
                            height: 52,
                            borderRadius: 8,
                            marginBottom: 8,
                            backgroundColor: colors.border,
                          }}
                        />
                      ))}
                    </View>
                  </ShimmerSkeleton>
                ) : notesData && notesData.notes.length > 0 ? (
                  notesData.notes.map((note) => {
                    const sourceSessionId = note.sessionId;
                    return (
                      <InlineNoteCard
                        key={note.id}
                        noteId={note.id}
                        topicTitle={topicProgress.title}
                        content={note.content}
                        sourceLine={formatSourceLine(note, i18n?.language)}
                        updatedAt={note.updatedAt}
                        conceptSignal={
                          conceptSignalsQuery.data?.signals?.[note.topicId]
                        }
                        onLongPress={canWrite ? handleNoteLongPress : undefined}
                        onSourcePress={
                          sourceSessionId
                            ? () => handleSessionPress(sourceSessionId)
                            : undefined
                        }
                      />
                    );
                  })
                ) : (
                  <Text
                    className="text-body-sm text-text-secondary px-5 py-2"
                    testID="topic-notes-empty"
                  >
                    {t('topic.noNotesYet')}
                  </Text>
                )}

                {canWrite && noteInputMode !== null ? (
                  <View className="mx-5 mt-2" testID="note-input-container">
                    <NoteInput
                      onSave={
                        noteInputMode === 'new'
                          ? handleNoteCreate
                          : handleNoteUpdate
                      }
                      onCancel={() => setNoteInputMode(null)}
                      initialValue={
                        noteInputMode !== 'new' ? editingNoteContent : ''
                      }
                      saving={creatingNote || updatingNote}
                    />
                  </View>
                ) : canWrite ? (
                  <Pressable
                    onPress={() => setNoteInputMode('new')}
                    className="mx-5 mt-1 py-3 flex-row items-center"
                    testID="add-note-button"
                    accessibilityRole="button"
                    accessibilityLabel={
                      noteCount > 0
                        ? t('library.topic.a11yAddNote')
                        : t('library.topic.a11yAddFirstNote')
                    }
                  >
                    <Text className="text-primary text-body-sm font-medium">
                      {noteCount > 0
                        ? t('topic.addNote')
                        : t('topic.addFirstNote')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <TopicSectionStrip
              testID="topic-bookmarks-strip"
              icon="bookmark-outline"
              label={t('library.topic.bookmarks.savedFromChat')}
              summary={bookmarkSummary}
              meta={bookmarksQuery.isLoading ? '...' : String(bookmarkCount)}
              expanded={bookmarksExpanded}
              accentColor={colors.primary}
              onPress={() => setBookmarksExpanded((current) => !current)}
            />

            {bookmarksExpanded ? (
              <View className="mt-3 mb-1">
                {bookmarksQuery.isLoading ? (
                  <ShimmerSkeleton testID="bookmarks-loading">
                    <View className="px-5">
                      {[0, 1].map((i) => (
                        <View
                          key={i}
                          style={{
                            height: 64,
                            borderRadius: 8,
                            marginBottom: 8,
                            backgroundColor: colors.border,
                          }}
                        />
                      ))}
                    </View>
                  </ShimmerSkeleton>
                ) : topicBookmarks.length > 0 ? (
                  topicBookmarks.map((bookmark) => (
                    <BookmarkCard
                      key={bookmark.id}
                      bookmarkId={bookmark.id}
                      content={bookmark.content}
                      sourceLine={formatBookmarkSourceLine(
                        bookmark,
                        i18n?.language,
                        t,
                      )}
                      onPress={() => handleSessionPress(bookmark.sessionId)}
                    />
                  ))
                ) : (
                  <Text
                    className="text-body-sm text-text-secondary px-5 py-2"
                    testID="topic-bookmarks-empty"
                  >
                    {t('library.topic.bookmarks.emptyLong')}
                  </Text>
                )}
              </View>
            ) : null}

            <TopicSectionStrip
              testID="topic-sessions-strip"
              icon="time-outline"
              label={t('topic.sessionsSection')}
              summary={sessionSummaryText}
              meta={sessionsLoading ? '...' : String(sessionCount)}
              expanded={sessionsExpanded}
              accentColor={colors.textSecondary}
              onPress={() => setSessionsExpanded((current) => !current)}
            />

            {sessionsExpanded ? (
              <View className="mt-3 mb-2">
                {sessionsLoading ? (
                  <ShimmerSkeleton testID="sessions-loading">
                    <View className="px-5">
                      {[0, 1, 2].map((i) => (
                        <View
                          key={i}
                          style={{
                            height: 44,
                            borderRadius: 8,
                            marginBottom: 8,
                            backgroundColor: colors.border,
                          }}
                        />
                      ))}
                    </View>
                  </ShimmerSkeleton>
                ) : topicSessions && topicSessions.length > 0 ? (
                  <View className="px-5" testID="topic-sessions-list">
                    {topicSessions.map((session) => (
                      <TopicSessionRow
                        key={session.id}
                        sessionId={session.id}
                        date={formatSessionDate(
                          session.createdAt,
                          i18n?.language,
                        )}
                        durationSeconds={session.durationSeconds}
                        sessionType={session.sessionType}
                        onPress={handleSessionPress}
                      />
                    ))}
                  </View>
                ) : (
                  <Text
                    className="text-body-sm text-text-secondary px-5 py-2"
                    testID="topic-sessions-empty"
                  >
                    {t('topic.noSessionsYet')}
                  </Text>
                )}
              </View>
            ) : null}

            {/* Signal 1: Related topics rail — hidden when empty */}
            {relatedTopics.length > 0 ? (
              <View
                testID="topic-related-rail"
                style={{ marginTop: 20, marginBottom: 4 }}
              >
                <Text
                  style={{
                    marginHorizontal: 20,
                    fontSize: 11,
                    fontWeight: '700',
                    lineHeight: 14,
                    color: withOpacity(colors.textSecondary, 0.8),
                    letterSpacing: 0.5,
                    marginBottom: 10,
                  }}
                >
                  {t('library.topic.relatedRail.label')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingHorizontal: 20,
                    gap: 10,
                  }}
                >
                  {relatedTopics.map((related) => (
                    <Pressable
                      key={related.id}
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/topic/[topicId]',
                          params: {
                            topicId: related.id,
                            subjectId: subjectId ?? '',
                            bookId: paramBookId ?? '',
                            chapter: related.chapter ?? '',
                          },
                        } as Href)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={related.title}
                      style={{
                        backgroundColor: withOpacity(colors.primary, 0.08),
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: withOpacity(colors.primary, 0.16),
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        maxWidth: 220,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '600',
                          color: colors.primary,
                          lineHeight: 18,
                        }}
                        numberOfLines={2}
                      >
                        {related.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </ScrollView>

          {/* Study CTA — sticky bottom */}
          <StudyCTA
            label={studyCTA.label}
            variant={studyCTA.variant}
            onPress={handleStudyPress}
            testID="study-cta"
          />
        </>
      )}
    </View>
  );
}
