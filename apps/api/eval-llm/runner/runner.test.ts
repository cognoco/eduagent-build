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
      ])
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
    learningMode: 'serious',
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
      s.reason.includes('live budget exceeded')
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
