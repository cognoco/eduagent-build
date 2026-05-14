# AUDIT-DEPENDENCY-DRIFT-1 — monorepo dependency hygiene

**Date:** 2026-05-02
**Auditor:** audit-dependency-drift-1 (fork)
**Scope:** Read-only recon of dependency hygiene across the 7 workspace `package.json` files: lockfile freshness, phantom deps, orphan deps, version drift between siblings, peer-dep mismatches, deprecated packages, pinning consistency, `engines` consistency.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion punch list:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md`

---

## TL;DR

The dominant finding is structural: the **root `package.json` is a junk drawer** holding 24 packages also declared in `apps/mobile/package.json`, of which **14 are version-drifted** (root is consistently behind apps/mobile on Expo SDK 54 patch versions, and the two disagree on pin style — root prefers `~`, mobile prefers `^`). Two real **phantom dependencies** were confirmed: `@eduagent/test-utils` in `apps/api` and `@react-navigation/native` in `apps/mobile`, both of which work locally via pnpm hoisting but will break a fresh isolated install. Lockfile is fresh relative to the latest committed `package.json`. No deprecated production packages found at primary-dependency level. Severity **YELLOW-RED** — does not block SCHEMA-2 but represents the largest single artefact-consistency violation in the audit batch.

## Severity

**YELLOW-RED** — Root↔mobile duplication produces measurable drift across 14 packages including production-critical ones (`expo` `~54.0.0` vs `~54.0.29`, `expo-splash-screen` `~31.0.11` vs `~31.0.12`, `react-native-svg` `15.12.1` vs `^15.12.1`, `metro-config` `~0.83.0` vs `^0.83.3`). Per CLAUDE.md no rule explicitly forbids this, but the same "team fixed locally without sweeping backward" meta-pattern surfaced in the four prior audits applies here at a structural level: the root deps were the original Nx scaffold and apps/mobile evolved past them.

## Methodology

- `git ls-files | grep package.json` to enumerate the 7 workspace `package.json` files (root + apps/api + apps/mobile + 4 packages); confirmed scope via `pnpm-workspace.yaml`.
- `Read` each `package.json` block: `dependencies`, `devDependencies`, `peerDependencies`, `engines`, `pnpm.overrides`.
- For lockfile freshness: `git log -1 --format="%ci" -- pnpm-lock.yaml` vs newest committed `package.json`. Lockfile commit `8672bdcd` (14:57:48) is **after** the last package-changing commit `8c45098b` (14:15:15, script-rename only).
- For phantom-dep detection: `grep -rE "^\s*import\s+.*\bfrom\s+['\"]([^'\".]+|@[^'\"/]+/[^'\"]+)['\"]"` across `apps/api/src`, `apps/mobile/src`, `packages/*/src`; built unique top-level package set per workspace; cross-referenced against declared deps union.
- For version drift: built `{package: {workspace: version}}` map across all workspace `package.json` files via inline Node script; flagged any package with >1 distinct version range.
- For orphan candidates: spot-checked 10 declared-but-suspect packages with targeted `grep -rE "<pkg>"` to count source references.
- Did NOT run `pnpm install`, `pnpm outdated`, or any tool that would mutate the lockfile or node_modules.

## Findings

### Finding 1 — Root `package.json` duplicates 24 mobile-shared deps; 14 have drift

- **Severity:** YELLOW-RED
- **Files:** `package.json` (root, lines 39-60 dependencies, 61-125 devDependencies); `apps/mobile/package.json` (full)
- **Evidence:** Inline Node script comparing root deps∪devDeps to mobile deps∪devDeps yielded:
  - 24 packages declared in BOTH (vs. expected ~0 — workspace deps should live in the consumer workspace, not at root).
  - 14 of those 24 carry version drift. Concrete drift instances:

  | Package | Root | Mobile | Note |
  |---|---|---|---|
  | `expo` | `~54.0.0` | `~54.0.29` | 29 patch versions behind at root |
  | `@expo/metro-config` | `~54.0.9` | `~54.0.11` | dep at root, devDep at mobile |
  | `expo-splash-screen` | `~31.0.11` | `~31.0.12` | |
  | `expo-status-bar` | `~3.0.8` | `~3.0.9` | |
  | `expo-system-ui` | `~6.0.8` | `~6.0.9` | |
  | `react-native-gesture-handler` | `~2.28.0` | `^2.28.0` | pin-style drift |
  | `react-native-reanimated` | `~4.1.6` | `^4.1.6` | pin-style drift |
  | `react-native-safe-area-context` | `~5.6.2` | `^5.6.2` | pin-style drift |
  | `react-native-screens` | `~4.16.0` | `^4.16.0` | pin-style drift |
  | `react-native-svg` | `15.12.1` | `^15.12.1` | pin-style drift |
  | `react-native-svg-transformer` | `~1.5.1` | `^1.5.2` | both |
  | `@testing-library/react-native` | `~13.2.0` | `^13.2.2` | both |
  | `jest-expo` | `~54.0.13` | `~54.0.16` | both |
  | `metro-config`, `metro-resolver` | `~0.83.0` | `^0.83.3` | both |

  The 10 non-drifted duplicates (e.g. `react`, `react-native`, `expo-font`, `expo-router`, `expo-linking`, `nativewind`, `hono`, `react-native-web`, `react-dom`) still represent unnecessary duplication. The pin-style split is systematic: root uses `~` (expo-recommended for SDK alignment), mobile uses `^` (allows minor bumps that could break SDK alignment).

- **Why it matters:** This is the structural mirror of the meta-pattern surfaced by every prior audit ("local fix without backward sweep"). The expo-* packages on the mobile-build path are SDK-coupled — a `^` pin can resolve to a minor version that breaks SDK alignment, which is why Expo officially recommends `~`. Mobile uses `^` for half its expo deps, creating a latent build-break risk on `pnpm install` after a registry update. The 29-patch gap on `expo` itself is not a runtime problem (the lockfile pins the resolved version) but is misleading to future contributors reading the manifest.
- **Anticipated effort (agent / human):** see "Recommended punch-list entries"
- **Suggested track:** B

### Finding 2 — Phantom dep: `@eduagent/test-utils` in `apps/api`

- **Severity:** YELLOW
- **Files:** `apps/api/src/test-utils/database-module.ts:1` imports from `@eduagent/test-utils`; `apps/api/package.json` does NOT declare `@eduagent/test-utils` in dependencies or devDependencies.
- **Evidence:** `grep -rE "@eduagent/test-utils" apps/api/src` → 1 hit (`database-module.ts`). `apps/api/package.json` deps: `@eduagent/database`, `@eduagent/retention`, `@eduagent/schemas` only. Resolution succeeds locally because `packages/database/package.json` declares `@eduagent/test-utils: workspace:*` in its devDependencies and pnpm hoists it.
- **Why it matters:** A CI build that scopes installs (`pnpm install --filter @eduagent/api`) or any future build pipeline that prunes node_modules will fail to resolve this import. Per the deps-pinning section of CLAUDE.md "Repo-Specific Guardrails" — package imports go through the package barrel — the package isn't barrel-imported, it's just undeclared.
- **Anticipated effort (agent / human):** see "Recommended punch-list entries"
- **Suggested track:** B

### Finding 3 — Phantom dep: `@react-navigation/native` in `apps/mobile`

- **Severity:** YELLOW
- **Files:** `apps/mobile/src/components/session/ChatShell.tsx`, `apps/mobile/src/components/session/ChatShell.test.tsx` import from `@react-navigation/native`; `apps/mobile/package.json` does not declare it.
- **Evidence:** `grep -rE "@react-navigation/native" apps/mobile/src` → 2 hits. The package is satisfied as a transitive peer of `expo-router` (which itself depends on `@react-navigation/*` internally), so it resolves at install time.
- **Why it matters:** The implicit assumption that `expo-router` will always re-export `@react-navigation/native` is fragile — a future expo-router major could swap to a different navigation primitive, and the direct import would suddenly become unresolvable. Same CI/fresh-install class of failure as Finding 2.
- **Anticipated effort (agent / human):** see "Recommended punch-list entries"
- **Suggested track:** B

### Finding 4 — Orphan dep: `@neondatabase/serverless` in `apps/api`

- **Severity:** YELLOW (cleanup)
- **Files:** `apps/api/package.json:18` declares `@neondatabase/serverless: ^0.10.4`; `grep -rE "@neondatabase/serverless" apps/api/src` → 0 hits.
- **Evidence:** Used only inside `packages/database/src` (where it is correctly declared). The api-level declaration appears vestigial — likely from before the database package was extracted. Removing it from `apps/api/package.json` produces no behavior change because the package still resolves transitively via `@eduagent/database`.
- **Why it matters:** Orphan deps inflate the surface that `pnpm audit` and dependabot must scan, and they create a false signal that the api workspace touches the Neon driver directly (it doesn't). Low-stakes cleanup but worth doing.
- **Anticipated effort (agent / human):** see "Recommended punch-list entries"
- **Suggested track:** C

### Finding 5 — Orphan devDep: `@clerk/types` in `apps/api`

- **Severity:** GREEN-leaning-YELLOW
- **Files:** `apps/api/package.json:28` declares `@clerk/types: ^4.40.0`; `grep -rE "from ['\"]@clerk/types['\"]" apps/api/src` → 0 hits.
- **Evidence:** Likely vestigial — used at one point for typing JWT claims, but the current code may use Clerk types via `import type` from `@clerk/clerk-expo` (mobile) or never directly. devDep so impact is negligible.
- **Why it matters:** Tiny surface bloat. Worth removing in any janitor PR.
- **Anticipated effort (agent / human):** see "Recommended punch-list entries"
- **Suggested track:** C

### Finding 6 — `expo-system-ui` declared in `apps/mobile` but never imported

- **Severity:** GREEN
- **Files:** `apps/mobile/package.json:43` declares `expo-system-ui: ~6.0.9`; `grep -rE "expo-system-ui"` → 0 source references (only the package.json self-mention).
- **Evidence:** Some Expo packages auto-init via Expo's plugin system without an explicit `import` (`expo-build-properties`, `expo-dev-client`, `expo-updates` are examples), but `expo-system-ui` typically requires an explicit `setBackgroundColorAsync` call. If it's truly unused, it's orphan; if it's required for an Expo plugin entry in `app.json`, it's not. **Needs deeper recon** — check `app.json` / `app.config.{js,ts}` plugin list.
- **Why it matters:** Same orphan-bloat concern as Finding 4/5.
- **Anticipated effort (agent / human):** see "Recommended punch-list entries"
- **Suggested track:** C (after `app.json` verification)

### Finding 7 — `onlyBuiltDependencies` declared in two places with different values

- **Severity:** GREEN-leaning-YELLOW (cosmetic)
- **Files:** `pnpm-workspace.yaml` lines 5-7: `onlyBuiltDependencies: ['@swc/core', 'nx']`; `package.json:127-131`: `pnpm.onlyBuiltDependencies: ['esbuild', 'sharp']`.
- **Evidence:** Two different lists in two configuration sources. pnpm merges these, but the split is confusing — a future contributor adding a new build-allow entry will not know which file is canonical. Per pnpm docs, `pnpm-workspace.yaml` is the recommended location for monorepos.
- **Why it matters:** No runtime impact, but exactly the "drift between declared sources of truth" pattern this audit was meant to catch. Low effort to consolidate.
- **Anticipated effort (agent / human):** see "Recommended punch-list entries"
- **Suggested track:** C

### Finding 8 — Prettier one major version behind

- **Severity:** GREEN-leaning-YELLOW
- **Files:** `package.json:114` declares `prettier: ^2.6.2`; current Prettier is 3.x.
- **Evidence:** Prettier 3 introduced default `trailingComma: "all"` and a few formatting changes; upgrade is non-trivial because it produces a one-shot diff across the entire codebase. Not deprecated, just behind.
- **Why it matters:** Dev-tooling freshness. Not blocking anything, but the team should know that any future Prettier 3 upgrade will be a noisy one-shot diff that should land on its own dedicated PR.
- **Anticipated effort (agent / human):** see "Recommended punch-list entries"
- **Suggested track:** C

## Cross-coupling notes

- **TYPES-1:** `packages/schemas/package.json` deps are minimal and clean (only `zod ^4.1.12` and `tslib ^2.3.0`). `zod` is aligned with `apps/api` (also `^4.1.12`). The two typed-error classes TYPES-1 found stranded in `apps/mobile/src/lib/api-errors.ts` (`QuotaExceededError`, `ResourceGoneError`) have no dep-side coupling — moving them into `@eduagent/schemas` requires no new mobile deps. **TYPES-1 is NOT gated by deps drift.**
- **TESTS-1:** Finding 2 (`@eduagent/test-utils` phantom in apps/api) is the dep-side mirror of TESTS-1's observation that two shared setup files globally mock `@eduagent/database`. The test-utils package is the legitimate test infrastructure entrypoint; getting it properly declared at apps/api makes TESTS-1's recommendations easier to land cleanly.
- **MOBILE-1:** The Expo SDK patch-version drift (Finding 1) is the dep-side equivalent of MOBILE-1's "local fix without backward sweep" findings (`unstable_settings` gaps). Same meta-pattern: the team kept apps/mobile current but did not sweep root. MOBILE-1's color and persona findings are independent.
- **PACKAGE-SCRIPTS-1:** PACKAGE-SCRIPTS-1 noted apps/api lacks a local eslint config — confirmed here at the deps level: `apps/api/package.json` declares zero eslint packages. eslint/prettier/typescript are intentionally shared at root, which is reasonable; the pattern that's NOT reasonable is mobile-runtime deps shared at root (Finding 1). **The boundary between "legitimately shared root tooling" and "junk drawer mobile deps" is the real meta-finding** — both audits saw a piece of it.

## Out of scope / not checked

- **Transitive lockfile / peer-dep tree analysis.** A full `pnpm list --depth=Infinity` would surface unsatisfied peer-dep claims (e.g. React 18 vs 19 splits in deep transitives), but I deliberately did not run any `pnpm` command that could mutate the lockfile cache or node_modules. Needs deeper recon if peer-dep concerns become acute.
- **Programmatic `pnpm outdated --format json`.** Same concern — could mutate. Manual sample-check showed Prettier behind major and no other obvious staleness, but a comprehensive sweep is deferred.
- **Security advisory check.** Would require `pnpm audit` (network call + cache mutation) or a manual npm-registry walk for each of ~80 direct deps. Out of scope for this audit; suggest a separate `AUDIT-SECURITY-1` pass that explicitly accepts the network/cache cost.
- **npm-registry deprecation flags on transitive deps.** Top-level deps appear current (no obvious `request`/`node-fetch`/`csurf` smell); transitive deprecation needs `pnpm audit` or similar.
- **Lockfile internal consistency.** Did not parse `pnpm-lock.yaml` to check for orphaned entries or duplicate package versions inside the lockfile itself.
- **Patches sanity.** `pnpm.patchedDependencies['react-native-css-interop@0.2.1']` — did not verify the patch file still applies cleanly against the locked version. Worth a one-line check in any future deps-touching PR.

## Recommended punch-list entries

> Format ready to paste into the **Track B** or **Track C** section of `2026-05-02-artefact-consistency-punchlist.md`. Two-line effort format used per parent's instruction (deviation from the four prior audits that gave a single human-baseline estimate).

```markdown
- **AUDIT-DEPENDENCY-DRIFT-1a** Move mobile-runtime deps from root `package.json` to `apps/mobile/package.json` and reconcile drift
  - Severity: YELLOW-RED
  - Effort:
    - Agent execution: ~10-15 min (delete ~24 entries from root, ensure all are present in apps/mobile, regenerate lockfile)
    - Human review/decide: 1-2 hours (architecturally significant: must verify Metro bundler, EAS Build, Expo Go all still work; decide whether to keep `react`, `react-native`, `react-dom` at root for parallel-install support or move them too)
    - Decision overhead: HIGH — boundary call between "shared root tooling" (eslint, prettier, typescript: keep) and "mobile-only runtime" (expo-*, react-native-*: move) is fuzzy
  - Files: `package.json` (deps + devDeps blocks), `apps/mobile/package.json` (sync target versions), `pnpm-lock.yaml` (regen)
  - Why it matters: 14-package version drift today is silent; a registry update could turn it loud. Same root cause as the meta-pattern this audit batch keeps surfacing.

- **AUDIT-DEPENDENCY-DRIFT-1b** Declare `@eduagent/test-utils` in `apps/api/package.json` devDependencies
  - Severity: YELLOW
  - Effort:
    - Agent execution: ~1-2 min (add one line, regen lockfile)
    - Human review/decide: ~10 min (PR review only)
    - Decision overhead: LOW
  - Files: `apps/api/package.json`, `pnpm-lock.yaml`
  - Why it matters: phantom dep — works locally via hoisting, breaks on isolated CI install or fresh build.

- **AUDIT-DEPENDENCY-DRIFT-1c** Declare `@react-navigation/native` in `apps/mobile/package.json` dependencies
  - Severity: YELLOW
  - Effort:
    - Agent execution: ~1-2 min (add one line at expo-router-aligned version, regen lockfile)
    - Human review/decide: ~15 min (verify version pin matches what expo-router currently bundles)
    - Decision overhead: LOW
  - Files: `apps/mobile/package.json`, `pnpm-lock.yaml`
  - Why it matters: phantom dep relying on transitive resolution from `expo-router` peer deps; brittle across expo-router majors.

- **AUDIT-DEPENDENCY-DRIFT-1d** Remove orphan `@neondatabase/serverless` from `apps/api/package.json`
  - Severity: YELLOW (cleanup)
  - Effort:
    - Agent execution: ~1 min (delete one line, regen lockfile)
    - Human review/decide: ~5 min
    - Decision overhead: LOW
  - Files: `apps/api/package.json`, `pnpm-lock.yaml`
  - Why it matters: orphan dep — used only inside `packages/database`; vestigial from pre-extraction state.

- **AUDIT-DEPENDENCY-DRIFT-1e** Remove orphan `@clerk/types` devDep from `apps/api/package.json`
  - Severity: GREEN-YELLOW (cleanup)
  - Effort:
    - Agent execution: ~1 min
    - Human review/decide: ~5 min (sanity-grep `import type.*@clerk/types` once more before deletion)
    - Decision overhead: LOW
  - Files: `apps/api/package.json`, `pnpm-lock.yaml`
  - Why it matters: tiny surface bloat; bundle once with 1d.

- **AUDIT-DEPENDENCY-DRIFT-1f** Verify and (if confirmed orphan) remove `expo-system-ui` from `apps/mobile/package.json`
  - Severity: GREEN
  - Effort:
    - Agent execution: ~3 min (read app.json/app.config for plugin block, decide, edit if orphan)
    - Human review/decide: ~10 min (verify nav-bar styling still works on Android)
    - Decision overhead: MED — Expo plugin auto-init can mask "orphan-looking" packages
  - Files: `apps/mobile/package.json`, `apps/mobile/app.json` or `app.config.*`
  - Why it matters: low-stakes; only do if confirmed not used by an Expo plugin.

- **AUDIT-DEPENDENCY-DRIFT-1g** Consolidate `onlyBuiltDependencies` into a single source (recommend `pnpm-workspace.yaml`)
  - Severity: GREEN-YELLOW (cosmetic)
  - Effort:
    - Agent execution: ~2 min (move list from root `package.json#pnpm.onlyBuiltDependencies` into `pnpm-workspace.yaml`, dedupe)
    - Human review/decide: ~5 min
    - Decision overhead: LOW
  - Files: `package.json`, `pnpm-workspace.yaml`
  - Why it matters: removes ambiguity about canonical config location; minor but exactly the drift pattern this audit batch is targeting.

- **AUDIT-DEPENDENCY-DRIFT-1h** Schedule a Prettier 3 upgrade on a dedicated PR (do NOT bundle)
  - Severity: GREEN-YELLOW (dev tooling freshness)
  - Effort:
    - Agent execution: ~10 min (bump version, run `pnpm exec prettier --write` across repo, ensure config compatibility)
    - Human review/decide: 30-60 min (large auto-formatted diff to skim; mostly mechanical)
    - Decision overhead: LOW (formatting only)
  - Files: `package.json`, `.prettierrc` if present, **and most source files** (auto-formatted)
  - Why it matters: defer-not-cancel; landed alone keeps git blame clean. Not coupled to anything else.
```

## Audit honesty disclosures

- **Phantom-dep detection used regex import grep.** This catches static `import x from 'pkg'` and `import type` statements but does NOT catch dynamic `require('pkg')`, `import('pkg')` with computed strings, `jest.mock('pkg')` calls, package mentions in `app.json`/`app.config.*`/Expo plugin lists, or runtime metadata. Sample-based — not a guaranteed full sweep. Confidence is high for static-imported packages; unknown for dynamic.
- **Orphan-dep detection has the inverse blind spot** — declared packages might be referenced via `app.json` plugin entries (Expo), Babel preset chains, or Metro config without an `import`. I spot-checked Finding 6 (`expo-system-ui`) and explicitly flagged it as needing `app.json` verification before action. Findings 4 and 5 were verified by absence-of-usage in source `import`s only; apps/api has no Expo plugin context to worry about.
- **Lockfile freshness check is git-history-based, not content-based.** I confirmed lockfile commit is after the last `package.json` content commit, but I did not run `pnpm install --frozen-lockfile` to verify the lockfile actually satisfies all current deps. That would be the gold standard but requires a mutation-class command.
- **Did NOT run any `pnpm` command.** `pnpm outdated`, `pnpm audit`, `pnpm list`, and `pnpm install` were all explicitly excluded per directive (read-only mandate). All findings are inferred from `package.json` parsing + import grep.
- **Effort estimates use the new two-line format** (agent execution / human review-decide) per parent's instruction. The four prior audits in this batch used a single human-baseline estimate; expect their numbers to be 5-10× the agent-execution component for mechanical fixes. Where the cluster has decision overhead (1a in particular), the human time genuinely dominates — that's not padding, it's the architecture-call cost.
