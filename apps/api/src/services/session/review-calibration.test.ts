import { isSubstantiveCalibrationAnswer } from './review-calibration';

describe('isSubstantiveCalibrationAnswer', () => {
  it('accepts a meaningful recall answer', () => {
    expect(
      isSubstantiveCalibrationAnswer(
        'Photosynthesis turns sunlight, water, and carbon dioxide into glucose.'
      )
    ).toBe(true);
  });

  it('rejects short English non-answers', () => {
    expect(isSubstantiveCalibrationAnswer('idk')).toBe(false);
    expect(isSubstantiveCalibrationAnswer("I don't know")).toBe(false);
    expect(isSubstantiveCalibrationAnswer('not sure')).toBe(false);
  });

  it('rejects locale-aware non-answers', () => {
    expect(isSubstantiveCalibrationAnswer('vet ikke', 'nb')).toBe(false);
    expect(isSubstantiveCalibrationAnswer('weiß nicht', 'de')).toBe(false);
    expect(isSubstantiveCalibrationAnswer('わからない', 'ja')).toBe(false);
  });

  it('rejects tiny answers even when they are not explicit non-answer tokens', () => {
    expect(isSubstantiveCalibrationAnswer('maybe')).toBe(false);
    expect(isSubstantiveCalibrationAnswer('kind of yes')).toBe(false);
  });

  it('rejects longer explicit non-answer phrases', () => {
    expect(
      isSubstantiveCalibrationAnswer(
        "I don't remember any of this, it's been ages."
      )
    ).toBe(false);
  });

  it('accepts meaningful Japanese recall without whitespace-delimited words', () => {
    expect(
      isSubstantiveCalibrationAnswer(
        '光合成は植物が光を使って栄養を作る仕組みです',
        'ja'
      )
    ).toBe(true);
  });
});
