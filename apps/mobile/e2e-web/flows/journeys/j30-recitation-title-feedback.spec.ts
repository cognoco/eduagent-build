import { expect, test, type Page } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';

async function waitForAssistantTurn(page: Page, index: number) {
  const thinkingBulb = page.getByTestId('thinking-bulb-animation');
  const assistantReply = page
    .getByTestId(/^message-bubble-assistant-/)
    .nth(index);
  const reconnectButton = page.getByTestId(/^session-reconnect-/).first();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await Promise.race([
      thinkingBulb.waitFor({ state: 'visible', timeout: 30_000 }),
      assistantReply.waitFor({ state: 'visible', timeout: 30_000 }),
    ]);
    if (await thinkingBulb.isVisible().catch(() => false)) {
      await expect(thinkingBulb).toBeHidden({ timeout: 60_000 });
    }
    await expect(assistantReply).toBeVisible({ timeout: 30_000 });
    if (!(await reconnectButton.isVisible().catch(() => false))) return;
    if (attempt < 2) await pressableClick(reconnectButton);
  }

  await expect(reconnectButton).toBeHidden({ timeout: 1_000 });
}

test('J-30 learner → Practice → title-only recitation → feedback', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'onboarding-complete',
    alias: 'j30',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });
  await pressableClick(page.getByTestId('home-action-practice'));
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('practice-recitation'));
  await expect(page).toHaveURL(/\/session\?.*mode=recitation/);
  await expect(page.getByTestId('chat-input')).toBeEditable({
    timeout: 30_000,
  });

  await fillTextInput(page.getByTestId('chat-input'), 'Ozymandias');
  await pressableClick(page.getByTestId('send-button'));
  await waitForAssistantTurn(page, 1);
  const readyReply = page.getByTestId(/^message-bubble-assistant-/).nth(1);
  await expect(readyReply).toContainText(
    /\b(?:ready|begin|start|go ahead|recite)\b/i,
  );
  await expect(readyReply).not.toContainText(
    /\b(?:what|which).*(?:recite|recitation|poem)|\b(?:title|author|model answer|polished version)\b|\b(?:start|begin) with\s*:/i,
  );

  await fillTextInput(
    page.getByTestId('chat-input'),
    'A remembered opening line for this test.',
  );
  await pressableClick(page.getByTestId('send-button'));
  await waitForAssistantTurn(page, 2);
  await expect(
    page.locator('[data-testid^="message-feedback-helpful-"]').last(),
  ).toBeVisible({ timeout: 30_000 });
});
