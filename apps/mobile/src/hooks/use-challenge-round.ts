// ---------------------------------------------------------------------------
// useChallengeRound - orchestrates the challenge-round accept/decline/abort
// lifecycle and note saving.
//
// This hook uses raw fetch with auth headers because the Challenge Round route
// response is consumed as a narrow UI state transition rather than broader
// server state.
//
// HIGH-3/ROUTING-4: Challenge Round state is consumed only from the typed SSE
// `done` payload after the server parses and gates the full envelope. If the
// streaming protocol ever sends challenge fields incrementally, suppress offers
// at the prompt source instead: do not inject challengeOfferPrompt unless
// evaluateChallengeReadiness() returned eligible.
// ---------------------------------------------------------------------------

import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import type { ChallengeRoundSessionState } from '@eduagent/schemas';
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

type ChallengeRoundRouteResponse = {
  challengeRound?: ChallengeRoundSessionState;
};

function requireChallengeIds(opts: {
  sessionId: string | null | undefined;
  topicId: string | undefined;
}): { sessionId: string; topicId: string } {
  if (!opts.sessionId || !opts.topicId) {
    throw new Error('Challenge Round requires an active session and topic.');
  }
  return { sessionId: opts.sessionId, topicId: opts.topicId };
}

export function useChallengeRound(opts: {
  sessionId: string | null | undefined;
  topicId: string | undefined;
  subjectId: string | undefined;
  bookId?: string | undefined;
}) {
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();
  const createNote = useCreateNote(opts.subjectId, opts.bookId);

  const accept = useMutation({
    mutationFn: async () => {
      const ids = requireChallengeIds(opts);
      const token = await getToken();
      return postJson<ChallengeRoundRouteResponse>(
        `${getApiUrl()}/v1/challenge-round/accept`,
        ids,
        token,
        activeProfile?.id,
      );
    },
  });

  const decline = useMutation({
    mutationFn: async (dontAskAgain: boolean) => {
      const ids = requireChallengeIds(opts);
      const token = await getToken();
      return postJson<ChallengeRoundRouteResponse>(
        `${getApiUrl()}/v1/challenge-round/decline`,
        { ...ids, dontAskAgain },
        token,
        activeProfile?.id,
      );
    },
  });

  const abort = useMutation({
    mutationFn: async () => {
      const ids = requireChallengeIds(opts);
      const token = await getToken();
      return postJson<ChallengeRoundRouteResponse>(
        `${getApiUrl()}/v1/challenge-round/abort`,
        ids,
        token,
        activeProfile?.id,
      );
    },
  });

  return {
    accept: () => {
      return accept.mutateAsync();
    },
    decline: (dontAskAgain = false) => {
      return decline.mutateAsync(dontAskAgain);
    },
    abort: () => {
      return abort.mutateAsync();
    },
    saveNote: (content: string) => {
      const ids = requireChallengeIds(opts);
      return createNote.mutateAsync({
        topicId: ids.topicId,
        sessionId: ids.sessionId,
        content,
      });
    },
    skipNote: () => Promise.resolve(),
  };
}
