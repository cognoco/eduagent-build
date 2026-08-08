import { parseCliArgs, runHarness } from './runner';
import type { FlowDefinition, Scenario } from './types';
import type { EvalProfile } from '../fixtures/profiles';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// runner unit tests — focus on flag parsing + scenario fan-out + budget cap.
// Writes real snapshot files into a temp directory inside eval-llm/snapshots/
// and cleans them up after each test.
// ---------------------------------------------------------------------------

describe('parseCliArgs', () => {
  it('parses --scenarios core to the three flagship scenario ids', () => {
    const { options } = parseCliArgs(['--scenarios', 'core']);
    expect(options.scenarioFilter).toBeInstanceOf(Set);
    expect(Array.from(options.scenarioFilter ?? [])).toEqual(
      expect.arrayContaining([
        'S1-rung1-teach-new',
        'S3-rung3-evaluate',
        'S5-rung5-exit',
      ]),
    );
    expect(options.scenarioFilter?.size).toBe(3);
  });

  it('parses --scenarios full to no filter (full matrix)', () => {
    const { options } = parseCliArgs(['--scenarios', 'full']);
    expect(options.scenarioFilter).toBeUndefined();
  });

  it('parses --scenarios comma list', () => {
    const { options } = parseCliArgs(['--scenarios', 'S1,S3,custom-id']);
    expect(Array.from(options.scenarioFilter ?? [])).toEqual([
      'S1',
      'S3',
      'custom-id',
    ]);
  });

  it('parses --max-live-calls to a positive integer', () => {
    const { options } = parseCliArgs(['--max-live-calls', '7']);
    expect(options.maxLiveCalls).toBe(7);
  });

  it('ignores non-numeric --max-live-calls value', () => {
    const { options } = parseCliArgs(['--max-live-calls', 'abc']);
    expect(options.maxLiveCalls).toBeUndefined();
  });

  it('parses --only-envelope-flows to a boolean flag', () => {
    expect(
      parseCliArgs(['--only-envelope-flows']).options.onlyEnvelopeFlows,
    ).toBe(true);
    expect(parseCliArgs([]).options.onlyEnvelopeFlows).toBeUndefined();
  });
});

describe('runHarness scenario fan-out', () => {
  const scratchProfile: EvalProfile = {
    id: 'test-profile',
    description: 'synthetic test profile',
    ageYears: 12,
    birthYear: 2014,
    nativeLanguage: 'en',
    conversationLanguage: 'en',
    location: 'EU',
    interests: [{ label: 'testing', context: 'both' }],
    libraryTopics: ['unit tests'],
    struggles: [],
    strengths: [],
    recentQuizAnswers: { capitals: [], vocabulary: [], guessWho: [] },
    preferredExplanations: ['examples'],
    pacePreference: 'thorough',
  };

  function makeScenarioFlow(): FlowDefinition<{ scenarioId: string }> {
    return {
      id: 'test-scenario-flow',
      name: 'Test Scenario Flow',
      sourceFile: 'test',
      buildPromptInput: () => null,
      enumerateScenarios(): Array<Scenario<{ scenarioId: string }>> {
        return [
          { scenarioId: 'SA', input: { scenarioId: 'SA' } },
          { scenarioId: 'SB', input: { scenarioId: 'SB' } },
          { scenarioId: 'SC', input: { scenarioId: 'SC' } },
        ];
      },
      buildPrompt: (input) => ({ system: `prompt for ${input.scenarioId}` }),
    };
  }

  async function cleanupFlow(flowId: string): Promise<void> {
    const dir = path.resolve(__dirname, '..', 'snapshots', flowId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }

  afterEach(async () => {
    await cleanupFlow('test-scenario-flow');
  });

  it('writes zero snapshots when profile filter matches nothing in fixtures', async () => {
    const flow = makeScenarioFlow();
    const summary = await runHarness([flow as FlowDefinition], {
      live: false,
      profileFilter: new Set([scratchProfile.id]),
    });
    expect(summary.snapshotsWritten).toBe(0);
  });

  it('scenarioFilter silently drops excluded scenarios', async () => {
    const flow = makeScenarioFlow();
    const summary = await runHarness([flow as FlowDefinition], {
      live: false,
      profileFilter: new Set(['12yo-dinosaurs']),
      scenarioFilter: new Set(['SA', 'SC']),
    });
    expect(summary.snapshotsWritten).toBe(2);
  });
});

// Exercises the skip branch at its real call site inside runHarness. The
// predicate itself is unit-tested in budget.test.ts, but a predicate that is
// correct in isolation says nothing about whether the harness consults it
// correctly — a wrong condition here, or a pinning flow that silently drops
// the profile, would pass every other test in this suite. Uses the real
// scenario-only fixture rather than a synthetic one so the wiring under test
// is the wiring that ships.
describe('runHarness scenario-only profile gating', () => {
  const SCENARIO_ONLY_PROFILE = '34yo-adult-statistics';

  function makeFlow(
    id: string,
    pinsProfilesById?: boolean,
  ): FlowDefinition<{ scenarioId: string }> {
    return {
      id,
      name: `Flow ${id}`,
      sourceFile: 'test',
      ...(pinsProfilesById === undefined ? {} : { pinsProfilesById }),
      buildPromptInput: () => null,
      // A pinning flow does its own profile selection inside
      // enumerateScenarios; the runner only needs to know it pins, via
      // pinsProfilesById. Returning one scenario for whichever profile it is
      // handed is enough to prove the profile reached this point at all.
      enumerateScenarios(): Array<Scenario<{ scenarioId: string }>> {
        return [{ scenarioId: 'SA', input: { scenarioId: 'SA' } }];
      },
      buildPrompt: (input) => ({ system: `prompt for ${input.scenarioId}` }),
    };
  }

  async function cleanupFlow(flowId: string): Promise<void> {
    const dir = path.resolve(__dirname, '..', 'snapshots', flowId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }

  afterEach(async () => {
    await cleanupFlow('non-pinning-flow');
    await cleanupFlow('pinning-flow');
  });

  it('records a skip, and writes nothing, when a flow does not pin profiles', async () => {
    const summary = await runHarness(
      [makeFlow('non-pinning-flow') as FlowDefinition],
      {
        live: false,
        profileFilter: new Set([SCENARIO_ONLY_PROFILE]),
      },
    );

    expect(summary.skipped).toContainEqual({
      flowId: 'non-pinning-flow',
      profileId: SCENARIO_ONLY_PROFILE,
      reason: 'scenario-only profile not pinned by this flow',
    });
    // The skip must be recorded rather than the profile vanishing silently.
    expect(summary.snapshotsWritten).toBe(0);
  });

  it('processes the profile normally when the flow pins profiles by id', async () => {
    const summary = await runHarness(
      [makeFlow('pinning-flow', true) as FlowDefinition],
      {
        live: false,
        profileFilter: new Set([SCENARIO_ONLY_PROFILE]),
      },
    );

    expect(
      summary.skipped.filter((s) => s.profileId === SCENARIO_ONLY_PROFILE),
    ).toEqual([]);
    expect(summary.snapshotsWritten).toBeGreaterThan(0);
  });
});

describe('runHarness live budget cap', () => {
  const makeLiveFlow = (calls: {
    count: number;
  }): FlowDefinition<{ scenarioId: string }> => ({
    id: 'test-live-flow',
    name: 'Test Live Flow',
    sourceFile: 'test',
    buildPromptInput: () => null,
    enumerateScenarios(): Array<Scenario<{ scenarioId: string }>> {
      return [
        { scenarioId: 'L1', input: { scenarioId: 'L1' } },
        { scenarioId: 'L2', input: { scenarioId: 'L2' } },
        { scenarioId: 'L3', input: { scenarioId: 'L3' } },
      ];
    },
    buildPrompt: (input) => ({ system: `live ${input.scenarioId}` }),
    runLive: async () => {
      calls.count++;
      return '{"ok":true}';
    },
  });

  afterEach(async () => {
    const dir = path.resolve(__dirname, '..', 'snapshots', 'test-live-flow');
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('aborts additional live calls once maxLiveCalls is reached', async () => {
    const calls = { count: 0 };
    const flow = makeLiveFlow(calls);
    const summary = await runHarness([flow as FlowDefinition], {
      live: true,
      profileFilter: new Set(['12yo-dinosaurs']),
      maxLiveCalls: 1,
    });
    expect(calls.count).toBe(1);
    expect(summary.liveCallsOk).toBe(1);
    const budgetSkips = summary.skipped.filter((s) =>
      s.reason.includes('live budget exceeded'),
    );
    expect(budgetSkips.length).toBe(2);
  });

  it('default budget (undefined) uses the built-in 20-call cap', async () => {
    const calls = { count: 0 };
    const flow = makeLiveFlow(calls);
    await runHarness([flow as FlowDefinition], {
      live: true,
      profileFilter: new Set(['12yo-dinosaurs']),
    });
    expect(calls.count).toBe(3);
  });
});

describe('runHarness live budget cap [WI-3029 provider-accounting correction]', () => {
  // A flow whose declared providerCallCount is 2/item (e.g. review-continuity-
  // opener with the mentor pinned) — before the fix, the runner incremented
  // its outer-call counter by exactly 1 regardless of this declaration, so
  // maxLiveCalls only ever capped the number of runLive() invocations, never
  // the actual provider-call cost.
  const makeCostlyLiveFlow = (
    calls: { count: number },
    costPerItem: number,
  ): FlowDefinition<{ scenarioId: string }> => ({
    id: 'test-costly-live-flow',
    name: 'Test Costly Live Flow',
    sourceFile: 'test',
    buildPromptInput: () => null,
    enumerateScenarios(): Array<Scenario<{ scenarioId: string }>> {
      return [
        { scenarioId: 'L1', input: { scenarioId: 'L1' } },
        { scenarioId: 'L2', input: { scenarioId: 'L2' } },
        { scenarioId: 'L3', input: { scenarioId: 'L3' } },
      ];
    },
    buildPrompt: (input) => ({ system: `live ${input.scenarioId}` }),
    runLive: async () => {
      calls.count++;
      return '{"ok":true}';
    },
    providerCallCount: () => costPerItem,
  });

  afterEach(async () => {
    for (const id of [
      'test-costly-live-flow',
      'test-context-sensitive-live-flow',
    ]) {
      const dir = path.resolve(__dirname, '..', 'snapshots', id);
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('reserves the declared provider-call cost per item, not 1 per outer call', async () => {
    // 3 items × cost 2 = 6 needed; cap is 4 → only 2 items fit (2+2=4), the
    // 3rd would need 2+2=6 > 4 and must be skipped WITHOUT an outer call.
    const calls = { count: 0 };
    const flow = makeCostlyLiveFlow(calls, 2);
    const summary = await runHarness([flow as FlowDefinition], {
      live: true,
      profileFilter: new Set(['12yo-dinosaurs']),
      maxLiveCalls: 4,
    });
    expect(calls.count).toBe(2);
    expect(summary.liveCallsOk).toBe(2);
    const budgetSkips = summary.skipped.filter((s) =>
      s.reason.includes('live budget exceeded'),
    );
    expect(budgetSkips.length).toBe(1);
  });

  it('rejects an item before any outer/judge call when the remaining budget cannot cover its declared cost', async () => {
    // cap=3, cost=2/item: item 1 fits (0+2<=3, liveCallsMade->2); item 2
    // needs 2 more but 2+2=4>3, so it must be skipped BEFORE runLive is
    // invoked for it — not after a partial/failed attempt.
    const calls = { count: 0 };
    const flow = makeCostlyLiveFlow(calls, 2);
    const summary = await runHarness([flow as FlowDefinition], {
      live: true,
      profileFilter: new Set(['12yo-dinosaurs']),
      maxLiveCalls: 3,
    });
    expect(calls.count).toBe(1);
    expect(summary.liveCallsOk).toBe(1);
    expect(summary.liveCallsFailed).toBe(0);
    const budgetSkips = summary.skipped.filter((s) =>
      s.reason.includes('live budget exceeded'),
    );
    expect(budgetSkips.length).toBe(2);
  });

  it('an exact-fit remaining budget still allows the call (boundary: equal, not only strictly greater)', async () => {
    // cap=6, cost=2/item, 3 items: 2+2+2=6 exactly fits with no skip.
    const calls = { count: 0 };
    const flow = makeCostlyLiveFlow(calls, 2);
    const summary = await runHarness([flow as FlowDefinition], {
      live: true,
      profileFilter: new Set(['12yo-dinosaurs']),
      maxLiveCalls: 6,
    });
    expect(calls.count).toBe(3);
    expect(summary.liveCallsOk).toBe(3);
    expect(
      summary.skipped.filter((s) => s.reason.includes('live budget exceeded'))
        .length,
    ).toBe(0);
  });

  it('a flow with no providerCallCount still defaults to cost 1/item (no regression)', async () => {
    const calls = { count: 0 };
    const flow: FlowDefinition<{ scenarioId: string }> = {
      id: 'test-costly-live-flow',
      name: 'Test Costly Live Flow (no providerCallCount)',
      sourceFile: 'test',
      buildPromptInput: () => null,
      enumerateScenarios(): Array<Scenario<{ scenarioId: string }>> {
        return [
          { scenarioId: 'L1', input: { scenarioId: 'L1' } },
          { scenarioId: 'L2', input: { scenarioId: 'L2' } },
          { scenarioId: 'L3', input: { scenarioId: 'L3' } },
        ];
      },
      buildPrompt: (input) => ({ system: `live ${input.scenarioId}` }),
      runLive: async () => {
        calls.count++;
        return '{"ok":true}';
      },
      // No providerCallCount — must default to cost 1/item.
    };
    const summary = await runHarness([flow as FlowDefinition], {
      live: true,
      profileFilter: new Set(['12yo-dinosaurs']),
      maxLiveCalls: 2,
    });
    expect(calls.count).toBe(2);
    expect(summary.liveCallsOk).toBe(2);
  });

  it('[WI-3029 SHOULD-1] threads the real options.openrouterModel into providerCallCount, not an empty/undefined context', async () => {
    // makeCostlyLiveFlow's cost is a FIXED constant that ignores its context
    // argument, so it cannot tell "the runner passed the real
    // openrouterModel" apart from "the runner silently dropped it" — both
    // look identical to a context-blind cost function. This flow mirrors
    // review-continuity-opener's ACTUAL rule (context.openrouterModel ? 2 : 1),
    // so it only costs 2/item when options.openrouterModel genuinely reaches
    // providerCallCount. If runHarness ever stopped threading the real value
    // (e.g. `providerCallContext: { openrouterModel: undefined }` regardless
    // of options.openrouterModel), every item would silently cost 1 instead
    // of 2, nothing would be skipped, and calls.count would be 3, not 2.
    const calls = { count: 0 };
    const flow: FlowDefinition<{ scenarioId: string }> = {
      id: 'test-context-sensitive-live-flow',
      name: 'Test Context-Sensitive Live Flow',
      sourceFile: 'test',
      buildPromptInput: () => null,
      enumerateScenarios(): Array<Scenario<{ scenarioId: string }>> {
        return [
          { scenarioId: 'L1', input: { scenarioId: 'L1' } },
          { scenarioId: 'L2', input: { scenarioId: 'L2' } },
          { scenarioId: 'L3', input: { scenarioId: 'L3' } },
        ];
      },
      buildPrompt: (input) => ({ system: `live ${input.scenarioId}` }),
      runLive: async () => {
        calls.count++;
        return '{"ok":true}';
      },
      providerCallCount: (_input, context) => (context.openrouterModel ? 2 : 1),
    };
    const summary = await runHarness([flow as FlowDefinition], {
      live: true,
      profileFilter: new Set(['12yo-dinosaurs']),
      openrouterModel: 'openai/gpt-oss-120b',
      // Fits exactly 2 pinned-cost items (2+2=4); the 3rd needs 2 more
      // (4+2=6 > 4) and must be skipped.
      maxLiveCalls: 4,
    });
    expect(calls.count).toBe(2);
    expect(summary.liveCallsOk).toBe(2);
    const budgetSkips = summary.skipped.filter((s) =>
      s.reason.includes('live budget exceeded'),
    );
    expect(budgetSkips.length).toBe(1);
  });
});

describe('runHarness deterministic quality checks', () => {
  afterEach(async () => {
    const dir = path.resolve(
      __dirname,
      '..',
      'snapshots',
      'test-deterministic-flow',
    );
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('runs deterministic quality checks without --live', async () => {
    const flow: FlowDefinition<{ ok: boolean }> = {
      id: 'test-deterministic-flow',
      name: 'Test Deterministic Flow',
      sourceFile: 'test',
      buildPromptInput: () => ({ ok: false }),
      buildPrompt: () => ({ system: 'deterministic check only' }),
      evaluateDeterministic: ({ input }) =>
        input.ok
          ? []
          : [
              {
                severity: 'error',
                code: 'not-ok',
                message: 'Input failed deterministic check',
              },
            ],
    };

    const summary = await runHarness([flow as FlowDefinition], {
      live: false,
      profileFilter: new Set(['12yo-dinosaurs']),
    });

    expect(summary.liveCallsOk).toBe(0);
    expect(summary.qualityFailures).toBe(1);
    expect(summary.snapshotsWritten).toBe(1);
  });
});

describe('runHarness --only-envelope-flows', () => {
  const makeSimpleFlow = (
    id: string,
    emitsEnvelope?: boolean,
  ): FlowDefinition<Record<string, never>> => ({
    id,
    name: id,
    sourceFile: 'test',
    ...(emitsEnvelope ? { emitsEnvelope: true } : {}),
    buildPromptInput: () => ({}),
    buildPrompt: () => ({ system: `prompt for ${id}` }),
  });

  afterEach(async () => {
    for (const id of ['env-only-flow', 'plain-only-flow']) {
      const dir = path.resolve(__dirname, '..', 'snapshots', id);
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('runs only emitsEnvelope flows when onlyEnvelopeFlows is set', async () => {
    const summary = await runHarness(
      [
        makeSimpleFlow('env-only-flow', true) as FlowDefinition,
        makeSimpleFlow('plain-only-flow') as FlowDefinition,
      ],
      {
        live: false,
        profileFilter: new Set(['12yo-dinosaurs']),
        onlyEnvelopeFlows: true,
      },
    );
    // Only the emitsEnvelope flow is active; the plain flow is filtered out.
    expect(summary.flowsRun).toBe(1);
    expect(summary.snapshotsWritten).toBe(1);
  });

  it('runs all matching flows when onlyEnvelopeFlows is absent', async () => {
    const summary = await runHarness(
      [
        makeSimpleFlow('env-only-flow', true) as FlowDefinition,
        makeSimpleFlow('plain-only-flow') as FlowDefinition,
      ],
      {
        live: false,
        profileFilter: new Set(['12yo-dinosaurs']),
      },
    );
    expect(summary.flowsRun).toBe(2);
  });
});

describe('runHarness envelope coverage accounting', () => {
  afterEach(async () => {
    for (const id of ['test-envelope-coverage', 'test-envelope-precall-skip']) {
      const dir = path.resolve(__dirname, '..', 'snapshots', id);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('records attempted, completed, budget-skipped, and required samples per flow', async () => {
    const flow: FlowDefinition<{ scenarioId: string }> = {
      id: 'test-envelope-coverage',
      name: 'Test Envelope Coverage',
      sourceFile: 'test',
      emitsEnvelope: true,
      buildPromptInput: () => null,
      enumerateScenarios: () => [
        { scenarioId: 'C1', input: { scenarioId: 'C1' } },
        { scenarioId: 'C2', input: { scenarioId: 'C2' } },
        { scenarioId: 'C3', input: { scenarioId: 'C3' } },
      ],
      buildPrompt: () => ({ system: 'coverage' }),
      runLive: async () => '{"reply":"ok"}',
    };

    const summary = await runHarness([flow], {
      live: true,
      profileFilter: new Set(['12yo-dinosaurs']),
      maxLiveCalls: 1,
    });

    expect(summary.envelopeCoverage['test-envelope-coverage']).toEqual({
      attempted: 3,
      completed: 1,
      budgetSkipped: 2,
      required: 3,
      complete: false,
    });
  });

  it('marks coverage incomplete when an item is dropped BEFORE the live-call attempt, even with zero budget-skips [WI-3029 S4]', async () => {
    // buildPrompt throws for C2 — the outer catch in runHarness records it as
    // `skipped`, but (pre-fix) never touched `coverage.attempted`, so a flow
    // that silently lost a sample to an early crash still reported
    // `complete: true` because attempted(2) === completed(2) with
    // budgetSkipped === 0. required (derived independently of the crash, from
    // the same enumerateScenarios population) must catch this: attempted(2)
    // < required(3) keeps it incomplete.
    const flow: FlowDefinition<{ scenarioId: string }> = {
      id: 'test-envelope-precall-skip',
      name: 'Test Envelope Pre-call Skip',
      sourceFile: 'test',
      emitsEnvelope: true,
      buildPromptInput: () => null,
      enumerateScenarios: () => [
        { scenarioId: 'C1', input: { scenarioId: 'C1' } },
        { scenarioId: 'C2', input: { scenarioId: 'C2' } },
        { scenarioId: 'C3', input: { scenarioId: 'C3' } },
      ],
      buildPrompt: (input) => {
        if (input.scenarioId === 'C2') {
          throw new Error('simulated builder crash');
        }
        return { system: 'coverage' };
      },
      runLive: async () => '{"reply":"ok"}',
    };

    const summary = await runHarness([flow], {
      live: true,
      profileFilter: new Set(['12yo-dinosaurs']),
    });

    expect(summary.envelopeCoverage['test-envelope-precall-skip']).toEqual({
      attempted: 2,
      completed: 2,
      budgetSkipped: 0,
      required: 3,
      complete: false,
    });
  });
});
