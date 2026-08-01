const mockCaptureException = jest.fn();

jest.mock('../sentry', () => {
  const actual = jest.requireActual('../sentry') as typeof import('../sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

import { sendEmail, type EmailPayload } from './email';

const payload: EmailPayload = {
  to: 'learner@example.com',
  subject: 'Test email',
  body: 'Test body',
  type: 'security_notification',
};

function resendResponse(
  status: number,
  body: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('[WI-2788] Resend delivery policy and retry classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn();
  });

  it('does not send from staging without an exact recipient allowlist', async () => {
    const result = await sendEmail(payload, {
      resendApiKey: 're_test',
      environment: 'staging',
    });

    expect(result).toEqual({
      sent: false,
      retryability: 'none',
      reason: 'non_production_recipient',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('allows one exact normalized non-production recipient', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      resendResponse(200, { id: 'msg-1' }),
    );

    const result = await sendEmail(payload, {
      resendApiKey: 're_test',
      environment: 'staging',
      nonProductionRecipientAllowlist: ['  LEARNER@example.com  '],
    });

    expect(result).toEqual({ sent: true, messageId: 'msg-1' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', 'development', 'preview'])(
    'fails closed for environment %p',
    async (environment) => {
      const result = await sendEmail(payload, {
        resendApiKey: 're_test',
        environment,
      });

      expect(result).toMatchObject({
        sent: false,
        retryability: 'none',
        reason: 'non_production_recipient',
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it('sends from production without an allowlist', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      resendResponse(200, { id: 'msg-production' }),
    );

    const result = await sendEmail(payload, {
      resendApiKey: 're_test',
      environment: 'production',
    });

    expect(result).toEqual({ sent: true, messageId: 'msg-production' });
  });

  it('returns one sanitized permanent failure for a Resend 422', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      resendResponse(422, {
        name: 'invalid_from_address',
        message: 'learner@example.com is invalid',
      }),
    );

    const result = await sendEmail(payload, {
      resendApiKey: 're_test',
      environment: 'production',
    });

    expect(result).toEqual({
      sent: false,
      retryability: 'permanent',
      reason: 'resend_api_error',
      statusCode: 422,
      providerCode: 'invalid_from_address',
    });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const capture = JSON.stringify(mockCaptureException.mock.calls[0]);
    expect(capture).toContain('invalid_from_address');
    expect(capture).not.toContain('learner@example.com is invalid');
    expect(capture).not.toContain(payload.to);
  });

  it.each([
    [429, 'rate_limit_exceeded'],
    [503, 'application_error'],
    [408, 'request_timeout'],
    [409, 'concurrent_idempotent_requests'],
  ])('classifies HTTP %i / %s as transient', async (status, name) => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      resendResponse(status, { name }),
    );

    const result = await sendEmail(payload, {
      resendApiKey: 're_test',
      environment: 'production',
    });

    expect(result).toMatchObject({
      sent: false,
      retryability: 'transient',
      reason: 'resend_api_error',
      statusCode: status,
      providerCode: name,
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('treats a non-concurrent 409 as permanent', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      resendResponse(409, { name: 'invalid_idempotency_key' }),
    );

    const result = await sendEmail(payload, {
      resendApiKey: 're_test',
      environment: 'production',
    });

    expect(result).toMatchObject({
      sent: false,
      retryability: 'permanent',
      providerCode: 'invalid_idempotency_key',
    });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('classifies a network failure as transient', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    const result = await sendEmail(payload, {
      resendApiKey: 're_test',
      environment: 'production',
    });

    expect(result).toEqual({
      sent: false,
      retryability: 'transient',
      reason: 'network_error',
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
