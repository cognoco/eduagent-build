import { validateNoteDraft } from './note-draft';

const solidLearnerQuotes = [
  'Photosynthesis happens in chloroplasts. The plant uses light energy to convert carbon dioxide and water into glucose.',
  'ATP is the energy currency of the cell.',
];

describe('validateNoteDraft — accepts grounded drafts', () => {
  it('accepts a draft whose vocabulary overlaps strongly with the learner', () => {
    const draft =
      'Photosynthesis takes place in chloroplasts. Light energy converts carbon dioxide and water into glucose. ATP is the cell energy currency.';
    const r = validateNoteDraft(draft, solidLearnerQuotes);
    expect(r.ok).toBe(true);
    expect(r.overlapRatio).toBeGreaterThan(0.4);
  });

  it('accepts a short but meaningful draft (n-gram fallback path)', () => {
    expect(
      validateNoteDraft('ATP stores energy.', ['ATP stores energy.']).ok,
    ).toBe(true);
  });

  it('reports overlapRatio above threshold for an accepted draft', () => {
    const r = validateNoteDraft(
      'Photosynthesis happens in chloroplasts. ATP is energy currency.',
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
    const r = validateNoteDraft(draft, solidLearnerQuotes);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('low_lexical_overlap');
  });

  it('rejects an empty draft with reason=empty', () => {
    const r = validateNoteDraft('', solidLearnerQuotes);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('empty');
  });

  it('rejects a whitespace-only draft', () => {
    expect(validateNoteDraft('   \n\t', solidLearnerQuotes).ok).toBe(false);
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
    expect(validateNoteDraft(draft, solidLearnerQuotes).ok).toBe(false);
    expect(validateNoteDraft(draft, wrongIdeas).ok).toBe(true);
  });
});

describe('validateNoteDraft — Unicode + non-Latin tokenization (MED-10)', () => {
  it('accepts accented Latin (Czech) when the draft mirrors the learner', () => {
    const quotes = ['Fotosyntéza probíhá v chloroplastech a vytváří glukózu.'];
    const draft = 'Fotosyntéza probíhá v chloroplastech a vytváří glukózu.';
    expect(validateNoteDraft(draft, quotes).ok).toBe(true);
  });

  it('accepts non-spaced script (Japanese) via the character n-gram fallback', () => {
    const quotes = ['光合成は葉緑体で行われます'];
    const draft = '光合成は葉緑体で行われます';
    expect(validateNoteDraft(draft, quotes).ok).toBe(true);
  });

  it('rejects a Japanese draft that drifts to an unrelated string', () => {
    const quotes = ['光合成は葉緑体で行われます'];
    const draft = '今日の天気は晴れです';
    expect(validateNoteDraft(draft, quotes).ok).toBe(false);
  });
});
