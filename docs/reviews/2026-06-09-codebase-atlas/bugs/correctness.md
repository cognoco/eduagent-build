# Correctness & logic — Bug Review

> **Pruned 2026-06-10** — findings verified FIXED against `new-llm` HEAD were removed in this pass; only still-live findings remain below. Full original review is in git history.

Lens: Correctness & logic. Owned area: `apps/api/src/services/**`, `apps/mobile/src/lib/**`, `apps/mobile/src/hooks/**`. Branch: `new-llm`.

This area is unusually well-hardened: the hot paths (billing metering, quiz completion, streaks, SSE streaming, sign-out cleanup, challenge-round mastery, the envelope parser) carry extensive race/TOCTOU guards, transaction wrapping, IDOR checks, and inline finding-ID provenance. The findings below are the residual edges that survived that hardening — mostly silent-suppression and cross-mode-mismatch logic, not hot-path data corruption. No Critical issues were found in the owned area.

A note on prior memory: the `project_navcontract_isadultowner_null_bug.md` concern ("Add a child shows for null-birthYear owners") appears **resolved** — `isAdultOwner` now returns `false` when `birthYear == null` (`packages/schemas/src/age.ts:60`), and the nav-contract `addChildGate` flows through that guard (`apps/mobile/src/lib/navigation-contract.ts:320-326`). Not reported as a finding.

---

## Critical

None found in the owned area.

---

## High

_All previously-listed items verified fixed on 2026-06-10 and pruned._

---

## Medium

_All previously-listed items verified fixed on 2026-06-10 and pruned._

---

## Low

### [Low] `formatMinutes` / `formatTimer` produce garbage on negative or NaN input
- File: `apps/mobile/src/lib/format-relative-date.ts:3-8` (`formatMinutes`)
- What: `formatMinutes(min)` returns `"${min} min"` for `min < 60`, so a negative renders `"-5 min"`, and `NaN < 60` is false so it falls through to `Math.floor(NaN/60)` → `"NaNh"`. No guard for non-finite/negative.
- Impact: Display-only. A bad upstream duration (clock skew, corrupt field) renders "NaNh" / "-5 min" to the user instead of a sane fallback. `formatTimer` (`:108-113`) is already guarded with `Math.max(0, Math.floor(...))`; `formatMinutes` is not.
- Fix direction: Clamp with `Number.isFinite(min) ? Math.max(0, min) : 0` at the top of `formatMinutes`, mirroring `formatTimer`.

### [Low] `normalizeReplyText` lossily rewrites literal `\r` to `\n` in learner-facing prose
- File: `apps/api/src/services/llm/envelope.ts:86-92`
- What: The escape-leak sanitizer replaces literal `\r` with a newline (`:90`). When a tutor reply legitimately discusses escape sequences (e.g. "`\r` is a carriage return, `\n` is a newline"), the literal `\r` in prose is rewritten to an actual line break, corrupting the explanation. The code intentionally avoids `\\`, `\"`, `\u` etc. but `\r`→`\n` is applied unconditionally.
- Impact: Rare, narrow (CS/typesetting topics), and cosmetic — a sentence about escape characters renders with an unexpected line break. Acknowledged tradeoff territory, but the `\r` substitution specifically is more aggressive than the `\n`/`\t` ones because real prose more often references `\r` than emits a stray one.
- Fix direction: Consider dropping the standalone `\r`→`\n` rule (keep `\r\n`→`\n`), or only normalize when the surrounding context looks like a leaked whitespace artifact rather than a quoted token. Low priority.

### [Low] SSE generator can yield already-buffered chunks before surfacing a late error (documented BUG-632, only entry-guarded)
- File: `apps/mobile/src/lib/sse.ts:579-604`
- What: `generateEvents` checks `done && streamError` only at the *top* of each loop iteration (`:587-590`). Within an iteration it drains the whole queue (`:591-594`) and only then awaits. If `streamError` becomes set during that await (a 4xx body arriving after some `data:` frames were already queued and yielded in the prior iteration), the already-yielded stale chunks have corrupted the accumulated text; the next iteration discards the *remaining* queue but cannot un-yield what already went out.
- Impact: Narrow timing window where buffered SSE chunks reach the consumer before an error that should have discarded them. The codebase already documents and partially mitigates this (BUG-632 comment at `:581-590`), so this is a residual edge, not an unaddressed bug.
- Fix direction: Re-check `done && streamError` *inside* the queue-drain loop (before each `yield`) so a late error stops further yields mid-drain, not just at the next iteration boundary.

---

## Cross-lens findings

- **(Security / prompt-injection)** `apps/api/src/services/safety-tripwire.ts:43-82` — the deterministic input tripwire is precision-tuned and ASCII/word-boundary based; it does not normalize homoglyphs, zero-width characters, or leetspeak before matching, so trivial obfuscation bypasses the catastrophic-category floor (the model + battery are the documented primary net). This is an accepted precision-over-recall tradeoff but belongs to the Safety/LLM-abuse lens to weigh.

- **(API-contract consistency)** `apps/mobile/src/lib/api-client.ts:285-298` vs `apps/mobile/src/lib/sse.ts:408-422` — the two HTTP error classifiers re-implement 402/quota classification separately. They are currently equivalent (both require `code === 'QUOTA_EXCEEDED'`, verified against `quotaExceededSchema` at `packages/schemas/src/billing.ts:240-241`), but the duplication is a drift risk: a future change to one classifier's 4xx mapping won't propagate to the other (streaming vs non-streaming requests would classify the same server response differently). Cross-lens: API contract / maintainability.

- **(State-management / cache)** `apps/mobile/src/hooks/use-move-topic.ts`, `use-bookmarks.ts`, `use-clone-from-child.ts` and siblings use invalidation-only (no `onMutate` optimistic rollback) — correct and safe, but several mutations fire 4-6 `invalidateQueries` calls each with hand-written key tuples (`use-move-topic.ts:38-56`) that must stay byte-aligned with the query-key factory in `query-keys.ts`. A key-shape drift would silently fail to invalidate (stale UI) rather than error. Belongs to the State-management lens for a key-consistency audit.
