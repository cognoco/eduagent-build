// WI-1823 — deterministic regex checks pinning the enduser-gate quality
// patterns this work item changed. Each `expect` is the "green" of a
// red-green-revert: reverting the corresponding recalibration in
// enduser-quality-patterns.ts flips the asserted case and fails the test.

import {
  FOUR_STRANDS_CORRECTION_RE,
  FOUR_STRANDS_EXPLAINS_EN_RE,
  LEARNING_SOURCE_POINT_RE,
  RECITATION_UNSUPPORTED_POLISH_RE,
  recitationPolishAddedFact,
  sourceAuditNoFactualClaim,
} from './enduser-quality-patterns';

const learningSourcePointCount = (text: string): number =>
  LEARNING_SOURCE_POINT_RE.filter((pattern) => pattern.test(text)).length;

describe('LEARNING_SOURCE_POINT_RE (learning_opening_too_thin)', () => {
  // Captured postfix1 opener: three genuine source points via faithful synonyms
  // (linked/travel/smoother). The gate passes when >= 2 points are detected.
  const faithfulSynonymOpener =
    'Roman roads linked many towns across the empire. They let armies travel between places. They also made it easier to move goods, so trade was smoother. Why would linking towns with roads make trade easier?';
  // Captured diag1 opener: makes essentially one compound point then asks a
  // question — genuinely too thin. Must stay below the >= 2 threshold.
  const thinOpener =
    'They also linked towns, which made it easier to move goods across the empire. Explain how Roman roads helped trade across the empire?';
  // The source's own exact wording must keep passing (no backward regression).
  const exactWordingOpener =
    'Roman roads helped armies move between places, connected towns, and made trade easier across the empire.';

  it('passes a faithful-synonym opener that teaches all three source points', () => {
    expect(
      learningSourcePointCount(faithfulSynonymOpener),
    ).toBeGreaterThanOrEqual(2);
  });

  it('still fires on a genuinely thin opener (negative anchor)', () => {
    expect(learningSourcePointCount(thinOpener)).toBeLessThan(2);
  });

  it('still passes the source exact wording (no backward regression)', () => {
    expect(learningSourcePointCount(exactWordingOpener)).toBeGreaterThanOrEqual(
      2,
    );
  });

  // WI-1823 gate-loosening teeth-check (operator ruling 1): the widening added
  // synonym recognition, NOT bar-lowering. An opener that states exactly ONE
  // point — even via a newly-recognized loosened synonym ("smoother") — plus a
  // question must still FIRE. Asserts the synonym IS counted (1, not 0) yet the
  // >= 2 threshold still fails the thin opener.
  it('still fires on a one-point opener expressed via a loosened synonym', () => {
    const oneLoosenedPoint =
      'Roman roads made trade smoother across the empire. How did that change daily life?';
    expect(learningSourcePointCount(oneLoosenedPoint)).toBe(1);
    expect(learningSourcePointCount(oneLoosenedPoint)).toBeLessThan(2);
  });
});

describe('FOUR_STRANDS_EXPLAINS_EN_RE (four_strands_missing_direct_correction)', () => {
  // Captured postfix1 t2: names the missing "en" in Spanish (immersion).
  const spanishNamesEn =
    "En tu frase falta la preposición 'en' antes de 'mi opinión'. Debe ser 'En mi opinión, ...'. Aquí está la versión correcta: En mi opinión, estudiar es útil porque ayuda, pero es difícil.";
  // Captured postfix1 t3: names the missing "en" in English.
  const englishNamesEn =
    "You omitted the preposition 'en' before 'mi opinión'. The phrase should start with 'En mi opinión'.";
  // Negative anchor: restates the corrected sentence but never names the error.
  const restateOnly =
    '¡Buen intento! La versión correcta es: En mi opinión, estudiar es útil. Ahora escribe otra frase con esa estructura.';

  it('accepts a Spanish correction that names the missing "en"', () => {
    expect(FOUR_STRANDS_CORRECTION_RE.test(spanishNamesEn)).toBe(true);
    expect(FOUR_STRANDS_EXPLAINS_EN_RE.test(spanishNamesEn)).toBe(true);
  });

  it('accepts an English correction that names the missing "en"', () => {
    expect(FOUR_STRANDS_CORRECTION_RE.test(englishNamesEn)).toBe(true);
    expect(FOUR_STRANDS_EXPLAINS_EN_RE.test(englishNamesEn)).toBe(true);
  });

  it('still fires when the reply only restates without naming the error', () => {
    // CORRECTION_RE matches "En mi opinión", but EXPLAINS_EN must not — so the
    // combined gate condition (needs both) still flags it.
    expect(FOUR_STRANDS_EXPLAINS_EN_RE.test(restateOnly)).toBe(false);
  });
});

describe('RECITATION_UNSUPPORTED_POLISH_RE (raw regex mechanics)', () => {
  // Synthetic polished recitation carrying the unsupported speed claim: with the
  // fixture source reworded to "made trade easier", this is genuinely unsupported.
  const unsupportedPolish =
    'Polished version: Roman roads connected towns, helped armies travel, and also helped trade move faster across the empire.';
  // Source-faithful polish stays within supported wording.
  const supportedPolish =
    'Polished version: Roman roads connected towns, helped armies travel, and made trade easier across the empire.';

  it('fires on a polish that adds the unsupported speed claim', () => {
    expect(RECITATION_UNSUPPORTED_POLISH_RE.test(unsupportedPolish)).toBe(true);
  });

  it('does not fire on a source-faithful polish', () => {
    expect(RECITATION_UNSUPPORTED_POLISH_RE.test(supportedPolish)).toBe(false);
  });
});

describe('recitationPolishAddedFact (scoped to polished segment — WI-1823 ruling 1)', () => {
  // The regression the ruling fixes: verify1 t4 — the model did EXACTLY the
  // right thing. It quoted the learner's unsupported "trade move faster",
  // explicitly flagged it against the source, and gave a tidy version using
  // "made trade easier". The unsupported phrase appears ONLY in the quote and
  // the correction, never in the polished version. Must NOT fire.
  const correctCorrection =
    "Thanks, I got this: 'Roman roads mattered because they connected towns and helped armies travel. Roman roads also helped trade move faster across the empire.' Your wording is clear. The trade part uses the phrasing 'move faster', but the source says 'made trade easier', so that could be refined. Here is a tidy version: Roman roads mattered because they connected towns, helped armies travel, and made trade easier across the empire.";
  // Condition (i) from the ruling: the scoped check STILL fires when the
  // unsupported phrase appears INSIDE the polished segment itself.
  const unsupportedInPolish =
    'Your recitation was clear. Here is a tidy version: Roman roads connected towns, helped armies travel, and helped trade move faster across the empire.';
  // A feedback/setup reply that proposes no polished version has nothing to
  // audit — must not fire even if it quotes the learner's phrase.
  const noPolishProposed =
    "Sure! When you're ready, go ahead and recite it. I noticed you mentioned trade moving faster — we can compare that to the source afterward.";

  it('does NOT fire when the unsupported phrase is only in the quote/correction, not the polish', () => {
    expect(recitationPolishAddedFact(correctCorrection)).toBe(false);
  });

  it('STILL fires when the unsupported phrase is inside the polished version (condition i)', () => {
    expect(recitationPolishAddedFact(unsupportedInPolish)).toBe(true);
  });

  it('does not fire when no polished version is proposed', () => {
    expect(recitationPolishAddedFact(noPolishProposed)).toBe(false);
  });
});

describe('sourceAuditNoFactualClaim (source_audit no-claim skip — WI-1823 ruling 2a)', () => {
  // Captured verify1 recitation t1: setup prompt inviting the learner to
  // recite first. The model asserted no fact, so it emitted no
  // factual_confidence, and the reply itself is a pure invitation.
  const recitationSetup = {
    status: 'missing_reliable_source',
    factualConfidence: undefined,
  };
  const recitationSetupReply = "Go ahead and recite it for me — I'm listening.";
  // Captured verify1 four-strands t1: language-immersion opener, a question
  // in the target language. Empty relied_on, no factual_confidence.
  const immersionOpener = { status: 'missing_reliable_source' };
  const immersionOpenerReply = '¿Qué te gustaría practicar hoy?';
  // The realistic dangerous case Codex P1 caught: the model FORGOT to
  // populate relied_on for a source-specific factual claim, so status is
  // missing_reliable_source and factual_confidence is ABSENT (it is only
  // ever emitted for general_knowledge reliance per the prompt contract,
  // apps/api/src/services/exchange-prompts.ts:578 — its absence here does
  // NOT mean no claim was made). The reply is a declarative factual
  // assertion, so this must NOT be skipped.
  const forgottenSourceAudit = {
    status: 'missing_reliable_source',
    factualConfidence: undefined,
  };
  const forgottenSourceReply = '3·5+5 = 20.';

  it('skips a contentless recitation setup turn (invitation, no factual_confidence)', () => {
    expect(
      sourceAuditNoFactualClaim(recitationSetup, recitationSetupReply),
    ).toBe(true);
  });

  it('skips a language-immersion opener (question, empty relied_on, no factual_confidence)', () => {
    expect(
      sourceAuditNoFactualClaim(immersionOpener, immersionOpenerReply),
    ).toBe(true);
  });

  it('does NOT skip a declarative factual assertion with no relied_on and no factual_confidence', () => {
    expect(
      sourceAuditNoFactualClaim(forgottenSourceAudit, forgottenSourceReply),
    ).toBe(false);
  });

  it('does NOT skip other fail statuses even without factual_confidence', () => {
    expect(
      sourceAuditNoFactualClaim({ status: 'unsupported_sources' }, ''),
    ).toBe(false);
  });
});
