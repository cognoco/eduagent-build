import { copyRegisterFor } from './copy-register';

describe('copyRegisterFor', () => {
  const currentYear = new Date().getFullYear();

  describe('with birthYear', () => {
    it('returns child for under 13', () => {
      expect(copyRegisterFor('child', currentYear - 11)).toBe('child');
      expect(copyRegisterFor('owner', currentYear - 12)).toBe('child');
    });

    it('returns teen for 13-17', () => {
      expect(copyRegisterFor('child', currentYear - 13)).toBe('teen');
      expect(copyRegisterFor('owner', currentYear - 15)).toBe('teen');
      expect(copyRegisterFor('child', currentYear - 17)).toBe('teen');
    });

    it('returns adult for 18+', () => {
      expect(copyRegisterFor('owner', currentYear - 18)).toBe('adult');
      expect(copyRegisterFor('owner', currentYear - 40)).toBe('adult');
    });

    it('ignores role when birthYear is present', () => {
      // A child-role profile aged 16 reads as teen, not child
      expect(copyRegisterFor('child', currentYear - 16)).toBe('teen');
      // An owner-role profile aged 11 reads as child, not adult
      expect(copyRegisterFor('owner', currentYear - 11)).toBe('child');
    });
  });

  describe('without birthYear (role-only fallback)', () => {
    it('returns child for child role', () => {
      expect(copyRegisterFor('child', null)).toBe('child');
      expect(copyRegisterFor('child', undefined)).toBe('child');
      expect(copyRegisterFor('child')).toBe('child');
    });

    it('returns adult for owner and impersonated-child roles', () => {
      expect(copyRegisterFor('owner', null)).toBe('adult');
      expect(copyRegisterFor('impersonated-child', null)).toBe('adult');
    });

    it('returns adult for null role', () => {
      expect(copyRegisterFor(null, null)).toBe('adult');
    });
  });
});
