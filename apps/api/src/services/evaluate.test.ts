import * as sentry from './sentry';
import {
  shouldTriggerEvaluate,
  getEvaluateRungDescription,
  mapEvaluateQualityToSm2,
  handleEvaluateFailure,
  parseEvaluateAssessment,
  evaluateAssessmentFromEnvelopeSignal,
} from './evaluate';

// Build a session-event-shaped row whose metadata carries the canonical
// envelope signal — the post-migration path. Centralised here so every test
// has the same shape and a future signal-name change updates in one place.
function eventWithEnvelopeSignal(signal: Record<string, unknown> | null): {
  content: string;
  metadata: unknown;
} {
  return {
    content: 'Quick check — let me try to trip you up. [prose only]',
    metadata: signal ? { signals: { evaluate_assessment: signal } } : null,
  };
}

// Build a session-event row whose content still carries the raw LLM envelope
// JSON — the transition path during rollout.
function eventWithRawEnvelopeContent(envelope: Record<string, unknown>): {
  content: string;
  metadata: unknown;
} {
  return {
    content: JSON.stringify(envelope),
    metadata: null,
  };
}

// ---------------------------------------------------------------------------
// shouldTriggerEvaluate
// ---------------------------------------------------------------------------

describe('shouldTriggerEvaluate', () => {
  it('returns true when easeFactor >= 2.5 and repetitions > 0', () => {
    expect(shouldTriggerEvaluate(2.5, 1)).toBe(true);
    expect(shouldTriggerEvaluate(3.0, 5)).toBe(true);
  });

  it('returns false when easeFactor < 2.5', () => {
    expect(shouldTriggerEvaluate(2.4, 3)).toBe(false);
    expect(shouldTriggerEvaluate(1.3, 10)).toBe(false);
  });

  it('returns false when repetitions is 0 (never reviewed)', () => {
    expect(shouldTriggerEvaluate(2.5, 0)).toBe(false);
    expect(shouldTriggerEvaluate(3.0, 0)).toBe(false);
  });

  it('returns false when both conditions fail', () => {
    expect(shouldTriggerEvaluate(2.0, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEvaluateRungDescription
// ---------------------------------------------------------------------------

describe('getEvaluateRungDescription', () => {
  it.each([1, 2, 3, 4] as const)(
    'returns a non-empty description for rung %d',
    (rung) => {
      const desc = getEvaluateRungDescription(rung);
      expect(desc).toBeTruthy();
      expect(typeof desc).toBe('string');
    },
  );

  it('returns different descriptions for different rungs', () => {
    const descriptions = new Set(
      ([1, 2, 3, 4] as const).map(getEvaluateRungDescription),
    );
    expect(descriptions.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// mapEvaluateQualityToSm2
// ---------------------------------------------------------------------------

describe('mapEvaluateQualityToSm2', () => {
  describe('when passed', () => {
    it('maps quality 5 to 5', () => {
      expect(mapEvaluateQualityToSm2(true, 5)).toBe(5);
    });

    it('maps quality 4 to 4', () => {
      expect(mapEvaluateQualityToSm2(true, 4)).toBe(4);
    });

    it('floors at 3 for low raw quality', () => {
      expect(mapEvaluateQualityToSm2(true, 2)).toBe(3);
      expect(mapEvaluateQualityToSm2(true, 1)).toBe(3);
      expect(mapEvaluateQualityToSm2(true, 0)).toBe(3);
    });
  });

  describe('when failed', () => {
    it('maps quality 0-1 to 2 (floor)', () => {
      expect(mapEvaluateQualityToSm2(false, 0)).toBe(2);
      expect(mapEvaluateQualityToSm2(false, 1)).toBe(2);
    });

    it('maps quality 2+ to 3 (ceiling for failure)', () => {
      expect(mapEvaluateQualityToSm2(false, 2)).toBe(3);
      expect(mapEvaluateQualityToSm2(false, 3)).toBe(3);
      expect(mapEvaluateQualityToSm2(false, 5)).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// handleEvaluateFailure
// ---------------------------------------------------------------------------

describe('handleEvaluateFailure', () => {
  it('reveals flaw on 1st failure', () => {
    const result = handleEvaluateFailure(1, 3);
    expect(result.action).toBe('reveal_flaw');
    expect(result.message).toContain('flaw');
    expect(result.newDifficultyRung).toBeUndefined();
  });

  it('lowers difficulty on 2nd failure when rung > 1', () => {
    const result = handleEvaluateFailure(2, 3);
    expect(result.action).toBe('lower_difficulty');
    expect(result.newDifficultyRung).toBe(2);
  });

  it('lowers difficulty from rung 2 to rung 1', () => {
    const result = handleEvaluateFailure(2, 2);
    expect(result.action).toBe('lower_difficulty');
    expect(result.newDifficultyRung).toBe(1);
  });

  it('exits to standard on 2nd failure when already at rung 1', () => {
    const result = handleEvaluateFailure(2, 1);
    expect(result.action).toBe('exit_to_standard');
  });

  it('exits to standard on 3rd+ failure regardless of rung', () => {
    const result = handleEvaluateFailure(3, 4);
    expect(result.action).toBe('exit_to_standard');
    expect(result.message).toContain('standard');
  });

  it('exits to standard on high failure count', () => {
    const result = handleEvaluateFailure(5, 2);
    expect(result.action).toBe('exit_to_standard');
  });
});

// ---------------------------------------------------------------------------
// parseEvaluateAssessment
// ---------------------------------------------------------------------------

describe('parseEvaluateAssessment', () => {
  it('parses assessment from envelope signal in metadata (canonical path)', () => {
    const event = eventWithEnvelopeSignal({
      challenge_passed: true,
      flaw_identified: 'wrong formula',
      quality: 4,
    });
    const result = parseEvaluateAssessment(event);
    expect(result).toEqual({
      challengePassed: true,
      flawIdentified: 'wrong formula',
      quality: 4,
    });
  });

  it('parses failed assessment from envelope signal', () => {
    const event = eventWithEnvelopeSignal({
      challenge_passed: false,
      quality: 1,
    });
    const result = parseEvaluateAssessment(event);
    expect(result).toEqual({
      challengePassed: false,
      flawIdentified: undefined,
      quality: 1,
    });
  });

  it('parses assessment from raw envelope JSON in content (transition path)', () => {
    const event = eventWithRawEnvelopeContent({
      reply: 'Quick check — was that right?',
      signals: {
        evaluate_assessment: {
          challenge_passed: true,
          flaw_identified: 'inverted cause-effect',
          quality: 5,
        },
      },
    });
    const result = parseEvaluateAssessment(event);
    expect(result).toEqual({
      challengePassed: true,
      flawIdentified: 'inverted cause-effect',
      quality: 5,
    });
  });

  it('returns null when content is plain prose with no envelope and no metadata', () => {
    expect(
      parseEvaluateAssessment({
        content: 'Just a plain response with no JSON anywhere.',
        metadata: null,
      }),
    ).toBeNull();
  });

  it('returns null when raw envelope JSON content is malformed', () => {
    // Looks like JSON but is malformed — the envelope parser should reject it
    // and the function returns null rather than throwing.
    expect(
      parseEvaluateAssessment({
        content: '{challenge_passed: invalid_unquoted}',
        metadata: null,
      }),
    ).toBeNull();
  });

  it('returns null when legacy free-text JSON blob is embedded in prose (post-migration contract)', () => {
    // [CR-2026-05-19-C5] After the envelope migration, free-text JSON blobs
    // embedded in prose violate the contract and MUST NOT be parseable —
    // otherwise the LLM keeps drifting into that shape because the parser
    // tolerates it. The envelope signal in metadata is now the only path.
    const response =
      'Great attempt!\n{"challengePassed": true, "flawIdentified": "wrong formula", "quality": 4}';
    expect(parseEvaluateAssessment(response)).toBeNull();
  });

  it('clamps quality to 0-5 range when envelope signal is out of bounds', () => {
    const high = parseEvaluateAssessment(
      eventWithEnvelopeSignal({ challenge_passed: true, quality: 10 }),
    );
    expect(high?.quality).toBe(5);

    const low = parseEvaluateAssessment(
      eventWithEnvelopeSignal({ challenge_passed: false, quality: -3 }),
    );
    expect(low?.quality).toBe(0);
  });

  it('defaults quality when missing from envelope signal', () => {
    const passed = parseEvaluateAssessment(
      eventWithEnvelopeSignal({ challenge_passed: true }),
    );
    expect(passed?.quality).toBe(4);

    const failed = parseEvaluateAssessment(
      eventWithEnvelopeSignal({ challenge_passed: false }),
    );
    expect(failed?.quality).toBe(2);
  });

  it('returns null when envelope signal is missing the required challenge_passed field', () => {
    // Without the required boolean, the assessment is unusable — the function
    // must not silently default to false (which would corrupt SM-2 retention).
    const event = eventWithEnvelopeSignal({ quality: 4 });
    expect(parseEvaluateAssessment(event)).toBeNull();
  });

  it('[WI-372] returns null when envelope challenge_passed is a string', () => {
    const event = eventWithEnvelopeSignal({
      challenge_passed: 'false',
      quality: 4,
    });

    expect(parseEvaluateAssessment(event)).toBeNull();
  });

  it('[WI-1995] partial EVALUATE signal yields no evaluation, so no mastery is granted', () => {
    const event = eventWithRawEnvelopeContent({
      reply: 'The learner-visible reply survives the partial signal.',
      signals: {
        evaluate_assessment: {
          flaw_identified: 'missing verdict',
          quality: 4,
        },
      },
    });

    expect(parseEvaluateAssessment(event)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// evaluateAssessmentFromEnvelopeSignal — direct mapping helper
// ---------------------------------------------------------------------------

describe('evaluateAssessmentFromEnvelopeSignal', () => {
  it('maps a complete envelope signal to consumer shape', () => {
    const result = evaluateAssessmentFromEnvelopeSignal({
      challenge_passed: true,
      flaw_identified: 'misread base case',
      quality: 4,
    });
    expect(result).toEqual({
      challengePassed: true,
      flawIdentified: 'misread base case',
      quality: 4,
    });
  });

  it('returns null when challenge_passed is missing', () => {
    // Type assertion to bypass compile-time check — testing runtime guard.
    const result = evaluateAssessmentFromEnvelopeSignal({
      quality: 3,
    } as unknown as {
      challenge_passed: boolean;
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [F-074 / WI-579] Envelope-failure path must not leak LLM output content
// ---------------------------------------------------------------------------

describe('[F-074 / WI-579] parseEvaluateAssessment envelope failure leaks no content', () => {
  const SENTINEL = 'Tommy-said-something-private-9yo';

  it('[BREAK] logs and captures shape-only diagnostics, never the response slice', () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureException')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    try {
      // Starts with `{` so it LOOKS like an envelope, but is malformed —
      // drives the envelope-failure logging branch.
      const content = `{"broken envelope with learner quote: ${SENTINEL}`;
      expect(parseEvaluateAssessment(content)).toBeNull();

      // Neither the structured log nor the Sentry extras may carry content.
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(SENTINEL);
      expect(captureSpy).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            context: 'parseEvaluateAssessment',
            responseLength: content.length,
          }),
        }),
      );
      expect(JSON.stringify(captureSpy.mock.calls)).not.toContain(SENTINEL);
    } finally {
      captureSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
