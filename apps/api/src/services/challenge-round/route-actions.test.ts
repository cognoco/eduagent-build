import { ConflictError, NotFoundError } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';

import {
  acceptChallengeRound,
  abortChallengeRound,
  declineChallengeRound,
} from './route-actions';
import { getSession, persistSessionMetadata } from '../session/session-crud';
import {
  TEST_PROFILE_ID,
  TEST_PROFILE_ID_2,
  TEST_SESSION_ID,
  TEST_TOPIC_ID,
  TEST_TOPIC_ID_2,
} from '@eduagent/test-utils';

jest.mock(
  '../session/session-crud' /* gc1-allow: route-action unit test isolates session CRUD; integration tests cover scoped persistence */,
  () => ({
    getSession: jest.fn(),
    persistSessionMetadata: jest.fn(),
  }),
);

const PROFILE_ID = TEST_PROFILE_ID;
const OTHER_PROFILE_ID = TEST_PROFILE_ID_2;
const SESSION_ID = TEST_SESSION_ID;
const TOPIC_ID = TEST_TOPIC_ID;
const OTHER_TOPIC_ID = TEST_TOPIC_ID_2;

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockPersistSessionMetadata =
  persistSessionMetadata as jest.MockedFunction<typeof persistSessionMetadata>;

function makeDb() {
  const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = jest.fn().mockReturnValue({ values });
  return {
    db: { insert } as unknown as Database,
    values,
    onConflictDoUpdate,
  };
}

function makeSession(metadata: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    subjectId: '00000000-0000-4000-8000-000000000301',
    topicId: TOPIC_ID,
    sessionType: 'learning',
    status: 'active',
    metadata,
  } as Awaited<ReturnType<typeof getSession>>;
}

describe('challenge-round route actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPersistSessionMetadata.mockResolvedValue(makeSession());
  });

  it('throws not found when another profile cannot read the session', async () => {
    const { db } = makeDb();
    mockGetSession.mockResolvedValueOnce(null);

    await expect(
      acceptChallengeRound(db, OTHER_PROFILE_ID, {
        sessionId: SESSION_ID,
        topicId: TOPIC_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockPersistSessionMetadata).not.toHaveBeenCalled();
  });

  it('throws conflict when the supplied topic is not the session topic', async () => {
    const { db } = makeDb();
    mockGetSession.mockResolvedValueOnce(makeSession());

    await expect(
      acceptChallengeRound(db, PROFILE_ID, {
        sessionId: SESSION_ID,
        topicId: OTHER_TOPIC_ID,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockPersistSessionMetadata).not.toHaveBeenCalled();
  });

  it('accept from a non-offered state returns a conflict-style error', async () => {
    const { db } = makeDb();
    mockGetSession.mockResolvedValueOnce(
      makeSession({
        challengeRound: {
          state: 'declined',
          topicId: TOPIC_ID,
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
      }),
    );

    await expect(
      acceptChallengeRound(db, PROFILE_ID, {
        sessionId: SESSION_ID,
        topicId: TOPIC_ID,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('decline writes cooldown only for the owner profile and session topic', async () => {
    const { db, values, onConflictDoUpdate } = makeDb();
    mockGetSession.mockResolvedValueOnce(
      makeSession({
        challengeRound: {
          state: 'offered',
          topicId: TOPIC_ID,
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
      }),
    );

    const result = await declineChallengeRound(db, PROFILE_ID, {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      dontAskAgain: true,
    });

    expect(result.state).toBe('declined');
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE_ID,
        topicId: TOPIC_ID,
        lastOutcome: 0,
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ lastOutcome: 0 }),
      }),
    );
  });

  it('abort persists aborted state when a round exists', async () => {
    const { db } = makeDb();
    mockGetSession.mockResolvedValueOnce(
      makeSession({
        challengeRound: {
          state: 'active',
          topicId: TOPIC_ID,
          offerCount: 1,
          questionIndex: 0,
          totalQuestions: 3,
          declinedDontAskAgain: false,
          evaluations: [],
        },
      }),
    );

    const result = await abortChallengeRound(db, PROFILE_ID, {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
    });

    expect(result?.state).toBe('aborted');
    expect(mockPersistSessionMetadata).toHaveBeenCalledWith(
      db,
      PROFILE_ID,
      SESSION_ID,
      { challengeRound: result },
    );
  });
});
