# GC6 Internal-Mock Backlog Survey

**Date:** 2026-05-30
**Scope:** every test file in the repo (`git ls-files '*.test.ts' '*.test.tsx'`) — 164 files containing internal `jest.mock()` calls.
**Method:** multi-agent workflow — 36 balanced batches, each **classified** by one agent then **adversarially re-verified** by a second agent that re-read the source and challenged every "trivial" call. 62 agents, ~6.4M tokens, ~14 min. Read-only on source.
**Run:** `wf_5c0ce269-0ed` (workflow `gc6-internal-mock-survey`).

> This is a survey, not a change. No source files were modified. The actionable artifact is the burn-down list below + `catalog.csv`.

---

## Headline

716 `jest.mock()` call sites were read and classified across the 164 files:

| Category | Count | Actionable? |
|---|---:|---|
| **internal-violation** (bare internal mock, no escape) | **153** | ✅ **this is the backlog** |
| already-gc1-allow (carries a `gc1-allow` annotation) | 319 | ⚠️ mostly *not* actionable — see caveat |
| external-boundary (LLM/Stripe/Clerk/push/email/Inngest framework/vendor SDK) | 227 | ❌ sanctioned, leave alone |
| not-a-mock (the `scripts/check-gc1-pattern-a.test.ts` guard fixture) | 17 | ❌ intentional test data |

The **153 internal-violation sites are the real GC6 backlog**: API 103, mobile 50. Breakdown by effort:

| Burn-down class | Effort | Count |
|---|---|---:|
| `trivial-requireActual` | S | **101** |
| `needs-wiring` | M | 50 |
| `needs-wiring` | L | 2 |

The verifier changed **92** classifications and flagged **79** as borderline (trivial↔needs-wiring ambiguity), so treat effort as a guide, not a contract.

---

## ⚠️ Important caveat on the `already-gc1-allow` bucket

The classifier tried to re-litigate the 319 `gc1-allow`-annotated sites and judged 225 "convertible." **Do not act on that number.** The repo uses the `gc1-allow` comment in two different ways:

1. The CLAUDE.md escape hatch — "the real dependency genuinely cannot run in the test env."
2. A **label on already-correct pattern-a conversions**, e.g. in the canonical exemplar `apps/api/src/inngest/functions/archive-cleanup.test.ts`:
   ```ts
   jest.mock('../../services/consent' /* gc1-allow: pattern-a conversion */, () => {
     const actual = jest.requireActual('../../services/consent');
     return { ...actual, getConsentStatus: (...a) => mockGetConsentStatus(...a) };
   });
   ```
   This is *already the desired end state*. The classifier flagged many of these as "convertible," which is wrong — they're done.

So the `already-gc1-allow` analysis is **noise** for prioritization purposes. The trustworthy backlog is strictly the **153 internal-violation** sites (no `gc1-allow` comment, no `requireActual`). Everything in `README` below is scoped to those.

---

## Burn-down plan (153 sites)

### Phase 1 — quick wins (101 × S, `trivial-requireActual`)

Convert bare `jest.mock('./x')` → `jest.requireActual('./x')` + targeted overrides (pattern-a). Biggest single-file clusters first — knock out a whole file per sitting:

| Sites | File |
|---:|---|
| 19 | `apps/api/src/inngest/functions/session-completed.test.ts` |
| 9 | `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx` |
| 4 | `apps/api/src/inngest/functions/summary-regenerate.test.ts` |
| 3 | `session-stale-cleanup` · `middleware/llm` · `routes/homework` · `routes/learner-profile` · `routes/vocabulary` · `services/account` · `mobile dictation/index` · `mobile mentor-memory` · `mobile quiz/play` |
| 2 | 9 files (see `catalog.csv`) |
| 1 | 21 files (see `catalog.csv`) |

`session-completed.test.ts` alone is ~19 of the 101 — the single highest-leverage file in the repo.

### Phase 2 — needs-wiring (50 × M)

These stand in for DB graphs / full service chains; converting needs real fixtures or seeded data. Hotspots:

| Sites | File |
|---:|---|
| 7 | `apps/api/src/services/session/session-cache.test.ts` |
| 4 | `apps/api/src/routes/retention.test.ts` |
| 3 | `apps/api/src/routes/homework.test.ts` · `apps/api/src/routes/quiz.test.ts` |
| 2 | `learner-profile` · `revenuecat-webhook-handler` · `snapshot-aggregation` · `mobile dictation/complete` · `mobile recaps/[recapId]` · `mobile session/index` · `mobile create-profile` · `mobile ModeSwitcher` |

### Phase 3 — the 2 hard ones (L)

- `apps/api/src/services/session/session-cache.test.ts:16` — mocks the **entire `@eduagent/database` module** via `createDatabaseModuleMock()`. Converting means standing up a real (test) DB layer; arguably a legitimate `gc1-allow` candidate. Decide explicitly.
- `apps/mobile/src/app/(app)/session/index.test.tsx:365` — mocks `../../../components/session` wholesale (ChatShell + `getModeConfig`, `QuotaExceededCard`, `SessionTimer`, …). Large surface; convert incrementally.

---

## Files in this audit

- **`README.md`** — this summary + burn-down plan.
- **`catalog.csv`** — all 716 sites: `file, line, category, burndownClass, effort, borderline, specifier, mocked, note, verifierNote`. Filter `category == internal-violation` for the actionable 153.
- **`findings.md`** — methodology, category definitions, the gc1-allow conflation in depth, external-boundary notes, verifier-correction stats, and limitations.

## Suggested next step

This is a clean candidate for a tracked ZDX work item ("GC6 burn-down: 153 unescaped internal mocks, 101 trivial"). Phase 1 is mechanical and low-risk; it could be a single sweep PR per top-cluster file. Note CLAUDE.md's "Sweep when you fix" rule: a burn-down PR should pair with the existing GC1 ratchet so the count only goes down.
