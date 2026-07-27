import { evaluateLearningTextByContent } from '../learning-text-safety/gate';
import {
  buildBackfillRowsForProfile,
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
});
