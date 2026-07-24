import {
  challengeOfferPrompt,
  challengeRoundActivePrompt,
  challengeRoundDraftingPrompt,
} from './prompts';

describe('challenge-round prompts', () => {
  it('offer prompt is stable', () =>
    expect(challengeOfferPrompt).toMatchSnapshot());
  it('active prompt declares cap', () => {
    expect(challengeRoundActivePrompt).toMatch(/3 questions/);
    expect(challengeRoundActivePrompt).toMatchSnapshot();
  });
  it('defines repeat and novelty using the approved equivalence contract', () => {
    expect(challengeRoundActivePrompt).toMatch(/prior lesson/i);
    expect(challengeRoundActivePrompt).toMatch(
      /same minimal learning claim with the same cognitive operation/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /no materially new evidence, context, or reasoning/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /paraphrase and cosmetic context changes are repeats/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /Exact normalized duplicates are always repeats/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /Application, comparison, causal explanation, synthesis, or evaluation in a genuinely new context are new/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /genuinely distinct from every earlier Challenge question.*add `noveltyBasis`/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /omit it for the first question, repeats, paraphrases, and cosmetic changes/i,
    );
  });
  it('drafting prompt forbids invention', () => {
    expect(challengeRoundDraftingPrompt).toMatch(/do not invent/i);
    expect(challengeRoundDraftingPrompt).toMatchSnapshot();
  });
});
