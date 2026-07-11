import type { Database, MemoryFactRow } from '@eduagent/database';
import { applyDedupAction, findNewContentTokens } from './dedup-actions';

describe('findNewContentTokens', () => {
  it('allows tokens present in either input', () => {
    expect(findNewContentTokens('cat dog', 'cat', 'dog')).toEqual([]);
  });

  it('allows stopwords regardless of source', () => {
    expect(findNewContentTokens('the cat and the dog', 'cat', 'dog')).toEqual(
      [],
    );
  });

  it('flags non-stopword tokens absent from both inputs', () => {
    expect(findNewContentTokens('cat dog elephant', 'cat', 'dog')).toEqual([
      'elephant',
    ]);
  });

  it('is punctuation-tolerant', () => {
    expect(findNewContentTokens("can't reduce!", "can't", 'reduce')).toEqual(
      [],
    );
  });
});

describe('applyDedupAction clinical inference boundary', () => {
  it('[WI-1195] rejects a merged fact that characterises a learner clinically', async () => {
    const insert = jest.fn();
    const tx = { insert } as unknown as Pick<
      Database,
      'delete' | 'insert' | 'update'
    >;
    const fact = {
      id: '018f8f3e-0000-7000-8000-000000000001',
      profileId: '018f8f3e-0000-7000-8000-000000000002',
      category: 'communication_note',
      text: 'The learner has ADHD.',
      textNormalized: 'the learner has adhd.',
      metadata: {},
      sourceSessionIds: [],
      sourceEventIds: [],
      observedAt: new Date('2026-05-01T00:00:00.000Z'),
      supersededBy: null,
      supersededAt: null,
      embedding: null,
      confidence: 'medium',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    } satisfies MemoryFactRow;

    const outcome = await applyDedupAction(tx, {
      action: { action: 'merge', merged_text: 'The learner has ADHD.' },
      candidate: fact,
      neighbour: { ...fact, id: '018f8f3e-0000-7000-8000-000000000003' },
    });

    expect(outcome).toEqual({ kind: 'merge_rejected_clinical_inference' });
    expect(insert).not.toHaveBeenCalled();
  });
});
