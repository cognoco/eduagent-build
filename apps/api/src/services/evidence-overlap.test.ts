import { validateEvidenceOverlap } from './evidence-overlap';

describe('validateEvidenceOverlap', () => {
  it('accepts a grounded fragment against authoritative learner text', () => {
    const result = validateEvidenceOverlap(
      'moved minus three and kept it negative',
      'I moved minus three to the other side and kept it negative',
      0.4,
    );
    expect(result.ok).toBe(true);
    expect(result.overlapRatio).toBeGreaterThanOrEqual(0.4);
  });

  it('rejects topic drift', () => {
    expect(
      validateEvidenceOverlap(
        'mitochondria make energy',
        'I moved minus three to the other side',
        0.4,
      ),
    ).toMatchObject({ ok: false, reason: 'low_lexical_overlap' });
  });

  it('uses the shared character n-gram mode for non-spaced scripts', () => {
    expect(
      validateEvidenceOverlap(
        '光合成は葉緑体で行われます',
        '光合成は葉緑体で行われます',
        0.4,
      ).ok,
    ).toBe(true);
  });
});
