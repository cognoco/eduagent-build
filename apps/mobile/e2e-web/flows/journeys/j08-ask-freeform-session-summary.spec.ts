import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';
import {
  mockJson,
  mockJsonForever,
  mockJsonSequence,
  mockSse,
} from '../../helpers/mock-api';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('J-08 learner → Ask → freeform chat → end session → summary → home', async ({
  page,
}) => {
  const seed = await readSeedData('solo-learner');
  const subjectId = seed.ids.subjectId;
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const summaryId = '11111111-1111-4111-8111-222222222222';
  const iso = '2026-04-20T10:00:00.000Z';

  await mockJson(page, {
    method: 'POST',
    pathname: '/v1/subjects/classify',
    response: {
      body: {
        candidates: [
          {
            subjectId,
            subjectName: 'General Studies',
            confidence: 0.98,
          },
        ],
        needsConfirmation: false,
        suggestedSubjectName: null,
      },
    },
  });
  await mockJson(page, {
    method: 'POST',
    pathname: new RegExp(`/v1/subjects/${subjectId}/sessions$`),
    response: {
      body: {
        session: {
          id: sessionId,
          subjectId,
          topicId: null,
          sessionType: 'learning',
          inputMode: 'text',
          verificationType: null,
          status: 'active',
          escalationRung: 1,
          exchangeCount: 0,
          startedAt: iso,
          lastActivityAt: iso,
          endedAt: null,
          durationSeconds: null,
          wallClockSeconds: null,
        },
      },
    },
  });
  await mockSse(page, {
    pathname: new RegExp(`/v1/sessions/${sessionId}/stream$`),
    response: {
      events: [
        {
          type: 'chunk',
          content: "Let's break it into simple steps so it feels manageable.",
        },
        {
          type: 'done',
          payload: {
            exchangeCount: 2,
            escalationRung: 1,
            expectedResponseMinutes: 2,
            confidence: 'high',
          },
        },
      ],
    },
  });
  await mockJsonForever(page, {
    pathname: '/v1/celebrations/pending',
    response: { body: { celebrations: [] } },
  });
  await mockJson(page, {
    method: 'POST',
    pathname: new RegExp(`/v1/sessions/${sessionId}/close$`),
    response: {
      body: {
        message: 'Session closed',
        sessionId,
        wallClockSeconds: 180,
        summaryStatus: 'pending',
      },
    },
  });
  await mockJson(page, {
    pathname: new RegExp(`/v1/sessions/${sessionId}/transcript$`),
    response: {
      body: {
        session: {
          sessionId,
          subjectId,
          topicId: null,
          sessionType: 'learning',
          inputMode: 'text',
          verificationType: null,
          startedAt: iso,
          exchangeCount: 2,
          milestonesReached: [],
          wallClockSeconds: 180,
        },
        exchanges: [
          {
            role: 'user',
            content: 'How do volcanoes erupt?',
            timestamp: iso,
          },
          {
            role: 'assistant',
            content: "Let's break it into simple steps so it feels manageable.",
            timestamp: '2026-04-20T10:00:05.000Z',
          },
        ],
      },
    },
  });
  await mockJsonSequence(page, {
    pathname: new RegExp(`/v1/sessions/${sessionId}/summary$`),
    responses: [
      { body: { summary: null } },
      {
        body: {
          summary: {
            id: summaryId,
            sessionId,
            content:
              'I learned that pressure builds up under the ground before the eruption.',
            aiFeedback: 'Nice work connecting the eruption to pressure.',
            status: 'submitted',
          },
        },
      },
    ],
  });
  await mockJson(page, {
    method: 'POST',
    pathname: new RegExp(`/v1/sessions/${sessionId}/summary$`),
    response: {
      body: {
        summary: {
          id: summaryId,
          sessionId,
          content:
            'I learned that pressure builds up under the ground before the eruption.',
          aiFeedback: 'Nice work connecting the eruption to pressure.',
          status: 'submitted',
        },
      },
    },
  });

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('intent-ask').click();
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('chat-input').fill('How do volcanoes erupt?');
  await page.getByTestId('send-button').click();
  await expect(page.getByText(/break it into simple steps/i)).toBeVisible({
    timeout: 30_000,
  });

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByTestId('end-session-button').click();
  await expect(page.getByTestId('filing-prompt-dismiss')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('filing-prompt-dismiss').click();

  await expect(page.getByTestId('summary-input')).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByTestId('summary-input')
    .fill(
      'I learned that pressure builds up under the ground before the eruption.'
    );
  await page.getByTestId('submit-summary-button').click();
  await expect(page.getByTestId('continue-button')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('continue-button').click();

  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
});
