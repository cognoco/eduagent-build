// Targeted regression tests for the homework-probe quality heuristics
// [WI-556]. Two false positives surfaced during the baseline-seed triage run
// (2026-06-09): HW03 flagged the *desired* acknowledge-then-contradict move,
// and HW01 missed a problem-specific Socratic opener. Each fix keeps a
// negative case proving the heuristic still bites on the behavior it exists
// to catch.

import { probesFlow } from './probes';
import { getProfile } from '../fixtures/profiles';
import type { QualityIssue } from '../runner/types';

function probeInput(profileId: string, probeId: string) {
  const profile = getProfile(profileId);
  if (!profile) throw new Error(`fixture profile missing: ${profileId}`);
  const scenario = probesFlow
    .enumerateScenarios?.(profile)
    ?.find((s) => s.scenarioId === probeId);
  if (!scenario) throw new Error(`probe missing: ${probeId} for ${profileId}`);
  return { profile, input: scenario.input };
}

async function evaluate(
  profileId: string,
  probeId: string,
  envelope: Record<string, unknown>,
): Promise<QualityIssue[]> {
  const { profile, input } = probeInput(profileId, probeId);
  return await probesFlow.evaluateQuality!({
    input,
    messages: { system: '' },
    liveResponse: JSON.stringify(envelope),
    profile,
    scenarioId: probeId,
  });
}

describe('probes quality heuristics — HW03 (conflicting learner answer)', () => {
  it('accepts acknowledge-then-contradict ("You\'re right that … However …")', async () => {
    // Verbatim shape of the live reply that false-positived on 2026-06-09:
    // a valid sub-fact acknowledgement followed by the contradiction is the
    // DESIRED tutoring move, not validation of the conflicting answer.
    const issues = await evaluate('13yo-spanish-beginner', 'HW03', {
      reply:
        'You\'re right that "cansado" means tired! However, the worksheet note says temporary states use "estar". Which verb should you use?',
      private_sources: { relied_on: ['homework_problem'], insufficient: false },
    });
    expect(issues.filter((i) => i.code === 'HW03.conflict')).toEqual([]);
  });

  it('still flags validation of the conflicting answer with no contrast', async () => {
    const issues = await evaluate('13yo-spanish-beginner', 'HW03', {
      reply: 'Yes, that is correct! "Soy cansado" is the right way to say it.',
      private_sources: { relied_on: ['homework_problem'], insufficient: false },
    });
    expect(issues.some((i) => i.code === 'HW03.conflict')).toBe(true);
  });

  it('still flags direct validation even when a contrast word follows', async () => {
    // Codex review on PR #820: a contrast-anywhere exemption would let
    // "That's correct! But …" pass. Only the sub-fact acknowledgment form
    // ("right that/about …") is exempt; direct validation stays flagged.
    const issues = await evaluate('13yo-spanish-beginner', 'HW03', {
      reply:
        'That is correct! But let\'s also practice a few more examples with "ser".',
      private_sources: { relied_on: ['homework_problem'], insufficient: false },
    });
    expect(issues.some((i) => i.code === 'HW03.conflict')).toBe(true);
  });
});

describe('probes quality heuristics — HW01 (solvable problem, first step)', () => {
  const fullSources = {
    relied_on: ['homework_problem', 'deterministic_reasoning'],
    insufficient: false,
  };

  it('accepts a problem-specific Socratic first-move reply', async () => {
    // Verbatim shape of the live reply that false-positived on 2026-06-09:
    // anchors on THIS equation and prompts the first move toward isolating x.
    const issues = await evaluate('15yo-football-gaming', 'HW01', {
      reply:
        "To solve for 'x' in an equation like `2x + 5 = 17`, our goal is to get 'x' by itself. What would be your first move?",
      private_sources: fullSources,
    });
    expect(issues.filter((i) => i.code === 'HW01.answer')).toEqual([]);
  });

  it('still flags a generic algebra lecture that never engages the problem', async () => {
    const issues = await evaluate('15yo-football-gaming', 'HW01', {
      reply:
        'Algebra is about balancing equations. Variables stand for unknown numbers, and equations stay equal when you do the same thing to each side.',
      private_sources: fullSources,
    });
    expect(issues.some((i) => i.code === 'HW01.answer')).toBe(true);
  });
});
