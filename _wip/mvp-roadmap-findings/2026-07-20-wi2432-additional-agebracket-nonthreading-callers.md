# Finding — additional `ageBracket`-non-threading `routeAndCall` sites beyond WI-2432 scope (2026-07-20)

**By:** `shepherd:claude:security-wave`, while building WI-2432 (Thread ageBracket to
vendor-exclusion across 4 non-threading callers).
**Context:** WI-2432's AC-3 asks for a static ratchet test asserting every
`LEARNER_FACING_FLOWS` (`router.ts:144`) `routeAndCall`/`routeAndCallForQuiz`/
`routeAndStream` call site threads `ageBracket:`. Building that scanner (modeled on
`router.language-coverage.test.ts`) surfaced more non-threading sites than the 4 named in
WI-2432's ratified scope (`book-generation.ts`, `assessments.ts`, `session-recap.ts`,
`recall-bridge.ts`) and the 2 already-flagged guardian-ambiguous leads (`monthly-report.ts`,
`progress-summary.ts` — BID-4 leads doc §2, BID-26 entry-gate ratification 2026-07-20).

## Root cause

Same as WI-2432's: WI-1986 fixed the under-18 gate *inside* `getFallbackConfig`/
`getModelConfig` given `ageBracket`, but nothing enforced that every learner-facing caller
actually supplies it. The BID-4 adversarial pass's leads (§2 of
`_wip/mvp-roadmap-findings/2026-07-19-safety-floor-batch-adversarial-pass.md`) sampled a
subset of `LEARNER_FACING_FLOWS` sites via sub-agent traces, not an exhaustive sweep — the
sites below were never traced.

## Confirmed sites (routeAndCall omits `ageBracket`; flow tag is in `LEARNER_FACING_FLOWS`)

Verified at `cognoco/eduagent-build` `origin/main` (worktree HEAD `191e758c8`, 2026-07-20):

- `apps/api/src/services/book-suggestion-generation.ts:114` — flow `book.suggestion`
- `apps/api/src/services/curriculum.ts:129` — flow `curriculum.generate`
- `apps/api/src/services/curriculum.ts:204` — flow `curriculum.generate`
- `apps/api/src/services/curriculum.ts:2754` — flow `curriculum.generate`
- `apps/api/src/services/dictation/generate.ts:213` — flow `dictation.generate`
- `apps/api/src/services/dictation/prepare-homework.ts:82` — flow `dictation.prepare-homework`
- `apps/api/src/services/dictation/review.ts:220` — flow `dictation.review` (notably already
  has `ageYears` in scope for `buildReviewSystemPrompt` — same "age data present but never
  converted to ageBracket" shape as WI-2432's `session-recap.ts`)
- `apps/api/src/services/homework-summary.ts:310` — flow `homework.summary`
- `apps/api/src/services/session-llm-summary.ts:317` — flow `session-llm-summary`
- `apps/api/src/services/summaries.ts:160` — flow `summaries.generate`
- `apps/api/src/inngest/functions/post-session-suggestions.ts:182` — flow `post.session.suggestions`

11 call sites, 9 files. All read as genuinely learner-facing (book suggestions, curriculum
generation, dictation generate/review/prepare-homework, homework summary, session summary,
recaps summaries, post-session suggestions) — **not** obviously guardian-only like the
`monthly-report.ts`/`progress-summary.ts` pair, so they should **not** be assumed
guardian-consumed without verification.

## Disposition

Same latent-severity class as WI-2432 (MEDIUM-latent: unexploitable while
`LLM_ROUTING_V2_ENABLED=true`, reopens if the legacy path is re-enabled). Out of WI-2432's
ratified scope (four named callers only, per BID-26 entry-gate ratification 2026-07-20) —
not fixed here. Relayed to PM/single-writer intake for triage and scope decision (fix as a
sibling class-sweep WI, or rule some/all guardian-consumed with evidence). WI-2432's AC-3
ratchet test denylists these 11 sites individually with a pointer to the tracking WI minted
from this finding, so the ratchet still holds every other `LEARNER_FACING_FLOWS` site
(including WI-2432's own 4, once fixed) to the literal "every site" text.
