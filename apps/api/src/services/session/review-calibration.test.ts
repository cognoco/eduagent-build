import { isSubstantiveCalibrationAnswer } from './review-calibration';

describe('isSubstantiveCalibrationAnswer', () => {
  it('accepts a meaningful recall answer', () => {
    expect(
      isSubstantiveCalibrationAnswer(
        'Photosynthesis turns sunlight, water, and carbon dioxide into glucose.',
      ),
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
        "I don't remember any of this, it's been ages.",
      ),
    ).toBe(false);
  });

  it('accepts meaningful Japanese recall without whitespace-delimited words', () => {
    expect(
      isSubstantiveCalibrationAnswer(
        '光合成は植物が光を使って栄養を作る仕組みです',
        'ja',
      ),
    ).toBe(true);
  });

  it('[F-161] does not reject answers whose words merely contain a non-answer token as a substring', () => {
    // German: 'nah' is a non-answer token but 'nahe' is a legitimate German word (meaning 'close')
    expect(
      isSubstantiveCalibrationAnswer(
        'Fotosynthese ist nahe am Herzen der Biologie und produziert Sauerstoff',
        'de',
      ),
    ).toBe(true);

    // Spanish: 'nada' is a non-answer token but appears inside the word 'granada'
    expect(
      isSubstantiveCalibrationAnswer(
        'En Granada, la arquitectura islamica refleja siglos de historia cultural',
        'es',
      ),
    ).toBe(true);
  });

  it('[F-161] still rejects CJK non-answers that contain the token as an embedded substring (no word separators)', () => {
    // わかりません is a non-answer token for 'ja'. わかりませんでした includes it
    // as a grammatical extension — still a non-answer admission.
    expect(isSubstantiveCalibrationAnswer('わかりませんでした', 'ja')).toBe(
      false,
    );

    // A substantive Japanese answer that does NOT contain the token is accepted.
    expect(
      isSubstantiveCalibrationAnswer(
        '光合成は植物が太陽の光を使ってエネルギーを作るプロセスです',
        'ja',
      ),
    ).toBe(true);
  });

  it('[F-161] mixed-script answers keep word-boundary checks for Latin tokens (per-token script decision)', () => {
    // A substantive German answer that contains a CJK term must NOT lose the
    // word-boundary guard for its Latin tokens: 'nah' is embedded in 'nahe'
    // and must not match just because the answer also contains 光合成.
    expect(
      isSubstantiveCalibrationAnswer(
        'Fotosynthese (光合成) ist nahe am Herzen der Biologie und produziert Sauerstoff',
        'de',
      ),
    ).toBe(true);
  });

  it('[F-161] still rejects ?-suffixed non-answers (normalizeAnswer retains the ? character)', () => {
    // normalizeAnswer keeps '?' (the standalone '?' token must stay matchable),
    // so a trailing '?' sits directly against the token. The word-boundary
    // guard must treat '?' as a boundary, or these common chat-style
    // non-answers slip through as "substantive".
    expect(
      isSubstantiveCalibrationAnswer(
        'idk? something with water and light i think',
      ),
    ).toBe(false);
    expect(
      isSubstantiveCalibrationAnswer(
        "i don't know? it has to do with plants and sunlight",
      ),
    ).toBe(false);
  });
});
