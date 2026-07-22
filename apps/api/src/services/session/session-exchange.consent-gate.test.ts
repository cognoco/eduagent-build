// ---------------------------------------------------------------------------
// session-exchange.consent-gate.test.ts — WI-2372
//
// Regression: "request on behalf of a withdrawn-consent subject -> refusal"
// (AC2). Proves `assertExchangeConsent` runs as the FIRST operation in both
// `processMessage` and `streamMessage`, before any LLM dispatch.
//
// No internal jest.mock of `../exchanges` (GC1 ratchet — CI fails any NEW
// relative-path jest.mock in a test file; `../exchanges` is business logic,
// not a true external boundary). Instead this proves ordering directly: no
// session row is seeded, so if the consent gate did NOT run first, the next
// operation (`checkExchangeLimit`'s session lookup) would throw
// `NotFoundError` instead. Asserting `ConsentWithdrawnError` specifically —
// not just "it threw" — is only possible if the gate fired before
// `checkExchangeLimit`/`prepareExchangeContext`/`processExchange`/
// `streamExchange` ever ran.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { NotFoundError } from '@eduagent/schemas';
import { createMockDb, TEST_PROFILE_ID } from '@eduagent/test-utils';
import { seedConsentState } from '../../test-utils/consent-seed';
import { processMessage, streamMessage } from './session-exchange';
import { ConsentWithdrawnError } from './session-crud';

const SESSION_ID = 'test-session-id';
const INPUT = { message: 'hello' };

function withdrawnParentalDb(): Database {
  const db = createMockDb() as unknown as Database;
  seedConsentState(db as unknown as Record<string, unknown>, {
    personId: TEST_PROFILE_ID,
    state: 'WITHDRAWN',
  });
  return db;
}

function withdrawnAdultLlmDisclosureDb(): Database {
  const db = createMockDb() as unknown as Database;
  // [0..1] complete GDPR set: no parental rows. [2] platform_use art6_1_a:
  // CONSENTED. [3] llm_disclosure art6_1_a: WITHDRAWN.
  seedConsentState(db as unknown as Record<string, unknown>, {
    personId: TEST_PROFILE_ID,
    state: [null, null, 'CONSENTED', 'WITHDRAWN'],
  });
  return db;
}

function activeConsentDb(): Database {
  const db = createMockDb() as unknown as Database;
  seedConsentState(db as unknown as Record<string, unknown>, {
    personId: TEST_PROFILE_ID,
    state: [null, null, 'CONSENTED', 'CONSENTED'],
  });
  return db;
}

describe('assertExchangeConsent gate — processMessage / streamMessage', () => {
  it.each([
    ['child parental consent withdrawn', withdrawnParentalDb],
    ['adult llm_disclosure consent withdrawn', withdrawnAdultLlmDisclosureDb],
  ])('processMessage refuses when %s', async (_label, buildDb) => {
    const db = buildDb();
    await expect(
      processMessage(db, TEST_PROFILE_ID, SESSION_ID, INPUT),
    ).rejects.toBeInstanceOf(ConsentWithdrawnError);
  });

  it.each([
    ['child parental consent withdrawn', withdrawnParentalDb],
    ['adult llm_disclosure consent withdrawn', withdrawnAdultLlmDisclosureDb],
  ])('streamMessage refuses when %s', async (_label, buildDb) => {
    const db = buildDb();
    await expect(
      streamMessage(db, TEST_PROFILE_ID, SESSION_ID, INPUT),
    ).rejects.toBeInstanceOf(ConsentWithdrawnError);
  });

  // Negative control (AC4): an active-consent subject's request is NOT
  // refused by the consent gate. No session row is seeded, so the request
  // still fails overall — but at checkExchangeLimit's session lookup
  // (NotFoundError), proving it got PAST the consent gate rather than being
  // blocked by it.
  it('processMessage does not refuse an active-consent subject', async () => {
    const db = activeConsentDb();
    await expect(
      processMessage(db, TEST_PROFILE_ID, SESSION_ID, INPUT),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('streamMessage does not refuse an active-consent subject', async () => {
    const db = activeConsentDb();
    await expect(
      streamMessage(db, TEST_PROFILE_ID, SESSION_ID, INPUT),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
