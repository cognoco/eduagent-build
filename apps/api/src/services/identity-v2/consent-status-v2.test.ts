// ---------------------------------------------------------------------------
// consent-status-v2.test.ts — WI-2372 predicate unit tests.
//
// Covers `isLlmExchangeConsentAllowed`: the LLM/exchange consent gate that
// checks BOTH the child/parental leg (via isGdprProcessingAllowedV2, basis
// gdpr_parental_consent) AND the adult self-consent leg (basis art6_1_a,
// purposes platform_use + llm_disclosure). "No rows → allowed" per leg;
// only an explicit WITHDRAWN status denies (AC4 — no false positives).
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { createMockDb, TEST_PROFILE_ID } from '@eduagent/test-utils';
import { seedConsentState } from '../../test-utils/consent-seed';
import { isLlmExchangeConsentAllowed } from './consent-status-v2';

describe('isLlmExchangeConsentAllowed', () => {
  it('denies when child parental consent is WITHDRAWN', async () => {
    const db = createMockDb() as unknown as Database;
    seedConsentState(db as unknown as Record<string, unknown>, {
      personId: TEST_PROFILE_ID,
      state: 'WITHDRAWN',
    });

    await expect(
      isLlmExchangeConsentAllowed(db, TEST_PROFILE_ID),
    ).resolves.toBe(false);
  });

  it('denies when adult llm_disclosure consent is WITHDRAWN (platform_use CONSENTED)', async () => {
    const db = createMockDb() as unknown as Database;
    // Call sequence: [0] gdpr basis (no parental row), [1] platform_use
    // art6_1_a (CONSENTED), [2] llm_disclosure art6_1_a (WITHDRAWN).
    seedConsentState(db as unknown as Record<string, unknown>, {
      personId: TEST_PROFILE_ID,
      state: [null, 'CONSENTED', 'WITHDRAWN'],
    });

    await expect(
      isLlmExchangeConsentAllowed(db, TEST_PROFILE_ID),
    ).resolves.toBe(false);
  });

  it('denies when adult platform_use consent is WITHDRAWN', async () => {
    const db = createMockDb() as unknown as Database;
    // Call sequence: [0] gdpr basis (no parental row), [1] platform_use
    // art6_1_a (WITHDRAWN) — short-circuits before llm_disclosure.
    seedConsentState(db as unknown as Record<string, unknown>, {
      personId: TEST_PROFILE_ID,
      state: [null, 'WITHDRAWN'],
    });

    await expect(
      isLlmExchangeConsentAllowed(db, TEST_PROFILE_ID),
    ).resolves.toBe(false);
  });

  it('allows when adult both self-consent purposes are CONSENTED (negative control)', async () => {
    const db = createMockDb() as unknown as Database;
    seedConsentState(db as unknown as Record<string, unknown>, {
      personId: TEST_PROFILE_ID,
      state: [null, 'CONSENTED', 'CONSENTED'],
    });

    await expect(
      isLlmExchangeConsentAllowed(db, TEST_PROFILE_ID),
    ).resolves.toBe(true);
  });

  it('allows when child parental consent is CONSENTED and no adult self-consent rows exist', async () => {
    const db = createMockDb() as unknown as Database;
    seedConsentState(db as unknown as Record<string, unknown>, {
      personId: TEST_PROFILE_ID,
      state: ['CONSENTED', null, null],
    });

    await expect(
      isLlmExchangeConsentAllowed(db, TEST_PROFILE_ID),
    ).resolves.toBe(true);
  });

  it('allows when there are no rows and no org membership (nothing to gate on)', async () => {
    // No seedConsentState call — the raw mock db's default query proxy
    // resolves membership.findFirst() to undefined, matching a
    // pre-graph/orphaned profileId (legacy "no row → allowed" semantics).
    const db = createMockDb() as unknown as Database;

    await expect(
      isLlmExchangeConsentAllowed(db, TEST_PROFILE_ID),
    ).resolves.toBe(true);
  });
});
