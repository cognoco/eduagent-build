# Mock Cleanup — Bare, Stale, Concentrated, Convertible

Proactive, breadth-first sweep that addresses **all forms of internal mock backlog** — not just the GC1 forward-only ratchet. For the **reactive** loop where you're running a failing suite and clean mocks only on files you touch, use `/my:run-tests` instead. Both skills share the same canonical replacement pattern, the same shared harnesses, and the same "never weaken assertions" rule — keep them in sync.

A sweep that returns "bare count is 0 — nothing to do" while a single file carries 17 `gc1-allow` mocks all citing the same boundary reason is missing the point. Bare elimination is one of four target categories below; the skill triggers work on all of them.
When you are done create a PR and follow it through until checks pass. 

## Target categories

This skill addresses four classes of mock backlog. Always evaluate every class — don't stop at the first that returns "clean".

| # | Category | What it looks like | Action |
|---|---|---|---|
| **T1** | **Bare internal mock** (GC1 forward-only risk) | `jest.mock('../foo')` with no factory, no `requireActual`, no `gc1-allow` | Convert to `requireActual` spread, delete entirely, or annotate `gc1-allow` |
| **T2** | **Concentrated `gc1-allow` chain** — structural smell | One test file carries ≥5 internal `gc1-allow` mocks all sharing the same justification (e.g. "render test boundary — full stub of native/runtime modules"). Symptom of importing a wrapper module that drags in unrelated side effects | **Extract the unit under test to its own file** so the import chain shrinks and the mocks evaporate. Annotation is not the fix |
| **T3** | **Stale `gc1-allow` annotation** | A mock annotated `gc1-allow` whose justification has been obsoleted by a shared harness, refactor, or replaced dependency | Remove the mock; rewire the test to use the real path or a shared harness |
| **T4** | **Pattern-a site convertible to shared harness** | A `requireActual`-spread mock that hand-rolls behaviour now covered by `screen-render.tsx`, `createIntegrationDb`, `llm-provider-fixtures`, `inngest-step-runner`, etc. | Replace the hand-rolled spread with the shared harness call |

External-boundary mocks (LLM via `routeAndCall`, Stripe, Clerk JWKS, push, email, Inngest framework, `expo-*`, `react-native-*`) use bare specifiers and are NOT violations under any category.

## Context

- **GC1 ratchet rule**: CI fails any PR that adds a new relative-path `jest.mock('./...')` or `jest.mock('../...')` in test files. Existing sites are grandfathered — T1 work closes the bare backlog.
- **GC6 boy-scout rule**: every test-file edit must reduce the internal-mock count on that file. T2/T3/T4 are the work that drives the backlog down once T1 is empty.
- **Canonical patterns**:
  - API / generic: `apps/api/src/inngest/functions/archive-cleanup.test.ts` — `jest.mock('./module', () => ({ ...jest.requireActual('./module'), specificExport: jest.fn() }))`. Working in-tree example: `apps/api/src/routes/sessions.test.ts:128` (reuse around `:309`).
  - Mobile screen tests: `apps/mobile/src/test-utils/screen-render.tsx` — `renderScreen`, `cleanupScreen`, `NAMED_PROFILES`, `ERROR_RESPONSES`. Composes `createRoutedMockFetch` + `createTestProfile` + real `ProfileContext`. Use this instead of stubbing `lib/api-client`, `lib/profile`, or query hooks.
- **`gc1-allow` escape hatch**: If genuine need exists, append `// gc1-allow: <reason>` on the same `jest.mock(` line. Only valid when the code under test cannot run in the test environment — never as a convenience. **An accumulation of `gc1-allow` mocks in one file is itself a T2 finding, not a clean state.**
- **Reference docs**: `docs/plans/2026-05-12-internal-mock-cleanup-inventory.md` (inventory + risk classes), `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv` (per-mock rows), `docs/plans/2026-05-12-shared-test-utility-framework-plan.md` (harness architecture). Shared harnesses to prefer: see the table in `/my:run-tests`.

## Workflow

### 0. Pick targets — use the inventory, not edit-frequency

Regenerate the CSV first (note: use `tsx`, not bare `node`, because the script imports `.js`-extension siblings that resolve to `.ts` only via the loader):

```bash
pnpm exec tsx scripts/generate-internal-mock-cleanup-inventory.ts
```

The script prints two distributions you need:

1. The **internal-ish BARE count** (`true forward-only risk: N`) — this is T1 scope. If non-zero, T1 is the priority.
2. The **internal-ish by annotation status** breakdown (`gc1-allow`, `pattern-a; gc1-allow`, `pattern-a`) and the **top internal-ish files** list — these surface T2 (concentration) and T4 (pattern-a) candidates. Use the CSV (`docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv`) for per-file detail.

Identify candidates for each category:

- **T1 (bare):** `awk -F',' 'NR>1 && $NF=="bare" && $4 ~ /^\047\.\./' inventory.csv` — internal-ish bare rows. The skill counter on stdout already filters external-boundary specifiers; trust it.
- **T2 (concentration):** files where ≥5 internal `gc1-allow` mocks share a near-identical reason string. Run:

  ```bash
  grep -rn "gc1-allow" apps/ packages/ --include="*.test.ts" --include="*.test.tsx" | \
    awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -20
  ```

  Then open the top 1-2 and check whether the reasons cluster around the same boundary justification ("render test boundary", "module load side effects", etc.). If yes → T2 extraction candidate.
- **T3 (stale):** harder to detect mechanically. Sample 5-10 `gc1-allow` annotations and grep for whether a matching shared harness now exists in `apps/mobile/src/test-utils/` or `apps/api/src/test-utils/`. If yes, the annotation is stale.
- **T4 (convertible):** files with `pattern-a` (`requireActual` spread) targeting `lib/profile`, `lib/api-client`, query hooks, or `services/inngest` — these usually have a shared harness alternative.

**Do not target "most-edited" files for T1** — Waves 1-3 (2026-05-19 → 2026-05-24) already swept that set; the most-edited files are clean of bare violations because everyone touches them. They may still carry T2/T3/T4 backlog. See `2026-05-12-internal-mock-cleanup-inventory.md:100-101`.

### 1. Decide fan-out shape from category and concentration

Evaluate in priority order — pick the first that has work:

**T1 — Bare internal mocks (forward-only risk):**
- One file holds ≥10 bare mocks: dispatch a single **Opus** agent — concentrated work needs context, not parallelism.
- 3+ files each have ≥3 bare mocks: dispatch one **Sonnet** agent per file (up to 5 parallel), through `/my:dispatch`.
- Only singletons remain: dispatch a single **Sonnet** agent to clear them all in one pass.

**T2 — Concentrated `gc1-allow` chain (structural smell):**
- One file with ≥10 internal `gc1-allow` mocks sharing the same reason cluster: dispatch a single **Opus** agent — this is an extraction job that needs full context. Worked example: `apps/mobile/src/app/_layout.test.tsx` carries 17 internal mocks for testing `ClerkGate` because `_layout.tsx` (729 lines) imports the whole app graph; the fix is to extract `ClerkGate` to its own file so the test imports only what it needs.
- 2+ files with similar 5-9 `gc1-allow` concentrations: dispatch one **Opus** agent per file via `/my:dispatch`. Do NOT use Sonnet for extraction work — it requires reading the source module, identifying the unit boundary, and judging what to extract.

**T3 — Stale `gc1-allow` annotations:**
- Sample-based audit; dispatch a single **Opus** agent to read 10-20 annotations + grep for replacement harnesses. Sonnet is acceptable only if the brief lists exact (annotation, candidate harness) pairs to evaluate.

**T4 — Pattern-a → shared harness conversions:**
- 3+ files with the same `requireActual` target convertible to the same harness: dispatch one **Sonnet** agent per file via `/my:dispatch` (mechanical conversion).
- Mixed targets: single **Opus** agent.

Never spawn more agents than there are files with real work — empty agents waste runtime and pollute the diff.

If `$ARGUMENTS` is provided, scope to that path or file directly and skip the inventory step. Treat the file as a multi-category candidate: scan it for T1/T2/T3/T4 before choosing the action.

### 2. Per-file cleanup

For each file with internal mocks:

**a) Read the test and the mocked module.** Classify each mock. The priority order is **EXTRACT > DELETE > requireActual spread > gc1-allow** — always try the higher-priority action first.

| # | Symptom | Action |
|---|---|---|
| **1. EXTRACT** | Test imports a wrapper module (≥500 lines, multiple side-effect modules) only to reach a small inner unit; mocks exist only to silence the wrapper's other imports | Extract the unit under test (e.g. `ClerkGate`, a helper function) to its own file. Update the test to import from the extracted file. The mocks evaporate without needing replacement |
| **2. DELETE** | Mock stubs a function the test could call for real (pure logic, in-memory state) | Remove mock entirely — use real implementation |
| **3. DELETE → harness** | Mock stubs `lib/api-client`, `lib/profile`, query hooks, or DB repos | Replace with `screen-render.tsx` (mobile) or `createIntegrationDb` (API) |
| **4. requireActual spread** | Mock stubs a side-effect export but the rest of the module is safe | Convert to `jest.requireActual()` spread + targeted override |
| **5. Convert to integration** | Mock stubs a database/repo call in a unit test that should be an integration test | Rename file to `.integration.test.ts`, remove mocks, use real DB via `createIntegrationDb` |
| **6. gc1-allow** | Mock is genuinely needed (native module unavailable in JSDOM, Inngest client wrapper, env-var seed) **and** the cluster check passes (see rule below) | Add `// gc1-allow: <reason>` annotation |

**Cluster check before annotating:** before adding (or keeping) a `gc1-allow` annotation, count how many internal `gc1-allow` mocks already exist in the file. If the count is ≥5 and their reasons share a boundary cluster ("render test boundary", "native runtime stub", etc.), **stop and re-evaluate with EXTRACT** — annotation is the wrong fix; you are papering over a structural problem.

**b) Apply the replacement.** Canonical forms:

```typescript
// Pattern-a — requireActual spread
jest.mock('../services/foo', () => ({
  ...jest.requireActual('../services/foo'),
  expensiveSideEffect: jest.fn(),
}));
```

```typescript
// Extraction — before
// apps/mobile/src/app/_layout.tsx (729 lines, imports 17+ side-effect modules)
export function ClerkGate(props) { /* ... */ }

// apps/mobile/src/app/_layout.test.tsx
import { ClerkGate } from './_layout';   // forces 17 jest.mock() calls to silence the rest of _layout.tsx

// Extraction — after
// apps/mobile/src/app/_clerk-gate.tsx (new file, ~80 lines, imports only @clerk/clerk-expo + ./components/ClerkTimeoutScreen)
export function ClerkGate(props) { /* ... */ }

// apps/mobile/src/app/_layout.tsx
import { ClerkGate } from './_clerk-gate';

// apps/mobile/src/app/_clerk-gate.test.tsx (renamed/moved)
import { ClerkGate } from './_clerk-gate';   // only needs to mock @clerk/clerk-expo
```

For mobile screen tests, prefer the `screen-render.tsx` harness over hand-rolled `jest.requireActual` for `lib/api-client`, `lib/profile`, or query hooks.

**c) Run the test.** Verify it passes with the real implementation (or with the extracted import):

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests <file> --no-coverage
```

**d) If the test fails**, diagnose:
- Test found a real bug the mock was hiding → **fix the code** (this is the point)
- Test needs DB/network the unit runner can't provide → convert to integration test
- Extraction broke the source module's behaviour → revert extraction, investigate the unit boundary
- Test genuinely can't run without the mock and no extraction is viable → annotate with `gc1-allow` (and pass the cluster check)

NEVER loosen an assertion to make a de-mocked test pass.

### 3. Batch verification

After cleaning a batch of files, run the full test suite for the affected package:

```bash
pnpm exec nx run api:test        # if API files changed
pnpm exec nx run mobile:test     # if mobile files changed
```

### 4. Coordinator audit (mandatory before commit)

Subagent reports are intent, not evidence (`feedback_subagent_reports_are_intent_not_evidence`). Always verify per category:

```bash
git diff --stat <touched files>          # actual diff exists?

# T1 (bare): no remaining unannotated relative-path mocks
git diff <touched files> | grep "jest\.mock('\.\." | grep -v requireActual | grep -v gc1-allow

# T2 (extraction): the extracted file exists, the test imports from it, the original module re-exports for backwards compat (or callers were updated)
git diff --stat | grep -E "(_clerk-gate|<extracted-name>)"

# T3 (stale gc1-allow): annotation count dropped on the touched files
grep -c "gc1-allow" <touched files>     # before vs. after

# T4 (harness conversion): pattern-a count dropped; harness import added
git diff <touched files> | grep -E "(screen-render|createIntegrationDb|llm-provider-fixtures)"
```

Re-run the inventory generator and confirm the totals shifted in the expected direction (bare count drops, internal-ish count drops, pattern-a count drops or holds). If a subagent reported "no changes needed" but the inventory said the file had backlog, dig in — don't propagate the agent's narration.

### 5. Update documentation after every run

A sweep that doesn't refresh the inventory leaves the next agent guessing.

- **Regenerate the inventory CSV** (already done in Step 0, re-run after edits): `node --no-warnings scripts/generate-internal-mock-cleanup-inventory.ts`.
- **Hand-edit the inventory markdown** at `docs/plans/2026-05-12-internal-mock-cleanup-inventory.md` so the totals row, the risk-class counts (P0/P1/P2/P3), the per-target deltas, and the "Top Files with BARE Mocks" table reflect the new CSV. Add a dated entry under "Cleanup Update" / next Wave naming the files swept and what changed.
- **New shared harness introduced** → add a row to the harness table in `docs/plans/2026-05-12-shared-test-utility-framework-plan.md` and to the table in `/my:run-tests`.
- **`gc1-allow` annotation added** → include the reason in the inventory markdown's allowlist commentary so reviewers can audit acceptable exceptions.

If you didn't change inventory state (e.g. you only annotated existing mocks without removing any), say so explicitly in the report.

### 6. Report

Summarize per category:
- **T1 (bare):** files cleaned, mocks removed vs. converted vs. annotated, inventory bare-count delta (before → after)
- **T2 (extraction):** files extracted, internal mock count per file (before → after), source modules touched
- **T3 (stale gc1-allow):** annotations removed, the shared harness or refactor that obsoleted them
- **T4 (harness conversion):** pattern-a sites converted, harness used
- **Bugs found** (mocks that were hiding real failures) — call these out regardless of category
- **Files converted to integration tests**

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
- **NEVER treat "bare count is 0" as a clean state.** If the inventory shows ≥5 internal `gc1-allow` mocks in one file with clustered reasons, that is a T2 finding — the sweep is NOT done.
- **Annotation is the last resort, not the first.** Before adding or keeping a `gc1-allow`, exhaust EXTRACT → DELETE → requireActual spread → harness conversion. An annotation is a confession that none of those worked; it should be rare.
- Run tests after EVERY file change — don't batch blind edits.
- **For wide sweeps (10+ files across multiple packages), fan out via `/my:dispatch`** — it owns the planning, agent contract, and post-fan-out validation. Don't roll your own parallel logic here.
- **Extraction work (T2) needs Opus.** Sonnet on T2 produces shallow extractions that miss coupling — don't dispatch Sonnet for anything beyond mechanical T1/T4 cleanup.
- Subagents stage (`git add`) but NEVER commit. Report changed files; coordinator commits via `/commit`.
