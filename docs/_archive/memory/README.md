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

**Held back (NOT archived):** `feedback_nx_reset_before_commit` — WI-531 `HOLD`. The
`@nx/enforce-module-boundaries` eslint project-graph footgun is a different cache from
WI-451's TS6305 fix, so it is genuinely uncovered; retire only after the WI-388 CI proof.

## Batch 2 — 2026-06-10 (table-D `Archive` comb)

| File | Disposition | Home / reason |
|---|---|---|
| feedback_drizzle_transaction_cast | STALE | cast pattern (`tx as unknown as Database`) is live in 200+ code sites; memory duplicates what code already carries |
| feedback_notion_resolution_recording | STALE | rule fully owned by `.agents/skills/notion/SKILL.md` §§ "Done Requires Resolution" + "Regressions" |
