import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CurriculumTopic } from '@eduagent/schemas';
import {
  BookPageFlipAnimation,
  PenWritingAnimation,
} from '../../../../../components/common';
import { CollapsibleChapter } from '../../../../../components/library/CollapsibleChapter';
import { NoteDisplay } from '../../../../../components/library/NoteDisplay';
import { NoteInput } from '../../../../../components/library/NoteInput';
import {
  useBookWithTopics,
  useGenerateBookTopics,
} from '../../../../../hooks/use-books';
import {
  useBookNotes,
  useUpsertNote,
  useDeleteNote,
} from '../../../../../hooks/use-notes';
import { formatApiError } from '../../../../../lib/format-api-error';
import { useThemeColors } from '../../../../../lib/theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupTopicsByChapter(
  topics: CurriculumTopic[]
): Map<string, CurriculumTopic[]> {
  const map = new Map<string, CurriculumTopic[]>();
  for (const topic of topics) {
    const chapter = topic.chapter ?? 'Topics';
    const existing = map.get(chapter);
    if (existing) {
      existing.push(topic);
    } else {
      map.set(chapter, [topic]);
    }
  }
  return map;
}

function findSuggestedNext(
  topics: CurriculumTopic[],
  completedIds: Set<string>
): CurriculumTopic | undefined {
  const sorted = [...topics].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.find((t) => !t.skipped && !completedIds.has(t.id));
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
  }>();
  const subjectId = params.subjectId;
  const bookId = params.bookId;

  // --- Data queries (called unconditionally for rules-of-hooks) ---
  const bookQuery = useBookWithTopics(subjectId, bookId);
  const notesQuery = useBookNotes(subjectId, bookId);
  const generateMutation = useGenerateBookTopics(subjectId, bookId);
  const upsertMutation = useUpsertNote(subjectId, bookId);
  const deleteMutation = useDeleteNote(subjectId, bookId);

  // --- Generation auto-trigger ---
  const [genPhase, setGenPhase] = useState<GenerationPhase>('idle');
  const alreadyPending = useRef(false);

  const book = bookQuery.data?.book ?? null;
  const topics = bookQuery.data?.topics ?? [];
  const status = bookQuery.data?.status ?? 'NOT_STARTED';
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
        setGenPhase('idle');
        alreadyPending.current = false;
        void bookQuery.refetch();
      },
      onError: () => {
        setGenPhase('timed_out');
        alreadyPending.current = false;
      },
    });

    return () => {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    };
    // Only trigger on needsGeneration change; mutation object is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsGeneration]);

  const handleRetryGeneration = () => {
    alreadyPending.current = false;
    setGenPhase('idle');

    const slowTimer = setTimeout(() => setGenPhase('slow'), SLOW_THRESHOLD_MS);
    const timeoutTimer = setTimeout(
      () => setGenPhase('timed_out'),
      TIMEOUT_THRESHOLD_MS
    );

    generateMutation.mutate(undefined, {
      onSuccess: () => {
        setGenPhase('idle');
        alreadyPending.current = false;
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);
        void bookQuery.refetch();
      },
      onError: (error) => {
        setGenPhase('timed_out');
        alreadyPending.current = false;
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);
        Alert.alert('Generation failed', formatApiError(error));
      },
    });
  };

  // --- Notes ---
  const notes = notesQuery.data?.notes ?? [];
  const noteTopicIds = useMemo(
    () => new Set(notes.map((n) => n.topicId)),
    [notes]
  );
  const noteByTopicId = useMemo(() => {
    const map = new Map<string, { content: string; updatedAt: string }>();
    for (const n of notes) {
      map.set(n.topicId, { content: n.content, updatedAt: n.updatedAt });
    }
    return map;
  }, [notes]);

  // --- Inline note editing ---
  const [expandedNoteTopicId, setExpandedNoteTopicId] = useState<string | null>(
    null
  );
  const [editingNoteTopicId, setEditingNoteTopicId] = useState<string | null>(
    null
  );

  const handleNotePress = useCallback((topicId: string) => {
    setExpandedNoteTopicId((prev) => (prev === topicId ? null : topicId));
    setEditingNoteTopicId(null);
  }, []);

  const handleNoteSave = useCallback(
    (topicId: string, content: string) => {
      upsertMutation.mutate(
        { topicId, content },
        {
          onSuccess: () => {
            setEditingNoteTopicId(null);
            setExpandedNoteTopicId(null);
          },
          onError: (error) => {
            Alert.alert('Could not save note', formatApiError(error));
          },
        }
      );
    },
    [upsertMutation]
  );

  const handleNoteDelete = useCallback(
    (topicId: string) => {
      Alert.alert('Delete note?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMutation.mutate(topicId, {
              onSuccess: () => {
                setExpandedNoteTopicId(null);
                setEditingNoteTopicId(null);
              },
              onError: (error) => {
                Alert.alert('Could not delete note', formatApiError(error));
              },
            });
          },
        },
      ]);
    },
    [deleteMutation]
  );

  // --- Derived data for main view ---
  const completedIds = useMemo(() => {
    const sorted = [...topics].sort((a, b) => a.sortOrder - b.sortOrder);
    const ids = new Set<string>();
    for (let i = 0; i < completedTopicCount && i < sorted.length; i++) {
      ids.add(sorted[i]!.id);
    }
    return ids;
  }, [topics, completedTopicCount]);

  const suggestedNext = useMemo(
    () => findSuggestedNext(topics, completedIds),
    [topics, completedIds]
  );

  const chapters = useMemo(() => groupTopicsByChapter(topics), [topics]);

  // Figure out which chapter should start expanded (first incomplete chapter)
  const firstIncompleteChapter = useMemo(() => {
    for (const [chapterTitle, chapterTopics] of chapters) {
      const chapterCompleted = chapterTopics.filter((t) =>
        completedIds.has(t.id)
      ).length;
      if (chapterCompleted < chapterTopics.length) {
        return chapterTitle;
      }
    }
    return null;
  }, [chapters, completedIds]);

  // --- Topic press: navigate to session ---
  const handleTopicPress = useCallback(
    (topicId: string, _topicName: string) => {
      router.push({
        pathname: '/(learner)/session',
        params: { mode: 'learning', subjectId, topicId },
      } as never);
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
        <BookPageFlipAnimation size={80} color={themeColors.accent} />
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

  // 4. Main view (topics loaded)
  const totalTopics = topics.length;
  const progressRatio = totalTopics > 0 ? completedTopicCount / totalTopics : 0;

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
          {book?.emoji && <Text className="text-4xl mb-2">{book.emoji}</Text>}
          <Text className="text-h1 font-bold text-text-primary mb-1">
            {book?.title ?? 'Book'}
          </Text>

          {/* Progress bar */}
          {totalTopics > 0 && (
            <View className="mt-3">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-caption text-text-secondary">
                  {completedTopicCount}/{totalTopics} topics completed
                </Text>
              </View>
              <View className="h-2 bg-surface-elevated rounded-full overflow-hidden">
                <View
                  className="h-2 bg-primary rounded-full"
                  style={{ width: `${Math.round(progressRatio * 100)}%` }}
                />
              </View>
            </View>
          )}
        </View>

        {/* Completion celebration */}
        {status === 'COMPLETED' && (
          <View
            className="mx-5 mb-4 bg-success/10 rounded-card px-4 py-3"
            testID="book-completed-banner"
          >
            <Text className="text-body font-semibold text-success text-center">
              You've covered everything here!
            </Text>
          </View>
        )}

        {/* Continue CTA */}
        {suggestedNext && status !== 'COMPLETED' && (
          <View className="px-5 mb-4">
            <Pressable
              onPress={() =>
                handleTopicPress(suggestedNext.id, suggestedNext.title)
              }
              className="bg-primary rounded-button px-5 py-4 flex-row items-center justify-center min-h-[48px]"
              testID="book-continue-cta"
              accessibilityLabel={`Continue: ${suggestedNext.title}`}
            >
              <Ionicons
                name="play-circle"
                size={20}
                color={themeColors.textInverse}
                style={{ marginRight: 8 }}
              />
              <Text
                className="text-body font-semibold text-text-inverse flex-1"
                numberOfLines={1}
              >
                Continue: {suggestedNext.title}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Chapters */}
        <View className="px-5">
          {[...chapters.entries()].map(([chapterTitle, chapterTopics]) => {
            const chapterCompleted = chapterTopics.filter((t) =>
              completedIds.has(t.id)
            ).length;
            return (
              <CollapsibleChapter
                key={chapterTitle}
                title={chapterTitle}
                topics={chapterTopics}
                completedCount={chapterCompleted}
                initiallyExpanded={chapterTitle === firstIncompleteChapter}
                suggestedNextId={suggestedNext?.id}
                onTopicPress={handleTopicPress}
                noteTopicIds={noteTopicIds}
                onNotePress={handleNotePress}
              />
            );
          })}
        </View>

        {/* Inline note panel */}
        {expandedNoteTopicId && (
          <View className="px-5 mt-2 mb-4" testID="note-panel">
            {editingNoteTopicId === expandedNoteTopicId ? (
              <NoteInput
                initialValue={
                  noteByTopicId.get(expandedNoteTopicId)?.content ?? ''
                }
                saving={upsertMutation.isPending}
                onSave={(content) =>
                  handleNoteSave(expandedNoteTopicId, content)
                }
                onCancel={() => setEditingNoteTopicId(null)}
              />
            ) : noteByTopicId.has(expandedNoteTopicId) ? (
              <NoteDisplay
                content={noteByTopicId.get(expandedNoteTopicId)!.content}
                onEdit={() => setEditingNoteTopicId(expandedNoteTopicId)}
                onDelete={() => handleNoteDelete(expandedNoteTopicId)}
              />
            ) : (
              <NoteInput
                saving={upsertMutation.isPending}
                onSave={(content) =>
                  handleNoteSave(expandedNoteTopicId, content)
                }
                onCancel={() => setExpandedNoteTopicId(null)}
              />
            )}
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
    </View>
  );
}
