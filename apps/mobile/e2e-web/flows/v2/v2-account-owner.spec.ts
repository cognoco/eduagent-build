import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({
  storageState: path.join(authStateDir, 'owner-with-children.json'),
});

const OWNER_ROWS = [
  'account-admin-profile',
  'account-admin-privacy',
  'account-admin-notifications',
  'account-admin-security',
  'account-admin-subscription',
  'account-admin-add-child',
  'account-admin-family-settings',
] as const;

const ENTRY_CASES = [
  {
    name: 'Mentor',
    path: '/mentor',
    screen: 'person-scope-mentor-tab',
    tab: 'tab-mentor',
    token: 'mentor',
    leafRow: 'account-admin-profile',
    leafScreen: 'profiles-screen',
  },
  {
    name: 'Subjects',
    path: '/subjects',
    screen: 'person-scope-structural-subjects',
    tab: 'tab-subjects',
    token: 'subjects',
    leafRow: 'account-admin-privacy',
    leafScreen: 'more-privacy-scroll',
  },
  {
    name: 'Journal',
    path: '/journal',
    screen: 'person-scope-journal-placeholder',
    tab: 'tab-journal',
    token: 'journal',
    leafRow: 'account-admin-notifications',
    leafScreen: 'more-notifications-scroll',
  },
] as const;

async function expectEmmaPersonScopedEntry(
  page: Page,
  entry: (typeof ENTRY_CASES)[number],
  childProfileId: string,
  subjectId: string,
): Promise<void> {
  await expect(page.getByTestId(entry.screen)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId(entry.tab)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByTestId(`scope-chip-option-person-${childProfileId}`),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('account-avatar-button')).toHaveAttribute(
    'aria-label',
    'Open account settings for Test Parent',
  );
  if (entry.token === 'mentor') {
    await expect(
      page
        .getByTestId(`support-hub-mentor-person-${childProfileId}`)
        .getByText('Emma', { exact: true }),
    ).toBeVisible();
  } else if (entry.token === 'subjects') {
    const subject = page.getByTestId(`person-scope-subject-${subjectId}`);
    await expect(subject).toBeVisible();
    await expect(
      subject.getByText('Mathematics', { exact: true }),
    ).toBeVisible();
  } else {
    await expect(
      page
        .getByTestId('person-scope-journal-placeholder')
        .getByText('Emma', { exact: true }),
    ).toBeVisible();
  }
}

test('V2 owner Account returns Emma person scope and exact seeded content to each initiating tab', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;
  const subjectId = seed.ids.subject1Id;
  const personChip = `scope-chip-option-person-${childProfileId}`;

  for (const entry of ENTRY_CASES) {
    await test.step(`${entry.name} avatar -> ${entry.leafRow} -> ${entry.name}`, async () => {
      await page.goto(entry.path, { waitUntil: 'commit' });
      await expect(page.getByTestId(personChip)).toBeVisible({
        timeout: 60_000,
      });
      await page.getByTestId(personChip).click();
      await expectEmmaPersonScopedEntry(page, entry, childProfileId, subjectId);

      await page.getByTestId('account-avatar-button').click();
      await expect(page).toHaveURL(
        new RegExp(`/account\\?returnTo=${entry.token}(?:&.*)?$`),
      );
      await expect(page.getByTestId('account-screen')).toBeVisible();
      await expect(
        page.getByText('Account', { exact: true }).first(),
      ).toBeVisible();
      for (const row of OWNER_ROWS) {
        await expect(page.getByTestId(row)).toBeVisible();
      }

      await page.getByTestId(entry.leafRow).click();
      await expect(page.getByTestId(entry.leafScreen)).toBeVisible({
        timeout: 60_000,
      });
      await page.goBack({ waitUntil: 'commit' });
      await expect(page.getByTestId('account-screen')).toBeVisible({
        timeout: 60_000,
      });

      await page.getByTestId('account-back').click();
      await expect(page).toHaveURL(new RegExp(`${entry.path}(?:\\?.*)?$`));
      await expectEmmaPersonScopedEntry(page, entry, childProfileId, subjectId);
    });
  }
});

test('V2 Account empty history falls back to Journal and never legacy Home', async ({
  page,
}) => {
  await page.goto('/account?returnTo=journal', { waitUntil: 'commit' });
  await expect(page.getByTestId('account-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('account-back').click();

  await expect(page).toHaveURL(/\/journal(?:\?.*)?$/);
  await expect(page.getByTestId('journal-screen')).toBeVisible();
  await expect(page).not.toHaveURL(/\/home(?:\?.*)?$/);
});

async function expectSignedOutWithoutOwnerData(page: Page): Promise<void> {
  await expect(page.getByTestId('sign-in-button')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('account-screen')).toHaveCount(0);
  await expect(page.getByTestId('account-avatar-button')).toHaveCount(0);
  await expect(page.getByTestId('mentor-screen')).toHaveCount(0);
  await expect(page.getByTestId('subjects-screen')).toHaveCount(0);
  await expect(page.getByTestId('journal-screen')).toHaveCount(0);
  await expect(page.getByText('Test Parent', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('General Knowledge', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Emma', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Mathematics', { exact: true })).toHaveCount(0);
}

test('V2 owner sign-out keeps prior account and learning data behind the unauthenticated boundary after Back and a fresh protected page', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;
  const subjectId = seed.ids.subject1Id;
  const emmaChip = page.getByTestId(
    `scope-chip-option-person-${childProfileId}`,
  );
  const mathematicsSubject = page.getByTestId(
    `person-scope-subject-${subjectId}`,
  );

  await page.goto('/subjects', { waitUntil: 'commit' });
  await expect(emmaChip).toBeVisible({
    timeout: 60_000,
  });
  await emmaChip.click();
  await expect(
    page.getByTestId('person-scope-structural-subjects'),
  ).toBeVisible();
  await expect(emmaChip).toHaveAttribute('aria-selected', 'true');
  await expect(emmaChip.getByText('Emma', { exact: true })).toBeVisible();
  await expect(mathematicsSubject).toBeVisible();
  await expect(
    mathematicsSubject.getByText('Mathematics', { exact: true }),
  ).toBeVisible();

  await page.getByTestId('account-avatar-button').click();
  await expect(page.getByText('Test Parent', { exact: true })).toBeVisible();

  await page.getByTestId('account-admin-sign-out').click();
  await expectSignedOutWithoutOwnerData(page);

  await page.goBack({ waitUntil: 'commit' });
  await expectSignedOutWithoutOwnerData(page);

  const context = page.context();
  await page.close();
  const freshPage = await context.newPage();
  await freshPage.goto('/subjects', { waitUntil: 'commit' });
  await expectSignedOutWithoutOwnerData(freshPage);
});
