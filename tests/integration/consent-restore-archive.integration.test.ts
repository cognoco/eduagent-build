/**
 * Integration: Consent restore vs archive-cleanup race (C1 break test)
 *
 * Verifies that a profile restored via restoreConsent() survives the
 * archive-cleanup Inngest body — i.e. the cleanup bails with
 * `consent_restored` rather than hard-deleting the profile.
 *
 * Scenario:
 * 1. Seed a child profile with a WITHDRAWN consent state + archivedAt set
 *    (simulating what consent-revocation does before dispatching
 *    app/profile.archived).
 * 2. Restore consent (restoreConsent) — this must atomically flip status to
 *    CONSENTED and clear archivedAt.
 * 3. Run the archive-cleanup step body directly against the real DB.
 * 4. Assert the profile still exists and archivedAt is null.
 *
 * Mocked boundaries: none (no external boundaries touched by these paths).
 */

import { eq } from 'drizzle-orm';
import {
  accounts,
  consentStates,
  familyLinks,
  profiles,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import { restoreConsent } from '../../apps/api/src/services/consent';
import { archiveCleanup } from '../../apps/api/src/inngest/functions/archive-cleanup';

const PARENT_CLERK_ID = 'integration-consent-restore-parent';
const PARENT_EMAIL = 'integration-consent-restore-parent@integration.test';
const CHILD_CLERK_ID = 'integration-consent-restore-child';
const CHILD_EMAIL = 'integration-consent-restore-child@integration.test';

async function seedParentChildPair(): Promise<{
  parentProfileId: string;
  childProfileId: string;
}> {
  const db = createIntegrationDb();

  const [parentAccount] = await db
    .insert(accounts)
    .values({ clerkUserId: PARENT_CLERK_ID, email: PARENT_EMAIL })
    .returning();

  const [parentProfile] = await db
    .insert(profiles)
    .values({
      accountId: parentAccount!.id,
      displayName: 'Parent',
      birthYear: 1985,
      isOwner: true,
    })
    .returning();

  const [childAccount] = await db
    .insert(accounts)
    .values({ clerkUserId: CHILD_CLERK_ID, email: CHILD_EMAIL })
    .returning();

  const [childProfile] = await db
    .insert(profiles)
    .values({
      accountId: childAccount!.id,
      displayName: 'Child',
      birthYear: 2012,
      isOwner: false,
      archivedAt: new Date(), // simulates archive-cleanup precondition
    })
    .returning();

  // family_links — parent owns child
  await db.insert(familyLinks).values({
    parentProfileId: parentProfile!.id,
    childProfileId: childProfile!.id,
  });

  // Withdrawn consent state
  await db.insert(consentStates).values({
    profileId: childProfile!.id,
    consentType: 'GDPR',
    status: 'WITHDRAWN',
    parentEmail: PARENT_EMAIL,
    consentToken: `restore-test-${childProfile!.id}`,
    respondedAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return {
    parentProfileId: parentProfile!.id,
    childProfileId: childProfile!.id,
  };
}

beforeEach(async () => {
  await cleanupAccounts({
    emails: [PARENT_EMAIL, CHILD_EMAIL],
    clerkUserIds: [PARENT_CLERK_ID, CHILD_CLERK_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [PARENT_EMAIL, CHILD_EMAIL],
    clerkUserIds: [PARENT_CLERK_ID, CHILD_CLERK_ID],
  });
});

describe('Integration: consent restore vs archive-cleanup (C1)', () => {
  it('restoreConsent clears archivedAt atomically', async () => {
    const db = createIntegrationDb();
    const { parentProfileId, childProfileId } = await seedParentChildPair();

    // Precondition: archivedAt is set
    const before = await db.query.profiles.findFirst({
      where: eq(profiles.id, childProfileId),
      columns: { archivedAt: true },
    });
    expect(before?.archivedAt).not.toBeNull();

    // Act: restore consent
    const result = await restoreConsent(db, childProfileId, parentProfileId);
    expect(result.status).toBe('CONSENTED');

    // archivedAt must be cleared
    const after = await db.query.profiles.findFirst({
      where: eq(profiles.id, childProfileId),
      columns: { archivedAt: true },
    });
    expect(after?.archivedAt).toBeNull();
  });

  it('archive-cleanup bails with consent_restored when consent is CONSENTED', async () => {
    const db = createIntegrationDb();
    const { parentProfileId, childProfileId } = await seedParentChildPair();

    // Restore first (consent + archivedAt cleared)
    await restoreConsent(db, childProfileId, parentProfileId);

    // Simulate the archive-cleanup step body directly
    const mockStep = {
      sleep: jest.fn().mockResolvedValue(undefined),
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      sendEvent: jest.fn().mockResolvedValue(undefined),
    };

    const handler = (
      archiveCleanup as { fn: (ctx: unknown) => Promise<unknown> }
    ).fn;

    const result = await handler({
      event: {
        name: 'app/profile.archived',
        data: { profileId: childProfileId, parentProfileId },
      },
      step: mockStep,
    });

    // Should have bailed — not deleted
    expect(result).toMatchObject({ status: 'complete', profileId: childProfileId });

    // Profile must still exist
    const stillExists = await db.query.profiles.findFirst({
      where: eq(profiles.id, childProfileId),
      columns: { id: true, archivedAt: true },
    });
    expect(stillExists).not.toBeNull();
    expect(stillExists?.archivedAt).toBeNull();
  });
});
