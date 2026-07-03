## Completion summary

### What was done

Flipped `CONCEPT_CAPTURE_ENABLED` from `false` to `true` — a code-only feature-flag flip that makes the Challenge-Round concept-capture write path (`captureConceptMastery()`, gated at `apps/api/src/services/session/session-exchange.ts:974`) live-capable. The decision to flip was pre-evidenced: the deferral condition (identity baseline-reset tables landed + `profiles`→`person` FK repoint) is already satisfied on both staging and production.

The schema-hygiene half (schema-code FK repoint in `packages/database/src/schema/concept-mastery.ts` + new forward migration `0129`) was split into **WI-1288** at the coordinator's direction; this branch is deliberately code-flag-only.

### What changed

- `apps/api/src/services/concept-capture.ts` — `CONCEPT_CAPTURE_ENABLED = true`; header comment rewritten from parked-state to active-state, documenting the cleared deferral condition and the residual `CHALLENGE_ROUND_RUNTIME_ENABLED` gate.
- `apps/api/src/services/concept-capture.test.ts` — parked-guard test updated to a positive-state assertion (`toBe(true)`) per Tests-Must-Reflect-Reality; not weakened.
- `apps/api/src/services/concept-capture.integration.test.ts` — added a `person`-row seed + explicit `person` cleanup (mirroring `retrieval-events.integration.test.ts`) so the existing write-path round-trip test exercises the live path; forward-compatible with the FK→person state, harmless against the current FK→profiles CI DB.
- `tests/integration/profile-isolation.integration.test.ts` — RLS-suite comment updated (flag no longer false).
- `docs/architecture.md` — concept-grain mastery capture canon line updated in lockstep with the flag.

### Verification

- Live read-only SQL on stg + prd (`information_schema` / `pg_constraint` / `pg_policies`): no `profiles` table exists; `concepts.profile_id` and `concept_mastery.profile_id` FKs reference `person(id)`; RLS enabled with profile-isolation policies (migration 0125 / WI-1104); row counts 0/0. `CHALLENGE_ROUND_RUNTIME_ENABLED=false` on both, so the flip is presently inert there.
- `pnpm exec nx run api:typecheck` — green; `api:lint` — 0 errors.
- Unit: `concept-capture.test.ts` + `session-exchange-challenge-finalize.test.ts` pass with flag on.
- Integration (dev DB): `concept-capture.integration.test.ts` (write-path) passes; `session-exchange.integration.test.ts` (the mastery-verified path that now activates `captureConceptMastery`) 4/4 pass — no sibling seeder breaks.
- PR #1828: all required checks SUCCESS (API Quality Gate, main, Flag-ON integration, Merge completeness, run-smoke, Playwright web smoke, changes; ota-update SKIPPED). claude-review APPROVED (0 must-fix / 0 should-fix / 0 consider). CodeRabbit no findings. `mergeStateStatus=CLEAN`.

### Caveats / Follow-ups

- The flip is inert on stg/prod until Challenge Round runtime is separately enabled (`CHALLENGE_ROUND_RUNTIME_ENABLED`, currently false) — this WI does not enable that.
- Schema-code FK repoint + migration `0129` (idempotent DROP/ADD across the dev/stg/prd FK-name split) are tracked in **WI-1288** (schema hygiene + person-seeder sweep + in-seat schema review + operator deploy gate). The full 0129 SQL is preserved in WI-1288's acceptance criteria.
- PR #1828 is pushed and green but not merged (executor never merges) — awaiting review/close gate.
