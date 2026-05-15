import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';
import { fillTextInput } from '../../helpers/text-input';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('J-11 learner → Library → shelf → book → start learning', async ({
  page,
}) => {
  const seed = await readSeedData('solo-learner');
  const subjectId = seed.ids.subjectId;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await pressableClick(page.getByTestId('tab-library'));
  await expect(page.getByTestId(`shelf-row-header-${subjectId}`)).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByTestId(`shelf-row-header-${subjectId}`));
  await expect(page.getByTestId('shelf-screen')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.locator('[data-testid^="book-card-"]').first());
  await expect(page.getByTestId('book-screen')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByTestId('book-start-learning'));
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('chat-input')).toBeEditable({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/session(?:\?.*)?$/);

  await fillTextInput(
    page.getByTestId('chat-input'),
    'Can you explain the first idea in simple words?',
  );
  await pressableClick(page.getByTestId('send-button'));
  await expect(page.getByTestId('thinking-bulb-animation')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('thinking-bulb-animation')).toBeHidden({
    timeout: 60_000,
  });
  await expect(page.getByText('Session screen crashed')).toBeHidden();
  await expect(page.getByTestId('chat-input')).toBeEditable({
    timeout: 30_000,
  });

  await fillTextInput(
    page.getByTestId('chat-input'),
    'Can you show me an example?',
  );
  await expect(page.getByTestId('send-button')).toBeEnabled({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('send-button'));

  await expect(page.getByText('Session screen crashed')).toBeHidden();
  await expect(page.getByTestId('quick-chip-explain_differently')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.locator('[data-testid^="message-feedback-helpful-"]').first(),
  ).toBeVisible({ timeout: 30_000 });
});
