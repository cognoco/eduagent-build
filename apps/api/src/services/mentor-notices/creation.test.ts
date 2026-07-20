import type { Database } from '@eduagent/database';
import type { NoticedGapSignal, SessionType } from '@eduagent/schemas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createMentorNoticeFromExchange } from './creation';

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';
const SUBJECT_ID = '00000000-0000-4000-8000-000000000003';
const TOPIC_ID = '00000000-0000-4000-8000-000000000004';
const OTHER_SUBJECT_ID = '00000000-0000-4000-8000-000000000005';
const OTHER_TOPIC_ID = '00000000-0000-4000-8000-000000000006';
const EVENT_ID = '00000000-0000-4000-8000-000000000007';
const NOTICE_ID = '00000000-0000-4000-8000-000000000008';

const signal: NoticedGapSignal = {
  concept: 'Mitosis versus meiosis',
  correctionHint: 'Mitosis keeps the chromosome count unchanged.',
  answerEventId: EVENT_ID,
  learnerQuote: 'meiosis makes identical cells',
};

function makeDb(eventContent = 'I think meiosis makes identical cells') {
  const insertedValues: unknown[] = [];
  const returning = jest.fn().mockResolvedValue([
    {
      id: NOTICE_ID,
      concept: signal.concept,
      correctionHint: signal.correctionHint,
    },
  ]);
  const onConflictDoNothing = jest.fn().mockReturnValue({ returning });
  const values = jest.fn((value: unknown) => {
    insertedValues.push(value);
    return { onConflictDoNothing };
  });
  const insert = jest.fn().mockReturnValue({ values });
  const db = {
    query: {
      sessionEvents: {
        findFirst: jest.fn().mockResolvedValue({
          id: EVENT_ID,
          content: eventContent,
        }),
      },
    },
    insert,
  } as unknown as Database;
  return { db, insert, insertedValues };
}

function session(sessionType: SessionType) {
  return {
    id: SESSION_ID,
    subjectId: SUBJECT_ID,
    topicId: TOPIC_ID,
    sessionType,
  };
}

describe('createMentorNoticeFromExchange', () => {
  it('is the shared creation boundary for streaming and non-streaming exchanges', () => {
    const source = readFileSync(
      join(__dirname, '..', 'session', 'session-exchange.ts'),
      'utf8',
    );

    expect(source.match(/createMentorNoticeFromExchange\(/g)).toHaveLength(2);
    expect(source).not.toContain("context.sessionType === 'homework'");
  });

  it.each(['learning', 'homework'] as const)(
    'inherits the authoritative session target for a %s session',
    async (sessionType) => {
      const { db, insertedValues } = makeDb();

      await expect(
        createMentorNoticeFromExchange(db, {
          profileId: PROFILE_ID,
          session: session(sessionType),
          signal: { ...signal, topicId: OTHER_TOPIC_ID },
        }),
      ).resolves.toMatchObject({ id: NOTICE_ID });

      expect(insertedValues).toContainEqual(
        expect.objectContaining({
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          sourceSessionId: SESSION_ID,
        }),
      );
    },
  );

  it('resolves an interleaved target to its server-owned subject and topic', async () => {
    const { db, insertedValues } = makeDb();

    await createMentorNoticeFromExchange(db, {
      profileId: PROFILE_ID,
      session: session('interleaved'),
      signal: { ...signal, topicId: OTHER_TOPIC_ID },
      interleavedTopics: [
        {
          topicId: OTHER_TOPIC_ID,
          subjectId: OTHER_SUBJECT_ID,
          title: 'Cell division',
        },
      ],
    });

    expect(insertedValues).toContainEqual(
      expect.objectContaining({
        subjectId: OTHER_SUBJECT_ID,
        topicId: OTHER_TOPIC_ID,
      }),
    );
  });

  it.each([
    { label: 'missing', proposedTopicId: undefined },
    {
      label: 'unknown',
      proposedTopicId: '00000000-0000-4000-8000-000000000009',
    },
  ])(
    'rejects a $label interleaved topic target',
    async ({ proposedTopicId }) => {
      const { db, insert } = makeDb();

      await expect(
        createMentorNoticeFromExchange(db, {
          profileId: PROFILE_ID,
          session: session('interleaved'),
          signal: { ...signal, topicId: proposedTopicId },
          interleavedTopics: [
            {
              topicId: OTHER_TOPIC_ID,
              subjectId: OTHER_SUBJECT_ID,
              title: 'Cell division',
            },
          ],
        }),
      ).resolves.toBeNull();
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it('rejects a new notice while the session is already re-checking one', async () => {
    const { db, insert } = makeDb();

    await expect(
      createMentorNoticeFromExchange(db, {
        profileId: PROFILE_ID,
        session: session('learning'),
        signal,
        isMentorNoticeRecheck: true,
      }),
    ).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects unsupported evidence before persistence', async () => {
    const { db, insert } = makeDb('I used the distributive property');

    await expect(
      createMentorNoticeFromExchange(db, {
        profileId: PROFILE_ID,
        session: session('learning'),
        signal,
      }),
    ).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });
});
