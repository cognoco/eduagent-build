import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';
import { pressableClick } from '../../helpers/pressable';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('J-08 learner → Ask → freeform chat → end session → summary → home', async ({
  page,
}) => {
  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  // Ask intent → session screen with chat input
  await pressableClick(page.getByTestId('home-ask-anything'));
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });

  // Send a freeform question — real API classifies, creates session, streams
  await page.getByTestId('chat-input').fill('How do volcanoes erupt?');
  await page.getByTestId('send-button').click();

  // Wait for any streamed assistant response to appear in chat.
  // The thinking-bulb animation appears while streaming, then a message
  // bubble renders. We wait for the bulb to disappear — meaning the stream
  // finished and the response is rendered.
  await expect(page.getByTestId('thinking-bulb-animation')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('thinking-bulb-animation')).toBeHidden({
    timeout: 60_000,
  });

  // End session — the app shows a confirm dialog first
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByTestId('end-session-button').click();

  // Filing prompt asks if user wants to file under a topic — dismiss it
  await expect(page.getByTestId('filing-prompt-dismiss')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('filing-prompt-dismiss').click();

  // Summary screen — write a reflection and submit
  await expect(page.getByTestId('summary-input')).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByTestId('summary-input')
    .fill(
      'I learned that pressure builds up under the ground before the eruption.',
    );
  await page.getByTestId('submit-summary-button').click();

  // After submission, wait for the continue button (AI feedback is generated
  // asynchronously — the page polls for it, then reveals the button)
  await expect(page.getByTestId('continue-button')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId('continue-button').click();

  // Back on learner home
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
});
