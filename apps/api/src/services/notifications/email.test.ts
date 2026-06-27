import { formatConsentApprovedEmail } from './email';

const PARENT = 'parent@example.com';
const CHILD = 'Mira';
const WITHDRAWAL_URL =
  'https://api.mentomate.com/v1/consent-page/withdraw?token=cw1abc.def';

describe('formatConsentApprovedEmail', () => {
  it('addresses the parent and tags the message type', () => {
    const payload = formatConsentApprovedEmail(PARENT, CHILD, WITHDRAWAL_URL);
    expect(payload.to).toBe(PARENT);
    expect(payload.type).toBe('consent_approved');
  });

  it('names the child in the subject', () => {
    const payload = formatConsentApprovedEmail(PARENT, CHILD, WITHDRAWAL_URL);
    expect(payload.subject).toContain(CHILD);
  });

  it('confirms the approval and carries the withdrawal link as the durable home', () => {
    const payload = formatConsentApprovedEmail(PARENT, CHILD, WITHDRAWAL_URL);
    expect(payload.body).toContain(CHILD);
    expect(payload.body).toContain(WITHDRAWAL_URL);
    // It must read as a confirmation + withdrawal affordance, not a request.
    expect(payload.body.toLowerCase()).toContain('withdraw');
  });
});
