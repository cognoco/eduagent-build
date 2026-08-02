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

const ATTRIBUTIONS = [
  ['es', 'El alumno tiene TEA.'],
  ['de', 'Der Schüler hat ADHS.'],
  ['cs', 'Petr má dyslexii.'],
  ['fr', "L'élève a un TDAH."],
  ['en', 'Emma has ADHD.'],
] as const;

const EDUCATIONAL = 'This chapter explains what dyslexia is.';
const EDUCATIONAL_2 = 'Dyslexia is a reading difference that affects decoding.';
const BENIGN = 'We read two chapters about volcanoes today.';

describe('[WI-2753 AC-5] the discriminator: attribution is remediated, educational reference is not', () => {
  it('remediates a non-English diagnostic attribution', async () => {
    const [verdict] = await classify([
      { id: 'es-1', text: 'El alumno tiene TEA.' },
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
    const verdicts = await classify([
      { id: 'edu-1', text: EDUCATIONAL },
      { id: 'edu-2', text: EDUCATIONAL_2 },
    ]);

    for (const verdict of verdicts) {
      expect(verdict.disposition).toBe('review');
      expect(verdict.disposition).not.toBe('remediate');
    }
  });
});

describe('[WI-2753] every grammar is scanned, so no declared language is needed', () => {
  // The reviewer finding this replaced: the first implementation joined
  // `person.conversation_language`, which is the learner's CURRENT, MUTABLE
  // preference rather than provenance stored with the row. A learner who wrote
  // Spanish notes and later switched to English would have had their clinical
  // rows scanned under the wrong grammar and silently missed.
  it.each(ATTRIBUTIONS)(
    'catches the %s attribution with no language supplied',
    async (_language, text) => {
      const [verdict] = await classify([{ id: 'row', text }]);

      expect(verdict?.disposition).toBe('remediate');
    },
  );

  it('does not manufacture an attribution for educational or benign text', async () => {
    // The safety side of scanning every grammar: a broader scan must find more
    // TRUE positives without inventing false ones, because a false positive here
    // destroys learner-authored text.
    const verdicts = await classify([
      { id: 'edu-1', text: EDUCATIONAL },
      { id: 'edu-2', text: EDUCATIONAL_2 },
      { id: 'benign', text: BENIGN },
    ]);

    expect(verdicts.map((v) => v.disposition)).toEqual([
      'review',
      'review',
      'clear',
    ]);
  });
});

describe('[WI-2753] a HEDGED attribution is remediated, not skipped', () => {
  // `diagnostic_inference` and `person_attribution` come from ONE branch of the
  // scan and differ only by an inference marker inside the attribution span, so
  // keying remediation on the unhedged label alone would leave hedged clinical
  // text in the database — precisely what this item exists to remove.
  it('treats both attribution reasons as remediable', async () => {
    const verdicts = await classify([
      { id: 'plain', text: 'El alumno tiene TEA.' },
      { id: 'hedged', text: 'El alumno probablemente tiene TEA.' },
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

describe('[WI-2753 AC-4] idempotence', () => {
  it('returns the same verdicts for the same bytes across runs', async () => {
    const rows = [
      { id: 'a', text: 'El alumno tiene TEA.' },
      { id: 'b', text: EDUCATIONAL },
      { id: 'c', text: BENIGN },
    ];

    const first = await classify(rows);
    const second = await classify(rows);

    expect(second).toEqual(first);
  });

  it('classifies the redaction placeholder itself as clear', async () => {
    // What makes a re-run a no-op rather than a second scrub.
    const [verdict] = await classify([
      { id: 'placeholder', text: '[redacted: clinical inference removed]' },
    ]);

    expect(verdict?.disposition).toBe('clear');
  });
});

describe('[WI-2753] rows with nothing to remediate', () => {
  it('clears safe text and absent text', async () => {
    const verdicts = await classify([
      { id: 'safe', text: BENIGN },
      { id: 'null', text: null },
    ]);

    expect(verdicts.map((v) => v.disposition)).toEqual(['clear', 'clear']);
  });

  it('preserves input order and returns exactly one verdict per row', async () => {
    const verdicts = await classify([
      { id: 'one', text: 'El alumno tiene TEA.' },
      { id: 'two', text: null },
      { id: 'three', text: 'Der Schüler hat ADHS.' },
    ]);

    expect(verdicts.map((v) => v.id)).toEqual(['one', 'two', 'three']);
  });
});
