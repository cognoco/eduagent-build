**What was done:**
Reconciled the archived interaction-durability documentation with the current code path: SUBJECT-09 is closed by the later interview deletion plus per-topic async topic-probe extraction, not by the old interview Inngest Layer 3 plan.

**What changed:**
Added WI-516 supersession notes to the archived interaction-durability spec, the archived Layer 2 orphan-turn plan, the archived Layer 3 persist-curriculum plan, and the Slice 1.5 interview-deletion plan. The notes explain that `draft_status` values `completing` / `failed` and `onboarding_drafts.failure_code` remain only until the deferred Phase-2 drop of the whole `onboarding_drafts` table, avoiding a risky enum-recreation migration for dead interview state.

**Verification:**
- `git diff --check`
- `pnpm exec prettier --check docs/_archive/specs/Done/2026-05-01-interaction-durability.md docs/_archive/plans/done/2026-05-01-interaction-durability-layer-2-orphan-turns.md docs/_archive/plans/done/2026-05-01-interaction-durability-layer-3-inngest-persist-curriculum.md "docs/_archive/plans/done/app evolution plan/done/2026-05-07-slice1.5-pr1c-delete-interview-and-async-extraction.md"`
- `rg -n "Supersession note \(WI-516|WI-516 reconciliation" ...` confirmed the reconciliation notes are present.
- `rg -n "routes/interview|services/interview|interview-persist-curriculum|app/interview.ready_to_persist|onboarding/interview" apps/mobile/src apps/api/src packages/database/src packages/schemas/src` found only historical comments, not live route/service/function files.
- `rg -n "draftStatusEnum|failureCode|failure_code|completing|failed" packages/database/src/schema/sessions.ts apps/api/drizzle/0046_stormy_cassandra_nova.sql ...` confirmed the schema remnants being documented still exist.

**Caveats / Follow-ups:**
No code or database migration was made. The remaining real cleanup is the already-documented Phase-2 migration to drop `onboarding_drafts` after the coordinator/product gate confirms the quiet period and accepts the data-loss rollback posture.
