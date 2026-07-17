# WI-2182 — BottomSheet backdrop and keyboard verification

**Item:** WI-2182 — Separate BottomSheet backdrop dismissal from interactive
sheet content.

**Named defects:**

1. The backdrop close control owned the sheet content in the accessibility tree,
   so interactive controls could be announced as part of the dismiss action.
2. The first web keyboard test manufactured an unconditional `.click()` after a
   synthetic key event. That shim could pass even when Enter or Space had no browser
   default action.

## Provenance

- **Verified base:** `3b0fa9337fb60cef7bba8383314b7a61c0abc54b`
  (`origin/main` after the additive merge).
- **Verified implementation candidate:**
  `9eb280d462a4df7cb12110282de2107ce225c17f`.
- **Implementation commit added in review cycle 3:**
  `2898f76edb1e28e55c4379884024c17dade3e243`.
- This document is a documentation-only descendant of the verified implementation
  candidate. Review should use the submitted branch head while treating the exact
  candidate above as the tree exercised by the post-merge commands below.

## Implementation and executable guards

- `apps/mobile/src/components/common/BottomSheet.tsx:64` constructs the backdrop
  independently; `apps/mobile/src/components/common/BottomSheet.tsx:93` renders it
  as a sibling of the sheet surface. The close seam remains
  `apps/mobile/src/components/common/BottomSheet.tsx:80`.
- `apps/mobile/src/components/common/BottomSheet.test.tsx:141` verifies the native
  accessibility-tree sibling contract, while
  `apps/mobile/src/components/common/BottomSheet.test.tsx:205` verifies that child
  press, input, scroll, and touch gestures do not dismiss the sheet.
- `apps/mobile/src/components/common/BottomSheet.web.test.tsx:35` renders the real
  `react-native-web` Modal. Lines 85–89 verify native HTML buttons and sibling
  ownership; lines 92–112 verify pointer dismissal, Escape, and independent child
  actions without a keyboard-to-click shim.
- `apps/mobile/src/components/library/TopicPickerSheet.tsx:31` is the production
  consumer used by the browser proof.
- `apps/mobile/src/app/dev-only/bottom-sheet-keyboard.tsx:7` gates the proof host to
  E2E builds, line 21 routes non-E2E builds away, and lines 40–41 expose independent
  action and dismissal counters through rendered UI.
- `apps/mobile/e2e-web/flows/journeys/j27-bottom-sheet-keyboard.spec.ts:3` is the
  real Chromium regression. Lines 18–19 require actual `BUTTON` elements; lines
  22–34 press Enter and Space directly and assert exact counter transitions.

## RED — keyboard shim removed

The unconditional `.click()` helper was removed before replacing its claim with
the browser test. The existing focused jsdom assertion was then run unchanged:

```bash
CI=1 pnpm exec jest --config apps/mobile/jest.config.cjs \
  apps/mobile/src/components/common/BottomSheet.web.test.tsx \
  --runInBand --forceExit
```

The backdrop Enter case failed because jsdom did not perform the browser default
button activation that the removed helper had manufactured:

```text
Expected number of calls: 1
Received number of calls: 0
at apps/mobile/src/components/common/BottomSheet.web.test.tsx:114
```

This is the load-bearing RED for defect 2. The weaker synthetic keyboard assertions
were deleted rather than made to pass with another event shim.

The first E2E-only route also tripped the repository's navigation guard before the
non-E2E exit was added:

```bash
CI=1 pnpm exec jest --config apps/mobile/jest.config.cjs \
  apps/mobile/src/app/screen-navigation.test.ts \
  apps/mobile/src/app/e2e-testid-integrity.test.ts \
  --runInBand --forceExit
```

```text
Expected: true
Received: false
at apps/mobile/src/app/screen-navigation.test.ts:163
```

Adding the gated `router.replace('/(app)/home')` exit made the same two suites green:

```text
Test Suites: 2 passed, 2 total
Tests:       91 passed, 91 total
```

## GREEN — real browser default activation

The following command was run from the repository root against the verified
implementation candidate:

```bash
CI=1 EXPO_PUBLIC_E2E=true PLAYWRIGHT_SKIP_LOCAL_API=1 E2E_ENV=staging \
PLAYWRIGHT_API_URL=https://api-stg.mentomate.com \
EXPO_PUBLIC_API_URL=https://api-stg.mentomate.com \
EXPO_PUBLIC_ENABLE_MODE_NAV=true \
EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true \
EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true \
node scripts/doppler-run.mjs run -c stg -- \
pnpm exec playwright test -c apps/mobile/playwright.config.ts \
apps/mobile/e2e-web/flows/journeys/j27-bottom-sheet-keyboard.spec.ts \
--project=later-phases --workers=1 --retries=0 --reporter=list
```

```text
✓ [later-phases] ... j27-bottom-sheet-keyboard.spec.ts ... (2.7s)
3 passed (1.2m)
```

The public rendered state progressed exactly as follows:

```text
initial:          selections 0; closes 0
action Enter:     selections 1; closes 0
action Space:     selections 2; closes 0
backdrop Enter:   selections 2; closes 1
backdrop Space:   selections 2; closes 2
```

The dialog stayed visible after each action. Playwright used `locator.press()` on
the production consumer's actual HTML buttons; it did not dispatch a synthetic
click.

## RED → GREEN → revert-RED → restore-GREEN

The shared primitive's regression was first observed before implementation:

```text
Expected accessibilityRole: "dialog"
Received: undefined
Test Suites: 1 failed, 1 total
Tests:       1 failed, 9 passed, 10 total
```

Review cycle 1 added the stronger named-dialog and real-web hierarchy guards. They
failed against the then-current implementation:

```text
Unable to find an element with role: dialog, name: Required action
Unable to find an element with role: dialog, name: Topic picker
Test Suites: 2 failed, 2 total
Tests:       2 failed, 10 passed, 12 total
```

The web guard independently exposed the duplicate hierarchy:

```text
Expected length: 1
Received length: 2
Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 total
```

For the mandatory revert proof, only the production
`apps/mobile/src/components/common/BottomSheet.tsx` delta was inverse-applied; the
tests were not changed. The focused command was:

```bash
CI=1 pnpm exec jest --config apps/mobile/jest.config.cjs \
  apps/mobile/src/components/common/BottomSheet.test.tsx \
  apps/mobile/src/components/common/BottomSheet.web.test.tsx \
  --runInBand --forceExit
```

The reverted production file reproduced both defects:

```text
Expected length: 1
Received length: 2
Unable to find an element with role: dialog, name: Required action
Unable to find an element with role: dialog, name: Topic picker
Test Suites: 2 failed, 2 total
Tests:       3 failed, 10 passed, 13 total
```

After restoring the production file, `git diff --exit-code HEAD --
apps/mobile/src/components/common/BottomSheet.tsx` exited 0 and the identical
focused command returned:

```text
Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
```

## Additional verification

Focused primitive and consumer coverage:

```bash
CI=1 pnpm exec jest --config apps/mobile/jest.config.cjs \
  apps/mobile/src/components/common/BottomSheet.test.tsx \
  apps/mobile/src/components/common/BottomSheet.web.test.tsx \
  apps/mobile/src/components/common/BottomSheet.consumers.test.ts \
  apps/mobile/src/components/support/SupportPersonPickerSheet.test.tsx \
  apps/mobile/src/components/library/TopicPickerSheet.test.tsx \
  apps/mobile/src/components/subject-hub/TopicDetailSheet.test.tsx \
  apps/mobile/src/components/family/LearnTogetherSheet.test.tsx \
  apps/mobile/src/components/nudge/NudgeActionSheet.test.tsx \
  --runInBand --forceExit
```

```text
Test Suites: 8 passed, 8 total
Tests:       58 passed, 58 total
```

Type and lint checks:

```bash
pnpm exec tsc --build
pnpm exec eslint \
  apps/mobile/src/components/common/BottomSheet.web.test.tsx \
  apps/mobile/src/app/dev-only/bottom-sheet-keyboard.tsx \
  apps/mobile/e2e-web/flows/journeys/j27-bottom-sheet-keyboard.spec.ts
```

Both exited 0. The touched tests contain no local-module mocks; the web unit test's
only mock maps the external `react-native` package to `react-native-web`.

The full post-merge routed command was:

```bash
BASE_REF=origin/main CI=1 bash scripts/check-change-class.sh --run --branch
```

```text
Change classes: typescript mobile-routes mobile-src i18n
TypeScript build: passed
Mobile unit: 485 suites passed; 5,828 tests passed
i18n orphan check: Checked 584 files; no findings
i18n staleness: All translation files are up to date
Results: 4 passed, 0 failed, 0 skipped
```

`git diff --check` also exited 0.

## Acceptance coverage and residual limitation

- **AC-1 / AC-2:** The source and native/web guards prove sibling ownership,
  exact-once backdrop/request-close dismissal, and non-dismissal for inner controls.
- **AC-3:** The executable native tests cover iOS `accessibilityViewIsModal` and
  Android `importantForAccessibility` proxies; the real web test covers one named
  dialog, focus containment, and focus restoration.
- **AC-4:** The red/green/revert sequence shows the regression guards fail when the
  production fix is removed.
- **AC-5:** The consumer registry and focused consumer suites cover every production
  `BottomSheet` call site; the real browser proof exercises `TopicPickerSheet`.

Lancre has no native device farm. Native VoiceOver and TalkBack behavior is therefore
represented by executable iOS/Android accessibility-tree proxies, not a manual-device
claim.
