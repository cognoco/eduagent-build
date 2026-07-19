import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

/**
 * J-29 [WI-2241] supporter scope journey: Support hub -> person scope ->
 * Mentor -> Subjects -> Journal -> Support hub, preserving the same
 * person/edge across bottom tabs and a relaunch (page reload), plus the
 * structural wall (no study/note input), a page-content containment canary,
 * the honest empty shared-record state, and the revoked/unauthorized edge's
 * absence of any UI affordance.
 *
 * Two synthetic identities: the seeded `v2-supporter-accepted` scenario
 * returns real supporter + supportee credentials (redacted from evidence —
 * see wi2241-art/evidence.json). Only the supporter signs in here.
 *
 * [Phase-4 review, WI-2241] The actual NEGATIVE WALL FAIL-CLOSED property
 * (a revoked/unrelated caller is denied outright, not served foreign data)
 * is proven at its source in test-seed-v2-supporter.integration.test.ts
 * (real ForbiddenError assertions against the API). This spec's page-body
 * `not.toContain('PRIVATE')` check below is a forward-regression CANARY, not
 * that proof — it cannot fail for an authorization bug, since the underlying
 * read models never select the private-artifact tables in the first place
 * (see the integration test's per-case comments). What this spec DOES prove
 * at the UI level is the absence of any affordance pointing at the
 * revoked/unauthorized identity (no scope-chip-option-person testID for it
 * at all) and the empty-record honest-empty-state.
 */
test('J-29 supporter: Support hub -> person scope -> Mentor -> Subjects -> Journal -> Support hub, walls hold, relaunch preserves scope', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'v2-supporter-accepted',
    alias: 'j29-supporter',
    landingTestId: 'support-hub-mentor-tab',
    landingPath: '/mentor',
  });

  const richPersonId = seeded.ids.supporteePersonId;
  const emptyPersonId = seeded.ids.emptySupporteePersonId;
  const revokedPersonId = seeded.ids.revokedSupporteePersonId;
  const subjectId = seeded.ids.subjectId;
  // Literal displayName values set in test-seed-v2-supporter.ts — used below
  // to prove the SAME person/edge is active (not just "a" person scope),
  // scoped to each screen's container testID to avoid ambiguity with the
  // matching text on the scope-chip's own label.
  const richDisplayName = 'Test Supportee';
  const emptyDisplayName = 'Empty-Record Supportee';

  // --- Support hub: the rich supportee's person chip is present; the
  // revoked/unauthorized supportee has NO scope-chip affordance at all.
  await expect(
    page.getByTestId(`support-hub-mentor-person-${richPersonId}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`scope-chip-option-person-${revokedPersonId}`),
  ).toHaveCount(0);

  // --- Mentor: open the rich person scope.
  await pressableClick(
    page.getByTestId(`support-hub-mentor-open-${richPersonId}`),
  );
  await expect(page.getByTestId('person-scope-mentor-tab')).toBeVisible();
  await expect(
    page.getByTestId(`scope-chip-option-person-${richPersonId}`),
  ).toBeVisible();

  // --- Subjects (same person/edge via the bottom tab, not a re-navigation).
  await pressableClick(page.getByTestId('tab-subjects'));
  await expect(page).toHaveURL(/\/subjects$/);
  const structuralSubjects = page.getByTestId(
    'person-scope-structural-subjects',
  );
  await expect(structuralSubjects).toBeVisible();
  await expect(structuralSubjects.getByText(richDisplayName)).toBeVisible();
  await expect(
    page.getByTestId(`person-scope-subject-${subjectId}`),
  ).toBeVisible();

  // STRUCTURAL WALL: drilling into the subject renders the read-only hub —
  // no study/note-input affordance (SubjectHubSurface mode=supporter-readonly
  // forces canStudy=false and notes=[], so SubjectHubNotesSection never
  // mounts — apps/mobile/src/components/subject-hub/SubjectHub.tsx `showNotes`).
  await pressableClick(page.getByTestId(`person-scope-subject-${subjectId}`));
  await expect(page.getByTestId('person-scope-subject-hub')).toBeVisible();
  await expect(page.getByTestId('subject-hub')).toBeVisible();
  await expect(page.getByTestId('subject-hub-notes-section')).toHaveCount(0);
  await expect(page.getByTestId('subject-hub-notes-input')).toHaveCount(0);
  await page.getByTestId('person-scope-subject-hub-back').click();
  await expect(
    page.getByTestId('person-scope-structural-subjects'),
  ).toBeVisible();
  await expect(
    page.getByTestId(`person-scope-subject-${subjectId}`),
  ).toBeVisible();

  // --- Journal (same person/edge, still the rich supportee).
  await pressableClick(page.getByTestId('tab-journal'));
  await expect(page).toHaveURL(/\/journal$/);
  const journalPlaceholder = page.getByTestId(
    'person-scope-journal-placeholder',
  );
  await expect(journalPlaceholder).toBeVisible();
  await expect(journalPlaceholder.getByText(richDisplayName)).toBeVisible();
  await expect(page.getByTestId('visibility-shared-record')).toBeVisible();

  // Forward-regression canary (NOT the negative-wall proof — see file
  // header): none of the seeded private-artifact content (topic note,
  // bookmark, raw transcript, Mentor-memory — every private fixture row in
  // test-seed-v2-supporter.ts is seeded with content prefixed 'PRIVATE')
  // reaches the page today. Guards against a future data source accidentally
  // widening to include it.
  const bodyText = (await page.textContent('body')) ?? '';
  expect(bodyText).not.toContain('PRIVATE');

  // --- Relaunch: reload the app mid-journey and confirm the SAME person/edge
  // is still active (scope-context.tsx persists activeScope via SecureStore
  // keyed on profileId, re-hydrated on next mount) — not reverted to the hub.
  await page.reload({ waitUntil: 'commit' });
  await expect(journalPlaceholder).toBeVisible({ timeout: 30_000 });
  await expect(journalPlaceholder.getByText(richDisplayName)).toBeVisible();

  // --- EMPTY SHARED RECORD: switching to the empty-record supportee renders
  // an honest empty state, not an error and no leaked private content.
  await pressableClick(
    page.getByTestId(`scope-chip-option-person-${emptyPersonId}`),
  );
  await expect(journalPlaceholder).toBeVisible();
  await expect(journalPlaceholder.getByText(emptyDisplayName)).toBeVisible();
  await expect(page.getByTestId('visibility-shared-record')).toHaveCount(0);
  await expect(
    page.getByTestId('person-scope-journal-empty-lamp'),
  ).toBeVisible();

  // --- Back to Support hub.
  await pressableClick(page.getByTestId('scope-chip-option-supporter-hub'));
  await expect(page.getByTestId('support-hub-mentor-tab')).toBeVisible();
});
