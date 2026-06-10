# Archived memories

Memory files retired from `.claude/memory/` during the Harness Hygiene memory-tidy
(WI-387, executing the WI-531 disposition table). **Archived, not deleted** — kept here
for provenance/recovery because each rule's durable content either moved to a canonical
home or was ruled stale. Full per-file rationale: the WI-531 disposition table in
`_wip/identity-foundation/2026-06-09-wi-531-pipeline-rule-memory-handoff.md`.

These files are **not** loaded as memory (outside `.claude/memory/`) and their `MEMORY.md`
index lines were removed.

## Batch 1 — 2026-06-10 (operator-directed, pre-WI-387-claim)

Pipeline-rule cluster (WI-531 `DELETE` rows) + already-extracted PR memories + two
resolved/stale entries.

| File | Disposition | Home / reason |
|---|---|---|
| feedback_agents_commit_push | COVERED | AGENTS.md § Git Commits + `/zdx-core:commit` own-work scope |
| feedback_partial_staging_stash | STALE | R1 fixed by WI-450/D1 (pre-commit staged-only) |
| feedback_commit_skip_failing | COVERED | `/zdx-core:commit` failure ladder |
| feedback_pr_required_checks | EXTRACTED | AGENTS.md § PR Review & CI Protocol (WI-531, `93d19f3b2`) |
| feedback_testing_no_mocks | COVERED | AGENTS.md § Code Quality Guards (GC1/GC6) |
| feedback_e2e_never_skip | STALE | change-class E2E gate supersedes the blanket rule |
| feedback_e2e_release_gate | COVERED | `.agents/skills/e2e/SKILL.md` § Failure Triage |
| project_commit_skill_drift | STALE | resolved by WI-388 (`SKIP_SKILLS` now empty) |
| project_ci_infrastructure | STALE | self-documenting (ci.yml) + false post-WI-450 pre-commit claim |
| project_sync_script_extension | STALE | `sync-agent-docs.mjs` retired by WI-386 |
| feedback_batch_pr_fixes | EXTRACTED | AGENTS.md § Required Validation (WI-455, `511e4aeac`) |
| feedback_verify_full_ci | EXTRACTED | AGENTS.md § Required Validation (WI-455, `511e4aeac`) |
| feedback_no_pr_unless_asked | EXTRACTED | AGENTS.md § Pull Requests (WI-398/G8) |
| feedback_use_gh_cli_for_prs | EXTRACTED | AGENTS.md § Pull Requests (WI-398/G8) |
| google_play_publishing | STALE | resolved-blocker tombstone (account available 2026-05-15) |
| project_apple_enrollment | STALE | resolved-blocker tombstone (account available 2026-05-15) |
| feedback_persona_vs_role | STALE | names removed `personaFromBirthYear` (persona-fossil-guard forbids reintroduction) |

**Held back (NOT archived):** `feedback_nx_reset_before_commit` — **KEEP in place** (was a
WI-531 `HOLD`). The `@nx/enforce-module-boundaries` eslint project-graph footgun is a
different cache from WI-451's TS6305 fix, so it is genuinely uncovered. Reclassified out of
WI-387 into its own tracked follow-up **WI-561** (blocked-by WI-388): extract to a
cross-runtime CI-troubleshooting doc or archive, after the WI-388 CI proof.

## Batch 2 — 2026-06-10 (table-D `Archive` comb)

| File | Disposition | Home / reason |
|---|---|---|
| feedback_drizzle_transaction_cast | STALE | cast pattern (`tx as unknown as Database`) is live in 200+ code sites; memory duplicates what code already carries |
| feedback_notion_resolution_recording | STALE | rule fully owned by `.agents/skills/notion/SKILL.md` §§ "Done Requires Resolution" + "Regressions" |

## Batch 3 — 2026-06-10 (operator-confirmed triage decisions, workflow-verified)

Dispositions from the WI-387 triage workflow (results + per-file rationale:
`nexus _WIP/zdx-productionization/_state/2026-06-10-wi-387-memory-triage-results.md`),
operator-confirmed via the Decision column. Coverage claims verified against the
ratified counting roster (canon / ADRs / AGENTS.md / CONTEXT.md / spine trio) only.

| File | Disposition | Home / reason |
|---|---|---|
| billing-payments | COVERED | MMT-ADR-0004 (provenance note names this file as its source) + architecture.md:113 |
| project_deploy_safety | COVERED | AGENTS.md § Schema And Deploy Safety; its two residual factual claims were stale (CI uses drizzle-kit migrate; DEPLOY_ENV live in deploy.yml) |
| project_archon_spike_merge_rule | STALE | time-bounded process exception expired by its own sunset terms (consistency2 branch gone, PR #176 closed 2026-05-07) |
| feedback_comment_not_delete | SUPERSEDED | operator ruling 2026-06-10 (triage CONFLICT 1): AGENTS.md:334 clean-removal guard stands unqualified |
| feedback_homework_not_socratic | COVERED | PRD FR31 (PRD:1041) carries the full rule verbatim |
| project_dev_schema_drift_trap | MERGED | durable content (env naming-trap table + do-not-do list) absorbed into `project_schema_drift_pattern.md`; incident narrative + expired follow-ups archived here |
