import {
  runSimulatedRound,
  assertTwoModelGuard,
  modelFamily,
  vendorRoot,
  deterministicUuid,
  parseGraderResponse,
  type SimulatedRoundOverrides,
} from './simulated-conversation';
import { MAX_CHALLENGE_QUESTIONS } from '../../src/services/challenge-round/caps';
import { CHALLENGE_SIM_SCENARIOS } from '../fixtures/challenge-personas';
import { PROFILES } from '../fixtures/profiles';
import type { ChallengeRoundEvaluationItem } from '@eduagent/schemas';

// Real transitionChallengeState + decideMasteryAndReview run in-memory. Only the
// three LLM boundaries (learner / tutor / GRADER) are injected via overrides —
// no internal jest.mock (GC1-clean). The MEASURED component is the grader: in
// the grader-ON production path the tutor emits NO inline eval, so the decision
// is driven by the grader's items, NOT the mentor envelope. Tests assert that
// real source.

const scenario = CHALLENGE_SIM_SCENARIOS.find(
  (s) => s.id === 'CRS02-fractions-misconception',
)!;
const profile = PROFILES.find((p) => p.id === scenario.profileId)!;

// Learner is claude-family. The GRADER candidate must be a DIFFERENT family or
// the two-model guard (learner-vs-grader) throws. It is injected explicitly so
// the outcome tests never depend on the live-resolved production judge slug
// (which is claude-family for these minor profiles and would collide).
const LEARNER = 'anthropic/claude-3.5-sonnet';
const GRADER = 'gpt-oss-120b';

/** One grader verdict item with the given result (or `[]` to model a drop). */
function gradedItems(
  result: ChallengeRoundEvaluationItem['result'] | null,
): ChallengeRoundEvaluationItem[] {
  if (result === null) return [];
  return [
    {
      concept: 'why flip-and-multiply works',
      result,
      evidence: 'learner gave confident wrong reasoning',
      answerEventId: deterministicUuid('crm-answer'),
      learnerQuote: 'because dividing always makes it smaller',
    },
  ];
}

function gradedOverrides(
  result: ChallengeRoundEvaluationItem['result'] | null,
): {
  overrides: SimulatedRoundOverrides;
  graderCalls: () => number;
} {
  let graderCalls = 0;
  const overrides: SimulatedRoundOverrides = {
    learnerTurn: async () =>
      'You flip it because dividing always makes it smaller.',
    tutorTurn: async () => 'Interesting — can you say more about that?',
    graderTurn: async () => {
      graderCalls += 1;
      return gradedItems(result);
    },
  };
  return { overrides, graderCalls: () => graderCalls };
}

describe('runSimulatedRound — conversation loop', () => {
  it('runs exactly MAX_CHALLENGE_QUESTIONS graded turns then stops (start-seeded totalQuestions drives termination)', async () => {
    const { overrides, graderCalls } = gradedOverrides('misconception');
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, graderModel: GRADER },
      overrides,
    );
    expect(graderCalls()).toBe(MAX_CHALLENGE_QUESTIONS);
    // One seed assistant question + per turn a learner answer.
    const learnerTurns = result.transcript.filter((t) => t.role === 'user');
    expect(learnerTurns).toHaveLength(MAX_CHALLENGE_QUESTIONS);
  });

  it('accumulates evaluations across all turns', async () => {
    const { overrides } = gradedOverrides('misconception');
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, graderModel: GRADER },
      overrides,
    );
    expect(result.evaluations).toHaveLength(MAX_CHALLENGE_QUESTIONS);
  });

  it('gate outcome equals the scenario expectedOutcome (misconception → partial)', async () => {
    const { overrides } = gradedOverrides('misconception');
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, graderModel: GRADER },
      overrides,
    );
    expect(scenario.expectedOutcome).toBe('partial');
    expect(result.decision.outcome).toBe('partial');
    expect(result.decision.markMasteryVerified).toBe(false);
    expect(result.signalEmitted).toBe(true);
  });

  it('verified scenario (grader: all solid) → verified + mastery marked', async () => {
    const verifiedScenario = CHALLENGE_SIM_SCENARIOS.find(
      (s) => s.id === 'CRS01-fossilization-verified',
    )!;
    const verifiedProfile = PROFILES.find(
      (p) => p.id === verifiedScenario.profileId,
    )!;
    const overrides: SimulatedRoundOverrides = {
      learnerTurn: async () =>
        'Because rapid burial protects the bones from decay.',
      tutorTurn: async () => 'Great — and then what?',
      graderTurn: async () => gradedItems('solid'),
    };
    const result = await runSimulatedRound(
      {
        scenario: verifiedScenario,
        profile: verifiedProfile,
        learnerModel: LEARNER,
        graderModel: GRADER,
      },
      overrides,
    );
    expect(result.decision.outcome).toBe('verified');
    expect(result.decision.markMasteryVerified).toBe(true);
    expect(result.signalEmitted).toBe(true);
  });

  it('all-missing answers → reteach (no mastery, signal still emitted)', async () => {
    const overrides: SimulatedRoundOverrides = {
      learnerTurn: async () => "I don't really know, sorry.",
      tutorTurn: async () => "That's okay — let's revisit it.",
      graderTurn: async () => gradedItems('missing'),
    };
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, graderModel: GRADER },
      overrides,
    );
    expect(result.decision.outcome).toBe('reteach');
    expect(result.decision.markMasteryVerified).toBe(false);
    expect(result.signalEmitted).toBe(true);
  });

  it('throws when learner and grader are the same model', async () => {
    await expect(
      runSimulatedRound({
        scenario,
        profile,
        learnerModel: GRADER,
        graderModel: GRADER,
      }),
    ).rejects.toThrow(/same model/i);
  });

  it('throws when learner and grader share a base family (heuristic)', async () => {
    await expect(
      runSimulatedRound({
        scenario,
        profile,
        learnerModel: 'openrouter/gpt-oss-120b',
        graderModel: 'gpt-oss-120b',
      }),
    ).rejects.toThrow(/base family/i);
  });

  it('allows a learner sharing the TUTOR family — the guard checks the grader, not the tutor', async () => {
    // Learner is gpt-oss (the tutor's production family); the grader is a
    // different family. The guard must NOT fire: the measured correlation axis
    // is learner-vs-grader, and the tutor is never the grader candidate.
    const { overrides } = gradedOverrides('misconception');
    const result = await runSimulatedRound(
      {
        scenario,
        profile,
        learnerModel: 'openai/gpt-oss-120b',
        graderModel: 'anthropic/claude-3.5-sonnet',
      },
      overrides,
    );
    expect(result.decision.outcome).toBe('partial');
  });

  it('allowSameFamily overrides the family guard', async () => {
    const { overrides } = gradedOverrides('misconception');
    const result = await runSimulatedRound(
      {
        scenario,
        profile,
        learnerModel: 'openrouter/gpt-oss-120b',
        graderModel: 'gpt-oss-120b',
        allowSameFamily: true,
      },
      overrides,
    );
    expect(result.decision.outcome).toBe('partial');
  });

  it('sets signalEmitted=false when the grader returns zero items (gpt-oss drop)', async () => {
    const { overrides } = gradedOverrides(null);
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, graderModel: GRADER },
      overrides,
    );
    expect(result.signalEmitted).toBe(false);
    expect(result.evaluations).toHaveLength(0);
    expect(result.decision.outcome).toBe('invalid');
  });
});

describe('two-model guard helpers', () => {
  it('modelFamily strips provider prefix and size/date suffixes', () => {
    expect(modelFamily('openai/gpt-oss-120b')).toBe('gpt-oss');
    expect(modelFamily('gpt-oss-120b')).toBe('gpt-oss');
    expect(modelFamily('anthropic/claude-3.5-sonnet')).toBe('claude-3.5');
  });

  it('vendorRoot collapses same-lineage families to a shared root', () => {
    // The family check passes these (distinct families) but the roots match —
    // the soft-warning axis.
    expect(vendorRoot('deepseek-chat')).toBe('deepseek');
    expect(vendorRoot('deepseek-r1')).toBe('deepseek');
    expect(modelFamily('deepseek-chat')).not.toBe(modelFamily('deepseek-r1'));
  });

  it('assertTwoModelGuard throws on identical slugs and same family, passes on distinct', () => {
    expect(() => assertTwoModelGuard('m', 'm', false)).toThrow(/same model/i);
    expect(() =>
      assertTwoModelGuard('openai/gpt-oss-120b', 'gpt-oss-120b', false),
    ).toThrow(/base family/i);
    expect(() =>
      assertTwoModelGuard('anthropic/claude-3.5-sonnet', 'gpt-oss-120b', false),
    ).not.toThrow();
  });

  it('warns (but does not throw) on a same-vendor-root, different-family pair', () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    try {
      expect(() =>
        assertTwoModelGuard('deepseek-chat', 'deepseek-r1', false),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/vendor root/i));
    } finally {
      warn.mockRestore();
    }
  });
});

// deterministicUuid stays exercised — used by callers seeding answerEventIds.
describe('deterministicUuid', () => {
  it('is stable and v4-shaped for a given seed', () => {
    const a = deterministicUuid('crm-answer');
    const b = deterministicUuid('crm-answer');
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('parseGraderResponse — production fail-open contract', () => {
  const EVENT = deterministicUuid('grader-parse');
  const validRaw = JSON.stringify({
    items: [
      {
        concept: 'collision theory',
        result: 'solid',
        evidence: 'links speed to collision frequency',
        learnerQuote: 'particles move faster and collide more',
      },
    ],
  });

  it('parses a valid verdict and injects the server-owned answerEventId', () => {
    const items = parseGraderResponse(validRaw, EVENT);
    expect(items).toHaveLength(1);
    expect(items[0]?.result).toBe('solid');
    // The model never supplies answerEventId — the server owns it.
    expect(items[0]?.answerEventId).toBe(EVENT);
  });

  it('tolerates prose around the JSON object (extractFirstJsonObject)', () => {
    const wrapped = `Here is my verdict:\n${validRaw}\nThanks!`;
    expect(parseGraderResponse(wrapped, EVENT)).toHaveLength(1);
  });

  it('returns [] when the response contains no JSON object (dropped signal)', () => {
    expect(
      parseGraderResponse('I could not grade this answer.', EVENT),
    ).toEqual([]);
  });

  it('returns [] on a malformed JSON object (parse error)', () => {
    expect(parseGraderResponse('{"items": [oops]}', EVENT)).toEqual([]);
  });

  it('returns [] when the shape violates the schema', () => {
    expect(parseGraderResponse('{"verdict": "good"}', EVENT)).toEqual([]);
  });

  it('returns [] on items:[] — the exact gpt-oss .min(1) drop production fails open on', () => {
    expect(parseGraderResponse('{"items": []}', EVENT)).toEqual([]);
  });
});
