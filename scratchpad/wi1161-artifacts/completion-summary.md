## What was done:

Fixed `GET /v1/account/export` 500-ing under identity-v2: `generateExportV2` was parsing the raw v2 `subscription` row against the legacy-named export schema. Landed via PR #1640 (squash, commit 04d134d0e). This was the last code blocker (alongside WI-1145) for the WI-867 IDENTITY_V2_ENABLED collapse.

## What changed:

- `apps/api/src/services/identity-v2/export-v2.ts` — the `subscriptions` export section now maps the v2 `subscription` row to the legacy export shape BEFORE `dataExportSubscriptionRowSchema.parse()`: `organizationId→accountId`, `planTier→tier`, `periodStartAt→currentPeriodStart`, `periodEndAt→currentPeriodEnd`; the v2-only `payerPersonId`/`storeProductId`/`storePlatform` columns are dropped (not part of the fixed `DataExport` contract); the rest pass through. Mirrors the explicit field-mapping the `account`/`familyLinks` sections in the same file already use. Root cause: the raw v2 row keys (`organizationId`/`planTier`/`periodStartAt`) do not satisfy the schema's required legacy names (`accountId`/`tier`/`currentPeriodStart`), so `tier`+`accountId` came back undefined → ZodError → 500. Single crashing site (only `subscriptions` runs `.parse()`; `quotaPools`/`topUpCredits` use bare `serializeDates`).
- `apps/api/src/services/identity-v2/export-v2.integration.test.ts` — added an UNGATED `generateExportV2` regression (`describeIfDb`, not `IDENTITY_POST_DROP`-gated) that seeds the minimal v2 graph (no `subjects` row) and asserts the mapped legacy-named fields; runs in the standard CI api-integration lane. Also corrected the pre-existing post-drop suite's latent assertion (asserted the raw `organizationId` instead of the mapped `accountId`/`tier`).

## Verification:

Red-green-revert verified locally against the journaled-chain `tests` DB: pre-fix the new test fails with a ZodError at `export-v2.ts:249`; post-fix it passes (200-equivalent, mapped `accountId`/`tier`/`currentPeriod*`). PR #1640 all 5 REQUIRED checks green (main / API Quality Gate / Merge completeness / Playwright web smoke / run-smoke); mergeable=MERGEABLE, state=UNSTABLE (advisory-only). claude-review APPROVED ("surgical and correct, no issues"). api typecheck green; pre-push clean (27 suites / 948 tests). The fix removed the export suite from the advisory Flag-ON integration fail list (net positive). No eval (serialization, no LLM prompt).

## Caveats / Follow-ups:

- WI-1161's own PR CI runs PRE-collapse (legacy export path → required-green); the v2 fix's binding verification is the WI-867 post-rebase post-collapse CI across all suites.
- The advisory Flag-ON integration lane stays red on `alias-merge-v2.integration.test.ts` + `inngest-quota-reset.integration.test.ts` — NEITHER in this diff (exactly `export-v2.ts` + its test), so they are pre-existing 44-gap residuals, not a regression from this change.
- Codex P1 on #1640 ("include v2 `payerPersonId`/`storeProductId`/`storePlatform` in the export") was ruled INVALID-FOR-SCOPE (the `DataExport` contract is intentionally identical to legacy = parity, not regression; expanding a GDPR Art-15 export is an ADR-class product/legal decision, not a 500-fix). Tracked as follow-up WI-1162 (Spike, P3, origin WI-1161, owner export-contract/compliance).
