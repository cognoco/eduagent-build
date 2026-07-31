import {
  expect,
  test,
  type Dialog,
  type Page,
  type Request,
  type Route,
} from '@playwright/test';
import {
  transcriptResponseSchema,
  type LearningSessionResponse,
} from '@eduagent/schemas';
import { pressableClick } from '../../helpers/pressable';
import { apiBaseUrl } from '../../helpers/runtime';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';

const FIRST_PROMPT = 'Teach me why leaves are green.';
const FIRST_REFLECTION =
  'I learned that chlorophyll reflects green light back to our eyes.';

test.use({ storageState: { cookies: [], origins: [] } });

function isSessionCreate(request: Request): boolean {
  return (
    request.method() === 'POST' &&
    /^\/v1\/subjects\/[^/]+\/sessions$/.test(new URL(request.url()).pathname)
  );
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function endFirstSession(page: Page) {
  const acceptEndSession = async (dialog: Dialog): Promise<void> => {
    if (dialog.message().includes('End session?')) {
      await dialog.accept();
      return;
    }
    await dialog.dismiss();
  };
  page.on('dialog', acceptEndSession);
  try {
    await pressableClick(page.getByTestId('end-session-button'));
    const filingDismiss = page.getByTestId('filing-prompt-dismiss');
    const wrapUp = page.getByTestId('first-session-wrap-up');
    await expect(filingDismiss.or(wrapUp)).toBeVisible({ timeout: 30_000 });
    if (await filingDismiss.isVisible().catch(() => false)) {
      await pressableClick(filingDismiss);
    }
    await expect(wrapUp).toBeVisible({ timeout: 30_000 });
  } finally {
    page.off('dialog', acceptEndSession);
  }
}

test('J-12 V2 profile/legal gate → cold Mentor → one persisted opener → reflection → warm Mentor', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'pre-profile',
    alias: 'j12-first-mentor',
    landingTestId: 'create-profile-gate',
    landingPath: '/mentor',
  });

  await pressableClick(page.getByTestId('create-profile-cta'));
  await expect(page.getByTestId('create-profile-name')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('create-profile-name').fill('Casey');
  await page.getByTestId('create-profile-birthdate-input').fill('2000-05-01');
  await pressableClick(page.getByTestId('create-profile-submit'));

  await expect(page).toHaveURL(/\/mentor(?:\?.*)?$/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('mentor-cold-start-card')).toBeVisible();
  await expect(page.getByTestId('mentor-born-ceremony-overlay')).toBeHidden({
    timeout: 10_000,
  });

  // Make only subject classification deterministic. The suggested subject,
  // subject creation, session, stream, transcript, summary, and return all
  // use their real application/API contracts.
  await page.route('**/v1/subjects/classify', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await fulfillJson(route, {
      candidates: [],
      needsConfirmation: false,
      suggestedSubjectName: 'Science',
    });
  });

  const createdResponsePromise = page.waitForResponse(
    (response) =>
      response.status() === 201 && isSessionCreate(response.request()),
    { timeout: 60_000 },
  );
  await fillTextInput(page.getByTestId('mentor-bar-input'), FIRST_PROMPT);
  await pressableClick(page.getByTestId('mentor-bar-send'));

  const createdResponse = await createdResponsePromise;
  const createdSession = (
    (await createdResponse.json()) as LearningSessionResponse
  ).session;
  expect(createdResponse.request().postDataJSON()).toMatchObject({
    rawInput: FIRST_PROMPT,
    sessionType: 'learning',
  });

  await expect(page.getByTestId('session-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByTestId(/^message-bubble-user-/).filter({
      hasText: new RegExp(
        `^${FIRST_PROMPT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      ),
    }),
  ).toHaveCount(1);
  await expect(page.getByTestId(/^assistant-response-complete-/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('mentor-opener-persisted-once')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByTestId('mentor-opener-persisted-more-than-once'),
  ).toHaveCount(0);

  // Re-read the server-owned transcript before wrap-up. One opening exchange
  // is exactly one persisted learner event followed by one assistant event.
  const createHeaders = await createdResponse.request().allHeaders();
  const authorization = createHeaders.authorization;
  if (!authorization) {
    throw new Error('Session create request had no Authorization header');
  }
  const persistedHeaders: Record<string, string> = {
    Authorization: authorization,
  };
  const profileId = createHeaders['x-profile-id'];
  if (profileId) persistedHeaders['X-Profile-Id'] = profileId;
  const transcriptResponse = await page.request.get(
    `${apiBaseUrl}/v1/sessions/${createdSession.id}/transcript`,
    { headers: persistedHeaders },
  );
  expect(transcriptResponse.status()).toBe(200);
  const transcript = transcriptResponseSchema.parse(
    await transcriptResponse.json(),
  );
  expect(transcript.archived).toBe(false);
  if (transcript.archived) {
    throw new Error('First-session transcript was unexpectedly archived');
  }
  expect(transcript.session.exchangeCount).toBe(1);
  expect(transcript.exchanges).toHaveLength(2);
  expect(transcript.exchanges[0]).toMatchObject({
    role: 'user',
    content: FIRST_PROMPT,
  });
  expect(transcript.exchanges[0]?.eventId).toBeTruthy();
  expect(transcript.exchanges[1]?.role).toBe('assistant');
  expect(transcript.exchanges[1]?.eventId).toBeTruthy();
  expect(transcript.exchanges[1]?.eventId).not.toBe(
    transcript.exchanges[0]?.eventId,
  );
  expect(transcript.exchanges[1]?.content.trim().length).toBeGreaterThan(0);

  await endFirstSession(page);
  await fillTextInput(
    page.getByTestId('first-session-reflection-input'),
    FIRST_REFLECTION,
  );
  await pressableClick(page.getByTestId('first-session-wrap-submit'));
  await expect(page.getByTestId('first-session-wrap-receipt')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByTestId('first-session-wrap-celebration'),
  ).toBeVisible();

  await pressableClick(page.getByTestId('chat-shell-back'));
  await expect(page).toHaveURL(/\/mentor(?:\?.*)?$/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('mentor-cold-start-card')).toHaveCount(0);
  await expect(page.getByTestId('mentor-bar-input')).toBeEnabled();
});
