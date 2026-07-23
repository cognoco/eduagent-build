/**
 * [WI-374] Resend must be bound to the consent request, not a client-supplied
 * recipient. The resend wire shape carries NO email so a masked/arbitrary
 * address can never be sent on resend (AC1, AC4). The initial-request /
 * change-recipient shape keeps a required email.
 */
import {
  CONSENT_PURPOSES,
  consentPurposeSchema,
  consentResendSchema,
  consentRequestSchema,
  selfConsentWithdrawRequestSchema,
  selfConsentAcceptResultSchema,
  type ConsentPurpose,
  type ConsentResendRequest,
} from './consent.js';

const CHILD_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('consent purpose contract [WI-2386]', () => {
  it('owns the complete workflow-neutral purpose set in one typed contract', () => {
    expect(CONSENT_PURPOSES).toEqual(['platform_use', 'llm_disclosure']);
    expect(consentPurposeSchema.options).toEqual(CONSENT_PURPOSES);

    const purpose: ConsentPurpose = CONSENT_PURPOSES[1];
    expect(purpose).toBe('llm_disclosure');
  });

  it('reuses the shared purpose schema for adult single-purpose withdrawal', () => {
    for (const purpose of CONSENT_PURPOSES) {
      expect(selfConsentWithdrawRequestSchema.parse({ purpose })).toEqual({
        purpose,
      });
    }
    expect(
      selfConsentWithdrawRequestSchema.safeParse({ purpose: 'analytics' })
        .success,
    ).toBe(false);
  });
});

describe('consentResendSchema [WI-374]', () => {
  it('accepts a childProfileId + consentType with no email', () => {
    const parsed = consentResendSchema.parse({
      childProfileId: CHILD_ID,
      consentType: 'GDPR',
    });
    expect(parsed.childProfileId).toBe(CHILD_ID);
    expect(parsed.consentType).toBe('GDPR');
  });

  it('defaults consentType to GDPR', () => {
    const parsed = consentResendSchema.parse({ childProfileId: CHILD_ID });
    expect(parsed.consentType).toBe('GDPR');
  });

  it('[WI-261 break] rejects any parentEmail key (strict) so masked-email resend is impossible', () => {
    const result = consentResendSchema.safeParse({
      childProfileId: CHILD_ID,
      consentType: 'GDPR',
      parentEmail: 'j***@gmail.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid childProfileId', () => {
    const result = consentResendSchema.safeParse({
      childProfileId: 'not-a-uuid',
      consentType: 'GDPR',
    });
    expect(result.success).toBe(false);
  });

  it('type carries no parentEmail field', () => {
    // Compile-time guard: a ConsentResendRequest with parentEmail must not type-check.
    const req: ConsentResendRequest = {
      childProfileId: CHILD_ID,
      consentType: 'GDPR',
    };
    // @ts-expect-error parentEmail is not part of the resend shape
    req.parentEmail = 'x@y.com';
    expect(req.childProfileId).toBe(CHILD_ID);
  });
});

describe('consentRequestSchema (initial + change-recipient) [WI-374]', () => {
  it('still requires parentEmail', () => {
    const result = consentRequestSchema.safeParse({
      childProfileId: CHILD_ID,
      consentType: 'GDPR',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a real parentEmail', () => {
    const parsed = consentRequestSchema.parse({
      childProfileId: CHILD_ID,
      parentEmail: 'parent@example.com',
      consentType: 'GDPR',
    });
    expect(parsed.parentEmail).toBe('parent@example.com');
  });
});

describe('selfConsentAcceptResultSchema [WI-2547]', () => {
  it('parses a first-acceptance result carrying both granular purposes', () => {
    const parsed = selfConsentAcceptResultSchema.parse({
      message: 'Consent recorded.',
      purposesGranted: [...CONSENT_PURPOSES],
      termsVersion: '2026-05-31',
    });
    expect(parsed.purposesGranted).toEqual(['platform_use', 'llm_disclosure']);
    expect(parsed.termsVersion).toBe('2026-05-31');
  });

  it('parses an idempotent replay result — no purposes written, still a result', () => {
    const parsed = selfConsentAcceptResultSchema.parse({
      message: 'Consent recorded.',
      purposesGranted: [],
      termsVersion: '2026-05-31',
    });
    expect(parsed.purposesGranted).toEqual([]);
  });

  it('rejects a purpose outside the canonical set', () => {
    const result = selfConsentAcceptResultSchema.safeParse({
      message: 'Consent recorded.',
      purposesGranted: ['targeted_ads'],
      termsVersion: '2026-05-31',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty termsVersion — the acceptance fact must be versioned', () => {
    const result = selfConsentAcceptResultSchema.safeParse({
      message: 'Consent recorded.',
      purposesGranted: [],
      termsVersion: '',
    });
    expect(result.success).toBe(false);
  });

  // The shared contract encodes its own nonblank invariant rather than relying
  // on the route to have trimmed first. A whitespace-only version is as
  // unversioned as an empty one for GDPR Art 5(2)/7(1) purposes, so the schema
  // must reject it on its own.
  it.each([
    ['spaces', '   '],
    ['tab', '\t'],
    ['newline', '\n'],
    ['mixed whitespace', ' \t\n '],
  ])(
    'rejects a whitespace-only termsVersion (%s)',
    (_label, termsVersion: string) => {
      const result = selfConsentAcceptResultSchema.safeParse({
        message: 'Consent recorded.',
        purposesGranted: [],
        termsVersion,
      });
      expect(result.success).toBe(false);
    },
  );

  // Output semantics, pinned explicitly rather than left implicit: the nonblank
  // check trims first, so a padded-but-valid version parses AND the parsed
  // value is the trimmed form. Anything reading `termsVersion` off a parsed
  // result therefore never sees surrounding whitespace.
  it('accepts a padded valid termsVersion and yields the trimmed value', () => {
    const parsed = selfConsentAcceptResultSchema.parse({
      message: 'Consent recorded.',
      purposesGranted: [],
      termsVersion: '  2026-05-31\n',
    });
    expect(parsed.termsVersion).toBe('2026-05-31');
  });

  it('leaves an already-trimmed termsVersion byte-identical', () => {
    const parsed = selfConsentAcceptResultSchema.parse({
      message: 'Consent recorded.',
      purposesGranted: [...CONSENT_PURPOSES],
      termsVersion: '2026-05-31',
    });
    expect(parsed.termsVersion).toBe('2026-05-31');
  });
});
