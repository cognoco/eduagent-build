# Mock Cleanup — GC1 Internal `jest.mock()` Elimination

Proactive, breadth-first sweep that removes internal `jest.mock()` calls (the GC6 boy-scout backlog). For the **reactive** loop where you're running a failing suite and clean mocks only on files you touch, use `/my:run-tests` instead. Both skills share the same canonical replacement pattern, the same shared harnesses, and the same "never weaken assertions" rule — keep them in sync.

## Context

- **GC1 ratchet rule**: CI fails any PR that adds a new relative-path `jest.mock('./...')` or `jest.mock('../...')` in test files. Existing sites are grandfathered — this skill cleans them up.
- **Canonical patterns**:
  - API / generic: `apps/api/src/inngest/functions/archive-cleanup.test.ts` — `jest.mock('./module', () => ({ ...jest.requireActual('./module'), specificExport: jest.fn() }))`. Working in-tree example: `apps/api/src/routes/sessions.test.ts:128` (reuse around `:309`).
  - Mobile screen tests: `apps/mobile/src/test-utils/screen-render.tsx` — `renderScreen`, `cleanupScreen`, `NAMED_PROFILES`, `ERROR_RESPONSES`. Composes `createRoutedMockFetch` + `createTestProfile` + real `ProfileContext`. Use this instead of stubbing `lib/api-client`, `lib/profile`, or query hooks.
- **`gc1-allow` escape hatch**: If genuine need exists, append `// gc1-allow: <reason>` on the same `jest.mock(` line. Only valid when the code under test cannot run in the test environment — never as a convenience.
- External-boundary mocks (LLM via `routeAndCall`, Stripe, Clerk JWKS, push, email, Inngest framework, `expo-*`, `react-native-*`) use bare specifiers and are NOT violations.
- **Reference docs**: `docs/plans/2026-05-12-internal-mock-cleanup-inventory.md` (inventory + risk classes), `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv` (per-mock rows), `docs/plans/2026-05-12-shared-test-utility-framework-plan.md` (harness architecture). Shared harnesses to prefer: see the table in `/my:run-tests`.

## Workflow

### 0. Pick targets — use the inventory, not edit-frequency

Regenerate the CSV first:

```powershell
node --no-warnings scripts/generate-internal-mock-cleanup-inventory.ts
```

Filter `annotation == "bare"` — those are the only true forward-only risks (no `requireActual`, no `gc1-allow`). The inventory markdown's "Top Files with BARE Mocks" table is the human-readable form.

**Do not target "most-edited" files** — Waves 1-3 (2026-05-19 → 2026-05-24) already swept that set; the most-edited files are clean because everyone touches them. See `2026-05-12-internal-mock-cleanup-inventory.md:100-101` for the explicit "stop targeting most-edited" guidance.

### 1. Decide fan-out shape from the bare distribution

- **One file holds ≥10 bare mocks** (e.g. `apps/mobile/src/app/_layout.test.tsx`): dispatch a single **Opus** agent — concentrated work needs context, not parallelism.
- **3+ files each have ≥3 bare mocks**: dispatch one **Sonnet** agent per file (up to 5 parallel), through `/my:dispatch`.
- **Only singletons remain (1-2 per file)**: dispatch a single **Sonnet** agent to clear them all in one pass.

Never spawn more agents than there are files with real work — empty agents waste runtime and pollute the diff.

If `$ARGUMENTS` is provided, scope to that path or file directly and skip the inventory step.

### 2. Per-file cleanup

For each file with internal mocks:

**a) Read the test and the mocked module.** Classify each mock:

| Category | Action |
|---|---|
| Mock stubs a function the test could call for real (pure logic, in-memory state) | Remove mock entirely — use real implementation |
| Mock stubs a side-effect export but the rest of the module is safe | Convert to `jest.requireActual()` spread + targeted override |
| Mock stubs a database/repo call in a unit test that should be an integration test | Convert file to `.integration.test.ts`, remove mocks, use real DB |
| Mock is genuinely needed (Inngest client wrapper, native module in JSDOM) | Add `// gc1-allow: <reason>` annotation |

Priority: **DELETE > requireActual spread > gc1-allow.**

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

For mobile screen tests, prefer the `screen-render.tsx` harness over hand-rolled `jest.requireActual` for `lib/api-client`, `lib/profile`, or query hooks.

**c) Run the test.** Verify it passes with the real implementation:

```bash
pnpm exec jest --findRelatedTests <file> --no-coverage
```

**d) If the test fails**, diagnose:
- Test found a real bug the mock was hiding → **fix the code** (this is the point)
- Test needs DB/network the unit runner can't provide → convert to integration test
- Test genuinely can't run without the mock → annotate with `gc1-allow`

NEVER loosen an assertion to make a de-mocked test pass.

### 3. Batch verification

After cleaning a batch of files, run the full test suite for the affected package:

```bash
pnpm exec nx run api:test        # if API files changed
pnpm exec nx run mobile:test     # if mobile files changed
```

### 4. Coordinator audit (mandatory before commit)

Subagent reports are intent, not evidence (`feedback_subagent_reports_are_intent_not_evidence`). Always verify:

```bash
git diff --stat <touched files>          # actual diff exists?
git diff <touched files> | grep "jest\.mock('\.\." | grep -v requireActual | grep -v gc1-allow
# Above should return zero remaining bare lines per touched file.
```

Re-run the inventory generator and confirm the `bare` count dropped by the expected amount. If a subagent reported "no changes needed" but the CSV said the file had bare mocks, dig in — don't propagate the agent's narration.

### 5. Update documentation after every run

A sweep that doesn't refresh the inventory leaves the next agent guessing.

- **Regenerate the inventory CSV** (already done in Step 0, re-run after edits): `node --no-warnings scripts/generate-internal-mock-cleanup-inventory.ts`.
- **Hand-edit the inventory markdown** at `docs/plans/2026-05-12-internal-mock-cleanup-inventory.md` so the totals row, the risk-class counts (P0/P1/P2/P3), the per-target deltas, and the "Top Files with BARE Mocks" table reflect the new CSV. Add a dated entry under "Cleanup Update" / next Wave naming the files swept and what changed.
- **New shared harness introduced** → add a row to the harness table in `docs/plans/2026-05-12-shared-test-utility-framework-plan.md` and to the table in `/my:run-tests`.
- **`gc1-allow` annotation added** → include the reason in the inventory markdown's allowlist commentary so reviewers can audit acceptable exceptions.

If you didn't change inventory state (e.g. you only annotated existing mocks without removing any), say so explicitly in the report.

### 6. Report

Summarize:
- Files cleaned (count + paths)
- Mocks removed vs. converted to requireActual vs. gc1-allowed
- Bugs found (mocks that were hiding real failures)
- Files converted to integration tests
- Inventory bare-count delta (before → after)

## Subagent constraints

When dispatching:

- **Stage as you go, never commit.** After each Edit/Write, run `git add -- <file>` immediately to lock the change in the git index — concurrent watchers (Codex, VS Code autosave, format-on-save) and other parallel agents can otherwise silently revert your work. Do NOT run `git commit` or `git push`. Coordinator commits via `/commit`.
- DO NOT modify files outside the brief.
- DO NOT switch branches.
- DO NOT loosen assertions to make tests pass.
- Report changed files with diff line counts so the coordinator can audit.

## Rules

- NEVER weaken an assertion to make a de-mocked test pass. If the test fails without the mock, the mock was hiding a bug — fix the bug.
- NEVER delete a test because removing the mock made it hard. Convert it.
- NEVER add a new internal `jest.mock()` without `gc1-allow`.
- Run tests after EVERY file change — don't batch blind edits.
- **For wide sweeps (10+ files across multiple packages), fan out via `/my:dispatch`** — it owns the planning, agent contract, and post-fan-out validation. Don't roll your own parallel logic here.
- Subagents stage (`git add`) but NEVER commit. Report changed files; coordinator commits via `/commit`.
