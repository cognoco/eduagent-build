# Plan 004: Stop sending learner free-text to Sentry (and add the promised scrubber)

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result. Honor "STOP conditions". When done, update the
> status row in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/language-detect.ts apps/api/src/index.ts apps/api/src/middleware/profile-scope.ts`
> On any change, compare excerpts to live code; mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

This is a children's-education product. When the language-detect LLM call fails, the fallback ships `rawInput` — learner-entered subject text, which can contain a child's name or personal phrasing — to Sentry as error `extra`. There is no `beforeSend` scrubber on the Sentry init, and `middleware/profile-scope.ts:28` documents an intended "under-13 PII scrubbing" control that was never implemented. This is a concrete PII-to-third-party path plus documentation drift. It is not a mass leak (`@sentry/cloudflare` defaults `sendDefaultPii: false`), but it is exactly the kind of minimization gap a minors product must close.

## Current state

```ts
// services/language-detect.ts:96-104 — the leak
} catch (err) {
  // [BUG-462] Silent recovery banned (AGENTS.md)...
  captureException(err, {
    extra: { context: 'language-detect.fallback', rawInput },  // <-- rawInput is learner text
  });
  logger.warn('[language-detect] LLM call failed — falling back to hint', {
    context: 'language-detect.fallback',
    error: err instanceof Error ? err.message : String(err),
    // note: the logger.warn beside it already omits rawInput
  });
```

```ts
// services/subject.ts:437 — caller passes learner-entered text
detectLanguageSubject(input.rawInput ?? input.name)
```

```ts
// index.ts:620-626 — Sentry init has NO beforeSend scrubber
export default Sentry.withSentry(
  (env) => ({
    dsn: ...,
    tracesSampleRate: ...,
    // <-- no beforeSend
  }),
  api,
);
```

```
// middleware/profile-scope.ts:28 — the documented-but-missing control
// (comment promises age-gated PII scrubbing that does not exist)
```

Repo convention: the `logger.warn` in the same catch already demonstrates the intended shape — error message only, no `rawInput`. Match that. There is a Sentry-scrubbing tech skill in this repo (`.agents/skills/tech/sentry-scrubbing`, surfaced as `tech-sentry-scrubbing`) — use it for the `beforeSend` shape.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm exec nx run api:typecheck` | exit 0 |
| Lint | `pnpm exec nx run api:lint` | exit 0 |
| Related tests | `cd apps/api && pnpm exec jest --findRelatedTests src/services/language-detect.ts src/index.ts --no-coverage` | pass |
| Grep the leak | `rg -n 'rawInput' apps/api/src/services/language-detect.ts` | only the sanitized reference after the fix |

## Suggested executor toolkit

- Load `tech-sentry-scrubbing` (repo skill) before writing the `beforeSend` — it has the canonical redaction shape for this codebase.

## Scope

**In scope**:
- `apps/api/src/services/language-detect.ts` — remove `rawInput` from the Sentry `extra`.
- `apps/api/src/index.ts` — add a `beforeSend` scrubber to the Sentry init.
- Co-located tests for both.

**Out of scope**:
- Do NOT change what `logger.warn` logs (already clean).
- Do NOT change `detectLanguageSubject`'s signature or `subject.ts` — the input still flows; we just stop persisting it to Sentry.
- Do NOT attempt a full PII taxonomy across the app — one call-site fix + one defense-in-depth `beforeSend`. A repo-wide `extra:` audit is a separate follow-up (note it, don't do it).

## Git workflow

- Branch: `advisor/004-strip-learner-pii-from-sentry`.
- Conventional commits, e.g. `fix(api): remove learner free-text from Sentry language-detect fallback [security]`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Remove `rawInput` from the language-detect Sentry capture

In `services/language-detect.ts` at the catch (~line 99), drop `rawInput` from `extra`. Keep the error visible (the [BUG-462] "silent recovery banned" rule): retain `captureException(err, { extra: { context: 'language-detect.fallback' } })`. If a length signal is useful for debugging, replace `rawInput` with `rawInputLength: rawInput?.length` — a non-PII scalar — but do NOT ship the text or any substring.

**Verify**: `rg -n 'rawInput' apps/api/src/services/language-detect.ts` shows no `rawInput` value inside `captureException`'s `extra` (only, at most, `rawInputLength`). `pnpm exec nx run api:typecheck` → exit 0.

### Step 2: Add a `beforeSend` scrubber to the Sentry init

In `index.ts` (~line 620), add a `beforeSend(event)` to the config object returned by `withSentry`. It is defense-in-depth implementing the control `profile-scope.ts:28` promises: strip known PII-bearing keys from `event.extra` / `event.contexts` before send (a denylist of keys like `rawInput`, `name`, `firstName`, `birthDate`, `transcript`, `messages`). Follow the shape from the `tech-sentry-scrubbing` skill; keep it small and allowlist-safe. Do NOT drop the whole event — redact fields.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0. `rg -n 'beforeSend' apps/api/src/index.ts` → 1 match.

### Step 3: Update the drifted comment

Update `profile-scope.ts:28` to point at the now-implemented `beforeSend` (so the doc matches reality), or move the note to where the scrubber lives. Keep it factual — do not overclaim coverage.

**Verify**: `rg -n 'PII' apps/api/src/middleware/profile-scope.ts` reflects the implemented control.

## Test plan

- **New test** in `apps/api/src/services/language-detect.test.ts`: force the LLM path to throw and assert the `captureException` call it makes contains NO `rawInput` value (spy on the sentry capture; assert `extra` has no learner text). Model after existing tests in that file that exercise the fallback.
- **New test** in `apps/api/src/index.test.ts` (or wherever the Sentry init is unit-testable; if it isn't directly testable, add a focused unit test for the extracted `beforeSend` function — extract it to a named export if needed to make it testable): assert `beforeSend` strips a denylisted key from `event.extra`.
- Sentry is a true external boundary — mocking `@sentry/*` / the capture is allowed (not an internal-mock violation).
- Verification: `cd apps/api && pnpm exec jest --findRelatedTests src/services/language-detect.ts src/index.ts --no-coverage` → pass, new tests included.

## Done criteria

- [ ] `captureException` in `language-detect.ts` carries no learner text (`rawInput` value gone).
- [ ] `index.ts` Sentry init has a `beforeSend` that redacts a PII denylist.
- [ ] A test proves the fallback capture omits `rawInput`; a test proves `beforeSend` redacts a denylisted key.
- [ ] `pnpm exec nx run api:typecheck` and `api:lint` exit 0.
- [ ] Only in-scope files modified (`git status`).
- [ ] `advisor-plans/README.md` status row updated.

## STOP conditions

- `withSentry` no longer accepts a config with `beforeSend` in this SDK version (check `@sentry/cloudflare` types) — report and propose the SDK-correct hook instead.
- Removing `rawInput` breaks an existing test that asserts it's present — that test encodes the bug; update it and note the change (don't preserve the leak to keep a test green).
- You find `rawInput` (or equivalent learner text) sent to Sentry at other call sites — note them in the PR as a follow-up; do NOT expand this plan to fix all of them.

## Maintenance notes

- The `beforeSend` denylist is defense-in-depth, not a substitute for not-capturing PII at the call site. Reviewer should confirm both layers landed.
- Follow-up (deferred): a repo-wide grep of `captureException(.*extra` / `Sentry.*extra` for other learner-text leaks. Recommended as a separate small audit.
