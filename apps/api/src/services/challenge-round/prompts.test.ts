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
  it('drafting prompt forbids invention', () => {
    expect(challengeRoundDraftingPrompt).toMatch(/do not invent/i);
    expect(challengeRoundDraftingPrompt).toMatchSnapshot();
  });
});
