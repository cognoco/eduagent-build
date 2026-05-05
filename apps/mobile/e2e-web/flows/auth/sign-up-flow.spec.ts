import { expect, test } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

/**
 * [BUG-754] Top-of-funnel sign-up coverage. The pre-existing
 * `auth-navigation.spec.ts` only proves links between auth screens; it never
 * actually exercises the sign-up form. This spec covers:
 *   - The form renders email + password + submit button + terms/privacy links.
 *   - The submit button is correctly disabled for empty / weak input.
 *   - The submit button enables once email and ≥8-char password are present.
 *   - Clicking submit visibly transitions the form into a loading state and
 *     issues a network call against Clerk (smoke for "submission actually
 *     fires"). We do not assert success — Clerk requires CLERK_TESTING_TOKEN
 *     to bypass bot detection, and that token is a placeholder in our env per
 *     project memory `feedback_e2e_setup.md`. The smoke is that the form
 *     wires through to Clerk; the verification screen / error path is left
 *     for a follow-up once the testing token lands.
 */

test.describe('[BUG-754] sign-up flow top-of-funnel', () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test('form renders with email, password, terms, and submit @smoke', async ({
    page,
  }) => {
    await page.goto('/sign-up', { waitUntil: 'commit' });

    await expect(page.getByTestId('sign-up-email')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('sign-up-password')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('sign-up-button')).toBeVisible({
      timeout: 30_000,
    });

    // Fallback to sign-in must always be available.
    await expect(page.getByTestId('sign-in-link')).toBeVisible();
  });

  test('submit button is disabled until email + ≥8-char password are entered', async ({
    page,
  }) => {
    await page.goto('/sign-up', { waitUntil: 'commit' });

    const submit = page.getByTestId('sign-up-button');
    await expect(submit).toBeVisible({ timeout: 60_000 });
    await expect(submit).toBeDisabled();

    // Email only — still disabled.
    await page.getByTestId('sign-up-email').fill('learner@example.com');
    await expect(submit).toBeDisabled();

    // Email + short password — still disabled (canSubmit requires >= 8 chars).
    await page.getByTestId('sign-up-password').fill('short');
    await expect(submit).toBeDisabled();

    // Email + valid-length password — enables.
    await page.getByTestId('sign-up-password').fill('Long-Enough-Pw1');
    await expect(submit).toBeEnabled();
  });

  test('clicking submit fires a request to Clerk and transitions to loading', async ({
    page,
  }) => {
    await page.goto('/sign-up', { waitUntil: 'commit' });

    await expect(page.getByTestId('sign-up-email')).toBeVisible({
      timeout: 60_000,
    });

    // Capture Clerk traffic so we can prove the form actually wires through
    // to the auth provider — without this, a regression that silently no-ops
    // the submit handler would render every other assertion in the suite a
    // tautology.
    const clerkRequest = page.waitForRequest(
      (req) =>
        /clerk\.(?:dev|com|accounts|services)/i.test(req.url()) &&
        req.method() !== 'OPTIONS',
      { timeout: 30_000 }
    );

    await page
      .getByTestId('sign-up-email')
      .fill(`bug754-${Date.now()}@example.com`);
    await page.getByTestId('sign-up-password').fill('A-Long-Password-1');
    await page.getByTestId('sign-up-button').click();

    // The button must visibly disable while loading so users do not double-
    // submit. We intentionally do not poll for the verification-code screen
    // here — Clerk rejects the request without a testing token in this env.
    await expect(page.getByTestId('sign-up-button')).toBeDisabled({
      timeout: 30_000,
    });

    await clerkRequest;
  });

  test('terms and privacy links are reachable from the sign-up screen', async ({
    page,
  }) => {
    await page.goto('/sign-up', { waitUntil: 'commit' });

    await expect(page.getByTestId('sign-up-email')).toBeVisible({
      timeout: 60_000,
    });

    // The links live in body copy, not behind a testID — locate by the
    // accessible text the user reads.
    const terms = page.getByRole('link', { name: /terms of service/i });
    const privacy = page.getByRole('link', { name: /privacy policy/i });
    await expect(terms).toBeVisible();
    await expect(privacy).toBeVisible();
  });
});
