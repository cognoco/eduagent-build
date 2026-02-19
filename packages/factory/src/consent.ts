import type { ConsentRequest, ConsentResponse } from '@eduagent/schemas';
import { uuidv7 } from 'uuidv7';

let counter = 0;

export function buildConsentRequest(
  overrides?: Partial<ConsentRequest>
): ConsentRequest {
  counter++;
  return {
    childProfileId: uuidv7(),
    parentEmail: `parent${counter}@example.com`,
    consentType: 'GDPR',
    ...overrides,
  };
}

export function buildConsentResponse(
  overrides?: Partial<ConsentResponse>
): ConsentResponse {
  return {
    token: `consent-token-${uuidv7()}`,
    approved: true,
    ...overrides,
  };
}

/** Reset the internal counter — useful in test `beforeEach` blocks. */
export function resetConsentCounter(): void {
  counter = 0;
}
