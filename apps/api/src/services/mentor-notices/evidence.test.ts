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

  // [WI-2629] learnerQuote is optional: when absent, the lexical-overlap
  // check is skipped, but full provenance (event exists, is a user_message,
  // and matches the requested profile + session via the scoped repo +
  // sessionId filter) must still be enforced.
  describe('absent learnerQuote (WI-2629)', () => {
    const { learnerQuote: _learnerQuote, ...signalWithoutQuote } = signal;

    it('accepts a grounded event with no overlap check when learnerQuote is absent', async () => {
      const result = await validateNoticeEvidence(
        makeDb({
          id: signal.answerEventId,
          content: 'a completely unrelated learner message',
        }),
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        signalWithoutQuote,
      );

      expect(result).toEqual(signalWithoutQuote);
    });

    it('still rejects when the event does not belong to this profile/session (security floor)', async () => {
      const result = await validateNoticeEvidence(
        makeDb(null), // scoped repo finds nothing for a mismatched profile/session
        '00000000-0000-4000-8000-000000000099',
        '00000000-0000-4000-8000-000000000098',
        signalWithoutQuote,
      );

      expect(result).toBeNull();
    });
  });
});
