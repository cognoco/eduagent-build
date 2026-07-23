import { expect, test, type Page, type Route } from '@playwright/test';
import type {
  CreateSubjectWithStructureResponse,
  Subject,
  SubjectResolveResult,
} from '@eduagent/schemas';

import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';
import {
  PHOTOSYNTHESIS_BOOK_ID,
  PHOTOSYNTHESIS_FIXTURE_TIMESTAMP,
  PHOTOSYNTHESIS_SESSION_ID,
  PHOTOSYNTHESIS_SUBJECT_ID,
  PHOTOSYNTHESIS_TOPIC_ID,
  photosynthesisSession,
} from './v2-subjects-fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function photosynthesisSubject(profileId: string): Subject {
  return {
    id: PHOTOSYNTHESIS_SUBJECT_ID,
    profileId,
    name: 'Photosynthesis',
    rawInput: 'Photosynthesis',
    status: 'active',
    curriculumStatus: 'ready',
    pedagogyMode: 'socratic',
    languageCode: null,
    createdAt: PHOTOSYNTHESIS_FIXTURE_TIMESTAMP,
    updatedAt: PHOTOSYNTHESIS_FIXTURE_TIMESTAMP,
  };
}

async function expectSubjectsPath(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/subjects(?:\?.*)?$/);
  await expect(
    page.locator('[data-testid="subjects-screen"]:visible'),
  ).toHaveCount(1, { timeout: 60_000 });
}

async function seedAndOpenSubjects(
  page: Page,
  options: { scenario: string; alias: string },
) {
  const seed = await seedAndSignIn(page, {
    ...options,
    landingTestId: 'mentor-screen',
    landingPath: '/mentor',
  });
  await page.goto('/subjects', { waitUntil: 'commit' });
  await expectSubjectsPath(page);
  return seed;
}

async function expectSubjectRow(
  page: Page,
  subjectId: string,
  subjectName: string,
): Promise<void> {
  const row = page
    .locator('[data-testid="subjects-screen"]:visible')
    .getByTestId(`subjects-browse-row-${subjectId}`);
  await expect(row.getByText(subjectName, { exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

async function expectExactSubjectBrowseRows(
  page: Page,
  expectedByStatus: Readonly<
    Record<
      'active' | 'paused' | 'archived',
      readonly {
        id: string;
        name: string;
      }[]
    >
  >,
): Promise<void> {
  const expectedRows = Object.entries(expectedByStatus).flatMap(
    ([status, rows]) => rows.map((row) => ({ status, ...row })),
  );
  const actualIds: string[] = [];

  for (const status of ['active', 'paused', 'archived'] as const) {
    const rows = expectedByStatus[status];
    const statusGroup = page.getByTestId(
      `subjects-browse-status-group-${status}`,
    );
    const statusRows = statusGroup.locator(
      '[data-testid^="subjects-browse-row-"]',
    );
    await expect(statusRows).toHaveCount(rows.length, { timeout: 60_000 });

    for (const row of rows) {
      const rowLocator = statusGroup.getByTestId(
        `subjects-browse-row-${row.id}`,
      );
      await expect(rowLocator.getByText(row.name, { exact: true })).toBeVisible(
        { timeout: 60_000 },
      );
    }
    actualIds.push(
      ...(await statusRows.evaluateAll((elements) =>
        elements.map((element) => {
          const testId = element.getAttribute('data-testid');
          if (!testId) throw new Error('Subject row is missing its test ID');
          return testId;
        }),
      )),
    );
  }

  const expectedIds = expectedRows.map(({ id }) => `subjects-browse-row-${id}`);
  expect(actualIds).toHaveLength(expectedIds.length);
  expect(new Set(actualIds).size).toBe(actualIds.length);
  expect([...actualIds].sort()).toEqual([...expectedIds].sort());
}

async function expectSubjectHub(
  page: Page,
  subjectId: string,
  subjectName: string,
): Promise<void> {
  await expect(page).toHaveURL(
    new RegExp(`/subject-hub/${subjectId}(?:\\?.*)?$`),
  );
  await expect(page.getByTestId('subject-hub-screen')).toBeVisible({
    timeout: 60_000,
  });
  const title = page.getByTestId(`subject-hub-title-${subjectId}`);
  await expect(title).toBeVisible();
  await expect(title).toHaveText(subjectName);
}

async function expectMeIdentity(
  page: Page,
  displayName: string,
  profileId: string,
  options: { expectSubjectsReturn?: boolean } = {},
): Promise<void> {
  await pressableClick(
    page.locator('[data-testid="account-avatar-button"]:visible'),
  );
  await expect(
    page.locator('[data-testid="account-screen"]:visible'),
  ).toBeVisible({ timeout: 60_000 });
  const accountProfile = page.locator(
    '[data-testid="account-admin-profile"]:visible',
  );
  await expect(
    accountProfile.getByText(displayName, { exact: true }),
  ).toBeVisible();
  await pressableClick(accountProfile);
  await expect(
    page.locator('[data-testid="profiles-screen"]:visible'),
  ).toBeVisible({ timeout: 60_000 });
  const activeProfile = page
    .getByTestId(`profile-row-${profileId}`)
    .filter({ visible: true });
  await expect(
    activeProfile.getByText(displayName, { exact: true }),
  ).toBeVisible();
  await expect(activeProfile.getByTestId('profile-active-check')).toBeVisible();
  await pressableClick(page.locator('[data-testid="profiles-close"]:visible'));
  await expect(
    page.locator('[data-testid="account-screen"]:visible'),
  ).toBeVisible({ timeout: 60_000 });
  await pressableClick(page.locator('[data-testid="account-back"]:visible'));
  if (options.expectSubjectsReturn !== false) {
    await expectSubjectsPath(page);
  }
}

async function expectSessionIdentity(
  page: Page,
  expected: {
    subjectId: string;
    topicId: string;
    sessionId: string;
  },
): Promise<void> {
  await expect(page.getByTestId('session-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        pathname: url.pathname,
        subjectId: url.searchParams.get('subjectId'),
        topicId: url.searchParams.get('topicId'),
        sessionId: url.searchParams.get('sessionId'),
      };
    })
    .toEqual({ pathname: '/session', ...expected });
}

async function mockFocusedFirstSubjectCreation(
  page: Page,
  profileId: string,
): Promise<void> {
  const subject = photosynthesisSubject(profileId);
  let created = false;

  await page.route('**/v1/subjects/resolve', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    const response: SubjectResolveResult = {
      status: 'direct_match',
      resolvedName: subject.name,
      suggestions: [],
      displayMessage: 'Photosynthesis is ready to study.',
      isLanguageLearning: false,
      detectedLanguageCode: null,
      detectedLanguageName: null,
    };
    await fulfillJson(route, response);
  });

  await page.route(/\/v1\/subjects(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname !== '/v1/subjects') {
      await route.continue();
      return;
    }

    if (request.method() === 'GET') {
      await fulfillJson(route, { subjects: created ? [subject] : [] });
      return;
    }

    if (request.method() === 'POST') {
      created = true;
      const response: CreateSubjectWithStructureResponse = {
        subject,
        structureType: 'focused_book',
        bookId: PHOTOSYNTHESIS_BOOK_ID,
        bookTitle: 'Photosynthesis foundations',
        bookCount: 1,
        topicCount: 1,
      };
      await fulfillJson(route, response, 201);
      return;
    }

    await route.continue();
  });

  await page.route(
    `**/v1/subjects/${PHOTOSYNTHESIS_SUBJECT_ID}/sessions/first-curriculum`,
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await fulfillJson(route, { session: photosynthesisSession() }, 201);
    },
  );
}

test('WI-2238 multi-subject case: exact status rows, Physics search/no-result clear, and browser Back preserve Physics + Me identity', async ({
  page,
}) => {
  const seed = await seedAndOpenSubjects(page, {
    scenario: 'multi-subject',
    alias: 'v2-subjects-multi',
  });
  const activeSubjectId = seed.ids.activeSubjectId;
  const pausedSubjectId = seed.ids.pausedSubjectId;
  const archivedSubjectId = seed.ids.archivedSubjectId;
  if (!activeSubjectId || !pausedSubjectId || !archivedSubjectId) {
    throw new Error(
      'multi-subject seed did not return active, paused, and archived subject IDs',
    );
  }

  const expectedRows = {
    active: [{ id: activeSubjectId, name: 'Physics' }],
    paused: [{ id: pausedSubjectId, name: 'Literature' }],
    archived: [{ id: archivedSubjectId, name: 'Art History' }],
  } as const;
  await expectExactSubjectBrowseRows(page, expectedRows);

  const search = page.getByTestId('subjects-browse-search');
  await fillTextInput(search, 'Physics');
  const physicsResult = page.getByTestId(
    `search-subject-row-${activeSubjectId}`,
  );
  await expect(physicsResult.getByText('Physics', { exact: true })).toBeVisible(
    { timeout: 60_000 },
  );
  await pressableClick(physicsResult);
  await expectSubjectHub(page, activeSubjectId, 'Physics');

  await page.goBack();
  await expectSubjectsPath(page);
  await expect(
    page
      .getByTestId(`search-subject-row-${activeSubjectId}`)
      .getByText('Physics', { exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expectMeIdentity(page, 'Multi-Subject Learner', seed.profileId);

  await fillTextInput(search, 'impossible-wi-2238-subject');
  await expect(page.getByTestId('library-search-empty')).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page
      .getByTestId('search-results-empty')
      .getByText('No results for "impossible-wi-2238-subject"', {
        exact: true,
      }),
  ).toBeVisible();
  await pressableClick(page.getByTestId('library-search-clear-results'));
  await expect(search).toHaveValue('');
  await expectExactSubjectBrowseRows(page, expectedRows);
});

test('WI-2238 learning-active case: exact World History resume IDs and visible session Back restore Subjects + Active Learner Me identity', async ({
  page,
}) => {
  const seed = await seedAndOpenSubjects(page, {
    scenario: 'learning-active',
    alias: 'v2-subjects-resume',
  });
  const subjectId = seed.ids.subjectId;
  const topicId = seed.ids.topicId;
  const sessionId = seed.ids.sessionId;
  if (!subjectId || !topicId || !sessionId) {
    throw new Error(
      'learning-active seed did not return subjectId, topicId, and sessionId',
    );
  }

  await expectSubjectRow(page, subjectId, 'World History');
  await pressableClick(page.getByTestId(`subjects-browse-row-${subjectId}`));
  await expectSubjectHub(page, subjectId, 'World History');
  const nextUp = page.getByTestId('subject-hub-next-up');
  await expect(
    nextUp.getByText('World History Topic 1', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('subject-hub-next-up-primary')).toHaveText(
    'Resume',
  );

  await pressableClick(page.getByTestId('subject-hub-next-up-action'));
  await expectSessionIdentity(page, { subjectId, topicId, sessionId });
  await pressableClick(page.getByTestId('chat-shell-back'));

  await expectSubjectsPath(page);
  await expectSubjectRow(page, subjectId, 'World History');
  await expectMeIdentity(page, 'Active Learner', seed.profileId);
});

test('WI-2238 retention-due case: exact Biology Topic 1 review and visible Back controls restore Biology Hub, Subjects, and Review Learner Me identity', async ({
  page,
}) => {
  const seed = await seedAndOpenSubjects(page, {
    scenario: 'retention-due',
    alias: 'v2-subjects-review',
  });
  const subjectId = seed.ids.subjectId;
  const topicId = seed.ids.topicId;
  if (!subjectId || !topicId) {
    throw new Error('retention-due seed did not return subjectId and topicId');
  }

  await expectSubjectRow(page, subjectId, 'Biology');
  await pressableClick(page.getByTestId(`subjects-browse-row-${subjectId}`));
  await expectSubjectHub(page, subjectId, 'Biology');
  const nextUp = page.getByTestId('subject-hub-next-up');
  await expect(
    nextUp.getByText('Biology Topic 1', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('subject-hub-next-up-primary')).toHaveText(
    'Review',
  );

  const biologyTopicRow = page.getByTestId(`subject-hub-topic-${topicId}`);
  await expect(biologyTopicRow).toBeVisible();
  await expect(
    biologyTopicRow.getByText('Biology Topic 1', { exact: true }),
  ).toBeVisible();

  await pressableClick(page.getByTestId('subject-hub-next-up-action'));
  await expect(page.getByTestId('topic-detail-scroll')).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        pathname: url.pathname,
        subjectId: url.searchParams.get('subjectId'),
      };
    })
    .toEqual({ pathname: `/topic/${topicId}`, subjectId });

  await pressableClick(page.getByTestId('topic-detail-back'));
  await expectSubjectHub(page, subjectId, 'Biology');
  await pressableClick(page.getByTestId('subject-hub-back'));
  await expectSubjectsPath(page);
  await expectSubjectRow(page, subjectId, 'Biology');
  await page.goBack();
  await expect(page).not.toHaveURL(
    new RegExp(`/subject-hub/${subjectId}(?:\\?.*)?$`),
  );
  await expectMeIdentity(page, 'Review Learner', seed.profileId, {
    expectSubjectsReturn: false,
  });
});

test('WI-2238 Subjects API recovery case: a visible failure stays recoverable and Retry restores the exact seeded World History row', async ({
  page,
}) => {
  let allowSubjects = false;
  await page.route(/\/v1\/subjects(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET' || url.pathname !== '/v1/subjects') {
      await route.continue();
      return;
    }
    if (allowSubjects) {
      await route.continue();
      return;
    }
    await fulfillJson(
      route,
      { message: 'Synthetic WI-2238 Subjects read failure' },
      503,
    );
  });

  const seed = await seedAndOpenSubjects(page, {
    scenario: 'learning-active',
    alias: 'v2-subjects-retry',
  });
  const subjectId = seed.ids.subjectId;
  if (!subjectId) {
    throw new Error('learning-active seed did not return subjectId');
  }

  await expect(page.getByTestId('subjects-browse-error')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('subjects-browse-retry')).toBeVisible();
  allowSubjects = true;
  await pressableClick(page.getByTestId('subjects-browse-retry'));
  await expectSubjectRow(page, subjectId, 'World History');
});

test('WI-2238 curriculum-preparing case: exact World History empty Hub and visible Back restore the same Subjects row', async ({
  page,
}) => {
  const seed = await seedAndOpenSubjects(page, {
    scenario: 'learning-active',
    alias: 'v2-subjects-preparing',
  });
  const subjectId = seed.ids.subjectId;
  if (!subjectId) {
    throw new Error('learning-active seed did not return subjectId');
  }
  await expectSubjectRow(page, subjectId, 'World History');

  await page.route(/\/v1\/subjects(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET' || url.pathname !== '/v1/subjects') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = (await response.json()) as { subjects: Subject[] };
    await route.fulfill({
      response,
      json: {
        subjects: payload.subjects.map((subject) =>
          subject.id === subjectId
            ? { ...subject, curriculumStatus: 'preparing' as const }
            : subject,
        ),
      },
    });
  });
  await page.route(`**/v1/subjects/${subjectId}/books`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await fulfillJson(route, { books: [] });
  });

  await pressableClick(page.getByTestId(`subjects-browse-row-${subjectId}`));
  const preparing = page.getByTestId('subject-hub-preparing');
  await expect(preparing).toBeVisible({ timeout: 60_000 });
  await expect(
    preparing.getByText('Building your World History curriculum…', {
      exact: true,
    }),
  ).toBeVisible();
  await pressableClick(page.getByTestId('subject-hub-preparing-back'));
  await expectSubjectsPath(page);
  await expectSubjectRow(page, subjectId, 'World History');
});

test('WI-2238 onboarding-no-subject case: Add creates exact Photosynthesis first session and visible exit returns only to V2 Subjects', async ({
  page,
}) => {
  const seed = await seedAndOpenSubjects(page, {
    scenario: 'onboarding-no-subject',
    alias: 'v2-subjects-first',
  });
  await mockFocusedFirstSubjectCreation(page, seed.profileId);

  const emptyState = page.getByTestId('subjects-browse-empty');
  await expect(
    emptyState.getByText('No subjects yet', { exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(/^subjects-browse-row-/)).toHaveCount(0);
  await expect(page.getByTestId('subjects-browse-create')).toBeVisible({
    timeout: 60_000,
  });
  await pressableClick(page.getByTestId('subjects-browse-create'));
  await expect(page.getByTestId('create-subject-name')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page).toHaveURL(/\/create-subject\?[^#]*returnTo=subjects/);

  await fillTextInput(
    page.getByTestId('create-subject-name'),
    'Photosynthesis',
  );
  await pressableClick(page.getByTestId('create-subject-submit'));
  await expect(page.getByTestId('ready-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page
      .getByTestId('ready-row-subject')
      .getByText('Starting with Photosynthesis', { exact: true }),
  ).toBeVisible();
  await expect(page.url()).not.toMatch(/\/(?:home|library)(?:\?|$)/);

  await pressableClick(page.getByTestId('ready-start'));
  await expectSessionIdentity(page, {
    subjectId: PHOTOSYNTHESIS_SUBJECT_ID,
    topicId: PHOTOSYNTHESIS_TOPIC_ID,
    sessionId: PHOTOSYNTHESIS_SESSION_ID,
  });
  await expect
    .poll(() => new URL(page.url()).searchParams.get('returnTo'))
    .toBe('subjects');
  await pressableClick(page.getByTestId('chat-shell-back'));

  await expectSubjectsPath(page);
  await expectSubjectRow(page, PHOTOSYNTHESIS_SUBJECT_ID, 'Photosynthesis');
  await expect(page.url()).not.toMatch(/\/(?:home|library)(?:\?|$)/);
  await expectMeIdentity(page, 'Test Learner', seed.profileId);
});
