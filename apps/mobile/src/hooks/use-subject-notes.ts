import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AllNote, Bookmark, NoteOrigin } from '@eduagent/schemas';

import { useBookmarks } from './use-bookmarks';
import { useAllNotes } from './use-notes';

export interface SubjectHubNote {
  id: string;
  topicId: string | null;
  content: string;
  origin: NoteOrigin;
  authorLabel: string;
  updatedAt: string;
  sessionId: string | null;
}

interface NormalizeSubjectHubNotesInput {
  notes: readonly AllNote[];
  bookmarks: readonly Bookmark[];
  labels: {
    self: string;
    mentor: string;
  };
}

export function normalizeSubjectHubNotes({
  notes,
  bookmarks,
  labels,
}: NormalizeSubjectHubNotesInput): SubjectHubNote[] {
  return [
    ...notes.map((note) => ({
      id: note.id,
      topicId: note.topicId,
      content: note.content,
      origin: (note.origin ?? 'self') as NoteOrigin,
      authorLabel: labels.self,
      updatedAt: note.updatedAt,
      sessionId: note.sessionId,
    })),
    ...bookmarks.map((bookmark) => ({
      id: bookmark.id,
      topicId: bookmark.topicId,
      content: bookmark.content,
      origin: 'mentor' as NoteOrigin,
      authorLabel: labels.mentor,
      updatedAt: bookmark.createdAt,
      sessionId: bookmark.sessionId,
    })),
  ].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function useSubjectNotes(subjectId: string | undefined): {
  notes: SubjectHubNote[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const { t } = useTranslation();
  const notesQuery = useAllNotes({ subjectId, limit: 50 });
  const bookmarksQuery = useBookmarks({ subjectId, limit: 50 });

  const notes = useMemo(
    () =>
      normalizeSubjectHubNotes({
        notes: notesQuery.data?.pages.flatMap((page) => page.notes) ?? [],
        bookmarks:
          bookmarksQuery.data?.pages.flatMap((page) => page.bookmarks) ?? [],
        labels: {
          self: t('subjectHub.notes.authorSelf'),
          mentor: t('subjectHub.notes.authorMentor'),
        },
      }),
    [bookmarksQuery.data, notesQuery.data, t],
  );

  return {
    notes,
    isLoading: notesQuery.isLoading || bookmarksQuery.isLoading,
    isError: notesQuery.isError || bookmarksQuery.isError,
    refetch: () => {
      void notesQuery.refetch();
      void bookmarksQuery.refetch();
    },
  };
}
