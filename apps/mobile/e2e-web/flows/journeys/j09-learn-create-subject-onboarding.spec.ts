import { expect, test } from '@playwright/test';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { mockJsonForever, mockSseForever } from '../../helpers/mock-api';

test('J-09 learner → Learn → create subject → interview → curriculum → start session', async ({
  page,
}) => {
  const subjectId = '22222222-2222-4222-8222-222222222222';
  const topicId = '22222222-2222-4222-8222-333333333333';
  const bookId = '22222222-2222-4222-8222-444444444444';
  const curriculumId = '22222222-2222-4222-8222-555555555555';
  const profileId = '22222222-2222-4222-8222-666666666666';
  const iso = '2026-04-20T10:00:00.000Z';

  await mockJsonForever(page, {
    method: 'POST',
    pathname: '/v1/subjects/resolve',
    response: {
      body: {
        status: 'direct_match',
        resolvedName: 'Astronomy',
        focus: null,
        focusDescription: null,
        suggestions: [],
        displayMessage: 'Astronomy looks right for this topic.',
      },
    },
  });
  await mockJsonForever(page, {
    method: 'POST',
    pathname: '/v1/subjects',
    response: {
      body: {
        subject: {
          id: subjectId,
          profileId,
          name: 'Astronomy',
          rawInput: 'Astronomy',
          status: 'active',
          pedagogyMode: 'socratic',
          languageCode: null,
          createdAt: iso,
          updatedAt: iso,
        },
        structureType: 'narrow',
      },
    },
  });
  await mockJsonForever(page, {
    pathname: new RegExp(`/v1/subjects/${subjectId}/interview$`),
    response: { body: { state: null } },
  });
  await mockSseForever(page, {
    pathname: new RegExp(`/v1/subjects/${subjectId}/interview/stream$`),
    response: {
      events: [
        {
          type: 'chunk',
          content: 'You already notice patterns in the night sky.',
        },
        {
          type: 'done',
          payload: {
            exchangeCount: 1,
            isComplete: true,
          },
        },
      ],
    },
  });
  await mockJsonForever(page, {
    pathname: new RegExp(`/v1/subjects/${subjectId}/curriculum$`),
    response: {
      body: {
        curriculum: {
          id: curriculumId,
          subjectId,
          version: 1,
          generatedAt: iso,
          topics: [
            {
              id: topicId,
              title: 'Phases of the Moon',
              description: 'Understand why the moon appears to change shape.',
              sortOrder: 0,
              relevance: 'core',
              estimatedMinutes: 30,
              bookId,
              chapter: null,
              skipped: false,
              source: 'generated',
            },
          ],
        },
      },
    },
  });

  await seedAndSignIn(page, {
    scenario: 'onboarding-no-subject',
    alias: 'j09',
    landingTestId: 'create-subject-name',
    landingPath: '/create-subject',
  });

  await page.getByTestId('create-subject-name').fill('Astronomy');
  await page.getByTestId('create-subject-submit').click();

  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });
  await page
    .getByTestId('chat-input')
    .fill('I want to learn about stars and the moon.');
  await page.getByTestId('send-button').click();
  await expect(page.getByText(/night sky/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('view-curriculum-button')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('view-curriculum-button').click();
  await expect(page.getByTestId('analogy-preference-title')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('analogy-skip-button').click();
  await expect(page.getByTestId('accommodation-skip')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('accommodation-skip').click();
  await expect(page.getByTestId('start-learning-button')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('start-learning-button').click();
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/session(?:\?.*)?$/);
});
