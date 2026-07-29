jest.mock(
  '../llm' /* gc1-allow: mocks the routeAndCall LLM boundary. The [WI-2628] gate refers ambiguous text to an independent judge, so asserting the educational-allowance path reaches the merge requires a judge verdict; routeAndCall cannot be exercised without a provider registration. Same escape and reasoning as learning-text-safety/judge.test.ts and gate.test.ts. */,
  () => {
    const actual = jest.requireActual('../llm') as typeof import('../llm');
    return { ...actual, routeAndCall: jest.fn() };
  },
);

import type { Database, MemoryFactRow } from '@eduagent/database';
import { routeAndCall } from '../llm';
import { evaluateLearningTextByContent } from '../learning-text-safety/gate';
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
  const BASE_FACT = {
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

  /**
   * [WI-2628] The gate as `dedup-pass.ts` builds it — content-addressed, keyed on
   * the merge text, evaluated BEFORE the caller's transaction. `provenance:
   * 'migration'` keeps these unit tests deterministic (no judge, so no LLM
   * boundary to stub); the ambiguity/judge behaviour is covered in
   * `learning-text-safety/gate.test.ts`.
   */
  const gateFor = (...texts: (string | null)[]) =>
    evaluateLearningTextByContent({
      texts,
      fieldKind: 'memory_dedup_action',
      conversationLanguage: undefined,
      provenance: 'migration',
    });

  /**
   * Chainable stub. A bare `jest.fn()` for `insert` makes a merge that PASSES the
   * gate throw on `.values(...)`, which reads as a crash rather than as the
   * success it is — so the control that matters most was the one most likely to
   * be misread.
   */
  const makeTx = () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn(() => ({ values }));
    const set = jest.fn(() => ({
      where: jest.fn().mockResolvedValue(undefined),
    }));
    const update = jest.fn(() => ({ set }));
    const del = jest.fn(() => ({
      where: jest.fn().mockResolvedValue(undefined),
    }));
    return {
      tx: { insert, update, delete: del } as unknown as Pick<
        Database,
        'delete' | 'insert' | 'update'
      >,
      insert,
    };
  };

  const applyMerge = async (
    mergedText: string,
    gateTexts: (string | null)[],
  ) => {
    const { tx, insert } = makeTx();
    const outcome = await applyDedupAction(tx, {
      action: { action: 'merge', merged_text: mergedText },
      candidate: { ...BASE_FACT, text: mergedText, textNormalized: mergedText },
      neighbour: {
        ...BASE_FACT,
        id: '018f8f3e-0000-7000-8000-000000000003',
        text: mergedText,
        textNormalized: mergedText,
      },
      learningTextGate: await gateFor(...gateTexts),
    });
    return { outcome, insert };
  };

  it('[WI-1195] rejects a merged fact that characterises a learner clinically', async () => {
    const text = 'The learner has ADHD.';
    const { outcome, insert } = await applyMerge(text, [text]);
    expect(outcome).toEqual({ kind: 'merge_rejected_clinical_inference' });
    expect(insert).not.toHaveBeenCalled();
  });

  // [WI-2628] The row above is English-only, so the shipped English-only guard
  // satisfied it too — it never established the property this Work Item exists
  // for. Each string below was returned UNCHANGED by the old guard, i.e. would
  // have been merged and persisted verbatim.
  it.each([
    ['Czech', 'Petr má dyslexii a potřebuje pomoc.'],
    ['Spanish', 'El alumno tiene TEA.'],
    ['German', 'Der Schüler hat ADS.'],
    ['Norwegian', 'Eleven har ADD.'],
    ['Japanese', '田中さんは自閉症です。'],
    [
      'English genitive of an attributed-only acronym',
      "Emma's TEA is documented in the file.",
    ],
  ])(
    '[WI-2628] rejects a %s clinical characterisation',
    async (_lang, text) => {
      const { outcome, insert } = await applyMerge(text, [text]);
      expect(outcome).toEqual({ kind: 'merge_rejected_clinical_inference' });
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it('[WI-2628] rejects merge text the gate never evaluated', async () => {
    // The content-addressed property at this boundary: a decision batch that does
    // not contain THIS string cannot clear it. That is what makes "the state moved
    // between pre-evaluation and the transaction" fail closed for free.
    const { outcome, insert } = await applyMerge(
      'We read two chapters about volcanoes today.',
      ['An entirely different string.'],
    );
    expect(outcome).toEqual({ kind: 'merge_rejected_clinical_inference' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('[WI-2628] admits safe merge text past the gate', async () => {
    // Non-triviality control. A gate that rejected everything would satisfy every
    // row above for free and the merge feature would be silently dead.
    const text = 'We read two chapters about volcanoes today.';
    const { outcome } = await applyMerge(text, [text]);
    expect(outcome).not.toEqual({ kind: 'merge_rejected_clinical_inference' });
  });

  it('[WI-2628] admits EDUCATIONAL use of a protected term when the judge allows it', async () => {
    // The control that must CONTAIN THE THING UNDER TEST: a protected lexeme in an
    // educational construction. Without it, closing the educational path would pass
    // unnoticed here exactly as it did at the notes boundary — 'volcanoes' has no
    // protected lexeme, so that row cannot detect it.
    //
    // This string is `ambiguous` to the scanner, so it goes to the independent
    // judge; `llm` provenance with a known producer is what makes the referral
    // reachable. An allowing judge must let the merge proceed.
    const text = 'Dyslexia is a reading difference that affects decoding.';
    (
      routeAndCall as jest.MockedFunction<typeof routeAndCall>
    ).mockResolvedValue({
      response: JSON.stringify({
        verdict: 'allow',
        reason: 'educational_reference',
      }),
      provider: 'anthropic',
      model: 'dedup-gate-test-model',
      latencyMs: 5,
      stopReason: 'stop',
    } as Awaited<ReturnType<typeof routeAndCall>>);

    const gate = await evaluateLearningTextByContent({
      texts: [text],
      fieldKind: 'memory_dedup_action',
      conversationLanguage: undefined,
      provenance: 'llm',
      producerVendor: 'cerebras',
    });
    // Fixture guard: if this string ever stops reaching the judge, the assertion
    // below would silently stop testing the allowance.
    expect(routeAndCall).toHaveBeenCalledTimes(1);
    expect(gate.blockedCount).toBe(0);

    const { tx, insert } = makeTx();
    const outcome = await applyDedupAction(tx, {
      action: { action: 'merge', merged_text: text },
      candidate: { ...BASE_FACT, text, textNormalized: text },
      neighbour: {
        ...BASE_FACT,
        id: '018f8f3e-0000-7000-8000-000000000003',
        text,
        textNormalized: text,
      },
      learningTextGate: gate,
    });

    expect(outcome).not.toEqual({ kind: 'merge_rejected_clinical_inference' });
    expect(insert).toHaveBeenCalled();
  });

  it('[WI-2628] still refuses that same educational text when the judge blocks it', async () => {
    // "Goes to the judge" is not "passes".
    const text = 'Dyslexia is a reading difference that affects decoding.';
    (
      routeAndCall as jest.MockedFunction<typeof routeAndCall>
    ).mockResolvedValue({
      response: JSON.stringify({
        verdict: 'block',
        reason: 'diagnostic_inference',
      }),
      provider: 'anthropic',
      model: 'dedup-gate-test-model',
      latencyMs: 5,
      stopReason: 'stop',
    } as Awaited<ReturnType<typeof routeAndCall>>);

    const gate = await evaluateLearningTextByContent({
      texts: [text],
      fieldKind: 'memory_dedup_action',
      conversationLanguage: undefined,
      provenance: 'llm',
      producerVendor: 'cerebras',
    });
    const { tx, insert } = makeTx();
    const outcome = await applyDedupAction(tx, {
      action: { action: 'merge', merged_text: text },
      candidate: { ...BASE_FACT, text, textNormalized: text },
      neighbour: {
        ...BASE_FACT,
        id: '018f8f3e-0000-7000-8000-000000000003',
        text,
        textNormalized: text,
      },
      learningTextGate: gate,
    });
    expect(outcome).toEqual({ kind: 'merge_rejected_clinical_inference' });
    expect(insert).not.toHaveBeenCalled();
  });
});
