# i18n Phase 2 — UI Strings Hygiene

**Status:** Draft (adversarial-review pass 2026-05-26; findings CR-1, H-1..H-4, M-1..M-4 folded in)
**Date:** 2026-05-26
**Owner:** zuzana.kopecna@zwizzly.com
**Related:** `docs/specs/2026-05-26-i18n-phase1-llm-language-threading.md` (lands first, in a separate PR)

## Problem

`apps/mobile/src/i18n/locales/en.json` is 3,018 lines. The staleness checker (`scripts/check-i18n-staleness.ts`) holds the six non-English locale files (de, es, ja, nb, pl, pt) in lockstep, so every dead key in `en.json` is also being translated to six other languages — symmetric bloat.

CI today catches **forward** orphans (a `t('foo.bar')` call where `foo.bar` is missing from `en.json` — `scripts/check-i18n-orphan-keys.ts`). It does **not** catch **reverse** orphans (a key in `en.json` that no `t(…)` call references). Dead keys from removed features — `learning-mode` toggle, `personaFromBirthYear`-era child copy, the deprecated dictation/Narnia branches, etc. — sit in every locale file indefinitely.

The orphan checker itself has a known regex blind spot: multi-line `t(\n 'key'\n)` calls and renamed-`t` aliases (`const { t: translate } = useTranslation()`). The header comment at `scripts/check-i18n-orphan-keys.ts:28-34` documents the TODO to swap regex for `ts-morph`.

Separately: `SUPPORTED_LANGUAGES` (UI shell — 7 locales: en, de, es, ja, nb, pl, pt) is a subset of `conversationLanguageSchema` (LLM-prose tutor language — 10 codes: en, cs, es, fr, de, it, pt, pl, ja, nb). The asymmetry is intentional (Czech/French/Italian tutor prose without committing to UI translation maintenance) but undocumented, so it reads as a bug to a new contributor.

## Goals

1. Sweep every reverse-orphan (unused) key out of `en.json`, with the six target locales tracking via `pnpm translate`.
2. Upgrade `scripts/check-i18n-orphan-keys.ts` from regex to `ts-morph` so multi-line calls, renamed `t` aliases, and template-literal prefixes are handled correctly.
3. Make unused-key detection a hard CI gate (forward-only ratchet, after the one-shot sweep brings the count to zero).
4. Co-locate the "kept-on-purpose" allowlist with its reasons in `scripts/i18n-keep.ts` (type-checked, greppable).
5. Document the 7-UI / 10-conversation asymmetry in `CLAUDE.md` and `AGENTS.md`.

## Non-Goals

- Adding cs/fr/it to `SUPPORTED_LANGUAGES`. Market decision, separate work.
- Touching `i18next-parser.config.js`. It is currently unused by CI; the upgraded `check-i18n-orphan-keys.ts` is the single source of truth.
- Re-translating the six non-English locales from scratch. Staleness is already held; we are only **deleting** keys, and `pnpm translate` removes them from the target locales as part of the cascade.
- Changing the keep-list format after Phase 2 ships (no `.json` variant, no `.md` parallel doc — only `i18n-keep.ts`).

## Architecture

### 1. `scripts/i18n-keep.ts` — co-located allowlist

Replaces the spec's earlier `i18n-keep.json + i18n-keep.md` proposal. Single TS file:

```ts
// scripts/i18n-keep.ts
//
// Keys (or prefix patterns) that are reached at runtime through mappings the
// static AST walker in scripts/check-i18n-orphan-keys.ts cannot follow.
// Without these, the unused-key pass would flag them as dead and the next
// sweep would delete them, breaking the dynamic call site.
//
// Format: each entry is { pattern, reason }.
//   - `pattern` uses glob-style `*` for any subkey segment. `errors.*` matches
//     `errors.quotaExhausted`, `errors.generic`, etc.
//   - `reason` MUST cite the file:line where the dynamic reference lives, so
//     a future reader can grep their way to the call site and judge whether
//     the entry is still earning its keep.

export interface KeepPattern {
  readonly pattern: string;
  readonly reason: string;
}

export const KEEP_PATTERNS: readonly KeepPattern[] = [
  {
    pattern: 'errors.*',
    reason:
      'reached via ERROR_KEY_MAP at apps/mobile/src/i18n/error-keys.ts:1; ' +
      'every entry is selected by API error code at runtime',
  },
  // Additional entries added during the first-run triage in step 4.
  // Each addition lists the file:line where the dynamic reference lives.
];
```

Imported by `check-i18n-orphan-keys.ts`. Type-checked by the existing TS build. Reasons are inline so they cannot rot relative to the pattern they explain.

### 2. AST upgrade — `scripts/check-i18n-orphan-keys.ts`

Replace the line-by-line regex scanner with a `ts-morph` `Project.getSourceFiles()` walk over `apps/mobile/src/**/*.{ts,tsx}`. **Preserve the existing exclusion set verbatim** (`check-i18n-orphan-keys.ts:94-100`): `.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx`, and any path containing `test-utils${path.sep}mock-i18n.` (the mock helper documents `t()` in JSDoc, which the regex falsely matched as call sites). **[fix M-3]** Cross-package scan is intentionally limited to `apps/mobile/src` — confirmed no `useTranslation` / `i18next` consumers exist anywhere under `packages/` or `apps/api/` (grep, 2026-05-26).

For each source file:

1. **Find every `useTranslation` destructuring** in the file:
   ```ts
   const { t } = useTranslation();
   const { t: translate } = useTranslation();
   const useT = useTranslation;
   const { t: msg } = useTranslation();
   ```
   Build a per-file `Set<string>` of identifiers bound to the `t` slot of any `useTranslation()` call, plus any rename targets. This set lives at scope level — we don't try to track block-scope shadowing; if any function in the file destructures `t: translate`, every `translate(...)` call in the file is treated as a t-call.

   **[fix H-4 — disambiguation]** The bare identifier `'t'` is treated as a t-call **regardless of whether the file imports `useTranslation`**. Rationale: catches wrapper-hook indirection (`function useT() { const { t } = useTranslation(); return t; }`) where the consuming file never sees `useTranslation` directly. Accepted noise: any function literally named `t` in any file is read as a t-call; first-arg type filtering (StringLiteral / TemplateExpression vs anything else) routes non-string args into the dynamic-call-sites report rather than producing false orphans. Today's codebase has no `const t = …` non-i18n bindings (grep, 2026-05-26); if one appears it can be allow-listed via a per-file `// i18n-not-t: <identifier>` directive read by the walker.

2. **Walk every `CallExpression`** whose callee identifier is in the per-file set:
   - First argument is `StringLiteral` or `NoSubstitutionTemplateLiteral` → record as a **static key**.
   - First argument is `TemplateExpression` → extract the literal prefix (everything before the first `${`) AND the literal suffix (everything after the LAST `${…}`). Record as a **prefix marker** `{prefix, suffix}`. If the prefix is empty (`t(\`${x}…\`)`) AND the suffix is empty, record as a **fully-dynamic call site** with `{file, line}`. **[fix H-2]**
     - Additionally, **fail the orphan checker** if the extracted prefix contains fewer than 2 dot-segments (e.g. `dictation.` is OK; `dictation` or `` is not), unless the call site carries an on-line `// i18n-allow-short-prefix: <reason>` comment. Rationale: a single-segment prefix marks every key under that top-level namespace as kept, silently disabling unused-key detection for that whole subtree. The escape comment forces a deliberate decision.
   - First argument is anything else (`Identifier`, `CallExpression`, etc.) → record as a **fully-dynamic call site** with `{file, line}`.

3. **Detect colon-prefix and namespace-argument misuse**, unchanged from today (these are still bugs — the i18n init registers only the default `translation` namespace).

After walking, the script holds:
- `staticKeys: Set<string>` — every literal key referenced statically.
- `prefixMarkers: Array<{prefix: string, suffix: string}>` — every prefix/suffix pair extracted from template literals. **[fix H-1, H-2]**
- `dynamicCallSites: Array<{file, line, snippet}>` — every call where the key cannot be inferred at all.

**Forward orphan check** (existing behaviour, now AST-accurate):
For each static key, verify it exists in `en.json` (or under a `_one`/`_other`/etc. plural suffix per `PLURAL_SUFFIXES` in the existing script). Report orphans.

**New: reverse orphan / unused-key check.** Triggered by `--report-unused` flag:
For each key in `en.json`, mark it **kept** if any of:
- The key is in `staticKeys`. **[fix M-2]** A static reference `t('foo')` also keeps `foo`, `foo_zero`, `foo_one`, `foo_two`, `foo_few`, `foo_many`, `foo_other` alive — the i18next pluralisation contract is symmetric. Without this, every pluralised key flags 5 of 6 variants as orphan on the first sweep.
- The key matches some prefix-marker: starts with `prefix` AND ends with `suffix`, where `*` between them is any string including dots (i.e. multi-segment). Example: marker `{prefix: 'onboarding.languageSetup.levels.', suffix: '.label'}` matches `onboarding.languageSetup.levels.b1.label` and `…levels.advanced.label`. Marker `{prefix: 'errors.', suffix: ''}` matches `errors.quotaExhausted` and `errors.network.timeout`. **[fix H-1]**
- The key matches some entry in `KEEP_PATTERNS` (`scripts/i18n-keep.ts`). Glob `*` semantics identical to prefix-marker matching above.

Unkept keys are reported as unused.

**Separately**, the script reports the `dynamicCallSites` list under a header:

```
Fully-dynamic t() call sites (key cannot be inferred statically):
  apps/mobile/src/components/foo.tsx:42 — t(getKey())

These call sites do not contribute to either forward orphan or unused-key
detection. If any of these reach keys you care about, add a covering pattern
to scripts/i18n-keep.ts.
```

The dynamic-call-sites report is informational — it does not, by itself, fail CI. Its purpose is to let a human decide whether each dynamic site needs an allowlist entry or a refactor.

### 3. Diagnostic-then-ratchet sweep

**Step 3a — diagnostic pass.** With the upgraded scanner in place but **before** any keys are deleted:

```bash
pnpm tsx scripts/check-i18n-orphan-keys.ts --report-unused
```

Outputs:
- (probably zero) Forward orphans.
- (some N) Unused keys.
- (some M) Fully-dynamic call sites.

For each fully-dynamic call site: open the file, read the surrounding code, decide:
- Refactor to a static prefix (`t(\`errors.${code}\`)` instead of `t(getLocalizedErrorKey(code))`). Preferred when the prefix is stable and the variable part is the leaf.
- Add a `KEEP_PATTERNS` entry citing the call site as the reason.

For each unused key: confirm it is genuinely dead (`git log -S "key.name" --all` to spot recent removals) and delete from `en.json`. Keep notes in the commit message of which features the keys belonged to.

**Step 3b — cascade to other locales.** After `en.json` is cleaned:

```bash
pnpm translate
```

**[fix CR-1]** `pnpm translate` invokes **`scripts/translate-gemini.ts`** (see `package.json:52` — `"translate": "doppler run -- pnpm exec tsx scripts/translate-gemini.ts"`). The older `scripts/translate.ts` (Anthropic-backed) is no longer the active path. `TARGET_LANGUAGES` lives at `scripts/translate-gemini.ts:7` and is the same six-locale set.

The cascade mechanics are stronger than a plain "extra_key validation removes them":
- **Deletions-only short-circuit** (`scripts/translate-gemini.ts:314-330`): when the sweep removes keys without adding any, the script prunes them locally and writes the file — **no LLM round-trip**. The sweep cascade is effectively free.
- **Mixed deletions + additions** (`translate-gemini.ts:364-375`): the diff-mode merge step deletes every key not present in `en.json` after merging the LLM's translated additions back in. Same end state, one LLM call per language for the additions only.

Six locale files updated in one pass either way.

Verify:

```bash
pnpm tsx scripts/check-i18n-staleness.ts   # expect: "All translation files are up to date"
```

**Step 3c — flip to blocking.** Once the diagnostic pass exits zero, change `check-i18n-orphan-keys.ts` so `--report-unused` is **on by default** (not a flag). Any unused key in a future PR fails CI.

**[fix H-3]** Wire the upgraded checker into the right triggers — the staleness trigger is the wrong shape for the new check. The reverse-orphan case (a `t()` call site was deleted but the en.json key wasn't) is by definition a TSX-only change with no `en.json` edit, so mirroring the staleness gate at `.husky/pre-commit:70-72` (which only fires when `en.json` is staged) would miss the bug it exists for.

- **Pre-commit** (`.husky/pre-commit`): add a separate block that runs `pnpm exec tsx scripts/check-i18n-orphan-keys.ts` when ANY of these are staged:
  - `apps/mobile/src/**/*.{ts,tsx}` (catches deleted call sites)
  - `apps/mobile/src/i18n/locales/en.json` (catches added/renamed keys)
  - `scripts/i18n-keep.ts` (catches allow-list edits)

  Independent of the existing en.json-gated staleness block.

- **CI** (`.github/workflows/ci.yml:137`): already runs the orphan checker on every PR — once `--report-unused` is default-on, no further change needed.

### 4. Document the 7-UI / 10-conversation asymmetry

Add a new section to `CLAUDE.md` (above "Non-Negotiable Engineering Rules") and mirror to `AGENTS.md`:

```markdown
## Languages

Two language enums exist, and they intentionally diverge:

| Concept | Enum | Where | Count |
|---|---|---|---|
| UI shell language | `SUPPORTED_LANGUAGES` | `apps/mobile/src/i18n/index.ts:23` | 7: en, de, es, ja, nb, pl, pt |
| LLM tutor-prose language | `conversationLanguageSchema` | `packages/schemas/src/profiles.ts:10` | 10: en, cs, es, fr, de, it, pt, pl, ja, nb |

The conversation set is intentionally a **superset**. Czech, French, and Italian
learners can pick those as their tutor-prose language during onboarding and
get LLM cards in their language; the UI shell falls back to English because we
haven't committed to maintaining UI translations for those locales yet.

`useMentorLanguageSync` (`apps/mobile/src/hooks/use-mentor-language-sync.ts:10`)
clamps `i18next.language` through `conversationLanguageSchema.safeParse` before
patching the profile, so a UI-language change can never write an invalid value
to `profiles.conversation_language`. The DB CHECK constraint
(`profiles_conversation_language_check`, migration 0087) is the hard floor.

Adding a language requires:

- **UI-only locale (already in conversation set):** add to `SUPPORTED_LANGUAGES`,
  add `LANGUAGE_LABELS` entry, add to `resources` in `i18n/index.ts`, run
  `pnpm translate`, ensure `scripts/check-i18n-staleness.ts` passes.
- **Conversation-only locale:** add to `conversationLanguageSchema`, add to
  `CONVERSATION_LANGUAGE_NAMES` in `apps/api/src/services/llm/router.ts:151`,
  add a new migration extending the DB CHECK constraint.
- **Both:** combination of the two.
```

The `CLAUDE.md` "Cross-runtime File Sync" section already documents that
`CLAUDE.md` and `AGENTS.md` are manually mirrored — same applies here.

## File Map

**New:**
- `scripts/i18n-keep.ts` — `KEEP_PATTERNS` with inline reasons. **[fix M-1]** Each entry validated by a Zod schema in the same file that requires `reason` to contain at least one `path:line` token.
- `scripts/check-i18n-keep-rot.ts` — **[fix M-1]** resolves each `KEEP_PATTERNS` reason's `path:line` cite; fails on file-not-found or insufficient line count. Forward-only.
- `scripts/check-i18n-orphan-keys.test.ts` — fixtures covering:
  - Multi-line `t(\n  'key'\n)` (closes regex blind spot).
  - Renamed `const { t: translate } = useTranslation()` (alias resolution).
  - Bare `const { t } = useTranslation()` (control).
  - Bare `t(...)` call in a file with NO `useTranslation` import (wrapper-hook indirection — **[fix H-4]** must be treated as t-call).
  - Template-literal prefix only: `t(\`errors.${code}\`)` → marker `{prefix: 'errors.', suffix: ''}` (multi-segment match).
  - Template-literal prefix AND suffix: `t(\`onboarding.languageSetup.levels.${level}.label\`)` → marker `{prefix: 'onboarding.languageSetup.levels.', suffix: '.label'}` (**[fix H-1]** keeps `…levels.b1.label` alive, not arbitrary `…levels.b1.foo`).
  - Mid-path variable: `t(\`dictation.${a}.pace.${p}\`)` → emits **fewer than 2 dot-segments in prefix** → **fails the checker** unless `// i18n-allow-short-prefix:` escape comment on the same line (**[fix H-2]**).
  - Pluralised key: static `t('count')` keeps `count_one`, `count_other`, etc. alive in the unused-key pass (**[fix M-2]**).
  - Fully-dynamic `t(getKey())` (dynamic-call-sites report, not orphan).
  - `KEEP_PATTERNS` glob matching, including multi-segment `*`.

**Edited:**
- `scripts/check-i18n-orphan-keys.ts` — full rewrite to `ts-morph`; preserves the colon-prefix and `useTranslation('ns')` misuse checks AND the plural-suffix acceptance (`PLURAL_SUFFIXES` at the existing `check-i18n-orphan-keys.ts:71`); adds `--report-unused` (step 3a) then makes it default-on (step 3c). Exclusion set mirrored verbatim from current file (`check-i18n-orphan-keys.ts:94-100`).
- `apps/mobile/src/i18n/locales/en.json` — keys removed per step 3a triage.
- `apps/mobile/src/i18n/locales/{de,es,ja,nb,pl,pt}.json` — cascade-removed via `pnpm translate` (which runs `scripts/translate-gemini.ts`, not `translate.ts` — **[fix CR-1]**).
- `.husky/pre-commit` — **[fix H-3]** new block invoking `check-i18n-orphan-keys.ts` when any `apps/mobile/src/**/*.{ts,tsx}` OR `en.json` OR `scripts/i18n-keep.ts` is staged. Independent of the existing en.json-gated staleness block.
- `CLAUDE.md` — new "Languages" section. **[L-2 deferred — see note below]**
- `AGENTS.md` — mirror of the new section.
- `package.json` if needed — add `ts-morph` to `devDependencies` (used only by scripts; not pulled into the app bundle).

**[L-2 — deferred to taste]** The "Languages" section as written below is ~30 lines and pushes weight into the always-loaded CLAUDE.md. If you'd rather, keep CLAUDE.md to the 4-row table + a one-line pointer (`See docs/architecture.md → "Languages" for the add-a-language checklist.`) and move the "Adding a language requires" block into `docs/architecture.md`. Not blocking; the spec ships the full block by default.

**Audit step:** before step 3a, run the diagnostic pass and capture its output verbatim in the PR description. Reviewers see exactly which keys were deleted and exactly which fully-dynamic call sites were triaged. **[fix L-1]** Include a one-line key-count delta — `Before: N keys, After: M keys, Removed: K keys` — at the top of the PR description so the sweep's magnitude is visible without scrolling the diagnostic dump.

**[fix M-4 — coordination]** The sweep PR rewrites all seven locale files in one commit. Announce in the team channel before opening, hold through one merge-window, and if an upstream merge during that window adds new keys, rebase and re-run `pnpm translate` before merging — otherwise the conflict resolution happens key-by-key in nested JSON, which is miserable.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Fully-dynamic `t(\`${ns}.bar\`)` produces empty prefix | Static analyser cannot infer prefix | Naively, every key under any namespace would be flagged unused | Empty-prefix template literals are routed into the **fully-dynamic call sites** report, not the prefix-markers set; they do not influence unused-key detection until a human adds a keep-pattern or refactors |
| Renamed `t` alias not caught by AST walker | `const { t: translate } = useTranslation()` and similar | Every `translate(...)` call's keys silently flagged orphan; first-run "unused" report wildly over-reports | Test fixture in `check-i18n-orphan-keys.test.ts` exercises the rename pattern — CI fails the AST upgrade PR if alias resolution regresses |
| `KEEP_PATTERNS` entry rots (call site removed but pattern stays) | Feature deletion leaves a stale allowlist entry | Some keys stay alive in `en.json` even though no code references them | **[fix M-1]** Detection path: `scripts/check-i18n-keep-rot.ts` (new, runs in the same pre-commit/CI lane as `check-i18n-orphan-keys.ts`) parses each `KEEP_PATTERNS` `reason` for a `<path>:<line>` token, asserts the file exists AND has at least that many lines. Reason missing a file:line cite is rejected by a Zod schema in `i18n-keep.ts` itself. The script is forward-only: existing entries pass; new or edited entries must have a live cite. Acceptable drift bounded by the next edit, not by a vague periodic audit. |
| `pnpm translate` deletes a key the LLM needs to keep | A key that looks unused but is reached via a runtime `t(getKey())` not yet in `KEEP_PATTERNS` | Literal `key.name` rendered to user | Add a covering pattern to `KEEP_PATTERNS`, restore the key from git history, re-run `pnpm translate`. Diagnostic pass (step 3a) is the firewall — by triaging dynamic call sites before deletion, this should not happen. |
| Adding `ts-morph` triggers `nx reset` cache invalidation issues | NX cache picks up new devDependency | Phantom typecheck/eslint failures during local dev | Run `pnpm exec nx reset` per the existing `feedback_nx_reset_before_commit` rule |

## Rollback

Reversible. The destructive operation is deletion of keys from JSON files; recovery is `git revert <sha>`.

- **What's lost on rollback:** Nothing data-side. All deleted keys are recoverable from git history. The eight non-English locale files restore via the same revert.
- **What's NOT lost:** No DB changes. No migration. No runtime state.
- **Procedure:** `git revert <sweep-commit>` restores `en.json` and the six target locales in one shot. The AST upgrade and `KEEP_PATTERNS` file can be reverted independently if desired; the regex scanner is preserved in git history. Run `pnpm exec nx reset` after revert.

## Validation

- `pnpm exec nx run-many -t typecheck` passes (the AST upgrade compiles).
- `pnpm exec nx run-many -t test` passes (existing tests + new orphan-checker tests + new `check-i18n-keep-rot` test).
- `pnpm tsx scripts/check-i18n-orphan-keys.ts` exits 0 (no forward orphans, no unused keys after sweep, no namespace misuse, no short-prefix dynamic call sites without escape comment).
- `pnpm tsx scripts/check-i18n-keep-rot.ts` exits 0 (every `KEEP_PATTERNS` entry's `reason` cite resolves to a real file:line).
- `pnpm tsx scripts/check-i18n-staleness.ts` exits 0 ("All translation files are up to date").
- Pre-commit gate: stage a TSX file with a deleted `t()` call and an unrelated change → confirm pre-commit fails with the unused-key error (regression test for the **[fix H-3]** trigger wiring).
- Manual: launch the app in each of the 7 UI locales, walk through onboarding + a session, confirm no literal `key.name` strings render anywhere.
- Manual: confirm the unused-key sweep is captured in the PR description with (a) the `Before/After/Removed` count header (**[fix L-1]**), (b) the verbatim diagnostic output, (c) rationale per deleted key cluster.
