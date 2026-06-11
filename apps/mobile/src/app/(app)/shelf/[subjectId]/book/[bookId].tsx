import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  MIN_EXCHANGES_FOR_TOPIC_COMPLETION,
  type CurriculumTopic,
  type RetentionStatus,
} from '@eduagent/schemas';
import * as Sentry from '@sentry/react-native';
import {
  CelebrationAnimation,
  MagicPenAnimation,
} from '../../../../../components/common';
import { ShimmerSkeleton } from '../../../../../components/common/ShimmerSkeleton';
import { SessionRow } from '../../../../../components/library/SessionRow';
import { ChapterDivider } from '../../../../../components/library/ChapterDivider';
import { TopicStatusRow } from '../../../../../components/library/TopicStatusRow';
import { InlineNoteCard } from '../../../../../components/library/InlineNoteCard';
import { NoteInput } from '../../../../../components/library/NoteInput';
import { RetentionPill } from '../../../../../components/library/RetentionPill';
import { TopicPickerSheet } from '../../../../../components/library/TopicPickerSheet';
import { showNoteContextMenu } from '../../../../../components/library/NoteContextMenu';
import {
  useBookWithTopics,
  useBooks,
  useDeleteBook,
  useGenerateBookTopics,
} from '../../../../../hooks/use-books';
import {
  useBookSessions,
  type BookSession,
} from '../../../../../hooks/use-book-sessions';
import { useMoveTopic } from '../../../../../hooks/use-move-topic';
import {
  useBookNotes,
  useConceptMasterySignals,
  useCreateNote,
  useUpdateNote,
  useDeleteNoteById,
} from '../../../../../hooks/use-notes';
import { useRetentionTopics } from '../../../../../hooks/use-retention';
import { useStickyLoading } from '../../../../../hooks/use-sticky-loading';
import { useCurriculum } from '../../../../../hooks/use-curriculum';
import { useLearningResumeTarget } from '../../../../../hooks/use-progress';
import { useStartFirstCurriculumSession } from '../../../../../hooks/use-sessions';

import { formatApiError } from '../../../../../lib/format-api-error';
import { formatRelativeDate } from '../../../../../lib/format-relative-date';
import { formatSourceLine } from '../../../../../lib/format-note-source';
import { withOpacity } from '../../../../../lib/color-opacity';
import { displayBookDescription } from '../../../../../lib/book-display';
import { resolveLoadingMotionPreset } from '../../../../../lib/motion-presets';
import { platformAlert } from '../../../../../lib/platform-alert';
import { useThemeColors } from '../../../../../lib/theme';
import { computeUpNextTopic } from '../../../../../lib/up-next-topic';
import {
  goBackOrReplace,
  pushLearningResumeTarget,
} from '../../../../../lib/navigation';
import { useProfile } from '../../../../../lib/profile';
import { useActiveProfileRole } from '../../../../../hooks/use-active-profile-role';
import { buildSessionDetailHref } from '../../../../../lib/session-detail-navigation';
import {
  computeBookRetentionStatus,
  groupSessionsByChapter,
  groupTopicsByChapter,
} from './_view-models/book-derived-state';
import { getBookStickyCtaLabel } from './_view-models/book-sticky-cta';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BookSectionStripProps {
  testID: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  summary: string;
  meta: string;
  expanded: boolean;
  accentColor: string;
  onPress: () => void;
}

function BookSectionStrip({
  testID,
  icon,
  label,
  summary,
  meta,
  expanded,
  accentColor,
  onPress,
}: BookSectionStripProps): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${summary}. ${
        expanded ? 'Collapse section' : 'Expand section'
      }.`}
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
// Generation state machine
// ---------------------------------------------------------------------------

type GenerationPhase = 'idle' | 'slow' | 'timed_out';

const SLOW_THRESHOLD_MS = 30_000;
const TIMEOUT_THRESHOLD_MS = 60_000;

interface StartedTopicsDeleteDetails {
  reason: 'started_topics';
  topicCount: number;
  startedTopicCount: number;
}

function getStartedTopicsDeleteDetails(
  error: unknown,
): StartedTopicsDeleteDetails | null {
  const details = (error as { details?: unknown } | null)?.details;
  if (!details || typeof details !== 'object') {
    return null;
  }
  const record = details as Record<string, unknown>;
  if (record.reason !== 'started_topics') {
    return null;
  }
  const topicCount = record.topicCount;
  const startedTopicCount = record.startedTopicCount;
  if (
    typeof topicCount !== 'number' ||
    typeof startedTopicCount !== 'number' ||
    !Number.isInteger(topicCount) ||
    !Number.isInteger(startedTopicCount) ||
    topicCount < 0 ||
    startedTopicCount < 0
  ) {
    return null;
  }
  return {
    reason: 'started_topics',
    topicCount,
    startedTopicCount,
  };
}

function formatStartedTopicCount(count: number): string {
  return count === 1 ? '1 started topic' : `${count} started topics`;
}
// ---------------------------------------------------------------------------
// Book Screen
// ---------------------------------------------------------------------------

export default function BookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const screenLoadingMotion = resolveLoadingMotionPreset({
    surface: 'screen',
    contentDensity: 'sparse',
  });
  const { activeProfile } = useProfile();
  const activeProfileRole = useActiveProfileRole();
  const proxyChildProfileId =
    activeProfileRole === 'impersonated-child' ? activeProfile?.id : undefined;
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{
    subjectId: string;
    bookId: string;
    readOnly?: string;
    autoStart?: string;
  }>();
  const subjectId = params.subjectId;
  const bookId = params.bookId;
  const isReadOnly = params.readOnly === 'true';
  const resumeTargetQuery = useLearningResumeTarget({ subjectId, bookId });
  const autoStart = params.autoStart;

  // --- Data queries (called unconditionally for rules-of-hooks) ---
  const bookQuery = useBookWithTopics(subjectId, bookId);
  const sessionsQuery = useBookSessions(subjectId, bookId);
  const notesQuery = useBookNotes(subjectId, bookId);
  const generateMutation = useGenerateBookTopics(subjectId, bookId);
  const deleteBookMutation = useDeleteBook(subjectId, bookId);
  const startFirstCurriculumSession = useStartFirstCurriculumSession(subjectId);
  const curriculumQuery = useCurriculum(subjectId);
  const hasCurriculum = (curriculumQuery.data?.topics?.length ?? 0) > 0;
  const retentionTopicsQuery = useRetentionTopics(subjectId ?? '');
  const allBooksQuery = useBooks(subjectId);
  const moveTopic = useMoveTopic();
  const createNote = useCreateNote(subjectId, bookId);
  const updateNote = useUpdateNote();
  const deleteNoteById = useDeleteNoteById();

  // One screen up = the per-subject shelf grid. router.back() falls through
  // to the Tabs navigator's `firstRoute` (Home) when the inner stack is empty
  // (cross-tab pushes to this leaf route synthesize a 1-deep stack), so we
  // navigate explicitly instead.
  //
  // [BUG-636 / M-4] On a malformed deep link (subjectId missing) the previous
  // implementation early-returned, leaving the user stuck on the missing-param
  // error screen with a "Go back" button that silently did nothing. Fall back
  // to the library tab when subjectId is unavailable so the error state always
  // has a working exit.
  const handleBack = useCallback(() => {
    if (subjectId) {
      router.replace({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId },
      } as Href);
      return;
    }
    goBackOrReplace(router, '/(app)/library' as Href);
  }, [router, subjectId]);

  const handleSubjectBookmarksPress = useCallback(() => {
    if (!subjectId) return;
    // progress/_layout.tsx exports `unstable_settings = { initialRouteName: 'index' }`,
    // which seeds progress/index in the stack when entering via a cross-tab push.
    // A single push to the leaf is therefore sufficient — no need to push the
    // parent first. The extra progress/index push was causing a double-back-press
    // requirement to return to the originating shelf. (CR-2026-05-21-120)
    router.push({
      pathname: '/(app)/progress/saved',
      params: { subjectId },
    } as Href);
  }, [router, subjectId]);

  const handleBookDeleted = useCallback(() => {
    if (subjectId) {
      router.replace({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId },
      } as Href);
      return;
    }
    goBackOrReplace(router, '/(app)/library' as Href);
  }, [router, subjectId]);

  const deleteBookWithConfirmation = useCallback(
    async (confirmStartedTopics: boolean) => {
      if (!subjectId || !bookId || isReadOnly) return;
      try {
        await deleteBookMutation.mutateAsync({ confirmStartedTopics });
        handleBookDeleted();
      } catch (error) {
        const startedTopicDetails = getStartedTopicsDeleteDetails(error);
        if (!confirmStartedTopics && startedTopicDetails) {
          const startedLabel = formatStartedTopicCount(
            startedTopicDetails.startedTopicCount,
          );
          platformAlert(
            'Delete started topics?',
            `This book has ${startedLabel}. Deleting it will also delete those topics, their learning history, progress, and notes.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete everything',
                style: 'destructive',
                onPress: () => {
                  void deleteBookWithConfirmation(true);
                },
              },
            ],
            { cancelable: true },
          );
          return;
        }

        platformAlert('Could not delete book', formatApiError(error));
      }
    },
    [bookId, deleteBookMutation, handleBookDeleted, isReadOnly, subjectId],
  );

  const handleDeleteBookPress = useCallback(() => {
    if (!subjectId || !bookId || isReadOnly || deleteBookMutation.isPending) {
      return;
    }
    platformAlert(
      'Delete book?',
      'You can re-add it later. If any topics have been started, you will be asked before those topics and their learning history are deleted too.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteBookWithConfirmation(false);
          },
        },
      ],
      { cancelable: true },
    );
  }, [
    bookId,
    deleteBookMutation.isPending,
    deleteBookWithConfirmation,
    isReadOnly,
    subjectId,
  ]);

  // --- Generation auto-trigger ---
  const [genPhase, setGenPhase] = useState<GenerationPhase>('idle');
  const alreadyPending = useRef(false);

  // --- Note add flow state ---
  const [showTopicPicker, setShowTopicPicker] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showBookCompletionBurst, setShowBookCompletionBurst] = useState(false);
  const [isExpandingThinTopicList, setIsExpandingThinTopicList] =
    useState(false);
  const thinTopicExpansionAttemptedBookIds = useRef<Set<string>>(new Set());
  const wasBookComplete = useRef<boolean | null>(null);
  const [editingNote, setEditingNote] = useState<{
    noteId: string;
    content: string;
  } | null>(null);

  const book = bookQuery.data?.book ?? null;
  // Suppress a description that merely echoes the title (legacy filing-fallback
  // books stored "Learn about <title>"). See lib/book-display.
  const shownBookDescription = displayBookDescription(
    book?.title ?? '',
    book?.description,
  );
  const hasBookData = bookQuery.data != null;
  const topics = useMemo(
    () => bookQuery.data?.topics ?? [],
    [bookQuery.data?.topics],
  );
  const activeTopics = useMemo(
    () => topics.filter((topic) => !topic.skipped && topic.title.trim()),
    [topics],
  );

  const needsGeneration = book !== null && !book.topicsGenerated;

  // Keep the MagicPenAnimation visible long enough to register, even when
  // generation completes faster than perception.
  const showGenerating = useStickyLoading(
    needsGeneration ||
      (generateMutation.isPending && !isExpandingThinTopicList),
    800,
  );

  useEffect(() => {
    if (!needsGeneration) return;
    if (alreadyPending.current) return;
    if (generateMutation.isPending) return;

    alreadyPending.current = true;
    setGenPhase('idle');

    const slowTimer = setTimeout(() => setGenPhase('slow'), SLOW_THRESHOLD_MS);
    const timeoutTimer = setTimeout(
      () => setGenPhase('timed_out'),
      TIMEOUT_THRESHOLD_MS,
    );

    generateMutation.mutate(undefined, {
      onSuccess: () => {
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);
        setGenPhase('idle');
        alreadyPending.current = false;
        void bookQuery.refetch();
      },
      onError: (error) => {
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);
        setGenPhase('timed_out');
        alreadyPending.current = false;
        // BUG-81: Show user-visible error feedback on initial generation failure
        platformAlert("Couldn't build this book", formatApiError(error), [
          { text: t('common.ok') },
        ]);
      },
    });

    return () => {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    };
    // Only trigger on needsGeneration change; mutation object is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsGeneration]);

  const retryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // RT-1: ref lock prevents double-fire from rapid taps on the retry button
  const retryInFlight = useRef(false);

  const handleRetryGeneration = () => {
    if (retryInFlight.current) return;
    retryInFlight.current = true;

    // Clear any leftover retry timers before starting new ones
    for (const t of retryTimersRef.current) clearTimeout(t);
    retryTimersRef.current = [];

    alreadyPending.current = false;
    setGenPhase('idle');

    const slowTimer = setTimeout(() => setGenPhase('slow'), SLOW_THRESHOLD_MS);
    const timeoutTimer = setTimeout(
      () => setGenPhase('timed_out'),
      TIMEOUT_THRESHOLD_MS,
    );
    retryTimersRef.current = [slowTimer, timeoutTimer];

    generateMutation.mutate(undefined, {
      onSuccess: () => {
        setGenPhase('idle');
        alreadyPending.current = false;
        retryInFlight.current = false;
        for (const t of retryTimersRef.current) clearTimeout(t);
        retryTimersRef.current = [];
        void bookQuery.refetch();
      },
      onError: (error) => {
        setGenPhase('timed_out');
        alreadyPending.current = false;
        retryInFlight.current = false;
        for (const t of retryTimersRef.current) clearTimeout(t);
        retryTimersRef.current = [];
        platformAlert('Generation failed', formatApiError(error));
      },
    });
  };

  const handleExpandThinTopicList = useCallback(() => {
    if (isExpandingThinTopicList || generateMutation.isPending) return;

    setIsExpandingThinTopicList(true);
    generateMutation.mutate(
      {
        expandExisting: true,
        priorKnowledge:
          activeTopics.length > 0
            ? `The book already has these starter topics: ${activeTopics
                .map((topic) => topic.title)
                .join(', ')}`
            : undefined,
      },
      {
        onSuccess: () => {
          setIsExpandingThinTopicList(false);
          void bookQuery.refetch();
        },
        onError: (error) => {
          setIsExpandingThinTopicList(false);
          platformAlert('Could not set up topic list', formatApiError(error));
        },
      },
    );
  }, [activeTopics, bookQuery, generateMutation, isExpandingThinTopicList]);

  // Cleanup retry timers on unmount
  useEffect(() => {
    return () => {
      for (const t of retryTimersRef.current) clearTimeout(t);
    };
  }, []);

  // --- Notes ---
  const notes = useMemo(
    () => notesQuery.data?.notes ?? [],
    [notesQuery.data?.notes],
  );
  const noteTopicIdList = useMemo(
    () => [...new Set(notes.map((n) => n.topicId))].sort(),
    [notes],
  );
  const conceptSignalsQuery = useConceptMasterySignals(noteTopicIdList);
  const noteTopicIds = useMemo(
    () => new Set(noteTopicIdList),
    [noteTopicIdList],
  );
  const topicTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of topics) map.set(t.id, t.title);
    return map;
  }, [topics]);
  const sortedNotes = useMemo(
    () =>
      [...notes].sort((a, b) =>
        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      ),
    [notes],
  );
  const noteCount = notes.length;
  const noteSummary = notesQuery.isLoading
    ? 'Loading notes...'
    : noteCount === 0
      ? 'Add your first note for this book'
      : noteCount === 1
        ? '1 note saved for this book'
        : `${noteCount} notes saved for this book`;

  // --- Sessions data ---
  const sessions = useMemo(
    () => sessionsQuery.data ?? [],
    [sessionsQuery.data],
  );
  const sessionsError = sessionsQuery.isError;
  const retentionError = retentionTopicsQuery.isError;
  const refetchSessions = sessionsQuery.refetch;
  const refetchRetention = retentionTopicsQuery.refetch;
  const sessionCount = sessions.length;

  // Canonical completed topics come from the book API. Local fallbacks keep
  // the screen sensible across cached responses and verified retention cards.
  const topicStudiedIds = useMemo((): Set<string> => {
    const retentionTopics = retentionTopicsQuery.data?.topics ?? [];
    const bookTopicIds = new Set(activeTopics.map((topic) => topic.id));
    const ids = new Set(bookQuery.data?.completedTopicIds ?? []);
    for (const session of sessions) {
      if (
        session.topicId &&
        session.exchangeCount >= MIN_EXCHANGES_FOR_TOPIC_COMPLETION
      ) {
        ids.add(session.topicId);
      }
    }
    for (const rt of retentionTopics) {
      if (rt.xpStatus === 'verified' && bookTopicIds.has(rt.topicId)) {
        ids.add(rt.topicId);
      }
    }
    return ids;
  }, [
    activeTopics,
    bookQuery.data?.completedTopicIds,
    sessions,
    retentionTopicsQuery.data,
  ]);

  const masteredTopicIds = useMemo((): Set<string> => {
    const retentionTopics = retentionTopicsQuery.data?.topics ?? [];
    const bookTopicIds = new Set(activeTopics.map((topic) => topic.id));
    const ids = new Set<string>();
    for (const rt of retentionTopics) {
      if (rt.masteredAt != null && bookTopicIds.has(rt.topicId)) {
        ids.add(rt.topicId);
      }
    }
    return ids;
  }, [activeTopics, retentionTopicsQuery.data]);

  // --- Book-level retention status (derived from completed topics) ---
  const bookRetentionStatus = useMemo((): RetentionStatus | null => {
    const retentionTopics = retentionTopicsQuery.data?.topics ?? [];
    const studiedTopics = retentionTopics.filter((rt) =>
      topicStudiedIds.has(rt.topicId),
    );
    if (studiedTopics.length === 0) return null;
    return computeBookRetentionStatus(
      studiedTopics.map((rt) => rt.nextReviewAt),
    );
  }, [retentionTopicsQuery.data, topicStudiedIds]);

  const bookDaysSinceLastReview = useMemo((): number | null => {
    const retentionTopics = retentionTopicsQuery.data?.topics ?? [];
    const values = retentionTopics
      .filter((rt) => topicStudiedIds.has(rt.topicId))
      .map((rt) => rt.daysSinceLastReview)
      .filter((value): value is number => typeof value === 'number');
    if (values.length === 0) return null;
    return Math.max(...values);
  }, [retentionTopicsQuery.data, topicStudiedIds]);

  const activeTopicIds = useMemo(
    () => new Set(activeTopics.map((topic) => topic.id)),
    [activeTopics],
  );

  // --- New status-first state derivation ---
  const inProgressTopicIds = useMemo((): Set<string> => {
    const ids = new Set<string>();
    for (const session of sessions) {
      if (session.topicId && !topicStudiedIds.has(session.topicId)) {
        ids.add(session.topicId);
      }
    }
    return ids;
  }, [sessions, topicStudiedIds]);

  const learningTopicIds = useMemo((): Set<string> => {
    const retentionTopics = retentionTopicsQuery.data?.topics ?? [];
    const ids = new Set<string>(topicStudiedIds);
    for (const session of sessions) {
      if (session.topicId) ids.add(session.topicId);
    }
    for (const rt of retentionTopics) {
      if (activeTopicIds.has(rt.topicId)) ids.add(rt.topicId);
    }
    for (const id of masteredTopicIds) {
      ids.delete(id);
    }
    return ids;
  }, [
    activeTopicIds,
    masteredTopicIds,
    retentionTopicsQuery.data,
    sessions,
    topicStudiedIds,
  ]);

  const continueNowTopicId = useMemo((): string | null => {
    const candidates = [...sessions]
      .filter(
        (session) =>
          !!session.topicId && inProgressTopicIds.has(session.topicId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return candidates[0]?.topicId ?? null;
  }, [sessions, inProgressTopicIds]);

  const startedTopicIds = useMemo((): string[] => {
    const lastSessionByTopicId = new Map<string, string>();
    for (const session of sessions) {
      if (!session.topicId) continue;
      const existing = lastSessionByTopicId.get(session.topicId);
      if (!existing || session.createdAt > existing) {
        lastSessionByTopicId.set(session.topicId, session.createdAt);
      }
    }

    return [...inProgressTopicIds]
      .filter((topicId) => topicId !== continueNowTopicId)
      .sort((a, b) =>
        (lastSessionByTopicId.get(b) ?? '').localeCompare(
          lastSessionByTopicId.get(a) ?? '',
        ),
      );
  }, [sessions, inProgressTopicIds, continueNowTopicId]);

  const sessionCountByTopicId = useMemo((): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const session of sessions) {
      if (!session.topicId) continue;
      counts.set(session.topicId, (counts.get(session.topicId) ?? 0) + 1);
    }
    return counts;
  }, [sessions]);

  const topicById = useMemo((): Map<string, CurriculumTopic> => {
    const map = new Map<string, CurriculumTopic>();
    for (const topic of topics) {
      map.set(topic.id, topic);
    }
    return map;
  }, [topics]);

  const continueNowTopic = useMemo(() => {
    if (!continueNowTopicId) {
      return null;
    }
    return topicById.get(continueNowTopicId) ?? null;
  }, [continueNowTopicId, topicById]);

  const visibleStartedTopicIds = useMemo(
    () => startedTopicIds.filter((topicId) => topicById.has(topicId)),
    [startedTopicIds, topicById],
  );

  const isBookComplete = useMemo(
    () =>
      activeTopics.length > 0 &&
      activeTopics.every((topic) => topicStudiedIds.has(topic.id)),
    [activeTopics, topicStudiedIds],
  );

  const resumeTargetTopicId = useMemo((): string | null => {
    const topicId = resumeTargetQuery.data?.topicId;
    if (!topicId || !topicById.has(topicId)) {
      return null;
    }
    return topicId;
  }, [resumeTargetQuery.data?.topicId, topicById]);

  const primaryContinueTopicId =
    (continueNowTopic ? continueNowTopic.id : null) ?? resumeTargetTopicId;

  const primaryContinueTopic = primaryContinueTopicId
    ? (topicById.get(primaryContinueTopicId) ?? null)
    : null;

  const doneTopics = useMemo((): CurriculumTopic[] => {
    const lastSessionByTopicId = new Map<string, string>();
    for (const session of sessions) {
      if (!session.topicId) continue;
      const existing = lastSessionByTopicId.get(session.topicId);
      if (!existing || session.createdAt > existing) {
        lastSessionByTopicId.set(session.topicId, session.createdAt);
      }
    }

    return activeTopics
      .filter((topic) => topicStudiedIds.has(topic.id))
      .sort(
        (a, b) =>
          (lastSessionByTopicId.get(b.id) ?? '').localeCompare(
            lastSessionByTopicId.get(a.id) ?? '',
          ) || a.sortOrder - b.sortOrder,
      );
  }, [activeTopics, topicStudiedIds, sessions]);

  const upNextTopic = useMemo(
    () =>
      computeUpNextTopic(
        activeTopics,
        topicStudiedIds,
        inProgressTopicIds,
        sessions,
      ),
    [activeTopics, topicStudiedIds, inProgressTopicIds, sessions],
  );

  // --- Chapter-first topic grouping ---
  // Groups ALL active topics by chapter, with each topic annotated by its state.
  const chapterSections = useMemo(() => {
    const continueId = primaryContinueTopicId;
    const upNextId = continueId ? null : (upNextTopic?.id ?? null);
    const groups = groupTopicsByChapter(activeTopics);
    return groups.map((group) => {
      type TopicWithState = {
        topic: CurriculumTopic;
        state: 'continue-now' | 'started' | 'up-next' | 'done' | 'later';
        sessionCount: number;
      };
      const items: TopicWithState[] = [];
      for (const topic of group.topics) {
        if (topic.skipped) continue;
        let state: TopicWithState['state'];
        if (topic.id === continueId) {
          state = 'continue-now';
        } else if (topic.id === upNextId) {
          state = 'up-next';
        } else if (topicStudiedIds.has(topic.id)) {
          state = 'done';
        } else if (inProgressTopicIds.has(topic.id)) {
          state = 'started';
        } else {
          state = 'later';
        }
        items.push({
          topic,
          state,
          sessionCount: sessionCountByTopicId.get(topic.id) ?? 0,
        });
      }
      // Sort by the same decision priority as the sticky CTA.
      const stateOrder = {
        'continue-now': 0,
        started: 1,
        'up-next': 2,
        later: 3,
        done: 4,
      };
      items.sort(
        (a, b) =>
          stateOrder[a.state] - stateOrder[b.state] ||
          a.topic.sortOrder - b.topic.sortOrder,
      );
      return { chapter: group.chapter, items };
    });
  }, [
    activeTopics,
    primaryContinueTopicId,
    upNextTopic,
    topicStudiedIds,
    inProgressTopicIds,
    sessionCountByTopicId,
  ]);
  const hasMultipleChapters = chapterSections.length > 1;

  useEffect(() => {
    if (wasBookComplete.current === null) {
      wasBookComplete.current = isBookComplete;
      return;
    }
    if (isBookComplete && !wasBookComplete.current) {
      setShowBookCompletionBurst(true);
    }
    wasBookComplete.current = isBookComplete;
  }, [isBookComplete]);

  const shouldAutoExpandThinTopicList =
    activeTopics.length === 1 && !isBookComplete;

  useEffect(() => {
    if (!shouldAutoExpandThinTopicList || isReadOnly || !bookId) return;
    if (thinTopicExpansionAttemptedBookIds.current.has(bookId)) return;
    if (isExpandingThinTopicList || generateMutation.isPending) return;

    thinTopicExpansionAttemptedBookIds.current.add(bookId);
    handleExpandThinTopicList();
  }, [
    bookId,
    generateMutation.isPending,
    handleExpandThinTopicList,
    isExpandingThinTopicList,
    isReadOnly,
    shouldAutoExpandThinTopicList,
  ]);

  useEffect(() => {
    if (continueNowTopicId && !continueNowTopic) {
      Sentry.addBreadcrumb({
        category: 'topic-screen',
        level: 'warning',
        message: 'continueNowTopicId references missing topic',
        data: { topicId: continueNowTopicId },
      });
    }
  }, [continueNowTopicId, continueNowTopic]);

  const reviewTopic = useMemo(() => {
    const retentionTopics = retentionTopicsQuery.data?.topics ?? [];
    const dueTopicId = [...retentionTopics]
      .filter(
        (topic) =>
          topicStudiedIds.has(topic.topicId) &&
          activeTopicIds.has(topic.topicId),
      )
      .sort((a, b) => {
        const aTime = a.nextReviewAt
          ? new Date(a.nextReviewAt).getTime()
          : Number.POSITIVE_INFINITY;
        const bTime = b.nextReviewAt
          ? new Date(b.nextReviewAt).getTime()
          : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      })[0]?.topicId;

    if (dueTopicId) {
      return topicById.get(dueTopicId) ?? null;
    }

    return doneTopics[0] ?? null;
  }, [
    retentionTopicsQuery.data,
    topicStudiedIds,
    activeTopicIds,
    topicById,
    doneTopics,
  ]);

  const [showPastConversations, setShowPastConversations] = useState(false);

  // --- Topic press: navigate to Topic Detail ---
  const handleTopicPress = useCallback(
    (topicId: string) => {
      const topic = topicById.get(topicId);
      router.push({
        pathname: '/(app)/topic/[topicId]',
        params: {
          topicId,
          subjectId,
          bookId,
          ...(topic?.chapter ? { chapter: topic.chapter } : {}),
        },
      } as Href);
    },
    [bookId, router, subjectId, topicById],
  );

  // --- Session list grouped by chapter ---
  const groupedSessions = useMemo(
    () => groupSessionsByChapter(sessions),
    [sessions],
  );
  const showChapterDividers = sessionCount >= 4;

  // --- Session press: navigate to session summary/transcript ---
  const handleSessionPress = useCallback(
    (session: BookSession) => {
      router.push(
        buildSessionDetailHref({
          sessionId: session.id,
          subjectId,
          bookId,
          topicId: session.topicId,
          childProfileId: proxyChildProfileId,
        }),
      );
    },
    [bookId, proxyChildProfileId, router, subjectId],
  );

  const handleNoteSourcePress = useCallback(
    (sessionId: string, topicId?: string | null) => {
      router.push(
        buildSessionDetailHref({
          sessionId,
          subjectId,
          bookId,
          topicId,
          childProfileId: proxyChildProfileId,
        }),
      );
    },
    [bookId, proxyChildProfileId, router, subjectId],
  );

  // --- Long-press: context menu for moving topic to a different book ---
  const handleSessionLongPress = useCallback(
    (session: BookSession) => {
      if (!subjectId || !bookId || isReadOnly) return;
      // BUG-418 class: Array.isArray guard — select is bypassed when enabled=false,
      // so data can be a wrapped object instead of an array. ?? [] only guards null/undefined.
      const safeAllBooks = Array.isArray(allBooksQuery.data)
        ? allBooksQuery.data
        : [];
      const otherBooks = safeAllBooks.filter((b) => b.id !== bookId);

      if (otherBooks.length === 0) {
        platformAlert(
          session.topicTitle,
          'This is the only book on this shelf — there is nowhere to move this topic.',
        );
        return;
      }

      const moveButtons = otherBooks.map((targetBook) => ({
        text: `${targetBook.emoji ? targetBook.emoji + ' ' : ''}${
          targetBook.title
        }`,
        onPress: () => {
          if (!session.topicId) return;
          moveTopic.mutate(
            {
              subjectId,
              bookId,
              topicId: session.topicId,
              targetBookId: targetBook.id,
            },
            {
              onSuccess: () => {
                platformAlert(
                  'Moved',
                  `"${session.topicTitle}" moved to ${targetBook.title}.`,
                );
              },
              onError: (err) => {
                platformAlert('Could not move topic', formatApiError(err));
              },
            },
          );
        },
      }));

      platformAlert(session.topicTitle, 'Move to a different book?', [
        ...moveButtons,
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [subjectId, bookId, isReadOnly, allBooksQuery.data, moveTopic],
  );

  // --- Start learning: follow the status-first CTA priority ---
  const handleStartLearning = useCallback(() => {
    if (
      resumeTargetQuery.data &&
      primaryContinueTopicId &&
      resumeTargetQuery.data.topicId === primaryContinueTopicId
    ) {
      pushLearningResumeTarget(router, resumeTargetQuery.data);
      return;
    }

    if (primaryContinueTopicId) {
      const topic = topicById.get(primaryContinueTopicId);
      if (topic) {
        router.push({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: topic.id, subjectId, bookId },
        } as Href);
        return;
      }
    }

    if (upNextTopic) {
      router.push({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId,
          topicId: upNextTopic.id,
          topicName: upNextTopic.title,
        },
      } as Href);
      return;
    }

    if (startedTopicIds.length > 0) {
      const newestStartedId = startedTopicIds[0];
      if (!newestStartedId) {
        return;
      }
      const topic = topicById.get(newestStartedId);
      if (topic) {
        router.push({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: topic.id, subjectId, bookId },
        } as Href);
        return;
      }
    }

    if (resumeTargetQuery.data) {
      pushLearningResumeTarget(router, resumeTargetQuery.data);
    }
  }, [
    primaryContinueTopicId,
    topicById,
    upNextTopic,
    startedTopicIds,
    resumeTargetQuery.data,
    router,
    subjectId,
    bookId,
  ]);

  const handleTopicStart = useCallback(
    (topicId: string, topicTitle: string) => {
      router.push({
        pathname: '/(app)/session',
        params: { mode: 'learning', subjectId, topicId, topicName: topicTitle },
      } as Href);
    },
    [router, subjectId],
  );

  const handleBuildLearningPath = useCallback(async () => {
    if (startFirstCurriculumSession.isPending) return;

    if (resumeTargetQuery.data) {
      pushLearningResumeTarget(router, resumeTargetQuery.data);
      return;
    }

    if (sessionCount > 0) {
      handleStartLearning();
      return;
    }

    try {
      const result = await startFirstCurriculumSession.mutateAsync({
        bookId,
        sessionType: 'learning',
        inputMode: 'text',
      });
      router.push({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId,
          bookId,
          sessionId: result.session.id,
          topicId: result.session.topicId ?? undefined,
          subjectName: book?.title ?? undefined,
        },
      } as Href);
    } catch (error) {
      platformAlert('Could not start learning', formatApiError(error));
    }
  }, [
    book?.title,
    bookId,
    handleStartLearning,
    resumeTargetQuery.data,
    router,
    sessionCount,
    startFirstCurriculumSession,
    subjectId,
  ]);

  const handleStartReview = useCallback(() => {
    if (!reviewTopic) return;

    router.push({
      pathname: '/(app)/topic/relearn',
      params: {
        topicId: reviewTopic.id,
        subjectId,
        topicName: reviewTopic.title,
      },
    } as Href);
  }, [reviewTopic, router, subjectId]);

  const handleNextBook = useCallback(() => {
    router.push({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId },
    } as Href);
  }, [router, subjectId]);

  // --- Note handlers ---
  const handleNoteAddPress = useCallback(() => {
    setShowTopicPicker(true);
  }, []);

  const handleTopicPickerSelect = useCallback((topicId: string) => {
    setSelectedTopicId(topicId);
    setShowTopicPicker(false);
    setShowNoteInput(true);
  }, []);

  const handleTopicPickerClose = useCallback(() => {
    setShowTopicPicker(false);
  }, []);

  const handleNoteSave = useCallback(
    (content: string) => {
      if (!selectedTopicId) return;
      createNote.mutate(
        { topicId: selectedTopicId, content },
        {
          onSuccess: () => {
            setShowNoteInput(false);
            setSelectedTopicId(null);
          },
          onError: (err) => {
            platformAlert('Could not save note', formatApiError(err));
          },
        },
      );
    },
    [selectedTopicId, createNote],
  );

  const handleNoteInputCancel = useCallback(() => {
    setShowNoteInput(false);
    setSelectedTopicId(null);
  }, []);

  const handleNoteEditSave = useCallback(
    (content: string) => {
      if (!editingNote) return;
      updateNote.mutate(
        { noteId: editingNote.noteId, content },
        {
          onSuccess: () => setEditingNote(null),
          onError: (err) => {
            platformAlert('Could not update note', formatApiError(err));
          },
        },
      );
    },
    [editingNote, updateNote],
  );

  const handleNoteEditCancel = useCallback(() => {
    setEditingNote(null);
  }, []);

  useEffect(() => {
    if (showNoteInput || editingNote !== null) {
      setNotesExpanded(true);
    }
  }, [editingNote, showNoteInput]);

  const handleNoteLongPress = useCallback(
    (noteId: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      showNoteContextMenu({
        noteId,
        content: note.content,
        onEdit: (id, currentContent) => {
          setEditingNote({ noteId: id, content: currentContent });
        },
        onDelete: (id) => {
          deleteNoteById.mutate(id, {
            onError: (err) => {
              platformAlert('Could not delete note', formatApiError(err));
            },
          });
        },
      });
    },
    [notes, deleteNoteById],
  );

  // --- Auto-start session when navigated with autoStart=true (M-12) ---
  const autoStartTriggered = useRef(false);
  useEffect(() => {
    if (
      autoStart === 'true' &&
      !autoStartTriggered.current &&
      !needsGeneration &&
      !generateMutation.isPending &&
      topics.length > 0
    ) {
      autoStartTriggered.current = true;
      handleStartLearning();
    }
  }, [
    autoStart,
    topics,
    needsGeneration,
    generateMutation.isPending,
    handleStartLearning,
  ]);

  // --- Screen states ---

  // 0. Missing route params
  if (!subjectId || !bookId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
        testID="book-missing-param"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          {t('library.book.missingDetails')}
        </Text>
        <Pressable
          onPress={handleBack}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          testID="book-missing-param-back"
        >
          <Text className="text-text-primary text-body font-semibold">
            {t('common.goBackAction')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // 1. Loading — show hero immediately from navigation params, sections shimmer
  if (bookQuery.isLoading && !hasBookData) {
    // Extract title/emoji from the books list query if available (already cached)
    const cachedBook = allBooksQuery.data?.find?.((b) => b.id === bookId);
    const heroTitle = cachedBook?.title ?? params.bookId ?? 'Book';
    const heroEmoji = cachedBook?.emoji ?? null;

    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top }}
        testID="book-loading"
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        >
          {/* Back button */}
          <View className="px-5 pt-4 pb-3 flex-row items-center">
            <Pressable
              onPress={handleBack}
              className="p-2 -ms-2 me-2"
              accessibilityRole="button"
              accessibilityLabel="Back"
              testID="book-loading-back"
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={themeColors.accent}
              />
            </Pressable>
          </View>

          {/* Book hero — from nav params */}
          <View className="px-5 pb-4" testID="book-hero-loading">
            {heroEmoji ? (
              <Text style={{ fontSize: 56, lineHeight: 68 }}>{heroEmoji}</Text>
            ) : null}
            <Text
              className="text-h2 font-bold text-text-primary mt-2"
              numberOfLines={3}
            >
              {heroTitle}
            </Text>
          </View>

          {/* Notes section loading strip */}
          <View className="mb-4">
            <BookSectionStrip
              testID="book-notes-strip-loading"
              icon="create-outline"
              label="Notes for this book"
              summary="Loading notes..."
              meta="..."
              expanded={false}
              accentColor={themeColors.accent}
              onPress={() => undefined}
            />
          </View>

          {/* Topics section shimmer */}
          <View className="px-5 mb-4">
            <Text className="mb-2 text-body-sm font-semibold text-text-secondary">
              {t('library.book.topics')}
            </Text>
            <ShimmerSkeleton testID="book-topics-loading">
              <View>
                {[0, 1, 2, 3, 4].map((i) => (
                  <View
                    key={i}
                    style={{
                      height: 40,
                      borderRadius: 8,
                      marginBottom: 8,
                      backgroundColor: themeColors.border,
                    }}
                  />
                ))}
              </View>
            </ShimmerSkeleton>
          </View>
        </ScrollView>
      </View>
    );
  }

  // 2. Error
  if (bookQuery.isError && !hasBookData) {
    const errorMessage =
      bookQuery.error instanceof Error
        ? bookQuery.error.message
        : "Couldn't load this book.";

    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
        testID="book-error"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          {errorMessage}
        </Text>
        <Pressable
          onPress={() => void bookQuery.refetch()}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
          accessibilityRole="button"
          testID="book-retry-button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            {t('common.retry')}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleBack}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          testID="book-back-button"
        >
          <Text className="text-text-primary text-body font-semibold">
            {t('common.goBackAction')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // 3. Generation in progress
  if (showGenerating) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
        testID="book-generating"
      >
        <MagicPenAnimation
          size={screenLoadingMotion.size}
          color={themeColors.accent}
        />
        {book?.emoji && <Text className="text-3xl mt-4">{book.emoji}</Text>}
        <Text className="text-h2 font-bold text-text-primary mt-3 text-center">
          {book?.title ?? t('library.book.writingYourBook')}
        </Text>
        {shownBookDescription && (
          <Text className="text-body-sm text-text-secondary mt-2 text-center px-4">
            {shownBookDescription}
          </Text>
        )}
        <Text className="text-body-sm text-text-secondary mt-4">
          {t('library.book.writingYourBook')}
        </Text>

        {genPhase === 'slow' && (
          <Text className="text-body-sm text-text-secondary mt-2 text-center">
            {t('library.book.takingLonger')}
          </Text>
        )}

        {genPhase === 'timed_out' && (
          <View className="mt-4 items-center">
            <Text className="text-body text-text-secondary text-center mb-4">
              {t('library.book.finishError')}
            </Text>
            <Pressable
              onPress={handleRetryGeneration}
              className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
              accessibilityRole="button"
              testID="book-gen-retry"
            >
              <Text className="text-text-inverse text-body font-semibold">
                {t('common.retry')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleBuildLearningPath}
              disabled={startFirstCurriculumSession.isPending}
              className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
              accessibilityRole="button"
              accessibilityLabel="Set up this book"
              testID="book-gen-build-path"
            >
              <Text className="text-text-primary text-body font-semibold">
                {t('library.book.setUpBook')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleBack}
              className="px-5 py-3"
              testID="book-gen-back"
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text className="text-body text-primary font-semibold">
                {t('common.goBackAction')}
              </Text>
            </Pressable>
          </View>
        )}

        {genPhase !== 'timed_out' && (
          <Pressable
            onPress={handleBack}
            className="mt-6 px-5 py-3"
            accessibilityLabel="Go back"
            accessibilityRole="button"
            testID="book-gen-back-idle"
          >
            <Text className="text-body text-primary font-semibold">
              {t('common.goBackAction')}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  // 4. Main view — session-based workspace
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="book-screen"
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-3 flex-row items-center">
          <Pressable
            onPress={handleBack}
            className="p-2 -ms-2 me-2"
            accessibilityRole="button"
            accessibilityLabel="Back"
            testID="book-back"
          >
            <Ionicons name="arrow-back" size={24} color={themeColors.accent} />
          </Pressable>
          <View className="flex-1" />
          {!isReadOnly ? (
            <Pressable
              onPress={handleDeleteBookPress}
              disabled={deleteBookMutation.isPending}
              className="p-2 me-1"
              accessibilityRole="button"
              accessibilityLabel="Delete book"
              accessibilityState={{ disabled: deleteBookMutation.isPending }}
              testID="book-delete-button"
            >
              <Ionicons
                name="trash-outline"
                size={22}
                color={
                  deleteBookMutation.isPending
                    ? withOpacity(themeColors.danger, 0.45)
                    : themeColors.danger
                }
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleSubjectBookmarksPress}
            className="p-2 -me-2"
            accessibilityRole="button"
            accessibilityLabel="View saved bookmarks for this subject"
            testID="book-subject-bookmarks"
          >
            <Ionicons
              name="bookmark-outline"
              size={22}
              color={themeColors.accent}
            />
          </Pressable>
        </View>

        {/* Book hero */}
        <View className="px-5 pb-4" testID="book-hero">
          {book?.emoji ? (
            <Text style={{ fontSize: 56, lineHeight: 68 }}>{book.emoji}</Text>
          ) : null}
          <Text className="text-caption font-semibold text-text-tertiary mt-2 mb-1">
            {t('library.shelf.levelBook')}
          </Text>
          <Text
            className="text-h2 font-bold text-text-primary"
            numberOfLines={3}
            testID="book-hero-title"
          >
            {book?.title ?? t('library.book.badge')}
          </Text>
          {shownBookDescription ? (
            <Text
              className="mt-1 text-body-sm text-text-secondary"
              numberOfLines={3}
            >
              {shownBookDescription}
            </Text>
          ) : null}
          {bookRetentionStatus !== null ? (
            <View className="mt-2">
              <RetentionPill
                status={bookRetentionStatus}
                daysSinceLastReview={bookDaysSinceLastReview}
                testID="book-retention-pill"
              />
            </View>
          ) : null}

          {activeTopics.length > 0 ? (
            <View className="mt-3">
              <View className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                <View
                  className="h-full rounded-full"
                  style={{
                    position: 'absolute',
                    left: 0,
                    backgroundColor: themeColors.success,
                    width: `${Math.min(
                      100,
                      (masteredTopicIds.size / activeTopics.length) * 100,
                    )}%`,
                  }}
                  testID="book-progress-mastered-bar"
                />
                <View
                  className="h-full rounded-full"
                  style={{
                    position: 'absolute',
                    left: `${Math.min(
                      100,
                      (masteredTopicIds.size / activeTopics.length) * 100,
                    )}%`,
                    backgroundColor: withOpacity(themeColors.success, 0.38),
                    width: `${Math.min(
                      100,
                      (learningTopicIds.size / activeTopics.length) * 100,
                    )}%`,
                  }}
                  testID="book-progress-learning-bar"
                />
              </View>
              <Text
                className="mt-1 text-caption text-text-secondary"
                testID="book-topic-progress-text"
              >
                {t('library.book.topicProgressThreeState', {
                  mastered: masteredTopicIds.size,
                  learning: learningTopicIds.size,
                  total: activeTopics.length,
                })}
              </Text>
            </View>
          ) : null}
        </View>

        {/* YOUR NOTES section */}
        <View className="mb-4" testID="book-notes-section">
          <BookSectionStrip
            testID="book-notes-strip"
            icon="create-outline"
            label="Notes for this book"
            summary={noteSummary}
            meta={notesQuery.isLoading ? '...' : String(noteCount)}
            expanded={notesExpanded}
            accentColor={themeColors.accent}
            onPress={() => setNotesExpanded((current) => !current)}
          />

          {notesExpanded ? (
            <View className="mt-3 mb-1">
              {notesQuery.isLoading && !notesQuery.data ? (
                <ShimmerSkeleton testID="book-notes-loading">
                  <View className="px-5">
                    {[0, 1].map((i) => (
                      <View
                        key={i}
                        style={{
                          height: 52,
                          borderRadius: 8,
                          marginBottom: 8,
                          backgroundColor: themeColors.border,
                        }}
                      />
                    ))}
                  </View>
                </ShimmerSkeleton>
              ) : sortedNotes.length > 0 ? (
                sortedNotes.map((note) => {
                  if (editingNote?.noteId === note.id) {
                    return (
                      <View key={note.id} className="px-5 mb-2">
                        <NoteInput
                          initialValue={editingNote.content}
                          saving={updateNote.isPending}
                          onSave={handleNoteEditSave}
                          onCancel={handleNoteEditCancel}
                        />
                      </View>
                    );
                  }
                  const sourceSessionId = note.sessionId;
                  return (
                    <InlineNoteCard
                      key={note.id}
                      noteId={note.id}
                      topicTitle={topicTitleMap.get(note.topicId) ?? 'Topic'}
                      content={note.content}
                      sourceLine={formatSourceLine(note, i18n?.language)}
                      updatedAt={note.updatedAt}
                      conceptSignal={
                        conceptSignalsQuery.data?.signals?.[note.topicId]
                      }
                      onLongPress={handleNoteLongPress}
                      onSourcePress={
                        sourceSessionId
                          ? () =>
                              handleNoteSourcePress(
                                sourceSessionId,
                                note.topicId,
                              )
                          : undefined
                      }
                      testID={`note-${note.id}`}
                    />
                  );
                })
              ) : (
                <Text
                  className="px-5 py-2 text-body-sm text-text-secondary"
                  testID="book-notes-empty"
                >
                  {t('library.book.noNotesYet')}
                </Text>
              )}
              {showNoteInput && (
                <View className="px-5 mb-2" testID="book-note-input-container">
                  <NoteInput
                    saving={createNote.isPending}
                    onSave={handleNoteSave}
                    onCancel={handleNoteInputCancel}
                  />
                </View>
              )}
              <Pressable
                onPress={handleNoteAddPress}
                className="mx-5 mt-1 flex-row items-center py-3"
                testID="book-add-note"
                accessibilityRole="button"
                accessibilityLabel={
                  sortedNotes.length === 0
                    ? 'Add your first note for this book'
                    : 'Add a note'
                }
              >
                <Text className="text-body-sm font-medium text-primary">
                  {sortedNotes.length === 0
                    ? t('library.book.addFirstNote')
                    : t('library.book.addNote')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Error banners */}
        {sessionsError ? (
          <View className="px-5 mb-3" testID="sessions-error-banner">
            <View
              className="flex-row items-center justify-between rounded-card p-3"
              style={{
                backgroundColor: `${themeColors.danger}10`,
                borderColor: themeColors.danger,
                borderWidth: 1,
              }}
            >
              <Text className="me-3 flex-1 text-body-sm text-text-primary">
                {t('library.book.historyError')}
              </Text>
              <Pressable
                onPress={() => void refetchSessions()}
                testID="sessions-error-retry"
                accessibilityRole="button"
                accessibilityLabel="Retry loading session history"
                className="px-3 py-1"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  {t('common.retry')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {retentionError ? (
          <View className="px-5 mb-3" testID="retention-error-banner">
            <View
              className="flex-row items-center justify-between rounded-card p-3"
              style={{
                backgroundColor: `${themeColors.danger}10`,
                borderColor: themeColors.danger,
                borderWidth: 1,
              }}
            >
              <Text className="me-3 flex-1 text-body-sm text-text-primary">
                {t('library.book.progressError')}
              </Text>
              <Pressable
                onPress={() => void refetchRetention()}
                testID="retention-error-retry"
                accessibilityRole="button"
                accessibilityLabel="Retry loading progress"
                className="px-3 py-1"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  {t('common.retry')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Empty state: topics generated but array is empty */}
        {topics.length === 0 && book?.topicsGenerated && !needsGeneration ? (
          <View className="px-5 py-8" testID="topics-empty-state">
            <Text className="mb-2 text-center text-h3 font-semibold text-text-primary">
              {t('library.book.notReadyTitle')}
            </Text>
            <Text className="mb-4 text-center text-body-sm text-text-secondary">
              {t('library.book.notReadyHint')}
            </Text>
            <Pressable
              onPress={handleBuildLearningPath}
              disabled={startFirstCurriculumSession.isPending}
              className="min-h-[48px] self-center items-center justify-center rounded-button bg-primary px-5 py-3"
              testID="topics-empty-build"
              accessibilityRole="button"
              accessibilityLabel="Set up this book"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('library.book.setUpBook')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* The sticky CTA and the highlighted topic row share the same
            status-first target, but rows remain overview links. The green CTA
            is the only learning-chat entry point on this list. */}

        {/* Topics grouped by chapter, then state within chapter */}
        {chapterSections.length > 0 ? (
          <View className="px-5 mb-1" testID="chapter-topics">
            {chapterSections.map((section) => (
              <View key={section.chapter} className="mb-3">
                {hasMultipleChapters ? (
                  <Text className="mb-2 text-body-sm font-semibold text-text-secondary">
                    {section.chapter}
                  </Text>
                ) : null}
                {section.items.map(({ topic, state, sessionCount: count }) => (
                  <TopicStatusRow
                    key={topic.id}
                    state={state}
                    variant={
                      state === 'up-next' && sessionCount === 0
                        ? 'hero'
                        : undefined
                    }
                    title={topic.title}
                    relevance={topic.relevance}
                    sourceChildProfileId={topic.sourceChildProfileId}
                    createdAt={topic.createdAt}
                    sessionCount={
                      state === 'continue-now' || state === 'started'
                        ? count
                        : undefined
                    }
                    onPress={() => handleTopicPress(topic.id)}
                    testID={`${state}-row-${topic.id}`}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {/* Fallback: topics exist but none are active/visible */}
        {topics.length > 0 &&
        !isBookComplete &&
        chapterSections.every((s) => s.items.length === 0) ? (
          <View className="px-5 mb-3" testID="all-sections-fallback">
            <View className="rounded-card bg-surface-elevated p-5">
              <Text className="mb-2 text-body font-semibold text-text-primary">
                {t('library.book.nothingToShow')}
              </Text>
              <Text className="mb-3 text-body-sm text-text-secondary">
                {t('library.book.progressEmpty')}
              </Text>
              <Pressable
                onPress={() => {
                  const fallbackTopic =
                    activeTopics[0] ??
                    topics.find((topic) => !topic.skipped) ??
                    topics[0];
                  if (fallbackTopic) {
                    handleTopicStart(fallbackTopic.id, fallbackTopic.title);
                  }
                }}
                className="min-h-[48px] flex-row items-center justify-center rounded-button bg-primary px-5 py-3"
                testID="fallback-start"
                accessibilityRole="button"
                accessibilityLabel="Start first lesson"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('library.book.startFirstLesson')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Book complete */}
        {isBookComplete ? (
          <View className="px-5 mb-3" testID="book-complete-card">
            <View
              className="rounded-card bg-surface-elevated p-5"
              style={{ borderColor: themeColors.success, borderWidth: 1 }}
              accessible
              accessibilityLabel={`${book?.title ?? 'Book'} complete. ${
                activeTopics.length
              } topics studied.`}
            >
              <Text
                className="mb-2 text-3xl"
                accessible={false}
                importantForAccessibility="no"
              >
                🎉
              </Text>
              {showBookCompletionBurst ? (
                <View className="absolute end-4 top-3">
                  <CelebrationAnimation
                    size={120}
                    color={themeColors.success}
                    accentColor={themeColors.accent}
                    onComplete={() => setShowBookCompletionBurst(false)}
                    testID="book-complete-celebration"
                  />
                </View>
              ) : null}
              <Text className="mb-1 text-h3 font-bold text-text-primary">
                {t('library.book.finishedTitle')}
              </Text>
              <Text className="mb-4 text-body-sm text-text-secondary">
                {t('library.book.finishedBody', { count: activeTopics.length })}
              </Text>

              <Pressable
                onPress={handleStartReview}
                className="mb-2 min-h-[48px] flex-row items-center justify-center rounded-button bg-primary px-5 py-3"
                testID="book-complete-review"
                accessibilityRole="button"
                accessibilityLabel="Start spaced-repetition review"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('library.book.startReview')}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleNextBook}
                className="items-center py-2"
                testID="book-complete-next"
                accessibilityRole="button"
                accessibilityLabel="Back to subject to pick what to learn next"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  {t('library.book.backToSubject')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Section 7: Past conversations (collapsed by default) */}
        <View className="mb-4" testID="book-sessions-section">
          <Pressable
            onPress={() => setShowPastConversations((v) => !v)}
            className="flex-row items-center justify-between px-5 py-2"
            testID="book-sessions-toggle"
            accessibilityRole="button"
            accessibilityLabel={
              showPastConversations
                ? 'Collapse past conversations'
                : 'Expand past conversations'
            }
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              {t('library.book.pastConversations')}
              {!sessionsQuery.isLoading && sessions.length > 0
                ? ` (${sessions.length})`
                : ''}
            </Text>
            <Ionicons
              name={showPastConversations ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={themeColors.textSecondary}
            />
          </Pressable>
          {showPastConversations ? (
            sessionsQuery.isLoading && !sessionsQuery.data ? (
              <ShimmerSkeleton testID="book-sessions-loading">
                <View className="px-5">
                  {[0, 1, 2].map((i) => (
                    <View
                      key={i}
                      style={{
                        height: 44,
                        borderRadius: 8,
                        marginBottom: 8,
                        backgroundColor: themeColors.border,
                      }}
                    />
                  ))}
                </View>
              </ShimmerSkeleton>
            ) : sessions.length === 0 ? (
              <Text
                className="px-5 py-2 text-body-sm text-text-secondary"
                testID="book-sessions-empty"
              >
                {t('library.book.noConversations')}
              </Text>
            ) : showChapterDividers ? (
              groupedSessions.map((group) => (
                <View key={group.chapter}>
                  <ChapterDivider name={group.chapter} />
                  {group.sessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      title={session.topicTitle}
                      relativeDate={formatRelativeDate(session.createdAt)}
                      hasNote={
                        session.topicId != null &&
                        noteTopicIds.has(session.topicId)
                      }
                      onPress={() => handleSessionPress(session)}
                      onLongPress={
                        session.topicId
                          ? () => handleSessionLongPress(session)
                          : undefined
                      }
                      testID={`session-${session.id}`}
                    />
                  ))}
                </View>
              ))
            ) : (
              sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  title={session.topicTitle}
                  relativeDate={formatRelativeDate(session.createdAt)}
                  hasNote={
                    session.topicId != null && noteTopicIds.has(session.topicId)
                  }
                  onPress={() => handleSessionPress(session)}
                  onLongPress={
                    session.topicId
                      ? () => handleSessionLongPress(session)
                      : undefined
                  }
                  testID={`session-${session.id}`}
                />
              ))
            )
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky CTA - adapts to learner state */}
      {activeTopics.length > 0 && !isReadOnly
        ? (() => {
            const hasStarted = visibleStartedTopicIds.length > 0;
            const newestStartedId = visibleStartedTopicIds[0];
            const newestStartedTopic = newestStartedId
              ? topicById.get(newestStartedId)
              : null;
            const label = getBookStickyCtaLabel({
              isBookComplete,
              continueTopicTitle: primaryContinueTopic?.title ?? null,
              upNextTopicTitle: upNextTopic?.title ?? null,
              newestStartedTopicTitle: newestStartedTopic?.title ?? null,
            });

            if (
              !label ||
              (!upNextTopic && !primaryContinueTopic && !hasStarted)
            ) {
              return null;
            }

            return (
              <View
                className="absolute bottom-0 left-0 right-0 border-t border-border bg-background px-5"
                style={{
                  paddingBottom: Math.max(insets.bottom, 16),
                  paddingTop: 12,
                }}
              >
                <Pressable
                  onPress={handleStartLearning}
                  className="min-h-[48px] flex-row items-center justify-center rounded-button bg-primary px-5 py-4"
                  testID="book-start-learning"
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  <Text className="text-body font-semibold text-text-inverse">
                    {label}
                  </Text>
                </Pressable>
                {!hasCurriculum ? (
                  <Pressable
                    onPress={handleBuildLearningPath}
                    disabled={startFirstCurriculumSession.isPending}
                    className="mt-2 items-center py-2"
                    testID="book-build-path-link"
                    accessibilityRole="button"
                    accessibilityLabel="Set up this book"
                  >
                    <Text className="text-body-sm text-text-secondary underline">
                      {t('library.book.setUpBook')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })()
        : null}

      {/* Topic picker for note add flow */}
      <TopicPickerSheet
        visible={showTopicPicker}
        topics={activeTopics.map((t) => ({
          topicId: t.id,
          name: t.title,
          chapter: t.chapter ?? null,
        }))}
        defaultTopicId={selectedTopicId ?? undefined}
        onSelect={handleTopicPickerSelect}
        onClose={handleTopicPickerClose}
      />
    </View>
  );
}
