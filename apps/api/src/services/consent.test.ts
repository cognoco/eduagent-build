import type { Database } from '@eduagent/database';
import {
  calculateAge,
  calculateAgeFromParts,
  checkConsentRequired,
  checkConsentRequiredFromDate,
  createGrantedConsentState,
  createPendingConsentState,
  getChildNameByToken,
  requestConsent,
  resendConsent,
  processConsentResponse,
  getConsentStatus,
  isConsentRevocationGenerationCurrent,
  isGdprProcessingAllowed,
  isGdprProcessingAllowedBatch,
  getLatestGdprConsentByProfile,
  revokeConsent,
  restoreConsent,
  refreshConsentToken,
  refreshConsentTokenForRequest,
  EmailDeliveryError,
  ConsentTokenExpiredError,
  ConsentRecordNotFoundError,
  ConsentResendLimitError,
  ConsentRequestNotFoundError,
  ConsentGracePeriodExpiredError,
  RESTORE_CONSENT_GRACE_PERIOD_MS,
} from './consent';

const NOW = new Date('2025-01-15T10:00:00.000Z');
// Must mirror SUT: calculateAge() uses getUTCFullYear() so tests stay correct
// regardless of host TZ (e.g. running locally in UTC+1 across a year boundary).
const CURRENT_YEAR = new Date().getUTCFullYear();
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
    expiresAt: Date | null;
    consentToken: string | null;
    respondedAt: Date | null;
  }>,
) {
  return {
    id: overrides?.id ?? 'consent-1',
    profileId: overrides?.profileId ?? '550e8400-e29b-41d4-a716-446655440000',
    consentType: overrides?.consentType ?? 'GDPR',
    status: overrides?.status ?? 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: overrides?.parentEmail ?? 'parent@example.com',
    requestedAt: NOW,
    respondedAt:
      overrides?.respondedAt !== undefined ? overrides.respondedAt : null,
    expiresAt: overrides?.expiresAt !== undefined ? overrides.expiresAt : null,
    consentToken:
      overrides?.consentToken !== undefined ? overrides.consentToken : null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb({
  findFirstResult = undefined as ReturnType<typeof mockConsentRow> | undefined,
  insertReturning = [] as ReturnType<typeof mockConsentRow>[],
  transactionError = undefined as Error | undefined,
  // Rows returned by the suppression lookup that sendEmail runs when `db` is
  // passed through. Empty (default) → address not suppressed → send proceeds.
  suppressionRows = [] as { email: string }[],
} = {}): Database {
  // Atomic update chain: update().set().where().returning()
  // returning() resolves with the row (simulates 1 matched row)
  const updateReturning = jest
    .fn()
    .mockResolvedValue(findFirstResult ? [findFirstResult] : []);
  const updateWhere = jest.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const updateFn = jest.fn().mockReturnValue({ set: updateSet });
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
            const tx = { insert: txInsert, update: updateFn, delete: deleteFn };
            return callback(tx);
          },
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
    // Used only by isEmailSuppressed (via sendEmail) when db is threaded
    // through. The caller looks up exactly one address per send.
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(suppressionRows),
        }),
      }),
    }),
    transaction: transactionFn,
    update: updateFn,
    delete: deleteFn,
  } as unknown as Database;
}

function extractSqlTextAndValues(
  node: unknown,
  visited = new WeakSet<object>(),
): string[] {
  if (node === null || node === undefined) return [];
  if (node instanceof Date) return [node.toISOString().toLowerCase()];
  if (typeof node !== 'object') return [String(node).toLowerCase()];
  if (visited.has(node as object)) return [];
  visited.add(node as object);

  const values: string[] = [];
  const obj = node as Record<string, unknown>;
  if (typeof obj['name'] === 'string') values.push(obj['name'].toLowerCase());
  if (
    'value' in obj &&
    (typeof obj['value'] === 'string' ||
      typeof obj['value'] === 'number' ||
      obj['value'] instanceof Date)
  ) {
    const value = obj['value'];
    values.push(
      value instanceof Date
        ? value.toISOString().toLowerCase()
        : String(value).toLowerCase(),
    );
  }
  for (const key of ['queryChunks', 'left', 'right', 'conditions', 'values']) {
    const child = obj[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        values.push(...extractSqlTextAndValues(item, visited));
      }
    } else {
      values.push(...extractSqlTextAndValues(child, visited));
    }
  }
  return values;
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
// calculateAge — UTC contract (bug 105)
// ---------------------------------------------------------------------------

describe('calculateAge', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the difference between current UTC year and birth year', () => {
    // Pin the wall clock to a UTC instant where local-time year would differ
    // from UTC year for any timezone west of UTC.
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T01:00:00.000Z'));
    expect(calculateAge(2000)).toBe(25);
  });

  it('is timezone-independent across year boundary (regression: bug 105)', () => {
    // 2026-01-01 00:30 UTC. In timezones east of UTC (e.g. CET/UTC+1) this is
    // still 2026; in zones west of UTC (e.g. EST/UTC-5) the LOCAL date is
    // 2025-12-31. getUTCFullYear() must return 2026 either way.
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:30:00.000Z'));
    expect(calculateAge(2010)).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// isGdprProcessingAllowed (WI-82: shared async-processing consent gate)
// ---------------------------------------------------------------------------

describe('isGdprProcessingAllowed', () => {
  const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('allows processing when no consent row exists (pre-consent-flow account)', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    await expect(isGdprProcessingAllowed(db, PROFILE_ID)).resolves.toBe(true);
  });

  it('allows processing when the latest GDPR consent is CONSENTED', async () => {
    const db = createMockDb({
      findFirstResult: mockConsentRow({ status: 'CONSENTED' }),
    });
    await expect(isGdprProcessingAllowed(db, PROFILE_ID)).resolves.toBe(true);
  });

  it.each(['PENDING', 'PARENTAL_CONSENT_REQUESTED', 'WITHDRAWN'] as const)(
    'blocks processing when the latest GDPR consent is %s',
    async (status) => {
      const db = createMockDb({ findFirstResult: mockConsentRow({ status }) });
      await expect(isGdprProcessingAllowed(db, PROFILE_ID)).resolves.toBe(
        false,
      );
    },
  );
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

  it('flags belowMinimumAge for child under 13 (WI-570: v1 13+ floor)', () => {
    const result = checkConsentRequired(CURRENT_YEAR - 9);

    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
    expect(result.belowMinimumAge).toBe(true);
  });

  // [F-029-sem][BREAK] The central age-gate must fail CLOSED when birthYear is
  // unknown (null / undefined / 0). The W0 patch (F-145) closed the
  // assertPronounsSelfEditAllowed path; the central checkConsentRequired must
  // carry the same semantic guarantee so no caller can pass a sentinel value
  // and receive "not required" back.
  //
  // Red→green: checkConsentRequired(null) currently computes age as NaN (from
  // calculateAge(null)) → NaN < 13 is false → NaN <= 16 is false → returns
  // { required: false }. Fix: accept number | null | undefined and fail closed.
  it.each([null, undefined, 0])(
    '[F-029-sem][BREAK] checkConsentRequired(%s) fails closed (required=true, belowMinimumAge=true)',
    (birthYear) => {
      const result = checkConsentRequired(birthYear);
      expect(result.required).toBe(true);
      expect(result.belowMinimumAge).toBe(true);
    },
  );

  // [F-029-sem] checkConsentRequiredFromDate mirrors the fail-closed guarantee.
  it.each([null, undefined, 0])(
    '[F-029-sem] checkConsentRequiredFromDate(%s, ...) fails closed',
    (birthYear) => {
      const result = checkConsentRequiredFromDate(birthYear, 6, 15);
      expect(result.required).toBe(true);
      expect(result.belowMinimumAge).toBe(true);
    },
  );
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
      EMAIL_OPTIONS,
    );

    expect(result.consentState.status).toBe('PARENTAL_CONSENT_REQUESTED');
    expect(result.consentState.profileId).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
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
      EMAIL_OPTIONS,
    );

    const insertCall = (db.insert as jest.Mock).mock.results[0]!.value;
    const valuesCall = insertCall.values as jest.Mock;
    const insertedValues = valuesCall.mock.calls[0]![0];
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
      'https://test.example.com',
    );

    expect(result.emailDelivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    // Counter should NOT be rolled back for missing config
    expect(db.update).not.toHaveBeenCalled();
  });

  it('throws EmailDeliveryError and rolls back counter when email delivery fails', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse({ ok: false, status: 503 }),
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
        EMAIL_OPTIONS,
      ),
    ).rejects.toThrow(EmailDeliveryError);

    // Verify counter rollback was attempted
    expect(db.update).toHaveBeenCalled();
  });

  it('throws EmailDeliveryError without hitting the network when the parent address is suppressed', async () => {
    const row = mockConsentRow();
    const db = createMockDb({
      insertReturning: [row],
      suppressionRows: [{ email: 'parent@example.com' }],
    });

    await expect(
      requestConsent(
        db,
        {
          childProfileId: '550e8400-e29b-41d4-a716-446655440000',
          parentEmail: 'parent@example.com',
          consentType: 'GDPR',
        },
        'https://test.example.com',
        EMAIL_OPTIONS,
      ),
    ).rejects.toThrow(EmailDeliveryError);

    // Suppressed → sendEmail returns { sent: false, reason: 'suppressed' }
    // BEFORE any network call. This is the behavioural distinction from a 503:
    // we must never re-burn send quota on a permanently-dead address.
    expect(fetchMock).not.toHaveBeenCalled();
    // The reason is NOT 'no_api_key', so the counter is rolled back (unlike the
    // missing-config branch, which returns gracefully without rollback).
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
      EMAIL_OPTIONS,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const emailRequestBody = JSON.parse(String(init?.body)) as { text: string };
    expect(emailRequestBody.text).toContain(
      'https://api.mentomate.com/v1/consent-page?token=',
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
      EMAIL_OPTIONS,
    );

    const [, init] = fetchMock.mock.calls[0]!;
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
      EMAIL_OPTIONS,
    );

    expect(result.consentState.consentType).toBe('COPPA');
  });
});

// ---------------------------------------------------------------------------
// [QA-09 / ACCOUNT-19] Generated consent email URL shape
//
// The consent link parents click is built inline as
//   `${appUrl}/v1/consent-page?token=${token}`
// where `token` is a freshly minted crypto.randomUUID(). This regression pins
// the EXACT URL structure (path, query param name, UUID token) deterministically
// — no real mailbox is needed because the Resend send is the only fetch and the
// outbound body is inspected directly. Only true SMTP/provider delivery (the
// email actually arriving) is out of scope and stays Blocked in the flow plan.
// ---------------------------------------------------------------------------

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extracts the single consent-page URL embedded in the sent email body. */
function extractConsentUrlFromFetch(): string {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [, init] = fetchMock.mock.calls[0]!;
  const body = JSON.parse(String(init?.body)) as { text: string };
  const match = body.text.match(/https?:\/\/\S*\/v1\/consent-page\?token=\S+/);
  if (!match) {
    throw new Error(`No consent-page URL found in email body: ${body.text}`);
  }
  return match[0];
}

describe('[QA-09] generated consent email URL shape', () => {
  const CHILD_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('requestConsent builds `<appUrl>/v1/consent-page?token=<uuid>` with a real UUID token', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ insertReturning: [row] });

    await requestConsent(
      db,
      {
        childProfileId: CHILD_ID,
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      },
      'https://api.mentomate.com',
      EMAIL_OPTIONS,
    );

    const url = extractConsentUrlFromFetch();
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://api.mentomate.com');
    expect(parsed.pathname).toBe('/v1/consent-page');
    const token = parsed.searchParams.get('token');
    expect(token).toMatch(UUID_RE);
    // The link must carry ONLY the token query param (no PII leakage).
    expect([...parsed.searchParams.keys()]).toEqual(['token']);

    // The URL token must equal the token persisted on the insert row — the link
    // is dead-on-arrival otherwise (DS-020 family).
    const insertCall = (db.insert as jest.Mock).mock.results[0]!.value;
    const insertedValues = insertCall.values.mock.calls[0]![0] as {
      consentToken: string;
    };
    expect(token).toBe(insertedValues.consentToken);
  });

  it('requestConsent preserves the appUrl host/port exactly when it carries a port', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ insertReturning: [row] });

    await requestConsent(
      db,
      {
        childProfileId: CHILD_ID,
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      },
      'http://localhost:8787',
      EMAIL_OPTIONS,
    );

    const url = extractConsentUrlFromFetch();
    const parsed = new URL(url);
    expect(parsed.origin).toBe('http://localhost:8787');
    expect(parsed.pathname).toBe('/v1/consent-page');
    expect(parsed.searchParams.get('token')).toMatch(UUID_RE);
  });

  it('resendConsent rebuilds the same `<appUrl>/v1/consent-page?token=<uuid>` shape with a fresh UUID', async () => {
    const row = mockConsentRow({ parentEmail: 'stored-parent@example.com' });
    const db = createMockDb({ findFirstResult: row });

    await resendConsent(
      db,
      { childProfileId: CHILD_ID, consentType: 'GDPR' },
      'https://api.mentomate.com',
      EMAIL_OPTIONS,
    );

    const url = extractConsentUrlFromFetch();
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://api.mentomate.com');
    expect(parsed.pathname).toBe('/v1/consent-page');
    expect(parsed.searchParams.get('token')).toMatch(UUID_RE);
    expect([...parsed.searchParams.keys()]).toEqual(['token']);
  });
});

// ---------------------------------------------------------------------------
// resendConsent [WI-374] — resend reuses the STORED email, never a client value
// ---------------------------------------------------------------------------

describe('resendConsent [WI-374]', () => {
  const CHILD_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('reuses the stored parent email server-side and never accepts a client email', async () => {
    const row = mockConsentRow({ parentEmail: 'stored-parent@example.com' });
    const db = createMockDb({ findFirstResult: row });

    const result = await resendConsent(
      db,
      { childProfileId: CHILD_ID, consentType: 'GDPR' },
      'https://api.mentomate.com',
      EMAIL_OPTIONS,
    );

    expect(result.emailDelivered).toBe(true);
    // The resend went out to the STORED recipient — not a client-supplied or
    // masked address (the input shape has no email field at all).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = String(init?.body);
    expect(body).toContain('stored-parent@example.com');
    expect(body).not.toContain('***');
  });

  it('issues an UPDATE (never an INSERT) so a resend cannot create a new request', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });

    await resendConsent(
      db,
      { childProfileId: CHILD_ID, consentType: 'GDPR' },
      'https://api.mentomate.com',
      EMAIL_OPTIONS,
    );

    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws ConsentRequestNotFoundError when there is no request to resend', async () => {
    // update matches nothing AND no row exists on the disambiguating read.
    const db = createMockDb({ findFirstResult: undefined });

    await expect(
      resendConsent(
        db,
        { childProfileId: CHILD_ID, consentType: 'GDPR' },
        'https://api.mentomate.com',
        EMAIL_OPTIONS,
      ),
    ).rejects.toThrow(ConsentRequestNotFoundError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws ConsentResendLimitError when the cap is reached (row exists, update matched nothing)', async () => {
    // Bespoke mock: the atomic capped UPDATE matches nothing (returning []),
    // but the disambiguating read finds the row → cap was hit, not missing.
    const existingRow = mockConsentRow();
    const db = {
      query: {
        consentStates: {
          findFirst: jest.fn().mockResolvedValue(existingRow),
        },
        profiles: {
          findFirst: jest.fn().mockResolvedValue({ displayName: 'Test Child' }),
        },
      },
      insert: jest.fn(),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as unknown as Database;

    await expect(
      resendConsent(
        db,
        { childProfileId: CHILD_ID, consentType: 'GDPR' },
        'https://api.mentomate.com',
        EMAIL_OPTIONS,
      ),
    ).rejects.toThrow(ConsentResendLimitError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws EmailDeliveryError and rolls back the resend counter when delivery fails', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse({ ok: false, status: 503 }),
    );
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });

    await expect(
      resendConsent(
        db,
        { childProfileId: CHILD_ID, consentType: 'GDPR' },
        'https://api.mentomate.com',
        EMAIL_OPTIONS,
      ),
    ).rejects.toThrow(EmailDeliveryError);

    // Two updates: the atomic increment, then the rollback decrement.
    expect((db.update as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('throws EmailDeliveryError and rolls back the resend counter when the parent address is suppressed', async () => {
    const row = mockConsentRow();
    const db = createMockDb({
      findFirstResult: row,
      suppressionRows: [{ email: row.parentEmail }],
    });

    await expect(
      resendConsent(
        db,
        { childProfileId: CHILD_ID, consentType: 'GDPR' },
        'https://api.mentomate.com',
        EMAIL_OPTIONS,
      ),
    ).rejects.toThrow(EmailDeliveryError);

    // Suppressed → no network send, but the counter IS rolled back (reason is
    // 'suppressed', not 'no_api_key'): atomic increment + rollback decrement.
    expect(fetchMock).not.toHaveBeenCalled();
    expect((db.update as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('returns emailDelivered false (no rollback) when the API key is missing', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });

    const result = await resendConsent(
      db,
      { childProfileId: CHILD_ID, consentType: 'GDPR' },
      'https://api.mentomate.com',
      // no EMAIL_OPTIONS → no_api_key
    );

    expect(result.emailDelivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    // Only the initial atomic increment — no rollback for a config issue.
    expect((db.update as jest.Mock).mock.calls.length).toBe(1);
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
      processConsentResponse(db, 'invalid-token', true),
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

  it('[WI-84 DS-056] wraps denied status update and profile deletion in one transaction', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });
    await processConsentResponse(db, 'valid-token', false);

    expect(db.transaction).toHaveBeenCalled();
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
      '550e8400-e29b-41d4-a716-446655440000',
    );

    expect(result).toBe('CONSENTED');
  });
});

describe('isConsentRevocationGenerationCurrent', () => {
  it('[WI-973] returns false when revokedAt is omitted — prevents vacuous cascade-delete authorization', async () => {
    // Before WI-973 fix this returned true (the bug): a missing revokedAt could
    // not confirm the generation, so returning true vacuously authorised
    // cascade child-profile deletion on malformed/replayed events.
    const db = createMockDb({
      findFirstResult: mockConsentRow({
        status: 'WITHDRAWN',
        respondedAt: new Date('2026-01-12T10:00:00.000Z'),
      }),
    });

    await expect(
      isConsentRevocationGenerationCurrent(
        db,
        '550e8400-e29b-41d4-a716-446655440000',
      ),
    ).resolves.toBe(false);
  });

  it('returns true when the current GDPR withdrawal has the same respondedAt as the event generation', async () => {
    const revokedAt = new Date('2026-01-10T10:00:00.000Z');
    const db = createMockDb({
      findFirstResult: mockConsentRow({
        status: 'WITHDRAWN',
        respondedAt: revokedAt,
      }),
    });

    await expect(
      isConsentRevocationGenerationCurrent(
        db,
        '550e8400-e29b-41d4-a716-446655440000',
        revokedAt,
      ),
    ).resolves.toBe(true);
  });

  it('returns false when consent is withdrawn for a newer generation', async () => {
    const db = createMockDb({
      findFirstResult: mockConsentRow({
        status: 'WITHDRAWN',
        respondedAt: new Date('2026-01-12T10:00:00.000Z'),
      }),
    });

    await expect(
      isConsentRevocationGenerationCurrent(
        db,
        '550e8400-e29b-41d4-a716-446655440000',
        new Date('2026-01-10T10:00:00.000Z'),
      ),
    ).resolves.toBe(false);
  });

  it('returns false when the latest GDPR consent state is no longer withdrawn', async () => {
    const db = createMockDb({
      findFirstResult: mockConsentRow({
        status: 'CONSENTED',
        respondedAt: new Date('2026-01-12T10:00:00.000Z'),
      }),
    });

    await expect(
      isConsentRevocationGenerationCurrent(
        db,
        '550e8400-e29b-41d4-a716-446655440000',
        new Date('2026-01-10T10:00:00.000Z'),
      ),
    ).resolves.toBe(false);
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
      'GDPR',
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
      'COPPA',
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
      'GDPR',
    );

    const onConflictArgs = (db.insert as jest.Mock).mock.results[0]!.value
      .values.mock.results[0]!.value.onConflictDoUpdate.mock.calls[0]![0];

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
      PARENT_ID,
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
      'FK violation: parent profile does not exist',
    );
    const db = createMockDb({ transactionError });

    await expect(
      createGrantedConsentState(db, CHILD_ID, 'GDPR', PARENT_ID),
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
      createGrantedConsentState(db, CHILD_ID, 'GDPR', PARENT_ID),
    ).rejects.toThrow('Insert into consentStates did not return a row');
  });
});

// ---------------------------------------------------------------------------
// processConsentResponse — token expiry (DS-020 regression)
// ---------------------------------------------------------------------------

describe('processConsentResponse — token expiry', () => {
  it('[DS-020 RED→GREEN] rejects a token whose expiresAt is in the past', async () => {
    const expiredRow = mockConsentRow({
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    });
    const db = createMockDb({ findFirstResult: expiredRow });

    await expect(
      processConsentResponse(db, 'expired-token', true),
    ).rejects.toThrow(ConsentTokenExpiredError);
  });

  it('[DS-020] accepts a token whose expiresAt is in the future', async () => {
    const freshRow = mockConsentRow({
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const db = createMockDb({ findFirstResult: freshRow });
    const result = await processConsentResponse(db, 'fresh-token', true);

    expect(result.status).toBe('CONSENTED');
  });
});

describe('getChildNameByToken — disclosure gate [WI-144]', () => {
  it('returns the child name for a valid unresponded token', async () => {
    const db = createMockDb({
      findFirstResult: mockConsentRow({
        consentToken: 'valid-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        respondedAt: null,
      }),
    });

    await expect(getChildNameByToken(db, 'valid-token')).resolves.toBe(
      'Test Child',
    );
  });

  it('[WI-144] returns null for an expired token so the consent page cannot disclose the child name', async () => {
    const db = createMockDb({
      findFirstResult: mockConsentRow({
        consentToken: 'expired-token',
        expiresAt: new Date(Date.now() - 1000),
        respondedAt: null,
      }),
    });

    await expect(getChildNameByToken(db, 'expired-token')).resolves.toBeNull();
  });

  it('[WI-144] returns null for an already-responded token so used links cannot disclose the child name', async () => {
    const db = createMockDb({
      findFirstResult: mockConsentRow({
        consentToken: 'used-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        respondedAt: new Date(),
      }),
    });

    await expect(getChildNameByToken(db, 'used-token')).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// refreshConsentToken (DS-020 fix)
// ---------------------------------------------------------------------------

describe('refreshConsentToken', () => {
  const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('[DS-020] updates consentToken and expiresAt in the DB', async () => {
    const existingRow = mockConsentRow();
    // updateReturning will resolve with the existing row but we only need
    // the update chain to be called — the function returns the NEW token
    // (generated inline), not the row token.
    const db = createMockDb({ findFirstResult: existingRow });

    const newToken = await refreshConsentToken(db, PROFILE_ID);

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(typeof newToken).toBe('string');
    expect(newToken.length).toBeGreaterThan(0);
  });

  it('[DS-020] returned token differs from any prior stale token', async () => {
    const staleToken = 'stale-token-from-7-days-ago';
    const existingRow = mockConsentRow({ consentToken: staleToken });
    const db = createMockDb({ findFirstResult: existingRow });

    const newToken = await refreshConsentToken(db, PROFILE_ID);

    // The function generates a fresh UUID — it will virtually never equal
    // the static stale value.
    expect(newToken).not.toBe(staleToken);
  });

  it('[DS-020] sets expiresAt at least 14 days into the future (covers day-14 reminder window)', async () => {
    const existingRow = mockConsentRow();
    const db = createMockDb({ findFirstResult: existingRow });

    const before = Date.now();
    await refreshConsentToken(db, PROFILE_ID);
    const after = Date.now();

    // Inspect what was passed to db.update().set(...)
    const setCall = (db.update as jest.Mock).mock.results[0]!.value
      .set as jest.Mock;
    const setArgs = setCall.mock.calls[0]![0] as {
      expiresAt: Date;
      consentToken: string;
    };

    expect(setArgs.expiresAt).toBeInstanceOf(Date);
    // Must expire at least 14 days from now (so a parent clicking the day-14 link is in time)
    const minExpiry = new Date(before + 14 * 24 * 60 * 60 * 1000);
    const maxExpiry = new Date(after + 30 * 24 * 60 * 60 * 1000);
    expect(setArgs.expiresAt.getTime()).toBeGreaterThanOrEqual(
      minExpiry.getTime(),
    );
    expect(setArgs.expiresAt.getTime()).toBeLessThanOrEqual(
      maxExpiry.getTime(),
    );
  });

  /**
   * BREAK TEST [WI-82]: refreshConsentToken must throw ConsentRecordNotFoundError
   * when no GDPR row exists for the profile. Previously the function returned
   * the new token silently even though the UPDATE matched zero rows — the token
   * was never persisted, so the reminder email would embed a dead link.
   *
   * RED: without `if (updated.length === 0) throw new ConsentRecordNotFoundError()`
   *   the call would resolve with a token string instead of rejecting.
   * GREEN: with the guard the call rejects with ConsentRecordNotFoundError.
   */
  it('[WI-82] throws ConsentRecordNotFoundError when no GDPR row exists (returning is empty)', async () => {
    // createMockDb with no findFirstResult → updateReturning resolves []
    const db = createMockDb({ findFirstResult: undefined });

    await expect(refreshConsentToken(db, PROFILE_ID)).rejects.toThrow(
      ConsentRecordNotFoundError,
    );
  });
});

describe('refreshConsentTokenForRequest', () => {
  const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440000';
  const requestedAt = new Date('2026-05-01T00:00:00.000Z');
  const requestedAtUpperBound = new Date('2026-05-01T00:00:00.001Z');

  it('[WI-84 review] scopes token refresh to the original requestedAt generation', async () => {
    const db = createMockDb({
      findFirstResult: mockConsentRow({ parentEmail: 'parent@example.com' }),
    });

    const result = await refreshConsentTokenForRequest(db, {
      profileId: PROFILE_ID,
      requestedAt,
      requestedAtUpperBound,
    });

    expect(result?.parentEmail).toBe('parent@example.com');
    expect(result?.freshToken).toEqual(expect.any(String));

    const updateChain = (db.update as jest.Mock).mock.results[0]!.value;
    const whereArg =
      updateChain.set.mock.results[0]!.value.where.mock.calls[0]![0];
    const whereText = extractSqlTextAndValues(whereArg).join(' ');
    expect(whereText).toContain(PROFILE_ID.toLowerCase());
    expect(whereText).toContain('gdpr');
    expect(whereText).toContain('requested_at');
    expect(whereText).toContain('2026-05-01t00:00:00.000z');
    expect(whereText).toContain('2026-05-01t00:00:00.001z');
    expect(whereText).toContain('status');
    expect(whereText).toContain('parent_email');
  });

  it('[WI-84 review] returns null when the generation-bound update matches no row', async () => {
    const db = createMockDb({ findFirstResult: undefined });

    await expect(
      refreshConsentTokenForRequest(db, {
        profileId: PROFILE_ID,
        requestedAt,
        requestedAtUpperBound,
      }),
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// revokeConsent — nudge-suppression branch
// ---------------------------------------------------------------------------

interface RevokeConsentMockOptions {
  /** Pass null to simulate a missing family link (triggers auth error). */
  familyLink?: Record<string, unknown> | null;
  consentRow?: ReturnType<typeof mockConsentRow>;
  transactionError?: Error;
}

function createRevokeConsentMockDb({
  familyLink = { id: 'link-1' } as Record<string, unknown> | null,
  consentRow = undefined as ReturnType<typeof mockConsentRow> | undefined,
  transactionError = undefined as Error | undefined,
}: RevokeConsentMockOptions = {}): {
  db: Database;
  txUpdate: jest.Mock;
} {
  const txUpdateReturning = jest
    .fn()
    .mockResolvedValue(consentRow ? [consentRow] : []);
  const txUpdateWhere = jest
    .fn()
    .mockReturnValue({ returning: txUpdateReturning });
  const txUpdateSet = jest.fn().mockReturnValue({ where: txUpdateWhere });
  const txUpdate = jest.fn().mockReturnValue({ set: txUpdateSet });

  const transactionFn = transactionError
    ? jest.fn().mockRejectedValue(transactionError)
    : jest
        .fn()
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) => {
            const tx = { update: txUpdate };
            return callback(tx);
          },
        );

  const db = {
    query: {
      familyLinks: {
        // null bypasses the default-parameter fallback that undefined triggers.
        // mockResolvedValue(null ?? undefined) = mockResolvedValue(undefined),
        // which makes !link truthy and fires the auth guard.
        findFirst: jest.fn().mockResolvedValue(familyLink ?? undefined),
      },
      consentStates: {
        findFirst: jest.fn().mockResolvedValue(consentRow),
      },
    },
    transaction: transactionFn,
    update: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  } as unknown as Database;

  return { db, txUpdate };
}

describe('revokeConsent — nudge-suppression branch', () => {
  const CHILD_ID = '550e8400-e29b-41d4-a716-000000000001';
  const PARENT_ID = '550e8400-e29b-41d4-a716-000000000002';

  it('[nudge-suppression] wraps consent update AND nudges update in a single db.transaction call', async () => {
    const consentRow = mockConsentRow({
      status: 'CONSENTED',
      profileId: CHILD_ID,
    });
    const { db, txUpdate } = createRevokeConsentMockDb({ consentRow });

    await revokeConsent(db, CHILD_ID, PARENT_ID);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(txUpdate).toHaveBeenCalledTimes(2);
  });

  it('[nudge-suppression] calls tx.update for two distinct tables inside the transaction', async () => {
    const consentRow = mockConsentRow({
      status: 'CONSENTED',
      profileId: CHILD_ID,
    });
    const { db, txUpdate } = createRevokeConsentMockDb({ consentRow });

    await revokeConsent(db, CHILD_ID, PARENT_ID);

    const firstCallArg = txUpdate.mock.calls[0]?.[0];
    const secondCallArg = txUpdate.mock.calls[1]?.[0];
    expect(firstCallArg).toBeDefined();
    expect(secondCallArg).toBeDefined();
    expect(firstCallArg).not.toBe(secondCallArg);
  });

  it('[nudge-suppression] skips the transaction entirely when existing status is already WITHDRAWN', async () => {
    const withdrawnRow = mockConsentRow({
      status: 'WITHDRAWN',
      profileId: CHILD_ID,
    });
    const { db } = createRevokeConsentMockDb({ consentRow: withdrawnRow });

    const result = await revokeConsent(db, CHILD_ID, PARENT_ID);

    expect(result.status).toBe('WITHDRAWN');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('[nudge-suppression] throws ConsentNotAuthorizedError when no family link exists', async () => {
    const consentRow = mockConsentRow({
      status: 'CONSENTED',
      profileId: CHILD_ID,
    });
    const { db } = createRevokeConsentMockDb({ familyLink: null, consentRow });

    await expect(revokeConsent(db, CHILD_ID, PARENT_ID)).rejects.toThrow(
      'Not authorized to revoke consent for this profile',
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('[nudge-suppression] propagates transaction failure so no partial write is silently swallowed', async () => {
    const consentRow = mockConsentRow({
      status: 'CONSENTED',
      profileId: CHILD_ID,
    });
    const transactionError = new Error('simulated DB rollback');
    const { db } = createRevokeConsentMockDb({ consentRow, transactionError });

    await expect(revokeConsent(db, CHILD_ID, PARENT_ID)).rejects.toThrow(
      'simulated DB rollback',
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// WI-297 — calculateAgeFromParts (exact age from full birth date)
// ---------------------------------------------------------------------------

describe('calculateAgeFromParts', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns exact age when birthday has already passed this year', () => {
    // Born 2010-01-01; today is 2026-06-15 → exact age 16
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    expect(calculateAgeFromParts(2010, 1, 1)).toBe(16);
  });

  it('returns one less than year-only age when birthday is still to come this year', () => {
    // Born 2015-12-31; today is 2026-05-24 → birthday not yet reached → exact age 10
    // Year-only would give 2026 - 2015 = 11
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    expect(calculateAgeFromParts(2015, 12, 31)).toBe(10);
  });

  it('[boundary] born exactly on today → counts as birthday reached, age = year-diff', () => {
    // Born 2013-05-24; today is 2026-05-24 → exact age 13
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    expect(calculateAgeFromParts(2013, 5, 24)).toBe(13);
  });

  it('falls back to year-only calculation when month and day are not provided', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    expect(calculateAgeFromParts(2013)).toBe(2026 - 2013);
  });
});

// ---------------------------------------------------------------------------
// WI-297 — checkConsentRequiredFromDate (exact consent check)
// ---------------------------------------------------------------------------

describe('checkConsentRequiredFromDate', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[break-test] child still 12 by exact date (year-only=13) is flagged belowMinimumAge (WI-570)', () => {
    // WI-570: 13+ floor. birthYear = currentYear - 13, but birthday is Dec 31 → exact age still 12.
    // Year-only says 13 (passes Zod), but full-date catches the 12th birthday hasn't arrived yet.
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    const birthYear = 2013; // 2026 - 2013 = 13 by year-only, but birthday Dec 31 → exact 12
    const result = checkConsentRequiredFromDate(birthYear, 12, 31);
    expect(result.belowMinimumAge).toBe(true);
    expect(result.required).toBe(true);
    expect(result.age).toBe(12);
  });

  it('child exactly 13 today (birthday today) is allowed with GDPR required (WI-570)', () => {
    // WI-570: 13+ floor. Exactly 13 on their birthday is the minimum allowed age.
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    const result = checkConsentRequiredFromDate(2013, 5, 24);
    expect(result.belowMinimumAge).toBeUndefined();
    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
    expect(result.age).toBe(13);
  });

  it('child aged 16 with full date is still consent-required', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    const result = checkConsentRequiredFromDate(2010, 1, 1);
    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
    expect(result.age).toBe(16);
  });

  it('adult aged 17 is not consent-required', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    const result = checkConsentRequiredFromDate(2009, 1, 1);
    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('falls back to year-only when month/day not supplied (WI-570: 13+ floor)', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-24T12:00:00.000Z'));
    // year-only: 2026 - 2013 = 13 → belowMinimumAge is NOT set (age >= MINIMUM_AGE=13)
    const result = checkConsentRequiredFromDate(2013);
    expect(result.belowMinimumAge).toBeUndefined();
    expect(result.required).toBe(true);
    expect(result.age).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// [Bug #871] restoreConsent — 7-day grace period enforcement
// ---------------------------------------------------------------------------

describe('restoreConsent — 7-day grace period [Bug #871]', () => {
  const CHILD_ID = '550e8400-e29b-41d4-a716-000000000001';
  const PARENT_ID = '550e8400-e29b-41d4-a716-000000000002';

  afterEach(() => {
    jest.useRealTimers();
  });

  it('[BREAK] throws ConsentGracePeriodExpiredError when respondedAt is older than 7 days', async () => {
    // Revoked 8 days ago — past the grace period, archive-cleanup may have
    // already hard-deleted child data. Restore must be refused.
    const revokedAt = new Date('2026-05-15T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T10:00:01.000Z')); // > 8 days later
    const withdrawnRow = mockConsentRow({
      status: 'WITHDRAWN',
      profileId: CHILD_ID,
      respondedAt: revokedAt,
    });
    const { db } = createRevokeConsentMockDb({ consentRow: withdrawnRow });

    await expect(restoreConsent(db, CHILD_ID, PARENT_ID)).rejects.toThrow(
      ConsentGracePeriodExpiredError,
    );
    // The flip + archivedAt clear must NOT have occurred.
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('allows restore when respondedAt is within the 7-day grace period', async () => {
    // Revoked 3 days ago — well inside grace period.
    const revokedAt = new Date('2026-05-20T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T10:00:00.000Z'));
    const withdrawnRow = mockConsentRow({
      status: 'WITHDRAWN',
      profileId: CHILD_ID,
      respondedAt: revokedAt,
    });
    const consentedAfterRestore = mockConsentRow({
      status: 'CONSENTED',
      profileId: CHILD_ID,
    });
    // tx.update().set().where().returning() should return the post-restore row.
    const { db } = createRevokeConsentMockDb({
      consentRow: withdrawnRow,
    });
    // Override the tx update returning to yield the restored row.
    (db.transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([consentedAfterRestore]),
              }),
            }),
          }),
        };
        return callback(tx);
      },
    );

    const result = await restoreConsent(db, CHILD_ID, PARENT_ID);
    expect(result.status).toBe('CONSENTED');
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('exposes RESTORE_CONSENT_GRACE_PERIOD_MS as the documented 7 days', () => {
    expect(RESTORE_CONSENT_GRACE_PERIOD_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// [Bug #872] Consent audit metadata persistence
// ---------------------------------------------------------------------------

describe('consent audit metadata [Bug #872]', () => {
  it('persists policy_version / request_ip / user_agent on requestConsent', async () => {
    const insertedRow = mockConsentRow({
      status: 'PARENTAL_CONSENT_REQUESTED',
    });
    const db = createMockDb({ insertReturning: [insertedRow] });
    const valuesSpy = jest.fn().mockReturnValue({
      onConflictDoUpdate: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([insertedRow]),
      }),
    });
    (db.insert as jest.Mock).mockReturnValue({ values: valuesSpy });

    await requestConsent(
      db,
      {
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      },
      'https://api.example.com',
      EMAIL_OPTIONS,
      undefined,
      {
        policyVersion: '2026-05-31',
        requestIp: '203.0.113.42',
        userAgent: 'Mozilla/5.0 audit-test',
      },
    );

    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policyVersion: '2026-05-31',
        requestIp: '203.0.113.42',
        userAgent: 'Mozilla/5.0 audit-test',
      }),
    );
  });

  it('persists audit metadata on processConsentResponse approval update', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });
    const setSpy = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([row]),
      }),
    });
    (db.update as jest.Mock).mockReturnValue({ set: setSpy });

    await processConsentResponse(db, 'valid-token', true, {
      policyVersion: '2026-05-31',
      requestIp: '198.51.100.7',
      userAgent: 'consent-test-ua',
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policyVersion: '2026-05-31',
        requestIp: '198.51.100.7',
        userAgent: 'consent-test-ua',
      }),
    );
  });

  it('omits audit fields when called without metadata (back-compat)', async () => {
    const row = mockConsentRow();
    const db = createMockDb({ findFirstResult: row });
    const setSpy = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([row]),
      }),
    });
    (db.update as jest.Mock).mockReturnValue({ set: setSpy });

    await processConsentResponse(db, 'valid-token', true);

    const call = setSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toBeDefined();
    expect(call).not.toHaveProperty('policyVersion');
    expect(call).not.toHaveProperty('requestIp');
    expect(call).not.toHaveProperty('userAgent');
  });
});

// ---------------------------------------------------------------------------
// F-048 regression: rollback failure logging in resendConsent (errors-api F-048)
// ---------------------------------------------------------------------------

describe('resendConsent — rollback failure logging (errors-api F-048)', () => {
  const CHILD_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('logs a warn when the rollback update throws (missing storedEmail path)', async () => {
    // Arrange: simulate a row that passes the DB filter but has null parentEmail
    // (data inconsistency edge case that reaches the rollback branch).
    //
    // resendConsent calls db.update() twice in this path:
    //   Call 1 — counter increment: .set().where().returning() → must return [nullEmailRow]
    //   Call 2 — rollback: .set().where() awaited directly (no .returning())
    //
    // The test validates that a throw inside the rollback is caught and logged,
    // and that ConsentRequestNotFoundError is still thrown (best-effort rollback).
    //
    // NOTE: mockConsentRow uses `?? 'parent@example.com'` so passing `null`
    // would be coalesced to the default. Spread and override explicitly instead.
    const rowWithNullEmail = { ...mockConsentRow(), parentEmail: null as null };
    const rollbackError = new Error('DB rollback failed');

    // Build the returning-stub for call 1 as a standalone function so it can
    // be confirmed independent of the chain depth.
    const returningStub = jest.fn().mockResolvedValue([rowWithNullEmail]);
    const whereStubCall1 = jest
      .fn()
      .mockReturnValue({ returning: returningStub });
    const setStubCall1 = jest.fn().mockReturnValue({ where: whereStubCall1 });

    // Build the rollback-stub for call 2: .where() itself rejects —
    // the code awaits .set().where() without a further .returning() call.
    const whereStubCall2 = jest.fn().mockRejectedValue(rollbackError);
    const setStubCall2 = jest.fn().mockReturnValue({ where: whereStubCall2 });

    let updateCallCount = 0;
    const db = {
      query: {
        consentStates: {
          findFirst: jest.fn().mockResolvedValue(rowWithNullEmail),
        },
        profiles: {
          findFirst: jest.fn().mockResolvedValue({ displayName: 'Test Child' }),
        },
      },
      insert: jest.fn(),
      transaction: jest.fn(),
      delete: jest.fn(),
      update: jest.fn().mockImplementation(() => {
        updateCallCount++;
        return updateCallCount === 1
          ? { set: setStubCall1 }
          : { set: setStubCall2 };
      }),
    } as unknown as Database;

    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      await expect(
        resendConsent(
          db,
          { childProfileId: CHILD_ID, consentType: 'GDPR' },
          'https://api.mentomate.com',
          EMAIL_OPTIONS,
        ),
      ).rejects.toThrow(ConsentRequestNotFoundError);

      // The catch block must log the rollback failure — previously it was silent
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[consent] Failed to rollback resend counter'),
      );
      const loggedEntry = JSON.parse(
        warnSpy.mock.calls.find((call) =>
          (call[0] as string).includes(
            '[consent] Failed to rollback resend counter',
          ),
        )?.[0] as string,
      ) as { context: { error: string } };
      expect(loggedEntry.context.error).toContain('DB rollback failed');
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// getLatestGdprConsentByProfile + isGdprProcessingAllowedBatch — WI-489
// ---------------------------------------------------------------------------
function makeBatchRow(
  profileId: string,
  status: 'CONSENTED' | 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'WITHDRAWN',
  requestedAt: Date = NOW,
  respondedAt: Date | null = null,
) {
  return { profileId, status, requestedAt, respondedAt };
}

function makeBatchDb(rows: ReturnType<typeof makeBatchRow>[]): Database {
  return {
    query: {
      consentStates: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    },
  } as unknown as Database;
}

describe('getLatestGdprConsentByProfile', () => {
  it('returns empty map for empty profileIds list', async () => {
    const db = makeBatchDb([]);
    const result = await getLatestGdprConsentByProfile(db, []);
    expect(result.size).toBe(0);
  });

  it('OMITS profiles with no consent row (behaviour-preserving: → consentStatus null)', async () => {
    // The original dashboard code only put profiles WITH a GDPR row into the
    // map; a pre-consent-flow child therefore reported consentStatus: null.
    // getLatestGdprConsentByProfile must NOT pre-populate no-row profiles.
    const db = makeBatchDb([]);
    const result = await getLatestGdprConsentByProfile(db, ['p-missing']);
    expect(result.has('p-missing')).toBe(false);
    expect(result.get('p-missing')).toBeUndefined();
  });

  it('preserves the real respondedAt for a CONSENTED profile (not nulled)', async () => {
    const consentedAt = new Date('2025-03-01T08:00:00.000Z');
    const db = makeBatchDb([
      makeBatchRow('p1', 'CONSENTED', NOW, consentedAt),
    ]);
    const result = await getLatestGdprConsentByProfile(db, ['p1']);
    expect(result.get('p1')).toEqual({
      status: 'CONSENTED',
      respondedAt: consentedAt,
    });
  });

  it('preserves the real respondedAt for a WITHDRAWN profile (grace-period countdown)', async () => {
    const withdrawnAt = new Date('2025-06-10T12:00:00.000Z');
    const db = makeBatchDb([
      makeBatchRow('p1', 'WITHDRAWN', NOW, withdrawnAt),
    ]);
    const result = await getLatestGdprConsentByProfile(db, ['p1']);
    expect(result.get('p1')).toEqual({
      status: 'WITHDRAWN',
      respondedAt: withdrawnAt,
    });
  });

  it('normalises an undefined respondedAt to null', async () => {
    const db = makeBatchDb([makeBatchRow('p1', 'CONSENTED', NOW, null)]);
    const result = await getLatestGdprConsentByProfile(db, ['p1']);
    expect(result.get('p1')).toEqual({ status: 'CONSENTED', respondedAt: null });
  });

  it('keeps only the latest (first) row per profileId — mirrors BUG-394 ordering', async () => {
    const older = makeBatchRow(
      'p1',
      'CONSENTED',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-01-01T00:00:00Z'),
    );
    const newer = makeBatchRow(
      'p1',
      'WITHDRAWN',
      new Date('2025-06-01T00:00:00Z'),
      new Date('2025-06-01T00:00:00Z'),
    );
    // findMany returns newest-first (as the real ordered query would).
    const db = makeBatchDb([newer, older]);
    const result = await getLatestGdprConsentByProfile(db, ['p1']);
    expect(result.get('p1')?.status).toBe('WITHDRAWN');
    expect(result.get('p1')?.respondedAt).toEqual(
      new Date('2025-06-01T00:00:00Z'),
    );
  });

  it('returns only the profiles that have rows in a mixed batch', async () => {
    const db = makeBatchDb([
      makeBatchRow('p1', 'CONSENTED'),
      makeBatchRow('p2', 'WITHDRAWN'),
    ]);
    const result = await getLatestGdprConsentByProfile(db, ['p1', 'p2', 'p3']);
    expect(result.has('p1')).toBe(true);
    expect(result.has('p2')).toBe(true);
    expect(result.has('p3')).toBe(false);
  });
});

describe('isGdprProcessingAllowedBatch', () => {
  it('returns empty map for empty profileIds list', async () => {
    const db = makeBatchDb([]);
    const result = await isGdprProcessingAllowedBatch(db, []);
    expect(result.size).toBe(0);
  });

  it('allows profile with CONSENTED row', async () => {
    const db = makeBatchDb([makeBatchRow('p1', 'CONSENTED')]);
    const result = await isGdprProcessingAllowedBatch(db, ['p1']);
    expect(result.get('p1')).toBe(true);
  });

  it('blocks profile with WITHDRAWN row', async () => {
    const db = makeBatchDb([makeBatchRow('p1', 'WITHDRAWN')]);
    const result = await isGdprProcessingAllowedBatch(db, ['p1']);
    expect(result.get('p1')).toBe(false);
  });

  it('blocks profile with PENDING row', async () => {
    const db = makeBatchDb([makeBatchRow('p1', 'PENDING')]);
    const result = await isGdprProcessingAllowedBatch(db, ['p1']);
    expect(result.get('p1')).toBe(false);
  });

  it('blocks profile with PARENTAL_CONSENT_REQUESTED row', async () => {
    const db = makeBatchDb([makeBatchRow('p1', 'PARENTAL_CONSENT_REQUESTED')]);
    const result = await isGdprProcessingAllowedBatch(db, ['p1']);
    expect(result.get('p1')).toBe(false);
  });

  it('allows profile with no consent row (implicitly allowed)', async () => {
    const db = makeBatchDb([]);
    const result = await isGdprProcessingAllowedBatch(db, ['p-missing']);
    expect(result.get('p-missing')).toBe(true);
  });

  it('handles mixed allowed and blocked profileIds correctly', async () => {
    // p1: CONSENTED → allowed
    // p2: WITHDRAWN → blocked
    // p3: no row → implicitly allowed
    // p4: PENDING → blocked
    const db = makeBatchDb([
      makeBatchRow('p1', 'CONSENTED'),
      makeBatchRow('p2', 'WITHDRAWN'),
      makeBatchRow('p4', 'PENDING'),
    ]);
    const result = await isGdprProcessingAllowedBatch(db, ['p1', 'p2', 'p3', 'p4']);
    expect(result.get('p1')).toBe(true);
    expect(result.get('p2')).toBe(false);
    expect(result.get('p3')).toBe(true);
    expect(result.get('p4')).toBe(false);
  });

  it('uses first-row-wins dedup (latest row per profileId, mirroring BUG-394 ordering)', async () => {
    // Simulate two rows for the same profile: findMany already ordered by
    // desc(requestedAt), desc(id) — helper must keep only the first row.
    const older = makeBatchRow('p1', 'CONSENTED', new Date('2025-01-01T00:00:00Z'));
    const newer = makeBatchRow('p1', 'WITHDRAWN', new Date('2025-06-01T00:00:00Z'));
    // findMany returns them ordered newest-first (as the real DB would).
    const db = makeBatchDb([newer, older]);
    const result = await isGdprProcessingAllowedBatch(db, ['p1']);
    // The newer WITHDRAWN row wins → blocked.
    expect(result.get('p1')).toBe(false);
  });
});
