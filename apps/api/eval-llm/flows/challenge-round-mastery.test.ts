import {
  challengeRoundMasteryFlow,
  evaluateChallengeMastery,
  type ChallengeMasteryInput,
} from './challenge-round-mastery';
import { getProfile } from '../fixtures/profiles';

const ANSWER_EVENT_ID = '11111111-1111-4111-8111-111111111111';

function inputFor(scenarioId: string): ChallengeMasteryInput {
  // Pull the real enumerated scenario so the test exercises the same context
  // the harness builds (profile resolution, learnerAnswer, expected).
  for (const profileId of [
    '12yo-dinosaurs',
    '15yo-football-gaming',
    '13yo-spanish-beginner',
  ]) {
    const profile = getProfile(profileId);
    if (!profile) continue;
    const scenario = challengeRoundMasteryFlow
      .enumerateScenarios?.(profile)
      ?.find((s) => s.scenarioId === scenarioId);
    if (scenario) return scenario.input;
  }
  throw new Error(`scenario missing: ${scenarioId}`);
}

describe('challenge-round-mastery — evaluateChallengeMastery', () => {
  it('[WI-1789] participates in the aggregate envelope baseline', () => {
    expect(challengeRoundMasteryFlow.emitsEnvelope).toBe(true);
  });

  it('accepts a well-formed solid evaluation for a correct answer', () => {
    const input = inputFor('CRM01-solid');
    const issues = evaluateChallengeMastery(
      input,
      JSON.stringify({
        reply: "Nice — that's the idea. Let's try one more.",
        signals: {
          challenge_round_evaluation: [
            {
              concept: 'rapid burial preserves shape',
              result: 'solid',
              evidence: 'explained scavengers/rot are outrun',
              answerEventId: ANSWER_EVENT_ID,
              learnerQuote:
                'buried fast, scavengers and rotting cannot destroy the bones',
            },
          ],
        },
      }),
    );
    expect(issues).toEqual([]);
  });

  it('ERRORS when a confident-but-wrong answer is scored solid (mastery gate defeated)', () => {
    const input = inputFor('CRM02-misconception');
    const issues = evaluateChallengeMastery(
      input,
      JSON.stringify({
        reply: "Close — let's tighten this together. What does division ask?",
        signals: {
          challenge_round_evaluation: [
            {
              concept: 'why flip and multiply works',
              result: 'solid', // WRONG — this reasoning is a misconception
              evidence: 'learner reasoning',
              answerEventId: ANSWER_EVENT_ID,
              learnerQuote: 'dividing always makes the number smaller',
            },
          ],
        },
      }),
    );
    expect(
      issues.some((i) => i.code === 'CRM02-misconception.over-credited'),
    ).toBe(true);
  });

  it('does NOT error when a misconception is correctly scored misconception', () => {
    const input = inputFor('CRM02-misconception');
    const issues = evaluateChallengeMastery(
      input,
      JSON.stringify({
        reply: "Close — let's tighten this. What does dividing actually ask?",
        signals: {
          challenge_round_evaluation: [
            {
              concept: 'why flip and multiply works',
              result: 'misconception',
              evidence: 'thinks division always shrinks',
              answerEventId: ANSWER_EVENT_ID,
              learnerQuote: 'dividing always makes the number smaller',
              correction: 'dividing by a number < 1 makes it larger',
            },
          ],
        },
      }),
    );
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('errors when no evaluation evidence is emitted on the answer turn', () => {
    const input = inputFor('CRM01-solid');
    const issues = evaluateChallengeMastery(
      input,
      JSON.stringify({ reply: 'Good thinking! Want another?', signals: {} }),
    );
    expect(issues.some((i) => i.code === 'CRM01-solid.no-evaluation')).toBe(
      true,
    );
  });

  it('errors on a mismatched answerEventId', () => {
    const input = inputFor('CRM01-solid');
    const issues = evaluateChallengeMastery(
      input,
      JSON.stringify({
        reply: 'Good. One more?',
        signals: {
          challenge_round_evaluation: [
            {
              concept: 'rapid burial',
              result: 'solid',
              evidence: 'x',
              answerEventId: '00000000-0000-4000-8000-000000000000',
              learnerQuote: 'buried fast',
            },
          ],
        },
      }),
    );
    expect(issues.some((i) => i.code === 'CRM01-solid.answer-event-id')).toBe(
      true,
    );
  });

  it('errors on banned failure-framing in the reply', () => {
    const input = inputFor('CRM01-solid');
    const issues = evaluateChallengeMastery(
      input,
      JSON.stringify({
        reply: 'That answer is wrong, you struggle with this.',
        signals: {
          challenge_round_evaluation: [
            {
              concept: 'rapid burial',
              result: 'solid',
              evidence: 'x',
              answerEventId: ANSWER_EVENT_ID,
              learnerQuote: 'buried fast',
            },
          ],
        },
      }),
    );
    expect(issues.some((i) => i.code === 'CRM01-solid.banned-framing')).toBe(
      true,
    );
  });
});
