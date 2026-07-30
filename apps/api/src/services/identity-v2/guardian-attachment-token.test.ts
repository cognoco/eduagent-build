import {
  signGuardianAuthorityToken,
  verifyGuardianAuthorityToken,
} from './guardian-attachment-token';

const SECRET = 'guardian-authority-test-secret-at-least-32-chars';
const NOW = new Date('2026-07-30T12:00:00.000Z');

const assertion = {
  guardianPersonId: '11111111-1111-4111-8111-111111111111',
  chargePersonId: '22222222-2222-4222-8222-222222222222',
  jurisdiction: 'NO',
  policyVersion: 'NO-2026-07',
  assuranceMethod: 'verified_parental_responsibility_credential',
  evidenceId: 'vpc:evidence:abc123',
  qualification: 'biological_parent' as const,
  decision: 'approved' as const,
  learnerAssentAt: null,
  expiresAt: new Date('2026-07-30T12:15:00.000Z'),
};

describe('guardian authority assertion token', () => {
  it('round-trips a signed, approved VPC assertion', () => {
    const token = signGuardianAuthorityToken(assertion, SECRET);

    expect(verifyGuardianAuthorityToken(token, SECRET, NOW)).toEqual(assertion);
  });

  it.each(['pending', 'denied'] as const)(
    'fails closed for a %s authority decision',
    (decision) => {
      const token = signGuardianAuthorityToken(
        { ...assertion, decision },
        SECRET,
      );

      expect(verifyGuardianAuthorityToken(token, SECRET, NOW)).toBeNull();
    },
  );

  it('fails closed when the assertion is expired', () => {
    const token = signGuardianAuthorityToken(
      { ...assertion, expiresAt: new Date('2026-07-30T11:59:59.000Z') },
      SECRET,
    );

    expect(verifyGuardianAuthorityToken(token, SECRET, NOW)).toBeNull();
  });

  it('fails closed for tampering and the wrong secret', () => {
    const token = signGuardianAuthorityToken(assertion, SECRET);
    const [payload, signature] = token.split('.');

    expect(
      verifyGuardianAuthorityToken(`${payload}x.${signature}`, SECRET, NOW),
    ).toBeNull();
    expect(
      verifyGuardianAuthorityToken(
        token,
        'different-guardian-authority-secret-32-chars',
        NOW,
      ),
    ).toBeNull();
  });
});
