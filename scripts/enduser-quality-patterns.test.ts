// WI-1823 — deterministic regex checks pinning the enduser-gate quality
// patterns this work item changed. Each `expect` is the "green" of a
// red-green-revert: reverting the corresponding recalibration in
// enduser-quality-patterns.ts flips the asserted case and fails the test.

import {
  FOUR_STRANDS_CORRECTION_RE,
  FOUR_STRANDS_EXPLAINS_EN_RE,
  LEARNING_SOURCE_POINT_RE,
  RECITATION_UNSUPPORTED_POLISH_RE,
  recitationSetupReplyAdvances,
  recitationPolishAddedFact,
  sourceAuditGateFires,
} from './enduser-quality-patterns';

describe('recitationSetupReplyAdvances', () => {
  it.each([
    "I'm ready. Begin whenever you are.",
    'Go ahead and start when you are ready.',
    'You can begin your recitation now.',
  ])('accepts a ready-to-begin reply: %s', (reply) => {
    expect(recitationSetupReplyAdvances(reply)).toBe(true);
  });

  it.each([
    'What would you like to recite?',
    'Tell me the title or author.',
    'Begin by telling me which poem.',
    'Which recitation should we do?',
    'Start by giving me the title.',
    'Start with: Roman roads connected towns and helped armies travel.',
    'Here is a polished version you can recite.',
    'I can give you a model answer first.',
  ])('rejects a repeated setup question or premature model: %s', (reply) => {
    expect(recitationSetupReplyAdvances(reply)).toBe(false);
  });

  it('rejects a content-bearing invitation that copies the fixture source', () => {
    const source =
      'Roman roads helped armies travel, connected towns, and made trade easier across the empire.';
    const contentBearingReply =
      "I'm ready. Roman roads helped armies travel across the empire. Begin whenever you are.";

    expect(recitationSetupReplyAdvances(contentBearingReply, source)).toBe(
      false,
    );
    expect(
      recitationSetupReplyAdvances(
        "I'm ready to hear about Roman roads. Begin whenever you are.",
        source,
      ),
    ).toBe(true);
  });
});

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

describe('sourceAuditGateFires (WI-1823 pivot: turn-identity allowlist, ruled Option A)', () => {
  // The reviewer kept constructing new bypass phrasings against the prior
  // content heuristic (bare fact, conversational-prefix fact, em-dash fact,
  // fact framed as a question) — a regex classifying reply CONTENT can't be
  // both conservative and reliable against arbitrary phrasing. The fix
  // drops content inspection entirely: sourceAuditGateFires takes only the
  // audit status and a per-turn `exemptSourceAudit` boolean set on the
  // RunDefinition turn (turn identity), never the reply text. These tests
  // exercise every phrasing the reviewer previously used to defeat the old
  // heuristic — the point is that on a non-exempt (teaching) turn, phrasing
  // is now irrelevant: the gate fires purely because the turn isn't marked
  // exempt, regardless of what the reply happened to say.

  it('does NOT fire on an exempt (non-teaching) turn — e.g. recitation setup, "Go ahead and recite it for me — I\'m listening."', () => {
    expect(sourceAuditGateFires('missing_reliable_source', true)).toBe(false);
  });

  it('does NOT fire on an exempt turn — e.g. immersion opener, "¿Qué te gustaría practicar hoy?"', () => {
    expect(sourceAuditGateFires('missing_reliable_source', true)).toBe(false);
  });

  // Follow-up correction: four-strands turn 1 ("Start with a tiny example I
  // can understand") is a model-generated illustrative language example —
  // there is no reliable source to cite for a novel demonstration sentence,
  // so missing_reliable_source there is expected and benign, same principle
  // as the other three exempt turns. This also preserves the exact
  // pre-existing skip behavior for that turn under the new code.
  it('does NOT fire on an exempt turn — e.g. four-strands illustrative example opener, "En mi opinión, estudiar es útil."', () => {
    expect(sourceAuditGateFires('missing_reliable_source', true)).toBe(false);
  });

  // Non-exempt (teaching) turn: fires regardless of reply phrasing. The
  // function signature takes no reply text, so these comments document what
  // the (irrelevant) reply would have been in each previously-defeated case.
  it('fires on a non-exempt turn with a bare factual reply ("3·5+5 = 20.")', () => {
    expect(sourceAuditGateFires('missing_reliable_source', undefined)).toBe(
      true,
    );
  });

  it('fires on a non-exempt turn with a conversational-prefix-wrapped fact ("Sure, 3·5+5 = 20.")', () => {
    expect(sourceAuditGateFires('missing_reliable_source', false)).toBe(true);
  });

  it('fires on a non-exempt turn with a fact smuggled after an invitation via em-dash ("Go ahead — the answer is 20.")', () => {
    expect(sourceAuditGateFires('missing_reliable_source', undefined)).toBe(
      true,
    );
  });

  it('fires on a non-exempt turn with the fact framed as a question ("Did you know Roman roads made trade faster?")', () => {
    expect(sourceAuditGateFires('missing_reliable_source', undefined)).toBe(
      true,
    );
  });

  it('fires on a non-exempt turn with the fact framed as an invitation-question ("Ready to discuss how Roman roads made trade faster?")', () => {
    expect(sourceAuditGateFires('missing_reliable_source', undefined)).toBe(
      true,
    );
  });

  it('fires on other fail statuses on a non-exempt turn', () => {
    expect(sourceAuditGateFires('unsupported_sources', undefined)).toBe(true);
  });

  it('does not fire on a non-fail status even on a non-exempt turn (proper reliable-source trail)', () => {
    expect(sourceAuditGateFires('ok', undefined)).toBe(false);
  });

  // Red-green anchor: an exempt turn stays exempt only because of the
  // marker, not because of anything about the status — flip the marker off
  // and the SAME fail-status now fires. This is the property the red-green
  // proof in the commit message exercises against the actual gate wiring in
  // enduser-session-pass.ts (revert the exemptSourceAudit marker on the
  // recitation-setup turn, confirm it newly fails, restore).
  it('the same fail-status fires once the exempt marker is removed', () => {
    expect(sourceAuditGateFires('missing_reliable_source', true)).toBe(false);
    expect(sourceAuditGateFires('missing_reliable_source', undefined)).toBe(
      true,
    );
  });
});
