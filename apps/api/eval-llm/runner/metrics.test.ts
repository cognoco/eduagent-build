import {
  aggregateFlowSamples,
  buildBaseline,
  compareAgainstBaseline,
  extractSampleMetrics,
  formatDriftReport,
  parseBaseline,
  type Baseline,
  type FlowAggregate,
} from './metrics';

describe('extractSampleMetrics', () => {
  it('extracts signals and ui_hints from a well-formed envelope', () => {
    const s = extractSampleMetrics(
      JSON.stringify({
        reply: 'Great try!',
        signals: {
          partial_progress: true,
          needs_deepening: false,
          understanding_check: true,
        },
        ui_hints: {
          note_prompt: { show: true, post_session: false },
        },
        confidence: 'medium',
      })
    );
    expect(s.envelopeOk).toBe(true);
    expect(s.hasReply).toBe(true);
    expect(s.signals.partialProgress).toBe(true);
    expect(s.signals.understandingCheck).toBe(true);
    expect(s.signals.needsDeepening).toBe(false);
    expect(s.uiHints.notePromptShow).toBe(true);
    expect(s.confidence).toBe('medium');
  });

  it('treats malformed JSON as envelopeOk=false with all signals off', () => {
    const s = extractSampleMetrics('this is not JSON');
    expect(s.envelopeOk).toBe(false);
    expect(s.hasReply).toBe(false);
    expect(s.signals.partialProgress).toBe(false);
    expect(s.signals.understandingCheck).toBe(false);
  });

  it('treats schema-violating JSON as envelopeOk=false', () => {
    const s = extractSampleMetrics('{"unexpected": true}');
    expect(s.envelopeOk).toBe(false);
  });

  it('extracts a reply from an envelope even without signals', () => {
    const s = extractSampleMetrics('{"reply": "Hello"}');
    expect(s.envelopeOk).toBe(true);
    expect(s.hasReply).toBe(true);
    expect(s.signals.partialProgress).toBe(false);
  });

  it('marks empty reply as hasReply=false (envelope schema rejects it)', () => {
    // The envelope schema requires reply.min(1); an empty reply is rejected
    // by the validator, so the sample is envelopeOk=false and hasReply=false.
    const s = extractSampleMetrics('{"reply": ""}');
    expect(s.envelopeOk).toBe(false);
    expect(s.hasReply).toBe(false);
  });

  it('captures fluency_drill.active when true', () => {
    const s = extractSampleMetrics(
      JSON.stringify({
        reply: 'Ready?',
        ui_hints: { fluency_drill: { active: true, duration_s: 45 } },
      })
    );
    expect(s.uiHints.fluencyDrillActive).toBe(true);
  });

  // ---- [LITERAL-ESCAPE] Regression guard for double-escape leak ---------

  it('[LITERAL-ESCAPE] flags a reply containing literal `\\n`', () => {
    // The exact bug pattern from the bubble screenshot: LLM emits `\\\\n` in
    // raw JSON, parses to a literal backslash + n in the reply. Even though
    // the runtime normalizer cleans this for the user, the metric should
    // still report it so prompt regressions are visible.
    const s = extractSampleMetrics(
      '{"reply": "That\'s it!\\\\nNow we move on."}'
    );
    expect(s.envelopeOk).toBe(true);
    expect(s.replyHasLiteralEscape).toBe(true);
  });

  it('[LITERAL-ESCAPE] does NOT flag a reply with proper JSON-escaped newline', () => {
    // Correct emission: raw JSON `\\n` → real newline after parse → no leak.
    const s = extractSampleMetrics('{"reply": "Line1\\nLine2"}');
    expect(s.envelopeOk).toBe(true);
    expect(s.replyHasLiteralEscape).toBe(false);
  });

  it('[LITERAL-ESCAPE] flags literal `\\t` and `\\r` too', () => {
    expect(
      extractSampleMetrics('{"reply": "a\\\\tb"}').replyHasLiteralEscape
    ).toBe(true);
    expect(
      extractSampleMetrics('{"reply": "a\\\\rb"}').replyHasLiteralEscape
    ).toBe(true);
  });

  it('[LITERAL-ESCAPE] returns false when envelope parse fails', () => {
    // Defensive: malformed JSON yields the empty-sample default, not true.
    const s = extractSampleMetrics('not JSON at all');
    expect(s.envelopeOk).toBe(false);
    expect(s.replyHasLiteralEscape).toBe(false);
  });
});

describe('aggregateFlowSamples', () => {
  it('returns zero rates and n=0 for an empty sample set', () => {
    const agg = aggregateFlowSamples([]);
    expect(agg.n).toBe(0);
    expect(agg.rates.envelopeOk).toBe(0);
    expect(agg.rates.partialProgress).toBe(0);
  });

  it('computes rates as fractions 0..1 (not percentages)', () => {
    const samples = [
      extractSampleMetrics('{"reply":"a","signals":{"partial_progress":true}}'),
      extractSampleMetrics('{"reply":"b","signals":{"partial_progress":true}}'),
      extractSampleMetrics(
        '{"reply":"c","signals":{"partial_progress":false}}'
      ),
      extractSampleMetrics(
        '{"reply":"d","signals":{"partial_progress":false}}'
      ),
    ];
    const agg = aggregateFlowSamples(samples);
    expect(agg.n).toBe(4);
    expect(agg.rates.envelopeOk).toBe(1);
    expect(agg.rates.partialProgress).toBeCloseTo(0.5, 5);
  });

  it('counts envelopeOk=false for malformed responses', () => {
    const agg = aggregateFlowSamples([
      extractSampleMetrics('{"reply":"ok","signals":{}}'),
      extractSampleMetrics('broken'),
      extractSampleMetrics('also broken'),
    ]);
    expect(agg.n).toBe(3);
    expect(agg.rates.envelopeOk).toBeCloseTo(1 / 3, 5);
  });
});

describe('compareAgainstBaseline', () => {
  function makeAggregate(
    overrides: Partial<FlowAggregate['rates']> = {},
    n = 20
  ): FlowAggregate {
    return {
      n,
      rates: {
        envelopeOk: 1,
        hasReply: 1,
        replyHasLiteralEscape: 0,
        partialProgress: 0.2,
        needsDeepening: 0.05,
        understandingCheck: 0.3,
        readyToFinish: 0,
        notePromptShow: 0.1,
        fluencyDrillActive: 0,
        confidenceLow: 0.05,
        ...overrides,
      },
    };
  }

  function makeBaseline(flows: Record<string, FlowAggregate>): Baseline {
    return {
      version: 1,
      updatedAt: '2026-04-20T00:00:00.000Z',
      flows,
    };
  }

  it('reports no drift when current matches baseline within tolerance', () => {
    const base = makeBaseline({ exchanges: makeAggregate() });
    const drifts = compareAgainstBaseline(
      { exchanges: makeAggregate({ partialProgress: 0.22 }) },
      base,
      0.05
    );
    expect(drifts).toEqual([]);
  });

  it('flags a metric when absolute drift exceeds tolerance', () => {
    const base = makeBaseline({ exchanges: makeAggregate() });
    const drifts = compareAgainstBaseline(
      // partialProgress dropped from 20% to 2% (18pp) — huge regression.
      { exchanges: makeAggregate({ partialProgress: 0.02 }) },
      base,
      0.05
    );
    expect(drifts).toHaveLength(1);
    expect(drifts[0]).toMatchObject({
      flowId: 'exchanges',
      metric: 'partialProgress',
    });
    expect(drifts[0]?.deltaPp).toBeCloseTo(0.18, 5);
  });

  it('flags envelopeOk drops (the main regression this catches)', () => {
    const base = makeBaseline({ exchanges: makeAggregate({ envelopeOk: 1 }) });
    const drifts = compareAgainstBaseline(
      // Model started dropping JSON format on half the turns.
      { exchanges: makeAggregate({ envelopeOk: 0.5 }) },
      base,
      0.05
    );
    const envelopeDrift = drifts.find((d) => d.metric === 'envelopeOk');
    expect(envelopeDrift).not.toBeUndefined();
    expect(envelopeDrift?.deltaPp).toBeCloseTo(0.5, 5);
  });

  it('treats a missing flow as full-magnitude drops against baseline', () => {
    const base = makeBaseline({ exchanges: makeAggregate() });
    const drifts = compareAgainstBaseline(
      // Flow disappeared entirely (or ran zero samples).
      {},
      base,
      0.05
    );
    // Every non-trivial metric (>tolerance) with a baseline should appear.
    expect(drifts.length).toBeGreaterThan(0);
    expect(drifts.every((d) => d.flowId === 'exchanges')).toBe(true);
    expect(drifts.every((d) => d.currentRate === 0)).toBe(true);
  });

  it('treats a new flow as all-or-nothing delta from zero', () => {
    const base = makeBaseline({});
    const drifts = compareAgainstBaseline(
      { 'new-flow': makeAggregate({ partialProgress: 0.3 }) },
      base,
      0.05
    );
    expect(
      drifts.some(
        (d) => d.flowId === 'new-flow' && d.metric === 'partialProgress'
      )
    ).toBe(true);
  });

  it('sorts drifts by largest delta first', () => {
    const base = makeBaseline({
      exchanges: makeAggregate({ partialProgress: 0.2, notePromptShow: 0.1 }),
    });
    const drifts = compareAgainstBaseline(
      {
        exchanges: makeAggregate({
          partialProgress: 0.05, // 15pp drop
          notePromptShow: 0.5, // 40pp jump — should come first
        }),
      },
      base,
      0.05
    );
    expect(drifts[0]?.metric).toBe('notePromptShow');
    expect(drifts[1]?.metric).toBe('partialProgress');
  });
});

describe('buildBaseline + parseBaseline', () => {
  it('round-trips through JSON serialisation', () => {
    const aggregates: Record<string, FlowAggregate> = {
      exchanges: {
        n: 20,
        rates: {
          envelopeOk: 1,
          hasReply: 1,
          replyHasLiteralEscape: 0,
          partialProgress: 0.25,
          needsDeepening: 0.05,
          understandingCheck: 0.3,
          readyToFinish: 0,
          notePromptShow: 0.15,
          fluencyDrillActive: 0,
          confidenceLow: 0.1,
        },
      },
    };
    const baseline = buildBaseline(aggregates, { ref: 'abc123' });
    const json = JSON.stringify(baseline);
    const parsed = parseBaseline(json);
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(1);
    expect(parsed?.ref).toBe('abc123');
    expect(parsed?.flows.exchanges?.rates.partialProgress).toBeCloseTo(0.25, 5);
  });

  it('rejects a baseline with the wrong version', () => {
    const parsed = parseBaseline(JSON.stringify({ version: 999, flows: {} }));
    expect(parsed).toBeNull();
  });

  it('returns null for non-JSON input', () => {
    expect(parseBaseline('not json')).toBeNull();
  });
});

describe('formatDriftReport', () => {
  it('returns empty string for no drift (quiet CI logs)', () => {
    expect(formatDriftReport([])).toBe('');
  });

  it('renders each drift with before/after percentages', () => {
    const report = formatDriftReport([
      {
        flowId: 'exchanges',
        metric: 'envelopeOk',
        baselineRate: 1,
        currentRate: 0.5,
        deltaPp: 0.5,
      },
    ]);
    expect(report).toContain('[exchanges]');
    expect(report).toContain('envelopeOk');
    expect(report).toContain('100.0%');
    expect(report).toContain('50.0%');
    expect(report).toContain('50.0pp');
  });
});
