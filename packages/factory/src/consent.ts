import type { ConsentRequest, ConsentResponse } from '@eduagent/schemas';
import { randomUUID } from 'crypto';

let counter = 0;

export function buildConsentRequest(
  overrides?: Partial<ConsentRequest>
): ConsentRequest {
  counter++;
  return {
    childProfileId: randomUUID(),
    parentEmail: `parent${counter}@example.com`,
    consentType: 'GDPR',
    ...overrides,
  };
}

export function buildConsentResponse(
  overrides?: Partial<ConsentResponse>
): ConsentResponse {
  return {
    token: `consent-token-${randomUUID()}`,
    approved: true,
    ...overrides,
  };
}

/** Reset the internal counter — useful in test `beforeEach` blocks. */
export function resetConsentCounter(): void {
  counter = 0;
}
