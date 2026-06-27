// ---------------------------------------------------------------------------
// Challenge Round grader prompt builder — unit tests (T4, 2026-06-26 plan).
//
// The prompt builder is pure (no external calls) — no mocking needed.
// ---------------------------------------------------------------------------

import {
  buildChallengeRoundGraderPrompt,
  type GraderPromptInput,
} from './grader-prompt';

const baseInput: GraderPromptInput = {
  askedQuestion: 'Why does increasing temperature speed up most reactions?',
  learnerAnswer:
    'Because the particles move faster and collide more often with enough energy.',
  ageBracket: 'adolescent',
  conversationLanguage: 'en',
};

function allContent(input: GraderPromptInput): string {
  return buildChallengeRoundGraderPrompt(input)
    .map((m) => m.content)
    .join('\n');
}

describe('buildChallengeRoundGraderPrompt', () => {
  it('returns a [system, user] message pair', () => {
    const msgs = buildChallengeRoundGraderPrompt(baseInput);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.role).toBe('user');
  });

  it('includes the asked question in the messages', () => {
    expect(allContent(baseInput)).toContain(baseInput.askedQuestion);
  });

  it('includes the learner answer in the messages', () => {
    expect(allContent(baseInput)).toContain(baseInput.learnerAnswer);
  });

  it('mentions all four result labels', () => {
    const content = allContent(baseInput);
    for (const label of ['solid', 'partial', 'missing', 'misconception']) {
      expect(content).toContain(label);
    }
  });

  it('instructs the model to return a single JSON object with no surrounding prose', () => {
    const systemContent = buildChallengeRoundGraderPrompt(baseInput)[0]!
      .content as string;
    expect(systemContent.toLowerCase()).toContain('json');
    // Some form of "only" directive
    expect(systemContent.toLowerCase()).toMatch(/only/);
    // Explicitly forbid prose/text around the JSON
    expect(systemContent.toLowerCase()).toMatch(
      /no.*prose|nothing.*before|nothing.*after/,
    );
  });

  it('includes a JSON shape example with items array', () => {
    const systemContent = buildChallengeRoundGraderPrompt(baseInput)[0]!
      .content as string;
    expect(systemContent).toContain('"items"');
    expect(systemContent).toContain('"concept"');
    expect(systemContent).toContain('"result"');
    expect(systemContent).toContain('"evidence"');
    expect(systemContent).toContain('"learnerQuote"');
  });

  it('includes min-1 items requirement', () => {
    const systemContent = buildChallengeRoundGraderPrompt(baseInput)[0]!
      .content as string;
    expect(systemContent.toLowerCase()).toContain('at least one');
  });

  it('includes conversationLanguage hint in user prompt when provided', () => {
    const userContent = buildChallengeRoundGraderPrompt(baseInput)[1]!
      .content as string;
    expect(userContent).toContain('en');
  });

  it('omits language hint gracefully when conversationLanguage is not provided', () => {
    const input: GraderPromptInput = {
      ...baseInput,
      conversationLanguage: undefined,
    };
    const msgs = buildChallengeRoundGraderPrompt(input);
    expect(msgs).toHaveLength(2);
    const userContent = msgs[1]!.content as string;
    expect(userContent).toContain('unspecified');
  });

  it('includes ageBracket in the user prompt', () => {
    const userContent = buildChallengeRoundGraderPrompt(baseInput)[1]!
      .content as string;
    expect(userContent).toContain('adolescent');
  });
});
