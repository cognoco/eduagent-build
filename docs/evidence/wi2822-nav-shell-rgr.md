# WI-2822 — nav-shell contract red-green-revert transcript

**Item:** WI-2822 — Prevent supporter self-learning doorway bleed-through after
support-hub Back.

**Purpose:** This is the retained, revision-resolving Bug DoD proof that the
co-located nav-shell contract guard detects the exact stale initial no-doorway
premise. It repairs the prior review finding without changing the already-landed
test behavior.

## Revision and byte identity

The original implementation landed as PR #2658's squash commit
`0a3000afa7f058019aeef99e462a39831232b8f7`. The rework capture started from
`origin/main` at `81e1aa43f81501fef7dde85d0541f4b29ef3f86a`. Both guarded source
files are byte-identical at those revisions:

| File | SHA-256 at `0a3000a` and capture base |
| --- | --- |
| `apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts` | `58d49f003f3bdfe81c2813c2a1c133c713efe146e34c4045ad4c7e5c7abc7465` |
| `apps/mobile/e2e-web/helpers/nav-shell-contract.test.ts` | `7b4bec7dc99349cd5a042f227fc29b789f14b66ae8a5ad9bda80ddd0a2aa4bcd` |

`git diff --no-index --exit-code` between each file from `0a3000a` and the
capture base produced no output. The final restore repeated that check and
produced the same two hashes. The evidence change in this rework is this file
only; it does not alter either guarded source file.

## Command

All three executions used the same focused command from the repository root:

```text
pnpm exec jest --config apps/mobile/jest.config.cjs \
  apps/mobile/e2e-web/helpers/nav-shell-contract.test.ts --runInBand
```

## GREEN — contract present

At the capture base, the focused guard passed with all five assertions:

```text
PASS @eduagent/mobile apps/mobile/e2e-web/helpers/nav-shell-contract.test.ts
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
```

## RED — exact stale no-doorway premise restored

Only the initial no-Me Support Hub assertion in
`apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts` was temporarily changed:

```diff
 await expect(
   page.getByTestId('supporter-self-learning-doorway'),
-).toBeVisible();
+).toHaveCount(0);
```

No guard/test file was changed. The focused command failed exactly in the
initial/returned no-Me Support Hub contract test:

```text
FAIL @eduagent/mobile apps/mobile/e2e-web/helpers/nav-shell-contract.test.ts
  [WI-2822] supporter doorway nav-shell contract
    ✕ keeps the doorway visible on the initial and returned no-Me Support Hub surfaces

Expected pattern: /expect\(\s*page\.getByTestId\('supporter-self-learning-doorway'\)
...\.toBeVisible\(\s*/
Received string: ... ).toHaveCount(0);

Test Suites: 1 failed, 1 total
Tests:       1 failed, 4 passed, 5 total
```

This is the exact semantic regression named by WI-2822: the first-time
no-Me Support Hub doorway was inverted back to absent. The guard rejected it
without relying on browser success alone.

## RESTORE — byte-identical contract returned to green

The one mutated assertion was restored verbatim to `toBeVisible()`. Then:

```text
git diff --exit-code -- apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts \
  apps/mobile/e2e-web/helpers/nav-shell-contract.test.ts
git diff --no-index --exit-code \
  <(git show 0a3000afa7f058019aeef99e462a39831232b8f7:apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts) \
  apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts
git diff --no-index --exit-code \
  <(git show 0a3000afa7f058019aeef99e462a39831232b8f7:apps/mobile/e2e-web/helpers/nav-shell-contract.test.ts) \
  apps/mobile/e2e-web/helpers/nav-shell-contract.test.ts
```

All three commands exited `0` with no output. The focused guard then returned:

```text
PASS @eduagent/mobile apps/mobile/e2e-web/helpers/nav-shell-contract.test.ts
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
```

Thus GREEN → RED → RESTORE-GREEN is an executed, retained transcript at a
revision whose two contract files resolve byte-for-byte to the original landed
WI-2822 implementation. The subsequent PR CI run is required separately to
prove AC-6 against this evidence revision's exact head; no retry, timeout,
quarantine, or skip policy was changed for this capture.
