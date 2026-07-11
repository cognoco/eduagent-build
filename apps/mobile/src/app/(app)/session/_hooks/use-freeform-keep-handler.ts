import { useCallback, useState } from 'react';
import i18next from 'i18next';
import { platformAlert } from '../../../../lib/platform-alert';
import { ConflictError } from '../../../../lib/api-errors';
import { useCreateBookmark } from '../../../../hooks/use-bookmarks';

/**
 * One-shot "keep this" handler for the freeform (topicless) notePrompt
 * moment (WI-1451 / felt-knowing-loop spec Flow 2). Deliberately independent
 * of `useBookmarkHandler` (the per-message bookmark icon), which toggles —
 * a second tap there deletes the bookmark. That's the wrong semantics for a
 * "keep this" CTA: re-tapping must never un-save. A duplicate create
 * (`ConflictError`, unique `(profileId, eventId)`) is treated as an
 * already-saved success rather than an error.
 */
export function useFreeformKeepHandler(): {
  keepPending: boolean;
  keepSaved: boolean;
  handleKeepNow: (eventId: string) => Promise<void>;
  /** Session-scoped: the screen's session-reset effect must call this
   *  alongside `sessionNoteSavedRef.current = false` so a keep from a prior
   *  freeform session doesn't permanently hide the CTA in the next one. */
  resetKeepSaved: () => void;
} {
  const createBookmark = useCreateBookmark();
  const [keepSaved, setKeepSaved] = useState(false);

  const handleKeepNow = useCallback(
    async (eventId: string) => {
      if (createBookmark.isPending || keepSaved) return;
      try {
        await createBookmark.mutateAsync({ eventId });
        setKeepSaved(true);
      } catch (error) {
        if (error instanceof ConflictError) {
          setKeepSaved(true);
          return;
        }
        platformAlert(
          i18next.t('session.bookmarks.saveErrorTitle'),
          error instanceof Error
            ? error.message
            : i18next.t('common.pleaseTryAgain'),
        );
      }
    },
    [createBookmark, keepSaved],
  );

  const resetKeepSaved = useCallback(() => setKeepSaved(false), []);

  return {
    keepPending: createBookmark.isPending,
    keepSaved,
    handleKeepNow,
    resetKeepSaved,
  };
}
