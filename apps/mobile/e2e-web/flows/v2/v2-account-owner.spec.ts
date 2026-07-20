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
    screen: 'mentor-screen',
    tab: 'tab-mentor',
    token: 'mentor',
    leafRow: 'account-admin-profile',
    leafScreen: 'profiles-screen',
  },
  {
    name: 'Subjects',
    path: '/subjects',
    screen: 'subjects-screen',
    tab: 'tab-subjects',
    token: 'subjects',
    leafRow: 'account-admin-privacy',
    leafScreen: 'more-privacy-scroll',
  },
  {
    name: 'Journal',
    path: '/journal',
    screen: 'journal-screen',
    tab: 'tab-journal',
    token: 'journal',
    leafRow: 'account-admin-notifications',
    leafScreen: 'more-notifications-scroll',
  },
] as const;

async function selectOwnerLearnerScope(page: Page): Promise<void> {
  const meScope = page.getByTestId('scope-chip-option-me');

  await expect(meScope).toBeVisible({ timeout: 60_000 });
  await meScope.click();
  await expect(meScope).toHaveAttribute('aria-selected', 'true');
}

async function expectOwnerLearnerEntry(
  page: Page,
  entry: (typeof ENTRY_CASES)[number],
  ownerSubjectId: string,
): Promise<void> {
  const screen = page.getByTestId(entry.screen);

  await expect(screen).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId(entry.tab)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('scope-chip-option-me')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('account-avatar-button')).toHaveAttribute(
    'aria-label',
    'Open account settings for Test Parent',
  );
  if (entry.token === 'mentor') {
    await expect(
      screen.getByText('General Knowledge', { exact: true }),
    ).toBeVisible();
  } else if (entry.token === 'subjects') {
    const subject = screen.getByTestId(`subjects-browse-row-${ownerSubjectId}`);
    await expect(subject).toBeVisible();
    await expect(
      subject.getByText('General Knowledge', { exact: true }),
    ).toBeVisible();
  } else {
    await expect(screen.getByText('Journal', { exact: true })).toBeVisible();
  }
}

test('V2 owner learner Account returns its own exact content to each initiating tab', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const ownerSubjectId = seed.ids.ownerSubjectId;

  for (const entry of ENTRY_CASES) {
    await test.step(`${entry.name} avatar -> ${entry.leafRow} -> ${entry.name}`, async () => {
      await page.goto(entry.path, { waitUntil: 'commit' });
      await selectOwnerLearnerScope(page);
      await expectOwnerLearnerEntry(page, entry, ownerSubjectId);

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
      await expectOwnerLearnerEntry(page, entry, ownerSubjectId);
    });
  }
});

test('V2 Account empty history falls back to Journal and never legacy Home', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const ownerSubjectId = seed.ids.ownerSubjectId;
  const journalEntry = ENTRY_CASES[2];

  await page.goto('/journal', { waitUntil: 'commit' });
  await selectOwnerLearnerScope(page);
  await expectOwnerLearnerEntry(page, journalEntry, ownerSubjectId);

  const context = page.context();
  await page.close();
  const directPage = await context.newPage();
  await directPage.goto('/account?returnTo=journal', { waitUntil: 'commit' });
  await expect(directPage.getByTestId('account-screen')).toBeVisible({
    timeout: 60_000,
  });

  await directPage.getByTestId('account-back').click();

  await expect(directPage).toHaveURL(/\/journal(?:\?.*)?$/);
  await expectOwnerLearnerEntry(directPage, journalEntry, ownerSubjectId);
  await expect(directPage).not.toHaveURL(/\/home(?:\?.*)?$/);
});

async function expectSignedOutWithoutTestParentData(page: Page): Promise<void> {
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
}

test('V2 Test Parent sign-out keeps its General Knowledge row behind the unauthenticated boundary after Back and a fresh protected page', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const ownerSubjectId = seed.ids.ownerSubjectId;
  const subjectsEntry = ENTRY_CASES[1];

  await page.goto('/subjects', { waitUntil: 'commit' });
  await selectOwnerLearnerScope(page);
  await expectOwnerLearnerEntry(page, subjectsEntry, ownerSubjectId);

  await page.getByTestId('account-avatar-button').click();
  await expect(page.getByText('Test Parent', { exact: true })).toBeVisible();

  await page.getByTestId('account-admin-sign-out').click();
  await expectSignedOutWithoutTestParentData(page);

  await page.goBack({ waitUntil: 'commit' });
  await expectSignedOutWithoutTestParentData(page);

  const context = page.context();
  await page.close();
  const freshPage = await context.newPage();
  await freshPage.goto('/subjects', { waitUntil: 'commit' });
  await expectSignedOutWithoutTestParentData(freshPage);
});
