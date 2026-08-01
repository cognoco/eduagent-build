import {
  expect,
  test,
  type Dialog,
  type Page,
  type Request,
  type Response as PlaywrightResponse,
} from '@playwright/test';

import {
  closeResultSchema,
  type LearningSessionResponse,
} from '@eduagent/schemas';

import { buildCloseBoundaryEvidence } from '../../helpers/close-boundary-evidence';
import { apiBaseUrl } from '../../helpers/runtime';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';

const MANUAL_HOMEWORK_PROBLEM = 'Solve 3x + 7 = 22';
const MANUAL_HOMEWORK_SUBJECT = 'Algebra';

test.use({ storageState: { cookies: [], origins: [] } });

function isSessionCreate(request: Request): boolean {
  const pathname = new URL(request.url()).pathname;
  return (
    request.method() === 'POST' &&
    /^\/v1\/subjects\/[^/]+\/sessions$/.test(pathname)
  );
}

function isSubjectCreate(request: Request): boolean {
  return (
    request.method() === 'POST' &&
    new URL(request.url()).pathname === '/v1/subjects'
  );
}

function isSessionClose(request: Request, sessionId: string): boolean {
  return (
    request.method() === 'POST' &&
    new URL(request.url()).pathname === `/v1/sessions/${sessionId}/close`
  );
}

async function openManualEntryFromMentor(page: Page): Promise<void> {
  await pressableClick(page.getByTestId('mentor-bar-homework-chip'));
  await expect(page.getByTestId('homework-entry-mode-manual')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('result-text-input')).toBeVisible({
    timeout: 15_000,
  });
}

test('[WI-2196] V2 Mentor manual homework creates the correct inline Subject and one associated session', async ({
  page,
}) => {
  const seed = await seedAndSignIn(page, {
    scenario: 'trial-active',
    alias: 'wi-2196-correct-homework-subject',
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

  // Case 2 — enter one visible manual problem, replace Mentor's unrelated
  // seeded Science subject, and create the correct Algebra subject inline.
  await openManualEntryFromMentor(page);
  await expect(page.getByTestId('result-text-input')).toHaveValue('');
  await fillTextInput(
    page.getByTestId('result-text-input'),
    MANUAL_HOMEWORK_PROBLEM,
  );
  await expect(page.getByTestId('result-text-input')).toHaveValue(
    MANUAL_HOMEWORK_PROBLEM,
  );

  await expect(
    page.getByTestId('homework-subject-resolution-ready'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('homework-subject-resolution-name')).toHaveText(
    'Science',
  );
  await pressableClick(page.getByTestId('homework-change-subject'));
  await expect(page.getByTestId('homework-subject-name-input')).toBeVisible({
    timeout: 15_000,
  });
  await fillTextInput(
    page.getByTestId('homework-subject-name-input'),
    MANUAL_HOMEWORK_SUBJECT,
  );
  const createdSubjectResponsePromise = page.waitForResponse(
    (response) =>
      isSubjectCreate(response.request()) && response.status() === 201,
    { timeout: 60_000 },
  );
  await pressableClick(page.getByTestId('homework-subject-resolve-button'));
  const createdSubjectResponse = await createdSubjectResponsePromise;
  const createdSubjectBody = (await createdSubjectResponse.json()) as {
    subject: { id: string; name: string; profileId: string };
  };
  expect(createdSubjectBody.subject.name).toBe(MANUAL_HOMEWORK_SUBJECT);
  expect(createdSubjectBody.subject.profileId).toBe(seed.profileId);
  expect(createdSubjectBody.subject.id).not.toBe(seed.ids.subjectId);
  await expect(
    page.getByTestId('homework-subject-resolution-ready'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('homework-subject-resolution-name')).toHaveText(
    MANUAL_HOMEWORK_SUBJECT,
  );
  const confirm = page.getByTestId('confirm-button');
  await expect(confirm).toBeEnabled();
  await pressableClick(confirm);

  await expect(page.getByTestId('session-screen')).toBeVisible({
    timeout: 30_000,
  });
  // Bind every association assertion to the subject created in this journey.
  const resolvedSubjectId = new URL(page.url()).searchParams.get('subjectId');
  expect(resolvedSubjectId).toBe(createdSubjectBody.subject.id);
  await expect(page.getByTestId('homework-problem-text-bubble')).toHaveText(
    MANUAL_HOMEWORK_PROBLEM,
  );
  await expect(page.getByTestId('homework-help-me-solve')).toBeEnabled();

  const created = page.waitForResponse(
    (response) =>
      isSessionCreate(response.request()) && response.status() === 201,
    { timeout: 60_000 },
  );
  await expect(page.getByTestId('session-subject-resolution')).toHaveCount(0);
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

  let recoveryDialogAppeared = false;
  const handleCloseDialog = async (dialog: Dialog): Promise<void> => {
    if (dialog.message().includes('End session?')) {
      await dialog.accept();
      return;
    }
    if (dialog.message().includes('Could not end this session cleanly')) {
      recoveryDialogAppeared = true;
    }
    await dialog.dismiss();
  };
  page.on('dialog', handleCloseDialog);

  let closeResponse: PlaywrightResponse | null = null;
  let closeResponseBody: unknown = null;
  try {
    const closeResponsePromise = page.waitForResponse(
      (response) => isSessionClose(response.request(), createdSession.id),
      { timeout: 30_000 },
    );
    await pressableClick(page.getByTestId('finish-homework-chip'));
    closeResponse = await closeResponsePromise;
    try {
      closeResponseBody = await closeResponse.json();
    } catch {
      closeResponseBody = null;
    }

    console.info(
      `[v2-close-boundary] ${JSON.stringify(
        buildCloseBoundaryEvidence({
          closeResponse: {
            status: closeResponse.status(),
            body: closeResponseBody,
          },
          pageUrl: page.url(),
          recoveryDialogAppeared,
        }),
      )}`,
    );

    await expect(page.getByTestId('first-session-wrap-up')).toBeVisible({
      timeout: 30_000,
    });
    expect(closeResponse.status()).toBe(200);
    expect(closeResultSchema.safeParse(closeResponseBody).success).toBe(true);
  } catch (error) {
    console.error(
      `[v2-close-boundary:failure] ${JSON.stringify(
        buildCloseBoundaryEvidence({
          closeResponse: closeResponse
            ? {
                status: closeResponse.status(),
                body: closeResponseBody,
              }
            : null,
          pageUrl: page.url(),
          recoveryDialogAppeared,
        }),
      )}`,
    );
    throw error;
  } finally {
    page.off('dialog', handleCloseDialog);
  }
  await pressableClick(page.getByTestId('chat-shell-back'));

  await expect(page).toHaveURL(/\/mentor(?:\?.*)?$/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('mentor-bar-input')).toBeEnabled();
  expect(sessionCreateRequests).toHaveLength(1);
});
