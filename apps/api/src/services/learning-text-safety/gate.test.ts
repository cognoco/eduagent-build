// ---------------------------------------------------------------------------
// [WI-2628] Stage 3 — the async batch evaluator (AC-1). Unit tests.
//
// routeAndCall is the LLM boundary — the one allowed external-boundary mock
// (AGENTS.md), mirroring judge.test.ts. Stage 1's scanner and Stage 2's judge
// are BOTH used for real: every case below is built from real text driven
// through the real scan, so an assertion is about the composition the AC names
// rather than about hand-written result objects that agree with it.
// ---------------------------------------------------------------------------

jest.mock(
  '../llm' /* gc1-allow: mocks the routeAndCall LLM boundary — routeAndCall cannot be exercised without a provider registration; real-router coverage lives in the llm/router test suite. */,
  () => {
    const actual = jest.requireActual('../llm') as typeof import('../llm');
    return {
      ...actual,
      routeAndCall: jest.fn(),
    };
  },
);

import { BadRequestError } from '../../errors';
import type { RouteResult } from '../llm';
import { routeAndCall } from '../llm';
import { setStructuredLogSink, type LogEntry } from '../logger';
import {
  assertLearningTextSafe,
  evaluateLearningTextByContent,
  evaluateLearningTextFields,
  isContentSafe,
  isLearningTextSafe,
  learningTextContentKey,
} from './gate';
import { scanLearningText } from './scan';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

const PRODUCER_VENDOR = 'cerebras';

/**
 * Declared language for the whole suite.
 *
 * `cs`, not `en`, and the choice is load-bearing. `compileGrammar` builds the
 * declared language's grammar PLUS English, so under `cs` both the Czech
 * attribution in `BLOCKED_TEXT` and the English strings resolve as intended.
 * Under a declared `en` the Czech grammar is never compiled, so
 * `Petr má dyslexii…` classifies `ambiguous`/`refer` rather than `block` — which
 * is correct scanner behavior and would have made every "blocked field" case
 * below silently exercise the judge path instead. The fixture guard directly
 * below exists to catch exactly that substitution.
 */
const DECLARED_LANGUAGE = 'cs' as const;

/** Deterministic `clear` — no protected lexeme in any of the ten corpora. */
const CLEAR_TEXT = 'We read two chapters about volcanoes today.';
/** Deterministic `block` — non-English person attribution (the WI's root bug). */
const BLOCKED_TEXT = 'Petr má dyslexii a potřebuje pomoc.';
/** Deterministic `refer` — protected lexeme, no attribution. Reaches the judge. */
const AMBIGUOUS_TEXT = 'This chapter explains what dyslexia is.';
/**
 * Same shape as AMBIGUOUS_TEXT plus a token that appears nowhere else in the
 * process, so a leak into a log line is attributable to this text alone.
 */
const SENTINEL_TEXT = 'This appendix defines dyslexia for quibblefrotz.';

const routeResult = (response: string): RouteResult => ({
  response,
  provider: 'anthropic',
  model: 'gate-test-model',
  latencyMs: 7,
  stopReason: 'stop',
});

const judgeSays = (verdict: string, reason: string): void => {
  mockRouteAndCall.mockResolvedValue(
    routeResult(JSON.stringify({ verdict, reason })),
  );
};

beforeEach(() => {
  mockRouteAndCall.mockReset();
});

/**
 * Fixture guard. If Stage 1 ever reclassifies one of these strings, every test
 * below would silently exercise a different branch — so assert the branch the
 * suite is built on before relying on it.
 */
describe('[WI-2628] fixture dispositions are the ones these tests assume', () => {
  it.each([
    [CLEAR_TEXT, 'clear'],
    [BLOCKED_TEXT, 'block'],
    [AMBIGUOUS_TEXT, 'refer'],
    [SENTINEL_TEXT, 'refer'],
  ])('%s scans as %s at llm provenance', (text, disposition) => {
    expect(
      scanLearningText({
        text,
        conversationLanguage: DECLARED_LANGUAGE,
        provenance: 'llm',
        fieldKind: 'note_text',
        producerVendor: PRODUCER_VENDOR,
      }).disposition,
    ).toBe(disposition);
  });
});

describe('[WI-2628 AC-1] evaluateLearningTextFields composes scan and judge across a batch', () => {
  const batch = (
    fields: Parameters<typeof evaluateLearningTextFields>[0]['fields'],
  ) =>
    evaluateLearningTextFields({
      fields,
      conversationLanguage: DECLARED_LANGUAGE,
      provenance: 'llm',
      producerVendor: PRODUCER_VENDOR,
    });

  it('evaluates a mixed batch in one call — the contract Gate-2 found uncallable', async () => {
    judgeSays('allow', 'educational_reference');
    const result = await batch([
      { key: 'a', fieldKind: 'note_text', text: CLEAR_TEXT },
      { key: 'b', fieldKind: 'note_text', text: BLOCKED_TEXT },
      { key: 'c', fieldKind: 'note_text', text: AMBIGUOUS_TEXT },
    ]);

    expect(result.decisions).toHaveLength(3);
    expect(result.isSafe('a')).toBe(true);
    expect(result.isSafe('b')).toBe(false);
    // The judge allowed this one — proof the batch actually reached it.
    expect(result.isSafe('c')).toBe(true);
    expect(result.blockedCount).toBe(1);
    expect(result.reasonFor('b')).toBe('person_attribution');
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
  });

  it('refers ONLY the ambiguous field — deterministic verdicts cost no LLM call', async () => {
    await batch([
      { key: 'a', fieldKind: 'note_text', text: CLEAR_TEXT },
      { key: 'b', fieldKind: 'note_text', text: BLOCKED_TEXT },
    ]);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('sends ONE judge call for two fields carrying the same text and field kind', async () => {
    judgeSays('allow', 'educational_reference');
    const result = await batch([
      { key: 'a', fieldKind: 'note_text', text: AMBIGUOUS_TEXT },
      { key: 'b', fieldKind: 'note_text', text: AMBIGUOUS_TEXT },
    ]);
    // One question, one answer — sending it twice would spend twice the budget
    // to risk two different verdicts for one decision.
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
    expect(result.isSafe('a')).toBe(true);
    expect(result.isSafe('b')).toBe(true);
  });

  it('does NOT share a judge verdict across different field kinds', async () => {
    // The field kind is part of the judge prompt, so it is a different question.
    judgeSays('allow', 'educational_reference');
    await batch([
      { key: 'a', fieldKind: 'note_text', text: AMBIGUOUS_TEXT },
      { key: 'b', fieldKind: 'learner_profile_field', text: AMBIGUOUS_TEXT },
    ]);
    expect(mockRouteAndCall).toHaveBeenCalledTimes(2);
  });

  it('treats a null or undefined field as safe while keeping its key enumerated', async () => {
    const result = await batch([
      { key: 'nullish', fieldKind: 'note_text', text: null },
      { key: 'absent', fieldKind: 'note_text', text: undefined },
    ]);
    // Safe because there is no string to persist — matches the shipped guard's
    // `scrub…(null) === null` contract at every nullable call site.
    expect(result.isSafe('nullish')).toBe(true);
    expect(result.isSafe('absent')).toBe(true);
    // ENUMERATED, not dropped: dropping them would make isSafe fail closed on a
    // legitimate null and silently discard it.
    expect(result.decisions.map((d) => d.key)).toEqual(['nullish', 'absent']);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED on a key the batch never evaluated', async () => {
    const result = await batch([
      { key: 'known', fieldKind: 'note_text', text: CLEAR_TEXT },
    ]);
    // The load-bearing property. A caller that evaluates before opening a
    // transaction and looks decisions up inside it cannot distinguish "never
    // evaluated" from "the text moved under me" — both must block. Returning
    // true here would make forgetting a field look exactly like success.
    expect(result.isSafe('never-enumerated')).toBe(false);
    expect(result.isSafe('known')).toBe(true);
  });

  it('resolves a duplicated key to the STRICTER decision', async () => {
    const result = await batch([
      { key: 'same', fieldKind: 'note_text', text: CLEAR_TEXT },
      { key: 'same', fieldKind: 'note_text', text: BLOCKED_TEXT },
    ]);
    // A caller reusing one key for two strings must not be able to launder the
    // unsafe one through the safe one, in either declaration order.
    expect(result.isSafe('same')).toBe(false);
  });

  it('resolves a duplicated key to the stricter decision in the reverse order too', async () => {
    const result = await batch([
      { key: 'same', fieldKind: 'note_text', text: BLOCKED_TEXT },
      { key: 'same', fieldKind: 'note_text', text: CLEAR_TEXT },
    ]);
    expect(result.isSafe('same')).toBe(false);
  });
});

describe('[WI-2628] an unresolved declared language scans under every language', () => {
  const evaluateWithoutLanguage = (text: string) =>
    evaluateLearningTextFields({
      fields: [{ key: 'f', fieldKind: 'note_text', text }],
      // What `parseConversationLanguage` returns for a null column or an
      // unrecognised code. Callers pass it straight through — the alternative,
      // substituting 'en', reinstates the English-only bug this WI removes.
      conversationLanguage: undefined,
      provenance: 'user',
    });

  it.each([
    ['Czech', 'Petr má dyslexii a potřebuje pomoc.'],
    ['Spanish', 'El alumno tiene TEA.'],
    ['German', 'Der Schüler hat ADS.'],
    ['Norwegian', 'Eleven har ADD.'],
    ['Japanese', '田中さんは自閉症です。'],
    ['English', 'Petr has dyslexia.'],
  ])(
    'blocks the %s person attribution with no declared language',
    async (_name, text) => {
      // The discriminating case. Under a declared 'en' the Czech/Spanish/German/
      // Norwegian/Japanese grammars are never compiled, so each of these would
      // classify ambiguous rather than block — i.e. defaulting an unresolved
      // language to 'en' silently restores the shipped guard's behavior.
      const result = await evaluateWithoutLanguage(text);
      expect(result.isSafe('f')).toBe(false);
    },
  );

  it('still keeps an ordinary sentence clear', async () => {
    // Scanning all ten grammars is more conservative, not indiscriminate — a
    // branch that blocked everything would pass the rows above for free.
    const result = await evaluateWithoutLanguage(CLEAR_TEXT);
    expect(result.isSafe('f')).toBe(true);
  });

  it('keeps a homograph mention clear across all ten grammars', async () => {
    const result = await evaluateWithoutLanguage(
      'I have tea with breakfast every morning.',
    );
    expect(result.isSafe('f')).toBe(true);
  });
});

describe('[WI-2628 AC-4] the batch inherits the judge fail-closed matrix', () => {
  const evaluateOne = (
    text: string,
    provenance: 'user' | 'llm' | 'migration',
    producerVendor: string | null = PRODUCER_VENDOR,
  ) =>
    evaluateLearningTextFields({
      fields: [{ key: 'f', fieldKind: 'note_text', text }],
      conversationLanguage: DECLARED_LANGUAGE,
      provenance,
      producerVendor,
    });

  it('blocks a judge verdict of block with its reason', async () => {
    judgeSays('block', 'diagnostic_inference');
    const result = await evaluateOne(AMBIGUOUS_TEXT, 'llm');
    expect(result.isSafe('f')).toBe(false);
    expect(result.reasonFor('f')).toBe('diagnostic_inference');
  });

  it('blocks when the judge route throws', async () => {
    mockRouteAndCall.mockRejectedValue(new Error('circuit open'));
    const result = await evaluateOne(AMBIGUOUS_TEXT, 'llm');
    expect(result.isSafe('f')).toBe(false);
    expect(result.reasonFor('f')).toBe('unclear');
  });

  it('blocks on a self-contradicting verdict/reason pair', async () => {
    judgeSays('allow', 'person_attribution');
    const result = await evaluateOne(AMBIGUOUS_TEXT, 'llm');
    expect(result.isSafe('f')).toBe(false);
  });

  it('blocks unparseable judge output', async () => {
    mockRouteAndCall.mockResolvedValue(routeResult('I cannot decide.'));
    const result = await evaluateOne(AMBIGUOUS_TEXT, 'llm');
    expect(result.isSafe('f')).toBe(false);
  });

  it.each([
    // [operator ruling 2026-07-26] 'user-authored ambiguous text' MOVED off this
    // list — it now reaches the judge (asserted immediately after this block).
    // The other two stay: migration/backfill has no live author, and an LLM
    // producer that cannot be named must not have its output judged by a vendor
    // the router failed to exclude.
    [
      'migration/backfill ambiguous text',
      'migration' as const,
      PRODUCER_VENDOR,
    ],
    ['llm text with no producer vendor', 'llm' as const, null],
  ])(
    'blocks %s without ever calling the judge',
    async (_name, provenance, vendor) => {
      judgeSays('allow', 'educational_reference');
      const result = await evaluateOne(AMBIGUOUS_TEXT, provenance, vendor);
      expect(result.isSafe('f')).toBe(false);
      expect(result.reasonFor('f')).toBe('unclear');
      // No external disclosure: the protected text never leaves the process on
      // these paths, so a judge that WOULD have allowed it is never consulted.
      expect(mockRouteAndCall).not.toHaveBeenCalled();
    },
  );

  it('routes user-authored ambiguous text to the judge and honours an allow', async () => {
    // The other half of the ruling: AC-4's allow/educational_reference is now
    // reachable in production, which it was not while user provenance blocked
    // outright.
    judgeSays('allow', 'educational_reference');
    const result = await evaluateOne(AMBIGUOUS_TEXT, 'user');
    expect(result.isSafe('f')).toBe(true);
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
  });

  it('still blocks user-authored ambiguous text when the judge blocks it', async () => {
    // "Goes to the judge" is not "passes" — the ruling moved the case, not the
    // fail-closed floor.
    judgeSays('block', 'person_attribution');
    const result = await evaluateOne(AMBIGUOUS_TEXT, 'user');
    expect(result.isSafe('f')).toBe(false);
    expect(result.reasonFor('f')).toBe('person_attribution');
  });

  it('still blocks user-authored ambiguous text when the judge is unavailable', async () => {
    mockRouteAndCall.mockRejectedValue(new Error('circuit open'));
    const result = await evaluateOne(AMBIGUOUS_TEXT, 'user');
    expect(result.isSafe('f')).toBe(false);
    expect(result.reasonFor('f')).toBe('unclear');
  });

  it('still blocks a user-authored PERSON ATTRIBUTION without consulting the judge', async () => {
    // The ruling moved ambiguous educational text only. Attribution is decided
    // deterministically, before the provenance matrix is reached, so it never
    // becomes a judge question at any provenance.
    const result = await evaluateOne(BLOCKED_TEXT, 'user');
    expect(result.isSafe('f')).toBe(false);
    expect(result.reasonFor('f')).toBe('person_attribution');
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });
});

describe('[WI-2628 AC-6] observability records field kind, reason and count — never the text', () => {
  let entries: LogEntry[];

  beforeEach(() => {
    entries = [];
    setStructuredLogSink((entry) => {
      entries.push(entry);
    });
  });

  afterEach(() => {
    setStructuredLogSink(null);
  });

  it('logs the field kind, reason and counts for a blocked batch', async () => {
    await evaluateLearningTextFields({
      fields: [
        { key: 'a', fieldKind: 'memory_fact', text: BLOCKED_TEXT },
        { key: 'b', fieldKind: 'note_text', text: CLEAR_TEXT },
      ],
      conversationLanguage: 'cs',
      provenance: 'llm',
      producerVendor: PRODUCER_VENDOR,
    });

    const logged = entries.filter((entry) =>
      entry.message.includes('learning-text-safety'),
    );
    expect(logged).toHaveLength(1);
    const context = logged[0]?.context as Record<string, unknown>;
    expect(context['blockedCount']).toBe(1);
    expect(context['fieldCount']).toBe(2);
    expect(context['blocked']).toEqual([
      { fieldKind: 'memory_fact', reason: 'person_attribution' },
    ]);
  });

  it('never writes the scanned text, or any fragment of it, to any log line', async () => {
    mockRouteAndCall.mockRejectedValue(
      // A thrown message that ECHOES the candidate text — the exact shape that
      // makes logging `error.message` a leak. judge.ts records the error CLASS
      // instead; this asserts the whole pipeline holds that line, so a doc
      // comment claiming "never the scanned text" cannot outlive the code.
      new Error(`upstream rejected body: ${SENTINEL_TEXT}`),
    );
    await evaluateLearningTextFields({
      fields: [{ key: 'a', fieldKind: 'note_text', text: SENTINEL_TEXT }],
      conversationLanguage: DECLARED_LANGUAGE,
      provenance: 'llm',
      producerVendor: PRODUCER_VENDOR,
    });

    const serialized = JSON.stringify(entries);
    expect(entries.length).toBeGreaterThan(0);
    expect(serialized).not.toContain('quibblefrotz');
    expect(serialized).not.toContain(SENTINEL_TEXT);
  });

  it('emits no log line when nothing was blocked', async () => {
    await evaluateLearningTextFields({
      fields: [{ key: 'a', fieldKind: 'note_text', text: CLEAR_TEXT }],
      conversationLanguage: DECLARED_LANGUAGE,
      provenance: 'llm',
      producerVendor: PRODUCER_VENDOR,
    });
    expect(
      entries.filter((entry) => entry.message.includes('learning-text-safety')),
    ).toHaveLength(0);
  });
});

describe('[WI-2628 AC-5] the user-mutation half raises where derived writes drop', () => {
  it('throws BadRequestError for an unsafe field', async () => {
    const result = await evaluateLearningTextFields({
      fields: [{ key: 'f', fieldKind: 'note_text', text: BLOCKED_TEXT }],
      conversationLanguage: 'cs',
      provenance: 'user',
    });
    expect(() => assertLearningTextSafe(result, 'f')).toThrow(BadRequestError);
    expect(() => assertLearningTextSafe(result, 'f')).toThrow(
      'Learning records cannot store a health or disability characterisation',
    );
  });

  it('does not disclose the reason, language or text in the raised message', () => {
    // AC-4's no-external-disclosure property applied to the client-facing error:
    // telling a caller WHY their text was refused is the disclosure.
    const thrown = (() => {
      try {
        assertLearningTextSafe(
          {
            decisions: [],
            blockedCount: 1,
            isSafe: () => false,
            reasonFor: () => 'person_attribution',
          },
          'f',
        );
      } catch (error) {
        return error as Error;
      }
      throw new Error('expected assertLearningTextSafe to throw');
    })();
    expect(thrown.message).not.toContain('person_attribution');
    expect(thrown.message).not.toContain('dyslexi');
  });

  it('does not throw for a safe field', async () => {
    const result = await evaluateLearningTextFields({
      fields: [{ key: 'f', fieldKind: 'note_text', text: CLEAR_TEXT }],
      conversationLanguage: DECLARED_LANGUAGE,
      provenance: 'user',
    });
    expect(() => assertLearningTextSafe(result, 'f')).not.toThrow();
  });

  it('throws for a key the batch never evaluated', async () => {
    const result = await evaluateLearningTextFields({
      fields: [],
      conversationLanguage: DECLARED_LANGUAGE,
      provenance: 'user',
    });
    expect(() => assertLearningTextSafe(result, 'missing')).toThrow(
      BadRequestError,
    );
  });
});

describe('[WI-2628] isLearningTextSafe — the single-field convenience', () => {
  it('returns true for clear text and false for blocked text', async () => {
    const common = {
      conversationLanguage: 'cs' as const,
      provenance: 'user' as const,
      fieldKind: 'note_text' as const,
    };
    await expect(
      isLearningTextSafe({ ...common, text: CLEAR_TEXT }),
    ).resolves.toBe(true);
    await expect(
      isLearningTextSafe({ ...common, text: BLOCKED_TEXT }),
    ).resolves.toBe(false);
  });

  it('routes an ambiguous LLM field through the judge', async () => {
    judgeSays('block', 'unclear');
    await expect(
      isLearningTextSafe({
        conversationLanguage: DECLARED_LANGUAGE,
        provenance: 'llm',
        producerVendor: PRODUCER_VENDOR,
        fieldKind: 'note_text',
        text: AMBIGUOUS_TEXT,
      }),
    ).resolves.toBe(false);
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
  });
});

describe('[WI-2628] content-addressed keys — evaluate before a transaction, re-verify inside', () => {
  const evaluateSet = (texts: readonly (string | null | undefined)[]) =>
    evaluateLearningTextByContent({
      texts,
      fieldKind: 'learner_profile_field',
      conversationLanguage: DECLARED_LANGUAGE,
      provenance: 'migration',
    });

  it('clears a string it evaluated and refuses one it did not', async () => {
    const result = await evaluateSet([CLEAR_TEXT]);
    expect(isContentSafe(result, CLEAR_TEXT)).toBe(true);
    // THE PROPERTY THE WHOLE DESIGN RESTS ON. A caller that pre-evaluates before
    // its transaction and re-derives the merged text inside it gets `false` for a
    // string that was not in the batch — which is what makes "the state moved
    // under me" indistinguishable from "this was never cleared". Both are unsafe
    // to persist, and neither requires a new failure mode.
    expect(isContentSafe(result, 'A different sentence entirely.')).toBe(false);
  });

  it('refuses a string that CHANGED after evaluation, even by one character', async () => {
    // The label-keyed failure this replaces: with a caller-chosen key, mutating
    // the text behind the label leaves the decision reading "safe". Keying on
    // content makes that unrepresentable.
    const result = await evaluateSet([CLEAR_TEXT]);
    expect(isContentSafe(result, CLEAR_TEXT)).toBe(true);
    expect(isContentSafe(result, `${CLEAR_TEXT} `)).toBe(false);
    expect(isContentSafe(result, CLEAR_TEXT.replace('two', 'three'))).toBe(
      false,
    );
  });

  it('carries the block verdict for an unsafe string it evaluated', async () => {
    const result = await evaluateSet([CLEAR_TEXT, BLOCKED_TEXT]);
    expect(isContentSafe(result, CLEAR_TEXT)).toBe(true);
    expect(isContentSafe(result, BLOCKED_TEXT)).toBe(false);
  });

  it('treats null and undefined as trivially safe — there is no string to persist', async () => {
    const result = await evaluateSet([CLEAR_TEXT, null, undefined]);
    expect(isContentSafe(result, null)).toBe(true);
    expect(isContentSafe(result, undefined)).toBe(true);
  });

  it('pins the empty string on the FAIL-CLOSED side — it is a string, so it is keyed', async () => {
    // Deliberately asymmetric with null/undefined above, and the asymmetry is the
    // ruled behavior rather than an oversight (2026-07-27): `null` short-circuits
    // before the key is computed, `''` does not. So an empty string the batch never
    // saw is REFUSED, which is the closed side of a distinction whose two sides
    // differ in safety direction. Pinned here so it cannot drift loose silently.
    const unevaluated = await evaluateSet([CLEAR_TEXT]);
    expect(isContentSafe(unevaluated, '')).toBe(false);
    expect(isContentSafe(unevaluated, '   ')).toBe(false);

    // And it clears normally once the batch has actually evaluated it, so the
    // refusal above is "unknown key", not "empty strings are unpersistable".
    const evaluated = await evaluateSet([CLEAR_TEXT, '']);
    expect(isContentSafe(evaluated, '')).toBe(true);
  });

  it('collapses duplicates to ONE field, and one judge call', async () => {
    // A merged projection routinely carries the same interest or note in both the
    // existing row and the incoming analysis.
    judgeSays('allow', 'educational_reference');
    const result = await evaluateLearningTextByContent({
      texts: [AMBIGUOUS_TEXT, AMBIGUOUS_TEXT, AMBIGUOUS_TEXT],
      fieldKind: 'learner_profile_field',
      conversationLanguage: DECLARED_LANGUAGE,
      provenance: 'llm',
      producerVendor: PRODUCER_VENDOR,
    });
    expect(result.decisions).toHaveLength(1);
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
    expect(isContentSafe(result, AMBIGUOUS_TEXT)).toBe(true);
  });

  it('produces a stable key that leaks no learner text', async () => {
    const key = learningTextContentKey(SENTINEL_TEXT);
    expect(key).toBe(learningTextContentKey(SENTINEL_TEXT));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    // The digest is safe to log — it is an observability correlator that cannot
    // violate AC-6, unlike the text or a caller label built from it.
    expect(key).not.toContain('quibblefrotz');
  });

  it('does NOT let two strings that merely normalize alike clear each other', async () => {
    // `scan.ts` normalizes for MATCHING only. Two strings that normalize alike are
    // still different strings to persist, so keying on the normalized form would
    // let a cleared one launder an unevaluated one.
    //
    // Both pairs below exercise a DIFFERENT folding mechanism in
    // `normalizeForMatching`, because a pair that folds under only one of them
    // would leave the other mechanism's laundering channel untested:
    //   - whitespace runs collapse to a single space (`scan.ts:551`)
    //   - default-ignorable codepoints are stripped (`scan.ts:548`)
    // Verified by probe: a zero-width space inside a protected lexeme classifies
    // identically to the plain form, so it really does fold.
    const result = await evaluateSet(['We read about volcanoes.']);
    expect(isContentSafe(result, 'We read about volcanoes.')).toBe(true);
    // Mechanism 1 — whitespace collapse.
    expect(isContentSafe(result, 'We  read  about  volcanoes.')).toBe(false);
    // Mechanism 2 — default-ignorable strip. A zero-width space sits inside
    // "volcanoes", so the bytes differ while the normalized form does not.
    expect(isContentSafe(result, 'We read about volc\u200Banoes.')).toBe(false);
  });
});

describe('[WI-3142] Article 9 status domains survive composition into the batch', () => {
  // The corpus extension is only a control if it reaches the thing the eight
  // write-time call sites actually call. Both cases run under the suite's
  // declared `cs`, which also demonstrates the always-on symmetry: an English
  // status attribution must block whatever conversation language is declared.
  const STATUS_ATTRIBUTION = 'The learner is Catholic.';
  const STATUS_MENTION =
    'The Reformation split the Catholic Church in the sixteenth century.';

  const evaluateProfileField = (text: string) =>
    evaluateLearningTextFields({
      fields: [{ key: 'f', fieldKind: 'learner_profile_field', text }],
      conversationLanguage: DECLARED_LANGUAGE,
      provenance: 'llm',
      producerVendor: PRODUCER_VENDOR,
    });

  it('blocks a religious-status attribution before it can be persisted', async () => {
    const result = await evaluateProfileField(STATUS_ATTRIBUTION);
    expect(result.isSafe('f')).toBe(false);
    expect(result.reasonFor('f')).toBe('person_attribution');
    // Decided deterministically, so the disclosure never leaves the process —
    // the same guarantee the health domain carries.
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('leaves the educational mention safe, and costs no judge call to say so', async () => {
    const result = await evaluateProfileField(STATUS_MENTION);
    expect(result.isSafe('f')).toBe(true);
    // The point of the attribution-scoped default: schoolwork on the
    // Reformation is `clear`, not `refer`, so it never reaches the judge.
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });
});
