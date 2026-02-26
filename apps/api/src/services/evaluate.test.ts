import {
  shouldTriggerEvaluate,
  getEvaluateRungDescription,
  mapEvaluateQualityToSm2,
  handleEvaluateFailure,
  parseEvaluateAssessment,
} from './evaluate';

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
    }
  );

  it('returns different descriptions for different rungs', () => {
    const descriptions = new Set(
      ([1, 2, 3, 4] as const).map(getEvaluateRungDescription)
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
  it('parses valid JSON assessment', () => {
    const response =
      'Great attempt!\n{"challengePassed": true, "flawIdentified": "wrong formula", "quality": 4}';
    const result = parseEvaluateAssessment(response);
    expect(result).toEqual({
      challengePassed: true,
      flawIdentified: 'wrong formula',
      quality: 4,
    });
  });

  it('parses failed assessment', () => {
    const response = 'Not quite.\n{"challengePassed": false, "quality": 1}';
    const result = parseEvaluateAssessment(response);
    expect(result).toEqual({
      challengePassed: false,
      flawIdentified: undefined,
      quality: 1,
    });
  });

  it('returns null when no JSON found', () => {
    expect(parseEvaluateAssessment('Just a plain response')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(
      parseEvaluateAssessment('Response\n{challengePassed: invalid}')
    ).toBeNull();
  });

  it('clamps quality to 0-5 range', () => {
    const response = '{"challengePassed": true, "quality": 10}';
    const result = parseEvaluateAssessment(response);
    expect(result?.quality).toBe(5);

    const response2 = '{"challengePassed": false, "quality": -3}';
    const result2 = parseEvaluateAssessment(response2);
    expect(result2?.quality).toBe(0);
  });

  it('defaults quality when missing', () => {
    const passedResponse = '{"challengePassed": true}';
    const result = parseEvaluateAssessment(passedResponse);
    expect(result?.quality).toBe(4);

    const failedResponse = '{"challengePassed": false}';
    const result2 = parseEvaluateAssessment(failedResponse);
    expect(result2?.quality).toBe(2);
  });
});
