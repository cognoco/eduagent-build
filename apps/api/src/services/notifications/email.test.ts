import {
  formatConsentApprovedEmail,
  formatPaymentFailedEmail,
  registerEmailTransportForTesting,
  sendEmail,
  type EmailPayload,
} from './email';

const PARENT = 'parent@example.com';
const CHILD = 'Mira';
const WITHDRAWAL_URL =
  'https://api.mentomate.com/v1/consent-page/withdraw?token=cw1abc.def';

describe('formatConsentApprovedEmail', () => {
  it('addresses the parent and tags the message type', () => {
    const formatted = formatConsentApprovedEmail(PARENT, CHILD, WITHDRAWAL_URL);
    expect(formatted.to).toBe(PARENT);
    expect(formatted.type).toBe('consent_approved');
  });

  it('names the child in the subject', () => {
    const formatted = formatConsentApprovedEmail(PARENT, CHILD, WITHDRAWAL_URL);
    expect(formatted.subject).toContain(CHILD);
  });

  it('confirms the approval and carries the withdrawal link as the durable home', () => {
    const formatted = formatConsentApprovedEmail(PARENT, CHILD, WITHDRAWAL_URL);
    expect(formatted.body).toContain(CHILD);
    expect(formatted.body).toContain(WITHDRAWAL_URL);
    // It must read as a confirmation + withdrawal affordance, not a request.
    expect(formatted.body.toLowerCase()).toContain('withdraw');
  });
});

describe('formatPaymentFailedEmail', () => {
  it('uses the dedicated payment_failed type and actionable manage-billing link', () => {
    const formatted = formatPaymentFailedEmail(
      PARENT,
      'mentomate://billing/manage?payerPersonId=payer-1',
    );

    expect(formatted).toMatchObject({
      to: PARENT,
      type: 'payment_failed',
      subject: 'Action needed: update your MentoMate payment',
    });
    expect(formatted.body).toContain(
      'mentomate://billing/manage?payerPersonId=payer-1',
    );
  });
});

const payload: EmailPayload = {
  to: 'parent@example.com',
  subject: 'Consent request',
  body: 'Deterministic body',
  type: 'consent_request',
};

describe('sendEmail transport boundary', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    jest.restoreAllMocks();
  });

  it('preserves the no-key production fallback without a registered transport', async () => {
    await expect(sendEmail(payload)).resolves.toEqual({
      sent: false,
      reason: 'no_api_key',
    });
  });

  it('[WI-1864] lets the hosted-Maestro entrypoint supply a no-network receipt', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    dispose = registerEmailTransportForTesting(async () => ({
      sent: true,
      messageId: 'maestro-e2e-email',
    }));

    await expect(sendEmail(payload)).resolves.toEqual({
      sent: true,
      messageId: 'maestro-e2e-email',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
