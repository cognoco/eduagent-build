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

import type { Database } from '@eduagent/database';
import {
  checkConsentRequired,
  requestConsent,
  processConsentResponse,
  getConsentStatus,
} from './consent';

const NOW = new Date('2025-01-15T10:00:00.000Z');

function mockConsentRow(
  overrides?: Partial<{
    id: string;
    profileId: string;
    consentType: 'GDPR' | 'COPPA';
    status:
      | 'PENDING'
      | 'PARENTAL_CONSENT_REQUESTED'
      | 'CONSENTED'
      | 'WITHDRAWN';
    parentEmail: string | null;
  }>
) {
  return {
    id: overrides?.id ?? 'consent-1',
    profileId: overrides?.profileId ?? '550e8400-e29b-41d4-a716-446655440000',
    consentType: overrides?.consentType ?? 'GDPR',
    status: overrides?.status ?? 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: overrides?.parentEmail ?? 'parent@example.com',
    requestedAt: NOW,
    respondedAt: null,
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb({
  findFirstResult = undefined as ReturnType<typeof mockConsentRow> | undefined,
  insertReturning = [] as ReturnType<typeof mockConsentRow>[],
} = {}): Database {
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const deleteWhere = jest.fn().mockResolvedValue(undefined);
  const deleteFn = jest.fn().mockReturnValue({ where: deleteWhere });

  return {
    query: {
      consentStates: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
      profiles: {
        findFirst: jest.fn().mockResolvedValue({ displayName: 'Test Child' }),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    update: jest.fn().mockReturnValue({ set: updateSet }),
    delete: deleteFn,
  } as unknown as Database;
}

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
    const row = mockConsentRow();
    const db = createMockDb({ insertReturning: [row] });
    const result = await requestConsent(
      db,
      {
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      },
      'https://test.example.com'
    );

    expect(result.status).toBe('PARENTAL_CONSENT_REQUESTED');
    expect(result.profileId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.consentType).toBe('GDPR');
    expect(result.parentEmail).toBe('parent@example.com');
    expect(result.respondedAt).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.requestedAt).toBeDefined();
  });

  it('persists the consent token in the insert values', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ insertReturning: [row] });
    await requestConsent(
      db,
      {
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      },
      'https://test.example.com'
    );

    const insertCall = (db.insert as jest.Mock).mock.results[0].value;
    const valuesCall = insertCall.values as jest.Mock;
    const insertedValues = valuesCall.mock.calls[0][0];
    expect(insertedValues).toHaveProperty('consentToken');
    expect(typeof insertedValues.consentToken).toBe('string');
    expect(insertedValues.consentToken.length).toBeGreaterThan(0);
  });

  it('returns consent state with correct consent type for COPPA', async () => {
    const row = mockConsentRow({ consentType: 'COPPA' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await requestConsent(
      db,
      {
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'COPPA',
      },
      'https://test.example.com'
    );

    expect(result.consentType).toBe('COPPA');
  });
});

// ---------------------------------------------------------------------------
// processConsentResponse
// ---------------------------------------------------------------------------

describe('processConsentResponse', () => {
  it('returns CONSENTED status when token found and approved', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });
    const result = await processConsentResponse(db, 'valid-token', true);

    expect(result.status).toBe('CONSENTED');
    expect(result.respondedAt).toBeDefined();
    expect(result.profileId).toBe(row.profileId);
    expect(result.consentType).toBe('GDPR');
  });

  it('returns WITHDRAWN status when token found and denied', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });
    const result = await processConsentResponse(db, 'valid-token', false);

    expect(result.status).toBe('WITHDRAWN');
    expect(result.respondedAt).toBeDefined();
  });

  it('throws error when token is not found', async () => {
    const db = createMockDb({ findFirstResult: undefined });

    await expect(
      processConsentResponse(db, 'invalid-token', true)
    ).rejects.toThrow('Invalid consent token');
  });

  it('updates consent state in the database', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });
    await processConsentResponse(db, 'valid-token', true);

    expect(db.update).toHaveBeenCalled();
  });

  it('deletes profile when consent is denied', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });
    await processConsentResponse(db, 'valid-token', false);

    expect(db.delete).toHaveBeenCalled();
  });

  it('does not delete profile when consent is approved', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });
    await processConsentResponse(db, 'valid-token', true);

    expect(db.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getConsentStatus
// ---------------------------------------------------------------------------

describe('getConsentStatus', () => {
  it('returns null when no consent record exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await getConsentStatus(db, 'any-profile-id');

    expect(result).toBeNull();
  });

  it('returns status from latest consent record', async () => {
    const row = mockConsentRow({ status: 'CONSENTED' });
    const db = createMockDb({ findFirstResult: row });
    const result = await getConsentStatus(
      db,
      '550e8400-e29b-41d4-a716-446655440000'
    );

    expect(result).toBe('CONSENTED');
  });
});
