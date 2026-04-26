import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CurriculumTopic } from '@eduagent/schemas';
import * as Sentry from '@sentry/react-native';
import {
  BookPageFlipAnimation,
  MagicPenAnimation,
} from '../../../../../components/common';
import { CollapsibleChapter } from '../../../../../components/library/CollapsibleChapter';
import { SessionRow } from '../../../../../components/library/SessionRow';
import { ChapterDivider } from '../../../../../components/library/ChapterDivider';
import { TopicStatusRow } from '../../../../../components/library/TopicStatusRow';
import {
  useBookWithTopics,
  useBooks,
  useGenerateBookTopics,
} from '../../../../../hooks/use-books';
import {
  useBookSessions,
  type BookSession,
} from '../../../../../hooks/use-book-sessions';
import { useMoveTopic } from '../../../../../hooks/use-move-topic';
import { useBookNotes } from '../../../../../hooks/use-notes';
import { useRetentionTopics } from '../../../../../hooks/use-retention';
import { useCurriculum } from '../../../../../hooks/use-curriculum';
import { useSubjects } from '../../../../../hooks/use-subjects';
import { InlineNoteCard } from '../../../../../components/library/InlineNoteCard';
import { formatApiError } from '../../../../../lib/format-api-error';
import { formatRelativeDate } from '../../../../../lib/format-relative-date';
import { platformAlert } from '../../../../../lib/platform-alert';
import { useThemeColors } from '../../../../../lib/theme';
import { computeUpNextTopic } from '../../../../../lib/up-next-topic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMonthYear(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

interface GroupedChapter {
  chapter: string;
  sessions: BookSession[];
}

function groupSessionsByChapter(sessions: BookSession[]): GroupedChapter[] {
  const map = new Map<string, BookSession[]>();
  for (const s of sessions) {
    const key = s.chapter ?? 'Topics';
    const group = map.get(key);
    if (group) {
      group.push(s);
    } else {
      map.set(key, [s]);
    }
  }
  return Array.from(map.entries()).map(([chapter, items]) => ({
    chapter,
    sessions: items,
  }));
}

interface GroupedTopicChapter {
  chapter: string;
  topics: CurriculumTopic[];
}

function groupTopicsByChapter(
  topics: CurriculumTopic[]
): GroupedTopicChapter[] {
  const map = new Map<string, CurriculumTopic[]>();
  for (const t of topics) {
    const key = t.chapter ?? 'Topics';
    const group = map.get(key);
    if (group) {
      group.push(t);
    } else {
      map.set(key, [t]);
    }
  }
  return Array.from(map.entries()).map(([chapter, chapterTopics]) => ({
    chapter,
    topics: [...chapterTopics].sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

// ---------------------------------------------------------------------------
// Generation state machine
// ---------------------------------------------------------------------------

type GenerationPhase = 'idle' | 'slow' | 'timed_out';

const SLOW_THRESHOLD_MS = 30_000;
const TIMEOUT_THRESHOLD_MS = 60_000;
const DONE_COLLAPSE_THRESHOLD = 8;
const STARTED_COLLAPSE_THRESHOLD = 4;

// ---------------------------------------------------------------------------
// Book Screen
// ---------------------------------------------------------------------------

export default function BookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const params = useLocalSearchParams<{
    subjectId: string;
    bookId: string;
    readOnly?: string;
    autoStart?: string;
  }>();
  const subjectId = params.subjectId;
  const bookId = params.bookId;
  const isReadOnly = params.readOnly === 'true';
  const autoStart = params.autoStart;

  // --- Data queries (called unconditionally for rules-of-hooks) ---
  const bookQuery = useBookWithTopics(subjectId, bookId);
  const sessionsQuery = useBookSessions(subjectId, bookId);
  const notesQuery = useBookNotes(subjectId, bookId);
  const generateMutation = useGenerateBookTopics(subjectId, bookId);
  const curriculumQuery = useCurriculum(subjectId);
  const hasCurriculum = (curriculumQuery.data?.topics?.length ?? 0) > 0;
  const retentionTopicsQuery = useRetentionTopics(subjectId ?? '');
  const subjectsQuery = useSubjects();
  const subjectName = subjectsQuery.data?.find((s) => s.id === subjectId)?.name;
  const allBooksQuery = useBooks(subjectId);
  const moveTopic = useMoveTopic();

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // --- Generation auto-trigger ---
  const [genPhase, setGenPhase] = useState<GenerationPhase>('idle');
  const alreadyPending = useRef(false);

  const book = bookQuery.data?.book ?? null;
  const topics = useMemo(
    () => bookQuery.data?.topics ?? [],
    [bookQuery.data?.topics]
  );
  const activeTopics = useMemo(
    () => topics.filter((topic) => !topic.skipped),
    [topics]
  );

  const needsGeneration = book !== null && !book.topicsGenerated;

  useEffect(() => {
    if (!needsGeneration) return;
    if (alreadyPending.current) return;
    if (generateMutation.isPending) return;

    alreadyPending.current = true;
    setGenPhase('idle');

    const slowTimer = setTimeout(() => setGenPhase('slow'), SLOW_THRESHOLD_MS);
    const timeoutTimer = setTimeout(
      () => setGenPhase('timed_out'),
      TIMEOUT_THRESHOLD_MS
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
          { text: 'OK' },
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
      TIMEOUT_THRESHOLD_MS
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

  // Cleanup retry timers on unmount
  useEffect(() => {
    return () => {
      for (const t of retryTimersRef.current) clearTimeout(t);
    };
  }, []);

  // --- Notes ---
  const notes = useMemo(
    () => notesQuery.data?.notes ?? [],
    [notesQuery.data?.notes]
  );
  const noteTopicIds = useMemo(
    () => new Set(notes.map((n) => n.topicId)),
    [notes]
  );
  const topicTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of topics) map.set(t.id, t.title);
    return map;
  }, [topics]);
  const sortedNotes = useMemo(
    () =>
      [...notes].sort((a, b) =>
        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      ),
    [notes]
  );

  // Topics that have been studied at least once (repetitions > 0)
  const topicStudiedIds = useMemo((): Set<string> => {
    const retentionTopics = retentionTopicsQuery.data?.topics ?? [];
    const ids = new Set<string>();
    for (const rt of retentionTopics) {
      if (rt.repetitions > 0) ids.add(rt.topicId);
    }
    return ids;
  }, [retentionTopicsQuery.data]);

  // --- Sessions data ---
  const sessions = useMemo(
    () => sessionsQuery.data ?? [],
    [sessionsQuery.data]
  );
  const sessionsError = sessionsQuery.isError;
  const retentionError = retentionTopicsQuery.isError;
  const refetchSessions = sessionsQuery.refetch;
  const refetchRetention = retentionTopicsQuery.refetch;
  const sessionCount = sessions.length;

  const activeTopicIds = useMemo(
    () => new Set(activeTopics.map((topic) => topic.id)),
    [activeTopics]
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

  const continueNowTopicId = useMemo((): string | null => {
    const candidates = [...sessions]
      .filter(
        (session) =>
          !!session.topicId && inProgressTopicIds.has(session.topicId)
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
          lastSessionByTopicId.get(a) ?? ''
        )
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
            lastSessionByTopicId.get(a.id) ?? ''
          ) || a.sortOrder - b.sortOrder
      );
  }, [activeTopics, topicStudiedIds, sessions]);

  const upNextTopic = useMemo(
    () =>
      computeUpNextTopic(
        activeTopics,
        topicStudiedIds,
        inProgressTopicIds,
        sessions
      ),
    [activeTopics, topicStudiedIds, inProgressTopicIds, sessions]
  );

  const laterChapters = useMemo(() => {
    return groupTopicsByChapter(activeTopics)
      .map((group) => {
        const unstartedTopics = group.topics.filter(
          (topic) =>
            !topicStudiedIds.has(topic.id) &&
            !inProgressTopicIds.has(topic.id) &&
            !topic.skipped
        );

        if (unstartedTopics.length === 0) {
          return null;
        }

        const hasProgress = group.topics.some(
          (topic) =>
            topicStudiedIds.has(topic.id) || inProgressTopicIds.has(topic.id)
        );

        return {
          chapter: group.chapter,
          unstartedTopics,
          totalTopicCount: group.topics.length,
          chapterState: hasProgress
            ? ('partial' as const)
            : ('untouched' as const),
        };
      })
      .filter((group): group is NonNullable<typeof group> => group !== null);
  }, [activeTopics, topicStudiedIds, inProgressTopicIds]);

  const totalLaterTopics = laterChapters.reduce(
    (sum, chapter) => sum + chapter.unstartedTopics.length,
    0
  );
  const autoExpandLater = laterChapters.length <= 3 && totalLaterTopics <= 12;

  const isBookComplete = useMemo(
    () =>
      activeTopics.length > 0 &&
      activeTopics.every((topic) => topicStudiedIds.has(topic.id)),
    [activeTopics, topicStudiedIds]
  );

  const continueNowTopic = useMemo(() => {
    if (!continueNowTopicId) {
      return null;
    }
    return topicById.get(continueNowTopicId) ?? null;
  }, [continueNowTopicId, topicById]);

  const visibleStartedTopicIds = useMemo(
    () => startedTopicIds.filter((topicId) => topicById.has(topicId)),
    [startedTopicIds, topicById]
  );

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
          activeTopicIds.has(topic.topicId)
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

  const [showAllDone, setShowAllDone] = useState(false);
  const [showAllStarted, setShowAllStarted] = useState(false);

  // --- Topic press: navigate to Topic Detail ---
  const handleTopicPress = useCallback(
    (topicId: string) => {
      router.push({
        pathname: '/(app)/topic/[topicId]',
        params: { topicId, subjectId },
      } as never);
    },
    [router, subjectId]
  );

  // --- Session list grouped by chapter ---
  const groupedSessions = useMemo(
    () => groupSessionsByChapter(sessions),
    [sessions]
  );
  const showChapterDividers = sessionCount >= 4;

  // --- Session press: navigate to session summary/transcript ---
  const handleSessionPress = useCallback(
    (session: BookSession) => {
      router.push({
        pathname: '/session-summary/[sessionId]',
        params: {
          sessionId: session.id,
          subjectId,
          ...(session.topicId ? { topicId: session.topicId } : {}),
        },
      } as never);
    },
    [router, subjectId]
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
          'This is the only book on this shelf — there is nowhere to move this topic.'
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
                  `"${session.topicTitle}" moved to ${targetBook.title}.`
                );
              },
              onError: (err) => {
                platformAlert('Could not move topic', formatApiError(err));
              },
            }
          );
        },
      }));

      platformAlert(session.topicTitle, 'Move to a different book?', [
        ...moveButtons,
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [subjectId, bookId, isReadOnly, allBooksQuery.data, moveTopic]
  );

  // --- Start learning: follow the status-first CTA priority ---
  const handleStartLearning = useCallback(() => {
    if (continueNowTopicId) {
      const topic = topicById.get(continueNowTopicId);
      if (topic) {
        router.push({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: topic.id, subjectId },
        } as never);
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
      } as never);
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
          params: { topicId: topic.id, subjectId },
        } as never);
      }
    }
  }, [
    continueNowTopicId,
    topicById,
    upNextTopic,
    startedTopicIds,
    router,
    subjectId,
  ]);

  const handleTopicStart = useCallback(
    (topicId: string, topicTitle: string) => {
      router.push({
        pathname: '/(app)/session',
        params: { mode: 'learning', subjectId, topicId, topicName: topicTitle },
      } as never);
    },
    [router, subjectId]
  );

  const handleBuildLearningPath = useCallback(() => {
    router.push({
      pathname: '/(app)/onboarding/interview',
      params: {
        subjectId,
        bookId,
        bookTitle: book?.title ?? '',
      },
    } as never);
  }, [router, subjectId, bookId, book?.title]);

  const handleStartReview = useCallback(() => {
    if (!reviewTopic) return;

    router.push({
      pathname: '/(app)/topic/relearn',
      params: {
        topicId: reviewTopic.id,
        subjectId,
        topicName: reviewTopic.title,
      },
    } as never);
  }, [reviewTopic, router, subjectId]);

  const handleNextBook = useCallback(() => {
    router.push({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId },
    } as never);
  }, [router, subjectId]);

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
          Missing book details. Please go back and try again.
        </Text>
        <Pressable
          onPress={handleBack}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          testID="book-missing-param-back"
        >
          <Text className="text-text-primary text-body font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  // 1. Loading
  if (bookQuery.isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
        testID="book-loading"
      >
        <BookPageFlipAnimation size={140} color={themeColors.accent} />
        <Text className="text-body-sm text-text-secondary mt-3">
          Loading book...
        </Text>
        <Pressable
          onPress={handleBack}
          className="mt-6 px-5 py-3"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="book-loading-back"
        >
          <Text className="text-body text-primary font-semibold">Go back</Text>
        </Pressable>
      </View>
    );
  }

  // 2. Error
  if (bookQuery.isError) {
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
            Retry
          </Text>
        </Pressable>
        <Pressable
          onPress={handleBack}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          testID="book-back-button"
        >
          <Text className="text-text-primary text-body font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  // 3. Generation in progress
  if (needsGeneration || generateMutation.isPending) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
        testID="book-generating"
      >
        <MagicPenAnimation size={140} color={themeColors.accent} />
        {book?.emoji && <Text className="text-3xl mt-4">{book.emoji}</Text>}
        <Text className="text-h2 font-bold text-text-primary mt-3 text-center">
          {book?.title ?? 'Writing your book...'}
        </Text>
        {book?.description && (
          <Text className="text-body-sm text-text-secondary mt-2 text-center px-4">
            {book.description}
          </Text>
        )}
        <Text className="text-body-sm text-text-secondary mt-4">
          Writing your book...
        </Text>

        {genPhase === 'slow' && (
          <Text className="text-body-sm text-text-secondary mt-2 text-center">
            Taking a little longer than usual...
          </Text>
        )}

        {genPhase === 'timed_out' && (
          <View className="mt-4 items-center">
            <Text className="text-body text-text-secondary text-center mb-4">
              Couldn't finish this book right now.
            </Text>
            <Pressable
              onPress={handleRetryGeneration}
              className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
              accessibilityRole="button"
              testID="book-gen-retry"
            >
              <Text className="text-text-inverse text-body font-semibold">
                Retry
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
                Go back
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
              Go back
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
        </View>

        {/* Book info - compact header */}
        <View className="px-5 pb-3">
          <View className="flex-row items-center mb-1">
            {book?.emoji ? (
              <Text className="text-3xl me-3">{book.emoji}</Text>
            ) : null}
            <View className="flex-1">
              <Text
                className="text-h2 font-bold text-text-primary"
                numberOfLines={2}
              >
                {book?.title ?? 'Book'}
              </Text>
              {subjectName ? (
                <Text className="mt-0.5 text-body-sm text-text-secondary">
                  {subjectName}
                </Text>
              ) : null}
            </View>
          </View>

          <Text className="mt-2 text-caption text-text-secondary">
            {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
          </Text>

          {activeTopics.length > 0 ? (
            <View className="mt-2">
              <View className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                <View
                  className="h-full rounded-full bg-success"
                  style={{
                    width: `${Math.min(
                      100,
                      (doneTopics.length / activeTopics.length) * 100
                    )}%`,
                  }}
                />
              </View>
              <Text className="mt-1 text-caption text-text-secondary">
                {doneTopics.length} of {activeTopics.length} topics done
              </Text>
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
                Couldn't load your history.
              </Text>
              <Pressable
                onPress={() => void refetchSessions()}
                testID="sessions-error-retry"
                accessibilityRole="button"
                accessibilityLabel="Retry loading session history"
                className="px-3 py-1"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  Retry
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
                Couldn't load progress.
              </Text>
              <Pressable
                onPress={() => void refetchRetention()}
                testID="retention-error-retry"
                accessibilityRole="button"
                accessibilityLabel="Retry loading progress"
                className="px-3 py-1"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  Retry
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Empty state: topics generated but array is empty */}
        {topics.length === 0 && book?.topicsGenerated && !needsGeneration ? (
          <View className="px-5 py-8" testID="topics-empty-state">
            <Text className="mb-2 text-center text-h3 font-semibold text-text-primary">
              No topics yet
            </Text>
            <Text className="mb-4 text-center text-body-sm text-text-secondary">
              This book doesn't have any learning topics. Build a learning path
              to get started.
            </Text>
            <Pressable
              onPress={handleBuildLearningPath}
              className="min-h-[48px] self-center items-center justify-center rounded-button bg-primary px-5 py-3"
              testID="topics-empty-build"
              accessibilityRole="button"
              accessibilityLabel="Build a learning path"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Build learning path
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Section 2: Continue now */}
        {continueNowTopic ? (
          <View className="px-5 mb-1">
            <Text className="mb-2 text-body-sm font-semibold text-text-secondary">
              Continue now
            </Text>
            <TopicStatusRow
              state="continue-now"
              title={continueNowTopic.title}
              chapterName={continueNowTopic.chapter ?? undefined}
              onPress={() => handleTopicPress(continueNowTopic.id)}
              testID="continue-now-row"
            />
          </View>
        ) : null}

        {/* Section 3: Started */}
        {visibleStartedTopicIds.length > 0 ? (
          <View className="px-5 mb-1">
            <Text className="mb-2 text-body-sm font-semibold text-text-secondary">
              Started
            </Text>
            {(showAllStarted
              ? visibleStartedTopicIds
              : visibleStartedTopicIds.slice(0, STARTED_COLLAPSE_THRESHOLD)
            ).map((topicId) => {
              const topic = topicById.get(topicId);
              if (!topic) return null;

              return (
                <TopicStatusRow
                  key={topicId}
                  state="started"
                  title={topic.title}
                  chapterName={topic.chapter ?? undefined}
                  sessionCount={sessionCountByTopicId.get(topicId) ?? 0}
                  onPress={() => handleTopicPress(topicId)}
                  testID={`started-row-${topicId}`}
                />
              );
            })}
            {!showAllStarted &&
            visibleStartedTopicIds.length > STARTED_COLLAPSE_THRESHOLD ? (
              <Pressable
                onPress={() => setShowAllStarted(true)}
                className="items-center py-2"
                testID="started-show-more"
                accessibilityRole="button"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  Show{' '}
                  {visibleStartedTopicIds.length - STARTED_COLLAPSE_THRESHOLD}{' '}
                  more started
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Section 4: Up next */}
        {upNextTopic ? (
          <View className="px-5 mb-1">
            <Text className="mb-2 text-body-sm font-semibold text-text-secondary">
              Up next
            </Text>
            {(() => {
              const distinctChapters = new Set(
                activeTopics
                  .map((topic) => topic.chapter)
                  .filter((chapter): chapter is string => !!chapter)
              );
              const isSingleChapterBook = distinctChapters.size <= 1;

              return (
                <TopicStatusRow
                  state="up-next"
                  variant={sessionCount === 0 ? 'hero' : undefined}
                  title={upNextTopic.title}
                  chapterName={
                    isSingleChapterBook
                      ? undefined
                      : upNextTopic.chapter ?? undefined
                  }
                  onPress={() =>
                    handleTopicStart(upNextTopic.id, upNextTopic.title)
                  }
                  testID="up-next-row"
                />
              );
            })()}
          </View>
        ) : null}

        {/* Fallback: every section short-circuited but topics exist */}
        {topics.length > 0 &&
        !isBookComplete &&
        !continueNowTopic &&
        visibleStartedTopicIds.length === 0 &&
        !upNextTopic &&
        doneTopics.length === 0 &&
        laterChapters.length === 0 ? (
          <View className="px-5 mb-3" testID="all-sections-fallback">
            <View className="rounded-card bg-surface-elevated p-5">
              <Text className="mb-2 text-body font-semibold text-text-primary">
                Nothing to show yet.
              </Text>
              <Text className="mb-3 text-body-sm text-text-secondary">
                Start your first session to see your progress here.
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
                accessibilityLabel="Start first session"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  ▶ Start first session
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
              <Text className="mb-1 text-h3 font-bold text-text-primary">
                Book complete
              </Text>
              <Text className="mb-4 text-body-sm text-text-secondary">
                You've studied all {activeTopics.length} topics in this book.
                Keep them fresh with review, or move on to the next book.
              </Text>

              <Pressable
                onPress={handleStartReview}
                className="mb-2 min-h-[48px] flex-row items-center justify-center rounded-button bg-primary px-5 py-3"
                testID="book-complete-review"
                accessibilityRole="button"
                accessibilityLabel="Start spaced-repetition review"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  ▶ Start review
                </Text>
              </Pressable>

              <Pressable
                onPress={handleNextBook}
                className="items-center py-2"
                testID="book-complete-next"
                accessibilityRole="button"
                accessibilityLabel="Back to shelf to pick next book"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  Back to shelf →
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Section 5: Done */}
        {doneTopics.length > 0 ? (
          <View className="px-5 mb-1">
            <Text className="mb-2 text-body-sm font-semibold text-text-secondary">
              Done
            </Text>
            {(doneTopics.length <= DONE_COLLAPSE_THRESHOLD || showAllDone
              ? doneTopics
              : doneTopics.slice(0, DONE_COLLAPSE_THRESHOLD)
            ).map((topic) => (
              <TopicStatusRow
                key={topic.id}
                state="done"
                title={topic.title}
                chapterName={topic.chapter ?? undefined}
                onPress={() => handleTopicPress(topic.id)}
                testID={`done-row-${topic.id}`}
              />
            ))}
            {doneTopics.length > DONE_COLLAPSE_THRESHOLD && !showAllDone ? (
              <Pressable
                onPress={() => setShowAllDone(true)}
                className="items-center py-2"
                testID="done-show-all"
                accessibilityRole="button"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  Show all {doneTopics.length} done
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Section 6: Later */}
        {laterChapters.length > 0 ? (
          <View className="px-5 mb-1">
            <Text className="mb-2 text-body-sm font-semibold text-text-secondary">
              Later
            </Text>
            {laterChapters.map((group) => (
              <CollapsibleChapter
                key={group.chapter}
                title={group.chapter}
                topics={group.unstartedTopics}
                totalTopicCount={group.totalTopicCount}
                chapterState={group.chapterState}
                initiallyExpanded={autoExpandLater}
                onTopicPress={handleTopicPress}
              />
            ))}
          </View>
        ) : null}

        {/* Section 7: Past conversations */}
        {sessions.length > 0 ? (
          <View className="mb-4">
            <Text className="mb-1 px-5 text-body-sm font-semibold text-text-secondary">
              Past conversations
            </Text>
            {showChapterDividers
              ? groupedSessions.map((group) => (
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
              : sessions.map((session) => (
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
        ) : null}

        {/* Inline notes */}
        {sortedNotes.length > 0 && (
          <View className="mb-4" testID="book-notes-section">
            <Text className="mb-1 px-5 text-body-sm font-semibold text-text-secondary">
              My notes
            </Text>
            {(() => {
              let lastMonth = '';
              return sortedNotes.map((note) => {
                const month = formatMonthYear(note.updatedAt);
                const showSeparator = month !== lastMonth;
                lastMonth = month;
                return (
                  <View key={note.topicId}>
                    {showSeparator && (
                      <Text className="text-caption text-text-tertiary px-5 mt-2 mb-1">
                        {month}
                      </Text>
                    )}
                    <InlineNoteCard
                      topicTitle={topicTitleMap.get(note.topicId) ?? 'Topic'}
                      content={note.content}
                      updatedAt={note.updatedAt}
                      testID={`note-${note.topicId}`}
                    />
                  </View>
                );
              });
            })()}
          </View>
        )}
      </ScrollView>

      {/* Sticky CTA - adapts to learner state */}
      {activeTopics.length > 0 && !isReadOnly
        ? (() => {
            const hasContinue = !!continueNowTopic;
            const hasUpNext = !!upNextTopic;
            const hasStarted = visibleStartedTopicIds.length > 0;

            if (isBookComplete) {
              return null;
            }

            if (!hasContinue && !hasUpNext && !hasStarted) {
              return null;
            }

            let label: string;
            if (hasContinue) {
              label = '▶ Continue learning';
            } else if (hasUpNext) {
              const truncatedTitle =
                upNextTopic.title.length > 25
                  ? `${upNextTopic.title.slice(0, 24)}...`
                  : upNextTopic.title;
              label = `▶ Start: ${truncatedTitle}`;
            } else {
              const newestStartedId = visibleStartedTopicIds[0];
              const newestStartedTopic = newestStartedId
                ? topicById.get(newestStartedId)
                : null;
              const title = newestStartedTopic?.title ?? '';
              const truncatedTitle =
                title.length > 25 ? `${title.slice(0, 24)}...` : title;
              label = `▶ Resume: ${truncatedTitle}`;
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
                    className="mt-2 items-center py-2"
                    testID="book-build-path-link"
                    accessibilityRole="button"
                    accessibilityLabel="Build a learning path"
                  >
                    <Text className="text-body-sm text-text-secondary underline">
                      Build a learning path
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })()
        : null}
    </View>
  );
}
