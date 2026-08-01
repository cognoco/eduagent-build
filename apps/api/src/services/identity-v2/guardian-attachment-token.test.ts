import {
  signGuardianAuthorityToken,
  verifyGuardianAuthorityToken,
} from './guardian-attachment-token';

const SECRET = 'guardian-authority-test-secret-at-least-32-chars';
const NOW = new Date('2026-07-30T12:00:00.000Z');

const assertion = {
  redemptionId: '44444444-4444-4444-8444-444444444444',
  guardianPersonId: '11111111-1111-4111-8111-111111111111',
  chargePersonId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  jurisdiction: 'NO',
  policyVersion: 'NO-2026-07',
  assuranceMethod: 'verified_parental_responsibility_credential',
  evidenceId: 'vpc:evidence:abc123',
  qualification: 'biological_parent' as const,
  decision: 'approved' as const,
  learnerAssentAt: null,
  issuedAt: NOW,
  notBefore: NOW,
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
      {
        ...assertion,
        issuedAt: new Date('2026-07-30T11:44:00.000Z'),
        notBefore: new Date('2026-07-30T11:44:00.000Z'),
        expiresAt: new Date('2026-07-30T11:58:59.000Z'),
      },
      SECRET,
    );

    expect(verifyGuardianAuthorityToken(token, SECRET, NOW)).toBeNull();
  });

  it('refuses to mint an assertion with an arbitrary future expiry', () => {
    expect(() =>
      signGuardianAuthorityToken(
        {
          ...assertion,
          expiresAt: new Date('2026-07-30T12:15:00.001Z'),
        },
        SECRET,
      ),
    ).toThrow('lifetime is invalid');
  });

  it('fails closed before not-before beyond the clock-skew allowance', () => {
    const token = signGuardianAuthorityToken(
      {
        ...assertion,
        notBefore: new Date('2026-07-30T12:02:00.000Z'),
        expiresAt: new Date('2026-07-30T12:15:00.000Z'),
      },
      SECRET,
    );

    expect(verifyGuardianAuthorityToken(token, SECRET, NOW)).toBeNull();
  });

  it('fails closed when issued-at is implausibly in the future', () => {
    const future = {
      ...assertion,
      issuedAt: new Date('2026-07-30T12:02:00.000Z'),
      notBefore: new Date('2026-07-30T12:02:00.000Z'),
      expiresAt: new Date('2026-07-30T12:15:00.000Z'),
    };
    const token = signGuardianAuthorityToken(future, SECRET);

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
