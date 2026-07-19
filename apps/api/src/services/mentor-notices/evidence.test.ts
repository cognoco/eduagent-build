import type { Database } from '@eduagent/database';
import type { NoticedGapSignal } from '@eduagent/schemas';

import { validateNoticeEvidence } from './evidence';

const signal: NoticedGapSignal = {
  concept: 'Sign changes when moving terms',
  correctionHint: 'Reverse the operation across the equals sign.',
  answerEventId: '00000000-0000-4000-8000-000000000001',
  learnerQuote: 'moved minus three and kept it negative',
};

function makeDb(row: { id: string; content: string } | null) {
  return {
    query: {
      sessionEvents: {
        findFirst: jest.fn().mockResolvedValue(row),
      },
    },
  } as unknown as Database;
}

describe('validateNoticeEvidence', () => {
  it('returns authoritative DB content for a grounded learner event', async () => {
    const result = await validateNoticeEvidence(
      makeDb({
        id: signal.answerEventId,
        content: 'I moved minus three to the other side and kept it negative',
      }),
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      signal,
    );

    expect(result?.learnerQuote).toBe(
      'I moved minus three to the other side and kept it negative',
    );
  });

  it('rejects missing, wrong-profile, wrong-session, and non-user events', async () => {
    await expect(
      validateNoticeEvidence(
        makeDb(null),
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        signal,
      ),
    ).resolves.toBeNull();
  });

  it('rejects an unsupported model-supplied quote', async () => {
    const result = await validateNoticeEvidence(
      makeDb({
        id: signal.answerEventId,
        content: 'I moved minus three to the other side',
      }),
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      { ...signal, learnerQuote: 'mitochondria make cellular energy' },
    );

    expect(result).toBeNull();
  });
});
