// ---------------------------------------------------------------------------
// useChallengeRound — orchestrates the challenge-round offer/accept/decline/abort
// lifecycle and note saving.
//
// Routes /challenge-round/* are not yet registered in AppType (added in the
// API layer task). This hook uses raw fetch with auth headers rather than the
// typed Hono client so it compiles before the route types land.
//
// HIGH-3/ROUTING-4: Challenge Round state is consumed only from the typed SSE
// `done` payload after the server parses and gates the full envelope. If the
// streaming protocol ever sends challenge fields incrementally, suppress offers
// at the prompt source instead: do not inject challengeOfferPrompt unless
// evaluateChallengeReadiness() returned eligible.
// ---------------------------------------------------------------------------

import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { useCreateNote } from './use-notes';
import { useProfile } from '../lib/profile';
import { getApiUrl } from '../lib/api';
import { fetchOrThrowNetworkError } from '../lib/api-errors';
import { assertOk } from '../lib/assert-ok';

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  token: string | null,
  profileId: string | undefined,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (profileId) headers['X-Profile-Id'] = profileId;

  // [CR-2026-05-21-156] Wrap so fetch-layer rejections throw typed NetworkError.
  const res = await fetchOrThrowNetworkError(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  await assertOk(res);
  return res.json() as Promise<T>;
}

export function useChallengeRound(opts: {
  sessionId: string;
  topicId: string;
  subjectId: string;
  bookId: string;
}) {
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();
  const createNote = useCreateNote(opts.subjectId, opts.bookId);

  const maybeOffer = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return postJson<{ offered: boolean; reason?: string }>(
        `${getApiUrl()}/v1/challenge-round/maybe-offer`,
        { sessionId: opts.sessionId, topicId: opts.topicId },
        token,
        activeProfile?.id,
      );
    },
  });

  const accept = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return postJson<Record<string, unknown>>(
        `${getApiUrl()}/v1/challenge-round/accept`,
        { sessionId: opts.sessionId, topicId: opts.topicId },
        token,
        activeProfile?.id,
      );
    },
  });

  const decline = useMutation({
    mutationFn: async (dontAskAgain: boolean) => {
      const token = await getToken();
      return postJson<Record<string, unknown>>(
        `${getApiUrl()}/v1/challenge-round/decline`,
        { sessionId: opts.sessionId, topicId: opts.topicId, dontAskAgain },
        token,
        activeProfile?.id,
      );
    },
  });

  const abort = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return postJson<Record<string, unknown>>(
        `${getApiUrl()}/v1/challenge-round/abort`,
        { sessionId: opts.sessionId },
        token,
        activeProfile?.id,
      );
    },
  });

  return {
    maybeOffer: () => maybeOffer.mutateAsync(),
    accept: () => accept.mutateAsync(),
    decline: (dontAskAgain = false) => decline.mutateAsync(dontAskAgain),
    abort: () => abort.mutateAsync(),
    saveNote: (content: string) =>
      createNote.mutateAsync({
        topicId: opts.topicId,
        sessionId: opts.sessionId,
        content,
      }),
    skipNote: () => Promise.resolve(),
  };
}
