import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CurriculumTopic, RetentionStatus } from '@eduagent/schemas';
import * as Sentry from '@sentry/react-native';
import { MagicPenAnimation } from '../../../../../components/common';
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
  useGenerateBookTopics,
} from '../../../../../hooks/use-books';
import {
  useBookSessions,
  type BookSession,
} from '../../../../../hooks/use-book-sessions';
import { useMoveTopic } from '../../../../../hooks/use-move-topic';
import {
  useBookNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNoteById,
} from '../../../../../hooks/use-notes';
import { useRetentionTopics } from '../../../../../hooks/use-retention';
import { useCurriculum } from '../../../../../hooks/use-curriculum';
import { useLearningResumeTarget } from '../../../../../hooks/use-progress';

import { formatApiError } from '../../../../../lib/format-api-error';
import { formatRelativeDate } from '../../../../../lib/format-relative-date';
import { formatSourceLine } from '../../../../../lib/format-note-source';
import { platformAlert } from '../../../../../lib/platform-alert';
import { useThemeColors } from '../../../../../lib/theme';
import { computeUpNextTopic } from '../../../../../lib/up-next-topic';
import {
  goBackOrReplace,
  pushLearningResumeTarget,
} from '../../../../../lib/navigation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a book-level retention status from per-topic nextReviewAt values.
 * Uses the same thresholds as services/progress.ts computeRetentionStatus:
 *   > 3 days until review = strong
 *   > 0 days = fading
 *   > -7 days = weak
 *   else = forgotten
 * Aggregation: if >30% forgotten → forgotten, >30% weak+forgotten → weak,
 * >30% fading+weak+forgotten → fading, else strong.
 */
function computeBookRetentionStatus(
  nextReviewAtValues: (string | null)[]
): RetentionStatus | null {
  if (nextReviewAtValues.length === 0) return null;
  const now = Date.now();
  const statuses = nextReviewAtValues.map((v): RetentionStatus => {
    if (!v) return 'forgotten';
    const daysUntilReview =
      (new Date(v).getTime() - now) / (1000 * 60 * 60 * 24);
    if (daysUntilReview > 3) return 'strong';
    if (daysUntilReview > 0) return 'fading';
    if (daysUntilReview > -7) return 'weak';
    return 'forgotten';
  });
  const forgottenCount = statuses.filter((s) => s === 'forgotten').length;
  const weakCount = statuses.filter((s) => s === 'weak').length;
  const fadingCount = statuses.filter((s) => s === 'fading').length;
  const n = statuses.length;
  if (forgottenCount > n * 0.3) return 'forgotten';
  if (weakCount + forgottenCount > n * 0.3) return 'weak';
  if (fadingCount + weakCount + forgottenCount > n * 0.3) return 'fading';
  return 'strong';
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
    // null chapter → "Other" per spec (Book | Topics with null chapter)
    const key = t.chapter ?? 'Other';
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
  const resumeTargetQuery = useLearningResumeTarget({ subjectId, bookId });
  const autoStart = params.autoStart;

  // --- Data queries (called unconditionally for rules-of-hooks) ---
  const bookQuery = useBookWithTopics(subjectId, bookId);
  const sessionsQuery = useBookSessions(subjectId, bookId);
  const notesQuery = useBookNotes(subjectId, bookId);
  const generateMutation = useGenerateBookTopics(subjectId, bookId);
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
      } as never);
      return;
    }
    goBackOrReplace(router, '/(app)/library' as never);
  }, [router, subjectId]);

  // --- Generation auto-trigger ---
  const [genPhase, setGenPhase] = useState<GenerationPhase>('idle');
  const alreadyPending = useRef(false);

  // --- Note add flow state ---
  const [showTopicPicker, setShowTopicPicker] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [editingNote, setEditingNote] = useState<{
    noteId: string;
    content: string;
  } | null>(null);

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

  // --- Book-level retention status (derived from retention topics) ---
  const bookRetentionStatus = useMemo((): RetentionStatus | null => {
    const retentionTopics = retentionTopicsQuery.data?.topics ?? [];
    // Only consider topics that have been studied (have a real retention card)
    const studiedTopics = retentionTopics.filter((rt) => rt.repetitions > 0);
    if (studiedTopics.length === 0) return null;
    return computeBookRetentionStatus(
      studiedTopics.map((rt) => rt.nextReviewAt)
    );
  }, [retentionTopicsQuery.data]);

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

  // --- Chapter-first topic grouping ---
  // Groups ALL active topics by chapter, with each topic annotated by its state.
  const chapterSections = useMemo(() => {
    const upNextId = upNextTopic?.id ?? null;
    const groups = groupTopicsByChapter(activeTopics);
    return groups.map((group) => {
      type TopicWithState = {
        topic: CurriculumTopic;
        state: 'started' | 'up-next' | 'done' | 'later';
        sessionCount: number;
      };
      const items: TopicWithState[] = [];
      for (const topic of group.topics) {
        if (topic.skipped) continue;
        let state: TopicWithState['state'];
        if (topic.id === upNextId) {
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
      // Sort: up-next first, then started, then later, then done
      const stateOrder = { 'up-next': 0, started: 1, later: 2, done: 3 };
      items.sort(
        (a, b) =>
          stateOrder[a.state] - stateOrder[b.state] ||
          a.topic.sortOrder - b.topic.sortOrder
      );
      return { chapter: group.chapter, items };
    });
  }, [
    activeTopics,
    upNextTopic,
    topicStudiedIds,
    inProgressTopicIds,
    sessionCountByTopicId,
  ]);
  const hasMultipleChapters = chapterSections.length > 1;

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
          ...(topic?.chapter ? { chapter: topic.chapter } : {}),
        },
      } as never);
    },
    [router, subjectId, topicById]
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
    if (resumeTargetQuery.data) {
      pushLearningResumeTarget(router, resumeTargetQuery.data);
      return;
    }

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
    resumeTargetQuery.data,
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
        }
      );
    },
    [selectedTopicId, createNote]
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
        }
      );
    },
    [editingNote, updateNote]
  );

  const handleNoteEditCancel = useCallback(() => {
    setEditingNote(null);
  }, []);

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
    [notes, deleteNoteById]
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

  // 1. Loading — show hero immediately from navigation params, sections shimmer
  if (bookQuery.isLoading) {
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

          {/* Notes section shimmer */}
          <View className="mb-4">
            <Text className="mb-2 px-5 text-body-sm font-semibold text-text-secondary tracking-wide">
              Your Notes
            </Text>
            <ShimmerSkeleton testID="book-notes-loading">
              <View className="px-5">
                {[0, 1].map((i) => (
                  <View
                    key={i}
                    style={{
                      height: 56,
                      borderRadius: 8,
                      marginBottom: 8,
                      backgroundColor: themeColors.border,
                    }}
                  />
                ))}
              </View>
            </ShimmerSkeleton>
          </View>

          {/* Topics section shimmer */}
          <View className="px-5 mb-4">
            <Text className="mb-2 text-body-sm font-semibold text-text-secondary">
              Topics
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
        <MagicPenAnimation size={100} color={themeColors.accent} />
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

        {/* Book hero */}
        <View className="px-5 pb-4" testID="book-hero">
          {book?.emoji ? (
            <Text style={{ fontSize: 56, lineHeight: 68 }}>{book.emoji}</Text>
          ) : null}
          <Text
            className="text-h2 font-bold text-text-primary mt-2"
            numberOfLines={3}
            testID="book-hero-title"
          >
            {book?.title ?? 'Book'}
          </Text>
          {book?.description ? (
            <Text
              className="mt-1 text-body-sm text-text-secondary"
              numberOfLines={3}
            >
              {book.description}
            </Text>
          ) : null}
          {bookRetentionStatus !== null ? (
            <View className="mt-2">
              <RetentionPill
                status={bookRetentionStatus}
                testID="book-retention-pill"
              />
            </View>
          ) : null}

          {activeTopics.length > 0 ? (
            <View className="mt-3">
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

        {/* YOUR NOTES section */}
        <View className="mb-4" testID="book-notes-section">
          <Text className="mb-2 px-5 text-body-sm font-semibold text-text-secondary tracking-wide">
            Your Notes
          </Text>
          {notesQuery.isLoading ? (
            <ShimmerSkeleton testID="book-notes-loading">
              <View className="px-5">
                {[0, 1].map((i) => (
                  <View
                    key={i}
                    style={{
                      height: 56,
                      borderRadius: 8,
                      marginBottom: 8,
                      backgroundColor: themeColors.border,
                    }}
                  />
                ))}
              </View>
            </ShimmerSkeleton>
          ) : (
            <>
              {sortedNotes.map((note) => {
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
                return (
                  <InlineNoteCard
                    key={note.id}
                    noteId={note.id}
                    topicTitle={topicTitleMap.get(note.topicId) ?? 'Topic'}
                    content={note.content}
                    sourceLine={formatSourceLine(note)}
                    updatedAt={note.updatedAt}
                    onLongPress={handleNoteLongPress}
                    testID={`note-${note.id}`}
                  />
                );
              })}
              {showNoteInput && (
                <View className="px-5 mb-2">
                  <NoteInput
                    saving={createNote.isPending}
                    onSave={handleNoteSave}
                    onCancel={handleNoteInputCancel}
                  />
                </View>
              )}
              <Pressable
                onPress={handleNoteAddPress}
                className="mx-5 mt-1 flex-row items-center py-2"
                testID="book-add-note"
                accessibilityRole="button"
                accessibilityLabel={
                  sortedNotes.length === 0
                    ? 'Add your first note'
                    : 'Add a note'
                }
              >
                <Ionicons
                  name="add-circle-outline"
                  size={18}
                  color={themeColors.primary}
                />
                <Text className="ms-1.5 text-body-sm font-semibold text-primary">
                  {sortedNotes.length === 0
                    ? '+ Add your first note'
                    : '+ Add a note'}
                </Text>
              </Pressable>
            </>
          )}
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

        {/* [BUG-895] "Continue now" section removed — the sticky CTA at the
            bottom of the screen already exposes the same action and now
            includes the topic title (▶ Continue: {title}). Keeping both
            duplicated the affordance and bloated decision time. */}

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
                    sessionCount={state === 'started' ? count : undefined}
                    onPress={
                      state === 'up-next'
                        ? () => handleTopicStart(topic.id, topic.title)
                        : () => handleTopicPress(topic.id)
                    }
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
              Past conversations
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
            sessionsQuery.isLoading ? (
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
                No conversations yet
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
              // [BUG-895] Surface the topic title in the sticky CTA so the
              // user knows exactly which topic they're resuming. Previously
              // this was a generic "Continue learning" alongside an in-list
              // "Continue now" section that named the topic — which made the
              // page show two affordances for the same action.
              const continueTitle = continueNowTopic?.title ?? '';
              const truncatedContinueTitle =
                continueTitle.length > 25
                  ? `${continueTitle.slice(0, 24)}...`
                  : continueTitle;
              label = truncatedContinueTitle
                ? `▶ Continue: ${truncatedContinueTitle}`
                : '▶ Continue learning';
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
