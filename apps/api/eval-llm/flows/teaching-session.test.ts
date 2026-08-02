// ---------------------------------------------------------------------------
// Teaching-session flow — pure verdict→issue unit tests (no LLM calls)
//
// Tests evaluateTeachingVerdict() over hand-crafted JSON liveResponse strings
// for every severity case in the plan §T3 list. Also tests assertScenarioProfilesResolve.
//
// No jest.mock of any internal module (GC1/GC6) — these are pure-function
// tests; no real implementations are bypassed.
// ---------------------------------------------------------------------------

import {
  evaluateTeachingVerdict,
  runTeachingSession,
  type TeachingSessionInput,
  type TeachingSessionLiveDeps,
  type TeachingVerdict,
} from './teaching-session';
import {
  assertScenarioProfilesResolve,
  TEACHING_SCENARIOS,
} from '../fixtures/teaching-scenarios';
import { PROFILES } from '../fixtures/profiles';
import type { EvalProfile } from '../fixtures/profiles';

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

const DUMMY_INPUT: TeachingSessionInput = {
  scenarioId: 'TS01-moon-phases',
  topicTitle: 'Moon Phases',
  startingGap: 'Earth shadow misconception',
  learnerOpening: 'The Moon changes because of Earth shadow.',
  profileId: '12yo-dinosaurs',
  context: {
    sessionId: 'eval-ts-test',
    profileId: 'eval-profile-test',
    subjectName: 'Science',
    topicTitle: 'Moon Phases',
    topicDescription: 'The Moon orbits Earth.',
    sessionType: 'learning',
    escalationRung: 2,
    exchangeHistory: [],
    birthYear: 2014,
    exchangeCount: 0,
  },
  learnerAge: 12,
};

/** Build a liveResponse JSON string from a verdict (or partial). */
function makeResponse(verdict: Record<string, unknown> | null): string {
  if (verdict === null) {
    // Missing verdict entirely — empty envelope
    return JSON.stringify({
      scenarioId: 'TS01-moon-phases',
      transcript: [],
      transferAnswer: '',
    });
  }
  return JSON.stringify({
    scenarioId: 'TS01-moon-phases',
    transcript: [],
    transferAnswer: 'test answer',
    verdict,
  });
}

/** Full "all OK" verdict for re-use in soft-dimension tests. */
const OK_VERDICT: TeachingVerdict = {
  transfer: 'yes',
  scaffolding_appropriate: true,
  looped_or_incoherent: false,
  told_not_taught: false,
  evidence: 'Learner demonstrated correct understanding.',
};

// ---------------------------------------------------------------------------
// Transfer dimension (the sole error-class dimension)
// ---------------------------------------------------------------------------

describe('evaluateTeachingVerdict — transfer dimension', () => {
  it("transfer:'no' → exactly one error with code containing '.transfer-failed'", () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT, transfer: 'no' }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toContain('.transfer-failed');
  });

  it("transfer:'partial' → exactly one warning, zero errors", () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT, transfer: 'partial' }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('warning');
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it("transfer:'yes' → zero transfer issues", () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT, transfer: 'yes' }),
    );
    // No transfer issue; no soft-dimension issues either (all OK)
    expect(issues).toHaveLength(0);
  });

  it('transfer unrecognised value → schema-invalid ERROR (fail closed)', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT, transfer: 'maybe' }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toContain('verdict-schema-invalid');
  });
});

// ---------------------------------------------------------------------------
// Structural verdict validation (fail closed, WI-2461 review round 2)
//
// A parseable-but-structurally-invalid verdict ({}, missing fields, wrong
// types) must be an error: pre-fix, `{}` fell through to the unrecognised-
// transfer WARNING and the boolean dimensions silently no-op'd, so a judge
// that returned garbage JSON passed the gate.
// ---------------------------------------------------------------------------

describe('evaluateTeachingVerdict — structural verdict validation', () => {
  it('empty object verdict {} → one schema-invalid ERROR', () => {
    const issues = evaluateTeachingVerdict(DUMMY_INPUT, makeResponse({}));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toContain('verdict-schema-invalid');
  });

  it('missing boolean fields (transfer only) → schema-invalid ERROR naming the missing fields', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ transfer: 'yes' }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toContain('verdict-schema-invalid');
    expect(issues[0]!.message).toContain('scaffolding_appropriate');
    expect(issues[0]!.message).toContain('looped_or_incoherent');
    expect(issues[0]!.message).toContain('told_not_taught');
  });

  it('wrong-typed fields (numeric transfer, string boolean) → schema-invalid ERROR', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({
        transfer: 1,
        scaffolding_appropriate: 'yes',
        looped_or_incoherent: false,
        told_not_taught: false,
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toContain('verdict-schema-invalid');
  });

  it('a fully valid verdict still evaluates normally (no schema issue)', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT }),
    );
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Soft dimensions — each independently produces one warning
// ---------------------------------------------------------------------------

describe('evaluateTeachingVerdict — soft dimensions (warnings only)', () => {
  it('scaffolding_appropriate:false → one warning, zero errors', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT, scaffolding_appropriate: false }),
    );
    const scaffoldingIssues = issues.filter((i) =>
      i.code.includes('scaffolding'),
    );
    expect(scaffoldingIssues).toHaveLength(1);
    expect(scaffoldingIssues[0]!.severity).toBe('warning');
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('scaffolding_appropriate:true → no scaffolding issue', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT, scaffolding_appropriate: true }),
    );
    expect(issues.filter((i) => i.code.includes('scaffolding'))).toHaveLength(
      0,
    );
  });

  it('looped_or_incoherent:true → one warning, zero errors', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT, looped_or_incoherent: true }),
    );
    const loopIssues = issues.filter((i) => i.code.includes('looped'));
    expect(loopIssues).toHaveLength(1);
    expect(loopIssues[0]!.severity).toBe('warning');
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('looped_or_incoherent:false → no coherence issue', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT, looped_or_incoherent: false }),
    );
    expect(issues.filter((i) => i.code.includes('looped'))).toHaveLength(0);
  });

  it('told_not_taught:true → one warning, zero errors', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT, told_not_taught: true }),
    );
    const tntIssues = issues.filter((i) => i.code.includes('told-not-taught'));
    expect(tntIssues).toHaveLength(1);
    expect(tntIssues[0]!.severity).toBe('warning');
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('told_not_taught:false → no told-not-taught issue', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ ...OK_VERDICT, told_not_taught: false }),
    );
    expect(
      issues.filter((i) => i.code.includes('told-not-taught')),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Missing / error verdict cases
// ---------------------------------------------------------------------------

describe('evaluateTeachingVerdict — missing or error verdict (fail closed, WI-2461 AC-3)', () => {
  // An unjudged transcript must FAIL the gate, not warn: a warning-only issue
  // never increments summary.qualityFailures, so pre-fix an entirely unjudged
  // teaching run (judge down, unparseable verdict) exited 0 and read as green.

  it('missing verdict → one no-verdict ERROR', () => {
    const issues = evaluateTeachingVerdict(DUMMY_INPUT, makeResponse(null));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toContain('no-verdict');
  });

  it('judge error → one judge-unavailable ERROR', () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({ error: 'timeout after 30s' }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toContain('judge-unavailable');
  });

  it('unparseable liveResponse → no-verdict ERROR', () => {
    // Non-JSON string: parseFirstJsonObject returns null → verdict undefined
    const issues = evaluateTeachingVerdict(DUMMY_INPUT, 'not json at all');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toContain('no-verdict');
  });
});

// ---------------------------------------------------------------------------
// Combined case
// ---------------------------------------------------------------------------

describe('evaluateTeachingVerdict — combined cases', () => {
  it("transfer:'no' + told_not_taught:true → one error + one warning", () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({
        ...OK_VERDICT,
        transfer: 'no',
        told_not_taught: true,
      }),
    );
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toContain('.transfer-failed');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.code).toContain('told-not-taught');
  });

  it("transfer:'no' + all soft dimensions bad → one error + three warnings", () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({
        transfer: 'no',
        scaffolding_appropriate: false,
        looped_or_incoherent: true,
        told_not_taught: true,
        evidence: 'multiple failures',
      }),
    );
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(1);
    expect(issues.filter((i) => i.severity === 'warning')).toHaveLength(3);
  });

  it("transfer:'yes' + all soft dimensions bad → zero errors + three warnings", () => {
    const issues = evaluateTeachingVerdict(
      DUMMY_INPUT,
      makeResponse({
        transfer: 'yes',
        scaffolding_appropriate: false,
        looped_or_incoherent: true,
        told_not_taught: true,
      }),
    );
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(issues.filter((i) => i.severity === 'warning')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Internal provider failures propagate as structured execution failures
// (fail closed, WI-2461 review round 2)
//
// Pre-fix, mentor/learner/transfer-probe exceptions were caught into
// transcript strings, runLive returned normally (runner counted liveCallsOk),
// and a permissive judge could pass the run. runTeachingSession is the
// deps-injected core of runLive (no jest.mock — dependency injection, same
// pattern as runner/gates.ts GateDeps): every provider failure must surface in
// the result's executionFailures, and evaluateTeachingVerdict must turn each
// into an error-class issue.
// ---------------------------------------------------------------------------

const HAPPY_DEPS: TeachingSessionLiveDeps = {
  mentorTurn: async () => JSON.stringify({ reply: 'Let me explain phases.' }),
  learnerTurn: async () => 'Oh, so it is about sunlight angles?',
  transferProbe: async () => 'The lit half faces the Sun; we see part of it.',
  judge: async () => ({ ...OK_VERDICT }),
};

interface ParsedRunResult {
  executionFailures?: string[];
  verdict?: Record<string, unknown>;
}

async function runWith(
  overrides: Partial<TeachingSessionLiveDeps>,
): Promise<{ raw: string; parsed: ParsedRunResult }> {
  const raw = await runTeachingSession(DUMMY_INPUT, {
    ...HAPPY_DEPS,
    ...overrides,
  });
  return { raw, parsed: JSON.parse(raw) as ParsedRunResult };
}

describe('runTeachingSession — provider failures fail closed', () => {
  it('happy path: no executionFailures, verdict passed through, zero issues', async () => {
    const { raw, parsed } = await runWith({});
    expect(parsed.executionFailures ?? []).toHaveLength(0);
    expect(parsed.verdict).toMatchObject({ transfer: 'yes' });
    expect(evaluateTeachingVerdict(DUMMY_INPUT, raw)).toHaveLength(0);
  });

  it('mentor call failure → executionFailures entry + error-class issue despite a passing verdict', async () => {
    const { raw, parsed } = await runWith({
      mentorTurn: async () => {
        throw new Error('mentor provider 502');
      },
    });
    expect(parsed.executionFailures!.length).toBeGreaterThan(0);
    expect(parsed.executionFailures!.join(' ')).toContain('mentor');
    const issues = evaluateTeachingVerdict(DUMMY_INPUT, raw);
    const errors = issues.filter((i) => i.severity === 'error');
    // The permissive judge said transfer:'yes' — the run must STILL fail.
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((i) => i.code.includes('provider-call-failed'))).toBe(
      true,
    );
  });

  it('learner-simulator failure → executionFailures entry + error-class issue', async () => {
    const { raw, parsed } = await runWith({
      learnerTurn: async () => {
        throw new Error('learner provider timeout');
      },
    });
    expect(parsed.executionFailures!.join(' ')).toContain('learner');
    const issues = evaluateTeachingVerdict(DUMMY_INPUT, raw);
    expect(
      issues.some(
        (i) =>
          i.severity === 'error' && i.code.includes('provider-call-failed'),
      ),
    ).toBe(true);
  });

  it('transfer-probe failure → executionFailures entry + error-class issue', async () => {
    const { raw, parsed } = await runWith({
      transferProbe: async () => {
        throw new Error('probe provider 429');
      },
    });
    expect(parsed.executionFailures!.join(' ')).toContain('transfer probe');
    const issues = evaluateTeachingVerdict(DUMMY_INPUT, raw);
    expect(
      issues.some(
        (i) =>
          i.severity === 'error' && i.code.includes('provider-call-failed'),
      ),
    ).toBe(true);
  });

  it('judge failure → judge-unavailable error-class issue (via the {error} verdict)', async () => {
    const { raw } = await runWith({
      judge: async () => ({ error: 'judge provider down' }),
    });
    const issues = evaluateTeachingVerdict(DUMMY_INPUT, raw);
    expect(
      issues.some(
        (i) => i.severity === 'error' && i.code.includes('judge-unavailable'),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scenarioId appears in issue code
// ---------------------------------------------------------------------------

describe('evaluateTeachingVerdict — issue code includes scenarioId', () => {
  it("code is prefixed with the scenarioId for transfer:'no'", () => {
    const customInput: TeachingSessionInput = {
      ...DUMMY_INPUT,
      scenarioId: 'TS02-fractions-of-fractions',
    };
    const issues = evaluateTeachingVerdict(
      customInput,
      JSON.stringify({
        verdict: {
          transfer: 'no',
          scaffolding_appropriate: true,
          looped_or_incoherent: false,
          told_not_taught: false,
        },
      }),
    );
    expect(issues[0]!.code).toMatch(/^TS02-fractions-of-fractions\./);
  });
});

// ---------------------------------------------------------------------------
// assertScenarioProfilesResolve — startup guard
// ---------------------------------------------------------------------------

describe('assertScenarioProfilesResolve', () => {
  it('passes with the real PROFILES list (all 5 scenario profileIds present)', () => {
    // Should not throw — all scenarios pin to real profile IDs.
    expect(() => assertScenarioProfilesResolve(PROFILES)).not.toThrow();
  });

  it('throws when a profile list is missing a scenario profileId', () => {
    // Build a profiles list that omits '15yo-football-gaming' (TS02's profileId)
    const incompleteProfiles: EvalProfile[] = PROFILES.filter(
      (p) => p.id !== '15yo-football-gaming',
    );
    expect(() => assertScenarioProfilesResolve(incompleteProfiles)).toThrow(
      /15yo-football-gaming/,
    );
  });

  it('throws with the offending scenario id and profileId in the error message', () => {
    // Empty profile list — every scenario's profileId is missing
    try {
      assertScenarioProfilesResolve([]);
      fail('Expected assertScenarioProfilesResolve to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      // The first scenario that fails is TS01 with profileId '12yo-dinosaurs'
      expect(msg).toContain('TS01-moon-phases');
      expect(msg).toContain('12yo-dinosaurs');
    }
  });

  it('all 5 scenarios are present in TEACHING_SCENARIOS', () => {
    const ids = TEACHING_SCENARIOS.map((s) => s.id);
    expect(ids).toContain('TS01-moon-phases');
    expect(ids).toContain('TS02-fractions-of-fractions');
    expect(ids).toContain('TS03-past-tense-trigger');
    expect(ids).toContain('TS04-supply-demand');
    expect(ids).toContain('TS05-water-cycle');
    expect(ids).toHaveLength(5);
  });

  it('all 5 scenarios have distinct profileIds covering the expected profiles', () => {
    const profileIds = TEACHING_SCENARIOS.map((s) => s.profileId);
    expect(profileIds).toContain('12yo-dinosaurs');
    expect(profileIds).toContain('15yo-football-gaming');
    expect(profileIds).toContain('13yo-spanish-beginner');
    expect(profileIds).toContain('17yo-french-advanced');
    expect(profileIds).toContain('11yo-czech-animals');
  });

  it('TS02 (resist scenario) encodes resistance in startingGap', () => {
    const ts02 = TEACHING_SCENARIOS.find(
      (s) => s.id === 'TS02-fractions-of-fractions',
    );
    expect(ts02).toBeDefined();
    // The startingGap must mention resistance / push back behavior
    const gap = ts02!.startingGap.toLowerCase();
    expect(gap).toMatch(/resist|push back|stubborn|don.t buy/);
  });

  it('TS05 (11yo-czech-animals) has conversationLanguage cs via the profile', () => {
    const ts05profile = PROFILES.find((p) => p.id === '11yo-czech-animals');
    expect(ts05profile?.conversationLanguage).toBe('cs');
  });
});
