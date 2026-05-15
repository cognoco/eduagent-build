import { expect, test } from '@playwright/test';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { pressableClick } from '../../helpers/pressable';
import { fillTextInput } from '../../helpers/text-input';

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
 * This test asserts that the learner reaches the session chat with the
 * expected URL — i.e. that BUG-1000's "stuck on empty curriculum" symptom
 * cannot happen on the current flow.
 */
test('J-09 learner → Add a subject → language setup → session chat', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'onboarding-no-subject',
    alias: 'j09',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });

  // Empty learner home → create-subject screen
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
