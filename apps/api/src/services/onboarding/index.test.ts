import { ForbiddenError } from '@eduagent/schemas';
import { assertPronounsSelfEditAllowed } from './index';

// calculateAge (in services/consent) uses getUTCFullYear(), so derive the
// boundary years from the UTC year to stay timezone-independent.
const CURRENT_YEAR = new Date().getUTCFullYear();

describe('assertPronounsSelfEditAllowed (WI-278)', () => {
  it('throws ForbiddenError when the profile is under PRONOUNS_PROMPT_MIN_AGE (year-only age 12)', () => {
    expect(() => assertPronounsSelfEditAllowed(CURRENT_YEAR - 12)).toThrow(
      ForbiddenError,
    );
  });

  it('does not throw at exactly the minimum age (year-only age 13)', () => {
    expect(() =>
      assertPronounsSelfEditAllowed(CURRENT_YEAR - 13),
    ).not.toThrow();
  });

  it('does not throw for an older learner', () => {
    expect(() =>
      assertPronounsSelfEditAllowed(CURRENT_YEAR - 20),
    ).not.toThrow();
  });

  it.each([null, undefined])(
    'does not throw when birthYear is %s (unknown age is allowed; birthYear is NOT NULL in practice)',
    (birthYear) => {
      expect(() => assertPronounsSelfEditAllowed(birthYear)).not.toThrow();
    },
  );
});
