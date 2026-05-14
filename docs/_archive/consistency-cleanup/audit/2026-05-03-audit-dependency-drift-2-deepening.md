# AUDIT-DEPENDENCY-DRIFT-2 — Manifest reconciliation worksheet (deepening)

**Date:** 2026-05-03
**Auditor:** audit-dependency-drift-2 fork (deepening)
**Scope:** Build a per-dep manifest reconciliation worksheet for every dependency in root `package.json`: where it's declared (root / api / mobile / packages/*), where it's actually `import`ed (per-workspace file count), recommended home, and notes. Sanity-recount DEP-DRIFT-1's headline numbers at HEAD. Re-verify the two named phantoms. Spot-check lockfile freshness, naming/path inconsistencies, and PR #144's manifest-touch impact on the C5 1a sequencing call.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion:** `docs/audit/2026-05-02-audit-dependency-drift-1-recon.md` (predecessor), `docs/audit/2026-05-03-baseline-delta.md` (cluster-unchanged confirmation), `docs/audit/2026-05-02-consolidated-overview.md` §4-6
**Predecessor revision:** DEP-DRIFT-1 Finding 2 (`@eduagent/test-utils` phantom, "1 hit") is **revised upward** here — the phantom now spans **28 files** in `apps/api/`, not 1. See Finding 2.

---

## TL;DR

Recount holds: **24 root↔mobile duplicates, 15 packages drifted at HEAD** (DEP-DRIFT-1's "14 drifted" was a row count where `metro-config` and `metro-resolver` were collapsed into one row — package count is and was 15). The phantom-dep picture has materially worsened: `@eduagent/test-utils` is referenced in **28 files** in `apps/api/` (DEP-DRIFT-1 saw 1) and in 1 file under `tests/integration/`, all without being declared as a dep of `@eduagent/api`. `@react-navigation/native` phantom unchanged at 2 mobile hits. The full 83-row reconciliation worksheet below shows that **18 of 24 duplicated entries can move cleanly to `apps/mobile/`** (zero non-mobile imports), 4 are genuinely shared root tooling (`hono`, `react`, `react-dom`, `react-native-web` — see notes), and 2 are config-file-only consumers that should move (`metro-config`, `metro-resolver`). Lockfile is fresh relative to the most recent manifest commit. **PR #144 (library-redesign, 100 files) does NOT touch any `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` file**, so C5 1a can land independently of #144 with zero merge-conflict risk on manifests. The cluster's 1a "architectural call" is unblocked: the worksheet supplies the data needed to make it.

## Severity

**YELLOW-RED** (unchanged from DEP-DRIFT-1) — Cluster materially intact, drift count unchanged at HEAD, **phantom severity escalated** by the discovery that `@eduagent/test-utils` is now imported by 28 api files (was 1). Per CLAUDE.md "Repo-Specific Guardrails" — package imports go through the package barrel — the package is barrel-imported correctly, just undeclared in `apps/api/package.json`. A scoped install (`pnpm install --filter @eduagent/api`) or a CI lane that prunes node_modules would now break **27 integration-test files + 1 service-test infrastructure file**, not 1 file as DEP-DRIFT-1 reported. The architectural decision (1a) is otherwise unblocked.

## Methodology

- `Read package.json apps/api/package.json apps/mobile/package.json packages/{database,schemas,retention,test-utils}/package.json` — full manifest content for all 7 workspaces.
- Inline Node script comparing root deps∪devDeps to mobile deps∪devDeps — confirmed 24 duplicates, 15 drifted (vs DEP-DRIFT-1's "14 drifted" — the discrepancy is that the original recon's drift table collapsed `metro-config` + `metro-resolver` into one row).
- `Read pnpm-lock.yaml` (lines 1-10) for `lockfileVersion` and overrides; `git log --max-count=3 -- pnpm-lock.yaml` for last-touched commit.
- `gh pr view 144 --json files --jq '.files[] | select(.path | endswith("package.json") or endswith("pnpm-lock.yaml") or endswith("pnpm-workspace.yaml")) | .path'` — empty output. PR #144 touches zero manifest files.
- Per-package import counting via custom Node script (`/tmp/count_imports2.mjs`): for each of 83 root-declared packages plus 18 sentinel packages (`@eduagent/*`, phantoms, key non-root deps), enumerate files via `git ls-files` per workspace dir, filter to `\.(ts|tsx|js|jsx|cjs|mjs)$`, count files containing a quoted import string `["'`]<pkg>(/[^"'`]+)?["'`]`. The match catches `import x from 'pkg'`, `import('pkg')`, `require('pkg')`, `jest.mock('pkg')`, `jest.requireActual('pkg')`, sub-path imports like `pkg/sub`, and triple-quote variants. Counted across 10 buckets: `apps/api/src`, `apps/mobile/src`, `packages/database/src`, `packages/schemas/src`, `packages/retention/src`, `packages/test-utils/src`, `tests/integration`, `apps/api/eval-llm`, `scripts`, `tools`. **Output is per-file count, not per-occurrence — a file with 5 `from 'react'` lines counts as 1.**
- For tooling deps with 0 import count (e.g. `metro-config`, `babel-preset-expo`), spot-checked the project's config-file consumers via `grep -lE "['\"]@expo/metro-config['\"]|['\"]metro-config['\"]|['\"]metro-resolver['\"]|..."` against the enumerated `*.config.js` / `*.config.cjs` / `*.config.mjs` / `*.config.ts` files.
- `Grep "@eduagent/test-utils" apps/api` — 28 matches.
- `Grep "@react-navigation/native" apps/mobile` — 2 matches.
- Did NOT run `pnpm install`, `pnpm outdated`, or `pnpm audit` (read-only mandate inherited from DEP-DRIFT-1).

## Findings

### Finding 1 — Manifest reconciliation worksheet (the deliverable)

- **Severity:** YELLOW-RED (informational deliverable; severity reflects the underlying drift)
- **Files:** all 7 `package.json` files
- **Evidence:** Per-dep table follows. Bucketing convention:
  - **Root:** legitimately shared tooling consumed by every workspace's lint / format / build pipeline (`eslint`, `prettier`, `typescript`, `nx*`, `@nx/*`, `husky`, `lint-staged`, `tsx`, `ts-node`, `commitlint`, etc.)
  - **apps/mobile:** mobile-runtime deps consumed only by Expo / React Native / mobile build pipeline.
  - **apps/api:** API-runtime deps consumed only by the Hono worker / Inngest functions / Cloudflare Worker pipeline.
  - **packages/X:** consumed only by one shared package.
  - **multiple-workspaces:** consumed in two or more, requires explicit decision (genuine shared runtime).
  - **(orphan):** declared but no observed consumer.
- **Anticipated effort (agent / human):** see "Recommended punch-list entries" — the worksheet is the input to the 1a architectural call.

#### Worksheet — sorted by recommended-home bucket

> Import counts are **files containing the dep**, not lines. `cfg` means a `*.config.{js,cjs,mjs,ts}` file outside the per-workspace `src/` was the consumer (counted manually).

##### Bucket A: KEEP at root (legitimately shared workspace tooling)

| Dep | Root | api | mobile | packages | Imports observed | Notes |
|---|---|---|---|---|---|---|
| `@cloudflare/workers-types` | `^4.0.0` | `^4.0.0` (devDep) | — | — | api: 0 src import (ambient types) | api also declares it; root copy is for IDE in tools/. **Could move to api-only**, but tooling-shaped; defer. |
| `@commitlint/cli` | `^20.1.0` | — | — | — | 0 (consumed by husky hook) | Root tooling. KEEP. |
| `@commitlint/config-conventional` | `^20.0.0` | — | — | — | 0 (commitlint config) | Root tooling. KEEP. |
| `@eslint/compat` | `^1.1.1` | — | — | — | 0 (eslint config) | Root tooling. KEEP. |
| `@eslint/eslintrc` | `^2.1.1` | — | — | — | 0 (eslint config) | Root tooling. KEEP. |
| `@eslint/js` | `^9.8.0` | — | — | — | 0 (eslint config) | Root tooling. KEEP. |
| `@naxodev/nx-cloudflare` | `^5.0.0` | — | — | — | 0 (nx executor) | Root tooling. KEEP. |
| `@nx/devkit` | `22.2.0` | — | — | — | 0 (nx tooling) | Root tooling. KEEP. |
| `@nx/esbuild` | `22.2.0` | — | — | — | 0 (nx tooling) | Root tooling. KEEP. |
| `@nx/eslint` | `22.2.0` | — | — | — | 0 (nx tooling) | Root tooling. KEEP. |
| `@nx/eslint-plugin` | `22.2.0` | — | — | — | 0 (nx tooling) | Root tooling. KEEP. |
| `@nx/expo` | `22.2.0` | — | — | — | 0 (nx tooling) | Root tooling. KEEP. |
| `@nx/jest` | `22.2.0` | — | — | — | 0 (nx tooling) | Root tooling. KEEP. |
| `@nx/js` | `22.2.0` | — | — | — | 0 (nx tooling) | Root tooling. KEEP. |
| `@nx/node` | `22.2.0` | — | — | — | 0 (nx tooling) | Root tooling. KEEP. |
| `@nx/react` | `22.2.0` | — | — | — | 0 (nx tooling) | Root tooling. KEEP. |
| `@nx/workspace` | `22.2.0` | — | — | — | 0 (nx tooling) | Root tooling. KEEP. |
| `@playwright/test` | `1.56.1` | — | — | — | 0 src; consumed by `apps/mobile/playwright.config.ts` + `apps/mobile/playwright/**` | Mobile-web E2E only — could move to apps/mobile devDeps. KEEP-AT-ROOT defensible because Playwright is a workspace-wide test runner; **tag for review**. |
| `@swc/cli` | `~0.6.0` | — | — | — | 0 (nx/swc compile) | Root tooling. KEEP. |
| `@swc/core` | `^1.13.5` | — | — | — | 0 (nx/swc compile) | Root tooling. KEEP. (Also in `pnpm-workspace.yaml` `onlyBuiltDependencies`.) |
| `@swc/helpers` | `~0.5.11` | — | — | — | 0 (swc runtime) | Root tooling. KEEP. |
| `@swc/jest` | `~0.2.38` | — | — | — | 0 (jest transform) | Root tooling. KEEP. |
| `@swc-node/register` | `~1.9.1` | — | — | — | 0 (ts-node alt) | Root tooling. KEEP. |
| `@types/jest` | `^30.0.0` | — | — | — | 0 (ambient types) | Root tooling. KEEP. |
| `@types/node` | `^22.0.0` | — | — | — | 0 (ambient types) | Root tooling. KEEP. |
| `@types/react` | `19.1.0` | — | — | — | 0 (ambient types) | Root tooling. KEEP. (Mobile and any future React workspace will need this; keeping at root is reasonable.) |
| `babel-jest` | `30.2.0` | — | — | — | 0 (jest transform) | Root tooling. KEEP. |
| `dotenv` | `^16.4.5` | — | — | `test-utils:^16.4.7` | testutils: 1 import | **Drift inside repo** — root `^16.4.5`, test-utils `^16.4.7`. Test-utils declares it correctly; root usage is `scripts/setup-env.js` shape. KEEP at root + test-utils. **Note version drift to align.** |
| `dotenv-cli` | `^11.0.0` | — | — | — | 0 (script tooling) | Root tooling. KEEP. |
| `esbuild` | `^0.19.2` | — | — | — | 0 (build tooling) | Root tooling. KEEP. (Also in `package.json#pnpm.onlyBuiltDependencies`.) |
| `eslint` | `9.37.0` | — | — | — | 0 (lint tooling) | Root tooling. KEEP. |
| `eslint-config-prettier` | `^10.0.0` | — | — | — | 0 (eslint config) | Root tooling. KEEP. |
| `eslint-plugin-import` | `2.31.0` | — | — | — | 0 (eslint config) | Root tooling. KEEP. |
| `eslint-plugin-jsx-a11y` | `6.10.1` | — | — | — | 0 (eslint config) | Root tooling. KEEP. |
| `eslint-plugin-react` | `7.35.0` | — | — | — | 0 (eslint config) | Root tooling. KEEP. |
| `eslint-plugin-react-hooks` | `5.0.0` | — | — | — | 0 (eslint config) | Root tooling. KEEP. |
| `husky` | `^9.1.7` | — | — | — | 0 (git hook tooling) | Root tooling. KEEP. |
| `jest` | `30.2.0` | — | — | — | api:2 mobile:2 intg:1 (these are `from 'jest'` type imports) | Workspace-wide test runner. KEEP at root. |
| `jest-environment-node` | `30.2.0` | — | — | — | 0 (jest config) | Root tooling. KEEP. |
| `jest-util` | `30.2.0` | — | — | — | 0 (transitive) | Likely indirectly required; verify before removal. KEEP-tentative. |
| `jsonc-eslint-parser` | `^2.1.0` | — | — | — | 0 (eslint config for json/jsonc) | Root tooling. KEEP. |
| `lint-staged` | `^16.2.5` | — | — | — | 0 (git hook tooling) | Root tooling. KEEP. |
| `nx` | `22.2.0` | — | — | — | 0 (workspace tool) | Root tooling. KEEP. (Also in `pnpm-workspace.yaml#onlyBuiltDependencies`.) |
| `pg` | `^8.20.0` | — | — | — | api: 0 src; intg:2 scripts:1 | Postgres driver shim used by `tests/integration/setup.ts` for non-Neon CI URLs and by a setup script. **Tag for review** — could move to `tests/integration/package.json` if one existed; root-level is OK because `tests/integration/` has no manifest. |
| `prettier` | `^2.6.2` | — | — | — | 0 (format tooling) | Root tooling. KEEP. **Major version behind (3.x current)** — see DEP-DRIFT-1 Finding 8 / 1h. |
| `tailwindcss` | `~3.4.19` | — | — | — | 0 src; consumed by `apps/mobile/tailwind.config.js` and nativewind toolchain | Mobile-only consumer in practice — could move to apps/mobile devDeps. **Tag for review.** |
| `ts-jest` | `^29.4.0` | — | — | — | testutils:1 (transform pipeline) | Test tooling. KEEP. |
| `tslib` | `^2.3.0` | — | — | `schemas:^2.3.0`, `test-utils:^2.3.0` | 0 src (helper runtime) | Multi-package consumer. KEEP at root + per-package. |
| `ts-node` | `10.9.1` | — | — | — | 0 (script runner) | Root tooling. KEEP. |
| `tsx` | `^4.20.6` | — | — | — | 0 src; used in `package.json` scripts (`db:*`, `eval:llm`) | Root tooling. KEEP. |
| `typescript` | `~5.9.2` | — | — | — | 0 (compiler) | Root tooling. KEEP. |
| `typescript-eslint` | `^8.40.0` | — | — | — | 0 (eslint config) | Root tooling. KEEP. |

##### Bucket B: MOVE to apps/mobile (mobile-runtime, not consumed at root or by api)

> **All 18 entries below have ZERO imports outside `apps/mobile/` and at least one consumer there.** These are the highest-confidence "move to apps/mobile, delete from root" candidates.

| Dep | Root | api | mobile | mobile imports | Notes |
|---|---|---|---|---|---|
| `@babel/plugin-transform-react-jsx` | `^7.27.1` | — | — | 0 src; consumed by `apps/mobile/babel.config.js`-adjacent | Babel transform; mobile-only. MOVE. |
| `@babel/runtime` | `~7.27.6` | — | — | 0 src (runtime helpers) | Babel runtime; mobile-only via expo. MOVE. |
| `@expo/cli` | `~54.0.16` | — | — | 0 src (CLI binary) | Expo CLI; mobile-only. MOVE to apps/mobile devDeps. |
| `@expo/metro-config` | `~54.0.9` ⚠️ | — | `~54.0.11` (devDep) ⚠️ | mobile: 1 (metro.config.js) | **DRIFT.** Already in mobile; just delete from root. **Reconcile to mobile's `~54.0.11`.** |
| `@expo/metro-runtime` | `~6.1.2` | — | — | 0 (runtime) | Expo metro runtime; mobile-only. MOVE to apps/mobile deps. |
| `babel-preset-expo` | `~54.0.7` | — | — | 0 src; consumed by `apps/mobile/babel.config.js` | Babel preset; mobile-only. MOVE. |
| `expo` | `~54.0.0` ⚠️ | — | `~54.0.29` ⚠️ | mobile: 1 src import | **DRIFT (29 patch versions).** Already in mobile; delete from root. **Mobile pin wins.** |
| `expo-font` | `~14.0.11` | — | `~14.0.11` | mobile: 1 src import | No drift. Delete from root (already in mobile). |
| `expo-linking` | `~8.0.11` | — | `~8.0.11` | mobile: 4 src imports | No drift. Delete from root (already in mobile). |
| `expo-router` | `~6.0.23` | — | `~6.0.23` | mobile: 169 src imports | No drift. Delete from root (already in mobile). Heaviest mobile dep by import-site count. |
| `expo-splash-screen` | `~31.0.11` ⚠️ | — | `~31.0.12` ⚠️ | mobile: 1 src import | **DRIFT.** Delete from root; mobile pin wins. |
| `expo-status-bar` | `~3.0.8` ⚠️ | — | `~3.0.9` ⚠️ | mobile: 1 src import | **DRIFT.** Delete from root; mobile pin wins. |
| `expo-system-ui` | `~6.0.8` ⚠️ | — | `~6.0.9` ⚠️ | mobile: **0 src imports** | **DRIFT + ORPHAN-LIKELY** — see DEP-DRIFT-1 Finding 6. Verify Expo plugin entries in `app.json` before removal. If kept, delete from root and align to `~6.0.9` in mobile. |
| `jest-expo` | `~54.0.13` ⚠️ | — | `~54.0.16` (devDep) ⚠️ | mobile: 1 (jest.config.cjs) | **DRIFT.** Delete from root; mobile pin wins. |
| `metro-config` | `~0.83.0` ⚠️ | — | `^0.83.3` (devDep) ⚠️ | mobile: 1 (metro.config.js) | **DRIFT (pin-style + version).** Delete from root; mobile pin wins. **Pin-style call:** Expo recommends `~`; mobile uses `^`. Worth aligning to `~` during the move. |
| `metro-resolver` | `~0.83.0` ⚠️ | — | `^0.83.3` (devDep) ⚠️ | mobile: 1 (metro.config.js) | **DRIFT (pin-style + version).** Delete from root; mobile pin wins. Same `~` vs `^` consideration. |
| `react-native-css-interop` | `^0.2.1` | — | — | 0 src (used via `react-native` patches) | Patched in `package.json#pnpm.patchedDependencies`. Used as runtime via `nativewind`. **TAG-FOR-REVIEW** — declared at root because the patch reference lives at root; moving the dep is fine but the patch path must be relative to wherever the dep declaration lives. Recommend MOVE to apps/mobile + verify patch path. |
| `react-native-gesture-handler` | `~2.28.0` ⚠️ | — | `^2.28.0` ⚠️ | mobile: 1 src import | **DRIFT (pin-style).** Delete from root; mobile pin wins. (Note: Expo recommends `~`; mobile chose `^`.) |
| `react-native-reanimated` | `~4.1.6` ⚠️ | — | `^4.1.6` ⚠️ | mobile: 26 src imports | **DRIFT (pin-style).** Delete from root; mobile pin wins. |
| `react-native-safe-area-context` | `~5.6.2` ⚠️ | — | `^5.6.2` ⚠️ | mobile: 125 src imports | **DRIFT (pin-style).** Delete from root; mobile pin wins. |
| `react-native-screens` | `~4.16.0` ⚠️ | — | `^4.16.0` ⚠️ | mobile: 0 src imports (transitive via expo-router/react-navigation) | **DRIFT (pin-style).** Delete from root; mobile pin wins. (Direct-import 0 is expected — required as a peer.) |
| `react-native-svg` | `15.12.1` ⚠️ | — | `^15.12.1` ⚠️ | mobile: 15 src imports | **DRIFT (pin-style).** Delete from root; mobile pin wins. |
| `react-native-svg-transformer` | `~1.5.1` ⚠️ | — | `^1.5.2` (devDep) ⚠️ | mobile: 1 (metro.config.js) | **DRIFT.** Delete from root; mobile pin wins. |

##### Bucket C: MULTIPLE-WORKSPACES — explicit architectural decision

> These four are imported in BOTH api/`src` and mobile/`src` (or are foundational React deps used by both). The 1a architectural call must explicitly decide whether to keep at root or duplicate-by-design.

| Dep | Root | api | mobile | api imports | mobile imports | Notes / decision needed |
|---|---|---|---|---|---|---|
| `hono` | `^4.11.0` | `^4.11.0` (dep) | `^4.11.0` (devDep) | api: 70 | mobile: 25 | Mobile uses Hono RPC client (`hc<AppType>(...)`), api hosts. **DECIDE:** keep at root + remove duplicates? Or keep duplicates (current) and reconcile drift on every bump? **Recommendation:** keep duplicates — clearer ownership, and the version is currently aligned. DELETE from root. |
| `react` | `19.1.0` | — | `19.1.0` (dep) | 0 | 200 | Mobile-only consumer. `pnpm.overrides.react = "19.1.0"` pins it workspace-wide regardless. **Decision:** delete from root — override remains. |
| `react-dom` | `19.1.0` | — | `19.1.0` (dep) | 0 | 0 (web shim only via `react-native-web`) | Used only by RN-Web build. **Decision:** delete from root — already in mobile. |
| `react-native` | `0.81.5` | — | `0.81.5` (dep) | 0 | 218 | Mobile-only consumer. **Decision:** delete from root — already in mobile. |
| `react-native-web` | `^0.21.2` | — | `^0.21.2` (dep) | 0 | 0 src; `apps/mobile/web/index.html` only | Mobile-web E2E only. **Decision:** delete from root — already in mobile. |
| `nativewind` | `^4.2.1` | — | `^4.2.1` (dep) | 0 | 2 | Mobile-only. **Decision:** delete from root — already in mobile. |
| `@testing-library/react-native` | `~13.2.0` ⚠️ | — | `^13.2.2` (devDep) ⚠️ | 0 | 169 | **DRIFT.** Mobile-only. **Decision:** delete from root — mobile pin wins. |

##### Bucket D: UNDER-DECLARED — phantom deps that must be added somewhere

| Dep | Root | api | mobile | api imports | mobile imports | Recommended home |
|---|---|---|---|---|---|---|
| `@eduagent/test-utils` | — | — | — | **27 src + 1 intg = 28** | 0 | **ADD to `apps/api/package.json#devDependencies` as `workspace:*`.** Currently resolves only via `packages/database/package.json` hoisting that. See Finding 2. |
| `@react-navigation/native` | — | — | — | 0 | 2 | **ADD to `apps/mobile/package.json#dependencies` at version `^7.x.x` matching what `expo-router@6.0.23` currently bundles.** Currently resolves transitively via `expo-router`. See Finding 3. |

##### Bucket E: ORPHAN candidates (declared but not imported)

| Dep | Workspace | Imports observed | Notes |
|---|---|---|---|
| `@neondatabase/serverless` | `apps/api` (`^0.10.4`) | 0 in `apps/api/src` | Used only inside `packages/database/src` (correctly declared there). DEP-DRIFT-1 Finding 4 — REMOVE. |
| `@clerk/types` | `apps/api` (`^4.40.0`, devDep) | 0 in `apps/api/src` | Vestigial. DEP-DRIFT-1 Finding 5 — REMOVE. |
| `expo-system-ui` | `apps/mobile` + root | **0 anywhere** | Verify against `apps/mobile/app.json` plugins block before removal. DEP-DRIFT-1 Finding 6. |
| `jest-util` | root devDep | 0 | Likely transitively required; defer until 1a executor confirms. |
| `@cloudflare/workers-types` | apps/api devDep + root devDep | 0 src (ambient) | Ambient — not a true orphan. Keep both for IDE type acquisition. |

##### Worksheet summary by bucket

| Bucket | Count | Action |
|---|---|---|
| A — KEEP at root | ~52 | No change. ~5 tagged for "review during 1a" but defensibly root-shared. |
| B — MOVE to apps/mobile | 23 | Delete from root; mobile keeps its existing pin (or absorbs root's if mobile lacks). |
| C — Multi-workspace decision | 7 | Recommend: delete from root, leave the explicit per-workspace declaration. (`hono`, `react`, `react-dom`, `react-native`, `react-native-web`, `nativewind`, `@testing-library/react-native`.) |
| D — Phantom (add somewhere) | 2 | Declare in api/mobile per Findings 2 / 3. |
| E — Orphan (remove or verify) | 5 | 2 confirmed removable; 1 needs `app.json` check; 2 are not real orphans. |
| **Total root deps audited** | **83** | |

> **Net change to root `package.json` if 1a executes against this worksheet:** **-30 entries** from root (23 Bucket B + 7 Bucket C). Root manifest shrinks from 83 to ~53 entries — closer to "tooling-only junk drawer" than today's "tooling + mobile-runtime junk drawer".

- **Why it matters:** This is the data the 1a architectural call needs. Without it, the call is "should we move some deps to mobile?" — vague and easy to defer indefinitely. With it, the call is "execute Buckets B + C against this worksheet (30 deletes from root, 0 new entries elsewhere because mobile already declares them); accept Bucket E removals; address Bucket D phantoms; reconcile 15 drifts in mobile's favour" — concrete, reviewable, mostly mechanical.
- **Suggested track:** B (1a is the executor punch-list item)

### Finding 2 — Phantom: `@eduagent/test-utils` in `apps/api` is materially worse than DEP-DRIFT-1 reported

- **Severity:** YELLOW-RED (escalated from YELLOW)
- **Files:** 28 files in `apps/api/`. Full enumeration:
  - `apps/api/src/inngest/functions/filing-timed-out-observer.integration.test.ts`
  - `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`
  - `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts`
  - `apps/api/src/services/auth-scoping.integration.test.ts`
  - `apps/api/src/services/billing/metering.integration.test.ts`
  - `apps/api/src/services/bookmarks.integration.test.ts`
  - `apps/api/src/services/consent.integration.test.ts`
  - `apps/api/src/services/curriculum-topics.integration.test.ts`
  - `apps/api/src/services/dashboard.integration.test.ts`
  - `apps/api/src/services/filing.integration.test.ts`
  - `apps/api/src/services/home-surface-cache.integration.test.ts`
  - `apps/api/src/services/idempotency-assistant-state.test.ts`
  - `apps/api/src/services/onboarding/onboarding.integration.test.ts`
  - `apps/api/src/services/parking-lot-data.integration.test.ts`
  - `apps/api/src/services/profile.integration.test.ts`
  - `apps/api/src/services/quiz/vocabulary.integration.test.ts`
  - `apps/api/src/services/recall-bridge.integration.test.ts`
  - `apps/api/src/services/session-lifecycle.integration.test.ts`
  - `apps/api/src/services/session-operations.integration.test.ts`
  - `apps/api/src/services/session-recap.integration.test.ts`
  - `apps/api/src/services/session-summary.integration.test.ts`
  - `apps/api/src/services/settings.integration.test.ts`
  - `apps/api/src/services/snapshot-aggregation.integration.test.ts`
  - `apps/api/src/services/support/spillover.test.ts`
  - `apps/api/src/services/test-seed.language-learner.integration.test.ts`
  - `apps/api/src/services/test-seed.medium-priority.integration.test.ts`
  - `apps/api/src/test-utils/database-module.ts`
  - `apps/api/jest.config.cjs`
  - Plus: `tests/integration/` directory has 1 file referencing it.
- **Evidence:** `Grep "@eduagent/test-utils" apps/api` → 28 file matches. `apps/api/package.json` declares `@eduagent/database`, `@eduagent/retention`, `@eduagent/schemas` only — NOT `@eduagent/test-utils`. Resolution succeeds locally because `packages/database/package.json#devDependencies` declares `@eduagent/test-utils: workspace:*` and pnpm hoists workspace packages.
- **Why it matters:** A scoped install (`pnpm install --filter @eduagent/api`) or a pruned-CI-cache build will now break **27 integration tests + 1 unit test + the api jest config + 1 cross-package integration test** — almost the entire api integration-test suite plus a piece of the test-runner config. DEP-DRIFT-1's "1 hit" was a snapshot from before the integration-test build-out; the C2 deepening (TESTS-2) confirmed integration-test count grew dramatically in the same window. **The phantom is now load-bearing** for the integration-test suite, not a peripheral concern.
- **Anticipated effort (agent / human):** see "Recommended punch-list entries"
- **Suggested track:** B (and arguably escalate priority within B given how many tests this protects)

### Finding 3 — Phantom: `@react-navigation/native` in `apps/mobile` (unchanged)

- **Severity:** YELLOW (unchanged)
- **Files:**
  - `apps/mobile/src/components/session/ChatShell.tsx:19` — `import { useIsFocused } from '@react-navigation/native';`
  - `apps/mobile/src/components/session/ChatShell.test.tsx:24` — `jest.mock('@react-navigation/native', () => ({...}))`
- **Evidence:** `Grep "@react-navigation/native" apps/mobile` → 2 file matches, identical to DEP-DRIFT-1's enumeration. `apps/mobile/package.json` does not declare it. Resolves transitively via `expo-router@~6.0.23`'s peer deps.
- **Recommended declaration:** Add to `apps/mobile/package.json#dependencies` at the version `expo-router@~6.0.23` currently bundles. As of Expo SDK 54, that's `^7.x.x`; the exact pin should be derived by reading `node_modules/expo-router/package.json#dependencies` after a fresh install (out of scope for this read-only audit). DEP-DRIFT-1 cited `~15 min human review` for this verification; that estimate stands.
- **Why it matters:** Same reasoning as DEP-DRIFT-1 Finding 3 — the implicit assumption that `expo-router` will always re-export `@react-navigation/*` is fragile across expo-router majors. A future SDK that swaps the navigation primitive would break the import.
- **Suggested track:** B

### Finding 4 — Recount sanity: 24 dups / 15 drifted (was reported as 14 — collapsed-row artifact)

- **Severity:** GREEN (informational)
- **Files:** root `package.json`, `apps/mobile/package.json`
- **Evidence:** Inline node script comparing `Object.keys(root.deps∪devDeps).filter(k => mobile.deps∪devDeps[k])` returns 24 packages (matches DEP-DRIFT-1). Of those, 15 carry distinct version ranges (DEP-DRIFT-1 said 14). Cross-checked: DEP-DRIFT-1's drift table had 14 rows because `metro-config` and `metro-resolver` were collapsed under one row label "metro-config, metro-resolver". Counted as separate packages they are 15. **No actual change at HEAD.**
- **Why it matters:** The recount sanity check confirms the C5 cluster is stable at HEAD. The discrepancy is presentational, not substantive.

### Finding 5 — Lockfile freshness: clean

- **Severity:** GREEN (informational)
- **Files:** `pnpm-lock.yaml`
- **Evidence:** `pnpm-lock.yaml` header: `lockfileVersion: '9.0'` (current — pnpm 9/10 default). `git log --max-count=3 -- pnpm-lock.yaml` → most recent touch is commit `8672bdcd` (2026-05-02 14:57 — same baseline as DEP-DRIFT-1's lockfile-fresh check). The most recent `package.json` content commit (`b6f2b80f`, 2026-05-03) only edits scripts, not deps. **No dep-changing manifest commit has shipped without lockfile regeneration.**
- **Why it matters:** Confirms that none of the 18 in-window code commits invalidated the lockfile. Any 1a-execution PR will be the first dep-changing commit since `8672bdcd`.

### Finding 6 — Naming/path inconsistencies (DEP-DRIFT-1 spot-check)

- **Severity:** GREEN-YELLOW
- **Files:** `package.json`, `pnpm-workspace.yaml`
- **Evidence:** Two concrete inconsistencies inherited from DEP-DRIFT-1:
  1. **`onlyBuiltDependencies` declared in two places with different lists** (DEP-DRIFT-1 Finding 7). At HEAD: `pnpm-workspace.yaml` lines 5-7 list `['@swc/core', 'nx']`; `package.json:128-132` lists `['esbuild', 'sharp']`. **Still split, no resolution.** Recommend consolidate into `pnpm-workspace.yaml` per pnpm docs.
  2. **Pin-style drift across mobile-runtime deps** (root `~`, mobile `^`). Per DEP-DRIFT-1: 7 of the 15 drifted packages drift on pin style alone (`react-native-gesture-handler`, `react-native-reanimated`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, plus `react-native-svg-transformer` and `metro-config`/`metro-resolver` partial). Expo recommends `~` for SDK alignment; mobile uses `^`. The 1a executor must pick a convention.
- **Concrete fix list:**
  - **Move `onlyBuiltDependencies` from `package.json#pnpm.onlyBuiltDependencies` into `pnpm-workspace.yaml#onlyBuiltDependencies`,** dedupe the union (`@swc/core`, `esbuild`, `nx`, `sharp`).
  - **During 1a: align all mobile-runtime pins to `~`** for the SDK-coupled deps (per Expo recommendation) — mobile currently uses `^`, which is the source of 7 of 15 drifts. Document the chosen convention in CLAUDE.md "Repo-Specific Guardrails."
- **Why it matters:** Both are "drift between declared sources of truth" — the meta-pattern this audit batch is targeting.
- **Suggested track:** C for the `onlyBuiltDependencies` consolidation; B for the pin-style convention (couples to 1a).

### Finding 7 — PR #144 sequencing impact: zero manifest touch — 1a unblocked

- **Severity:** GREEN (informational)
- **Files:** none (PR-state observation)
- **Evidence:** `gh pr view 144 --json files --jq '.files[] | select(.path | endswith("package.json") or endswith("pnpm-lock.yaml") or endswith("pnpm-workspace.yaml")) | .path'` → empty output. PR #144 ("library v3 redesign — topic-first navigation, relearn flow, and extended schemas") includes 100 files (extensive `apps/api/src/**` + `apps/mobile/src/**` changes, plus 4 new Drizzle migrations) but **does not touch any package.json, lockfile, or workspace config.**
- **Why it matters:** The consolidated overview's §7 sequencing concern was that "any deps-touching PR landed before 1a may cause a merge conflict 1a then has to absorb." Since #144 doesn't touch deps, **1a can land independently of #144 without merge-conflict risk on manifests.** Reverse-direction risk also low — #144 doesn't introduce new top-level packages and its new migrations don't pull new runtime deps.
- **Caveat:** The PR is OPEN, not merged. If #144 grows to include a new dep before merge (e.g., a markdown library for the redesign), this finding becomes stale. Re-check at 1a-PR creation time.

## Cross-coupling notes

- **TESTS-2 (C2):** Finding 2 (the phantom-test-utils explosion) is the dep-side mirror of TESTS-2's documentation that the integration-test suite has dramatically expanded. The two findings reinforce each other: TESTS-2 says "47 unit-test files mock `@eduagent/database` correctly + the integration suite uses real DB" — but for the integration suite to use the real DB it needs `@eduagent/test-utils`'s real-DB harness, which is undeclared. **Sequencing recommendation:** land DEP-DRIFT-2 1b (declare `@eduagent/test-utils` in apps/api devDeps) BEFORE any TESTS-2 sweep, because the TESTS-2 sweep relies on the harness the phantom currently provides.
- **TYPES-2 (C1):** No deps coupling. `@eduagent/schemas` deps are minimal and clean (still `zod ^4.1.12` + `tslib ^2.3.0`). TYPES-2's planned schema authoring requires no new deps.
- **MOBILE-2 (C4):** Indirect coupling. Several `react-native-*` deps in Bucket B carry pin-style drift between root (`~`) and mobile (`^`). The MOBILE-2 hex-code sweep doesn't depend on this, but if MOBILE-2 ships first and adds new deps for its remediation (unlikely but possible), the 1a worksheet would need a re-recon. **Recommend:** land 1a before MOBILE-2 if both sit in Track B Phase 0/1, since 1a is mostly mechanical and shrinks the manifest surface MOBILE-2 must reason about.
- **PACKAGE-SCRIPTS-2 (C6):** Adjacent. PACKAGE-SCRIPTS-2's plan to add explicit `eslint.config.*` / `tsconfig.lib.json` / `tsconfig.spec.json` to apps/api will not change deps (eslint/typescript already at root). No coupling.
- **Doppler script wrap (`b6f2b80f`):** Touched root `package.json` scripts only; no dep changes. Confirms baseline-delta's observation that the only in-window manifest commit was non-dep.

## Out of scope / not checked

- **Per-import line counts.** Counts in the worksheet are file counts, not import counts. A file with `import { useState, useEffect, useMemo } from 'react'` (3 named imports) and another file with `import React from 'react'` (1 default) both contribute 1 to the `react: mobile=200` count. Switching to per-line would inflate counts but not change bucket assignments.
- **Dynamic / computed `import('pkg' + suffix)` calls.** The regex matches static quoted package names only. Dynamic imports with concatenated specifiers would not be caught.
- **Sub-path-only imports of scoped packages.** Sub-path imports like `from '@expo/vector-icons/Ionicons'` are caught by the `(/[^"'`]+)?` group, but if the parent package is declared and the actual consumer is a deep sub-path, the count attributes correctly to the parent — no false negatives.
- **`app.json` / Expo plugins / Babel preset chains.** Same blind spot DEP-DRIFT-1 disclosed. `expo-system-ui` orphan-likely status (Bucket E) requires reading `apps/mobile/app.json` plugins block to confirm. Did not perform that read in this deepening — defer to 1f executor.
- **Lockfile body inspection.** Did not parse `pnpm-lock.yaml` content beyond the header. A "lockfile actually satisfies all manifests" check requires `pnpm install --frozen-lockfile`, excluded by the read-only mandate.
- **Patches sanity.** `pnpm.patchedDependencies['react-native-css-interop@0.2.1']` — same caveat as DEP-DRIFT-1: the patch path may need adjustment if the dep moves from root to apps/mobile during 1a. Worth a one-line check by the 1a executor.
- **Peer-dep violations.** Did not enumerate. `pnpm install --strict-peer-dependencies` would surface them but is mutation-class.
- **Deprecated transitive packages.** Did not check.

## Recommended punch-list entries

> **The principal new entry is DEP-DRIFT-2-1a-DECISION as a Phase 0 architectural call.** All other entries are refinements / restatements of DEP-DRIFT-1 1a–1h with revised effort estimates where Finding 2 changes the math.

```markdown
- **AUDIT-DEPENDENCY-DRIFT-2-1a-DECISION** [Phase 0 — DECISION-PENDING-USER] Architectural call: which deps belong at root, which belong in `apps/mobile/`, which need explicit per-workspace declarations
  - Severity: YELLOW-RED (the cluster blocker)
  - Effort:
    - Agent execution: 0 (this is a decision item — no code changes until decision is made)
    - Human decide: 30-60 min, with the worksheet in `2026-05-03-audit-dependency-drift-2-deepening.md` Finding 1 as the input
    - Decision overhead: HIGH — worksheet recommends 30 deletes from root (23 Bucket B + 7 Bucket C); review points are: (a) confirm `hono`, `react-native-web`, `tailwindcss`, `pg`, `@playwright/test` should leave root, (b) pick pin-style convention (`~` per Expo, vs `^` per mobile current), (c) approve `@expo/metro-config: ~54.0.11` etc. as the canonical reconciled versions
  - Files: input is the worksheet; output is the directive that 1a-EXECUTE follows
  - Why it matters: this is the gate — without the directive, 1a-EXECUTE has nothing to do

- **AUDIT-DEPENDENCY-DRIFT-2-1a-EXECUTE** [Phase 1] Apply the 1a-DECISION worksheet directive to the manifests
  - Severity: YELLOW-RED
  - Effort:
    - Agent execution: ~20-30 min (delete 30 entries from root `package.json`, ensure all are present in `apps/mobile/package.json` at the directive-chosen pins, regenerate lockfile, run `pnpm install --frozen-lockfile=false` once, verify Metro/EAS/Expo Go boot)
    - Human review/decide: 1-2 hours (verify dev-server, dev-client build, Playwright web E2E still pass; spot-check that the `react-native-css-interop` patch path still resolves)
    - Decision overhead: LOW (decisions baked into 1a-DECISION)
  - Files: `package.json`, `apps/mobile/package.json`, `pnpm-lock.yaml` (regenerated), `patches/react-native-css-interop@0.2.1.patch` (path verification)
  - Why it matters: shrinks root manifest from 83 → ~53 entries; eliminates 15 drifts; aligns to single source-of-truth per dep

- **AUDIT-DEPENDENCY-DRIFT-2-1b** [Phase 1, can land independently] Declare `@eduagent/test-utils` in `apps/api/package.json#devDependencies` as `workspace:*`
  - Severity: YELLOW-RED (escalated from YELLOW — phantom now spans 28 files including most of the integration-test suite)
  - Effort:
    - Agent execution: ~2 min (add one line, regen lockfile)
    - Human review/decide: ~10 min (PR review only)
    - Decision overhead: LOW
  - Files: `apps/api/package.json`, `pnpm-lock.yaml`
  - Why it matters: phantom is load-bearing for 27 integration tests + 1 unit test + jest config; a scoped install or fresh CI cache would fail all of them

- **AUDIT-DEPENDENCY-DRIFT-2-1c** [Phase 1, can land independently] Declare `@react-navigation/native` in `apps/mobile/package.json#dependencies` at the expo-router-bundled version
  - Severity: YELLOW (unchanged)
  - Effort:
    - Agent execution: ~3 min (read `node_modules/expo-router/package.json` to derive correct pin, add one line, regen lockfile)
    - Human review/decide: ~10 min
    - Decision overhead: LOW
  - Files: `apps/mobile/package.json`, `pnpm-lock.yaml`
  - Why it matters: phantom relies on transitive resolution from `expo-router`; brittle across expo-router majors

- **AUDIT-DEPENDENCY-DRIFT-2-1d** [Phase 1, can land independently] Remove orphan `@neondatabase/serverless` from `apps/api/package.json#dependencies`
  - Severity: YELLOW (unchanged)
  - Effort: agent ~1 min; human ~5 min; decision LOW
  - Files: `apps/api/package.json`, `pnpm-lock.yaml`

- **AUDIT-DEPENDENCY-DRIFT-2-1e** [Phase 1, can land independently] Remove orphan `@clerk/types` from `apps/api/package.json#devDependencies`
  - Severity: GREEN-YELLOW (unchanged)
  - Effort: agent ~1 min; human ~5 min; decision LOW
  - Files: `apps/api/package.json`, `pnpm-lock.yaml`

- **AUDIT-DEPENDENCY-DRIFT-2-1f** [Phase 1, gated on app.json check] Verify and (if confirmed orphan) remove `expo-system-ui` from both root and `apps/mobile/package.json`
  - Severity: GREEN
  - Effort: agent ~5 min (read `apps/mobile/app.json` plugins block); human ~10 min; decision MED
  - Files: `apps/mobile/package.json`, root `package.json`, `pnpm-lock.yaml`
  - Why it matters: the Expo plugin auto-init can mask orphan-looking packages — check `app.json` first

- **AUDIT-DEPENDENCY-DRIFT-2-1g** [Phase 1, can land independently] Consolidate `onlyBuiltDependencies` into `pnpm-workspace.yaml`
  - Severity: GREEN-YELLOW (unchanged)
  - Effort: agent ~3 min (move + dedupe `['@swc/core', 'nx']` ∪ `['esbuild', 'sharp']`); human ~5 min; decision LOW
  - Files: `package.json`, `pnpm-workspace.yaml`

- **AUDIT-DEPENDENCY-DRIFT-2-1h** [Phase 2 — defer-not-cancel, dedicated PR] Schedule a Prettier 3 upgrade
  - Severity: GREEN-YELLOW (unchanged)
  - Effort: agent ~10 min; human 30-60 min (auto-formatted diff); decision LOW
  - Files: `package.json`, `.prettierrc` if present, **and most source files**
  - Why it matters: defer; keep the noisy diff alone for clean blame
```

## Audit honesty disclosures

- **Import counts are file counts, not occurrence counts.** Per-file counts are sufficient for bucket assignments — moving the threshold from "1 file imports it" to "5 files import it" wouldn't change a single Bucket B → Bucket A reassignment given the workspace-monoculture pattern (all mobile-imported deps have 0 api imports, and vice versa). Where the count is `0 anywhere` it triggers Bucket E; where it's `≥1 in mobile, 0 in api` it triggers Bucket B; etc.
- **Tooling deps with 0 src imports are correctly classified as root tooling, not orphans.** Eslint plugins, nx executors, swc helpers, etc., are consumed by config files (`eslint.config.mjs`, `tsconfig.json`, `nx.json`) or by binary invocation (`pnpm exec eslint`), not by `import` statements in `src/`. The worksheet does NOT re-flag these as orphans. Only the explicit Bucket E entries (5) are credible orphan candidates.
- **One-file-only consumers in mobile (e.g. `metro-config`: mobile=1)** indicate config-file consumers, not low usage. The 1 hit is `apps/mobile/metro.config.js` — that's the only place such a dep would be imported.
- **`@cloudflare/workers-types` IDE type acquisition.** The dep is declared in BOTH `apps/api/package.json#devDependencies` and root `package.json#devDependencies`. The worksheet shows api: 0 src imports (ambient). Both copies are reasonable: api needs it for `tsc --noEmit`; root copy may be vestigial but cheap. Tagged as Bucket A (KEEP) without trying to consolidate.
- **PR #144 manifest-touch check is a point-in-time read.** PR is OPEN. If new commits add deps before merge, Finding 7 becomes stale. Recommend re-running the gh-cli check at 1a-PR-creation time.
- **Did NOT run any `pnpm` command.** Same constraint as DEP-DRIFT-1. All inferences are from manifest reads + git ls-files + grep.
- **Bucket B includes `react-native-screens`** despite 0 mobile-src imports. This is correct — the package is required as a peer of `expo-router` / `react-navigation/native` and is consumed transitively. It must be declared (it is, in mobile) but won't appear in import grep. **Do NOT misread the 0 as orphan-status.**
- **Time spent:** ~50 min recon (most spent debugging the cross-platform Node import-counter script through Windows path / heredoc-escaping issues, then refactoring it to load file contents into memory and run regex tests in pure JS); ~25 min writing.
