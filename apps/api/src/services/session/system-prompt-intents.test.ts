import type { SystemPromptIntent } from '@eduagent/schemas';

import { resolveSystemPromptIntent } from './system-prompt-intents';

describe('resolveSystemPromptIntent (WI-373 — server-owned prompts)', () => {
  it('resolves silence_nudge to the canonical nudge string', () => {
    expect(resolveSystemPromptIntent({ kind: 'silence_nudge' })).toBe(
      "Still working on it? Take your time - I'm here when you're ready.",
    );
  });

  it('resolves each quick_chip to its canonical steer', () => {
    const cases: Array<[SystemPromptIntent, string]> = [
      [
        { kind: 'quick_chip', chip: 'hint' },
        'The learner tapped the hint chip. Give one short hint, not a full solution.',
      ],
      [
        { kind: 'quick_chip', chip: 'example' },
        'The learner wants a fresh worked example. Use one similar example and keep it concise.',
      ],
      [
        { kind: 'quick_chip', chip: 'know_this' },
        'The learner says they already know this. Briefly verify, then move forward or increase the challenge slightly.',
      ],
      [
        { kind: 'quick_chip', chip: 'explain_differently' },
        'The learner wants a different explanation. Re-explain with a new angle and one concrete example.',
      ],
      [
        { kind: 'quick_chip', chip: 'too_easy' },
        'The learner says this is too easy. Raise the challenge a little and ask for more independent thinking.',
      ],
      [
        { kind: 'quick_chip', chip: 'too_hard' },
        'The learner says this is too hard. Lower the difficulty, add more structure, and keep the next step small.',
      ],
    ];
    for (const [intent, expected] of cases) {
      expect(resolveSystemPromptIntent(intent)).toBe(expected);
    }
  });

  it('resolves each message_feedback action (eventId does not affect the text)', () => {
    expect(
      resolveSystemPromptIntent({
        kind: 'message_feedback',
        action: 'helpful',
        eventId: 'evt_1',
      }),
    ).toBe(
      'The learner marked the previous answer as helpful. Keep the same pace and level of guidance.',
    );
    expect(
      resolveSystemPromptIntent({
        kind: 'message_feedback',
        action: 'not_helpful',
        eventId: 'evt_1',
      }),
    ).toBe(
      'The learner marked the previous answer as not helpful. Re-explain more clearly with one new example.',
    );
    expect(
      resolveSystemPromptIntent({
        kind: 'message_feedback',
        action: 'incorrect',
        eventId: 'evt_1',
      }),
    ).toBe(
      'The learner believes the previous answer was incorrect. Correct it clearly, explain what changed, and continue from there.',
    );
  });
});
