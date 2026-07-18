# WI-2192 — Quiz-results exit accessibility evidence

**Item:** WI-2192 — Expose quiz-results exit actions as accessible buttons

**Reviewed candidate before browser rework:**
`230b63e4ff63e28dfe095d73e61d14e1077a8e53`

**Rework base merged from `origin/main`:**
`3b0fa9337fb60cef7bba8383314b7a61c0abc54b`

**Browser-rework implementation candidate:**
`a0da9e01639c2987acf4ce601bea3f3af5e52cd8`

**Runtime:** Node 24.18.0 locally (the repository declares Node 22.x; CI is the
binding runtime check).

## Production-coupled browser coverage

The named defect case is:
`quiz-results exits are real named buttons with exact-once web activation`.

It renders `QuizResultsContent` from the production results route through the
guarded `/quiz/dev-only/results` route in the real quiz stack. Keeping the host
inside that stack is load-bearing: the real `QuizFlowProvider` state survives the
Play Again navigation to `/quiz/launch`. The host only exists when the web export
sets `EXPO_PUBLIC_E2E=true`; other builds redirect it to Home.

The test uses Chromium and the actual React Native Web DOM. It checks:

- exactly three buttons in DOM/testID order: Play Again, Done, View History;
- unique localized role/name lookup and the existing localized History hint;
- Tab focus order and a non-suppressed visible focus outline;
- Enter, Space, and pointer activation for every action;
- one exact recorded `push`/`replace` call plus the observable destination URL;
- `aria-disabled=true` after activation and suppression of a forced second
  keyboard/pointer activation; and
- History push → browser Back → focus return re-enables the results exits and
  permits a subsequent exact Play Again navigation.

The freeze-mode matrix supplies nine exact-once/disabled steps. The delegating
matrix supplies nine real-router destination steps, followed by one real
History-return recovery step. The old synthetic
`createDOMProps`/`PressResponder` proxy test was deleted because it stayed green
when production semantics were reverted.

Focused browser command (port 19016 avoided another session's local server):

```sh
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 E2E_ENV=staging \
  PLAYWRIGHT_WEB_PORT=19016 \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:19016 \
  PLAYWRIGHT_API_URL=https://api-stg.mentomate.com \
  EXPO_PUBLIC_API_URL=https://api-stg.mentomate.com \
  doppler run --project mentomate --config stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  --project=smoke-accessibility --workers=1 --retries=0 --reporter=list
```

Final restored output:

```text
✓ setup: seed onboarding-complete and capture solo-learner storage state
✓ setup: seed parent-multi-child and capture owner-with-children storage state
✓ smoke-accessibility: quiz-results exits are real named buttons with exact-once web activation
3 passed (2.1m)
```

## Acceptance-criteria map

- **AC-1 — localized role/name, focus order, and visible focus:** production
  semantics are in `apps/mobile/src/app/(app)/quiz/results.tsx`. Native
  role/name/order/hint assertions are in
  `apps/mobile/src/app/(app)/quiz/results.test.tsx`. Real DOM role/name/order,
  Tab-order, and visible-focus assertions are in
  `apps/mobile/e2e-web/flows/accessibility/quiz-results-exits.spec.ts`.
- **AC-2 — exactly-once activation and repeat suppression:** the synchronous
  shared navigation lock, focus-return reset, and disabled state are in
  `apps/mobile/src/app/(app)/quiz/results.tsx`. Native duplicate-press coverage is
  in `apps/mobile/src/app/(app)/quiz/results.test.tsx`. The browser matrix in
  `apps/mobile/e2e-web/flows/accessibility/quiz-results-exits.spec.ts` proves
  Enter, Space, and pointer behavior for all three actions, exact calls, real
  destinations, disabled state, repeat suppression, and recovery after returning
  from the pushed History route.
- **AC-3 — preserve rendering and deep links:** existing missed/perfect score,
  celebration, Play Again, Done, and Practice return-target cases remain in
  `apps/mobile/src/app/(app)/quiz/results.test.tsx`. The browser host delegates
  through the real Expo router from the real quiz layout and observes
  `/quiz/launch`, `/practice`, and `/quiz/history?returnTo=practice`.
- **AC-4 — load-bearing regression tests:** native coverage is in
  `apps/mobile/src/app/(app)/quiz/results.test.tsx`; production-coupled web
  coverage is in
  `apps/mobile/e2e-web/flows/accessibility/quiz-results-exits.spec.ts`; the
  captured unchanged-test cycles below prove both semantics and locking are
  load-bearing.

No locale files changed: all labels and the History hint reuse existing translation
keys.

## Browser RED → GREEN → revert-RED → restore-GREEN

The Playwright spec remained unchanged throughout these source-only reversions.

### Semantics RED

Removing only the three production role/name props (and the History hint) left the
screen visible but made the same browser test fail at its first DOM contract:

```text
Locator: getByTestId('quiz-results-screen').getByRole('button')
Expected: 3
Received: 0
1 failed, 2 setup tests passed
```

Restoring only those semantics returned the full real-browser matrix to green:

```text
3 passed (2.0m)
```

### Navigation-lock revert RED

With roles and names still present, removing only the synchronous navigation lock
left the button query green but failed the disabled contract after Enter:

```text
Locator: getByRole('button', { name: 'Play Again' })
Expected aria-disabled: "true"
Received: null
Step: Play Again: Enter disables repeats
1 failed, 2 setup tests passed
```

Restoring the lock returned the unchanged test to final green:

```text
3 passed (2.1m)
```

This is the required production-coupled semantics RED → GREEN → lock-revert RED →
restore GREEN sequence. Both isolated production removals fail the same named
browser case.

### History-return retained-instance GREEN → source-revert RED → restore-GREEN

The exact native regression is `re-enables exits when results regain focus after
a History push` in
`apps/mobile/src/app/(app)/quiz/results.test.tsx:319`. It activates History,
observes the rendered History control become disabled, drives the retained
results instance's focus-return boundary, then asserts the rendered control is
enabled before Play Again navigates exactly once. It does not assert that the
focus callback was registered; the callback is only a boundary driver at
`apps/mobile/src/app/(app)/quiz/results.test.tsx:342`.

With the production focus reset at
`apps/mobile/src/app/(app)/quiz/results.tsx:29`, the exact case passed:

```text
PASS apps/mobile/src/app/(app)/quiz/results.test.tsx
Tests:       13 skipped, 1 passed, 14 total
```

Removing only that production `useFocusEffect` reset while leaving the test
unchanged made the same case fail at its user-visible disabled-state assertion
(`apps/mobile/src/app/(app)/quiz/results.test.tsx:347`):

```text
Expected: { "disabled": false }
Received: { "disabled": true }
Tests:       1 failed, 13 skipped, 14 total
```

Restoring the production reset returned the unchanged exact case to green:

```text
PASS apps/mobile/src/app/(app)/quiz/results.test.tsx
Tests:       13 skipped, 1 passed, 14 total
```

The real Chromium case `quiz-results exits are real named buttons with
exact-once web activation` is at
`apps/mobile/e2e-web/flows/accessibility/quiz-results-exits.spec.ts:104`.
Its production-source-revert probe remained green, so it does not expose the
retained-instance failure and is not cited as the RED proof. After production
source was restored, the full Chromium project passed:

```text
✓ setup: seed onboarding-complete and capture solo-learner storage state
✓ setup: seed parent-multi-child and capture owner-with-children storage state
✓ smoke-accessibility: quiz-results exits are real named buttons with exact-once web activation
3 passed (2.0m)
```

## Native and repository verification

Initial native TDD, before the browser rework, captured a missing-role RED and
three missing-disabled-state REDs. The final focused native results suite is green:

```text
PASS apps/mobile/src/app/(app)/quiz/results.test.tsx
Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
```

The final verification commands and outputs are:

```text
pnpm exec tsc --build
  PASS (no output)

node --test apps/mobile/e2e-web/helpers/serve-exported-web-env.test.mjs
  2 passed

pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand \
  --runTestsByPath apps/mobile/src/app/screen-navigation.test.ts \
  'apps/mobile/src/app/(app)/quiz/results.test.tsx'
  2 suites passed; 102 tests passed

pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand \
  --forceExit --silent
  483 suites passed; 5,822 tests passed

pnpm check:i18n:orphans
  Checked 584 files; no findings

pnpm check:i18n
  All translation files are up to date

pnpm exec eslint apps/mobile
  0 errors; 48 pre-existing warnings

pnpm exec prettier --check <changed files>
  All matched files use Prettier code style
```

The first routed full mobile run reported `482 passed, 1 failed` suites and
`5,821 passed, 1 failed` tests. The sole failure was the new guarded host using an
`actualRouter.replace` local name that the static screen-navigation audit does not
recognize. Renaming that local to the canonical `router.replace` fixed the audit;
the targeted rerun above passed all 100 results-plus-navigation-audit tests, and
the final full rerun passed all 483 suites and 5,822 tests.

The first pushed candidate's pre-push gate also passed TypeScript, 88 API suites
(2,347 tests passed, 1 skipped), the then-focused two mobile suites (24 tests), and
i18n checks. Final rework push-hook evidence is recorded by the push that follows
the implementation commit.
