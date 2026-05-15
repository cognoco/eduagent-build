# AUDIT-PACKAGE-SCRIPTS-1 — `package.json` script audit across the monorepo

**Date:** 2026-05-02
**Auditor:** audit-package-scripts-1 (worker fork)
**Scope:** Read-only audit of `package.json` scripts across root + `apps/api` + `apps/mobile` + `packages/*` for orphans, duplicates, naming inconsistency, and drift from the CLAUDE.md "Handy Commands" block.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion punch list:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md`

---

## TL;DR

The monorepo has 8 `package.json` files in scope (1 root + 2 apps + 4 packages + 1 nx-cache artefact ignored). Every script that explicitly references a file or binary resolves to something that exists on disk; there are no hard orphans. The real findings are softer: a leftover from PR #131's `db:*:stg → db:*:dev` rename (`db:generate` never got the `:dev` suffix its three siblings have), `apps/api` has no eslint config or `tsconfig.lib.json` despite CLAUDE.md promising `nx run api:lint`/`api:typecheck`, and a parallel maestro-PATH issue exists in `nx.json` that the root `pretest:e2e` barricade does not cover. Severity: YELLOW. None of this blocks SCHEMA-2 — but it confirms the punch list's "PR #131 found one drift instance, evidence this class has more" signal.

## Severity

**YELLOW** — multiple consistent-but-soft drifts in script naming and target resolution; one CLAUDE.md "Handy Commands" command (`pnpm exec nx run api:lint`) resolves only via plugin inference because `apps/api` has no eslint config, which is the opposite of every other project in the workspace.

## Methodology

- Inventoried workspace `package.json` files via `find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/.claude/worktrees/*" -not -path "*/.git/*"` → 8 files (excluding `.nx/cache/cloud/2605.01.1/package.json` which is a tooling artefact).
- Read every `"scripts"` block: root, `apps/api`, `apps/mobile`, `packages/{database,schemas,retention,test-utils}`.
- Read `CLAUDE.md` lines 145–178 (the "Handy Commands" block) and verified each `pnpm`/`pnpm exec`/`pnpm run` invocation resolves to either an `nx`-inferred target or a real script entry.
- Read `nx.json` to understand inferred-target plugins (`@nx/js/typescript`, `@nx/eslint/plugin`, `@nx/jest/plugin`, `@nx/expo/plugin`) and `targetDefaults` (e2e, format:check).
- Verified file existence for every script that points to a path: `scripts/setup-env.js`, `scripts/sync-secrets.js`, `scripts/verify-no-secret-postinstall.cjs`, `apps/api/eval-llm/index.ts`, `tests/integration/jest.config.cjs`, `apps/mobile/playwright.config.ts`, `tools/scripts/eas-build-post-install.mjs`, `apps/api/jest.config.cjs`, `apps/mobile/jest.config.cjs`. All exist.
- Checked for the existence of eslint configs, jest configs, and tsconfig variants per project.
- Verified `nx` plugin packages installed: `@nx/eslint`, `@nx/jest`, `@nx/expo`, `@nx/js`, `@naxodev` — all present.

## Findings

### Finding 1 — `db:generate` is the lone `db:*` script without a `:dev` suffix

- **Severity:** YELLOW
- **Files:** `package.json:21`
- **Evidence:** Root scripts: `db:push:dev` (line 20), `db:generate` (line 21, **no suffix**), `db:migrate:dev` (line 22), `db:studio:dev` (line 23). All four use `dotenv -e .env.development.local`, so all four are dev-targeted. The CLAUDE.md "Handy Commands" block at line 165 propagates the inconsistency: `pnpm run db:generate` (no suffix) sits next to `pnpm run db:push:dev` and `pnpm run db:migrate:dev`. PR #131 renamed `db:*:stg → db:*:dev` to fix this exact class of drift — `db:generate` was missed.
- **Why it matters:** Naming inconsistency invites confusion ("does `db:generate` write to dev or some other env?"). Future contributors reading CLAUDE.md will see three `:dev` scripts and one bare and wonder which is correct. Touches CLAUDE.md "Schema And Deploy Safety" rule's spirit of explicit env separation.
- **Anticipated effort:** ~5 min (rename in `package.json`, update CLAUDE.md line 165, grep for callers)
- **Suggested track:** B — pairs naturally with `AUDIT-GOVERNING-1d` (the "CLAUDE.md `db:*` Handy Commands sweep" already on the punch list).

### Finding 2 — `apps/api/` has no eslint config; `nx run api:lint` resolves only via root-config inheritance

- **Severity:** YELLOW
- **Files:** `apps/api/` (no `eslint.config.*` or `.eslintrc.*`); root `eslint.config.mjs` (present); `apps/api/project.json:7-37` (no `lint`/`test`/`typecheck` targets defined).
- **Evidence:** `apps/mobile/eslint.config.mjs` and `packages/database/eslint.config.mjs` exist; `ls apps/api/eslint.config*` and `ls apps/api/.eslintrc*` both return "No such file or directory". CLAUDE.md "Handy Commands" line 154 promises `pnpm exec nx run api:lint`. The command works today only because `@nx/eslint/plugin` (configured in `nx.json:33-38`) infers a `lint` target by walking up to the root `eslint.config.mjs`. No explicit project.json target exists either: `apps/api/project.json` defines only `serve`, `build`, `deploy`, `test:integration`.
- **Why it matters:** The project's lint coverage is invisible from `apps/api/project.json` and depends entirely on plugin inference + root config presence. If root `eslint.config.mjs` ever moves or the plugin configuration changes, `api:lint` silently becomes a no-op. Same risk applies to `api:test` and `api:typecheck` — both promised by CLAUDE.md, neither defined explicitly. Other workspace members all have local eslint configs; api is the outlier.
- **Anticipated effort:** ~30 min (decide: add explicit `apps/api/eslint.config.mjs` extending root, OR add explicit `lint`/`test`/`typecheck` targets to `apps/api/project.json`)
- **Suggested track:** B

### Finding 3 — `apps/api/` is missing `tsconfig.lib.json` and `tsconfig.spec.json`

- **Severity:** YELLOW
- **Files:** `apps/api/tsconfig.json` (refs only `./tsconfig.app.json`); no `tsconfig.lib.json`; no `tsconfig.spec.json`.
- **Evidence:** Every `packages/*` has `tsconfig.lib.json` and `tsconfig.spec.json`. `apps/mobile` has `tsconfig.spec.json`. `apps/api/tsconfig.json` only references `tsconfig.app.json`. Meanwhile `nx.json:25-29` configures `@nx/js/typescript` plugin's `build` inference with `"configName": "tsconfig.lib.json"`. The plugin's `typecheck` inference doesn't pin a `configName`, so behavior is "use whatever tsconfig has composite: true". `apps/api/jest.config.cjs` exists, but no companion `tsconfig.spec.json`.
- **Why it matters:** Inferred `nx run api:build` has no canonical input (because `tsconfig.lib.json` doesn't exist); behavior depends on plugin defaults that can shift across nx upgrades. Inferred `nx run api:typecheck` works today but is undocumented. Test type-checking falls back to whatever tsconfig jest's transformer picks — usually `tsconfig.app.json`, which can include test files unintentionally. CLAUDE.md "On Compaction" / "Required Validation" both reference `pnpm exec nx run api:typecheck` as the contract; the contract has no explicit config file behind it.
- **Anticipated effort:** ~30 min (add `tsconfig.lib.json` and `tsconfig.spec.json` mirroring the `packages/*` shape; verify `nx graph` and a fresh `nx run api:typecheck` are unchanged)
- **Suggested track:** C

### Finding 4 — `test:e2e`, `test:e2e:smoke`, `test:e2e:record` are deliberately broken; sibling pretest hooks barricade them

- **Severity:** GREEN (intentional pattern, but awkward)
- **Files:** `package.json:25-32`
- **Evidence:** Three pretest hooks all execute `node -e "console.error('\\n❌ pnpm test:e2e[:smoke|:record] is broken: bare maestro resolves via PATH to a Unicode-broken install.\\nUse C:/Tools/maestro/bin/maestro.bat directly. See docs/E2Edocs/e2e-runbook.md\\n'); process.exit(1)"`. The downstream scripts (`test:e2e`, `test:e2e:smoke`, `test:e2e:record`) still call `maestro test apps/mobile/e2e/flows/[ --include-tags=smoke | record ]`. The pre-hook always fires and always exits 1, so the actual scripts never run.
- **Why it matters:** This works as intended (humane error message instead of a Unicode crash). But the pattern is unusual: three scripts are guaranteed-broken by their own sibling pre-hooks. A reader skimming `package.json` first sees `"test:e2e": "maestro test …"` and reasonably believes that command is the supported path. Cleaner: remove the broken scripts entirely and have only the pretest barricade announce the alternative — or rename to `test:e2e:DO_NOT_USE`. Note that `C:/Tools/maestro/bin/maestro.bat` does NOT exist on this machine, so the suggested alternative doesn't help me verify either path.
- **Anticipated effort:** ~15 min
- **Suggested track:** C (cosmetic; couples with Finding 5 and any future E2E reliability work)

### Finding 5 — `nx.json` `targetDefaults.e2e.command` has the same maestro-PATH issue with no barricade

- **Severity:** YELLOW
- **Files:** `nx.json:71-87`
- **Evidence:** `targetDefaults.e2e.options.command` is `"maestro test e2e/flows/"` (line 80). The `smoke` configuration is `"maestro test e2e/flows/ --include-tags=smoke"` (line 85). Both invoke bare `maestro` — the exact same PATH-resolution issue the root `pretest:e2e` hooks warn about. But `nx run mobile:e2e` does NOT go through the root pnpm script and therefore does NOT hit the friendly pretest barricade; it would fail with whatever Unicode error the broken maestro install produces.
- **Why it matters:** Inconsistent guardrails. CLAUDE.md "Required Validation" treats `nx` and `pnpm` as equivalent invocation surfaces; here they diverge in how loudly they fail. Either both surfaces should be barricaded or both should be fixed. The barricade was added for pnpm path, the nx path was overlooked — exactly the "team detects new drift, doesn't sweep backward" pattern this audit was meant to catch (see punch list line 112).
- **Anticipated effort:** ~15 min (decide: remove `targetDefaults.e2e` block, OR replace bare `maestro` with the project-specific binary path, OR add a wrapper script that prints the same friendly error)
- **Suggested track:** B

### Finding 6 — Root `db:*:dev` scripts use unusual `tsx node_modules/drizzle-kit/bin.cjs` indirection

- **Severity:** GREEN (works, undocumented)
- **Files:** `package.json:20-23`
- **Evidence:** All four root db scripts have shape `dotenv -e .env.development.local -- pnpm --filter @eduagent/database exec tsx node_modules/drizzle-kit/bin.cjs <op>`. The simpler form would be `pnpm --filter @eduagent/database exec drizzle-kit <op>` (matching what `packages/database/package.json:9-12` actually does). The `tsx` wrapping and direct `bin.cjs` reference suggest a workaround for something — possibly Windows path resolution, possibly an `--esm` quirk in drizzle-kit.
- **Why it matters:** Undocumented workaround. If the underlying issue gets resolved upstream, the indirection silently becomes dead weight. A short `# Why tsx? See <issue/commit>` comment in the script (or a one-line justification in CLAUDE.md "Schema And Deploy Safety") would make this a maintainable choice rather than mystery code. Not a bug today.
- **Anticipated effort:** ~30 min (investigate origin via `git log -p package.json` for the original commit; document or simplify)
- **Suggested track:** C

### Finding 7 — CLAUDE.md hardcodes `C:/Tools/doppler/doppler.exe` and `C:/Tools/maestro/bin/maestro.bat`

- **Severity:** YELLOW (doc drift, environment-specific)
- **Files:** `CLAUDE.md:175-176` (doppler path), `CLAUDE.md:25-31` referenced indirectly (maestro path appears in pretest hook strings inside `package.json:25-31`)
- **Evidence:** Two CLAUDE.md "Handy Commands" use `C:/Tools/doppler/doppler.exe` (Windows-only, machine-specific path). The same pattern appears for `C:/Tools/maestro/bin/maestro.bat` inside `package.json:25-31` pretest hooks. Neither path will resolve on a non-Windows or differently-installed Windows machine. `C:/Tools/maestro/bin/maestro.bat` does not exist on the audit machine.
- **Why it matters:** Onboarding friction for any other contributor. CLAUDE.md is checked into the repo; it's the canonical onboarding document. Hardcoded paths suggest "one developer's machine" rather than "the project's contract". Either standardize the install location across contributors, or document a wrapper / standard install path.
- **Anticipated effort:** ~10 min for the doppler line; the maestro pretest hook is more entangled with Finding 4.
- **Suggested track:** C — couples with `AUDIT-GOVERNING-1d` (the existing CLAUDE.md sweep on the punch list).

### Finding 8 — `apps/mobile/` has no `project.json`; nx project name resolution depends on plugin inference

- **Severity:** GREEN (works as configured; documentation-only concern)
- **Files:** `apps/mobile/package.json:1-71` (no sibling `project.json`)
- **Evidence:** Every other workspace member (`apps/api`, `packages/{database,schemas,retention,test-utils}`) has a `project.json`. `apps/mobile` does not. CLAUDE.md "Handy Commands" line 159 says `pnpm exec nx lint mobile` — using bare project name `mobile`, which resolves via `@nx/expo/plugin` inference combined with directory basename.
- **Why it matters:** Not actionable today — `@nx/expo/plugin` officially supports this pattern. But it means the canonical project name is undocumented (is it `mobile`, `@eduagent/mobile`, or both as aliases?). A short note in CLAUDE.md would prevent future "I tried `nx lint @eduagent/mobile` and it didn't work" confusion.
- **Anticipated effort:** 0 (acknowledge in CLAUDE.md only)
- **Suggested track:** not-actionable

## Cross-coupling notes

- **TYPES-1**: No schema-generation scripts orphaned. `packages/schemas/package.json` has zero scripts; `packages/database/package.json` has the four `db:*` scripts that drive drizzle-kit. The schemas package builds via nx-inferred `build` target (from `tsconfig.lib.json`, which exists). If TYPES-1 finds the schema package needs a generator script, this audit found no existing generator-shaped script to extend or replace.
- **TESTS-1**: Multiple test scripts exist with potentially overlapping responsibilities — root `test`, root `test:api:unit`, root `test:mobile:unit`, root `test:integration`, root `test:e2e:web`, root `test:e2e:web:smoke`, plus the three deliberately-broken `test:e2e*` scripts (Finding 4). TESTS-1 should treat the absence of an `apps/api/eslint.config.*` (Finding 2) and the absence of `apps/api/tsconfig.spec.json` (Finding 3) as inputs — they affect what tests can be type-checked and how `pnpm exec jest --findRelatedTests` behaves there.
- **MOBILE-1**: `apps/mobile/package.json` is unusually thin (only `eas-build-post-install`, `android`, `ios`). Mobile dev/test/typecheck flow comes via root scripts and nx. Finding 8 (no project.json) and Finding 4 (broken e2e scripts that target mobile flows) are the two mobile-touching items here. The `eas-build-post-install` script does include schema build (`pnpm exec nx run-many -t build -p @eduagent/schemas`) — so MOBILE-1 should know that mobile's EAS build has an implicit dependency on schemas building cleanly.

## Out of scope / not checked

- **`.nx/cache/cloud/2605.01.1/package.json`** — nx cloud tooling artefact; not authored by humans, not appropriate to audit.
- **Behavior of `pnpm exec nx run api:lint`** when invoked — only static existence of configs was checked, not actual exit-code behavior. A confirming run would require executing nx (allowed but slow) and was skipped per the ~30 min cap.
- **Workspace-level `pnpm-workspace.yaml`** — not part of the script audit, but worth a glance during any follow-up since it gates which packages even appear as filterable.
- **Husky `.husky/{pre-commit, commit-msg}`** scripts — these are not `package.json` scripts; out of scope, but they exist and look intact.
- **Per-script secret-leakage risk** — the `scripts/verify-no-secret-postinstall.cjs` script exists and is wired via root `verify:postinstall-safety`, but not invoked from any lifecycle hook (no `postinstall` script). This may be intentional (manual safety check) but is worth flagging as a potential gap if someone expected it to run automatically.

## Recommended punch-list entries

```markdown
- **AUDIT-PACKAGE-SCRIPTS-1a** Rename `db:generate` → `db:generate:dev` and update CLAUDE.md
  - Severity: YELLOW
  - Effort: ~5 min
  - Files: `package.json:21`, `CLAUDE.md:165`
  - Why it matters: Lone `db:*` script without `:dev` suffix despite using `.env.development.local`. PR #131 fixed three of four; this is the leftover.

- **AUDIT-PACKAGE-SCRIPTS-1b** Add explicit lint/test/typecheck to `apps/api/project.json` (or add `apps/api/eslint.config.mjs`)
  - Severity: YELLOW
  - Effort: ~30 min
  - Files: `apps/api/project.json`, `apps/api/eslint.config.mjs` (new)
  - Why it matters: Three CLAUDE.md "Handy Commands" (`api:lint`, `api:test`, `api:typecheck`) resolve only via plugin inference because `apps/api` has neither local eslint config nor explicit nx targets. All other workspace projects make their lint coverage declarative.

- **AUDIT-PACKAGE-SCRIPTS-1c** Mirror the maestro-PATH pretest barricade into `nx.json` `targetDefaults.e2e`
  - Severity: YELLOW
  - Effort: ~15 min
  - Files: `nx.json:71-87`
  - Why it matters: Root pnpm `test:e2e*` scripts have a friendly "use C:/Tools/maestro/bin/maestro.bat" pretest hook; the equivalent `nx e2e mobile` invocation has no barricade and would fail with the raw Unicode error. Same drift pattern PR #132 caught for inngest events (event detected new, sibling old code not swept).

- **AUDIT-PACKAGE-SCRIPTS-1d** Add `apps/api/tsconfig.lib.json` and `apps/api/tsconfig.spec.json`
  - Severity: YELLOW
  - Effort: ~30 min
  - Files: `apps/api/tsconfig.lib.json` (new), `apps/api/tsconfig.spec.json` (new), `apps/api/tsconfig.json` (update references)
  - Why it matters: nx plugin infers `build` from `tsconfig.lib.json` per `nx.json:25-29`; api has no such file. Test type-check has no companion `tsconfig.spec.json`. Inferred behavior depends on plugin defaults rather than declarative config.

- **AUDIT-PACKAGE-SCRIPTS-1e** Either remove deliberately-broken `test:e2e*` scripts or rename to `:DO_NOT_USE`
  - Severity: GREEN-leaning-YELLOW (cosmetic)
  - Effort: ~15 min
  - Files: `package.json:25-32`
  - Why it matters: Three scripts are guaranteed-broken by sibling pretest hooks. A reader scanning `package.json` cannot tell from the script body alone that these are not the supported path.

- **AUDIT-PACKAGE-SCRIPTS-1f** Document or simplify the `tsx node_modules/drizzle-kit/bin.cjs` indirection
  - Severity: GREEN
  - Effort: ~30 min
  - Files: `package.json:20-23` (or add note to CLAUDE.md "Schema And Deploy Safety")
  - Why it matters: Undocumented workaround. Future-proofing — if upstream issue is resolved, indirection becomes dead weight nobody can attribute.

- **AUDIT-PACKAGE-SCRIPTS-1g** Replace `C:/Tools/doppler/doppler.exe` hardcoded path in CLAUDE.md
  - Severity: YELLOW (doc drift)
  - Effort: ~10 min
  - Files: `CLAUDE.md:175-176`
  - Why it matters: Onboarding friction; couples with `AUDIT-GOVERNING-1d`.
```

## Audit honesty disclosures

- **Sweep was full, not sampled.** All 8 in-scope `package.json` files were read in full, and the full CLAUDE.md "Handy Commands" block was cross-checked.
- **Behavior verification was skipped.** I confirmed configuration files exist and references resolve, but I did not run `pnpm exec nx run api:lint`, `nx graph`, or `nx show project api --json` to verify inferred targets actually behave as expected. The findings around plugin inference (Findings 2, 3, 5) are static analysis only.
- **`C:/Tools/maestro/bin/maestro.bat` is NOT present on this audit machine.** I therefore cannot independently verify whether the alternative path CLAUDE.md recommends actually works on the user's primary machine. The pretest hook's premise (bare `maestro` in PATH is Unicode-broken) is taken at face value from the in-script error message.
- **Plugin inference behavior is nx-version-dependent.** Findings 2, 3, and 5 reflect the `nx 22.2.0` plugin behavior installed today. A future nx upgrade could change defaults; that's part of why those findings recommend making the targets declarative rather than inferred.
- **No git-history checks.** I did not run `git log -p package.json` to confirm Finding 1's claim that PR #131 was the rename author. The punch list line 18 explicitly cites PR #131 for the `db:*:stg → db:*:dev` rename, and the live state matches that claim modulo the `db:generate` straggler.
