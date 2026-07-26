import { mentorNotices, type Database } from '@eduagent/database';
import { sql } from 'drizzle-orm';

import { acceptMentorNotice, prepareMentorNoticeCopy } from './state';

const input = {
  profileId: '00000000-0000-4000-8000-000000000001',
  subjectId: '00000000-0000-4000-8000-000000000002',
  topicId: null,
  sourceSessionId: '00000000-0000-4000-8000-000000000003',
  answerEventId: '00000000-0000-4000-8000-000000000005',
  concept: 'Sign changes when moving terms',
  correctionHint: 'Reverse the operation across the equals sign.',
};

function makeInsertDb(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const onConflictDoNothing = jest.fn().mockReturnValue({ returning });
  const values = jest.fn().mockReturnValue({ onConflictDoNothing });
  const insert = jest.fn().mockReturnValue({ values });
  return {
    db: { insert } as unknown as Database,
    insert,
    values,
    onConflictDoNothing,
  };
}

describe('mentor notice creation state', () => {
  // [WI-2628] `prepareMentorNoticeCopy` is now async — the shared multilingual
  // gate resolves an ambiguous verdict through an independent judge. The asserted
  // BEHAVIOUR is unchanged (unsafe concept -> null row; unsafe hint -> nulled,
  // notice kept), which is the point: the derived-write drop semantics AC-5
  // requires are exactly what the English-only guard already did here.
  it('rejects a clinical characterization in the concept', async () => {
    await expect(
      prepareMentorNoticeCopy({
        concept: 'the learner has dyslexia',
        correctionHint: 'Use one step at a time.',
      }),
    ).resolves.toBeNull();
  });

  it('drops a clinical correction hint while retaining a safe concept', async () => {
    await expect(
      prepareMentorNoticeCopy({
        concept: input.concept,
        correctionHint: 'the learner has dyscalculia',
      }),
    ).resolves.toEqual({ concept: input.concept, correctionHint: null });
  });

  // [WI-2628] The reason this WI exists: the English-only guard let every one of
  // these through. Same two drop shapes, non-English.
  it.each([
    ['Czech', 'Žák má dyslexii.'],
    ['Spanish', 'El alumno tiene TEA.'],
    ['German', 'Der Schüler hat ADS.'],
    ['Japanese', '田中さんは自閉症です。'],
  ])(
    'rejects a %s clinical characterization in the concept',
    async (_name, concept) => {
      await expect(
        prepareMentorNoticeCopy({ concept, correctionHint: null }),
      ).resolves.toBeNull();
    },
  );

  it('returns null when another concurrent writer already accepted the same evidence', async () => {
    const { db, onConflictDoNothing } = makeInsertDb([]);
    await expect(acceptMentorNotice(db, input)).resolves.toBeNull();
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it('targets the evidence-backed partial unique index, not the retired session-only one', async () => {
    const { db, onConflictDoNothing } = makeInsertDb([]);
    await acceptMentorNotice(db, input);
    // [WI-2500] A stale/mismatched target here would silently no-op post
    // migration instead of erroring — this pins both the column pair AND the
    // partial-index predicate, since Postgres requires an exact match on
    // both to infer the conflict target.
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: expect.arrayContaining([
        expect.objectContaining({ name: 'source_session_id' }),
        expect.objectContaining({ name: 'answer_event_id' }),
      ]),
      where: sql`${mentorNotices.answerEventId} IS NOT NULL`,
    });
  });

  it('returns the server-owned accepted notice projection', async () => {
    const accepted = {
      id: '00000000-0000-4000-8000-000000000004',
      concept: input.concept,
      correctionHint: input.correctionHint,
    };
    const { db } = makeInsertDb([accepted]);
    await expect(acceptMentorNotice(db, input)).resolves.toEqual(accepted);
  });
});
