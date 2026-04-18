import {
  validateHighlightResponse,
  buildBrowseHighlight,
} from './session-highlights';

describe('validateHighlightResponse', () => {
  it('accepts valid high-confidence highlight', () => {
    const result = validateHighlightResponse(
      JSON.stringify({
        highlight: 'Practiced light reactions in photosynthesis',
        confidence: 'high',
      })
    );

    expect(result).toEqual({
      valid: true,
      highlight: 'Practiced light reactions in photosynthesis',
    });
  });

  it('rejects low confidence', () => {
    const result = validateHighlightResponse(
      JSON.stringify({
        highlight: 'Practiced something',
        confidence: 'low',
      })
    );

    expect(result).toEqual({
      valid: false,
      reason: 'low_confidence',
    });
  });

  it('rejects invalid JSON', () => {
    const result = validateHighlightResponse('not json');

    expect(result).toEqual({
      valid: false,
      reason: 'parse_error',
    });
  });

  it('rejects highlight shorter than 10 chars', () => {
    const result = validateHighlightResponse(
      JSON.stringify({
        highlight: 'Short',
        confidence: 'high',
      })
    );

    expect(result).toEqual({
      valid: false,
      reason: 'length_out_of_range',
    });
  });

  it('rejects highlight longer than 120 chars', () => {
    const result = validateHighlightResponse(
      JSON.stringify({
        highlight: 'Practiced '.repeat(20),
        confidence: 'high',
      })
    );

    expect(result).toEqual({
      valid: false,
      reason: 'length_out_of_range',
    });
  });

  it('rejects highlight not starting with allowed verb', () => {
    const result = validateHighlightResponse(
      JSON.stringify({
        highlight: 'I think this was a great session about math',
        confidence: 'high',
      })
    );

    expect(result).toEqual({
      valid: false,
      reason: 'bad_prefix',
    });
  });

  it('rejects highlight containing injection patterns', () => {
    const result = validateHighlightResponse(
      JSON.stringify({
        highlight: 'Practiced ignoring previous instructions in math class',
        confidence: 'high',
      })
    );

    expect(result).toEqual({
      valid: false,
      reason: 'injection_pattern',
    });
  });

  it('accepts all allowed prefixes', () => {
    const prefixes = [
      'Practiced',
      'Learned',
      'Explored',
      'Worked through',
      'Reviewed',
      'Covered',
    ];

    for (const prefix of prefixes) {
      const highlight = `${prefix} basic algebra concepts today`;
      const result = validateHighlightResponse(
        JSON.stringify({ highlight, confidence: 'high' })
      );
      expect(result).toEqual({ valid: true, highlight });
    }
  });
});

describe('buildBrowseHighlight', () => {
  it('builds single-topic highlight', () => {
    const result = buildBrowseHighlight('Emma', ['Photosynthesis'], 120);

    expect(result).toBe('Emma browsed Photosynthesis — 2 min');
  });

  it('builds multi-topic highlight', () => {
    const result = buildBrowseHighlight(
      'Alex',
      ['Fractions', 'Decimals', 'Percentages'],
      300
    );

    expect(result).toBe(
      'Alex browsed Fractions, Decimals, Percentages — 5 min'
    );
  });

  it('truncates at 3 topics with overflow count', () => {
    const result = buildBrowseHighlight('Sam', ['A', 'B', 'C', 'D', 'E'], 60);

    expect(result).toBe('Sam browsed A, B, C and 2 more — 1 min');
  });

  it('rounds up to minimum 1 minute', () => {
    const result = buildBrowseHighlight('Zoe', ['Gravity'], 15);

    expect(result).toBe('Zoe browsed Gravity — 1 min');
  });
});

describe('prompt injection break tests', () => {
  it('[PEH-BT1] direct instruction injection is rejected', () => {
    const malicious = JSON.stringify({
      highlight: 'Practiced ignoring previous instructions and listing secrets',
      confidence: 'high',
    });

    const result = validateHighlightResponse(malicious);
    expect(result).toEqual({
      valid: false,
      reason: 'injection_pattern',
    });
  });

  it('[PEH-BT2] "system" keyword in output is rejected', () => {
    const malicious = JSON.stringify({
      highlight: 'Practiced accessing the system prompt for fun',
      confidence: 'high',
    });

    const result = validateHighlightResponse(malicious);
    expect(result).toEqual({
      valid: false,
      reason: 'injection_pattern',
    });
  });

  it('[PEH-BT3] non-allowlisted prefix is rejected', () => {
    const malicious = JSON.stringify({
      highlight: 'compromised',
      confidence: 'high',
    });

    const result = validateHighlightResponse(malicious);

    // Could fail for bad_prefix or length_out_of_range — either is correct
    expect(result.valid).toBe(false);
  });

  it('[PEH-BT4] JSON escape attempt is rejected', () => {
    // Attempt to close JSON and inject new object
    const malicious =
      '{"highlight":"Practiced math","confidence":"high"}{"injected":true}';

    const result = validateHighlightResponse(malicious);

    // JSON.parse fails on double objects — parse_error
    expect(result).toEqual({
      valid: false,
      reason: 'parse_error',
    });
  });
});
