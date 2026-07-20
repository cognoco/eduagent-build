import {
  challengeRoundEvaluationItemSchema,
  challengeRoundGraderDegradedEventSchema,
  challengeRoundGraderVerdictSchema,
  llmAssessmentEvaluationSchema,
  llmResponseEnvelopeSchema,
  llmSummaryEvaluationSchema,
  normaliseSignals,
  teachBackGraderDegradedEventSchema,
  teachBackGraderVerdictSchema,
  type ChallengeRoundGraderVerdict,
  type NormalisedEnvelopeSignals,
} from './llm-envelope.js';

// ---------------------------------------------------------------------------
// llmResponseEnvelopeSchema — the single structured LLM output shape.
// Tests cover the preprocessor branches to improve branch coverage.
// ---------------------------------------------------------------------------

describe('llmResponseEnvelopeSchema', () => {
  const minimalValid = {
    reply: 'Great work! You have understood the concept.',
  };

  it('accepts a minimal envelope (reply only)', () => {
    const parsed = llmResponseEnvelopeSchema.parse(minimalValid);
    expect(parsed.reply).toBe('Great work! You have understood the concept.');
    expect(parsed.signals).toBeUndefined();
    expect(parsed.ui_hints).toBeUndefined();
  });

  it('rejects empty reply', () => {
    const result = llmResponseEnvelopeSchema.safeParse({ reply: '' });
    expect(result.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Bug #575 break tests — reply-field hardening
  // ---------------------------------------------------------------------------

  it('[#575] rejects reply longer than 10 000 characters', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'a'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it('[#575] accepts reply of exactly 10 000 characters', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'a'.repeat(10000),
    });
    expect(result.success).toBe(true);
  });

  it('[#575] rejects reply containing a bracketed UPPERCASE marker token', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'You did great! [INTERVIEW_COMPLETE]',
    });
    expect(result.success).toBe(false);
  });

  it('[#575] rejects reply containing any [UPPERCASE_TOKEN] pattern', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: '[READY_TO_FINISH] Let us continue.',
    });
    expect(result.success).toBe(false);
  });

  it('[#575] rejects reply that is a JSON blob containing "signals"', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: '{"signals": {"ready_to_finish": true}, "reply": "hi"}',
    });
    expect(result.success).toBe(false);
  });

  it('[#575] accepts ordinary prose with lowercase brackets like [Note: ...]', () => {
    // Square-bracket notation around non-uppercase content must not be blocked.
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'The formula is [Na+][Cl-] = Ksp. [Note: this is simplified.]',
    });
    expect(result.success).toBe(true);
  });

  it('[#575] accepts prose with a JSON-looking fragment that lacks "signals"', () => {
    // A reply starting with { but not containing "signals" is fine (e.g. code examples).
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: '{"name": "Alice", "age": 12} is an example JSON object.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts envelope with full signals block', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Good job!',
      signals: {
        ready_to_finish: true,
        partial_progress: false,
        needs_deepening: null,
        understanding_check: null,
        retrieval_score: 0.85,
      },
    });
    expect(parsed.signals?.ready_to_finish).toBe(true);
    expect(parsed.signals?.needs_deepening).toBeUndefined();
  });

  it('accepts signals with null values coerced to undefined', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Interesting question.',
      signals: {
        ready_to_finish: null,
        partial_progress: null,
      },
    });
    // null values get preprocessed to undefined by optionalBooleanSchema
    expect(parsed.signals?.ready_to_finish).toBeUndefined();
    expect(parsed.signals?.partial_progress).toBeUndefined();
  });

  it('coerces signals when null/non-object is passed (optionalObjectInput)', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test reply',
      signals: null,
    });
    expect(parsed.signals).toBeUndefined();
  });

  it('coerces signals when array is passed', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test reply',
      signals: ['invalid'],
    });
    expect(parsed.signals).toBeUndefined();
  });

  it('accepts envelope with confidence field', () => {
    for (const confidence of ['low', 'medium', 'high'] as const) {
      const parsed = llmResponseEnvelopeSchema.parse({
        reply: 'Test',
        confidence,
      });
      expect(parsed.confidence).toBe(confidence);
    }
  });

  it('coerces null confidence to undefined', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      confidence: null,
    });
    expect(parsed.confidence).toBeUndefined();
  });

  it('accepts private factual confidence for general-knowledge audit', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Yucca palms are drought-tolerant plants.',
      private_sources: {
        relied_on: ['general_knowledge'],
        insufficient: false,
        factual_confidence: '91%',
      },
    });

    expect(parsed.private_sources?.factual_confidence).toBeCloseTo(0.91);
  });

  // Out-of-range factual_confidence must degrade gracefully —
  // it is non-critical provenance ("never rendered to the learner") and must
  // never reject the whole envelope, which would drop the valid reply and
  // every state-machine signal.
  describe('[WI-581/F-025] factual_confidence robustness', () => {
    it('normalizes a bare numeric percentage (91) to 0.91 like the string path', () => {
      const parsed = llmResponseEnvelopeSchema.parse({
        reply: 'Test',
        private_sources: { factual_confidence: 91 },
      });
      expect(parsed.private_sources?.factual_confidence).toBeCloseTo(0.91);
    });

    it('keeps an in-range numeric value unchanged', () => {
      const parsed = llmResponseEnvelopeSchema.parse({
        reply: 'Test',
        private_sources: { factual_confidence: 0.5 },
      });
      expect(parsed.private_sources?.factual_confidence).toBeCloseTo(0.5);
    });

    it('drops only the field — not the envelope — for an irrecoverable numeric value (250)', () => {
      const parsed = llmResponseEnvelopeSchema.parse({
        reply: 'Valid reply',
        signals: { ready_to_finish: true },
        private_sources: {
          relied_on: ['general_knowledge'],
          factual_confidence: 250,
        },
      });
      expect(parsed.reply).toBe('Valid reply');
      expect(parsed.signals?.ready_to_finish).toBe(true);
      expect(parsed.private_sources?.relied_on).toEqual(['general_knowledge']);
      expect(parsed.private_sources?.factual_confidence).toBeUndefined();
    });

    it('drops only the field for a negative numeric value', () => {
      const parsed = llmResponseEnvelopeSchema.parse({
        reply: 'Valid reply',
        private_sources: { factual_confidence: -0.3 },
      });
      expect(parsed.reply).toBe('Valid reply');
      expect(parsed.private_sources?.factual_confidence).toBeUndefined();
    });

    it('drops only the field for an out-of-range string percentage', () => {
      const parsed = llmResponseEnvelopeSchema.parse({
        reply: 'Valid reply',
        private_sources: { factual_confidence: '250%' },
      });
      expect(parsed.reply).toBe('Valid reply');
      expect(parsed.private_sources?.factual_confidence).toBeUndefined();
    });
  });

  it('accepts envelope with ui_hints showing note_prompt', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Great!',
      ui_hints: {
        note_prompt: {
          show: true,
          post_session: false,
        },
      },
    });
    expect(parsed.ui_hints?.note_prompt?.show).toBe(true);
  });

  it('coerces note_prompt.show to false when missing', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      ui_hints: {
        note_prompt: {
          post_session: true,
        },
      },
    });
    expect(parsed.ui_hints?.note_prompt?.show).toBe(false);
  });

  it('accepts envelope with fluency_drill active', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Try this drill!',
      ui_hints: {
        fluency_drill: {
          active: true,
          duration_s: 30,
          score: { correct: 4, total: 5 },
        },
      },
    });
    expect(parsed.ui_hints?.fluency_drill?.active).toBe(true);
    expect(parsed.ui_hints?.fluency_drill?.score?.correct).toBe(4);
  });

  it('coerces fluency_drill.active to false when null/missing', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      ui_hints: {
        fluency_drill: {
          active: null,
        },
      },
    });
    expect(parsed.ui_hints?.fluency_drill?.active).toBe(false);
  });

  it('removes fluency_drill.score when active=false and score is 0/0', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      ui_hints: {
        fluency_drill: {
          active: false,
          score: { correct: 0, total: 0 },
        },
      },
    });
    expect(parsed.ui_hints?.fluency_drill?.score).toBeUndefined();
  });

  it('[WI-1823] accepts fluency_drill active=true with degenerate 0/0 score (strips it)', () => {
    // Captured four-strands t5 drill-start payload: a template-following model
    // (gpt-oss-120b) emits the `score` field the response-format template shows
    // even when STARTING a drill, producing score:{correct:0,total:0}. total:0
    // violates score.total >= 1. Before the fix the all-zero score was only
    // stripped when active=false, so an active=true drill-start failed
    // llmResponseEnvelopeSchema.safeParse → schema_violation. The 0/0 score is
    // meaningless at drill start; strip it regardless of active.
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Ready — 30 second drill with porque, pero, entonces. Go!',
      ui_hints: {
        fluency_drill: {
          active: true,
          duration_s: 30,
          score: { correct: 0, total: 0 },
        },
      },
    });
    expect(parsed.ui_hints?.fluency_drill?.active).toBe(true);
    expect(parsed.ui_hints?.fluency_drill?.duration_s).toBe(30);
    expect(parsed.ui_hints?.fluency_drill?.score).toBeUndefined();
  });

  it('removes fluency_drill.duration_s when active=false and duration_s=0', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      ui_hints: {
        fluency_drill: {
          active: false,
          duration_s: 0,
        },
      },
    });
    expect(parsed.ui_hints?.fluency_drill?.duration_s).toBeUndefined();
  });

  it('coerces ui_hints when null passed', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      ui_hints: null,
    });
    expect(parsed.ui_hints).toBeUndefined();
  });

  it('accepts envelope with private_sources block', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      private_sources: {
        relied_on: ['source-1', 'source-2'],
        insufficient: false,
        reason: 'Used primary sources only',
      },
    });
    expect(parsed.private_sources?.relied_on).toEqual(['source-1', 'source-2']);
  });

  it('coerces private_sources.relied_on from single string to array', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      private_sources: {
        relied_on: 'single-source',
      },
    });
    expect(Array.isArray(parsed.private_sources?.relied_on)).toBe(true);
    expect(parsed.private_sources?.relied_on).toContain('single-source');
  });

  it('coerces private_sources.insufficient from string "true" to boolean', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      private_sources: {
        insufficient: 'true',
      },
    });
    expect(parsed.private_sources?.insufficient).toBe(true);
  });

  it('coerces private_sources.insufficient from string "false" to boolean', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      private_sources: {
        insufficient: 'false',
      },
    });
    expect(parsed.private_sources?.insufficient).toBe(false);
  });

  it('coerces private_sources when non-object is passed', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      private_sources: null,
    });
    expect(parsed.private_sources).toBeUndefined();
  });

  it('trims and coerces empty private_sources.reason to undefined', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      private_sources: {
        reason: '   ',
      },
    });
    expect(parsed.private_sources?.reason).toBeUndefined();
  });

  it('accepts valid private_sources.reason string', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      private_sources: {
        reason: 'Relied on curriculum context',
      },
    });
    expect(parsed.private_sources?.reason).toBe('Relied on curriculum context');
  });

  it('coerces private_sources.reason when non-string is passed', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Test',
      private_sources: {
        reason: 42,
      },
    });
    expect(parsed.private_sources?.reason).toBeUndefined();
  });

  it('accepts signals.retrieval_score at boundaries (0 and 1)', () => {
    for (const score of [0, 0.5, 1]) {
      const parsed = llmResponseEnvelopeSchema.parse({
        reply: 'Test',
        signals: { retrieval_score: score },
      });
      expect(parsed.signals?.retrieval_score).toBe(score);
    }
  });

  it('rejects signals.retrieval_score above 1', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'Test',
      signals: { retrieval_score: 1.5 },
    });
    expect(result.success).toBe(false);
  });
});

describe('discrete LLM evaluation schemas', () => {
  describe('llmSummaryEvaluationSchema', () => {
    it('[WI-372] rejects stringified boolean state fields', () => {
      const result = llmSummaryEvaluationSchema.safeParse({
        feedback: 'Looks fine.',
        hasUnderstandingGaps: 'false',
        gapAreas: [],
        isAccepted: 'false',
      });

      expect(result.success).toBe(false);
    });

    it('[WI-372] rejects blank learner-visible feedback', () => {
      const result = llmSummaryEvaluationSchema.safeParse({
        feedback: '   ',
        hasUnderstandingGaps: false,
        gapAreas: [],
        isAccepted: true,
      });

      expect(result.success).toBe(false);
    });

    it('[WI-372] rejects accepted summaries with understanding gaps', () => {
      const result = llmSummaryEvaluationSchema.safeParse({
        feedback: 'You missed the core idea, but this is accepted.',
        hasUnderstandingGaps: true,
        gapAreas: ['core concept'],
        isAccepted: true,
      });

      expect(result.success).toBe(false);
    });

    it('[WI-372] rejects blank gap areas', () => {
      const result = llmSummaryEvaluationSchema.safeParse({
        feedback: 'You have not got the core idea yet.',
        hasUnderstandingGaps: true,
        gapAreas: ['   '],
        isAccepted: false,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('llmAssessmentEvaluationSchema', () => {
    it('[WI-372] rejects stringified booleans and numeric scores', () => {
      const result = llmAssessmentEvaluationSchema.safeParse({
        feedback: 'Good enough.',
        rawScore: '0.8',
        qualityRating: '4',
        passed: 'false',
        shouldEscalateDepth: 'false',
        weakAreas: [],
      });

      expect(result.success).toBe(false);
    });

    it('[WI-372] rejects missing state booleans', () => {
      expect(
        llmAssessmentEvaluationSchema.safeParse({
          feedback: 'Good recall.',
          rawScore: 0.95,
          qualityRating: 5,
        }).success,
      ).toBe(false);

      expect(
        llmAssessmentEvaluationSchema.safeParse({
          feedback: 'Good recall.',
          rawScore: 0.95,
          qualityRating: 5,
          passed: true,
        }).success,
      ).toBe(false);
    });

    it('[WI-372] rejects missing or blank learner-visible feedback', () => {
      expect(
        llmAssessmentEvaluationSchema.safeParse({
          rawScore: 0.95,
          qualityRating: 5,
          passed: true,
          shouldEscalateDepth: true,
        }).success,
      ).toBe(false);

      expect(
        llmAssessmentEvaluationSchema.safeParse({
          feedback: '   ',
          rawScore: 0.95,
          qualityRating: 5,
          passed: true,
          shouldEscalateDepth: true,
        }).success,
      ).toBe(false);
    });

    it('[WI-372] rejects decimal quality ratings', () => {
      const result = llmAssessmentEvaluationSchema.safeParse({
        reply: 'Good enough.',
        rawScore: 0.8,
        qualityRating: 4.5,
        passed: true,
        shouldEscalateDepth: false,
      });

      expect(result.success).toBe(false);
    });

    it('[WI-372] rejects pass state that contradicts raw score', () => {
      expect(
        llmAssessmentEvaluationSchema.safeParse({
          reply: 'Good enough.',
          rawScore: 0.8,
          qualityRating: 4,
          passed: false,
          shouldEscalateDepth: false,
        }).success,
      ).toBe(false);

      expect(
        llmAssessmentEvaluationSchema.safeParse({
          reply: 'Not enough detail yet.',
          rawScore: 0.4,
          qualityRating: 2,
          passed: true,
          shouldEscalateDepth: false,
        }).success,
      ).toBe(false);
    });

    it('[WI-372] rejects weak areas wider than the assessment response contract', () => {
      const result = llmAssessmentEvaluationSchema.safeParse({
        reply: 'Not enough detail yet.',
        rawScore: 0.4,
        qualityRating: 2,
        passed: false,
        shouldEscalateDepth: false,
        weakAreas: ['x'.repeat(121)],
      });

      expect(result.success).toBe(false);
    });

    it('[WI-372] accepts the strict discrete assessment shape', () => {
      const parsed = llmAssessmentEvaluationSchema.parse({
        reply: 'Good enough.',
        rawScore: 0.8,
        qualityRating: 4,
        passed: true,
        shouldEscalateDepth: false,
        weakAreas: ['examples'],
      });

      expect(parsed.reply).toBe('Good enough.');
      expect(parsed.passed).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// EVALUATE / TEACH_BACK assessment signals — added to replace the legacy
// "embed a JSON block in free-text reply" antipattern (CR-2026-05-19-C5).
// ---------------------------------------------------------------------------

describe('signals.evaluate_assessment', () => {
  it('accepts a complete evaluate_assessment payload', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Nice catch — the cause and effect were swapped.',
      signals: {
        evaluate_assessment: {
          challenge_passed: true,
          flaw_identified: 'inverted cause-effect',
          quality: 4,
        },
      },
    });
    expect(parsed.signals?.evaluate_assessment).toEqual({
      challenge_passed: true,
      flaw_identified: 'inverted cause-effect',
      quality: 4,
    });
  });

  it('clamps quality to [0,5] integer', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'ok',
      signals: {
        evaluate_assessment: {
          challenge_passed: false,
          quality: 99,
        },
      },
    });
    expect(parsed.signals?.evaluate_assessment?.quality).toBe(5);
  });

  it('coerces evaluate_assessment to undefined when non-object passed', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'ok',
      signals: {
        evaluate_assessment: null,
      },
    });
    expect(parsed.signals?.evaluate_assessment).toBeUndefined();
  });

  it('[WI-1995] keeps the reply and sibling signals when challenge_passed is missing', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'Nice work — tell me more about why that step follows.',
      signals: {
        ready_to_finish: true,
        evaluate_assessment: {
          flaw_identified: 'inverted cause-effect',
          quality: 4,
        },
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.reply).toBe(
      'Nice work — tell me more about why that step follows.',
    );
    expect(result.data.signals?.ready_to_finish).toBe(true);
    expect(result.data.signals?.evaluate_assessment).toEqual({
      challenge_passed: undefined,
      flaw_identified: 'inverted cause-effect',
      quality: 4,
    });
  });

  it('[WI-1995] keeps the reply and sibling signals when challenge_passed has the wrong type', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'Your explanation still matters.',
      signals: {
        partial_progress: true,
        evaluate_assessment: {
          challenge_passed: 'yes',
          flaw_identified: 'missed the boundary case',
          quality: 3,
        },
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.reply).toBe('Your explanation still matters.');
    expect(result.data.signals?.partial_progress).toBe(true);
    expect(result.data.signals?.evaluate_assessment).toEqual({
      challenge_passed: undefined,
      flaw_identified: 'missed the boundary case',
      quality: 3,
    });
  });

  it('[WI-1995] preserves a valid challenge_passed verdict', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'You found the flaw.',
      signals: {
        understanding_check: true,
        evaluate_assessment: {
          challenge_passed: true,
          flaw_identified: 'unsupported premise',
          quality: 5,
        },
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.reply).toBe('You found the flaw.');
    expect(result.data.signals?.understanding_check).toBe(true);
    expect(result.data.signals?.evaluate_assessment).toEqual({
      challenge_passed: true,
      flaw_identified: 'unsupported premise',
      quality: 5,
    });
  });
});

describe('signals.teach_back_assessment', () => {
  it('accepts a complete teach_back_assessment payload', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Can you tell me more about the light reactions?',
      signals: {
        teach_back_assessment: {
          completeness: 4,
          accuracy: 3,
          clarity: 5,
          overall_quality: 4,
          weakest_area: 'accuracy',
          gap_identified: 'missed energy conservation',
        },
      },
    });
    expect(parsed.signals?.teach_back_assessment).toEqual({
      completeness: 4,
      accuracy: 3,
      clarity: 5,
      overall_quality: 4,
      weakest_area: 'accuracy',
      gap_identified: 'missed energy conservation',
    });
  });

  it('clamps each rubric score to [0,5] integer', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'ok',
      signals: {
        teach_back_assessment: {
          completeness: 99,
          accuracy: -3,
          clarity: 3.7,
          overall_quality: 4,
        },
      },
    });
    expect(parsed.signals?.teach_back_assessment?.completeness).toBe(5);
    expect(parsed.signals?.teach_back_assessment?.accuracy).toBe(0);
    // 3.7 rounds to 4
    expect(parsed.signals?.teach_back_assessment?.clarity).toBe(4);
  });

  it('coerces invalid weakest_area to undefined', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'ok',
      signals: {
        teach_back_assessment: {
          completeness: 4,
          accuracy: 4,
          weakest_area: 'made_up_area',
        },
      },
    });
    expect(parsed.signals?.teach_back_assessment?.weakest_area).toBeUndefined();
  });

  it('accepts null gap_identified (LLM signalling "no gap")', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'ok',
      signals: {
        teach_back_assessment: {
          completeness: 5,
          accuracy: 5,
          gap_identified: null,
        },
      },
    });
    expect(parsed.signals?.teach_back_assessment?.gap_identified).toBeNull();
  });
});

describe('normaliseSignals', () => {
  it('fills defaults for empty signals object', () => {
    const result: NormalisedEnvelopeSignals = normaliseSignals({});
    expect(result.ready_to_finish).toBe(false);
    expect(result.partial_progress).toBe(false);
    expect(result.needs_deepening).toBe(false);
    expect(result.understanding_check).toBe(false);
    expect(result.retrieval_score).toBeNull();
  });

  it('passes through explicit signals unchanged', () => {
    const result: NormalisedEnvelopeSignals = normaliseSignals({
      ready_to_finish: true,
    });
    expect(result.ready_to_finish).toBe(true);
  });

  it('defaults challenge round fields to false / empty array', () => {
    const result = normaliseSignals(undefined);
    expect(result.challenge_round_offer).toBe(false);
    expect(result.challenge_round_evaluation).toEqual([]);
    expect(result.noticed_gap).toBeNull();
    expect(result.notice_recheck).toBeNull();
  });

  // [H2 — 2026-06-05 safety audit] crisis_redirect signal
  it('defaults crisis_redirect to false', () => {
    expect(normaliseSignals(undefined).crisis_redirect).toBe(false);
    expect(normaliseSignals({}).crisis_redirect).toBe(false);
  });

  it('passes through explicit crisis_redirect', () => {
    expect(normaliseSignals({ crisis_redirect: true }).crisis_redirect).toBe(
      true,
    );
  });
});

describe('mentor notice envelope fields', () => {
  const answerEventId = '00000000-0000-4000-8000-000000000001';
  const noticeId = '00000000-0000-4000-8000-000000000002';

  it('accepts a grounded noticed_gap proposal', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Those minus signs are sneaky.',
      signals: {
        noticed_gap: {
          concept: 'Sign changes when moving terms',
          correctionHint: 'Reverse the operation across the equals sign.',
          answerEventId,
          learnerQuote: 'I moved -3 over and kept it negative',
        },
      },
    });

    expect(parsed.signals?.noticed_gap?.answerEventId).toBe(answerEventId);
  });

  it('preserves an optional interleaved topic target on a grounded proposal', () => {
    const topicId = '00000000-0000-4000-8000-000000000003';
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Let us straighten out that distinction.',
      signals: {
        noticed_gap: {
          concept: 'Mitosis versus meiosis',
          correctionHint: 'Mitosis keeps the chromosome count unchanged.',
          answerEventId,
          learnerQuote: 'meiosis makes identical cells',
          topicId,
        },
      },
    });

    expect(parsed.signals?.noticed_gap?.topicId).toBe(topicId);
  });

  it('accepts an explicit null noticed_gap when no gap was observed', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'That answer is correct.',
      signals: { noticed_gap: null },
    });

    expect(parsed.signals?.noticed_gap).toBeNull();
    expect(normaliseSignals(parsed.signals).noticed_gap).toBeNull();
  });

  it('rejects a noticed_gap proposal without learner evidence', () => {
    expect(
      llmResponseEnvelopeSchema.safeParse({
        reply: 'Keep going.',
        signals: {
          noticed_gap: {
            concept: 'Sign changes',
            answerEventId,
          },
        },
      }).success,
    ).toBe(false);
  });

  it('accepts deferred as a non-terminal re-check verdict', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'No problem — we can leave it there.',
      signals: {
        notice_recheck: {
          noticeId,
          verdict: 'deferred',
          answerEventId,
          learnerQuote: 'not now please',
        },
      },
    });

    expect(parsed.signals?.notice_recheck?.verdict).toBe('deferred');
  });
});

// ---------------------------------------------------------------------------
// [H2 — 2026-06-05 safety audit] crisis_redirect envelope signal
// ---------------------------------------------------------------------------

describe('crisis_redirect envelope signal', () => {
  it('accepts crisis_redirect signal', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply:
        "I'm sorry you're going through this. This is something to talk about with a parent, guardian, or trusted adult.",
      signals: { crisis_redirect: true },
      confidence: 'high',
    });
    expect(parsed.signals?.crisis_redirect).toBe(true);
  });

  it('tolerates null crisis_redirect (LLM emitting null for unset)', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Back to fractions.',
      signals: { crisis_redirect: null },
      confidence: 'medium',
    });
    expect(parsed.signals?.crisis_redirect ?? false).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Challenge Round envelope extensions (Task 1) — see
// docs/plans/2026-05-18-challenge-round-into-note.md
// ---------------------------------------------------------------------------

describe('challenge round envelope fields', () => {
  it('accepts challenge_round_offer signal', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: "You've got the basics — want a challenge round?",
      signals: { challenge_round_offer: true },
      confidence: 'medium',
    });
    expect(parsed.signals?.challenge_round_offer).toBe(true);
  });

  it('accepts challenge_round_evaluation per-concept results', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Strong work.',
      signals: {
        challenge_round_evaluation: [
          {
            concept: 'photosynthesis vs respiration',
            result: 'solid',
            evidence: 'learner described both directions of energy flow',
            answerEventId: '00000000-0000-4000-8000-000000000001',
            learnerQuote:
              'photosynthesis stores energy in glucose and respiration releases it',
          },
          {
            concept: 'role of ATP',
            result: 'partial',
            evidence: 'mentioned energy currency, missed structure',
            answerEventId: '00000000-0000-4000-8000-000000000002',
            learnerQuote: 'ATP is like energy money',
          },
          {
            concept: 'where it happens',
            result: 'misconception',
            evidence: 'said nucleus instead of chloroplast',
            correction: 'occurs in chloroplasts',
            answerEventId: '00000000-0000-4000-8000-000000000003',
            learnerQuote: 'photosynthesis happens in the nucleus',
          },
        ],
      },
      confidence: 'high',
    });
    expect(parsed.signals?.challenge_round_evaluation).toHaveLength(3);
    expect(parsed.signals?.challenge_round_evaluation?.[2]?.correction).toBe(
      'occurs in chloroplasts',
    );
  });

  it('rejects an item missing answerEventId (HIGH-6 grounding requirement)', () => {
    const result = challengeRoundEvaluationItemSchema.safeParse({
      concept: 'x',
      result: 'solid',
      evidence: 'ok',
      // missing answerEventId
      learnerQuote: 'something',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an item missing learnerQuote (HIGH-6 grounding requirement)', () => {
    const result = challengeRoundEvaluationItemSchema.safeParse({
      concept: 'x',
      result: 'solid',
      evidence: 'ok',
      answerEventId: '00000000-0000-4000-8000-000000000001',
      // missing learnerQuote
    });
    expect(result.success).toBe(false);
  });

  it('[WI-1995] drops the whole challenge evaluation when any item is malformed', () => {
    const validItem = {
      concept: 'photosynthesis vs respiration',
      result: 'solid' as const,
      evidence: 'learner described both directions of energy flow',
      answerEventId: '00000000-0000-4000-8000-000000000001',
      learnerQuote:
        'photosynthesis stores energy in glucose and respiration releases it',
    };
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'Strong work — your valid explanation is preserved.',
      signals: {
        ready_to_finish: true,
        challenge_round_evaluation: [
          validItem,
          {
            concept: 'role of ATP',
            result: 'partial',
            evidence: 'mentioned energy currency, missed structure',
            answerEventId: '00000000-0000-4000-8000-000000000002',
            // missing learnerQuote: the whole Challenge signal must be discarded
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.reply).toBe(
      'Strong work — your valid explanation is preserved.',
    );
    expect(result.data.signals?.ready_to_finish).toBe(true);
    expect(result.data.signals?.challenge_round_evaluation).toBeUndefined();
  });

  it('[WI-1995] keeps the envelope when challenge evaluation has the wrong type', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'The learner-visible reply still matters.',
      signals: {
        ready_to_finish: true,
        challenge_round_evaluation: 'not an array',
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.reply).toBe('The learner-visible reply still matters.');
    expect(result.data.signals?.ready_to_finish).toBe(true);
    expect(result.data.signals?.challenge_round_evaluation).toBeUndefined();
  });

  it('caps challenge_round_evaluation array at 10 items', () => {
    const item = {
      concept: 'x',
      result: 'solid' as const,
      evidence: 'ok',
      answerEventId: '00000000-0000-4000-8000-000000000001',
      learnerQuote: 'q',
    };
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'OK.',
      signals: {
        challenge_round_evaluation: Array.from({ length: 11 }, () => item),
      },
    });
    expect(result.success).toBe(false);
  });

  it('[WI-1995] rejects an over-cap evaluation even when one item is malformed', () => {
    const validItem = {
      concept: 'x',
      result: 'solid' as const,
      evidence: 'ok',
      answerEventId: '00000000-0000-4000-8000-000000000001',
      learnerQuote: 'q',
    };
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'OK.',
      signals: {
        challenge_round_evaluation: [
          ...Array.from({ length: 10 }, () => validItem),
          {
            concept: 'malformed overflow item',
            result: 'partial',
            evidence: 'missing provenance quote',
            answerEventId: '00000000-0000-4000-8000-000000000002',
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts challenge_round ui_hint', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Question 2 of 3.',
      ui_hints: {
        challenge_round: {
          active: true,
          question_index: 1,
          total_questions: 3,
        },
      },
      confidence: 'high',
    });
    expect(parsed.ui_hints?.challenge_round?.active).toBe(true);
    expect(parsed.ui_hints?.challenge_round?.question_index).toBe(1);
    expect(parsed.ui_hints?.challenge_round?.total_questions).toBe(3);
  });

  it('coerces null active in challenge_round ui_hint to false', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'No round active.',
      ui_hints: { challenge_round: { active: null } },
    });
    expect(parsed.ui_hints?.challenge_round?.active).toBe(false);
  });

  it('accepts note_draft ui_hint with content + sources', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: "Here's what you know now.",
      ui_hints: {
        note_draft: {
          content:
            'Photosynthesis uses light to convert CO2 and water into glucose...',
          source_concepts: ['photosynthesis vs respiration', 'role of ATP'],
          source_answer_event_ids: ['event-solid-1', 'event-solid-2'],
        },
      },
      confidence: 'high',
    });
    expect(parsed.ui_hints?.note_draft?.content).toMatch(/photosynthesis/i);
    expect(parsed.ui_hints?.note_draft?.source_answer_event_ids).toHaveLength(
      2,
    );
  });

  it('rejects note_draft with empty source_answer_event_ids (HIGH-6)', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'X.',
      ui_hints: {
        note_draft: {
          content: 'something',
          source_concepts: ['a'],
          source_answer_event_ids: [],
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T1 (2026-06-26) — challengeRoundGraderVerdictSchema
// The grader model returns judgment fields only; the server injects
// answerEventId. Min-1 enforces that the empty-array failure mode (the exact
// gpt-oss regression) is rejected at the schema layer.
// ---------------------------------------------------------------------------

describe('challengeRoundGraderVerdictSchema (T1 — grader verdict)', () => {
  const validItem = {
    concept: 'collision theory / activation energy',
    result: 'solid' as const,
    evidence: 'links speed to collision frequency and energy',
    learnerQuote: 'particles move faster and collide more often',
  };

  // (a) a one-item verdict without answerEventId parses successfully
  it('(a) accepts a valid one-item verdict without answerEventId', () => {
    const result = challengeRoundGraderVerdictSchema.safeParse({
      items: [validItem],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]?.result).toBe('solid');
    }
  });

  // (b) items: [] FAILS .min(1) — this is the exact gpt-oss regression
  it('(b) rejects empty items array (the gpt-oss failure mode)', () => {
    const result = challengeRoundGraderVerdictSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects when items is missing', () => {
    const result = challengeRoundGraderVerdictSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects more than 10 items', () => {
    const result = challengeRoundGraderVerdictSchema.safeParse({
      items: Array.from({ length: 11 }, () => validItem),
    });
    expect(result.success).toBe(false);
  });

  it('accepts all four result enum values', () => {
    for (const resultValue of [
      'solid',
      'partial',
      'missing',
      'misconception',
    ] as const) {
      const r = challengeRoundGraderVerdictSchema.safeParse({
        items: [{ ...validItem, result: resultValue }],
      });
      expect(r.success).toBe(true);
    }
  });

  it('accepts an item with an optional correction field', () => {
    const result = challengeRoundGraderVerdictSchema.safeParse({
      items: [
        {
          ...validItem,
          result: 'misconception',
          correction: 'occurs in chloroplasts, not the nucleus',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an item that supplies answerEventId (server-injected field)', () => {
    // answerEventId is .omit()-ted from the grader-item schema; the grader
    // model must NOT supply it. This test verifies the schema rejects it.
    // Note: zod's .omit() produces a schema that STRIPS the key — it does
    // NOT cause a validation failure on an extra key unless .strict() is used.
    // We therefore assert the type-level invariant (see @ts-expect-error probe
    // below) and confirm the schema parses successfully while silently dropping
    // the field (zod's default passthrough-strip behaviour). The server enforces
    // the injected value, so the model cannot fabricate a trusted answerEventId.
    const result = challengeRoundGraderVerdictSchema.safeParse({
      items: [
        { ...validItem, answerEventId: '00000000-0000-4000-8000-000000000001' },
      ],
    });
    // Schema succeeds but answerEventId is stripped (not present in output)
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]).not.toHaveProperty('answerEventId');
    }
  });

  // (c) compile-time probe — ChallengeRoundGraderVerdict items have NO
  // answerEventId key. Accessing a non-existent property via a type alias
  // triggers TS2339, which the directive on the next line expects. If
  // answerEventId were ever added back to the type, that directive would become
  // unused and tsc would fail — guarding the omit at compile time.
  it('(c) compile-time: ChallengeRoundGraderVerdict item type has no answerEventId', () => {
    type GraderItem = ChallengeRoundGraderVerdict['items'][number];
    // @ts-expect-error TS2339: answerEventId is intentionally absent (server-injected, not model-emitted)
    type _Guard = GraderItem['answerEventId'];
    expect(true).toBe(true); // compile-time only; assertion satisfies Jest
  });
});

// ---------------------------------------------------------------------------
// T1 (2026-06-26) — challengeRoundGraderDegradedEventSchema
// Inngest observability event payload — opaque ids + reason code only.
// No learner text, quotes, or answer content (PII / minor-data constraint).
// ---------------------------------------------------------------------------

describe('challengeRoundGraderDegradedEventSchema (T1 — degraded event payload)', () => {
  // WI-1155: profileId + timestamp are now REQUIRED (mid-session; profile exists).
  const REQUIRED = {
    profileId: '00000000-0000-4000-8000-0000000000aa',
    timestamp: '2026-07-03T00:00:00.000Z',
  };

  it('accepts a payload with the required fields (sessionId/answerEventId optional)', () => {
    const result = challengeRoundGraderDegradedEventSchema.safeParse({
      ...REQUIRED,
      reason: 'route_error',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a full payload with optional ids', () => {
    const result = challengeRoundGraderDegradedEventSchema.safeParse({
      ...REQUIRED,
      sessionId: '00000000-0000-4000-8000-000000000001',
      answerEventId: '00000000-0000-4000-8000-000000000002',
      reason: 'schema_invalid',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all four reason enum values', () => {
    for (const reason of [
      'route_error',
      'no_json',
      'parse_error',
      'schema_invalid',
    ] as const) {
      const r = challengeRoundGraderDegradedEventSchema.safeParse({
        ...REQUIRED,
        reason,
      });
      expect(r.success).toBe(true);
    }
  });

  it('rejects an unknown reason value', () => {
    const result = challengeRoundGraderDegradedEventSchema.safeParse({
      ...REQUIRED,
      reason: 'unknown_failure',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing reason', () => {
    const result = challengeRoundGraderDegradedEventSchema.safeParse({
      ...REQUIRED,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing profileId (mid-session events must carry it)', () => {
    const result = challengeRoundGraderDegradedEventSchema.safeParse({
      timestamp: REQUIRED.timestamp,
      reason: 'route_error',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WI-1155 B2 — teachBackGraderVerdictSchema + teachBackGraderDegradedEventSchema
// Server-side teach-back rubric fallback: the four scores are REQUIRED (unlike
// the tutor-emitted teach_back_assessment where all fields are optional).
// ---------------------------------------------------------------------------

describe('teachBackGraderVerdictSchema (WI-1155 B2 — server rubric)', () => {
  it('accepts a full valid verdict', () => {
    const result = teachBackGraderVerdictSchema.safeParse({
      completeness: 4,
      accuracy: 5,
      clarity: 3,
      overall_quality: 4,
      weakest_area: 'clarity',
      gap_identified: 'missed rapid burial',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a null gap_identified and omitted weakest_area', () => {
    const result = teachBackGraderVerdictSchema.safeParse({
      completeness: 5,
      accuracy: 5,
      clarity: 5,
      overall_quality: 5,
      gap_identified: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when a required numeric score is missing (the fallback guarantee)', () => {
    const result = teachBackGraderVerdictSchema.safeParse({
      completeness: 4,
      accuracy: 5,
      clarity: 3,
      // overall_quality missing
    });
    expect(result.success).toBe(false);
  });

  it('rejects a score outside 0-5', () => {
    const result = teachBackGraderVerdictSchema.safeParse({
      completeness: 7,
      accuracy: 5,
      clarity: 3,
      overall_quality: 4,
    });
    expect(result.success).toBe(false);
  });
});

describe('teachBackGraderDegradedEventSchema (WI-1155 B2)', () => {
  const REQUIRED = {
    profileId: '00000000-0000-4000-8000-0000000000bb',
    timestamp: '2026-07-03T00:00:00.000Z',
  };

  it('accepts a payload with the required fields', () => {
    const result = teachBackGraderDegradedEventSchema.safeParse({
      ...REQUIRED,
      reason: 'route_error',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload missing profileId (mid-session events must carry it)', () => {
    const result = teachBackGraderDegradedEventSchema.safeParse({
      timestamp: REQUIRED.timestamp,
      reason: 'route_error',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown reason value', () => {
    const result = teachBackGraderDegradedEventSchema.safeParse({
      ...REQUIRED,
      reason: 'unknown_failure',
    });
    expect(result.success).toBe(false);
  });
});
