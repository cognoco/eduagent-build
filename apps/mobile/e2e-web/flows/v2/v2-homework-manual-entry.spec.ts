import { expect, test, type Page, type Request } from '@playwright/test';

import type { LearningSessionResponse } from '@eduagent/schemas';

import { apiBaseUrl } from '../../helpers/runtime';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';

const MANUAL_HOMEWORK_PROBLEM = 'Solve 3x + 7 = 22';

test.use({ storageState: { cookies: [], origins: [] } });

function isSessionCreate(request: Request): boolean {
  const pathname = new URL(request.url()).pathname;
  return (
    request.method() === 'POST' &&
    /^\/v1\/subjects\/[^/]+\/sessions$/.test(pathname)
  );
}

async function openManualEntryFromMentor(page: Page): Promise<void> {
  await pressableClick(page.getByTestId('mentor-bar-homework-chip'));
  await expect(page.getByTestId('manual-entry-button')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('manual-entry-button'));
  await expect(page.getByTestId('result-text-input')).toBeVisible({
    timeout: 15_000,
  });
}

test('V2 Mentor trial-active manual homework creates one associated session, receives help, and returns to Mentor', async ({
  page,
}) => {
  const seed = await seedAndSignIn(page, {
    scenario: 'trial-active',
    alias: 'wi-2236-manual-homework',
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  });
  const sessionCreateRequests: Request[] = [];
  page.on('request', (request) => {
    if (isSessionCreate(request)) sessionCreateRequests.push(request);
  });

  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('mentor-bar-input')).toBeEnabled();

  // Case 1 — cancel from manual entry. This must return to a usable Mentor
  // without allocating a homework session.
  await openManualEntryFromMentor(page);
  await expect(page.getByTestId('manual-entry-cancel')).toBeVisible();
  await pressableClick(page.getByTestId('manual-entry-cancel'));
  await expect(page).toHaveURL(/\/mentor(?:\?.*)?$/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible();
  await expect(page.getByTestId('mentor-bar-input')).toBeEnabled();
  expect(sessionCreateRequests).toHaveLength(0);

  // Case 2 — enter one visible manual problem and resolve its subject through
  // whichever real classification result staging returns.
  await openManualEntryFromMentor(page);
  await expect(page.getByTestId('result-text-input')).toHaveValue('');
  await fillTextInput(
    page.getByTestId('result-text-input'),
    MANUAL_HOMEWORK_PROBLEM,
  );
  await expect(page.getByTestId('result-text-input')).toHaveValue(
    MANUAL_HOMEWORK_PROBLEM,
  );

  const confirm = page.getByTestId('confirm-button');
  const seededSubject = page.getByTestId(`subject-pick-${seed.ids.subjectId}`);
  await expect(confirm.or(seededSubject)).toBeVisible({ timeout: 60_000 });
  if (await seededSubject.isVisible().catch(() => false)) {
    await pressableClick(seededSubject);
  } else {
    await pressableClick(confirm);
  }

  await expect(page.getByTestId('session-screen')).toBeVisible({
    timeout: 30_000,
  });
  // Staging may resolve the enrolled seed through the picker or auto-create
  // the classifier's suggested subject. Bind the session to the subject that
  // this exact browser journey actually resolved.
  const resolvedSubjectId = new URL(page.url()).searchParams.get('subjectId');
  expect(resolvedSubjectId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  await expect(page.getByTestId('homework-problem-text-bubble')).toHaveText(
    MANUAL_HOMEWORK_PROBLEM,
  );
  await expect(page.getByTestId('homework-help-me-solve')).toBeEnabled();

  const created = page.waitForResponse(
    (response) =>
      isSessionCreate(response.request()) && response.status() === 201,
    { timeout: 60_000 },
  );
  await pressableClick(page.getByTestId('homework-help-me-solve'));
  const createdResponse = await created;
  const createdSession = (
    (await createdResponse.json()) as LearningSessionResponse
  ).session;
  const createdRequest = createdResponse.request();
  const requestSubjectId = new URL(createdRequest.url()).pathname.match(
    /^\/v1\/subjects\/([^/]+)\/sessions$/,
  )?.[1];
  expect(createdSession.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  expect(requestSubjectId).toBe(resolvedSubjectId);
  expect(createdRequest.postDataJSON()).toMatchObject({
    subjectId: resolvedSubjectId,
    sessionType: 'homework',
    metadata: {
      effectiveMode: 'homework',
      homework: {
        problemCount: 1,
        currentProblemIndex: 0,
        problems: [
          {
            text: MANUAL_HOMEWORK_PROBLEM,
            source: 'manual',
            status: 'active',
          },
        ],
      },
    },
  });
  expect(createdSession.subjectId).toBe(resolvedSubjectId);

  await expect(page.getByTestId('homework-problem-progress')).toHaveText(
    'Problem 1 of 1',
  );
  await expect(page.getByTestId('homework-problem-text')).toHaveText(
    MANUAL_HOMEWORK_PROBLEM,
  );
  await expect(page.getByTestId('message-bubble-user-1')).toHaveText(
    MANUAL_HOMEWORK_PROBLEM,
  );
  await expect(
    page.getByTestId('homework-first-response-complete'),
  ).toBeVisible({ timeout: 60_000 });
  const firstHomeworkReply = page.getByTestId('message-bubble-assistant-2');
  await expect(firstHomeworkReply).not.toHaveText(/^\s*$/);
  await expect(page.getByTestId(/^session-reconnect-/)).toHaveCount(0);

  expect(sessionCreateRequests).toHaveLength(1);

  // Re-read the persisted record through the real session endpoint after the
  // assistant reply. Reuse the app request's auth/profile scope in memory only;
  // neither value is emitted to test output or evidence.
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

  const persistedResponse = await page.request.get(
    `${apiBaseUrl}/v1/sessions/${createdSession.id}`,
    { headers: persistedHeaders },
  );
  expect(persistedResponse.status()).toBe(200);
  const persistedSession = (
    (await persistedResponse.json()) as LearningSessionResponse
  ).session;
  expect(persistedSession.id).toBe(createdSession.id);
  expect(persistedSession.subjectId).toBe(resolvedSubjectId);
  expect(persistedSession.sessionType).toBe('homework');
  expect(persistedSession.metadata?.homework?.problemCount).toBe(1);
  expect(persistedSession.metadata?.homework?.currentProblemIndex).toBe(0);
  expect(persistedSession.metadata?.homework?.problems).toHaveLength(1);
  expect(persistedSession.metadata?.homework?.problems[0]).toMatchObject({
    text: MANUAL_HOMEWORK_PROBLEM,
    source: 'manual',
  });
  expect(sessionCreateRequests).toHaveLength(1);

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('End session?');
    await dialog.accept();
  });
  await pressableClick(page.getByTestId('finish-homework-chip'));
  await expect(page.getByTestId('first-session-wrap-up')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('chat-shell-back'));

  await expect(page).toHaveURL(/\/mentor(?:\?.*)?$/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('mentor-bar-input')).toBeEnabled();
  expect(sessionCreateRequests).toHaveLength(1);
});
