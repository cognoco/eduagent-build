import { expect, test } from '@playwright/test';

test('[WI-2182] real browser keyboard activation stays separate from backdrop dismissal', async ({
  page,
}) => {
  await page.goto('/dev-only/bottom-sheet-keyboard', {
    waitUntil: 'commit',
  });

  const dialog = page.getByRole('dialog');
  const action = page.getByTestId('topic-picker-keyboard-proof');
  const backdrop = page.getByRole('button', { name: 'Close topic picker' });

  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await expect(action).toHaveAttribute('role', 'button');
  await expect(backdrop).toHaveAttribute('role', 'button');
  expect(await action.evaluate((element) => element.tagName)).toBe('BUTTON');
  expect(await backdrop.evaluate((element) => element.tagName)).toBe('BUTTON');
  await expect(action).toContainText('selections 0; closes 0');

  await action.press('Enter');
  await expect(action).toContainText('selections 1; closes 0');
  await expect(dialog).toBeVisible();

  await action.press('Space');
  await expect(action).toContainText('selections 2; closes 0');
  await expect(dialog).toBeVisible();

  await backdrop.press('Enter');
  await expect(action).toContainText('selections 2; closes 1');

  await backdrop.press('Space');
  await expect(action).toContainText('selections 2; closes 2');
  await expect(dialog).toBeVisible();
});
