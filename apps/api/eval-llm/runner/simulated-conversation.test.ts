import {
  runSimulatedRound,
  assertTwoModelGuard,
  modelFamily,
  deterministicUuid,
  type SimulatedRoundOverrides,
} from './simulated-conversation';
import { MAX_CHALLENGE_QUESTIONS } from '../../src/services/challenge-round/caps';
import { CHALLENGE_SIM_SCENARIOS } from '../fixtures/challenge-personas';
import { PROFILES } from '../fixtures/profiles';

// Real transitionChallengeState + decideMasteryAndReview + parseEnvelope run.
// Only the two LLM boundaries are injected via overrides (no internal jest.mock).

const scenario = CHALLENGE_SIM_SCENARIOS.find(
  (s) => s.id === 'CRS02-fractions-misconception',
)!;
const profile = PROFILES.find((p) => p.id === scenario.profileId)!;

const LEARNER = 'anthropic/claude-3.5-sonnet';
const MENTOR = 'gpt-oss-120b';

function scriptedEnvelope(reply: string, result: string | null): string {
  const signals =
    result === null
      ? { challenge_round_evaluation: [] }
      : {
          challenge_round_evaluation: [
            {
              concept: 'why flip-and-multiply works',
              result,
              evidence: 'learner gave confident wrong reasoning',
              answerEventId: deterministicUuid('crm-answer'),
              learnerQuote: 'because dividing always makes it smaller',
            },
          ],
        };
  return JSON.stringify({ reply, signals });
}

function misconceptionOverrides(): {
  overrides: SimulatedRoundOverrides;
  mentorCalls: () => number;
} {
  let mentorCalls = 0;
  const overrides: SimulatedRoundOverrides = {
    learnerTurn: async () =>
      'You flip it because dividing always makes it smaller.',
    mentorTurn: async () => {
      mentorCalls += 1;
      return scriptedEnvelope(
        `Interesting — can you say more about that? (q${mentorCalls})`,
        'misconception',
      );
    },
  };
  return { overrides, mentorCalls: () => mentorCalls };
}

describe('runSimulatedRound — conversation loop', () => {
  it('runs exactly MAX_CHALLENGE_QUESTIONS answered turns then stops (start-seeded totalQuestions drives termination)', async () => {
    const { overrides, mentorCalls } = misconceptionOverrides();
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, mentorModel: MENTOR },
      overrides,
    );
    expect(mentorCalls()).toBe(MAX_CHALLENGE_QUESTIONS);
    // One seed assistant question + per turn (user answer + assistant reply).
    const learnerTurns = result.transcript.filter((t) => t.role === 'user');
    expect(learnerTurns).toHaveLength(MAX_CHALLENGE_QUESTIONS);
  });

  it('accumulates evaluations across all turns', async () => {
    const { overrides } = misconceptionOverrides();
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, mentorModel: MENTOR },
      overrides,
    );
    expect(result.evaluations).toHaveLength(MAX_CHALLENGE_QUESTIONS);
  });

  it('gate outcome equals the scenario expectedOutcome (misconception → partial)', async () => {
    const { overrides } = misconceptionOverrides();
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, mentorModel: MENTOR },
      overrides,
    );
    expect(scenario.expectedOutcome).toBe('partial');
    expect(result.decision.outcome).toBe('partial');
    expect(result.decision.markMasteryVerified).toBe(false);
    expect(result.signalEmitted).toBe(true);
  });

  it('verified scenario (all solid) → verified + mastery marked', async () => {
    const verifiedScenario = CHALLENGE_SIM_SCENARIOS.find(
      (s) => s.id === 'CRS01-fossilization-verified',
    )!;
    const verifiedProfile = PROFILES.find(
      (p) => p.id === verifiedScenario.profileId,
    )!;
    const overrides: SimulatedRoundOverrides = {
      learnerTurn: async () =>
        'Because rapid burial protects the bones from decay.',
      mentorTurn: async () =>
        scriptedEnvelope('Great — and then what?', 'solid'),
    };
    const result = await runSimulatedRound(
      {
        scenario: verifiedScenario,
        profile: verifiedProfile,
        learnerModel: LEARNER,
        mentorModel: MENTOR,
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
      mentorTurn: async () =>
        scriptedEnvelope("That's okay — let's revisit it.", 'missing'),
    };
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, mentorModel: MENTOR },
      overrides,
    );
    expect(result.decision.outcome).toBe('reteach');
    expect(result.decision.markMasteryVerified).toBe(false);
    expect(result.signalEmitted).toBe(true);
  });

  it('throws when learner and mentor are the same model', async () => {
    await expect(
      runSimulatedRound({
        scenario,
        profile,
        learnerModel: MENTOR,
        mentorModel: MENTOR,
      }),
    ).rejects.toThrow(/same model/i);
  });

  it('throws when learner and mentor share a base family (heuristic)', async () => {
    await expect(
      runSimulatedRound({
        scenario,
        profile,
        learnerModel: 'openrouter/gpt-oss-120b',
        mentorModel: 'gpt-oss-120b',
      }),
    ).rejects.toThrow(/base family/i);
  });

  it('allowSameFamily overrides the family guard', async () => {
    const { overrides } = misconceptionOverrides();
    const result = await runSimulatedRound(
      {
        scenario,
        profile,
        learnerModel: 'openrouter/gpt-oss-120b',
        mentorModel: 'gpt-oss-120b',
        allowSameFamily: true,
      },
      overrides,
    );
    expect(result.decision.outcome).toBe('partial');
  });

  it('sets signalEmitted=false when a mentor turn fails to parse', async () => {
    const overrides: SimulatedRoundOverrides = {
      learnerTurn: async () => 'some answer',
      mentorTurn: async () => 'not json at all, just prose with no envelope',
    };
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, mentorModel: MENTOR },
      overrides,
    );
    expect(result.signalEmitted).toBe(false);
    expect(result.evaluations).toHaveLength(0);
    expect(result.decision.outcome).toBe('invalid');
  });

  it('sets signalEmitted=false when a mentor turn emits zero eval items (gpt-oss drop)', async () => {
    const overrides: SimulatedRoundOverrides = {
      learnerTurn: async () => 'some answer',
      mentorTurn: async () => scriptedEnvelope('Tell me more.', null),
    };
    const result = await runSimulatedRound(
      { scenario, profile, learnerModel: LEARNER, mentorModel: MENTOR },
      overrides,
    );
    expect(result.signalEmitted).toBe(false);
    expect(result.evaluations).toHaveLength(0);
  });
});

describe('two-model guard helpers', () => {
  it('modelFamily strips provider prefix and size/date suffixes', () => {
    expect(modelFamily('openai/gpt-oss-120b')).toBe('gpt-oss');
    expect(modelFamily('gpt-oss-120b')).toBe('gpt-oss');
    expect(modelFamily('anthropic/claude-3.5-sonnet')).toBe('claude-3.5');
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
});
