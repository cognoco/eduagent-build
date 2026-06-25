import { validateNoteDraft } from './note-draft';

const solidLearnerQuotes = [
  'Photosynthesis happens in chloroplasts. The plant uses light energy to convert carbon dioxide and water into glucose.',
  'ATP is the energy currency of the cell.',
];

describe('validateNoteDraft — accepts grounded drafts', () => {
  it('accepts a draft whose vocabulary overlaps strongly with the learner', () => {
    const draft =
      'Photosynthesis takes place in chloroplasts. Light energy converts carbon dioxide and water into glucose. ATP is the cell energy currency.';
    // test isolation: passes solidLearnerQuotes as verified content (no DB in unit test)
    const r = validateNoteDraft(draft, solidLearnerQuotes, solidLearnerQuotes);
    expect(r.ok).toBe(true);
    expect(r.overlapRatio).toBeGreaterThan(0.4);
  });

  it('accepts a short but meaningful draft (n-gram fallback path)', () => {
    // test isolation: passes solidLearnerQuotes as verified content (no DB in unit test)
    expect(
      validateNoteDraft(
        'ATP stores energy.',
        ['ATP stores energy.'],
        ['ATP stores energy.'],
      ).ok,
    ).toBe(true);
  });

  it('reports overlapRatio above threshold for an accepted draft', () => {
    // test isolation: passes solidLearnerQuotes as verified content (no DB in unit test)
    const r = validateNoteDraft(
      'Photosynthesis happens in chloroplasts. ATP is energy currency.',
      solidLearnerQuotes,
      solidLearnerQuotes,
    );
    expect(r.ok).toBe(true);
    expect(r.overlapRatio).toBeGreaterThan(0.4);
  });
});

describe('validateNoteDraft — rejects ungrounded drafts (HIGH-1 topic drift)', () => {
  it('rejects a draft that invents new topic content', () => {
    const draft =
      'The Krebs cycle is essential for cellular respiration and produces NADH and FADH2 electron carriers.';
    // test isolation: passes solidLearnerQuotes as verified content (no DB in unit test)
    const r = validateNoteDraft(draft, solidLearnerQuotes, solidLearnerQuotes);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('low_lexical_overlap');
  });

  it('rejects an empty draft with reason=empty', () => {
    // test isolation: passes solidLearnerQuotes as verified content (no DB in unit test)
    const r = validateNoteDraft('', solidLearnerQuotes, solidLearnerQuotes);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('empty');
  });

  it('rejects a whitespace-only draft', () => {
    // test isolation: passes solidLearnerQuotes as verified content (no DB in unit test)
    expect(
      validateNoteDraft('   \n\t', solidLearnerQuotes, solidLearnerQuotes).ok,
    ).toBe(false);
  });

  // HIGH-6 boundary: callers must pass only solid quotes. The guard
  // measures overlap against whatever it receives, so if you accidentally
  // pass non-solid quotes the draft can pass; that is a *caller* bug, not
  // a guard bug. This test pins both sides of the contract.
  it('rejects when overlap is only with non-solid text (caller contract)', () => {
    const wrongIdeas = [
      'photosynthesis happens in the nucleus',
      'ATP means atomic transfer power',
    ];
    const draft =
      'Photosynthesis happens in the nucleus and ATP means atomic transfer power.';
    // test isolation: passes solidLearnerQuotes as verified content (no DB in unit test)
    expect(
      validateNoteDraft(draft, solidLearnerQuotes, solidLearnerQuotes).ok,
    ).toBe(false);
    expect(validateNoteDraft(draft, wrongIdeas, wrongIdeas).ok).toBe(true);
  });
});

// [BUG-483] Break tests: verify that the verifiedEventContents path closes the
// value-substitution attack surface.
//
// Attack: LLM produces a paraphrase whose vocabulary overlaps with its own
// draft, making the guard a no-op.  Real learner text ("yeah mitochondria")
// does NOT overlap sufficiently with the fabricated draft.
describe('validateNoteDraft — verified event contents guard [BUG-483]', () => {
  it('PASSES (false safe) when LLM paraphrase is passed as verified content (demonstrates the pre-fix vulnerability)', () => {
    // LLM says the learner answered "the powerhouse of the cell is the mitochondria"
    // — but the learner actually just said "yeah mitochondria".
    const llmParaphrase = ['the powerhouse of the cell is the mitochondria'];
    // LLM-drafted note reuses its own paraphrase vocabulary → overlap ≈ 1.0
    const fabricatedDraft =
      'The mitochondria is the powerhouse of the cell. It produces energy for life.';
    // Passing llmParaphrase as BOTH solidLearnerQuotes and verifiedEventContents
    // demonstrates the attack: when the LLM controls both inputs the guard is a no-op.
    const result = validateNoteDraft(
      fabricatedDraft,
      llmParaphrase,
      llmParaphrase,
    );
    // Guard passes because LLM paraphrase + LLM draft share the same vocabulary.
    // This is the vulnerability: the guard does NOT catch value substitution here.
    expect(result.ok).toBe(true);
  });

  it('[BUG-483] REJECTS when verified event content is sparse (real learner said little)', () => {
    const llmParaphrase = ['the powerhouse of the cell is the mitochondria'];
    const verifiedEventContent = ['yeah mitochondria'];
    // Same LLM-drafted note — but now the guard tokenizes the REAL learner text.
    const fabricatedDraft =
      'The mitochondria is the powerhouse of the cell. It produces energy for life.';
    const result = validateNoteDraft(
      fabricatedDraft,
      llmParaphrase,
      verifiedEventContent,
    );
    // "mitochondria" is in both, but "powerhouse", "cell", "produces", "energy",
    // "life" are in the draft but NOT in "yeah mitochondria" → overlap < 0.4.
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('low_lexical_overlap');
  });

  it('[BUG-483] ACCEPTS when verified event content matches the draft well', () => {
    // Learner actually said something meaningful that aligns with the draft.
    const llmParaphrase = ['the powerhouse of the cell is the mitochondria'];
    const verifiedEventContent = [
      'mitochondria is like the powerhouse makes all the energy for the cell',
    ];
    const groundedDraft =
      'Mitochondria produce energy for the cell. They are the powerhouse.';
    const result = validateNoteDraft(
      groundedDraft,
      llmParaphrase,
      verifiedEventContent,
    );
    expect(result.ok).toBe(true);
  });

  it('[BUG-483] falls back to solidLearnerQuotes when verifiedEventContents is empty', () => {
    // Empty verifiedEventContents array → fallback to solidLearnerQuotes behaviour.
    const quotes = [
      'Photosynthesis happens in chloroplasts. The plant converts light energy into glucose.',
    ];
    const draft =
      'Photosynthesis converts light energy into glucose inside chloroplasts.';
    const withEmpty = validateNoteDraft(draft, quotes, []);
    // Passing quotes as verifiedEventContents is equivalent to fallback (same source data)
    const withSolidQuotes = validateNoteDraft(draft, quotes, quotes);
    expect(withEmpty.ok).toBe(withSolidQuotes.ok);
    expect(withEmpty.overlapRatio).toBe(withSolidQuotes.overlapRatio);
  });

  // [WI-1056] Regression: solidLearnerQuotes overlap with draft but verifiedEventContents do not.
  // Before the fix (optional param), passing only solidLearnerQuotes would make this pass.
  // With verifiedEventContents required and containing non-overlapping content, it must reject.
  it('[WI-1056] REJECTS when solidLearnerQuotes overlap with draft but verifiedEventContents do not', () => {
    // The LLM-generated paraphrase ("photosynthesis takes place in chloroplasts…")
    // overlaps with the draft. The verified event content is sparse ("yeah sunlight").
    const solidParaphrase = [
      'Photosynthesis takes place in chloroplasts using light energy to produce glucose.',
    ];
    const draft =
      'Photosynthesis takes place in chloroplasts and produces glucose using light energy.';
    const verifiedEventContent = ['yeah sunlight'];

    // With solidParaphrase as verifiedEventContents → overlap is high → PASSES
    const withSolidAsVerified = validateNoteDraft(
      draft,
      solidParaphrase,
      solidParaphrase,
    );
    expect(withSolidAsVerified.ok).toBe(true);

    // With sparse real content as verifiedEventContents → overlap is low → REJECTS
    const withRealContent = validateNoteDraft(
      draft,
      solidParaphrase,
      verifiedEventContent,
    );
    expect(withRealContent.ok).toBe(false);
    expect(withRealContent.reason).toBe('low_lexical_overlap');
  });
});

describe('validateNoteDraft — Unicode + non-Latin tokenization (MED-10)', () => {
  it('accepts accented Latin (Czech) when the draft mirrors the learner', () => {
    const quotes = ['Fotosyntéza probíhá v chloroplastech a vytváří glukózu.'];
    const draft = 'Fotosyntéza probíhá v chloroplastech a vytváří glukózu.';
    // test isolation: passes quotes as verified content (no DB in unit test)
    expect(validateNoteDraft(draft, quotes, quotes).ok).toBe(true);
  });

  it('accepts non-spaced script (Japanese) via the character n-gram fallback', () => {
    const quotes = ['光合成は葉緑体で行われます'];
    const draft = '光合成は葉緑体で行われます';
    // test isolation: passes quotes as verified content (no DB in unit test)
    expect(validateNoteDraft(draft, quotes, quotes).ok).toBe(true);
  });

  it('rejects a Japanese draft that drifts to an unrelated string', () => {
    const quotes = ['光合成は葉緑体で行われます'];
    const draft = '今日の天気は晴れです';
    // test isolation: passes quotes as verified content (no DB in unit test)
    expect(validateNoteDraft(draft, quotes, quotes).ok).toBe(false);
  });
});

// Correctness-lens finding: when the draft and the learner source land in
// different tokenization modes (word-tokens on one side, character-bigrams on
// the other) the two sets are in different alphabets and overlap is
// structurally 0, fail-closing a legitimately grounded draft. Both sides must
// share one mode.
describe('validateNoteDraft — shared tokenization mode across draft and source', () => {
  it('does not fail-close a grounded draft when the learner answer is a single content word', () => {
    // Pre-fix: the draft yields 3 word-tokens ("mitochondria", "make",
    // "energy") so it tokenized in WORD mode, while the one-word learner source
    // ("mitochondria") fell back to character-bigrams — the two sets were in
    // different alphabets and overlap was structurally 0, wrongly rejecting a
    // clearly-grounded draft. With a single shared mode (both fall back to
    // bigrams) the substantial character overlap is recognized.
    const verifiedEventContent = ['mitochondria'];
    const draft = 'Mitochondria make energy.';
    const result = validateNoteDraft(
      draft,
      ['mitochondria'],
      verifiedEventContent,
    );
    expect(result.ok).toBe(true);
    expect(result.overlapRatio).toBeGreaterThan(0.4);
  });
});
