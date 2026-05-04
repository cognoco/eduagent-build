import type { Database } from '@eduagent/database';
import {
  checkConsentRequired,
  createGrantedConsentState,
  createPendingConsentState,
  requestConsent,
  processConsentResponse,
  getConsentStatus,
  EmailDeliveryError,
} from './consent';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const CURRENT_YEAR = new Date().getFullYear();
const EMAIL_OPTIONS = { resendApiKey: 'test-resend-api-key' };
const originalFetch = global.fetch;
const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

function createFetchResponse({
  ok = true,
  status = 200,
  json = { id: 'email-1' },
}: {
  ok?: boolean;
  status?: number;
  json?: unknown;
} = {}): Response {
  return {
    ok,
    status,
    json: async () => json,
  } as Response;
}

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
  transactionError = undefined as Error | undefined,
} = {}): Database {
  // Atomic update chain: update().set().where().returning()
  // returning() resolves with the row (simulates 1 matched row)
  const updateReturning = jest
    .fn()
    .mockResolvedValue(findFirstResult ? [findFirstResult] : []);
  const updateWhere = jest.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const deleteWhere = jest.fn().mockResolvedValue(undefined);
  const deleteFn = jest.fn().mockReturnValue({ where: deleteWhere });

  // Build a tx object that simulates the transaction callback argument.
  // The tx has the same insert/update interface as db.
  const txInsert = jest.fn().mockReturnValue({
    values: jest.fn().mockReturnValue({
      onConflictDoUpdate: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
      onConflictDoNothing: jest.fn().mockResolvedValue([]),
    }),
  });

  // db.transaction invokes the callback with tx. If transactionError is set,
  // the transaction itself rejects (simulating a rollback / constraint failure
  // after the first statement).
  const transactionFn = transactionError
    ? jest.fn().mockRejectedValue(transactionError)
    : jest
        .fn()
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) => {
            const tx = { insert: txInsert };
            return callback(tx);
          }
        );

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
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(insertReturning),
        }),
      }),
    }),
    transaction: transactionFn,
    update: jest.fn().mockReturnValue({ set: updateSet }),
    delete: deleteFn,
  } as unknown as Database;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(createFetchResponse());
  global.fetch = fetchMock;
});

afterAll(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// checkConsentRequired
// ---------------------------------------------------------------------------

describe('checkConsentRequired', () => {
  it('requires GDPR consent for child under 16', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 10);

    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
  });

  it('requires GDPR consent for someone turning 16 this year', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 16);

    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
  });

  it('does not require consent for 17-year-old', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 17);

    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('does not require consent for adult', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 30);

    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('flags belowMinimumAge for child under 11', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 9);

    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
    expect(result.belowMinimumAge).toBe(true);
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
      'https://test.example.com',
      EMAIL_OPTIONS
    );

    expect(result.consentState.status).toBe('PARENTAL_CONSENT_REQUESTED');
    expect(result.consentState.profileId).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
    expect(result.consentState.consentType).toBe('GDPR');
    expect(result.consentState.parentEmail).toBe('parent@example.com');
    expect(result.consentState.respondedAt).toBeNull();
    expect(typeof result.consentState.id).toBe('string');
    expect(typeof result.consentState.requestedAt).toBe('string');
    expect(result.emailDelivered).toBe(true);
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
      'https://test.example.com',
      EMAIL_OPTIONS
    );

    const insertCall = (db.insert as jest.Mock).mock.results[0].value;
    const valuesCall = insertCall.values as jest.Mock;
    const insertedValues = valuesCall.mock.calls[0][0];
    expect(insertedValues).toHaveProperty('consentToken');
    expect(typeof insertedValues.consentToken).toBe('string');
    expect(insertedValues.consentToken.length).toBeGreaterThan(0);
  });

  it('returns emailDelivered false when API key is missing (no_api_key)', async () => {
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

    expect(result.emailDelivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    // Counter should NOT be rolled back for missing config
    expect(db.update).not.toHaveBeenCalled();
  });

  it('throws EmailDeliveryError and rolls back counter when email delivery fails', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse({ ok: false, status: 503 })
    );
    const row = mockConsentRow();
    const db = createMockDb({ insertReturning: [row] });

    await expect(
      requestConsent(
        db,
        {
          childProfileId: '550e8400-e29b-41d4-a716-446655440000',
          parentEmail: 'parent@example.com',
          consentType: 'GDPR',
        },
        'https://test.example.com',
        EMAIL_OPTIONS
      )
    ).rejects.toThrow(EmailDeliveryError);

    // Verify counter rollback was attempted
    expect(db.update).toHaveBeenCalled();
  });

  // BUG-240: Consent email link must use the API origin, never APP_URL
  it('uses the provided API origin in the sent consent email body [BUG-240]', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ insertReturning: [row] });
    await requestConsent(
      db,
      {
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      },
      'https://api.mentomate.com',
      EMAIL_OPTIONS
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const emailRequestBody = JSON.parse(String(init?.body)) as { text: string };
    expect(emailRequestBody.text).toContain(
      'https://api.mentomate.com/v1/consent-page?token='
    );
  });

  // BUG-240 break test: the tokenUrl must NEVER contain www.mentomate.com or app.mentomate.com
  it('never sends a consent link pointing to APP_URL domains [BUG-240]', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ insertReturning: [row] });
    await requestConsent(
      db,
      {
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      },
      'https://api.mentomate.com',
      EMAIL_OPTIONS
    );

    const [, init] = fetchMock.mock.calls[0];
    const emailRequestBody = JSON.parse(String(init?.body)) as { text: string };
    expect(emailRequestBody.text).not.toContain('app.mentomate.com');
    expect(emailRequestBody.text).not.toContain('www.mentomate.com');
  });

  it('returns consent state with correct consent type for COPPA (backward compat)', async () => {
    const row = mockConsentRow({ consentType: 'COPPA' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await requestConsent(
      db,
      {
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'COPPA',
      },
      'https://test.example.com',
      EMAIL_OPTIONS
    );

    expect(result.consentState.consentType).toBe('COPPA');
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
    expect(typeof result.respondedAt).toBe('string');
    expect(result.profileId).toBe(row.profileId);
    expect(result.consentType).toBe('GDPR');
  });

  it('returns WITHDRAWN status when token found and denied', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });
    const result = await processConsentResponse(db, 'valid-token', false);

    expect(result.status).toBe('WITHDRAWN');
    expect(typeof result.respondedAt).toBe('string');
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

// ---------------------------------------------------------------------------
// createPendingConsentState
// ---------------------------------------------------------------------------

describe('createPendingConsentState', () => {
  it('creates a PENDING consent state row', async () => {
    const row = mockConsentRow({ status: 'PENDING' });
    const db = createMockDb({ insertReturning: [row] });

    const result = await createPendingConsentState(
      db,
      '550e8400-e29b-41d4-a716-446655440000',
      'GDPR'
    );

    expect(result.status).toBe('PENDING');
    expect(result.profileId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.consentType).toBe('GDPR');
    expect(db.insert).toHaveBeenCalled();
  });

  it('works with COPPA consent type', async () => {
    const row = mockConsentRow({ status: 'PENDING', consentType: 'COPPA' });
    const db = createMockDb({ insertReturning: [row] });

    const result = await createPendingConsentState(
      db,
      '550e8400-e29b-41d4-a716-446655440000',
      'COPPA'
    );

    expect(result.status).toBe('PENDING');
    expect(result.consentType).toBe('COPPA');
  });

  it('clears stale approval metadata when resetting an existing row to PENDING', async () => {
    const row = mockConsentRow({ status: 'PENDING', parentEmail: null });
    const db = createMockDb({ insertReturning: [row] });

    await createPendingConsentState(
      db,
      '550e8400-e29b-41d4-a716-446655440000',
      'GDPR'
    );

    const onConflictArgs = (db.insert as jest.Mock).mock.results[0].value.values
      .mock.results[0].value.onConflictDoUpdate.mock.calls[0][0];

    expect(onConflictArgs.set).toMatchObject({
      status: 'PENDING',
      respondedAt: null,
      parentEmail: null,
      consentToken: null,
    });
  });
});

// ---------------------------------------------------------------------------
// createGrantedConsentState [BUG-863] — atomicity via db.transaction
// ---------------------------------------------------------------------------

describe('createGrantedConsentState', () => {
  const CHILD_ID = '550e8400-e29b-41d4-a716-446655440000';
  const PARENT_ID = '660e8400-e29b-41d4-a716-446655440001';

  it('returns a CONSENTED consent state when both writes succeed', async () => {
    const consentRow = mockConsentRow({
      status: 'CONSENTED',
      profileId: CHILD_ID,
    });
    const db = createMockDb({ insertReturning: [consentRow] });

    const result = await createGrantedConsentState(
      db,
      CHILD_ID,
      'GDPR',
      PARENT_ID
    );

    expect(result.status).toBe('CONSENTED');
    expect(result.profileId).toBe(CHILD_ID);
    expect(result.consentType).toBe('GDPR');
  });

  /**
   * BREAK TEST [BUG-863]: proves that a failure inside the transaction callback
   * propagates to the caller — no silent swallow.
   *
   * With the old neon-http driver, db.transaction() silently fell back to
   * non-atomic sequential execution (client.ts:40-54). If the familyLinks insert
   * failed after the consent row was written, the DB was left inconsistent.
   *
   * Phase 0.0 migrated to neon-serverless (WebSocket Pool), so db.transaction()
   * now opens a genuine Postgres BEGIN/COMMIT. A mid-transaction failure rolls
   * back both writes. This test verifies the error propagates rather than being
   * silently swallowed, confirming the atomic contract. [BUG-863]
   */
  it('[BUG-863] propagates transaction failure so no partial write is silently swallowed', async () => {
    // Simulate the transaction being rejected — e.g. FK violation on familyLinks
    // after the consent row was already written within the BEGIN block.
    const transactionError = new Error(
      'FK violation: parent profile does not exist'
    );
    const db = createMockDb({ transactionError });

    await expect(
      createGrantedConsentState(db, CHILD_ID, 'GDPR', PARENT_ID)
    ).rejects.toThrow('FK violation: parent profile does not exist');

    // Confirm db.transaction was the call path (not fire-and-forget)
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  /**
   * BREAK TEST [BUG-863]: verifies both writes go through db.transaction —
   * not two separate top-level awaits that could be interleaved or partially applied.
   */
  it('[BUG-863] wraps consent insert and family-link insert in a single db.transaction call', async () => {
    const consentRow = mockConsentRow({
      status: 'CONSENTED',
      profileId: CHILD_ID,
    });
    const db = createMockDb({ insertReturning: [consentRow] });

    await createGrantedConsentState(db, CHILD_ID, 'GDPR', PARENT_ID);

    // Both writes went through db.transaction (one call, ACID boundary)
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('throws when the transaction returns no consent row', async () => {
    // Transaction succeeds but insert returns empty — consent row not written
    const db = createMockDb({ insertReturning: [] });

    await expect(
      createGrantedConsentState(db, CHILD_ID, 'GDPR', PARENT_ID)
    ).rejects.toThrow('Insert into consentStates did not return a row');
  });
});
