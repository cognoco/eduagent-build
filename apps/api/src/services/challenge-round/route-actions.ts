import type {
  ChallengeRoundSessionState,
  LearningSession,
} from '@eduagent/schemas';
import {
  challengeRoundSessionStateSchema,
  ConflictError,
  NotFoundError,
} from '@eduagent/schemas';
import { challengeRoundCooldowns, type Database } from '@eduagent/database';

import { getSession, persistSessionMetadata } from '../session/session-crud';
import { transitionChallengeState } from './state';

interface ChallengeRoundRouteInput {
  sessionId: string;
  topicId: string;
}

interface DeclineChallengeRoundInput extends ChallengeRoundRouteInput {
  dontAskAgain: boolean;
}

function parseChallengeRoundState(
  session: LearningSession,
): ChallengeRoundSessionState | undefined {
  const raw =
    session.metadata && typeof session.metadata === 'object'
      ? session.metadata.challengeRound
      : undefined;
  const parsed = challengeRoundSessionStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

async function loadOwnedLearningSession(
  db: Database,
  profileId: string,
  input: ChallengeRoundRouteInput,
): Promise<LearningSession> {
  const session = await getSession(db, profileId, input.sessionId);
  if (!session) throw new NotFoundError('Session');
  if (session.sessionType !== 'learning') {
    throw new ConflictError(
      'Challenge Round is only available for learning sessions',
    );
  }
  if (session.topicId !== input.topicId) {
    throw new ConflictError('Challenge topic does not match this session');
  }
  return session;
}

async function persistChallengeRoundState(
  db: Database,
  profileId: string,
  sessionId: string,
  nextState: ChallengeRoundSessionState | undefined,
): Promise<ChallengeRoundSessionState | undefined> {
  const updated = await persistSessionMetadata(db, profileId, sessionId, {
    challengeRound: nextState,
  });
  if (!updated) throw new NotFoundError('Session');
  return nextState;
}

function transitionOrConflict(
  current: ChallengeRoundSessionState | undefined,
  event: Parameters<typeof transitionChallengeState>[1],
): ChallengeRoundSessionState | undefined {
  try {
    return transitionChallengeState(current, event);
  } catch (error) {
    throw new ConflictError(
      error instanceof Error
        ? error.message
        : 'Invalid Challenge Round transition',
    );
  }
}

export async function acceptChallengeRound(
  db: Database,
  profileId: string,
  input: ChallengeRoundRouteInput,
): Promise<ChallengeRoundSessionState> {
  const session = await loadOwnedLearningSession(db, profileId, input);
  const nextState = transitionOrConflict(parseChallengeRoundState(session), {
    type: 'accept',
  });
  if (!nextState) {
    throw new ConflictError('Challenge Round accept did not produce state');
  }
  await persistChallengeRoundState(db, profileId, input.sessionId, nextState);
  return nextState;
}

export async function declineChallengeRound(
  db: Database,
  profileId: string,
  input: DeclineChallengeRoundInput,
): Promise<ChallengeRoundSessionState> {
  const session = await loadOwnedLearningSession(db, profileId, input);
  const nextState = transitionOrConflict(parseChallengeRoundState(session), {
    type: 'decline',
    dontAskAgain: input.dontAskAgain,
  });
  if (!nextState) {
    throw new ConflictError('Challenge Round decline did not produce state');
  }

  await persistChallengeRoundState(db, profileId, input.sessionId, nextState);
  const now = new Date();
  await db
    .insert(challengeRoundCooldowns)
    .values({
      profileId,
      topicId: input.topicId,
      lastOutcome: 0,
      lastOfferedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        challengeRoundCooldowns.profileId,
        challengeRoundCooldowns.topicId,
      ],
      set: { lastOutcome: 0, lastOfferedAt: now, updatedAt: now },
    });
  return nextState;
}

export async function abortChallengeRound(
  db: Database,
  profileId: string,
  input: ChallengeRoundRouteInput,
): Promise<ChallengeRoundSessionState | undefined> {
  const session = await loadOwnedLearningSession(db, profileId, input);
  const nextState = transitionOrConflict(parseChallengeRoundState(session), {
    type: 'abort',
  });
  return persistChallengeRoundState(db, profileId, input.sessionId, nextState);
}
