# WI-2903 J-29 strict-locator red-green-revert evidence

Date: 2026-07-30  
Item: WI-2903 — Make J-29 supporter Journal identity assertions strict-locator safe  
Source fix: `c3f77385b7795dbf4730f099830b19483fb6dbda` (PR #2700)

## Fix under test

The three Journal identity assertions in
`apps/mobile/e2e-web/flows/journeys/j29-supporter-scope-journey.spec.ts` select the
supportee display name with `{ exact: true }`:

```ts
await expect(
  journalPlaceholder.getByText(richDisplayName, { exact: true })
).toBeVisible();

await expect(
  page.getByTestId('person-scope-journal-placeholder').getByText(
    richDisplayName,
    { exact: true }
  )
).toBeVisible();

await expect(
  page.getByTestId('person-scope-journal-placeholder').getByText(
    emptyDisplayName,
    { exact: true }
  )
).toBeVisible();
```

This prevents Playwright strict-mode collisions with adjacent shared-record
sentences that begin with the same supportee name.

## Command

Each capture used the sanctioned staging browser-E2E path, one worker, no retries,
and a distinct `PLAYWRIGHT_RUN_ID`:

```bash
CI=1 \
PLAYWRIGHT_SKIP_LOCAL_API=1 \
E2E_ENV=staging \
PLAYWRIGHT_RUN_ID=<capture-specific-id> \
PLAYWRIGHT_API_URL=https://api-stg.mentomate.com \
EXPO_PUBLIC_API_URL=https://api-stg.mentomate.com \
EXPO_PUBLIC_ENABLE_MODE_NAV=true \
EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true \
EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true \
doppler run --project mentomate --config stg -- \
corepack pnpm exec playwright test \
  -c apps/mobile/playwright.config.ts \
  apps/mobile/e2e-web/flows/journeys/j29-supporter-scope-journey.spec.ts \
  --project=later-phases \
  --workers=1 \
  --retries=0 \
  --reporter=list
```

No database integration test or direct database connection was used in this
ceremony.

## GREEN — landed fix present

Run ID: `wi2903-rgr-green-baseline`

```text
✓ 1 [setup] › auth.setup.ts › seed onboarding-complete and capture solo-learner storage state
✓ 2 [setup] › auth.setup.ts › seed parent-multi-child and capture owner-with-children storage state
✓ 3 [setup] › auth.setup.ts › seed v2-account-non-owner-child and capture non-owner-child storage state
✓ 4 [later-phases] › j29-supporter-scope-journey.spec.ts › J-29 supporter: Support hub -> person scope -> Mentor -> Subjects -> Journal -> Support hub, walls hold, relaunch preserves scope

4 passed (1.8m)
```

## RED — exact matching temporarily reverted

The three `{ exact: true }` options shown above were temporarily removed from the
working tree. No other product or test code was changed. Run ID:
`wi2903-rgr-revert-red`.

The journey reproduced the original strict-mode failure at its first Journal
identity assertion:

```text
1) [later-phases] › j29-supporter-scope-journey.spec.ts:29:5 ›
   J-29 supporter: Support hub -> person scope -> Mentor -> Subjects ->
   Journal -> Support hub, walls hold, relaunch preserves scope

Error: expect.toBeVisible: Error: strict mode violation:
getByTestId('person-scope-journal-placeholder').getByText('Test Supportee')
resolved to 2 elements:
    1) getByRole('heading', { name: 'Test Supportee', exact: true })
    2) getByRole('heading', { name: 'Test Supportee has 3 shareable updates.' })

  104 | await expect(
> 105 |   journalPlaceholder.getByText(richDisplayName)
      |                      ^
  106 | ).toBeVisible();

1 failed
3 passed (1.8m)
```

The failure is the intended discriminator: without exact matching, the locator
matches both the identity heading and the shared-record sentence.

## RESTORE — exact matching reapplied

The three `{ exact: true }` options were restored verbatim. A file-scoped
`git diff --exit-code` confirmed that the journey spec matched the landed source
before the restored run. Run ID: `wi2903-rgr-restored-green`.

```text
✓ 1 [setup] › auth.setup.ts › seed onboarding-complete and capture solo-learner storage state
✓ 2 [setup] › auth.setup.ts › seed parent-multi-child and capture owner-with-children storage state
✓ 3 [setup] › auth.setup.ts › seed v2-account-non-owner-child and capture non-owner-child storage state
✓ 4 [later-phases] › j29-supporter-scope-journey.spec.ts › J-29 supporter: Support hub -> person scope -> Mentor -> Subjects -> Journal -> Support hub, walls hold, relaunch preserves scope

4 passed (2.0m)
```

The ceremony left no source-code diff. The exact-match fix is load-bearing: its
temporary removal reproduces the two-element strict-mode collision, and restoring
it returns the same staging journey to green.
