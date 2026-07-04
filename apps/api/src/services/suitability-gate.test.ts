// ---------------------------------------------------------------------------
// Suitability-judge enforcing output gate — unit tests [WI-1365]
//
// Two layers:
//   1. The PURE decision (`applySuitabilityGate` / `shouldBlockSuitabilityVerdict`)
//      is tested directly with hand-built verdicts — no LLM, no async.
//   2. The async orchestrator (`runSuitabilityEnforcement`) is tested with the
//      REAL judge running end-to-end; only the LLM boundary (`routeAndCall`) is
//      mocked — the single sanctioned external-boundary mock (AGENTS.md).
//
// The block-and-replace path carries a red-green-revert [BREAK] marker so a
// reverted gate fails loudly (Fix Development Rules — HIGH-safety negative-path).
// ---------------------------------------------------------------------------

jest.mock('./llm', () => {
  // gc1-allow (external boundary): routeAndCall is the one sanctioned
  // external-boundary LLM mock (AGENTS.md); the real router cannot be
  // exercised without a provider registration.
  const actual = jest.requireActual('./llm') as typeof import('./llm');
  return {
    ...actual,
    routeAndCall: jest.fn(),
  };
});

import type { JudgeVerdict } from '@eduagent/schemas';
import type { RouteResult } from './llm';
import { routeAndCall } from './llm';
import {
  applySuitabilityGate,
  runSuitabilityEnforcement,
  shouldBlockSuitabilityVerdict,
  suitabilityRefusalResponse,
  SUITABILITY_GATE_ALLOWLIST,
} from './suitability-gate';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

const routeResult = (response: string): RouteResult => ({
  response,
  provider: 'anthropic',
  model: 'judge-test-model',
  latencyMs: 12,
  stopReason: 'stop',
});

const verdict = (v: JudgeVerdict): JudgeVerdict => v;

const VIOLATION: JudgeVerdict = {
  overall: 'violation',
  flags: ['age_inappropriate'],
  rationale: 'Adult sexual content surfaced to a minor.',
};
const CONCERN: JudgeVerdict = {
  overall: 'concern',
  flags: ['boundary_drift'],
  rationale: 'Reply drifted toward an over-personal tone.',
};

const enforcementInput = {
  enabled: true,
  isMinor: true,
  reply: 'some tutor reply',
  precedingLearnerMessage: 'a learner question',
  ageBracket: 'adolescent' as const,
  tutorVendor: 'cerebras',
  conversationLanguage: 'en' as const,
  sessionId: 'sess-1',
};

beforeEach(() => {
  mockRouteAndCall.mockReset();
});

// ---------------------------------------------------------------------------
// Pure policy — shouldBlockSuitabilityVerdict
// ---------------------------------------------------------------------------

describe('shouldBlockSuitabilityVerdict — violation-only + allowlist', () => {
  it('blocks a violation with a non-allowlisted flag', () => {
    expect(shouldBlockSuitabilityVerdict(VIOLATION)).toBe(true);
  });

  it('does NOT block a concern (observe/telemetry only)', () => {
    expect(shouldBlockSuitabilityVerdict(CONCERN)).toBe(false);
  });

  it('does NOT block an ok verdict', () => {
    expect(
      shouldBlockSuitabilityVerdict({
        overall: 'ok',
        flags: [],
        rationale: 'Clean reply.',
      }),
    ).toBe(false);
  });

  it('does NOT block a violation whose only flags are allowlisted (over_blocking / topic_drift)', () => {
    for (const flag of SUITABILITY_GATE_ALLOWLIST) {
      expect(
        shouldBlockSuitabilityVerdict(
          verdict({
            overall: 'violation',
            flags: [flag],
            rationale: `Flagged ${flag} only.`,
          }),
        ),
      ).toBe(false);
    }
  });

  it('blocks a mixed violation (allowlisted + non-allowlisted) — the real flag wins', () => {
    expect(
      shouldBlockSuitabilityVerdict(
        verdict({
          overall: 'violation',
          flags: ['topic_drift', 'manipulation'],
          rationale: 'Drifted AND manipulative.',
        }),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pure decision — applySuitabilityGate (block-and-replace + fail-open shape)
// ---------------------------------------------------------------------------

describe('applySuitabilityGate', () => {
  it('[BREAK] blocks and replaces a minor reply on a violation verdict', () => {
    const result = applySuitabilityGate('unsafe reply', VIOLATION, {
      isMinor: true,
    });
    // Red-green-revert anchor: deleting the block branch in
    // shouldBlockSuitabilityVerdict / applySuitabilityGate flips these.
    expect(result.blocked).toBe(true);
    expect(result.response).toBe(suitabilityRefusalResponse());
    expect(result.response).not.toBe('unsafe reply');
    expect(result.unavailable).toBe(false);
  });

  it('does NOT block a minor reply on a concern verdict (reply passes)', () => {
    const result = applySuitabilityGate('fine reply', CONCERN, {
      isMinor: true,
    });
    expect(result.blocked).toBe(false);
    expect(result.response).toBe('fine reply');
  });

  it('never judges an adult — reply passes even on a violation verdict', () => {
    const result = applySuitabilityGate('adult reply', VIOLATION, {
      isMinor: false,
    });
    expect(result.blocked).toBe(false);
    expect(result.response).toBe('adult reply');
    expect(result.unavailable).toBe(false);
  });

  it('fails OPEN with unavailable when the verdict is null (judge degraded)', () => {
    const result = applySuitabilityGate('reply', null, { isMinor: true });
    expect(result.blocked).toBe(false);
    expect(result.response).toBe('reply');
    expect(result.unavailable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Async orchestrator — runSuitabilityEnforcement (real judge, mocked LLM)
// ---------------------------------------------------------------------------

describe('runSuitabilityEnforcement', () => {
  it('is INERT when the flag is off — never calls the judge, passes the reply', async () => {
    const result = await runSuitabilityEnforcement({
      ...enforcementInput,
      enabled: false,
    });
    expect(mockRouteAndCall).not.toHaveBeenCalled();
    expect(result).toEqual({
      response: enforcementInput.reply,
      blocked: false,
      unavailable: false,
      blockedFlags: [],
    });
  });

  it('is INERT for an adult — never calls the judge, passes the reply', async () => {
    const result = await runSuitabilityEnforcement({
      ...enforcementInput,
      isMinor: false,
    });
    expect(mockRouteAndCall).not.toHaveBeenCalled();
    expect(result.blocked).toBe(false);
    expect(result.response).toBe(enforcementInput.reply);
  });

  it('[BREAK] blocks a minor reply end-to-end when the judge returns a violation', async () => {
    mockRouteAndCall.mockResolvedValue(routeResult(JSON.stringify(VIOLATION)));
    const result = await runSuitabilityEnforcement(enforcementInput);
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
    expect(result.blocked).toBe(true);
    expect(result.response).toBe(suitabilityRefusalResponse());
  });

  it('does NOT block when the judge returns a concern', async () => {
    mockRouteAndCall.mockResolvedValue(routeResult(JSON.stringify(CONCERN)));
    const result = await runSuitabilityEnforcement(enforcementInput);
    expect(result.blocked).toBe(false);
    expect(result.response).toBe(enforcementInput.reply);
    expect(result.unavailable).toBe(false);
  });

  it('fails OPEN with alarm signal when the judge route throws (unavailable)', async () => {
    mockRouteAndCall.mockRejectedValue(new Error('circuit open'));
    const result = await runSuitabilityEnforcement(enforcementInput);
    expect(result.blocked).toBe(false);
    expect(result.response).toBe(enforcementInput.reply);
    expect(result.unavailable).toBe(true);
  });

  it('fails OPEN with alarm signal when the tutor vendor is unknown', async () => {
    const result = await runSuitabilityEnforcement({
      ...enforcementInput,
      tutorVendor: undefined,
    });
    expect(mockRouteAndCall).not.toHaveBeenCalled();
    expect(result.blocked).toBe(false);
    expect(result.unavailable).toBe(true);
  });
});
