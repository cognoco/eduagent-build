# AUDIT-PACKAGE-SCRIPTS-2 — Explicit-config blueprint for `apps/api` + stage-2 decisions

**Date:** 2026-05-03
**Auditor:** audit-package-scripts-2-deepening (subagent fork)
**Scope:** Deepening of PACKAGE-SCRIPTS-1 Findings 2/3 (no `eslint.config.*`, no `tsconfig.lib.json`, no `tsconfig.spec.json` in `apps/api`). Document today's implicit-config behavior, draft behavior-preserving explicit configs, and surface the F4 (sessions.ts drizzle exception) and F5 (maestro guard symmetry) decisions for stage-2 burndown. Verify CLAUDE.md "Required Validation" commands still resolve at HEAD.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion punch list:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md`
**Predecessor:** `docs/audit/2026-05-02-audit-package-scripts-1-recon.md`
**Baseline check:** `docs/audit/2026-05-03-baseline-delta.md` (C6 row says cluster intact at HEAD — this audit confirms config side; corrects the F4 sessions.ts row, see Cross-coupling notes)

---

## TL;DR

`apps/api` lint/typecheck/test resolve today entirely via `@nx/eslint/plugin`, `@nx/js/typescript`, and `@nx/jest/plugin` inference walking up to root configs — there is no local `eslint.config.*`, no `tsconfig.lib.json`, no `tsconfig.spec.json`, and `apps/api/project.json` declares only `serve`, `build`, `deploy`, `test:integration`. A behavior-preserving explicit-config set is small (one `eslint.config.mjs` re-exporting root + one `tsconfig.spec.json` pointing ts-jest at the right config). **Adding `tsconfig.lib.json` is the wrong move** — it would create a shadow `build` target conflicting with the explicit `wrangler deploy --dry-run` build already in `project.json`. The headline surprise is on F4: PR #130 (`8672bdcd`, 2026-05-02) silently removed the `from 'drizzle-orm'` import from `apps/api/src/routes/sessions.ts`, so the CLAUDE.md "Known Exception" — and the baseline-delta C6 row that re-cited it — are **both stale at HEAD**. Zero route files import drizzle-orm. F4's question collapses from "refactor vs. formalize" to "correct CLAUDE.md + add a forward-only guard." All eight CLAUDE.md "Required Validation" commands resolve cleanly; `db:generate` is the lone `:dev`-suffix straggler already tracked as PACKAGE-SCRIPTS-1a.

## Severity

**YELLOW** (deepening — same severity as PACKAGE-SCRIPTS-1 F2/F3) — explicit configs are a behavior-preservation exercise on a YELLOW cluster, not a regression. F4's stale-doc finding is **YELLOW-RED** for documentation accuracy (CLAUDE.md non-negotiables now reference a code reality that no longer exists), but **GREEN** for code: the underlying violation has already been fixed.

## Methodology

- Read `apps/api/project.json` — confirmed only `serve`, `build`, `deploy`, `test:integration` targets defined; no `lint`, `test`, `typecheck`.
- Read `nx.json` — enumerated plugin inference: `@nx/js/typescript` infers `typecheck` (no `configName`) + `build` (`configName: tsconfig.lib.json`); `@nx/eslint/plugin` infers `lint`; `@nx/jest/plugin` infers `test`.
- Read root `eslint.config.mjs` — found root config has React-specific rules scoped to `apps/mobile/**`, base `@nx/enforce-module-boundaries` rule applies to all `**/*.ts/tsx/js/jsx`, plus test-file overrides + unused-vars softening.
- Read `apps/mobile/eslint.config.mjs` and `packages/database/eslint.config.mjs` — sibling models for an explicit `apps/api/eslint.config.mjs`.
- Read `apps/mobile/{tsconfig.json, tsconfig.app.json, tsconfig.spec.json}` (sibling app, no `tsconfig.lib.json`) and `packages/database/{tsconfig.json, tsconfig.lib.json, tsconfig.spec.json}` (sibling library) — established the **app-vs-library split** that drives whether `tsconfig.lib.json` belongs in `apps/api`.
- Read `apps/api/{tsconfig.json, tsconfig.app.json, jest.config.cjs}` — confirmed jest passes `tsconfig: '<rootDir>/apps/api/tsconfig.app.json'` to `ts-jest`, which is what test compilation uses today.
- `Grep "from 'drizzle-orm" apps/api/src/routes/` → **0 matches** at HEAD. Re-checked with `Grep "drizzle-orm" apps/api/src/routes/` → 1 match in `quiz.ts`, comment-only ("This file must not import `drizzle-orm`").
- `git log -S "from 'drizzle-orm'" -- apps/api/src/routes/sessions.ts` → last touch in `8672bdcd` (PR #130, 2026-05-02). `git show 8672bdcd~1:apps/api/src/routes/sessions.ts | grep drizzle-orm` confirmed import was present pre-PR130 (`import { and, eq, lt, sql } from 'drizzle-orm';`) and is gone post-PR130.
- Cross-checked CLAUDE.md "Handy Commands" + "Required Validation" lines 57-60 and 145-178 against `package.json` scripts and inferred nx targets — verified each command resolves; documented the resolution path for each.
- Read `apps/api/package.json` — confirmed only `dev` and `deploy` local scripts; no `lint`/`test`/`typecheck`.
- Read root `package.json` to map every CLAUDE.md "Handy Commands" db invocation to a real script entry.

## Findings

### Finding 1 — Today's implicit-config behavior (per missing config)

- **Severity:** YELLOW (informational baseline; this is the "what does it do today" capture the remediation PR will preserve)
- **Files:** `apps/api/` (no `eslint.config.*`, `.eslintrc.*`, `tsconfig.lib.json`, or `tsconfig.spec.json`); `apps/api/project.json` (no `lint`/`test`/`typecheck` targets); `nx.json:18-44` (plugin block); root `eslint.config.mjs`; `apps/api/jest.config.cjs`; `apps/api/tsconfig.app.json`.
- **Evidence:**

  **`pnpm exec nx run api:lint`** — resolution path:
  - `@nx/eslint/plugin` (configured `nx.json:33-38` with `targetName: lint`) walks up from `apps/api/`, finds **no** local `eslint.config.*`, falls back to **root `eslint.config.mjs`**.
  - Rules applied: everything from root config — `@nx/enforce-module-boundaries`, `@typescript-eslint/no-unused-vars` (warn), test-file overrides for `@typescript-eslint/no-non-null-assertion` and `no-explicit-any`. The React-scoped block does **not** match (its `files:` is `apps/mobile/**`).
  - Files matched: `apps/api/**/*.{ts,tsx,js,jsx}` per the `**/*.ts,tsx,js,jsx` selector in root config (no path-narrowing for api).
  - Lint coverage is **invisible** from `apps/api/project.json`; only inference + root config presence keeps it alive.

  **`pnpm exec nx run api:typecheck`** — resolution path:
  - `@nx/js/typescript` plugin (`nx.json:20-32`) infers `typecheck` with no `configName` setting. The plugin uses any tsconfig with `composite: true`, but `apps/api/tsconfig.app.json` doesn't set `composite` either — the plugin defaults to `apps/api/tsconfig.json` (which has `references: [{ path: './tsconfig.app.json' }]`). Result: typecheck runs `tsc --build` on the project references chain rooted at `apps/api/tsconfig.json`.
  - `apps/api/tsconfig.app.json` settings used: `outDir: dist`, `types: [@cloudflare/workers-types, node]`, `rootDir: src`, `include: src/**/*.ts`, `exclude: dist, **/*.test.ts, **/*.spec.ts`. So **typecheck excludes test files** today.

  **`pnpm exec nx run api:test`** — resolution path:
  - `@nx/jest/plugin` (`nx.json:39-44` with `targetName: test`) detects `apps/api/jest.config.cjs` and infers a `test` target.
  - Jest config uses `transform: '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/tsconfig.app.json' }]` — meaning **test files get type-checked against `tsconfig.app.json`**, the same config used by production source. Since `tsconfig.app.json` excludes `**/*.test.ts`, ts-jest still compiles them (jest transforms ignore the `exclude` field) but they're not part of the project's typecheck pass — the typecheck-vs-test type-error gap exists today.
  - `testMatch` includes `apps/api/src/**/*.test.ts`, `apps/api/src/**/*.integration.test.ts`, and `apps/api/eval-llm/**/*.test.ts`.

- **Why it matters:** Three CLAUDE.md "Required Validation" commands depend entirely on inference + a single fallback (root `eslint.config.mjs`). Future nx upgrades, plugin reconfiguration, or a stray `eslint.config.mjs` added to `apps/api/` would silently change behavior. The typecheck/test-config split (test files type-checked under app config) is a behavior worth preserving but **invisible** without reading three files.
- **Anticipated effort:** N/A (this finding is the baseline, not a fix)
- **Suggested track:** B (input to the F3 drafts)

### Finding 2 — Sibling-workspace model (the right shape to copy)

- **Severity:** GREEN (informational)
- **Files:** `apps/mobile/{eslint.config.mjs, tsconfig.json, tsconfig.app.json, tsconfig.spec.json}` (sibling **application**); `packages/database/{eslint.config.mjs, tsconfig.json, tsconfig.lib.json, tsconfig.spec.json}` (sibling **library**).
- **Evidence:**

  **Two distinct sibling models** — this is the load-bearing structural distinction the F3 drafts need to honor:

  - **Application model (`apps/mobile/`):** `tsconfig.json` references `tsconfig.app.json` + `tsconfig.spec.json`. **No `tsconfig.lib.json`.** Build is an explicit nx target, not an inferred one. `eslint.config.mjs` extends root and adds expo-specific React + custom rules (e.g., `local/require-mutate-error-handling`, `no-restricted-syntax` hex-color ban).
  - **Library model (`packages/database/`):** `tsconfig.json` references `tsconfig.lib.json` + `tsconfig.spec.json`. `tsconfig.lib.json` sets `emitDeclarationOnly: true`, `outDir: dist`, `rootDir: src`. `tsconfig.spec.json` overrides `module: nodenext`, includes `src/**/*.test.ts`. `eslint.config.mjs` extends root and adds dev-script-specific rule relaxations.

  **`apps/api` is an application** (`projectType: "application"` per `project.json:5`), like mobile. Its build path is `wrangler deploy --dry-run --outdir dist` (`project.json:15-21`), an explicit nx target — **not a library declaration emitter**. Adding `tsconfig.lib.json` would activate the `@nx/js/typescript` plugin's inferred `build` target (per `nx.json:25-29` `configName: tsconfig.lib.json`), which would then **conflict with or shadow the explicit `wrangler` `build`** — undesirable.

- **Why it matters:** PACKAGE-SCRIPTS-1d's punch-list entry recommended "add `tsconfig.lib.json` mirroring `packages/*` shape" — that recommendation **does not match the app-vs-library split**. The deepening corrects this: `apps/api` should follow the **mobile (application) model**, which means **no `tsconfig.lib.json`**. Only `eslint.config.mjs` and `tsconfig.spec.json` should be added.
- **Anticipated effort:** N/A (informational)
- **Suggested track:** B (drives the F3 drafts)

### Finding 3 — Explicit-config drafts for `apps/api` (the deliverable)

- **Severity:** YELLOW (the actionable PR scope)
- **Files (new):** `apps/api/eslint.config.mjs`, `apps/api/tsconfig.spec.json`. **Modified:** `apps/api/tsconfig.json`, `apps/api/jest.config.cjs` (one-line ts-jest tsconfig swap).
- **Evidence:** Three drafts below. Each preserves today's implicit behavior captured in F1.

#### Draft A — `apps/api/eslint.config.mjs` (new file)

Mirrors `packages/database/eslint.config.mjs` shape. Re-exports root config; only adds an api-specific ignore for `dist/` and `.wrangler/`. No new rules — preserves today's behavior exactly.

```js
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Wrangler emit + nx build artefact dirs.
    ignores: ['**/dist', '**/.wrangler'],
  },
];
```

**Notes:**
- Root `eslint.config.mjs` already declares `**/dist` and `**/.wrangler` ignores at line 18, so this block is technically redundant. Including it makes api's local config self-explanatory rather than relying on the reader to chase the root.
- We deliberately **do not** add api-specific rules here. PACKAGE-SCRIPTS-1 F2 noted that `apps/api/project.json` has no rule overrides today; this draft preserves that.
- The `@nx/eslint/plugin` inference will now find this local config first and use it (which itself extends root), rather than walking up to root. Net rules are identical; the resolution path becomes one hop shorter and explicit.

#### Draft B — `apps/api/tsconfig.spec.json` (new file)

Modeled on `apps/mobile/tsconfig.spec.json` (the **application** sibling), not `packages/database/tsconfig.spec.json` (the library sibling). Includes the API-specific test files that `apps/api/jest.config.cjs:24-28` enumerates today.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/jest",
    "types": ["jest", "node", "@cloudflare/workers-types"]
  },
  "include": [
    "jest.config.cjs",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.integration.test.ts",
    "src/**/*.d.ts",
    "eval-llm/**/*.test.ts"
  ],
  "references": [
    {
      "path": "./tsconfig.app.json"
    }
  ]
}
```

**Notes:**
- `types: [..., '@cloudflare/workers-types']` matches `tsconfig.app.json` (workers types are needed in tests that exercise Hono handlers against the Workers env).
- `include` is **deliberately broader** than mobile's, because the API has both `*.integration.test.ts` and the `eval-llm/` test tree that aren't part of the standard `*.test.ts` glob.
- No `module: nodenext` override (unlike `packages/database/tsconfig.spec.json`) because `tsconfig.base.json`'s module setting is what jest+ts-jest uses today; this preserves behavior.

#### Draft C — `apps/api/tsconfig.json` (modify)

Add the spec reference so `tsc --build` picks it up. Today this file references only `tsconfig.app.json`.

```json
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.app.json"
    },
    {
      "path": "./tsconfig.spec.json"
    }
  ]
}
```

**Notes:**
- This is the line `apps/mobile/tsconfig.json` has at line 14, applied here.
- Effect on `nx run api:typecheck`: project references chain now also typechecks test files, **closing the typecheck/test-config gap** noted in F1. This is a deliberate behavior change — flag in the PR description.

#### Draft D — `apps/api/jest.config.cjs` (modify, one line)

Today line 8 reads `tsconfig: '<rootDir>/apps/api/tsconfig.app.json'`. Change to point at the new spec config so test compilation uses the test-aware config:

```diff
   transform: {
-    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/tsconfig.app.json' }],
+    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/tsconfig.spec.json' }],
   },
```

**Notes:**
- This is **the** behavior-affecting decision in the migration. Two options:
  - **Option 1 (recommended):** Switch jest to `tsconfig.spec.json` (above). Test files type-check under the spec config (standard pattern, matches what the `database` package does). Risk: any test code relying on a tsconfig setting that *only* exists in `tsconfig.app.json` and not in `tsconfig.spec.json` will start erroring. Today both extend `tsconfig.base.json` and the spec extends nothing else, so risk is low — but worth a `pnpm test:api:unit` smoke run before merging.
  - **Option 2:** Leave jest pointed at `tsconfig.app.json`. The new `tsconfig.spec.json` is then only consumed by `tsc --build` for typecheck, not by jest. This preserves test-runtime behavior exactly but creates a config split (typecheck and jest can disagree) that is its own foot-gun.
- The PR should pick one explicitly and document the choice in the commit message.

#### What is **not** in the drafts (and why)

- **No `apps/api/tsconfig.lib.json`.** Per F2, api is an application not a library. Adding it would create a shadow `build` target (via `@nx/js/typescript` plugin inference at `nx.json:25-29`) that would conflict with the existing explicit `wrangler deploy --dry-run --outdir dist` build target in `project.json:15-21`. Net: don't add it. (This is the deepening's correction to PACKAGE-SCRIPTS-1d's punch-list entry — see Cross-coupling notes.)
- **No explicit `lint`/`test`/`typecheck` targets in `apps/api/project.json`.** Once the local `eslint.config.mjs` and `tsconfig.spec.json` exist, plugin inference becomes correctly anchored. Adding explicit targets would duplicate the plugin's work. The PR can verify this with `pnpm exec nx show project api --json` before-and-after; targets should still appear.

- **Why it matters:** The drafts make `apps/api` config visible-from-disk instead of inferred-from-elsewhere, while preserving every behavior captured in F1 (one deliberate exception: the typecheck-includes-tests change in Draft C, which is an improvement, not a regression). This is exactly the "make targets declarative rather than inferred" guidance from PACKAGE-SCRIPTS-1 F2/F3.
- **Anticipated effort:** ~30-45 min (write 2 new files, modify 2 existing, verify `nx show project api --json` is unchanged in target count, run `pnpm exec nx run api:lint` + `api:typecheck` + `api:test` smoke).
- **Suggested track:** B

### Finding 4 — Stage-2 decisions surfaced (with recommendations)

- **Severity:** YELLOW (decision-pending, blocks no work)
- **Files:** Three sub-decisions; files cited per item.
- **Evidence:**

#### F4-1 (CLAUDE.md F4 / `sessions.ts` drizzle exception) — **headline correction**

  - **CLAUDE.md "Known Exceptions" claim (lines 37-41):** `apps/api/src/routes/sessions.ts` imports `from 'drizzle-orm'` as the only sanctioned exception.
  - **Reality at HEAD:** PR #130 (commit `8672bdcd`, 2026-05-02 "Interaction durability layers L1–L3 + e2e flow restructure") removed the import. Verified via `git show 8672bdcd~1:apps/api/src/routes/sessions.ts | grep drizzle-orm` → present pre-PR130 (`import { and, eq, lt, sql } from 'drizzle-orm';`); `Grep "from 'drizzle-orm" apps/api/src/routes/` at HEAD → **0 matches**.
  - **Refactor scope:** Already done. The CLAUDE.md re-verification command in lines 41 (`grep -lE "from 'drizzle-orm'" apps/api/src/routes/*.ts`) returns **empty** at HEAD (CLAUDE.md says it should return `apps/api/src/routes/sessions.ts`). The exception is silently obsolete.
  - **Recommendation: NEITHER refactor nor formalize. Correct CLAUDE.md + add a forward-only guard.** The original options A/B framing in this audit's brief is moot. Remove the "Known Exception" entry from CLAUDE.md (lines 37-41); add a one-line note to the recent-history section that the exception was eliminated by PR #130. Optionally add a CI guard mirroring `apps/api/src/services/llm/integration-mock-guard.test.ts` (BUG-743): a small grep-based test that fails CI if any new `from 'drizzle-orm'` import lands in `apps/api/src/routes/*.ts`. This is exactly the "introduce a forward-only guard, then sweep" pattern the consolidated overview's meta-pattern critique recommends — and the sweep half is already complete.
  - **Why it matters:** The stale "Known Exception" creates two failure modes: (a) future contributors read it as license to add new drizzle-orm imports to `sessions.ts` ("the rule says it's allowed there"); (b) the baseline-delta C6 row trusted CLAUDE.md and re-cited the false fact (see Cross-coupling notes). It's also a textbook instance of the consolidated overview's meta-pattern — backward sweep happened, doc follow-through didn't.

#### F4-2 (PACKAGE-SCRIPTS-1 F2/F3) — adopt explicit configs vs. accept inference

  - **Recommendation: adopt the F3 drafts above.** The alternative (formalize the inference path with a CLAUDE.md note "api intentionally relies on plugin inference; do not add local configs") is principled but fragile — every future nx upgrade becomes a behavior-might-shift event. The drafts make the silent contract explicit at the cost of ~50 lines of new config. Tracking single-source-of-truth in code is cheaper than tracking it in CLAUDE.md.
  - **Why it matters:** Removes the "inference walks somewhere I can't see" surprise. Aligns api with both sibling models (mobile-as-app, packages-as-libs).

#### F4-3 (PACKAGE-SCRIPTS-1 F5) — maestro guard symmetry

  - **Current state:** Root `package.json` lines 26/28/32 add `pretest:e2e*` barricade hooks; `nx.json:71-87` `targetDefaults.e2e` runs bare `maestro test e2e/flows/` with no barricade.
  - **Refactor scope:** All three options remain viable. The simplest read of intent is that `nx run mobile:e2e` is currently unused in human workflows (the friendly CLAUDE.md / runbook path is `C:/Tools/maestro/bin/maestro.bat` directly, not nx). `pnpm test:e2e:web*` (Playwright) is the actively-used e2e entrypoint at HEAD per `package.json:30-31`.
  - **Recommendation: option (b) — remove the broken `nx targetDefaults.e2e` block entirely.** It does not match the documented workflow and creates an asymmetry that PACKAGE-SCRIPTS-1 F5 already flagged. The maestro CLI path is a developer-machine concern (the binary lives at `C:/Tools/maestro/bin/maestro.bat`); making it an nx target obscures that. If maestro re-enters the CI/dev flow, add the target back at that point with a wrapper that handles the PATH issue. Option (a) (mirror the barricade into nx) is acceptable as a fallback — same outcome (the target fails loudly), more surface area to maintain.
  - **Why it matters:** Clean removal beats parallel guard maintenance. Couples with PACKAGE-SCRIPTS-1e (the deliberately-broken root scripts).

- **Anticipated effort:** F4-1: ~10 min (CLAUDE.md edit + optional 30 min for guard test). F4-2: covered by F3 drafts. F4-3: ~10 min (delete `nx.json:71-87`, verify `nx graph` doesn't crash).
- **Suggested track:** F4-1 → Phase 0 (decision-pending-user, then mechanical doc edit). F4-2 → B. F4-3 → B.

### Finding 5 — CLAUDE.md "Required Validation" command verification

- **Severity:** GREEN (no drift detected at HEAD)
- **Files:** `CLAUDE.md` (lines 57-60, 145-178) cross-referenced with `package.json` and inferred nx targets.
- **Evidence:** Per-command verification, in CLAUDE.md order:

  | Command | Resolution path | Resolves at HEAD? |
  |---|---|---|
  | `pnpm exec jest --findRelatedTests <files> --no-coverage` | Direct jest binary; no script needed | ✅ |
  | `pnpm exec nx run api:lint` | `@nx/eslint/plugin` (`nx.json:33-38`) → root `eslint.config.mjs` (no local config) | ✅ (today via inference; explicit after F3 drafts) |
  | `pnpm exec nx run api:typecheck` | `@nx/js/typescript` (`nx.json:20-32`) → `apps/api/tsconfig.json` references chain | ✅ |
  | `pnpm exec nx lint mobile` | `@nx/eslint/plugin` → `apps/mobile/eslint.config.mjs` | ✅ |
  | `cd apps/mobile && pnpm exec tsc --noEmit` | Direct tsc; uses `apps/mobile/tsconfig.json` | ✅ |
  | `pnpm run db:push:dev` | `package.json:21` script (Doppler-wrapped tsx + drizzle-kit push) | ✅ |
  | `pnpm run db:generate` | `package.json:22` script (**no `:dev` suffix** despite using `.env.development.local` via Doppler) | ✅ resolves; **naming drift** tracked as PACKAGE-SCRIPTS-1a |
  | `pnpm run db:migrate:dev` | `package.json:23` | ✅ |

  Three commands referenced in CLAUDE.md "Handy Commands" but not in "Required Validation":
  - `pnpm exec nx run-many -t {lint,test,typecheck}` (lines 149-151) — all resolve via plugin inference.
  - `pnpm exec nx run api:test` (line 156) — `@nx/jest/plugin` infers from `apps/api/jest.config.cjs`. ✅
  - `cd apps/mobile && pnpm exec jest --findRelatedTests src/path/to/file.tsx --no-coverage` (line 160) — direct jest. ✅
  - `pnpm run db:studio:dev` (line 166) — script exists at `package.json:24`. ✅
  - `pnpm eval:llm` / `pnpm eval:llm --live` (lines 169-170) — script at `package.json:37` (`tsx apps/api/eval-llm/index.ts`). ✅
  - `C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web*` (lines 175-176) — `package.json:30-31` Playwright invocations. ✅

  **Net:** every CLAUDE.md-promised command resolves at HEAD. The `db:generate` `:dev`-suffix gap is the only naming drift, and it's already tracked as `AUDIT-PACKAGE-SCRIPTS-1a`.

- **Why it matters:** The "DEP-DRIFT-1 / PACKAGE-SCRIPTS-1 caught some renames; verify nothing has drifted since" check completes clean. No new doc/code drift to add to the punch list from this sweep.
- **Anticipated effort:** N/A (verification only)
- **Suggested track:** N/A — confirms existing items, no new items.

## Cross-coupling notes

- **Corrects baseline-delta C6 row.** `docs/audit/2026-05-03-baseline-delta.md` line 122 says "`sessions.ts` still imports `from 'drizzle-orm'` (the documented exception)." That's wrong at HEAD — PR #130 removed the import. The delta inherited the false claim from CLAUDE.md without re-verifying. The deepening's F4-1 corrects both. Recommend the next baseline-delta cycle re-greps "Known Exception" claims rather than trusting CLAUDE.md.
- **Corrects PACKAGE-SCRIPTS-1d punch-list entry.** PACKAGE-SCRIPTS-1d recommended "Add `apps/api/tsconfig.lib.json` and `apps/api/tsconfig.spec.json`." The deepening's F2 + F3 show that `tsconfig.lib.json` is the wrong move — api is an application, not a library, and adding it would create a shadow `build` target. The 1d entry should be re-scoped to "Add `apps/api/tsconfig.spec.json` (only) and modify references."
- **Reinforces PACKAGE-SCRIPTS-1b punch-list entry.** PACKAGE-SCRIPTS-1b ("Add explicit lint/test/typecheck to `apps/api/project.json` (or add `apps/api/eslint.config.mjs`)") was framed as an either/or. The deepening recommends the **eslint.config.mjs** branch (Draft A) — adding explicit project.json targets would duplicate plugin inference, while adding the local eslint config makes inference correctly anchored without redundancy.
- **TYPES-1 / SCHEMA-2 unaffected.** No findings touch the schema-validation cluster. The eslint config drafts do not add or remove module-boundary rules; the tsconfig.spec.json change does not touch the schemas package's tsconfig references.
- **TESTS-1 partially aligned.** The Draft D jest tsconfig switch (Option 1) means test files type-check under a test-aware config — closer to the "tests should compile under the same constraints they document" spirit of TESTS-1. Doesn't resolve TESTS-1's mock-triage scope.
- **C7 (doc reconciliation) gains one item.** The CLAUDE.md "Known Exception" correction is a doc edit that should land alongside (or before) the F3 drafts — otherwise the new explicit configs land while CLAUDE.md still names a non-existent code reality.

## Out of scope / not checked

- **Did not actually run** `pnpm exec nx run api:lint`, `api:typecheck`, `api:test`, or `nx show project api --json` — verification was static (file existence + plugin config + grep). The remediation PR will need to run all three before-and-after to confirm the drafts preserve behavior.
- **Did not test** Draft D Option 1 vs. Option 2 empirically — deferred to the remediation PR. The recommendation is Option 1, but a `pnpm test:api:unit` smoke pre-merge is required before locking it.
- **Did not enumerate** every nx target inferred for api by all four plugins — relied on the documented plugin contracts (`@nx/js/typescript` → typecheck + build; `@nx/eslint/plugin` → lint; `@nx/jest/plugin` → test). A `nx show project api --json` snapshot would be the authoritative input but was time-budget-cut.
- **Did not check** whether other route files (or services/inngest) inadvertently regained drizzle-orm imports between PR #130 and HEAD — only the route-file claim relevant to F4-1 was verified.
- **Did not verify** the PACKAGE-SCRIPTS-1d punch-list entry's behavior claim ("nx plugin infers `build` from `tsconfig.lib.json` per `nx.json:25-29`") — relied on the static `configName: tsconfig.lib.json` setting in `nx.json` and the application-vs-library projectType reasoning. A test of "what happens if I add an empty `tsconfig.lib.json` to apps/api" would be the empirical confirmation but is out of read-only scope.
- **Did not investigate** F4-3 maestro path workflow — relied on the runbook reference in `package.json:25-31` pretest hooks.

## Recommended punch-list entries

> Format ready to paste into the **Phase 0** (decision-pending) or **Track B** sections of `2026-05-02-artefact-consistency-punchlist.md`.

```markdown
- **AUDIT-PACKAGE-SCRIPTS-2a** Correct CLAUDE.md "Known Exceptions" — sessions.ts drizzle import was removed by PR #130
  - Severity: YELLOW-RED (doc/code reality drift)
  - Effort: ~10 min (delete CLAUDE.md lines 37-41; add a one-line note that the exception was eliminated by PR #130, commit 8672bdcd)
  - Files: `CLAUDE.md:37-41`, optionally a new test file `apps/api/src/routes/no-drizzle-orm-imports.test.ts` mirroring the BUG-743 guard pattern
  - Why it matters: CLAUDE.md non-negotiables currently reference a code reality that no longer exists. New contributors will read the "Known Exception" as license to import drizzle-orm into routes. This is also a meta-pattern instance — backward sweep happened (PR #130), doc follow-through didn't.
  - Phase: 0 (decision-pending — confirm with user that the exception removal was intentional, then doc edit)

- **AUDIT-PACKAGE-SCRIPTS-2b** Add `apps/api/eslint.config.mjs` extending root (replaces / supersedes PACKAGE-SCRIPTS-1b's eslint branch)
  - Severity: YELLOW
  - Effort: ~10 min (one-file create, behavior-preserving)
  - Files: `apps/api/eslint.config.mjs` (new)
  - Why it matters: Makes lint coverage declarative-from-disk instead of plugin-inference + root walkup. Net rules unchanged. Resolution path becomes one hop shorter.
  - Phase: B

- **AUDIT-PACKAGE-SCRIPTS-2c** Add `apps/api/tsconfig.spec.json` + update `tsconfig.json` references + switch jest to spec config (replaces PACKAGE-SCRIPTS-1d, scoped down)
  - Severity: YELLOW
  - Effort: ~30 min (two new files, two edits, verify with smoke run)
  - Files: `apps/api/tsconfig.spec.json` (new), `apps/api/tsconfig.json` (add spec reference), `apps/api/jest.config.cjs` (one-line ts-jest tsconfig swap)
  - Why it matters: Closes the typecheck-vs-test config split. Aligns api with the mobile **application** model (not the packages library model — that distinction is why this entry replaces 1d, which incorrectly proposed `tsconfig.lib.json`).
  - Phase: B

- **AUDIT-PACKAGE-SCRIPTS-2d** Drop the broken `nx.json` `targetDefaults.e2e` block (preferred resolution for PACKAGE-SCRIPTS-1c)
  - Severity: YELLOW (already on punch list as 1c; deepening recommends option (b) — remove)
  - Effort: ~10 min
  - Files: `nx.json:71-87`
  - Why it matters: `nx run mobile:e2e` doesn't match the documented workflow (which uses `C:/Tools/maestro/bin/maestro.bat` directly via runbook). Removing the broken target beats maintaining a parallel barricade. Couples with PACKAGE-SCRIPTS-1e (deliberately-broken root scripts).
  - Phase: B

- **AUDIT-PACKAGE-SCRIPTS-2e** Withdraw PACKAGE-SCRIPTS-1d (replaced by 2c, scoped down)
  - Severity: bookkeeping
  - Effort: 0 min (mark 1d as superseded by 2c in the punch-list)
  - Files: `docs/audit/2026-05-02-artefact-consistency-punchlist.md`
  - Why it matters: PACKAGE-SCRIPTS-1d's "add tsconfig.lib.json" recommendation is wrong for an application project. Avoid landing 1d as written.
  - Phase: bookkeeping
```

## Audit honesty disclosures

- **Sweep was full for the items in scope.** All four CLAUDE.md commands listed in "Required Validation" + the eight "Handy Commands" + every relevant config file referenced were read in full. The drafts in F3 are based on direct file reads of every sibling cited.
- **No nx command actually executed.** The plugin-inference resolution paths in F1 are derived from plugin documentation (via the static `nx.json` config) plus file existence checks, not from running `nx show project api --json`. The remediation PR must validate empirically.
- **F4-1's git-history claim is single-source.** I verified PR #130 removed the import via two git operations: (a) `git log -S "from 'drizzle-orm'"` to find the last touch, (b) `git show 8672bdcd~1:apps/api/src/routes/sessions.ts | grep` to confirm presence in the parent. I did not read the PR #130 description on GitHub to confirm intent — the removal could have been deliberate (refactor) or accidental (drive-by while restructuring streaming code). Either way, the live state is "no drizzle-orm import in sessions.ts at HEAD," which is what F4-1 acts on.
- **The baseline-delta correction in Cross-coupling notes is a finding the delta missed**, not a delta-rewrite. The delta was published 2026-05-03 with the methodology "trust CLAUDE.md for exception claims" — that methodology produced one false-positive (this one). The delta should be footnoted in a future cycle.
- **F2's "shadow build target" claim is theoretical**, based on `nx.json:25-29` `configName: tsconfig.lib.json` plugin config + the existing explicit `build` target in `apps/api/project.json`. Whether nx silently picks one, errors, or merges is unverified. The recommendation (don't add `tsconfig.lib.json`) is conservative — even if nx handles the conflict gracefully, adding the file creates a redundant build path.
- **F3 Draft D Option 1 vs. Option 2 is a real decision** the deepening doesn't resolve. Recommendation is Option 1 with a smoke run; if a smoke run reveals breakage, Option 2 is the safe fallback.
- **Time spent:** ~45 minutes recon + reading + ~20 minutes writing.
