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
  it('requires novel transfer questions rather than repeating prior lesson or round prompts', () => {
    expect(challengeRoundActivePrompt).toMatch(/prior lesson/i);
    expect(challengeRoundActivePrompt).toMatch(/same underlying problem/i);
  });
  it('drafting prompt forbids invention', () => {
    expect(challengeRoundDraftingPrompt).toMatch(/do not invent/i);
    expect(challengeRoundDraftingPrompt).toMatchSnapshot();
  });
});
