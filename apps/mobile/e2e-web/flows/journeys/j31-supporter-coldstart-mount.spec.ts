import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

/**
 * J-31 [WI-2226 owner-gate retarget] supporter cold-start mount: the Support
 * hub landing tab (Mentor) mounts `SupporterColdStart`, which renders the
 * OWNER-GATED managed card for a same-org managed child — the WI-2226
 * bounce-#1 fix (supporter-coldstart.ts) renders a `state: 'managed'` card
 * only for a hasOwnAccount=false candidate whose membership resolves within
 * the SUPPORTER's own organization (the same predicate POST /profiles/switch
 * enforces, so the card's CTA — switchProfile — actually works).
 *
 * This journey previously targeted `v2-supporter-accepted`'s empty-record
 * supportee expecting a `granted-idle` card, but that supportee: (a) is an
 * independent v2 owner in a DIFFERENT organization (cross-org — the
 * owner-gate suppresses it even if it were a managed candidate), and (b)
 * hasOwnAccount has no writer anywhere in the codebase (WI-2538) — the
 * `granted-idle`/`active` branches are currently unreachable in production,
 * so a journey asserting one is unproducible (reviewer bounce #2). Reuses
 * `v2-supporter-managed` (test-seed-v2-supporter.ts's seedV2SupporterManaged)
 * instead: a same-org supporter + managed child with a real supportership
 * edge — the producible path the owner-gate actually renders a card for.
 *
 * [Disclosure] The Playwright web E2E harness does not run in this build
 * environment (no dev-server/staging DB reachable). This spec is written and
 * testID-verified against the source it exercises (SupporterColdStart.tsx,
 * SupportHubMentorTab.tsx, test-seed-v2-supporter.ts's
 * seedV2SupporterManaged) but has NOT been executed here — do not read a
 * green run into this PR. The seed itself IS proven against a real DB by
 * test-seed-v2-supporter.integration.test.ts's "v2-supporter-managed seed"
 * suite (resolveSupporterColdStart renders the exact managed card this
 * journey asserts). The runtime fail-if-unreachable guard for
 * SupporterColdStart's mount already exists and IS executed:
 * SupportHubMentorTab.test.tsx's `[WI-2226 RGR]` case (RTL, real mounted
 * tree, red/green evidence in
 * apps/mobile/src/components/support/wi2226-rgr-evidence.md).
 */
test('J-31 supporter: Support hub landing shows the owner-gated managed cold-start card for a same-org managed child, and its CTA switches into the child profile', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'v2-supporter-managed',
    alias: 'j31-coldstart',
    landingTestId: 'support-hub-mentor-tab',
    landingPath: '/mentor',
  });

  const managedChildPersonId = seeded.ids.managedChildPersonId;
  // Literal displayName set in test-seed-v2-supporter.ts's
  // seedV2SupporterManaged.
  const managedChildDisplayName = 'Managed Child';

  // --- The owner-gated managed card is visible in the cold-start section
  // (hasOwnAccount=false, on the supporter's own org — the exact candidate
  // the owner-gate renders a card for).
  const coldStartManagedCard = page.getByTestId(
    `supporter-cold-start-managed-${managedChildPersonId}`,
  );
  await expect(coldStartManagedCard).toBeVisible();
  await expect(
    coldStartManagedCard.getByText(managedChildDisplayName),
  ).toBeVisible();
  await expect(
    page.getByTestId(`supporter-cold-start-handoff-${managedChildPersonId}`),
  ).toBeVisible();

  // --- Pressing the handoff CTA calls switchProfile (WI-2226 bounce-#1 fix,
  // SupporterColdStart.tsx) — a real profile switch, not the prior
  // setActiveScope no-op. The app leaves the Support hub for the managed
  // child's own screen.
  await pressableClick(
    page.getByTestId(`supporter-cold-start-handoff-${managedChildPersonId}`),
  );
  await expect(page.getByTestId('support-hub-mentor-tab')).not.toBeVisible();
});
