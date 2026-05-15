# Mock Cleanup — GC1 Internal `jest.mock()` Elimination

Proactive, breadth-first sweep that removes internal `jest.mock()` calls (the GC6 boy-scout backlog). For the **reactive** loop where you're running a failing suite and clean mocks only on files you touch, use `/my:run-tests` instead. Both skills share the same canonical replacement pattern, the same shared harnesses, and the same "never weaken assertions" rule — keep them in sync.

## Context

- **GC1 ratchet rule**: CI fails any PR that adds a new relative-path `jest.mock('./...')` or `jest.mock('../...')` in test files. Existing sites are grandfathered — this skill cleans them up.
- **Canonical pattern**: `jest.mock('./module', () => ({ ...jest.requireActual('./module'), specificExport: jest.fn() }))` — spread the real module, override only what the test actually needs to stub. Working example: `apps/api/src/routes/sessions.test.ts:128` (and reuse around `:309`).
- **`gc1-allow` escape hatch**: If genuine need exists, append `// gc1-allow: <reason>` on the same `jest.mock(` line.
- External-boundary mocks (LLM via `routeAndCall`, Stripe, Clerk JWKS, push, email, Inngest framework) use bare specifiers and are NOT violations.
- **Reference docs**: `docs/plans/2026-05-12-internal-mock-cleanup-inventory.md` (inventory + risk classes), `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv` (per-mock rows), `docs/plans/2026-05-12-shared-test-utility-framework-plan.md` (harness architecture). Shared harnesses to prefer: see the table in `/my:run-tests`.

## Workflow

### 1. Inventory

Find all internal mock sites in the target scope:

```bash
rg "jest\.mock\(['\"]\.\.?/" --glob "*.test.{ts,tsx}" -c
```

If `$ARGUMENTS` is provided, scope to that path. Otherwise, ask for a target directory or file.

### 2. Per-File Cleanup

For each file with internal mocks:

**a) Read the test and the mocked module.**
Understand what exports are being mocked and why. Classify each mock:

| Category | Action |
|---|---|
| Mock stubs a function the test could call for real (e.g., pure logic, in-memory state) | Remove mock entirely — use real implementation |
| Mock stubs a side-effect export but the rest of the module is safe | Convert to `jest.requireActual()` spread + targeted override |
| Mock stubs a database/repo call in a unit test that should be an integration test | Convert file to `.integration.test.ts`, remove mocks, use real DB |
| Mock is genuinely needed (e.g., Inngest client wrapper for function registration) | Add `// gc1-allow: <reason>` annotation |

**b) Apply the replacement.** Canonical form:

```typescript
// BEFORE (violation)
jest.mock('../services/foo');

// AFTER (requireActual + targeted override)
jest.mock('../services/foo', () => ({
  ...jest.requireActual('../services/foo'),
  expensiveSideEffect: jest.fn(),
}));
```

For mocks that stub a hook or provider in mobile tests, the same pattern applies — spread the real module, override only the hook under test control.

**c) Run the test.** Verify it passes with the real implementation:

```bash
pnpm exec jest --findRelatedTests <file> --no-coverage
```

**d) If the test fails**, diagnose:
- Test found a real bug the mock was hiding → **fix the code** (this is the point)
- Test needs DB/network the unit runner can't provide → convert to integration test
- Test genuinely can't run without the mock → annotate with `gc1-allow`

### 3. Batch Verification

After cleaning a batch of files, run the full test suite for the affected package:

```bash
pnpm exec nx run api:test        # if API files changed
pnpm exec nx run mobile:test     # if mobile files changed
```

### 4. Report

Summarize:
- Files cleaned (count + paths)
- Mocks removed vs. converted to requireActual vs. gc1-allowed
- Bugs found (mocks that were hiding real failures)
- Files converted to integration tests

## Update documentation after every run

A sweep that doesn't refresh the inventory leaves the next agent guessing. Before you report back:

- **Regenerate the inventory CSV** — always, even for a small batch:
  ```powershell
  node --no-warnings scripts/generate-internal-mock-cleanup-inventory.ts
  ```
  Writes `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv`.
- **Hand-edit the inventory markdown** at `docs/plans/2026-05-12-internal-mock-cleanup-inventory.md` so the totals row, the risk-class counts (P0/P1/P2/P3), the per-target deltas, and the "Top files by internal-ish mock count" reflect the new CSV. Add a dated entry under "Cleanup Update" naming the files swept and what changed.
- **New shared harness introduced** → add a row to the harness table in `docs/plans/2026-05-12-shared-test-utility-framework-plan.md` and to the table in `/my:run-tests`.
- **`gc1-allow` annotation added** → include the reason in the inventory markdown's allowlist commentary so reviewers can audit acceptable exceptions.

If you didn't change inventory state (e.g. you only annotated existing mocks without removing any), say so explicitly in the report.

## Rules

- NEVER weaken an assertion to make a de-mocked test pass. If the test fails without the mock, the mock was hiding a bug — fix the bug.
- NEVER delete a test because removing the mock made it hard. Convert it.
- NEVER add a new internal `jest.mock()` without `gc1-allow`.
- Run tests after EVERY file change — don't batch blind edits.
- **For wide sweeps (10+ files across multiple packages), fan out via `/my:dispatch`** — it owns the planning, agent contract, and post-fan-out validation. Don't roll your own parallel logic here.
- Subagents doing this work must NOT commit. Report changed files; coordinator commits via `/commit`.
