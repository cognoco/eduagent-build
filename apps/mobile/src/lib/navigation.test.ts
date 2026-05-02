import { FAMILY_HOME_PATH } from './navigation';

describe('navigation constants', () => {
  it('exports FAMILY_HOME_PATH for family-facing navigation', () => {
    expect(FAMILY_HOME_PATH).toBe('/(app)/dashboard');
  });
});
