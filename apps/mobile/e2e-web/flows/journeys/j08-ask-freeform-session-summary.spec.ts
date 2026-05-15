import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Dialog, Page } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';
import { fillTextInput } from '../../helpers/text-input';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

async function waitForCompletedAssistantTurn(page: Page) {
  const thinkingBulb = page.getByTestId('thinking-bulb-animation');
  const assistantReply = page.getByTestId(/^message-bubble-assistant-/).nth(1);
  const reconnectButton = page.getByTestId(/^session-reconnect-/).first();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await Promise.race([
      thinkingBulb.waitFor({ state: 'visible', timeout: 30_000 }),
      assistantReply.waitFor({ state: 'visible', timeout: 30_000 }),
    ]);
    if (await thinkingBulb.isVisible().catch(() => false)) {
      await expect(thinkingBulb).toBeHidden({
        timeout: 60_000,
      });
    }
    await expect(assistantReply).toBeVisible({ timeout: 30_000 });

    if (!(await reconnectButton.isVisible().catch(() => false))) {
      return;
    }
    if (attempt === 2) {
      break;
    }
    await pressableClick(reconnectButton);
  }

  await expect(reconnectButton).toBeHidden({ timeout: 1_000 });
}

async function endSessionAndDismissFilingPrompt(page: Page) {
  const acceptDialog = async (dialog: Dialog): Promise<void> => {
    await dialog.accept().catch(() => undefined);
  };
  page.on('dialog', acceptDialog);
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await pressableClick(page.getByTestId('end-session-button'));

      const filingDismiss = page.getByTestId('filing-prompt-dismiss');
      const summaryInput = page.getByTestId('summary-input');
      try {
        await expect(filingDismiss.or(summaryInput)).toBeVisible({
          timeout: 30_000,
        });
      } catch (error) {
        if (attempt === 2) {
          throw error;
        }
        await expect(page.getByTestId('end-session-button')).toBeVisible({
          timeout: 10_000,
        });
        continue;
      }

      if (await filingDismiss.isVisible().catch(() => false)) {
        await pressableClick(filingDismiss);
      }
      return;
    }
  } finally {
    page.off('dialog', acceptDialog);
  }
}

test('J-08 learner → Ask → freeform chat → end session → summary → home', async ({
  page,
}) => {
  const seed = await readSeedData('solo-learner');
  const subjectId = seed.ids.subjectId;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  // Ask intent → session screen with chat input
  await pressableClick(page.getByTestId('home-ask-anything'));
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });

  // Send a freeform question — real API classifies, creates session, streams
  await fillTextInput(
    page.getByTestId('chat-input'),
    'How do volcanoes erupt?',
  );
  await pressableClick(page.getByTestId('send-button'));

  const thinkingBulb = page.getByTestId('thinking-bulb-animation');
  const subjectResolution = page.getByTestId('session-subject-resolution');
  const firstFollowUp = await Promise.race([
    thinkingBulb
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'thinking' as const),
    subjectResolution
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'subject-resolution' as const),
  ]);

  if (firstFollowUp === 'subject-resolution') {
    await pressableClick(page.getByTestId(`subject-resolution-${subjectId}`));
  }

  // Wait for a real assistant turn. Reconnect prompts are recovery UI, not the
  // successful chat exchange this journey needs before closing the session.
  await waitForCompletedAssistantTurn(page);

  // End session. Freeform sessions usually show a filing prompt first; if close
  // reaches the summary directly, continue from there.
  await endSessionAndDismissFilingPrompt(page);

  // Summary screen — write a reflection and submit
  await expect(page.getByTestId('summary-input')).toBeVisible({
    timeout: 30_000,
  });
  await fillTextInput(
    page.getByTestId('summary-input'),
    'I learned that pressure builds up under the ground before the eruption.',
  );
  await pressableClick(page.getByTestId('submit-summary-button'));

  // After submission, wait for the continue button (AI feedback is generated
  // asynchronously — the page polls for it, then reveals the button)
  await expect(page.getByTestId('continue-button')).toBeVisible({
    timeout: 60_000,
  });
  await pressableClick(page.getByTestId('continue-button'));

  // Back on learner home
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
});
