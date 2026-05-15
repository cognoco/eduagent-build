import { useCallback, useEffect, useRef, useState } from 'react';
import { platformAlert } from '../../../../lib/platform-alert';
import {
  useCreateBookmark,
  useDeleteBookmark,
  useSessionBookmarks,
} from '../../../../hooks/use-bookmarks';
import type { ChatMessage } from '../../../../components/session';

/**
 * Owns the local mirror of server bookmark state for the current session
 * plus the toggle handler with optimistic updates and rollback on error.
 *
 * Returns `bookmarkState` (eventId → bookmarkId or 'pending' or null) for
 * the UI to render and `handleToggleBookmark` to wire up onPress.
 */
export function useBookmarkHandler({
  sessionId,
}: {
  sessionId: string | undefined;
}): {
  bookmarkState: Record<string, string | null>;
  handleToggleBookmark: (message: ChatMessage) => Promise<void>;
} {
  const sessionBookmarksQuery = useSessionBookmarks(sessionId);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();

  const [bookmarkState, setBookmarkState] = useState<
    Record<string, string | null>
  >({});
  const bookmarkStateRef = useRef<Record<string, string | null>>({});

  useEffect(() => {
    const activeBookmarkState: Record<string, string | null> = {};
    for (const bookmark of sessionBookmarksQuery.data ?? []) {
      activeBookmarkState[bookmark.eventId] = bookmark.bookmarkId;
    }
    bookmarkStateRef.current = activeBookmarkState;
    setBookmarkState(activeBookmarkState);
  }, [sessionBookmarksQuery.data]);

  const updateBookmarkEntry = useCallback(
    (eventId: string, value: string | null) => {
      setBookmarkState((prev) => {
        const next = { ...prev, [eventId]: value };
        bookmarkStateRef.current = next;
        return next;
      });
    },
    [],
  );

  const handleToggleBookmark = useCallback(
    async (message: ChatMessage) => {
      const eventId = message.eventId;
      if (!eventId) return;

      const existingBookmarkId = bookmarkStateRef.current[eventId] ?? null;
      if (existingBookmarkId === 'pending') return;

      if (existingBookmarkId) {
        updateBookmarkEntry(eventId, null);
        try {
          await deleteBookmark.mutateAsync(existingBookmarkId);
        } catch (error) {
          updateBookmarkEntry(eventId, existingBookmarkId);
          platformAlert(
            'Could not remove bookmark',
            error instanceof Error ? error.message : 'Please try again.',
          );
        }
        return;
      }

      updateBookmarkEntry(eventId, 'pending');
      try {
        const result = await createBookmark.mutateAsync({ eventId });
        updateBookmarkEntry(eventId, result.bookmark.id);
      } catch (error) {
        updateBookmarkEntry(eventId, null);
        platformAlert(
          'Could not save bookmark',
          error instanceof Error ? error.message : 'Please try again.',
        );
      }
    },
    [createBookmark, deleteBookmark, updateBookmarkEntry],
  );

  return { bookmarkState, handleToggleBookmark };
}
