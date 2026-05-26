# i18n Phase 2 — UI Strings Hygiene

**Status:** Draft
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

Replace the line-by-line regex scanner with a `ts-morph` `Project.getSourceFiles()` walk over `apps/mobile/src/**/*.{ts,tsx}` (excluding `.test.ts`/`.test.tsx`/`test-utils/mock-i18n.*`, matching the current exclusion set).

For each source file:

1. **Find every `useTranslation` destructuring** in the file:
   ```ts
   const { t } = useTranslation();
   const { t: translate } = useTranslation();
   const useT = useTranslation;
   const { t: msg } = useTranslation();
   ```
   Build a per-file `Set<string>` of identifiers bound to the `t` slot of any `useTranslation()` call. Always contains the bare `'t'` (the convention), plus any rename targets. This set lives at scope level — we don't try to track block-scope shadowing; if any function in the file destructures `t: translate`, every `translate(...)` call in the file is treated as a t-call.

2. **Walk every `CallExpression`** whose callee identifier is in the per-file set:
   - First argument is `StringLiteral` or `NoSubstitutionTemplateLiteral` → record as a **static key**.
   - First argument is `TemplateExpression` → extract the literal prefix (everything before the first `${`). If the prefix is non-empty, record as a **prefix marker** ending in `.*`. If the prefix is empty (`t(\`${x}\`)`), record as a **fully-dynamic call site** with `{file, line}`.
   - First argument is anything else (`Identifier`, `CallExpression`, etc.) → record as a **fully-dynamic call site** with `{file, line}`.

3. **Detect colon-prefix and namespace-argument misuse**, unchanged from today (these are still bugs — the i18n init registers only the default `translation` namespace).

After walking, the script holds:
- `staticKeys: Set<string>` — every literal key referenced statically.
- `prefixMarkers: Set<string>` — every `prefix.*` extracted from template literals.
- `dynamicCallSites: Array<{file, line, snippet}>` — every call where the key cannot be inferred at all.

**Forward orphan check** (existing behaviour, now AST-accurate):
For each static key, verify it exists in `en.json` (or under a `_one`/`_other`/etc. plural suffix). Report orphans.

**New: reverse orphan / unused-key check.** Triggered by `--report-unused` flag:
For each key in `en.json`, mark it **kept** if any of:
- The key is in `staticKeys`.
- The key matches some `prefix.*` in `prefixMarkers`.
- The key matches some entry in `KEEP_PATTERNS` (`scripts/i18n-keep.ts`).

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

`scripts/translate.ts:39` (`TARGET_LANGUAGES`) handles all six. The script's existing "extra_key" validation removes keys from the target locales that no longer exist in `en.json`. Six locale files updated in one pass.

Verify:

```bash
pnpm tsx scripts/check-i18n-staleness.ts   # expect: "All translation files are up to date"
```

**Step 3c — flip to blocking.** Once the diagnostic pass exits zero, change `check-i18n-orphan-keys.ts` so `--report-unused` is **on by default** (not a flag). Any unused key in a future PR fails CI. Update `scripts/check-i18n-staleness.ts` invocation in pre-commit / CI to call the orphan checker alongside it.

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
- `scripts/i18n-keep.ts` — `KEEP_PATTERNS` with inline reasons.
- `scripts/check-i18n-orphan-keys.test.ts` — fixtures covering:
  - Multi-line `t(\n  'key'\n)` (closes regex blind spot).
  - Renamed `const { t: translate } = useTranslation()` (alias resolution).
  - Bare `const { t } = useTranslation()` (control).
  - Template-literal prefix `t(\`errors.${code}\`)` (prefix-marker extraction).
  - Fully-dynamic `t(getKey())` (dynamic-call-sites report, not orphan).
  - `KEEP_PATTERNS` glob matching.

**Edited:**
- `scripts/check-i18n-orphan-keys.ts` — full rewrite to `ts-morph`; preserves the colon-prefix and `useTranslation('ns')` misuse checks; adds `--report-unused` (step 3a) then makes it default-on (step 3c).
- `apps/mobile/src/i18n/locales/en.json` — keys removed per step 3a triage.
- `apps/mobile/src/i18n/locales/{de,es,ja,nb,pl,pt}.json` — cascade-removed via `pnpm translate`.
- `CLAUDE.md` — new "Languages" section.
- `AGENTS.md` — mirror of the new section.
- `package.json` if needed — add `ts-morph` to `devDependencies` (used only by scripts; not pulled into the app bundle).

**Audit step:** before step 3a, run the diagnostic pass and capture its output verbatim in the PR description. Reviewers see exactly which keys were deleted and exactly which fully-dynamic call sites were triaged.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Fully-dynamic `t(\`${ns}.bar\`)` produces empty prefix | Static analyser cannot infer prefix | Naively, every key under any namespace would be flagged unused | Empty-prefix template literals are routed into the **fully-dynamic call sites** report, not the prefix-markers set; they do not influence unused-key detection until a human adds a keep-pattern or refactors |
| Renamed `t` alias not caught by AST walker | `const { t: translate } = useTranslation()` and similar | Every `translate(...)` call's keys silently flagged orphan; first-run "unused" report wildly over-reports | Test fixture in `check-i18n-orphan-keys.test.ts` exercises the rename pattern — CI fails the AST upgrade PR if alias resolution regresses |
| `KEEP_PATTERNS` entry rots (call site removed but pattern stays) | Feature deletion leaves a stale allowlist entry | Some keys stay alive in `en.json` even though no code references them | Step 3c blocking ratchet still passes (the keys ARE allowlisted), but the `reason` field cites a file:line that no longer exists — periodic grep audit catches it. Acceptable drift; not a runtime bug. |
| `pnpm translate` deletes a key the LLM needs to keep | A key that looks unused but is reached via a runtime `t(getKey())` not yet in `KEEP_PATTERNS` | Literal `key.name` rendered to user | Add a covering pattern to `KEEP_PATTERNS`, restore the key from git history, re-run `pnpm translate`. Diagnostic pass (step 3a) is the firewall — by triaging dynamic call sites before deletion, this should not happen. |
| Adding `ts-morph` triggers `nx reset` cache invalidation issues | NX cache picks up new devDependency | Phantom typecheck/eslint failures during local dev | Run `pnpm exec nx reset` per the existing `feedback_nx_reset_before_commit` rule |

## Rollback

Reversible. The destructive operation is deletion of keys from JSON files; recovery is `git revert <sha>`.

- **What's lost on rollback:** Nothing data-side. All deleted keys are recoverable from git history. The eight non-English locale files restore via the same revert.
- **What's NOT lost:** No DB changes. No migration. No runtime state.
- **Procedure:** `git revert <sweep-commit>` restores `en.json` and the six target locales in one shot. The AST upgrade and `KEEP_PATTERNS` file can be reverted independently if desired; the regex scanner is preserved in git history. Run `pnpm exec nx reset` after revert.

## Validation

- `pnpm exec nx run-many -t typecheck` passes (the AST upgrade compiles).
- `pnpm exec nx run-many -t test` passes (existing tests + new orphan-checker tests).
- `pnpm tsx scripts/check-i18n-orphan-keys.ts` exits 0 (no forward orphans, no unused keys after sweep, no namespace misuse).
- `pnpm tsx scripts/check-i18n-staleness.ts` exits 0 ("All translation files are up to date").
- Manual: launch the app in each of the 7 UI locales, walk through onboarding + a session, confirm no literal `key.name` strings render anywhere.
- Manual: confirm the unused-key sweep is captured in the PR description with the verbatim diagnostic output and rationale per deleted key cluster.
