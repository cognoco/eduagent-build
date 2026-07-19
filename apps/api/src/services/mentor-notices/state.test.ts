import type { Database } from '@eduagent/database';

import { acceptMentorNotice, prepareMentorNoticeCopy } from './state';

const input = {
  profileId: '00000000-0000-4000-8000-000000000001',
  subjectId: '00000000-0000-4000-8000-000000000002',
  topicId: null,
  sourceSessionId: '00000000-0000-4000-8000-000000000003',
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
  it('rejects a clinical characterization in the concept', () => {
    expect(
      prepareMentorNoticeCopy({
        concept: 'the learner has dyslexia',
        correctionHint: 'Use one step at a time.',
      }),
    ).toBeNull();
  });

  it('drops a clinical correction hint while retaining a safe concept', () => {
    expect(
      prepareMentorNoticeCopy({
        concept: input.concept,
        correctionHint: 'the learner has dyscalculia',
      }),
    ).toEqual({ concept: input.concept, correctionHint: null });
  });

  it('returns null when another concurrent writer already accepted the session notice', async () => {
    const { db, onConflictDoNothing } = makeInsertDb([]);
    await expect(acceptMentorNotice(db, input)).resolves.toBeNull();
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
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
