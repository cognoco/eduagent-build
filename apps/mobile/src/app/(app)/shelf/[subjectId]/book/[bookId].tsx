import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CurriculumTopic } from '@eduagent/schemas';
import { PenWritingAnimation } from '../../../../../components/common';
import { SuggestionCard } from '../../../../../components/library/SuggestionCard';
import { SessionRow } from '../../../../../components/library/SessionRow';
import { ChapterDivider } from '../../../../../components/library/ChapterDivider';
import {
  useBookWithTopics,
  useGenerateBookTopics,
} from '../../../../../hooks/use-books';
import {
  useBookSessions,
  type BookSession,
} from '../../../../../hooks/use-book-sessions';
import { useTopicSuggestions } from '../../../../../hooks/use-topic-suggestions';
import { useBookNotes } from '../../../../../hooks/use-notes';
import { useSubjects } from '../../../../../hooks/use-subjects';
import { formatApiError } from '../../../../../lib/format-api-error';
import { useThemeColors } from '../../../../../lib/theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  return `${years}y`;
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
  const autoStart = params.autoStart;

  // --- Data queries (called unconditionally for rules-of-hooks) ---
  const bookQuery = useBookWithTopics(subjectId, bookId);
  const sessionsQuery = useBookSessions(subjectId, bookId);
  const suggestionsQuery = useTopicSuggestions(subjectId, bookId);
  const notesQuery = useBookNotes(subjectId, bookId);
  const generateMutation = useGenerateBookTopics(subjectId, bookId);
  const subjectsQuery = useSubjects();
  const subjectName = subjectsQuery.data?.find((s) => s.id === subjectId)?.name;

  // --- Generation auto-trigger ---
  const [genPhase, setGenPhase] = useState<GenerationPhase>('idle');
  const alreadyPending = useRef(false);

  const book = bookQuery.data?.book ?? null;
  const topics = bookQuery.data?.topics ?? [];
  const completedTopicCount = bookQuery.data?.completedTopicCount ?? 0;

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
        Alert.alert("Couldn't build this book", formatApiError(error), [
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

  const handleRetryGeneration = () => {
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
        for (const t of retryTimersRef.current) clearTimeout(t);
        retryTimersRef.current = [];
        void bookQuery.refetch();
      },
      onError: (error) => {
        setGenPhase('timed_out');
        alreadyPending.current = false;
        for (const t of retryTimersRef.current) clearTimeout(t);
        retryTimersRef.current = [];
        Alert.alert('Generation failed', formatApiError(error));
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
  const notes = notesQuery.data?.notes ?? [];
  const noteTopicIds = useMemo(
    () => new Set(notes.map((n) => n.topicId)),
    [notes]
  );
  // --- Sessions data ---
  const sessions = sessionsQuery.data ?? [];
  const sessionCount = sessions.length;
  const noteCount = notes.length;

  // --- Completed topic IDs (derived from sessions) ---
  const completedTopicIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessions) {
      if (s.topicId) ids.add(s.topicId);
    }
    return ids;
  }, [sessions]);

  // --- Suggestion cards: combine API suggestions + pre-generated uncovered topics, max 2 ---
  const suggestionCards = useMemo(() => {
    const apiSuggestions: Array<{
      id: string;
      title: string;
      type: 'suggestion';
    }> = [];
    if (Array.isArray(suggestionsQuery.data)) {
      for (const s of suggestionsQuery.data as Array<{
        id: string;
        title: string;
      }>) {
        apiSuggestions.push({ id: s.id, title: s.title, type: 'suggestion' });
      }
    }

    const preGenerated: Array<{
      id: string;
      title: string;
      type: 'topic';
    }> = topics
      .filter(
        (t: CurriculumTopic) => !completedTopicIds.has(t.id) && !t.skipped
      )
      .slice(0, 2)
      .map((t: CurriculumTopic) => ({
        id: t.id,
        title: t.title,
        type: 'topic' as const,
      }));

    // API suggestions first, then pre-generated, max 2 total
    const combined = [...apiSuggestions, ...preGenerated].slice(0, 2);
    return combined;
  }, [suggestionsQuery.data, topics, completedTopicIds]);

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
        params: { sessionId: session.id },
      } as never);
    },
    [router]
  );

  // --- Start learning: navigate to session with first suggestion or first uncovered topic ---
  const handleStartLearning = useCallback(() => {
    // Try first suggestion card (which may be a pre-generated topic)
    if (suggestionCards.length > 0) {
      const first = suggestionCards[0]!;
      if (first.type === 'topic') {
        router.push({
          pathname: '/(app)/session',
          params: { mode: 'learning', subjectId, topicId: first.id },
        } as never);
        return;
      }
      // API-generated suggestion — pass title as rawInput for contextual opening
      router.push({
        pathname: '/(app)/session',
        params: { mode: 'learning', subjectId, rawInput: first.title },
      } as never);
      return;
    }
    // Fallback: find first uncovered topic
    const sorted = [...topics].sort(
      (a: CurriculumTopic, b: CurriculumTopic) => a.sortOrder - b.sortOrder
    );
    const next = sorted.find(
      (t: CurriculumTopic) => !completedTopicIds.has(t.id) && !t.skipped
    );
    if (next) {
      router.push({
        pathname: '/(app)/session',
        params: { mode: 'learning', subjectId, topicId: next.id },
      } as never);
      return;
    }
    // All topics covered — start a new session on the first topic
    if (sorted.length > 0) {
      router.push({
        pathname: '/(app)/session',
        params: { mode: 'learning', subjectId, topicId: sorted[0]!.id },
      } as never);
    }
  }, [suggestionCards, topics, completedTopicIds, router, subjectId]);

  // --- Auto-start session when navigated with autoStart=true (M-12) ---
  const autoStartTriggered = useRef(false);
  useEffect(() => {
    if (
      autoStart === 'true' &&
      !autoStartTriggered.current &&
      topics.length > 0
    ) {
      autoStartTriggered.current = true;
      handleStartLearning();
    }
  }, [autoStart, topics, handleStartLearning]);

  // --- Suggestion press ---
  const handleSuggestionPress = useCallback(
    (card: { id: string; title: string; type: string }) => {
      if (card.type === 'topic') {
        router.push({
          pathname: '/(app)/session',
          params: { mode: 'learning', subjectId, topicId: card.id },
        } as never);
      } else {
        // For API-generated suggestions, pass title as rawInput for contextual session
        router.push({
          pathname: '/(app)/session',
          params: { mode: 'learning', subjectId, rawInput: card.title },
        } as never);
      }
    },
    [router, subjectId]
  );

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
          onPress={() => router.back()}
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
        <ActivityIndicator size="large" color={themeColors.accent} />
        <Text className="text-body-sm text-text-secondary mt-3">
          Loading book...
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 px-5 py-3"
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
          testID="book-retry-button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Retry
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
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
        <PenWritingAnimation size={100} color={themeColors.accent} />
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
              testID="book-gen-retry"
            >
              <Text className="text-text-inverse text-body font-semibold">
                Retry
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              className="px-5 py-3"
              testID="book-gen-back"
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
            onPress={() => router.back()}
            className="mt-6 px-5 py-3"
            accessibilityLabel="Go back"
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
            onPress={() => router.back()}
            className="p-2 -ms-2 me-2"
            accessibilityLabel="Back"
            testID="book-back"
          >
            <Ionicons name="arrow-back" size={24} color={themeColors.accent} />
          </Pressable>
        </View>

        {/* Book info */}
        <View className="px-5 pb-4">
          <View className="flex-row items-center mb-1">
            {book?.emoji && <Text className="text-3xl me-3">{book.emoji}</Text>}
            <View className="flex-1">
              <Text
                className="text-h2 font-bold text-text-primary"
                numberOfLines={2}
              >
                {book?.title ?? 'Book'}
              </Text>
              {subjectName && (
                <Text className="text-body-sm text-text-secondary mt-0.5">
                  {subjectName}
                </Text>
              )}
            </View>
          </View>

          {/* Stats row */}
          <View className="flex-row items-center mt-3 gap-4">
            <View className="flex-row items-center">
              <Ionicons
                name="chatbubbles-outline"
                size={14}
                color={themeColors.textSecondary}
              />
              <Text className="text-caption text-text-secondary ms-1">
                {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
              </Text>
            </View>
            {noteCount > 0 && (
              <View className="flex-row items-center">
                <Ionicons
                  name="document-text-outline"
                  size={14}
                  color={themeColors.textSecondary}
                />
                <Text className="text-caption text-text-secondary ms-1">
                  {noteCount} {noteCount === 1 ? 'note' : 'notes'}
                </Text>
              </View>
            )}
            {completedTopicCount > 0 && topics.length > 0 && (
              <Text className="text-caption text-text-secondary">
                {completedTopicCount}/{topics.length} topics
              </Text>
            )}
          </View>
        </View>

        {/* Study next suggestions — max 2 cards */}
        {suggestionCards.length > 0 && (
          <View className="px-5 mb-4">
            <Text className="text-body-sm font-semibold text-text-secondary mb-2 uppercase tracking-wide">
              Study next
            </Text>
            <View className="flex-row gap-3">
              {suggestionCards.map((card) => (
                <SuggestionCard
                  key={card.id}
                  title={card.title}
                  onPress={() => handleSuggestionPress(card)}
                  testID={`suggestion-${card.id}`}
                />
              ))}
            </View>
          </View>
        )}

        {/* Session list */}
        {sessions.length > 0 && (
          <View className="mb-4">
            <Text className="text-body-sm font-semibold text-text-secondary mb-1 px-5 uppercase tracking-wide">
              Past sessions
            </Text>
            {showChapterDividers
              ? groupedSessions.map((group) => (
                  <View key={group.chapter}>
                    <ChapterDivider name={group.chapter} />
                    {group.sessions.map((s) => (
                      <SessionRow
                        key={s.id}
                        title={s.topicTitle}
                        relativeDate={formatRelativeDate(s.createdAt)}
                        hasNote={
                          s.topicId != null && noteTopicIds.has(s.topicId)
                        }
                        onPress={() => handleSessionPress(s)}
                        testID={`session-${s.id}`}
                      />
                    ))}
                  </View>
                ))
              : sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    title={s.topicTitle}
                    relativeDate={formatRelativeDate(s.createdAt)}
                    hasNote={s.topicId != null && noteTopicIds.has(s.topicId)}
                    onPress={() => handleSessionPress(s)}
                    testID={`session-${s.id}`}
                  />
                ))}
          </View>
        )}

        {/* [BUG-28] All topics completed — distinct from "no sessions" */}
        {completedTopicCount > 0 &&
          completedTopicCount >= topics.length &&
          topics.length > 0 &&
          !needsGeneration && (
            <View
              className="px-5 py-6 items-center"
              testID="book-all-completed"
            >
              <Ionicons
                name="checkmark-circle"
                size={40}
                color={themeColors.primary}
              />
              <Text className="text-body text-text-primary text-center mt-3 mb-1 font-semibold">
                You finished this book!
              </Text>
              <Text className="text-body-sm text-text-secondary text-center">
                All {topics.length} topics covered. Review any topic to
                strengthen your understanding.
              </Text>
            </View>
          )}

        {/* Empty state — no sessions yet (only when no topics completed) */}
        {sessions.length === 0 &&
          !needsGeneration &&
          topics.length > 0 &&
          completedTopicCount === 0 && (
            <View
              className="px-5 py-8 items-center"
              testID="book-empty-sessions"
            >
              <Ionicons
                name="book-outline"
                size={40}
                color={themeColors.textSecondary}
              />
              <Text className="text-body text-text-secondary text-center mt-3 mb-1">
                No sessions yet
              </Text>
              <Text className="text-body-sm text-text-secondary text-center mb-4">
                Pick a topic above to start learning
              </Text>
            </View>
          )}

        {/* Empty topics state */}
        {topics.length === 0 && !needsGeneration && (
          <View className="px-5 py-8 items-center" testID="book-empty-topics">
            <Text className="text-body text-text-secondary text-center mb-2">
              No topics in this book yet.
            </Text>
            <Pressable
              onPress={() => router.back()}
              className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
              testID="book-empty-back"
            >
              <Text className="text-text-primary text-body font-semibold">
                Go back
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Floating "Start learning" button — hidden in read-only mode */}
      {topics.length > 0 && !isReadOnly && (
        <View
          className="absolute bottom-0 left-0 right-0 px-5 bg-background border-t border-border"
          style={{ paddingBottom: Math.max(insets.bottom, 16), paddingTop: 12 }}
        >
          <Pressable
            onPress={handleStartLearning}
            className="bg-primary rounded-button px-5 py-4 flex-row items-center justify-center min-h-[48px]"
            testID="book-start-learning"
            accessibilityLabel={
              completedTopicCount >= topics.length && topics.length > 0
                ? 'Review a topic'
                : 'Start learning'
            }
          >
            <Ionicons
              name={
                completedTopicCount >= topics.length && topics.length > 0
                  ? 'refresh-outline'
                  : 'add-circle-outline'
              }
              size={20}
              color={themeColors.textInverse}
              style={{ marginRight: 8 }}
            />
            <Text className="text-body font-semibold text-text-inverse">
              {completedTopicCount >= topics.length && topics.length > 0
                ? 'Review a topic'
                : 'Start learning'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
