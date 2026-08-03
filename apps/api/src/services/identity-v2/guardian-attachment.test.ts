import {
  GuardianAttachmentRejectedError,
  resolveGuardianAttachmentLawfulBasis,
} from './guardian-attachment';

describe('resolveGuardianAttachmentLawfulBasis', () => {
  it('maps US_COPPA to the COPPA parental-consent basis', () => {
    expect(resolveGuardianAttachmentLawfulBasis('US_COPPA')).toBe(
      'coppa_parental_consent',
    );
  });

  it.each(['EU_GDPR_13', 'EU_GDPR_14', 'EU_GDPR_15', 'EU_GDPR_16', 'UK_AADC'])(
    'maps the explicitly approved %s regime to the GDPR basis',
    (regimeKey) => {
      expect(resolveGuardianAttachmentLawfulBasis(regimeKey)).toBe(
        'gdpr_parental_consent',
      );
    },
  );

  it.each(['ROW', 'FUTURE_UNMAPPED_REGIME', null])(
    'rejects the unmapped %s regime instead of inheriting a basis',
    (regimeKey) => {
      expect(() => resolveGuardianAttachmentLawfulBasis(regimeKey)).toThrow(
        GuardianAttachmentRejectedError,
      );
    },
  );
});
