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
  it('uses the per-concept evaluation cardinality accepted by the schema', () => {
    expect(challengeRoundActivePrompt).toMatch(
      /one evaluation item per concept assessed/i,
    );
    expect(challengeRoundActivePrompt).not.toMatch(
      /challenge_round_evaluation" with ONE item/i,
    );
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
      /questionText.*exact current wording/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /reuse only.*minimalLearningClaim.*cognitiveOperation.*materialContext/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /Exact normalized duplicates are always repeats/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /Application, comparison, causal explanation, synthesis, or evaluation in a genuinely new context are new/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /add `noveltyBasis` only if.*genuinely distinct from every prior identity.*every earlier Challenge question/i,
    );
    expect(challengeRoundActivePrompt).toMatch(
      /first question.*repeat.*paraphrase.*cosmetic context change.*uncertain.*omit `noveltyBasis`/i,
    );
  });
  it('drafting prompt forbids invention', () => {
    expect(challengeRoundDraftingPrompt).toMatch(/do not invent/i);
    expect(challengeRoundDraftingPrompt).toMatchSnapshot();
  });
});
