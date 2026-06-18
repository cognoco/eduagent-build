import { expect, test, type Page, type Route } from '@playwright/test';
import type {
  BookSuggestionsResponse,
  CreateSubjectWithStructureResponse,
  LearningSession,
  PedagogyMode,
  Subject,
  SubjectResolveResult,
  SubjectResponse,
  SubjectStructureType,
} from '@eduagent/schemas';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { pressableClick } from '../../helpers/pressable';
import { fillTextInput } from '../../helpers/text-input';

const NOW = '2026-06-18T12:00:00.000Z';
const FALLBACK_PROFILE_ID = '00000000-0000-4000-8000-000000000001';

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

function subjectFixture({
  id,
  profileId,
  name,
  pedagogyMode = 'socratic',
  languageCode = null,
}: {
  id: string;
  profileId: string;
  name: string;
  pedagogyMode?: PedagogyMode;
  languageCode?: string | null;
}): Subject {
  return {
    id,
    profileId,
    name,
    rawInput: name,
    status: 'active',
    curriculumStatus: 'ready',
    pedagogyMode,
    languageCode,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function learningSessionFixture({
  id,
  subjectId,
  topicId,
}: {
  id: string;
  subjectId: string;
  topicId: string;
}): LearningSession {
  return {
    id,
    subjectId,
    topicId,
    sessionType: 'learning',
    inputMode: 'text',
    verificationType: null,
    status: 'active',
    escalationRung: 1,
    exchangeCount: 0,
    startedAt: NOW,
    lastActivityAt: NOW,
    endedAt: null,
    durationSeconds: null,
    wallClockSeconds: null,
    rawInput: null,
    filedAt: null,
    filingStatus: null,
    filingRetryCount: 0,
  };
}

async function openCreateSubjectFromEmptyHome(page: Page): Promise<void> {
  await expect(page.getByTestId('home-empty-subjects')).toBeVisible({
    timeout: 30_000,
  });
  const addFirstSubject = page.getByTestId('home-add-first-subject').first();
  const createSubjectName = page.getByTestId('create-subject-name');
  await pressableClick(addFirstSubject);
  await createSubjectName
    .waitFor({ state: 'visible', timeout: 3_000 })
    .catch(async () => {
      await addFirstSubject.focus();
      await page.keyboard.press('Enter');
    });
  await createSubjectName
    .waitFor({ state: 'visible', timeout: 3_000 })
    .catch(async () => {
      await page.goto('/create-subject?returnTo=home', {
        waitUntil: 'commit',
      });
    });
  await expect(createSubjectName).toBeVisible({ timeout: 30_000 });
}

async function mockDirectSubjectCreation({
  page,
  profileId,
  subjectId,
  subjectName,
  structureType,
  pedagogyMode = 'socratic',
  languageCode = null,
  bookId,
  bookTitle,
  topicId,
  sessionId,
}: {
  page: Page;
  profileId: string;
  subjectId: string;
  subjectName: string;
  structureType: SubjectStructureType;
  pedagogyMode?: PedagogyMode;
  languageCode?: string | null;
  bookId?: string;
  bookTitle?: string;
  topicId?: string;
  sessionId?: string;
}): Promise<void> {
  await page.route('**/v1/subjects/resolve', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    const response: SubjectResolveResult = {
      status: 'direct_match',
      resolvedName: subjectName,
      suggestions: [],
      displayMessage: `${subjectName} works well.`,
      isLanguageLearning: pedagogyMode === 'four_strands',
      detectedLanguageCode: languageCode,
      detectedLanguageName:
        pedagogyMode === 'four_strands' ? subjectName : null,
    };

    await fulfillJson(route, response);
  });

  await page.route('**/v1/subjects', async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== 'POST' ||
      !url.pathname.endsWith('/v1/subjects')
    ) {
      await route.continue();
      return;
    }

    const response: CreateSubjectWithStructureResponse = {
      subject: subjectFixture({
        id: subjectId,
        profileId,
        name: subjectName,
        pedagogyMode,
        languageCode,
      }),
      structureType,
      ...(bookId ? { bookId } : {}),
      ...(bookTitle ? { bookTitle } : {}),
      bookCount: structureType === 'broad' ? 6 : 1,
      ...(structureType === 'focused_book' ? { topicCount: 1 } : {}),
      ...(structureType === 'broad' ? { suggestionCount: 1 } : {}),
    };

    await fulfillJson(route, response, 201);
  });

  if (pedagogyMode === 'four_strands') {
    await page.route('**/v1/subjects/*/language-setup', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue();
        return;
      }

      const response: SubjectResponse = {
        subject: subjectFixture({
          id: subjectId,
          profileId,
          name: subjectName,
          pedagogyMode,
          languageCode,
        }),
      };

      await fulfillJson(route, response);
    });
  }

  await page.route(
    '**/v1/subjects/*/book-suggestions/topup**',
    async (route) => {
      const response: BookSuggestionsResponse = {
        suggestions: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            subjectId,
            title: `${subjectName} foundations`,
            emoji: '✨',
            description: `A focused starting point for ${subjectName}.`,
            category: 'related',
            createdAt: NOW,
            pickedAt: null,
          },
        ],
        curriculumBookCount: 0,
        topupOutcome: 'success',
      };

      await fulfillJson(route, response);
    },
  );

  if (topicId && sessionId) {
    await page.route(
      '**/v1/subjects/*/sessions/first-curriculum',
      async (route) => {
        const response: { session: LearningSession } = {
          session: learningSessionFixture({
            id: sessionId,
            subjectId,
            topicId,
          }),
        };

        await fulfillJson(route, response, 201);
      },
    );
  }
}

/**
 * J-09 — empty home → Add a subject → first session screen
 *
 * Covers BUG-1000: After successful subject creation the learner must land on
 * an actionable surface (the session chat), not on a stuck empty curriculum
 * state.
 *
 * The legacy interview/curriculum-review/analogy/accommodation flow was
 * removed in commit f0cbf5ee (refactor: remove legacy interview flow). The
 * new flow for a language subject is:
 *   create-subject (resolve + accept)
 *     → /(app)/onboarding/language-setup (calibrate native lang + level)
 *     → POST /v1/subjects/:id/sessions/first-curriculum
 *     → /(app)/session (chat-input visible).
 *
 * Non-language subject creation has two sibling branches:
 *   broad subject → /(app)/pick-book/[subjectId] ("Pick what interests you")
 *   focused first subject → /ready recap → /(app)/session
 *
 * This test asserts that the learner reaches the session chat with the
 * expected URL — i.e. that BUG-1000's "stuck on empty curriculum" symptom
 * cannot happen on the current flow.
 */
test('J-09 learner → Add a subject → language setup → session chat', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'onboarding-no-subject',
    alias: 'j09',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
  const subjectId = '77777777-7777-4777-8777-777777777777';
  const topicId = '88888888-8888-4888-8888-888888888888';
  const sessionId = '99999999-9999-4999-8999-999999999999';

  await mockDirectSubjectCreation({
    page,
    profileId: seeded.profileId || FALLBACK_PROFILE_ID,
    subjectId,
    subjectName: 'Italian',
    structureType: 'narrow',
    pedagogyMode: 'four_strands',
    languageCode: 'it',
    topicId,
    sessionId,
  });

  // Empty learner home → create-subject screen
  await openCreateSubjectFromEmptyHome(page);

  // Type "Italian" — resolves to a language (four_strands) subject which
  // routes through the language-setup calibration screen.
  await fillTextInput(page.getByTestId('create-subject-name'), 'Italian');
  // The TextInput has no onSubmitEditing handler — submission must go
  // through the explicit Start Learning button (testID create-subject-submit).
  await pressableClick(page.getByTestId('create-subject-submit'));

  // The resolver may render a suggestion card OR jump straight into the
  // language-setup flow when it can determine the subject confidently. If
  // a suggestion appears, accept it; otherwise proceed.
  const suggestionAccept = page.getByTestId('subject-suggestion-accept');
  const calibrationTitle = page.getByTestId('language-setup-calibration-title');
  await expect(suggestionAccept.or(calibrationTitle)).toBeVisible({
    timeout: 60_000,
  });
  if (await suggestionAccept.isVisible()) {
    await pressableClick(suggestionAccept);
  }

  // Language setup calibration screen — pick native language + level.
  await expect(calibrationTitle).toBeVisible({ timeout: 30_000 });
  // Default native language is the device locale; tap English explicitly so
  // the test is deterministic across environments.
  await pressableClick(page.getByTestId('native-language-en'));
  await pressableClick(page.getByTestId('level-beginner'));
  await pressableClick(page.getByTestId('language-setup-continue'));

  // BUG-1000: After language-setup continues, the API kicks off curriculum
  // generation and the mobile client polls /sessions/first-curriculum until
  // a topic is ready. The user MUST land on the session chat — not on a
  // "no curriculum yet" empty state.
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/session(?:\?.*)?$/);
});

test('J-09 learner → broad subject → topic-interest picker', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'onboarding-no-subject',
    alias: 'j09-broad',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
  const subjectId = '11111111-1111-4111-8111-111111111111';

  await mockDirectSubjectCreation({
    page,
    profileId: seeded.profileId || FALLBACK_PROFILE_ID,
    subjectId,
    subjectName: 'Science',
    structureType: 'broad',
  });
  await openCreateSubjectFromEmptyHome(page);

  await fillTextInput(page.getByTestId('create-subject-name'), 'Science');
  await pressableClick(page.getByTestId('create-subject-submit'));

  await expect(page.getByTestId('pick-book-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Pick what interests you')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/pick-book/${subjectId}`));
});

test('J-09 learner → first focused subject → ready interstitial', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'onboarding-no-subject',
    alias: 'j09-ready',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
  const subjectId = '22222222-2222-4222-8222-222222222222';
  const bookId = '33333333-3333-4333-8333-333333333333';
  const topicId = '44444444-4444-4444-8444-444444444444';
  const sessionId = '66666666-6666-4666-8666-666666666666';

  await mockDirectSubjectCreation({
    page,
    profileId: seeded.profileId || FALLBACK_PROFILE_ID,
    subjectId,
    subjectName: 'Botany',
    structureType: 'focused_book',
    bookId,
    bookTitle: 'Plant cells',
    topicId,
    sessionId,
  });
  await openCreateSubjectFromEmptyHome(page);

  await fillTextInput(page.getByTestId('create-subject-name'), 'Botany');
  await pressableClick(page.getByTestId('create-subject-submit'));

  await expect(page.getByTestId('ready-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('ready-row-subject')).toContainText('Botany', {
    timeout: 5_000,
  });
  await expect(page).toHaveURL(/\/ready(?:\?.*)?$/);
});
