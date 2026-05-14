import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Bookmark, RetentionStatus } from '@eduagent/schemas';
import {
  useTopicProgress,
  useActiveSessionForTopic,
  useResolveTopicSubject,
  useLearningResumeTarget,
} from '../../../hooks/use-progress';
import { useTopicRetention } from '../../../hooks/use-retention';
import {
  useTopicNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNoteById,
} from '../../../hooks/use-notes';
import { useTopicSessions } from '../../../hooks/use-topic-sessions';
import { useBookmarks } from '../../../hooks/use-bookmarks';
import { useThemeColors } from '../../../lib/theme';
import { formatSourceLine } from '../../../lib/format-note-source';
import { deriveRetentionStatus } from '../../../lib/retention-utils';
import {
  goBackOrReplace,
  pushLearningResumeTarget,
} from '../../../lib/navigation';
import { ErrorFallback } from '../../../components/common';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noop() {
  // intentional no-op for disabled button
}

function formatLastStudiedText(
  lastReviewedAt: string | null | undefined,
): string {
  if (!lastReviewedAt) return 'Never studied';
  const date = new Date(lastReviewedAt);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Last studied today';
  if (diffDays === 1) return 'Last studied yesterday';
  if (diffDays < 7) return `Last studied ${diffDays} days ago`;
  if (diffDays < 14) return 'Last studied last week';
  if (diffDays < 30)
    return `Last studied ${Math.floor(diffDays / 7)} weeks ago`;
  return `Last studied ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}`;
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

function formatSessionDate(createdAt: string): string {
  const date = new Date(createdAt);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSessionsSummary(
  sessions: { durationSeconds: number | null }[] | undefined,
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
  const sessionLabel = sessions.length === 1 ? 'session' : 'sessions';
  return `${sessions.length} ${sessionLabel} · ${totalMinutes} min total`;
}

function formatBookmarkSourceLine(bookmark: Bookmark): string {
  return `From chat · ${formatSessionDate(bookmark.createdAt)}`;
}

// ---------------------------------------------------------------------------
// StudyCTA derivation
// ---------------------------------------------------------------------------

function deriveStudyCTA(
  completionStatus: string | undefined,
  retentionStatus: RetentionStatus,
): { label: string; variant: 'primary' | 'outline' } {
  if (!completionStatus || completionStatus === 'not_started') {
    return { label: 'Start studying', variant: 'primary' };
  }
  if (
    completionStatus === 'completed' ||
    completionStatus === 'verified' ||
    completionStatus === 'stable'
  ) {
    if (retentionStatus === 'strong') {
      return { label: 'Practice again', variant: 'outline' };
    }
  }
  return { label: 'Review this topic', variant: 'primary' };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TopicDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    subjectId: paramSubjectId,
    bookId: paramBookId,
    topicId,
    chapter: paramChapter,
  } = useLocalSearchParams<{
    subjectId: string;
    bookId?: string;
    topicId: string;
    chapter: string;
  }>();

  // [F-009] Resolve subjectId when deep-linked with topicId only
  const needsResolve = !paramSubjectId && !!topicId;
  const { data: resolved, isLoading: resolveLoading } = useResolveTopicSubject(
    needsResolve ? topicId : undefined,
  );
  const subjectId = paramSubjectId || resolved?.subjectId;
  const topicBackFallback =
    subjectId && paramBookId
      ? ({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: { subjectId, bookId: paramBookId },
        } as const)
      : ('/(app)/library' as const);

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

  // Library v3: notes and sessions
  const { data: notesData, isLoading: notesLoading } = useTopicNotes(
    subjectId,
    topicId,
  );
  const { data: topicSessions, isLoading: sessionsLoading } = useTopicSessions(
    subjectId,
    topicId,
  );
  const bookmarksQuery = useBookmarks({
    subjectId,
    topicId,
    limit: 50,
    enabled: !!subjectId && !!topicId,
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

  // [H9] Timeout escape for the deep-link resolve spinner
  const [resolveTimedOut, setResolveTimedOut] = useState(false);
  const isResolveSpinning = !!(needsResolve && resolveLoading);
  useEffect(() => {
    if (!isResolveSpinning) {
      setResolveTimedOut(false);
      return;
    }
    const t = setTimeout(() => setResolveTimedOut(true), 15_000);
    return () => clearTimeout(t);
  }, [isResolveSpinning]);

  const isCriticalLoading = progressLoading || retentionLoading;
  const retentionStatus = deriveRetentionStatus(retentionCard);
  const topicName = topicProgress?.title ?? '';

  const lastStudiedText = formatLastStudiedText(
    retentionCard?.lastReviewedAt ??
      getMostRecentSessionCreatedAt(topicSessions) ??
      null,
  );
  const sessionsSummary = formatSessionsSummary(topicSessions);
  const topicBookmarks = useMemo(
    () =>
      bookmarksQuery.data?.pages.flatMap((page) => page.bookmarks ?? []) ?? [],
    [bookmarksQuery.data],
  );

  const studyCTA = useMemo(
    () => deriveStudyCTA(topicProgress?.completionStatus, retentionStatus),
    [topicProgress?.completionStatus, retentionStatus],
  );

  const handleStudyPress = useMemo(() => {
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
    if (!topicId) return;
    createNote(
      { topicId, content },
      { onSuccess: () => setNoteInputMode(null) },
    );
  };

  const handleNoteUpdate = (content: string) => {
    if (typeof noteInputMode !== 'string' || noteInputMode === 'new') return;
    updateNote(
      { noteId: noteInputMode, content },
      { onSuccess: () => setNoteInputMode(null) },
    );
  };

  const handleNoteLongPress = (noteId: string) => {
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
            platformAlert('Could not delete note', formatApiError(err));
          },
        }),
    });
  };

  const handleSessionPress = (sessionId: string) => {
    router.push({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId,
        ...(subjectId ? { subjectId } : {}),
        ...(topicId ? { topicId } : {}),
        ...(paramBookId ? { bookId: paramBookId } : {}),
      },
    } as Href);
  };

  // ---------------------------------------------------------------------------
  // Guard: deep-link resolve timeout
  // ---------------------------------------------------------------------------

  if (needsResolve && resolveLoading) {
    if (resolveTimedOut) {
      return (
        <ErrorFallback
          variant="centered"
          title="Taking too long to open this topic"
          message="Check your connection and try again."
          primaryAction={{
            label: 'Retry',
            onPress: () => setResolveTimedOut(false),
            testID: 'topic-resolve-timeout-retry',
          }}
          secondaryAction={{
            label: 'Go to Library',
            onPress: () => goBackOrReplace(router, topicBackFallback),
            testID: 'topic-resolve-timeout-library',
          }}
          testID="topic-resolve-timeout"
        />
      );
    }
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!subjectId || !topicId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          Topic not found
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          This topic could not be opened. Please go back and try again.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, topicBackFallback)}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="topic-detail-missing-params-back"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Go back
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
          We couldn't load this topic
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          Please try again, or go back to your library.
        </Text>
        <Pressable
          onPress={() => {
            void refetchProgress();
            void refetchRetention();
          }}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mb-3"
          accessibilityRole="button"
          accessibilityLabel="Retry loading topic"
          testID="topic-detail-retry"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Retry
          </Text>
        </Pressable>
        <Pressable
          onPress={() => goBackOrReplace(router, topicBackFallback)}
          className="bg-surface rounded-button px-6 py-3 min-h-[48px] items-center justify-center mb-3"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="topic-detail-go-back"
        >
          <Text className="text-body font-semibold text-text-primary">
            Go back
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(app)')}
          className="py-2 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go home"
          testID="topic-detail-go-home"
        >
          <Text className="text-body-sm text-primary">Go Home</Text>
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
          onPress={() => goBackOrReplace(router, topicBackFallback)}
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          testID="topic-detail-back"
          accessibilityLabel="Go back"
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
            <ActivityIndicator size="large" color={colors.muted} />
            <Text className="text-text-secondary mt-2">Loading topic...</Text>
          </View>
          {/* CTA visible but disabled while data loads */}
          <StudyCTA
            label="Loading…"
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
            Topic not found
          </Text>
          <Text className="text-body text-text-secondary text-center">
            This topic may have been removed from your curriculum.
          </Text>
          <Pressable
            onPress={() => goBackOrReplace(router, topicBackFallback)}
            className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mt-6"
            testID="topic-detail-empty-back"
            accessibilityRole="button"
            accessibilityLabel="Back to previous screen"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Go back
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
              name={topicProgress.title}
              chapter={paramChapter ?? null}
              retentionStatus={topicProgress.retentionStatus ?? null}
              daysSinceLastReview={topicProgress.daysSinceLastReview}
              lastStudiedText={lastStudiedText}
            />

            {/* YOUR NOTES section */}
            <View className="mt-4 mb-2">
              <Text className="text-body-sm font-semibold text-text-secondary tracking-wide px-5 mb-2">
                Your Notes
              </Text>

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
                      sourceLine={formatSourceLine(note)}
                      updatedAt={note.updatedAt}
                      onLongPress={handleNoteLongPress}
                      onSourcePress={
                        sourceSessionId
                          ? () => handleSessionPress(sourceSessionId)
                          : undefined
                      }
                    />
                  );
                })
              ) : null}

              {/* Note input (new or edit) */}
              {noteInputMode !== null ? (
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
              ) : (
                <Pressable
                  onPress={() => setNoteInputMode('new')}
                  className="mx-5 mt-1 py-3 flex-row items-center"
                  testID="add-note-button"
                  accessibilityRole="button"
                  accessibilityLabel={
                    notesData && notesData.notes.length > 0
                      ? 'Add a note'
                      : 'Add your first note for this topic'
                  }
                >
                  <Text className="text-primary text-body-sm font-medium">
                    {notesData && notesData.notes.length > 0
                      ? '+ Add a note'
                      : '+ Add your first note for this topic'}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* SAVED FROM CHAT section */}
            {bookmarksQuery.isLoading || topicBookmarks.length > 0 ? (
              <View className="mt-4 mb-2">
                <Text className="text-body-sm font-semibold text-text-secondary tracking-wide px-5 mb-2">
                  Saved from chat
                </Text>

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
                ) : (
                  topicBookmarks.map((bookmark) => (
                    <BookmarkCard
                      key={bookmark.id}
                      bookmarkId={bookmark.id}
                      content={bookmark.content}
                      sourceLine={formatBookmarkSourceLine(bookmark)}
                      onPress={() => handleSessionPress(bookmark.sessionId)}
                    />
                  ))
                )}
              </View>
            ) : null}

            {/* SESSIONS section */}
            <View className="mt-4 mb-2">
              <View className="px-5 mb-2">
                <Text className="text-body-sm font-semibold text-text-secondary tracking-wide">
                  Sessions
                </Text>
                {sessionsSummary ? (
                  <Text className="text-caption text-text-tertiary mt-1">
                    {sessionsSummary}
                  </Text>
                ) : null}
              </View>

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
                topicSessions.map((session) => (
                  <TopicSessionRow
                    key={session.id}
                    sessionId={session.id}
                    date={formatSessionDate(session.createdAt)}
                    durationSeconds={session.durationSeconds}
                    sessionType={session.sessionType}
                    onPress={handleSessionPress}
                  />
                ))
              ) : (
                <Text
                  className="text-body-sm text-text-secondary px-5 py-2"
                  testID="topic-sessions-empty"
                >
                  No sessions yet. Start one below!
                </Text>
              )}
            </View>
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
