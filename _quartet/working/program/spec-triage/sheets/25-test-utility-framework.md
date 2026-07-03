DOC: docs/plans/2026-05-12-shared-test-utility-framework-plan.md (2026-05-12, 18K)

CLAIMS:
- Build 8 shared test-utility families (U1-U8: Inngest step runner, Inngest transport capture, API integration DB harness, local DB runner, LLM provider fixtures, external fetch/provider helpers, mobile render harness, native-shim catalog) to make internal-mock cleanup mechanical.
- Phase 0-4 (governance, Inngest foundation, integration/external boundaries, mobile screen harness, ratchets+inventory) all shipped and verified with proof tests.
- Doc's own 2026-06-27 banner: framework U1-U8 shipped; "3 follow-up cleanup batches" (migrating existing suites onto the framework) not started.
- A forward-only ratchet (`integration-mock-guard.test.ts`) should prevent new internal mocks in `*.integration.test.ts` files; `KNOWN_OFFENDERS` should trend to zero.
- A companion inventory doc (`docs/plans/2026-05-12-internal-mock-cleanup-inventory.md` + generator script) tracks bare/internal mock counts over time.

TECH VALIDITY: none broken — every utility file the doc names exists at the path it names, and the companion inventory doc's own final status entry is consistent with what's on disk.

IMPLEMENTED:
- U1 `createInngestStepRunner` — complete. `apps/api/src/test-utils/inngest-step-runner.ts`.
- U2 `createInngestTransportCapture` — complete. `apps/api/src/test-utils/inngest-transport-capture.ts`.
- U5 LLM provider fixtures — complete. `apps/api/src/test-utils/llm-provider-fixtures.ts`.
- U7 mobile render harness — complete. `apps/mobile/src/test-utils/screen-render.tsx`.
- U8 native-shim catalog — complete. `apps/mobile/src/test-utils/native-shims.ts`.
- Phase 4 ratchet — complete and green. `apps/api/src/test-utils/integration-mock-guard.test.ts`; `KNOWN_OFFENDERS` is an empty `Set` (line 30) — confirmed by direct read.
- Local DB runbook — complete. `docs/runbooks/local-db-testing.md`.
- Companion inventory doc — moved to `docs/_archive/plans/done/2026-05-12-internal-mock-cleanup-inventory.md` (and its CSV). Its own final status line: "bare-mock backlog collapsed from 131 → 23 → 6 → **0**" (2026-05-19 to 2026-05-25), explicitly recommends "archive this plan as done; keep the CSV + generator script as a living tracking artifact that GC6 consumes opportunistically." This has already happened (file is under `_archive/plans/done/`).
- "3 follow-up cleanup batches" (Batch 1: ratchet integration tests onto U1/U2; Batch 2: session-completion Inngest; Batch 3: mobile query/profile) — the doc calls these "not started" as of 2026-06-27, but this framing is stale: the companion inventory doc explicitly supersedes the batch-based plan-driven sweep with the GC6 "boy-scout rule" (AGENTS.md: remove internal mocks any time you touch a test file), i.e. the batches were deliberately abandoned in favor of an ambient ratchet, not "not started." Spot-check: `rg -l "jest\.mock\('\.\.?/"` still finds 139 files under `apps/api/src` and 23 under `apps/mobile/src` with relative-path internal mocks — this is the GC6 backlog the inventory doc itself flags as intentionally not plan-swept ("gc1-allow"/"pattern-a" annotated, tracked for opportunistic burn-down, not blocking).

CANDIDATE WIs: none extracted for this row (Pre-bucket C, zero candidates) — no fates to assign.

VERDICT: valid (framework build was fully executed; the "follow-up cleanup batches" language in this doc's own status banner is what's stale, not the underlying work — the companion inventory doc already reconciled this by superseding batch-sweeps with the GC6 ambient ratchet and self-archiving as done)

MVP RECOMMENDATION: out of scope for V2 launch triage — this is finished infra, not open work. No action needed against the north star (Config T V2 shell / Google Play / RevenueCat Plus-only / V1 fallback). Recommend: update this doc's own 2026-06-27 banner to point at the archived inventory doc's resolution (framework done, batches intentionally replaced by GC6, not "not started") so the next reader doesn't re-open dead work; that's a docs-hygiene edit, not a WI.

CONFIDENCE: high — every named utility file exists on disk, the ratchet's `KNOWN_OFFENDERS` is empty and I read it directly, and the companion inventory doc has already been formally archived with a self-consistent "done" verdict. No decidable questions — this row does not need a Zuzka or operator ruling, just a doc-status correction (optional, low priority).
