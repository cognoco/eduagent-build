import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

/**
 * J-31 [WI-2226] supporter cold-start mount: the Support hub landing tab
 * (Mentor) now mounts `SupporterColdStart`, so a supporter with a
 * granted-idle child (one who has their own account but hasn't started
 * learning yet) sees a kickstart nudge card as soon as they land — this
 * used to be dead code, reachable only from an isolated component test,
 * never from the real navigation tree.
 *
 * Reuses the same `v2-supporter-accepted` seed as J-29
 * (j29-supporter-scope-journey.spec.ts): a supporter with a "rich" child
 * (own account, real learning state — so `resolveSupporterColdStart` skips
 * them, no card) and an "empty-record" child (own account, zero learning
 * state — so they DO get a `granted-idle` cold-start card). Neither seeded
 * child produces the `managed` state (both are v2 owner identities with
 * their own account, not a managed/no-account child) — that state is
 * exercised at the unit level in SupportHubMentorTab.test.tsx and
 * SupporterColdStart.test.tsx instead.
 *
 * [Disclosure] The Playwright web E2E harness does not run in this build
 * environment (no dev-server/staging DB reachable). This spec is written
 * and testID-verified against the source it exercises
 * (SupporterColdStart.tsx, SupportHubMentorTab.tsx, test-seed-v2-supporter.ts)
 * but has NOT been executed here — do not read a green run into this PR.
 */
test('J-31 supporter: Support hub landing shows the granted-idle cold-start nudge for an account-holding, learning-state-free child, and no nudge for the rich child', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'v2-supporter-accepted',
    alias: 'j31-coldstart',
    landingTestId: 'support-hub-mentor-tab',
    landingPath: '/mentor',
  });

  const richPersonId = seeded.ids.supporteePersonId;
  const emptyPersonId = seeded.ids.emptySupporteePersonId;
  // Literal displayName set in test-seed-v2-supporter.ts.
  const emptyDisplayName = 'Empty-Record Supportee';

  // --- The granted-idle nudge for the empty-record supportee (own account,
  // no learning state yet) is visible in the cold-start section.
  const coldStartGrantedCard = page.getByTestId(
    `supporter-cold-start-granted-${emptyPersonId}`,
  );
  await expect(coldStartGrantedCard).toBeVisible();
  await expect(coldStartGrantedCard.getByText(emptyDisplayName)).toBeVisible();
  await expect(
    page.getByTestId(`supporter-cold-start-kickstart-${emptyPersonId}`),
  ).toBeVisible();

  // --- The rich supportee already has real learning state — no cold-start
  // card of any kind (resolveSupporterColdStart `continue`s past them).
  await expect(
    page.getByTestId(`supporter-cold-start-granted-${richPersonId}`),
  ).toHaveCount(0);
  await expect(
    page.getByTestId(`supporter-cold-start-managed-${richPersonId}`),
  ).toHaveCount(0);

  // --- The cold-start section co-exists with the ordinary person-scope
  // cards below it — mounting it didn't replace or hide the existing list.
  await expect(
    page.getByTestId(`support-hub-mentor-person-${richPersonId}`),
  ).toBeVisible();

  // --- The kickstart CTA is present but inert for this journey (WI-1136,
  // the encouragement-composer wiring, is a separate deferred fast-follow —
  // see SupporterColdStart.tsx's onKickstart prop comment). Pressing it must
  // not navigate away from the Support hub.
  await pressableClick(
    page.getByTestId(`supporter-cold-start-kickstart-${emptyPersonId}`),
  );
  await expect(page.getByTestId('support-hub-mentor-tab')).toBeVisible();
});
