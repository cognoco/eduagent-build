// ---------------------------------------------------------------------------
// account-reclaim-attempt — Tests [BUG-784]
//
// The account service already blocks email-reuse reclaim attempts and emits
// app/account.reclaim_attempt. This pins the missing downstream workflow:
// consume that event, look up the original account by existingClerkUserId, and
// email the verified account owner with support-driven recovery instructions.
// ---------------------------------------------------------------------------

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';

const mockInngestTransport = createInngestTransportCapture();
jest.mock(
  // gc1-allow: Inngest framework boundary — real client cannot register in unit tests
  '../client',
  () => {
    const actual = jest.requireActual(
      '../client',
    ) as typeof import('../client');
    return { ...actual, ...mockInngestTransport.module };
  },
);

// [WI-1254] findAccountByClerkId now reads the v2 identity graph
// (login→membership→organization via resolveIdentityV2) rather than the
// legacy `accounts` table.
const mockLoginFindFirst = jest.fn();
const mockMembershipFindMany = jest.fn();
const mockOrganizationFindFirst = jest.fn();
const mockDb = {
  query: {
    login: {
      findFirst: mockLoginFindFirst,
    },
    membership: {
      findMany: mockMembershipFindMany,
    },
    organization: {
      findFirst: mockOrganizationFindFirst,
    },
  },
};

jest.mock(
  // gc1-allow: Inngest helpers boundary — real DATABASE_URL not available in unit tests
  '../helpers',
  () => {
    const actual = jest.requireActual(
      '../helpers',
    ) as typeof import('../helpers');
    return {
      ...actual,
      getStepDatabase: jest.fn(() => mockDb),
      getStepResendApiKey: jest.fn(() => process.env['RESEND_API_KEY']),
      getStepEmailFrom: jest.fn(() => process.env['EMAIL_FROM']),
      getStepSupportEmail: jest.fn(
        () => process.env['SUPPORT_EMAIL'] ?? 'support@mentomate.com',
      ),
    };
  },
);

import { accountReclaimAttempt } from './account-reclaim-attempt';
import { formatAccountReclaimAttemptEmail } from '../../services/notifications';

const RESEND_API_URL = 'https://api.resend.com/emails';

type ReclaimEventData = {
  incomingClerkUserId: string;
  existingClerkUserId: string;
  emailHash: string;
  timestamp: string;
};

function reclaimEvent(
  overrides: Partial<ReclaimEventData> = {},
): ReclaimEventData {
  return {
    incomingClerkUserId: overrides.incomingClerkUserId ?? 'clerk-new',
    existingClerkUserId: overrides.existingClerkUserId ?? 'clerk-existing',
    emailHash: overrides.emailHash ?? 'a'.repeat(64),
    timestamp: overrides.timestamp ?? '2026-06-29T10:00:00.000Z',
  };
}

async function executeHandler(eventData: unknown, eventId = 'evt-reclaim-1') {
  const { step } = createInngestStepRunner();
  const handler = (
    accountReclaimAttempt as unknown as {
      fn: (a: unknown) => Promise<unknown>;
    }
  ).fn;
  return handler({ event: { id: eventId, data: eventData }, step });
}

function lastResendBody(): {
  to: string[];
  subject: string;
  text: string;
  from: string;
} {
  const fetchMock = globalThis.fetch as jest.Mock;
  const call = fetchMock.mock.calls.find(([url]) => url === RESEND_API_URL);
  if (!call) throw new Error('Resend fetch was not called');
  return JSON.parse((call[1] as { body: string }).body);
}

describe('accountReclaimAttempt Inngest function [BUG-784]', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalResendApiKey: string | undefined;
  let originalEmailFrom: string | undefined;
  let originalSupportEmail: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    originalFetch = globalThis.fetch;
    originalResendApiKey = process.env['RESEND_API_KEY'];
    originalEmailFrom = process.env['EMAIL_FROM'];
    originalSupportEmail = process.env['SUPPORT_EMAIL'];
    process.env['RESEND_API_KEY'] = 'test-resend-key';
    process.env['EMAIL_FROM'] = 'noreply@test.com';
    process.env['SUPPORT_EMAIL'] = 'help@test.com';
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'resend-msg-1' }), { status: 200 }),
      );
    mockLoginFindFirst.mockResolvedValue({
      clerkUserId: 'clerk-existing',
      personId: 'person-existing',
      email: 'owner@example.com',
    });
    mockMembershipFindMany.mockResolvedValue([
      {
        personId: 'person-existing',
        organizationId: 'acc-existing',
        roles: ['admin'],
      },
    ]);
    mockOrganizationFindFirst.mockResolvedValue({
      id: 'acc-existing',
      timezone: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalResendApiKey !== undefined) {
      process.env['RESEND_API_KEY'] = originalResendApiKey;
    } else {
      delete process.env['RESEND_API_KEY'];
    }
    if (originalEmailFrom !== undefined) {
      process.env['EMAIL_FROM'] = originalEmailFrom;
    } else {
      delete process.env['EMAIL_FROM'];
    }
    if (originalSupportEmail !== undefined) {
      process.env['SUPPORT_EMAIL'] = originalSupportEmail;
    } else {
      delete process.env['SUPPORT_EMAIL'];
    }
  });

  it('triggers on app/account.reclaim_attempt with retries: 2', () => {
    expect((accountReclaimAttempt as any).trigger).toEqual({
      event: 'app/account.reclaim_attempt',
    });
    expect((accountReclaimAttempt as any).opts).toMatchObject({
      id: 'account-reclaim-attempt',
      retries: 2,
    });
  });

  it('sends recovery instructions to the existing account email owner', async () => {
    const result = await executeHandler(reclaimEvent(), 'evt-reclaim-123');

    expect(result).toMatchObject({
      status: 'sent',
      accountId: 'acc-existing',
    });
    expect(mockLoginFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
      }),
    );
    const body = lastResendBody();
    expect(body.to).toEqual(['owner@example.com']);
    expect(body.subject).toMatch(/MentoMate account recovery/i);
    expect(body.text).toMatch(/help@test\.com/);
    expect(body.text).toMatch(/someone tried to sign in/i);
    expect(body.from).toBe('noreply@test.com');

    const fetchMock = globalThis.fetch as jest.Mock;
    const call = fetchMock.mock.calls.find(([url]) => url === RESEND_API_URL);
    const headers = (call?.[1] as { headers: Record<string, string> }).headers;
    expect(headers['Idempotency-Key']).toEqual(
      expect.stringContaining('evt-reclaim-123'),
    );
  });

  it('returns skipped and sends no email when the existing account is gone', async () => {
    mockLoginFindFirst.mockResolvedValueOnce(undefined);

    const result = await executeHandler(reclaimEvent());

    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'account_not_found',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns skipped and sends no email on malformed payload', async () => {
    const result = await executeHandler({
      incomingClerkUserId: 'clerk-new',
      // missing existingClerkUserId/emailHash
    });

    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'invalid_payload',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('degrades without throwing when RESEND_API_KEY is absent', async () => {
    delete process.env['RESEND_API_KEY'];

    const result = await executeHandler(reclaimEvent());

    expect(result).toMatchObject({ status: 'not_sent', reason: 'no_api_key' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws to trigger Inngest retry when Resend returns a non-ok response', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response('Internal Server Error', { status: 500 }),
      );

    await expect(executeHandler(reclaimEvent())).rejects.toThrow(
      /account-reclaim-attempt send failed/,
    );
  });

  it('formatter keeps the recovery path manual and fail-closed', () => {
    const payload = formatAccountReclaimAttemptEmail(
      'owner@example.com',
      'help@test.com',
    );

    expect(payload.to).toBe('owner@example.com');
    expect(payload.type).toBe('account_reclaim');
    expect(payload.body).toMatch(/blocked the sign-in/i);
    expect(payload.body).toMatch(/help@test\.com/);
    expect(payload.body).not.toMatch(/click here/i);
  });
});
