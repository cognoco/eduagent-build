import { classifyPersistedLearningText } from './persisted-remediation';

// [WI-2753] Exercises the REAL gate — no internal mocks. The whole value of this
// classification is that it agrees with the live gate rather than restating a
// second term list (AC-3), so stubbing the gate would test nothing.

const classify = (
  rows: Parameters<typeof classifyPersistedLearningText>[0]['rows'],
) =>
  classifyPersistedLearningText({
    fieldKind: 'mentor_notice_concept',
    rows,
  });

describe('[WI-2753 AC-5] the discriminator: attribution is remediated, educational reference is not', () => {
  it('remediates a non-English diagnostic attribution at its declared language', async () => {
    const [verdict] = await classify([
      { id: 'es-1', text: 'El alumno tiene TEA.', conversationLanguage: 'es' },
    ]);

    expect(verdict).toMatchObject({
      id: 'es-1',
      disposition: 'remediate',
      reason: 'person_attribution',
    });
  });

  it('does NOT remediate a legitimate educational reference — it is reported for review', async () => {
    // The half of the red/green that actually discriminates. A remediation that
    // blanks everything the gate blocks passes the case above and fails here,
    // destroying the learner capability the 2026-07-26 ruling restored.
    const [verdict] = await classify([
      {
        id: 'edu-1',
        text: 'This chapter explains what dyslexia is.',
        conversationLanguage: 'en',
      },
    ]);

    expect(verdict?.disposition).toBe('review');
    expect(verdict?.disposition).not.toBe('remediate');
  });
});

describe('[WI-2753] a HEDGED attribution is remediated, not skipped', () => {
  // The correction that re-verification caught. `diagnostic_inference` and
  // `person_attribution` come from ONE branch of the scan and differ only by an
  // inference marker inside the attribution span, so keying remediation on the
  // unhedged label alone would leave hedged clinical text in the database —
  // precisely what this item exists to remove.
  it('treats both attribution reasons as remediable', async () => {
    const verdicts = await classify([
      { id: 'plain', text: 'El alumno tiene TEA.', conversationLanguage: 'es' },
      {
        id: 'hedged',
        text: 'El alumno probablemente tiene TEA.',
        conversationLanguage: 'es',
      },
    ]);

    expect(verdicts.map((v) => v.disposition)).toEqual([
      'remediate',
      'remediate',
    ]);
    // Asserted so a future change that collapses the two labels, or drops one
    // from the remediable set, fails here rather than silently under-remediating.
    expect(new Set(verdicts.map((v) => v.reason))).toEqual(
      new Set(['person_attribution', 'diagnostic_inference']),
    );
  });
});

describe('[WI-2753] the row’s declared language is load-bearing', () => {
  it('classifies a German attribution as remediable when its language is passed', async () => {
    const [verdict] = await classify([
      { id: 'de-1', text: 'Der Schüler hat ADHS.', conversationLanguage: 'de' },
    ]);

    expect(verdict?.disposition).toBe('remediate');
  });

  it('never renders an unresolved language as clear', async () => {
    // An unresolved language must not fail OPEN. The gate scans every grammar
    // and keeps the strictest verdict, so the row is still caught — the point of
    // this case is that `undefined` is passed through rather than defaulted to
    // English, which is the behaviour WI-2628 removed.
    const [verdict] = await classify([
      {
        id: 'unknown-1',
        text: 'Der Schüler hat ADHS.',
        conversationLanguage: undefined,
      },
    ]);

    expect(verdict?.disposition).not.toBe('clear');
  });
});

describe('[WI-2753 AC-4] idempotence', () => {
  it('returns the same verdicts for the same bytes across runs', async () => {
    const rows = [
      { id: 'a', text: 'El alumno tiene TEA.', conversationLanguage: 'es' },
      {
        id: 'b',
        text: 'This chapter explains what dyslexia is.',
        conversationLanguage: 'en',
      },
      {
        id: 'c',
        text: 'We read two chapters about volcanoes today.',
        conversationLanguage: 'en',
      },
    ] as const;

    const first = await classify([...rows]);
    const second = await classify([...rows]);

    expect(second).toEqual(first);
  });
});

describe('[WI-2753] rows with nothing to remediate', () => {
  it('clears safe text and absent text without a verdict of its own', async () => {
    const verdicts = await classify([
      {
        id: 'safe',
        text: 'We read two chapters about volcanoes today.',
        conversationLanguage: 'en',
      },
      { id: 'null', text: null, conversationLanguage: 'en' },
    ]);

    expect(verdicts.map((v) => v.disposition)).toEqual(['clear', 'clear']);
  });

  it('preserves input order and returns exactly one verdict per row', async () => {
    const verdicts = await classify([
      { id: 'one', text: 'El alumno tiene TEA.', conversationLanguage: 'es' },
      { id: 'two', text: null, conversationLanguage: 'de' },
      {
        id: 'three',
        text: 'Der Schüler hat ADHS.',
        conversationLanguage: 'de',
      },
    ]);

    expect(verdicts.map((v) => v.id)).toEqual(['one', 'two', 'three']);
  });
});
