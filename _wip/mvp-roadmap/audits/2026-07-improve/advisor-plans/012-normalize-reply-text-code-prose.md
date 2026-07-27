# Plan 012: Stop `normalizeReplyText` from corrupting escape-sequence coding prose

> **Executor instructions**: This change touches learner-visible LLM output —
> the eval-harness step is mandatory. Follow step by step; honor "STOP
> conditions". When done, update the status row in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/llm/envelope.ts apps/api/src/services/exchanges.ts`
> On any change, compare excerpts to live code; mismatch → STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

`normalizeReplyText` unconditionally rewrites literal `\n` and `\t` sequences into real whitespace in **every** learner-visible reply. It exists to fix a ~1% LLM double-escape leak. But this is a tutoring product that teaches programming: a reply explaining escape sequences ("a newline is written `\n`", "columns are separated by `\t`") has its literal escapes converted to actual whitespace before the learner sees it — silently corrupting the taught material. The code itself already documents this exact failure for `\r` and carves it out ("collapsing `\r` only corrupted coding prose that legitimately discusses the carriage-return escape") — but does not extend that reasoning to `\n`/`\t`. The fix narrows the rewrite so it stops mangling escape-teaching prose while still catching the double-escape leak.

## Current state

```ts
// services/llm/envelope.ts:88-102
/**
 * ...Order matters: `\r\n` is matched before `\n` so a CRLF pair becomes a
 * single newline, not two.
 *
 * [#899] A *standalone* literal `\r` is deliberately NOT rewritten. Models that
 * leak escapes emit `\n` (or the `\r\n` pair handled above), never a lone `\r`
 * meant as a newline — so collapsing `\r` only corrupted coding prose that
 * legitimately discusses the carriage-return escape.
 */
export function normalizeReplyText(text: string): string {
  return text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')     // <-- rewrites literal \n even inside code/escape prose
    .replace(/\\t/g, '\t');    // <-- same for \t
}
```

Applied at:
- `services/llm/envelope.ts:229` — every parsed reply.
- `services/exchanges.ts:2336` and `:2380` — fallback paths.

Repo conventions:
- Changing LLM-output behavior requires the eval harness: `pnpm eval:llm` (Tier 1 snapshot) and `pnpm eval:llm --live` (Tier 2 schema validation). The harness lives in `apps/api/eval-llm/`.
- WARNING (from repo memory): `pnpm eval:llm --live` pollutes ~295 snapshot files; `git restore` the snapshots dir before committing if you run `--live`. For this change, Tier 1 (`pnpm eval:llm`) is the required gate; run `--live` only if you need to validate real responses, then restore snapshots.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm exec nx run api:typecheck` | exit 0 |
| Unit test | `cd apps/api && pnpm exec jest --findRelatedTests src/services/llm/envelope.ts --no-coverage` | pass |
| Eval snapshot (Tier 1) | `pnpm eval:llm` | no unexpected drift |
| Restore polluted snapshots (only if you ran --live) | `git restore apps/api/eval-llm/snapshots` | clean |

## Suggested executor toolkit

- Read `apps/api/eval-llm/` README/index and the repo memory note on live-snapshot pollution before running any eval command.

## Scope

**In scope**:
- `apps/api/src/services/llm/envelope.ts` — narrow `normalizeReplyText`.
- `apps/api/src/services/llm/envelope.test.ts` — add cases.
- An eval case for an escape-teaching reply (in `apps/api/eval-llm/`), if the harness supports adding one cleanly.

**Out of scope**:
- The `\r` carve-out (already correct).
- `exchanges.ts` call sites — they call the same function; don't change the call sites, only the function.
- Broadening the change into a general markdown parser — keep it a targeted narrowing.

## Git workflow

- Branch: `advisor/012-normalize-reply-text-code-prose`.
- Conventional commits, e.g. `fix(api): don't rewrite literal \n/\t inside code spans in replies`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Narrow the rewrite to non-code contexts

Change `normalizeReplyText` so the `\n`/`\t` rewrite does NOT fire inside markdown code spans (fenced ``` blocks and inline `` `code` ``). The minimal robust approach: split the text into code and non-code segments (a small tokenizer over fenced/inline code), apply the `\r\n`→`\n`, `\n`→`\n`, `\t`→`\t` replacements ONLY to non-code segments, and leave code segments verbatim. Preserve the existing order (`\r\n` before `\n`) and the `\r` carve-out. Do NOT use a heavyweight markdown library — a focused split is enough (ponytail: keep it to the code/non-code split, no full parser).

Update the doc comment to state the new scope (rewrite skips code spans, same reasoning as the `\r` carve-out, now generalized).

**Verify**: `pnpm exec nx run api:typecheck` → exit 0.

### Step 2: Unit tests

Add to `envelope.test.ts`:
- Prose with a genuine double-escape leak outside code → still normalized (the original bug stays fixed): input `"line one\\nline two"` (plain prose) → newline.
- Inline code teaching an escape → preserved: input ``"a newline is written `\\n`"`` → the `` `\n` `` stays literal.
- Fenced code block containing `\n`/`\t` → preserved verbatim.
- `\r\n` pair outside code → single newline (order preserved).
- Standalone `\r` → unchanged (carve-out intact).

**Verify**: `cd apps/api && pnpm exec jest --findRelatedTests src/services/llm/envelope.ts --no-coverage` → pass, new cases included.

### Step 3: Eval harness snapshot

Run `pnpm eval:llm` (Tier 1). If the change shifts any snapshot, confirm the shift is the intended one (escape-teaching prose now preserved) and stage the updated snapshots per the repo's eval-snapshot workflow. If you run `--live`, `git restore apps/api/eval-llm/snapshots` afterward to undo the ~295-file pollution and re-run Tier 1 clean.

**Verify**: `pnpm eval:llm` → no unexpected drift; any staged snapshot change is intentional and explained in the commit.

## Test plan

- Unit tests in `envelope.test.ts` (Step 2) — the double-escape-still-fixed case is the regression guard proving the narrowing didn't reopen the original leak.
- Eval snapshot (Step 3) as the learner-output gate.
- Structural pattern: existing `envelope.test.ts` cases for `normalizeReplyText`.

## Done criteria

- [ ] `normalizeReplyText` no longer rewrites `\n`/`\t` inside fenced or inline code spans; still normalizes them in plain prose; `\r` carve-out intact.
- [ ] Unit tests cover: leak-in-prose (normalized), escape-in-inline-code (preserved), escape-in-fenced-code (preserved), `\r\n` order, standalone `\r`.
- [ ] `pnpm exec nx run api:typecheck` exits 0; envelope tests pass.
- [ ] `pnpm eval:llm` shows no unintended drift; any snapshot change is intentional and committed per the eval workflow (snapshots NOT polluted by a stray `--live` run).
- [ ] Only in-scope files modified (`git status`).
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md` status row updated.

## STOP conditions

- The narrowing reopens the double-escape leak the original guards against (the leak-in-prose test fails) — STOP; the split logic is wrong.
- The eval harness shows broad, unexplained snapshot drift beyond the escape-prose cases — STOP and investigate; do not blanket-accept snapshots.
- You find `normalizeReplyText` is applied somewhere it must stay unconditional (a non-learner-facing internal parse) — report before changing; the function may need two variants.

## Maintenance notes

- This is a targeted narrowing, not a markdown normalizer. If replies start carrying other structured content that the rewrite mangles, revisit the code/non-code split rather than adding more special cases.
- Reviewer should focus on the leak-in-prose regression test — that's the property most likely to silently regress if the split is later "simplified".
- The frequency of escape-teaching prose in real replies is the open question that made this MED-confidence; the eval case makes the behavior observable going forward.
