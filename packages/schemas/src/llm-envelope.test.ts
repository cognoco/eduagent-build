import {
  llmResponseEnvelopeSchema,
  normaliseSignals,
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

  it('rejects evaluate_assessment without challenge_passed (required field)', () => {
    const result = llmResponseEnvelopeSchema.safeParse({
      reply: 'ok',
      signals: {
        evaluate_assessment: {
          quality: 4,
        },
      },
    });
    expect(result.success).toBe(false);
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
});
