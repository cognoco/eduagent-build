---
title: i18n Phase 2 — UI Strings Hygiene — Implementation Plan
date: 2026-05-26
profile: change
spec: docs/specs/2026-05-26-i18n-phase2-ui-strings-hygiene.md
status: draft
---

# i18n Phase 2 — UI Strings Hygiene — Implementation Plan

**Goal:** Sweep reverse-orphan keys out of `en.json` (cascading to 6 target locales), upgrade the orphan checker to a `ts-morph` AST walk that handles multi-line / aliased / template `t()` calls, and make unused-key detection a forward-only CI gate.

**Approach:** Land the tooling first (allowlist + AST checker + tests), run a one-shot diagnostic pass, triage every fully-dynamic `t()` call site, delete confirmed dead keys, cascade through `pnpm translate`, flip the checker to default-on, wire pre-commit on the right triggers, document the 7-UI / 10-conversation asymmetry.

## Scope

In scope:
- `scripts/i18n-keep.ts` (new)
- `scripts/check-i18n-keep-rot.ts` (new)
- `scripts/check-i18n-orphan-keys.ts` (rewrite)
- `scripts/check-i18n-orphan-keys.test.ts` (new)
- `apps/mobile/src/i18n/locales/en.json` (key deletions only)
- `apps/mobile/src/i18n/locales/{de,es,ja,nb,pl,pt}.json` (cascade via `pnpm translate`)
- `.husky/pre-commit` (new orphan-checker block)
- `CLAUDE.md` (new "Languages" section)
- `AGENTS.md` (mirror)
- `package.json` (devDependency: `ts-morph`)
- Source-code refactors of dynamic `t()` call sites identified in T6 triage (touch as needed, minimum surface)

Out of scope:
- `i18next-parser.config.js` (unused by CI; left as-is).
- `apps/mobile/src/i18n/index.ts`, `SUPPORTED_LANGUAGES`, `conversationLanguageSchema`, `CONVERSATION_LANGUAGE_NAMES`, migration 0087 (no language added; documentation only).
- `scripts/translate-gemini.ts`, `scripts/check-i18n-staleness.ts` (used as-is).
- Any `packages/**` or `apps/api/**` i18n consumers — confirmed none exist (spec §Architecture/2).
- Re-translating non-English locales from scratch (sweep is delete-only).

## Tasks

- [ ] **T1: Add `ts-morph` to root `devDependencies`.**
  Run `pnpm add -D -w ts-morph`. Confirm `ts-morph` lands in the root `package.json` devDependencies and `pnpm-lock.yaml` updates. Do NOT add to any app/package `package.json` — scripts run from repo root, not bundled into the mobile app.
  **Done when:** `pnpm exec tsx -e "import('ts-morph').then(m => console.log(m.Project.name))"` prints `Project`, and `pnpm exec nx reset` followed by `pnpm exec nx run-many -t typecheck` is clean.

- [ ] **T2: Create `scripts/i18n-keep.ts` with Zod-validated `KEEP_PATTERNS`.**
  Export `KeepPattern` interface (`pattern: string`, `reason: string`) and `KEEP_PATTERNS: readonly KeepPattern[]`. Validate via a Zod schema in the same file that requires `reason` to match `/[\w./-]+:\d+/` (at least one `path:line` token). Schema validation runs at module import time and throws on bad entries (so the orphan checker, keep-rot checker, and tests all fail fast). Seed with the `errors.*` entry from spec §Architecture/1. Glob semantics: `*` matches any non-empty span including dots (multi-segment).

  ```ts
  // scripts/i18n-keep.ts
  import { z } from 'zod';

  const keepPatternSchema = z.object({
    pattern: z.string().min(1),
    reason: z.string().regex(/[\w./-]+:\d+/, 'reason must cite path:line'),
  });

  export interface KeepPattern {
    readonly pattern: string;
    readonly reason: string;
  }

  const raw: readonly KeepPattern[] = [
    {
      pattern: 'errors.*',
      reason:
        'reached via ERROR_KEY_MAP at apps/mobile/src/i18n/error-keys.ts:1; ' +
        'every entry is selected by API error code at runtime',
    },
  ];

  export const KEEP_PATTERNS: readonly KeepPattern[] = raw.map((p) =>
    keepPatternSchema.parse(p)
  );
  ```

  Verify the cited file `apps/mobile/src/i18n/error-keys.ts` exists; if it does not, adjust the reason to the actual error-mapping file before committing (a grep for `ERROR_KEY_MAP` or equivalent finds it).
  **Done when:** `pnpm tsx scripts/i18n-keep.ts` exits 0; deliberately corrupting the seed entry's `reason` to drop the `:1` makes import throw a `ZodError`.

- [ ] **T3: Create `scripts/check-i18n-keep-rot.ts`.**
  Imports `KEEP_PATTERNS` from `i18n-keep.ts`. For each entry, parse `<path>:<line>` out of `reason` (first match wins; supports multiple cites in one reason — verify all). For each cite: `fs.existsSync(path)` AND `fs.readFileSync(path,'utf8').split('\n').length >= line`. On failure, print `<pattern>: cite <path>:<line> — file missing` or `… — file has only N lines`. Exit 1 on any failure.
  Forward-only ratchet: existing entries are checked, but the script is designed so adding a new entry with a bad cite fails CI. No legacy carve-out needed — the Zod schema in T2 already requires every entry (including the seed) to have a valid `path:line` token, so the rot-check just confirms the cited line still exists.
  **Done when:** `pnpm tsx scripts/check-i18n-keep-rot.ts` exits 0 with the T2 seed entry; temporarily editing the entry's reason to cite `apps/mobile/src/i18n/error-keys.ts:99999` makes it exit 1 with the "file has only N lines" message.

- [ ] **T4: Write `scripts/check-i18n-orphan-keys.test.ts` fixtures (red).**
  Write tests first against the not-yet-rewritten checker so the red→green transition in T5 has explicit failing tests. Use the existing test runner setup at repo root (`pnpm exec jest scripts/check-i18n-orphan-keys.test.ts` or whatever runner `scripts/` uses — check the closest existing `scripts/*.test.ts` for the convention; if none, use `pnpm exec tsx --test`).
  Cover (one fixture per case, each fixture is an in-memory `Project` from `ts-morph` with `addSourceFileAtPath`-style content):
  1. Multi-line: `const { t } = useTranslation();\nt(\n  'foo.bar'\n);` → `staticKeys` contains `foo.bar`.
  2. Alias: `const { t: translate } = useTranslation();\ntranslate('foo.bar');` → contains `foo.bar`.
  3. Bare control: `const { t } = useTranslation();\nt('foo.bar');` → contains `foo.bar`.
  4. Wrapper-hook indirection: file with NO `useTranslation` import, contains `t('foo.bar');` → contains `foo.bar` (per spec §Architecture/2 fix H-4).
  5. Template prefix only: `t(\`errors.${code}\`)` → `prefixMarkers` contains `{prefix: 'errors.', suffix: ''}`.
  6. Template prefix + suffix: `t(\`onboarding.languageSetup.levels.${level}.label\`)` → `prefixMarkers` contains `{prefix: 'onboarding.languageSetup.levels.', suffix: '.label'}`.
  7. Mid-path short-prefix violation: `t(\`a.${x}.b\`)` (prefix `a.` has only 1 dot-segment) → checker exits 1 with the short-prefix error UNLESS the line has `// i18n-allow-short-prefix: <reason>`.
  8. Pluralised key preservation: static call `t('count')` against an `en.json` containing `count_one` and `count_other` → both pluralised keys reported as KEPT in `--report-unused`.
  9. Fully-dynamic: `t(getKey())` → `dynamicCallSites` contains `{file, line}`, NO orphan reported for that call.
  10. `KEEP_PATTERNS` multi-segment match: pattern `errors.*` keeps `errors.network.timeout` alive in `--report-unused`.
  11. Per-file escape: a file with `// i18n-not-t: t` directive on a line before a `t(nonString)` call → that file's `t` calls are NOT treated as i18n calls (spec §Architecture/2 fix H-4 escape).

  **Done when:** all 11 tests are written and FAIL against the current (regex) checker. Capture the failures (e.g., `pnpm test scripts/check-i18n-orphan-keys.test.ts 2>&1 | tee /tmp/i18n-red.txt`) and confirm each test's failure message matches the expected gap (regex blind spot, no alias support, etc.).

- [ ] **T5: Rewrite `scripts/check-i18n-orphan-keys.ts` to a `ts-morph` AST walker (green).**
  Full rewrite. Preserve verbatim:
  - The header comment's *intent* (rewrite the TODO block to past-tense: "the regex scanner was replaced with a ts-morph AST walker on 2026-05-26").
  - `SRC_DIR`, `EN_PATH`, `Nested`, `flatten()`, `PLURAL_SUFFIXES` (current file lines 49–84).
  - The file-exclusion set (current file lines 94–100): `.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx`, paths containing `test-utils${path.sep}mock-i18n.`.
  - The colon-prefix check (`t('common:ok')`) and `useTranslation('ns')` namespace-arg misuse check — kept as separate AST passes (find every `CallExpression` whose callee is `useTranslation` with a string-literal first arg → emit `useTranslation-arg`; find every static-key call whose key contains `:` → emit `colon-key`).

  New behaviour:
  - Use `Project.addSourceFilesAtPaths(\`\${SRC_DIR}/**/*.{ts,tsx}\`)` then filter via the exclusion set.
  - Per-file: collect identifiers bound to the `t` slot of `useTranslation()` (destructuring `{ t }` or `{ t: alias }`) into `tIdentifiers: Set<string>`. Always include the bare `'t'` per spec §Architecture/2 fix H-4. Honour per-file `// i18n-not-t: <ident>` directives by removing `<ident>` from the set.
  - Walk `CallExpression`s where callee is an `Identifier` in `tIdentifiers`. First-argument dispatch per spec §Architecture/2 step 2:
    - `StringLiteral` / `NoSubstitutionTemplateLiteral` → `staticKeys.add(value)`.
    - `TemplateExpression` → extract `prefix = head.text`, `suffix = lastSpan.literal.text` (the literal text after the last `${…}` block; empty when the template ends with `${…}`). If `prefix === '' && suffix === ''` → push to `dynamicCallSites`. Else: count dot-segments in `prefix` (i.e. `prefix.split('.').filter(Boolean).length` — but really, "ends with `.` and has at least one segment before that"); if prefix is non-empty AND has fewer than 2 dot-separated tokens before its trailing `.`, check the call line for `// i18n-allow-short-prefix:` — if absent, push to a new `shortPrefixViolations` array (script exits 1 on any).
    - Anything else → `dynamicCallSites.push({file, line, snippet})`.
  - Forward orphan check (unchanged behaviour): each `staticKeys` entry must be in `flatten(en.json)` or have a `PLURAL_SUFFIXES`-suffixed variant present.
  - **New `--report-unused` flag** (T5 ships it as opt-in; T9 flips it default-on). When set:
    - Start with `allKeys = flatten(en.json)`.
    - `kept = new Set<string>()`.
    - For each `k` in `staticKeys`: `kept.add(k)` AND for each suffix in `PLURAL_SUFFIXES`, `kept.add(\`\${k}\${suffix}\`)` (per spec §Architecture/2 fix M-2).
    - For each marker `{prefix, suffix}` in `prefixMarkers`: for each `k` in `allKeys`, if `k.startsWith(prefix) && k.endsWith(suffix)` → `kept.add(k)`.
    - For each `{pattern}` in `KEEP_PATTERNS`: convert glob `*` → regex `.+`, anchor with `^…$`, match against every `allKeys` entry and add matches to `kept`.
    - `unused = allKeys - kept`. Print `unused` keys grouped by top-level namespace.
  - Report `dynamicCallSites` under the header from spec §Architecture/2 ("Fully-dynamic t() call sites…"). Informational, does NOT influence exit code.
  - Exit non-zero on: any orphan, any colon-key, any namespace-arg misuse, any short-prefix violation, OR (when `--report-unused` set) any unused key.

  **Done when:** all 11 T4 tests pass (`pnpm test scripts/check-i18n-orphan-keys.test.ts` exits 0), AND running `pnpm tsx scripts/check-i18n-orphan-keys.ts` (without `--report-unused`) against current `apps/mobile/src` produces the SAME orphan/namespace/colon output it did before the rewrite (capture both with the legacy script preserved in git, diff the outputs; any new findings must be real bugs, not false positives).

- [ ] **T6: Diagnostic pass — triage every fully-dynamic call site.**
  Run `pnpm tsx scripts/check-i18n-orphan-keys.ts --report-unused 2>&1 | tee docs/plans/2026-05-26-i18n-phase2-diagnostic.txt`. Expected output sections: forward orphans (likely zero — none today), short-prefix violations (likely zero), unused keys (the sweep target — expect 100–500+), fully-dynamic call sites (the triage target).
  For each entry in the fully-dynamic call sites section, open `file:line`, read the surrounding code, and pick ONE of:
  - **Refactor to static prefix**: rewrite e.g. `t(getLocalizedErrorKey(code))` → `t(\`errors.${code}\`)`. Preferred when the prefix is stable and the variable part is the leaf. Record the file and the rewrite in a triage note appended to `docs/plans/2026-05-26-i18n-phase2-diagnostic.txt`.
  - **Add `KEEP_PATTERNS` entry**: append to `scripts/i18n-keep.ts` with a `reason` citing the exact `file:line` of the dynamic call. Use the pattern that covers exactly the runtime-selected subtree (avoid over-broad globs like `*`).
  Re-run the diagnostic until the fully-dynamic call sites section is either empty OR every remaining entry has a corresponding `KEEP_PATTERNS` reason that cites it.
  **Done when:** the re-run diagnostic shows zero fully-dynamic call sites without a covering `KEEP_PATTERNS` entry (verify by inspection — the script doesn't enforce this coupling); `pnpm tsx scripts/check-i18n-keep-rot.ts` exits 0 for every new entry.

- [ ] **T7: Delete unused keys from `en.json`.**
  From the diagnostic output's "unused keys" section, for each key: run `git log -S "<key>" --all -- apps/mobile/src/` (replace dots in key with literal `.` — git -S takes a substring, not a regex). If git history shows the key was referenced by code that has since been removed (e.g. `learning-mode` toggle removal commits, `personaFromBirthYear` removal), it's safe to delete. If git -S finds NO history of the key ever being referenced, also safe (translation overhead with no past use). If it finds CURRENT references that the AST walker missed, that's a checker bug — file it, do NOT delete, and add a regression test to T4's list.
  Delete confirmed-dead keys from `apps/mobile/src/i18n/locales/en.json`. Keep notes per-feature-cluster (e.g., "removed N keys from `learning-mode.*` — toggle deleted in commit `<sha>`") for the PR description (T13).
  Record `Before: N keys, After: M keys, Removed: K keys` by running a flatten count before and after (e.g., `pnpm tsx -e "import data from './apps/mobile/src/i18n/locales/en.json'; …count…"`).
  **Done when:** `pnpm tsx scripts/check-i18n-orphan-keys.ts --report-unused` exits 0 (no unused keys, no forward orphans, no namespace misuse, no short-prefix violations); the Before/After/Removed counts are recorded in a scratch note for T13.

- [ ] **T8: Cascade key deletions to the 6 target locales.**
  Run `pnpm translate`. Per spec §Architecture/3 fix CR-1, this invokes `scripts/translate-gemini.ts`, and the deletions-only short-circuit (`translate-gemini.ts:314–330`) prunes locally without an LLM round-trip when only deletions occurred. Mixed-case (if T7 also added keys, which it should NOT) routes through `translate-gemini.ts:364–375`.
  Verify each of `de,es,ja,nb,pl,pt.json` shrank by the same K keys removed from `en.json` (spot-check: pick 3 deleted keys, confirm absent from all 6 files). Run `pnpm tsx scripts/check-i18n-staleness.ts` — expect exit 0 with "All translation files are up to date".
  **Done when:** staleness check exits 0; spot-check confirms 3 randomly chosen deleted keys are gone from all six target locales.

- [ ] **T9: Flip `--report-unused` to default-on in the checker.**
  Edit `scripts/check-i18n-orphan-keys.ts`: change the flag default so unused-key reporting runs unconditionally. Add a `--allow-unused` opt-out flag for ad-hoc local debugging only (NOT to be used in CI). Update the script's header comment ("Usage" + "Exit codes") to reflect the new behaviour: exit 1 also on unused keys.
  **Done when:** `pnpm tsx scripts/check-i18n-orphan-keys.ts` (no flags) exits 0 against the swept `en.json`; adding a junk key `\"__dead__\": \"x\"` to en.json (then removing it) makes the same command exit 1 with the unused-key error.

- [ ] **T10: Wire `.husky/pre-commit` orphan-checker block (independent of staleness).**
  Read `.husky/pre-commit` around line 70 (the existing en.json-gated staleness block referenced in spec §Architecture/3 fix H-3). Add a NEW block (do not modify the existing staleness block):

  ```sh
  # i18n orphan / unused-key check — runs on TSX, en.json, or keep-list edits.
  if git diff --cached --name-only | grep -qE '^(apps/mobile/src/.*\.(ts|tsx)|apps/mobile/src/i18n/locales/en\.json|scripts/i18n-keep\.ts)$'; then
    pnpm exec tsx scripts/check-i18n-orphan-keys.ts || exit 1
    pnpm exec tsx scripts/check-i18n-keep-rot.ts || exit 1
  fi
  ```

  Place after the existing staleness block. Confirm `.github/workflows/ci.yml:137` already runs the orphan checker — no CI change needed (the new default-on `--report-unused` from T9 propagates automatically).
  **Done when:** stage a TSX file with a fake deleted `t()` call (e.g., remove `t('home.title')` from a screen) AND an unrelated file edit → `git commit -m test` fails with the unused-key error; `git restore --staged .` then a clean commit succeeds.

- [ ] **T11: Add "Languages" section to `CLAUDE.md`.**
  Insert the section from spec §Architecture/4 verbatim, placed immediately above the "Non-Negotiable Engineering Rules" heading. Use the full version (4-row table + asymmetry rationale + `useMentorLanguageSync` clamp note + "Adding a language requires" checklist). The deferred-to-taste L-2 reduction (move checklist to `docs/architecture.md`) is NOT taken in this plan — ship the full block.
  Before pasting, verify each file:line cite:
  - `apps/mobile/src/i18n/index.ts:23` — confirm `SUPPORTED_LANGUAGES` declared at or near that line.
  - `packages/schemas/src/profiles.ts:10` — confirm `conversationLanguageSchema` declared at or near that line.
  - `apps/mobile/src/hooks/use-mentor-language-sync.ts:10` — confirm `useMentorLanguageSync` declared at or near that line.
  - `apps/api/src/services/llm/router.ts:151` — confirm `CONVERSATION_LANGUAGE_NAMES` declared at or near that line.
  - Migration 0087 — confirm `profiles_conversation_language_check` constraint added there.
  Adjust line numbers in the pasted section to match current code. If any cite has drifted by ≥10 lines, also fix the symbol's current line in the spec doc (the spec is the source for this plan, but a >10-line drift suggests the spec captured stale state).
  **Done when:** `CLAUDE.md` contains the new "Languages" section with verified line numbers; `grep -n 'SUPPORTED_LANGUAGES' apps/mobile/src/i18n/index.ts` returns the cited line within ±5.

- [ ] **T12: Mirror "Languages" section into `AGENTS.md`.**
  Per CLAUDE.md's "Cross-runtime File Sync" rule, copy the T11 section verbatim into `AGENTS.md` at the equivalent structural position. Search `AGENTS.md` for the "Non-Negotiable Engineering Rules" heading (or its AGENTS.md equivalent — open the file to confirm exact heading) and insert above it.
  **Done when:** the new section text matches between the two files exactly (verify with `diff <(sed -n '/^## Languages$/,/^## /p' CLAUDE.md) <(sed -n '/^## Languages$/,/^## /p' AGENTS.md)` — should print nothing).

- [ ] **T13: Prepare PR description with diagnostic dump.**
  Compose the PR body with, in order:
  1. One-line header: `Before: N keys, After: M keys, Removed: K keys` (from T7 scratch note) — spec §File Map fix L-1.
  2. Per-feature-cluster rationale block (from T7 notes): which feature each cluster of removed keys belonged to, with git-history evidence.
  3. The verbatim diagnostic output captured in T6 (`docs/plans/2026-05-26-i18n-phase2-diagnostic.txt`).
  4. The list of dynamic-call-site decisions from T6: each entry as `file:line — refactored to t(\`prefix.${var}\`)` OR `file:line — added KEEP_PATTERNS entry \`<pattern>\``.
  5. Coordination note (spec §File Map fix M-4): announce in team channel before opening PR; hold through one merge-window; rebase + re-run `pnpm translate` if any upstream merge in that window adds keys.
  **Done when:** the PR description draft is saved (locally or in the PR) and contains all 5 sections. (PR creation itself is out of scope for this plan per the user's standing "no PR unless asked" rule — the description is a deliverable, opening the PR is a separate gesture.)

## Validation

Run after T7 and again after T12:

- `pnpm exec nx run-many -t typecheck` — clean. Catches the T1 dependency addition plus the T2/T3/T5 script type-check.
- `pnpm test scripts/check-i18n-orphan-keys.test.ts` — all 11 fixtures from T4 pass.
- `pnpm tsx scripts/check-i18n-orphan-keys.ts` (no flags, post-T9) — exit 0.
- `pnpm tsx scripts/check-i18n-keep-rot.ts` — exit 0.
- `pnpm tsx scripts/check-i18n-staleness.ts` — "All translation files are up to date".
- Pre-commit regression: stage a TSX file with a deleted `t()` call → `git commit` fails with the unused-key error (T10 acceptance, also serves as integration test for the trigger wiring).
- Manual: launch the mobile app in each of the 7 UI locales (en, de, es, ja, nb, pl, pt), walk through onboarding + a session, confirm no literal `key.name` strings render anywhere.

If any check fails: do NOT loosen the test, do NOT add `// i18n-allow-*` to silence — these escapes exist for genuine dynamic cases triaged in T6, not as failure cures. Diagnose the gap and fix the code or the checker.

## Rollback

Reversible per spec §Rollback.

- Sweep commit (T7 + T8): `git revert <sweep-sha>` restores `en.json` and the 6 target locales in one shot.
- Tooling (T1–T5, T9, T10): revertable independently; the regex scanner is preserved in git history.
- Docs (T11, T12): revertable trivially.
- After any revert: `pnpm exec nx reset` (per `feedback_nx_reset_before_commit`).

Nothing data-side is lost. No DB changes. No runtime state. The 6 target locale files are LLM-translated from `en.json`; if a revert is needed and the cascade is partial, re-run `pnpm translate` to re-sync.
