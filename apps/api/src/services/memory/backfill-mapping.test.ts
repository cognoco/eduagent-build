import { evaluateLearningTextByContent } from '../learning-text-safety/gate';
import {
  buildBackfillRowsForProfile,
  buildMemoryFactRowsFromProjection,
  filterGatedMemoryFactRows,
  normalizeMemoryText,
  type MemoryFactInsert,
} from './backfill-mapping';

describe('memory facts backfill mapping', () => {
  it('normalizes text with the same trim/lowercase semantics as legacy memory', () => {
    expect(normalizeMemoryText('  Fractions  ')).toBe('fractions');
  });

  it('maps all JSONB memory categories into fact rows', () => {
    const createdAt = new Date('2026-05-01T00:00:00.000Z');
    const result = buildBackfillRowsForProfile({
      profileId: '018f8f3e-0000-7000-8000-000000000001',
      strengths: [
        {
          subject: 'Math',
          topics: ['fractions'],
          confidence: 'high',
          source: 'inferred',
        },
      ],
      struggles: [
        {
          subject: 'Math',
          topic: 'division',
          lastSeen: '2026-04-30T12:00:00.000Z',
          attempts: 3,
          confidence: 'medium',
        },
      ],
      interests: ['space'],
      communicationNotes: ['prefers examples'],
      suppressedInferences: ['dinosaurs'],
      interestTimestamps: { space: '2026-04-29T10:00:00.000Z' },
      createdAt,
    });

    expect(result.malformed).toEqual([]);
    expect(result.rows.map((row: MemoryFactInsert) => row.category)).toEqual([
      'strength',
      'struggle',
      'interest',
      'communication_note',
      'suppressed',
    ]);
    expect(
      result.rows.find((row: MemoryFactInsert) => row.category === 'interest'),
    ).toEqual(
      expect.objectContaining({
        text: 'space',
        observedAt: new Date('2026-04-29T10:00:00.000Z'),
      }),
    );
  });

  // [WI-2628] The safety filter no longer lives in the builder. The builder emits
  // CANDIDATES; the async consumer evaluates them against the multilingual gate and
  // calls `filterGatedMemoryFactRows`. These two tests are the pair that keeps that
  // split honest — the first asserts candidates are unfiltered (so a consumer that
  // forgets the filter is visibly persisting clinical text), the second asserts the
  // filter is what drops them.
  const CLINICAL_EN = 'The learner shows signs of dyslexia.';
  // The multilingual case the OLD English-only guard did not catch, and the reason
  // this WI exists: a Czech person-attribution.
  const CLINICAL_CS = 'Petr má dyslexii a potřebuje pomoc.';
  // Contains a protected lexeme with no person attributed, so the deterministic scan
  // returns `refer` — the judge's call. But `provenance: 'migration'` never consults
  // the judge (AC-4), so on THIS path it fails closed. Kept as a named case because
  // the behaviour change is real: the old English-only guard retained this row.
  const AMBIGUOUS_EDUCATIONAL = 'ADHD can affect executive function.';
  // No protected lexeme in any of the ten corpora — deterministically clear.
  const CLEAR_EDUCATIONAL = 'The learner responds well to worked examples.';

  const buildNotesProfile = (notes: string[]) =>
    buildBackfillRowsForProfile({
      profileId: '018f8f3e-0000-7000-8000-000000000001',
      strengths: [],
      struggles: [],
      interests: [],
      communicationNotes: notes,
      suppressedInferences: [],
      interestTimestamps: {},
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });

  it('[WI-2628] emits candidates WITHOUT filtering — the builder is not the gate', () => {
    const result = buildNotesProfile([
      CLINICAL_EN,
      CLINICAL_CS,
      AMBIGUOUS_EDUCATIONAL,
    ]);
    expect(result.rows.map((row) => row.text)).toEqual([
      CLINICAL_EN,
      CLINICAL_CS,
      AMBIGUOUS_EDUCATIONAL,
    ]);
  });

  it('[WI-2628] filterGatedMemoryFactRows drops clinical rows in EVERY language, and on this migration path anything ambiguous too', async () => {
    const rows = buildNotesProfile([
      CLINICAL_EN,
      CLINICAL_CS,
      AMBIGUOUS_EDUCATIONAL,
      CLEAR_EDUCATIONAL,
    ]).rows;

    const gate = await evaluateLearningTextByContent({
      texts: rows.map((row) => row.text),
      fieldKind: 'learner_profile_field',
      // Never `'en'` — the whole point of the WI. `undefined` scans all ten
      // attribution grammars and keeps the strictest verdict, which is what makes
      // the Czech row block without a declared Czech profile.
      conversationLanguage: undefined,
      provenance: 'migration',
    });

    // Only the deterministically-clear row survives. The Czech attribution is the
    // case the old English-only guard missed entirely; `AMBIGUOUS_EDUCATIONAL` is
    // dropped because migration provenance never reaches the judge.
    expect(
      filterGatedMemoryFactRows(rows, gate).map((row) => row.text),
    ).toEqual([CLEAR_EDUCATIONAL]);
  });

  it('[WI-2628] drops a row the batch never evaluated — absence fails closed', async () => {
    const rows = buildNotesProfile([
      CLEAR_EDUCATIONAL,
      'The learner enjoys reading aloud.',
    ]).rows;
    // Evaluate only the FIRST row, then filter both: the unevaluated row must be
    // dropped even though it is perfectly safe text. This is the property that makes
    // "the profile changed between the pre-read and the locked read" fail closed for
    // free in the Inngest consumer.
    const gate = await evaluateLearningTextByContent({
      texts: [rows[0]!.text],
      fieldKind: 'learner_profile_field',
      conversationLanguage: undefined,
      provenance: 'migration',
    });

    expect(
      filterGatedMemoryFactRows(rows, gate).map((row) => row.text),
    ).toEqual([CLEAR_EDUCATIONAL]);
  });

  // -------------------------------------------------------------------------
  // [WI-2628] CASE 3 — the pre-evaluation saw non-empty text, and the value
  // re-derived inside the transaction is null/undefined.
  //
  // Reachable here in a way it is not on the dedup chain: these consumers
  // re-derive rows from a row read under `FOR UPDATE`, and a JSONB field that
  // held a string at pre-read time can be null by then. `isContentSafe(gate,
  // null)` is TRUE by contract — there is no string to persist — and the trap is
  // reading that true as "this batch is cleared, proceed". It clears exactly one
  // absent value and nothing around it.
  // -------------------------------------------------------------------------
  it('[WI-2628] a null-text row is trivially safe and does NOT clear an unsafe sibling', async () => {
    const rows = buildNotesProfile([CLINICAL_CS, CLEAR_EDUCATIONAL]).rows;
    // Stand in for the in-transaction re-derive yielding no string for a row the
    // pre-evaluation saw as non-empty text.
    const withAbsentText: MemoryFactInsert[] = [
      { ...rows[0]!, text: null as unknown as string },
      ...rows,
    ];

    const gate = await evaluateLearningTextByContent({
      texts: rows.map((row) => row.text),
      fieldKind: 'learner_profile_field',
      conversationLanguage: undefined,
      provenance: 'migration',
    });

    const survivors = filterGatedMemoryFactRows(withAbsentText, gate).map(
      (row) => row.text,
    );
    // The absent value passes (nothing to persist). The Czech attribution it was
    // derived from is still dropped — a safe-on-null verdict is not a
    // proceed-signal for the surrounding write.
    expect(survivors).toEqual([null, CLEAR_EDUCATIONAL]);
    expect(survivors).not.toContain(CLINICAL_CS);
  });

  it('[WI-2628] buildMemoryFactRowsFromProjection no longer applies the retired English-only scrub', () => {
    // The legacy scrub used to run inside this builder's dedupe step, so an
    // English clinical row never reached a caller. It is gone: the builder emits
    // candidates and the gate decides. Asserted on the ENGLISH case specifically,
    // because that is the only one the retired guard ever caught — a green here on
    // the Czech row would prove nothing about the removal.
    const rows = buildMemoryFactRowsFromProjection(
      '018f8f3e-0000-7000-8000-000000000001',
      {
        strengths: [],
        struggles: [],
        interests: [],
        communicationNotes: [CLINICAL_EN, CLEAR_EDUCATIONAL],
        suppressedInferences: [],
        interestTimestamps: {},
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    );
    expect(rows.map((row) => row.text)).toEqual([
      CLINICAL_EN,
      CLEAR_EDUCATIONAL,
    ]);
  });
});
