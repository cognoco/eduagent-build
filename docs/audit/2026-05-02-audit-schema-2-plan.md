# AUDIT-SCHEMA-2 — response-schema migration plan

**Filed:** 2026-05-02 by recon agent during artefact-consistency audit.
**Severity:** YELLOW-leaning-RED (escalated from "unclassified" after concrete enumeration).
**Status:** Plan only — no PRs opened yet.

## The finding (concrete, post-recon)

36 of 41 API route files (88%) call `c.json(result)` without runtime validation against a Zod response schema. This violates the CLAUDE.md non-negotiable: "`@eduagent/schemas` is the shared contract."

The contract is **not missing** — `@eduagent/schemas` already exports **22 response schemas across 13 schema files** (not ~50 as this plan originally stated; TYPES-1 recon 2026-05-02 enumerated all exports). Of those 22: 9 fit their target routes and are ready to wire, 3 billing response schemas also fit but are orphaned, 1 drifted (`feedbackResponseSchema` was missing `queued` — fixed in C1 P1/PR-01), and 6 have no matching route (LLM output or non-existent endpoints). Only `bookmarks.ts` calls `responseSchema.parse(...)` before `c.json(...)`. `assessments.ts` and `consent.ts` **import** schemas named `*ResponseSchema` but use them as input validators — the schemas are actually request-shaped (TYPES-1 F2; fixed by rename in C1 P4/PR-03). **Corrected PR scope (TYPES-2 2026-05-03):** PR 1 = 12 wraps (9 orphan-fit + 3 billing); PR 2 = schema renames for assessments+consent + author missing response schemas + SSE `streamErrorFrameSchema`.

TypeScript types still flow correctly via return-type inference and `satisfies` clauses, which is why this stayed invisible: the type-system report says "fine"; only runtime validation is missing.

## File-by-file classification (recon 2026-05-02)

| File | c.json count | Class | Notes |
|---|---|---|---|
| learner-profile.ts | 22 | RAW | Core profile data; impacts mobile home screen. **No matching response schema exists in `@eduagent/schemas`** — PR 1 must author one (TYPES-1 F3) |
| sessions.ts | 18 | RAW | Core learning flow; `.parse()` exists but only for Inngest events |
| dashboard.ts | 16 | RAW | Parent-facing analytics |
| billing.ts | 15 | RAW | Imports only **request** schemas (`checkoutRequestSchema`, `topUpRequestSchema`, `byokWaitlistSchema`, `familyAddProfileSchema`). The three **response** schemas (`checkoutResponseSchema`, `portalResponseSchema`, `cancelResponseSchema`) are in the package but orphaned (never imported) — all 3 fit and are ready to wire (TYPES-1 F5, TYPES-2 F1) |
| test-seed.ts | 13 | RAW | Test surface — lower priority |
| settings.ts | 12 | RAW | |
| retention.ts | 11 | RAW | |
| quiz.ts | 9 | RAW | |
| progress.ts | 8 | RAW | |
| interview.ts | 8 | RAW | `.parse()` is for SSE frames, not responses |
| consent.ts | 8 | RAW | Imports `consentResponseSchema` but doesn't use it |
| subjects.ts | 7 | RAW | |
| curriculum.ts | 7 | RAW | |
| books.ts | 7 | RAW | |
| onboarding.ts | 6 | RAW | |
| revenuecat-webhook.ts | 5 | RAW | `.safeParse()` is for input validation |
| profiles.ts | 5 | RAW | |
| dictation.ts | 5 | RAW | |
| vocabulary.ts | 4 | RAW | |
| snapshot-progress.ts | 4 | RAW | |
| notes.ts | 4 | RAW | |
| filing.ts | 4 | RAW | |
| assessments.ts | 4 | RAW | Imports schemas but doesn't use |
| parking-lot.ts | 3 | RAW | |
| celebrations.ts | 3 | TRIVIAL | Literal `{ celebrationUnlocked }` |
| **bookmarks.ts** | **3** | **VALIDATED** | Only file using `responseSchema.parse()` |
| auth.ts | 3 | RAW | |
| account.ts | 3 | RAW | |
| streaks.ts | 2 | RAW | |
| homework.ts | 2 | RAW | |
| feedback.ts | 2 | TRIVIAL | `{ ok: true }` returns |
| book-suggestions.ts | 2 | RAW | |
| topic-suggestions.ts | 1 | RAW | |
| support.ts | 1 | RAW | |
| stripe-webhook.ts | 1 | TRIVIAL | `{ received: true }` ack |
| resend-webhook.ts | 1 | TRIVIAL | Webhook ack |
| language-progress.ts | 1 | RAW | |
| health.ts | 1 | RAW | Literal `{ status, timestamp, llm }` |
| coaching-card.ts | 1 | RAW | |
| inngest.ts | 0 | ZERO | No c.json calls |
| consent-web.ts | 0 | ZERO | No c.json calls |

**Totals:** 36 RAW, 1 VALIDATED, 4 TRIVIAL, 0 MIXED, 2 ZERO. **88% gap.**

## Migration pattern (mechanical)

For each route file:

1. Identify whether a corresponding response schema already exists in `@eduagent/schemas`. Most do.
2. Wrap each `c.json(result)` with the corresponding schema's `.parse()`:
   ```ts
   // Before
   return c.json({ profile });

   // After
   import { learnerProfileResponseSchema } from '@eduagent/schemas';
   return c.json(learnerProfileResponseSchema.parse({ profile }));
   ```
3. If no schema exists for a response shape, define one in `@eduagent/schemas/src/[domain].ts` first (mirror the pattern in `bookmarks.ts`).
4. Don't touch TRIVIAL files — wrapping `{ ok: true }` is over-engineering.
5. Webhook handlers' `{ received: true }` acks fall under TRIVIAL too.

**Out-of-scope for this initiative:** behavioral changes, response shape changes, request validation (already handled via `zValidator`), error response shapes (separate concern).

## PR shape (proposed)

| PR | Scope | Goal | Effort |
|---|---|---|---|
| **PR 1** | Top-3 files: `learner-profile.ts`, `sessions.ts`, `dashboard.ts` (56 calls). Plus a custom ESLint rule that flags new bare `c.json(...)` without nearby `.parse()`. | Establish the pattern; prevent regression on future PRs. | ~3-4 hr |
| **PR 2** | Files 4-13 by call count: `billing.ts`, `test-seed.ts`, `settings.ts`, `retention.ts`, `quiz.ts`, `progress.ts`, `interview.ts`, `consent.ts`, `subjects.ts`, `curriculum.ts` (~98 calls) | Bulk sweep of the next-most-used surfaces | ~4 hr |
| **PR 3** | Remaining 23 RAW files (~78 calls) | Finish the sweep | ~3 hr |
| (Stretch) **PR 4** | Define any missing response schemas in `@eduagent/schemas` discovered during PRs 1-3 | Close the contract gap | TBD |

## Verification per-PR

- **No behavioral test changes expected.** If `responseSchema.parse(result)` throws, the existing route returned a shape that the schema didn't anticipate — that's a real bug, fix the schema or fix the response, do not loosen the schema to silence it.
- Run targeted tests for the changed route groups: `pnpm exec jest --findRelatedTests apps/api/src/routes/[file].ts --no-coverage`
- Run `pnpm exec nx run api:typecheck` and `pnpm exec nx run api:lint`
- Run integration tests for the changed surfaces (mobile may already exercise these via `apiClient` calls).

## Risks

| Risk | Mitigation |
|---|---|
| `responseSchema.parse(...)` throws in production for a payload the schema didn't allow → 500 to user | Use `safeParse` initially; log discrepancies; promote to throwing parse only after observation window. Or: schema-out-strict per file, with a runtime audit metric on each PR. |
| Existing schemas are wrong or outdated | First step in each PR is to read the existing schema and reconcile against actual responses. Schema fixes go in the same PR as their wrapping. |
| Mobile contract drift | Mobile already uses `@eduagent/schemas` types via `AppType` for type-checking. Adding runtime validation on the API side does not change the wire shape — only enforces it. |
| Performance overhead | Zod parse on every response. Acceptable for non-hot paths; benchmark hot paths (sessions stream, dashboard) before merging PR 1. |

## Why this is a separate initiative, not "Track C"

- 232 c.json calls across 36 files is too much for one PR
- Violates a CLAUDE.md non-negotiable, not a stylistic concern
- Has its own architectural decisions (safeParse vs parse; how to surface schema mismatches)
- Worth a Notion ticket or its own multi-PR thread, separate from the audit punch list once PR 1 lands

## Open decisions before PR 1

1. **`safeParse` + log vs. `parse` + throw?** Conservative path: safeParse + structured log + observability metric for ~1 week, then promote to throwing parse.
2. **Where does the lint rule live?** Custom `eslint-plugin-eduagent` (does that already exist?) or one-off rule in repo `.eslintrc`.
3. **Who owns the response-schema definitions when missing?** Whoever opens the PR for that file, or batched into the stretch PR 4.
