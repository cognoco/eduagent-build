// ---------------------------------------------------------------------------
// Mock notifications module — sendEmail is called by requestConsent
// ---------------------------------------------------------------------------

jest.mock('./notifications', () => ({
  sendEmail: jest.fn().mockResolvedValue({ sent: true }),
  formatConsentRequestEmail: jest.fn().mockReturnValue({
    to: 'parent@example.com',
    subject: 'Test',
    body: 'Test',
    type: 'consent_request',
  }),
}));

import {
  checkConsentRequired,
  requestConsent,
  processConsentResponse,
  getConsentStatus,
} from './consent';

// ---------------------------------------------------------------------------
// checkConsentRequired
// ---------------------------------------------------------------------------

describe('checkConsentRequired', () => {
  it('requires GDPR consent for EU child under 16', () => {
    // 10-year-old in the EU
    const result = checkConsentRequired('2016-06-15', 'EU');

    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
  });

  it('requires COPPA consent for US child under 13', () => {
    // 10-year-old in the US
    const result = checkConsentRequired('2016-06-15', 'US');

    expect(result.required).toBe(true);
    expect(result.consentType).toBe('COPPA');
  });

  it('does not require consent for EU user 16 or older', () => {
    // 18-year-old in the EU
    const result = checkConsentRequired('2008-01-01', 'EU');

    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('does not require consent for US user 13 or older', () => {
    // 14-year-old in the US
    const result = checkConsentRequired('2012-01-01', 'US');

    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('does not require consent for OTHER location regardless of age', () => {
    // 10-year-old in OTHER location
    const result = checkConsentRequired('2016-06-15', 'OTHER');

    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('does not require consent for adult in any location', () => {
    const eu = checkConsentRequired('1990-01-01', 'EU');
    const us = checkConsentRequired('1990-01-01', 'US');
    const other = checkConsentRequired('1990-01-01', 'OTHER');

    expect(eu.required).toBe(false);
    expect(us.required).toBe(false);
    expect(other.required).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requestConsent
// ---------------------------------------------------------------------------

describe('requestConsent', () => {
  it('returns consent state with PARENTAL_CONSENT_REQUESTED status', async () => {
    const result = await requestConsent({
      childProfileId: '550e8400-e29b-41d4-a716-446655440000',
      parentEmail: 'parent@example.com',
      consentType: 'GDPR',
    });

    expect(result.status).toBe('PARENTAL_CONSENT_REQUESTED');
    expect(result.profileId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.consentType).toBe('GDPR');
    expect(result.parentEmail).toBe('parent@example.com');
    expect(result.respondedAt).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.requestedAt).toBeDefined();
  });

  it('returns consent state with correct consent type for COPPA', async () => {
    const result = await requestConsent({
      childProfileId: '550e8400-e29b-41d4-a716-446655440000',
      parentEmail: 'parent@example.com',
      consentType: 'COPPA',
    });

    expect(result.consentType).toBe('COPPA');
  });
});

// ---------------------------------------------------------------------------
// processConsentResponse
// ---------------------------------------------------------------------------

describe('processConsentResponse', () => {
  it('returns CONSENTED status when approved', async () => {
    const result = await processConsentResponse('test-token', true);

    expect(result.status).toBe('CONSENTED');
    expect(result.respondedAt).toBeDefined();
  });

  it('returns WITHDRAWN status when denied', async () => {
    const result = await processConsentResponse('test-token', false);

    expect(result.status).toBe('WITHDRAWN');
    expect(result.respondedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getConsentStatus
// ---------------------------------------------------------------------------

describe('getConsentStatus', () => {
  it('returns null (stub — no DB integration yet)', async () => {
    const result = await getConsentStatus('any-profile-id');

    expect(result).toBeNull();
  });
});
