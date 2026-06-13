import {
  CHALLENGE_OFFER_COOLDOWN_HOURS,
  MAX_CHALLENGE_ANSWER_CHARS,
  MAX_CHALLENGE_QUESTIONS,
  MIN_LEXICAL_OVERLAP_NOTE_DRAFT,
  enforceChallengeQuestionCap,
} from './caps';

describe('challenge-round caps', () => {
  it('exposes MAX_CHALLENGE_QUESTIONS = 3', () => {
    expect(MAX_CHALLENGE_QUESTIONS).toBe(3);
  });

  it('exposes MAX_CHALLENGE_ANSWER_CHARS = 2000', () => {
    expect(MAX_CHALLENGE_ANSWER_CHARS).toBe(2000);
  });

  it('exposes CHALLENGE_OFFER_COOLDOWN_HOURS = 24', () => {
    expect(CHALLENGE_OFFER_COOLDOWN_HOURS).toBe(24);
  });

  it('exposes MIN_LEXICAL_OVERLAP_NOTE_DRAFT = 0.4', () => {
    expect(MIN_LEXICAL_OVERLAP_NOTE_DRAFT).toBe(0.4);
  });
});

describe('enforceChallengeQuestionCap', () => {
  it('caps a requested 5 down to the MAX', () => {
    expect(enforceChallengeQuestionCap(5)).toBe(MAX_CHALLENGE_QUESTIONS);
  });

  it('passes a valid in-range value through', () => {
    expect(enforceChallengeQuestionCap(2)).toBe(2);
  });

  it('floors zero/negative input to 1 (never returns 0-question round)', () => {
    expect(enforceChallengeQuestionCap(0)).toBe(1);
    expect(enforceChallengeQuestionCap(-3)).toBe(1);
  });

  it('clamps NaN/Infinity to the MAX so the hard cap is total over all inputs', () => {
    expect(enforceChallengeQuestionCap(NaN)).toBe(MAX_CHALLENGE_QUESTIONS);
    expect(enforceChallengeQuestionCap(Infinity)).toBe(MAX_CHALLENGE_QUESTIONS);
    expect(enforceChallengeQuestionCap(-Infinity)).toBe(
      MAX_CHALLENGE_QUESTIONS,
    );
  });
});
