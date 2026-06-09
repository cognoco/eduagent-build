---
title: Instruction Surface Disposition Matrix v1
date: 2026-06-09
status: WORKING CONTROL MATRIX - AGREED DEFAULTS, ROWS STILL REQUIRE VERIFICATION BEFORE LIVE EDITS
scope: agent-facing instruction surfaces in eduagent-build plus active ZDX/Harness pointers
owners: cross-stream QA for Identity Foundation + Harness Hygiene + ZDX lifecycle toolchain
---

# Instruction Surface Disposition Matrix v1

**Purpose.** This is the control document for the instruction-surface cleanup:
memory, agent doctrine, skills, commands, workflows, hooks/settings, and adjacent
ZDX/Harness surfaces. It extends Identity Foundation Phase J without pretending
that Phase J was the estate-wide cleanup.

**Durable Harness Hygiene entry point.**
`/Users/vetinari/nexus/_WIP/zdx-productionization/harness-hygiene-tracker.md`.
Cosmo remains authoritative for live per-WI state; this matrix carries QA
classification and cleanup sequencing.

**Bias.** Left-ratchet and harness-compensation rules start as obsolete unless
proven useful. Unique current material is extracted to its proper home before
the memory/instruction source is pruned. Historical interest alone is not a
reason to keep a file live.

## Inventory Snapshot

Captured 2026-06-09 from `/Users/vetinari/nexus/_dev/eduagent-build`.

| Surface class | Count / shape | Startup-loaded? | Primary owner | Default disposition |
|---|---:|---|---|---|
| Root agent doctrine | `AGENTS.md`, `CLAUDE.md` | Yes | `WI-386` | Converge: `AGENTS.md` source, `CLAUDE.md` adapter/import |
| Memory index + active files | 89 active `.claude/memory/*.md` incl. `MEMORY.md` at inventory start; 82 after B1/B2 pruning | Yes for index; topic files by link/load | `WI-387` after `WI-531` | Prune aggressively after extraction |
| Memory archive | 29 `.claude/memory/_archive/*.md` | No unless linked | `WI-387` | Purge unless a live reason remains |
| Claude commands | 23 `.claude/commands/my/*.md` | On command use | Harness/ZDX skills | Replace with skill or ZDX command stubs |
| Master skills | 45 `.agents/skills/**/SKILL.md` | On skill use | Repo-local skill owners | Master source; classify as canonical / overlay / obsolete |
| Generated Claude skills | 45 `.claude/skills/**/SKILL.md` | On skill use | `scripts/sync-skills.mjs` | Generated copies; edit `.agents` first except declared skips |
| Claude workflows | 7 `.claude/workflows/*` | On workflow use | Workflow owner / Identity K-L | Archive after outputs land; keep active K-L only while running |
| Claude settings/hooks | `.claude/settings.json`, `.claude/hooks/scope-keyword-check.sh` | Yes for hook | Harness Hygiene | Verify value; move durable policy to skills/hooks owner |
| ZDX config | `zdx-config.yaml` | By ZDX tools | ZDX lifecycle | Keep; candidate home for tool defaults |
| Harness tracker | `_WIP/zdx-productionization/harness-hygiene-tracker.md` | By coordinators | Harness Hygiene | Keep as routing pointer only |
| Identity WIP control docs | `_wip/identity-foundation/*.md` | By coordinators | Identity Foundation | Keep active control docs; archive dated handoffs when done |

## Disposition Vocabulary

| Disposition | Meaning |
|---|---|
| DELETE | Remove from live and archive paths; git history is enough |
| ARCHIVE | Move out of live startup paths because dated history still has real value |
| REPOINT | Replace body with a short pointer to canonical/current source |
| PROMOTE | Extract valid unique material to L0-L3 before pruning source |
| MOVE-OP | Move to an operational home such as a skill, runbook, ZDX snippet, hook, or commit primitive |
| KEEP | Retain because it is current, unique, visible to the right agents, and operationally useful |
| SPLIT | Separate durable doctrine from runtime-specific or incident-specific detail |
| VERIFY | Do not decide until current code/docs/Cosmo/Notion state is checked |

## Execution Batches

| Batch | Scope | Blocking rule | Output |
|---|---|---|---|
| B0 - already applied | Stale Phase-J fallout | Done in current QA stream | Removed live `Strictly 11+` memory; repointed stale routing memories; added `MMT-ADR-0018` pointer |
| B1 - no-blocker tombstones | Active memories whose content is already duplicated by current `AGENTS.md`/skills/runbooks or says only "resolved/vaulted/tracked elsewhere" | Must verify no unique current fact | DONE 2026-06-09 for 3 files: deleted `feedback_emulator_issues_doc.md`, `feedback_no_suppression.md`, `feedback_precommit_typecheck.md`; removed index links |
| B2 - only-home footguns | Expo Router bracket pathspecs, stash semantics, platform command traps, Notion query mode | Extract first | PARTIAL DONE 2026-06-09: commit/notion target homes already contained `feedback_git_pathspec_literal_brackets.md`, `feedback_git_stash_pop_kept.md`, `feedback_stash_untracked_protection.md`, and `feedback_notion_rest_for_queries.md`; deleted those memories and index links |
| B3 - harness left-ratchet | Commit/pre-commit/pre-push/CI/manual review rules in memory and doctrine | Wait for owning substrate where named | `WI-531` extracts, then `WI-387` prunes |
| B4 - agent-doc convergence | `AGENTS.md` / `CLAUDE.md` divergence | After `.agents -> .claude` transform and L2 rules placement | `WI-386` |
| B5 - generated/runtime surfaces | `.claude/skills`, `.claude/commands`, workflows, hooks/settings | Do not edit generated copies directly unless declared skip | Skills/workflows normalized after B3/B4 |
| B6 - archive purge | `.claude/memory/_archive` | After live index is clean | `WI-387` terminal cleanup |

## Doctrine And Config Surfaces

| Surface | Current role | Likely home | Action | Blocker / owner |
|---|---|---|---|---|
| `AGENTS.md` | Codex-facing repo doctrine, skills table, memory precedence, output conventions, engineering rules | Single repo rule source after convergence | KEEP now; become source for shared doctrine | `WI-386` after `WI-449` |
| `CLAUDE.md` | Claude-facing doctrine, richer runtime/product/harness sections | Adapter/import of `AGENTS.md` plus Claude-only notes | SPLIT/REPOINT; no hand-maintained drift | `WI-386` |
| Output conventions | Opaque-ID expansion + closing roundup | Trial repo-local doctrine; possible later L1 snippet | KEEP as eduagent trial | Deferred L1 candidate |
| Profile Shapes section | `CLAUDE.md` current implementation note | Current implementation docs or AGENTS after convergence | KEEP until convergence; not target identity canon | `WI-386` |
| Challenge Round mastery/routing policy | `CLAUDE.md` durable behavior rule | Code/docs or product/architecture canon | VERIFY; PROMOTE/REPOINT if still current | Stream 2 / Challenge Round docs |
| `docs/project_context.md` | Repo-specific implementation context | L3 project context; not shadow canon | KEEP; audit for duplicate canon over time | Stream 2 |
| `zdx-config.yaml` | ZDX Work Items DB, setup, validate, plan dir | ZDX config | KEEP; use as target for tool defaults where appropriate | ZDX lifecycle |
| `.claude/settings.json` | Claude Code settings; disables built-in git instructions; prompt hook wiring | Runtime adapter | KEEP; review after commit skill convergence | Harness Hygiene |
| `.claude/hooks/scope-keyword-check.sh` | Prompt hook forcing scope enumeration on high-risk state surfaces | Hook or skill policy if value proven | VERIFY; left-ratchet suspicion, but may encode real PR-376 lesson | Harness Hygiene / deep-scope skill |

## Skill And Command Surfaces

| Surface | Current role | Likely home | Action | Blocker / owner |
|---|---|---|---|---|
| `.agents/skills/**` | Master repo-local skills for Codex and sync source for Claude | Canonical repo skill source | KEEP; edit masters first | Skill owners |
| `.claude/skills/**` | Generated Claude copies plus declared skips/extras | Generated adapter | REPOINT operationally to `.agents`; direct edits only for `commit` skip or Claude-only extras | `scripts/sync-skills.mjs`, `WI-454` |
| `.claude/skills/commit` | Declared skip; richer Claude-specific commit skill | Commit CORE / repo overlay | MOVE-OP/converge after CORE adoption | `WI-447`, `WI-388`, `WI-455` |
| `.claude/skills/my/e2e-infra.md` | Claude-only extra, not mirrored from `.agents` | E2E/build skill or archive | VERIFY; MOVE-OP if still valuable | E2E/build skill owners |
| `.claude/commands/my/commit.md` | Stub delegating to commit skill | Command adapter | KEEP until command replacement exists | Commit skill |
| `.claude/commands/my/commit-old.md`, `commit-own.md` | Legacy/variant commit commands | Commit CORE | DELETE/ARCHIVE after CORE adoption; left-ratchet risk | `WI-388`, `WI-455` |
| `.claude/commands/my/build.md`, `e2e.md`, `maestro-testing.md`, `notion.md`, `learning-evolution-next.md`, `deep-bugfixing.md` | Skill command stubs/adapters | Corresponding skills | KEEP if thin; ensure no duplicate doctrine | Skill owners |
| `.claude/commands/my/run-tests.md`, `run-e2e.md`, `run-full-e2e.md`, `select-HI-tests.md` | Test command shortcuts | Change-class / e2e skill | VERIFY; likely MOVE-OP/DELETE as validation contract matures | `WI-452`, `WI-456` |
| `.claude/commands/my/fix-ci.md`, `ship.md`, `worktree-bugfix.md`, `dispatch.md` | Workflow command stubs | ZDX lifecycle skills | VERIFY against ZDX replacements; delete stale bespoke scaffolding | Harness Hygiene |
| `.claude/commands/my/full-codebase-review.md`, `parallel-code-review.md`, `sweep-mocks.md`, `fix-notion-bugs.md`, `chrome-interaction.md`, `call.md` | Specialized old workflows | Skills/workflows/archive | VERIFY; archive if superseded | Stream 2 / tool owners |
| `scripts/sync-skills.mjs` | Additive `.agents -> .claude` sync | Skill sync primitive | KEEP; current source of truth for generated copies | `WI-454` may replace/extend |

## Workflow Surfaces

| Surface | Current role | Likely home | Action | Blocker / owner |
|---|---|---|---|---|
| `.claude/workflows/identity-foundation-k-l-consolidation.js` | Active K-L consolidation workflow | Identity Foundation K/L control | KEEP while K/L in flight; archive with output when landed | Identity K/L |
| `.claude/workflows/identity-foundation-k-l-consolidation.RUNBOOK.md` | Runbook for active K-L workflow | Identity K/L runbook or archive | KEEP while K/L in flight; move/link to `_wip` if durable | Identity K/L |
| `.claude/workflows/identity-foundation-k-l-render.mjs` | Renderer for K-L output | Identity K/L tooling | KEEP while K/L in flight; archive after output lands | Identity K/L |
| `audit-a-vs-b-track-*.js` | Older A-vs-B audit workflows | Historical audit trail | ARCHIVE after confirming outputs are captured | Identity Phase B/F history |
| `full-codebase-review-15-lens.js` | Broad review workflow | Review skill / archive | VERIFY; likely MOVE-OP or ARCHIVE | Review skill |

## Memory Index And Archive

| Surface | Current role | Likely home | Action | Blocker / owner |
|---|---|---|---|---|
| `.claude/memory/MEMORY.md` | Startup index plus a few inline facts | Thin index only | PRUNE aggressively; no inline canon/history | `WI-387` last |
| Active memory files | 88 topic files after B0 cleanup | Pointers or operational notes | Row-level dispositions below | `WI-531` before broad `WI-387` |
| `.claude/memory/_archive/*.md` | 29 historical files | Git history unless specifically cited | PURGE review; archive only with live reason | `WI-387` |
| Archived links in `MEMORY.md` | A few archived entries still startup-visible | Git history or current docs | Remove live index links unless needed | `WI-387` |

## Feedback Memories

| Surface | Current claim | Likely home | Action | Blocker / owner |
|---|---|---|---|---|
| `feedback_agent_checkpoint_cadence.md` | Long-running subagents checkpoint every 4 min | Agent coordination / shared-memory stream | VERIFY; possibly KEEP short | Shared-memory activity |
| `feedback_agents_commit_push.md` | Subagents commit only from isolated worktrees | Commit CORE / concurrency policy | MOVE-OP then REPOINT/DELETE | `WI-447`, `WI-531` |
| `feedback_audit_check_deleted_concepts.md` | Check whether apparent violations are deleted concepts | Review/audit skill | MOVE-OP; keep only if no better home | Review skill / Stream 2 |
| `feedback_autonomous_speccing.md` | Decide small spec choices autonomously | User preference | KEEP if current | none |
| `feedback_batch_pr_fixes.md` | Batch PR review fixes before push | PR/ship/fix-ci workflow | MOVE-OP or DELETE if superseded | `WI-398` |
| `feedback_build_dedup.md` | Avoid duplicate EAS builds after merge | Build skill/runbook | MOVE-OP | build skill / `WI-455` |
| `feedback_comment_not_delete.md` | Comment out unreleased UI instead of deleting | User preference, scoped | VERIFY; keep only scoped to UI feature hiding | none |
| `feedback_commit_skip_failing.md` | Classify pre-commit failures and skip unrelated files | Commit CORE | Presume obsolete; MOVE-OP only if CORE needs it | `WI-447`, `WI-450` |
| `feedback_doppler_secrets.md` | All secrets via Doppler; mobile env sync | Secrets governance / AGENTS | VERIFY; REPOINT to current secrets model | Secrets governance |
| `feedback_drizzle_transaction_cast.md` | Drizzle tx cast pattern for services | Architecture/data-access docs or tech skill | PROMOTE/MOVE-OP | Stream 2 |
| `feedback_e2e_cascade_root_cause.md` | Treat same-day Notion E2E cascades as one infra bug | E2E runbook / Notion skill | MOVE-OP | E2E runbook |
| `feedback_e2e_never_skip.md` | Always run E2E after features | Validation policy | Presume obsolete as blanket rule; replace with change-class policy | `WI-456` |
| `feedback_e2e_release_gate.md` | Release-blocking E2E loop | E2E runbook | MOVE-OP / REPOINT | E2E runbook |
| `feedback_e2e_runbook.md` | Read E2E runbook before E2E/emulator work | E2E skill/runbook | REPOINT minimal pointer or DELETE if skill covers | E2E skill |
| `feedback_eas_no_retry.md` | Never retry EAS build without dashboard/root cause | Build skill/runbook | MOVE-OP | build skill |
| `feedback_emulator_issues_doc.md` | Old emulator doc vaulted; runbook authoritative | none; runbook already exists | DELETE - applied B1 2026-06-09 | done |
| `feedback_fast_iteration.md` | User rejects 60-min feedback loops | User preference / validation-scope contract | KEEP short; ensure not used to bypass gates | `WI-456` |
| `feedback_git_pathspec_literal_brackets.md` | Use literal pathspec for Expo Router `[id]` files | Commit skill footguns / git runbook | DELETE - target home already in `.agents/skills/commit/SKILL.md` + `references/failure-recovery.md`; applied B2 2026-06-09 | done |
| `feedback_git_stash_pop_kept.md` | Stash pop kept means incomplete apply | Commit skill footguns | DELETE - target home already in `.agents/skills/commit/SKILL.md` + `references/failure-recovery.md`; applied B2 2026-06-09 | done |
| `feedback_homework_not_socratic.md` | Homework mode explains/verifies, not Socratic | Product/LLM behavior canon | PROMOTE/REPOINT | Stream 2 |
| `feedback_human_override_everywhere.md` | AI-driven screens need human override | UX/product canon or DoR | PROMOTE/REPOINT | Stream 2 / DoR |
| `feedback_just_do_it.md` | Clear commands should execute without confirmation | User preference | KEEP | none |
| `feedback_llm_prompt_injection_surfacing.md` | LLM user-A to user-B text is injection vector | Security/LLM architecture docs | PROMOTE/REPOINT | Stream 2 |
| `feedback_never_force_add_child.md` | No app-wide add-child gate | Product/UX canon | PROMOTE/REPOINT or KEEP pointer | Stream 2 |
| `feedback_never_lock_topics.md` | Prerequisites advisory, never hard locks | Product/learning canon | PROMOTE/REPOINT | Stream 2 |
| `feedback_never_switch_branch.md` | Never switch current branch without explicit permission | Agent doctrine / commit/worktree policy | KEEP short in AGENTS; move detail to worktree skill | `WI-386` |
| `feedback_no_jargon_kid_language.md` | Plain UI language for all ages | UX/copy canon | PROMOTE/REPOINT | Stream 2 |
| `feedback_no_ota_unless_asked.md` | Do not run OTA unless asked | User preference / build skill | KEEP short or MOVE-OP | build skill |
| `feedback_no_pr_unless_asked.md` | Never create PR unless asked | User preference / AGENTS | KEEP short | none |
| `feedback_no_suppression.md` | No eslint-disable/suppression | Duplicate engineering rule | DELETE - applied B1 2026-06-09 | done |
| `feedback_notion_resolution_recording.md` | Record resolution when closing Notion items | Notion/work-items skill | MOVE-OP | work-items skill |
| `feedback_notion_rest_for_queries.md` | REST for exhaustive Notion queries | Notion skill | DELETE - target home already in `.agents/skills/notion/SKILL.md`; applied B2 2026-06-09 | done |
| `feedback_nx_reset_before_commit.md` | Nx cache causes phantom lint failures | Nx cache work item / dev runbook | MOVE-OP or DELETE after fix | `WI-451` |
| `feedback_ota_env_vars.md` | OTA env vars do not read `eas.json` profile env | Build/OTA runbook | MOVE-OP | build skill |
| `feedback_partial_staging_stash.md` | Partial commits need stash trick | Commit CORE | Presume obsolete; extract only if still needed | `WI-447`, `WI-531` |
| `feedback_persona_vs_role.md` | Use role resolver, not birth-year persona | Identity/current-code pointer | KEEP pointer for now | J1 handled |
| `feedback_pr_required_checks.md` | Missing PR checks can be branch-protection drift | PR/CI protocol | MOVE-OP | `WI-398`, `WI-452` |
| `feedback_precommit_typecheck.md` | Run tsc + lint before commit | Duplicate/left-ratchet | DELETE - applied B1 2026-06-09 | done |
| `feedback_quiet_defaults_over_friction.md` | Quiet defaults over surveillance/friction | Product/UX canon | PROMOTE/REPOINT | Stream 2 |
| `feedback_stash_untracked_protection.md` | Use `--keep-index -u` to protect untracked files | Commit CORE footgun | DELETE - target home already in `.agents/skills/commit/SKILL.md` + `references/failure-recovery.md`; applied B2 2026-06-09 | done |
| `feedback_testing_no_mocks.md` | Avoid internal mocks; GC1 ratchet | CI/quality docs | MOVE-OP; delete memory if covered | `WI-450`, `WI-452` |
| `feedback_testing_tracking_only.md` | During exploratory testing, report consolidated results | User preference / QA style | KEEP | none |
| `feedback_use_gh_cli_for_prs.md` | Prefer `gh` CLI for PR checks/reviews | PR protocol / GitHub skill | MOVE-OP or KEEP short | GitHub skill |
| `feedback_use_sonnet_agents.md` | Prefer Sonnet subagents for cost/speed | User preference | KEEP if current | none |
| `feedback_verify_full_ci.md` | On CI failure, run full validation | Left-ratchet / CI-repair workflow | MOVE-OP or DELETE if change-class policy replaces | `WI-398`, `WI-456` |
| `feedback_voice_is_critical.md` | Voice input/output core to product | Product canon | PROMOTE/REPOINT | Stream 2 |

## Project / Reference / User Memories

| Surface | Current claim | Likely home | Action | Blocker / owner |
|---|---|---|---|---|
| `billing-payments.md` | Mobile IAP via RevenueCat, Stripe dormant | Billing architecture/product docs | PROMOTE/REPOINT | Billing stream |
| `doppler-secrets.md` | Real DB tests need Doppler secrets | Secrets/test runbook | VERIFY; REPOINT/MOVE-OP | Secrets governance |
| `google_play_publishing.md` | Google Play account available | Store publishing tracker/docs | VERIFY then DELETE/REPOINT | Store stream |
| `load-database-env-windows-hardcode.md` | Windows-only Doppler probe | Test-utils/runbook or code fix | VERIFY/MOVE-OP | Test infra |
| `market_language_pivot.md` | English UI, language teaching active, consent pointer | Product/i18n/compliance docs | SPLIT; consent already repointed by J1 | Stream 2 |
| `nativewind-windows.md` | NativeWind Windows patches | Native dev runbook | MOVE-OP/REPOINT | Dev runbook |
| `pricing_dual_cap.md` | Free/Plus caps; routing now pointer-only | Pricing canon + model register | REPOINT/PROMOTE pricing later | Pricing/router |
| `project_agent_doc_and_memory_architecture_revisit.md` | Agent-doc and shared-memory architecture revisit | Shared-memory stream + `WI-386` | REPOINT; remove stale script references | Shared-memory activity, `WI-386` |
| `project_apple_enrollment.md` | Apple Developer account available | Store publishing tracker/docs | VERIFY then DELETE/REPOINT | Store stream |
| `project_archon_spike_merge_rule.md` | `.archon/`-only changes can direct-merge | Archon spike state | VERIFY; likely DELETE if spike over | Archon stream |
| `project_book_generation_pass.md` | Book/topic-map generation quality gate | LLM eval runbook | MOVE-OP/REPOINT | LLM eval docs |
| `project_brand_dark_first.md` | Teal/lavender, dark-first brand | Brand/product canon | PROMOTE/REPOINT | Stream 2 |
| `project_ci_infrastructure.md` | CI, Nx Cloud, path filters, E2E APK cache | CI docs | VERIFY; likely REPOINT | `WI-452` |
| `project_clerk_email_verification_fallback.md` | Clerk token-template fallback behavior | Auth runbook/architecture | MOVE-OP/REPOINT | Auth docs |
| `project_clerk_key_environments.md` | Clerk key alignment by environment | Auth runbook | MOVE-OP/REPOINT | Auth docs |
| `project_commit_skill_drift.md` | Commit skill drift and sync skip | Commit CORE/adoption state | MOVE-OP then DELETE/REPOINT | `WI-447`, `WI-388` |
| `project_deploy_safety.md` | Deploy uses migrations, not push | Deploy docs | REPOINT/MOVE-OP | Deploy docs |
| `project_dev_schema_drift_trap.md` | Dev schema drift fix path | DB runbook | MOVE-OP/REPOINT | DB docs |
| `project_eas_build.md` | EAS build config/issues | Build skill/runbook | MOVE-OP/REPOINT | build skill |
| `project_eas_update_ota.md` | OTA implemented and operational notes | Build/OTA docs | VERIFY then REPOINT/MOVE-OP | build skill |
| `project_enduser_session_pass.md` | Live end-user LLM quality gate | LLM eval runbook | MOVE-OP/REPOINT | LLM eval docs |
| `project_eval_llm_harness.md` | Eval-LLM harness details | Eval docs/runbook | MOVE-OP/REPOINT | LLM eval docs |
| `project_eval_llm_signal_metrics.md` | Signal distribution regression guard | Eval docs/CI roster | MOVE-OP/REPOINT | `WI-452` |
| `project_expo_web_preview.md` | Expo web preview launch target | Dev/testing runbook | MOVE-OP/REPOINT | Devex docs |
| `project_fingerprint_pnpm_mismatch.md` | EAS fingerprint policy issue | Build docs | VERIFY then REPOINT/MOVE-OP | build skill |
| `project_freeform_library_filing_decision.md` | Ask Anything library filing decision | Product canon | PROMOTE/REPOINT | Stream 2 |
| `project_identity_foundation_decisions.md` | Identity Foundation pointer | Identity docs/INDEX/CANONICAL-SET | KEEP as pointer until shared-memory design | J1 handled |
| `project_inngest_staging.md` | Staging Inngest sync URL | Deploy/Inngest runbook | MOVE-OP/REPOINT | Deploy docs |
| `project_known_bug_patterns.md` | Silent fallbacks + React timing gaps | Review/debugging skill | MOVE-OP/REPOINT | Review skill |
| `project_language_assessments_production_first.md` | Language reviews must test production behavior | Product/LLM eval docs | PROMOTE/REPOINT | Stream 2 |
| `project_language_pedagogy.md` | `four_strands` mode active | Product/learning canon | PROMOTE/REPOINT | Stream 2 |
| `project_llm_source_provenance.md` | Private source provenance and audit rules | LLM architecture/eval docs | PROMOTE/REPOINT | LLM architecture |
| `project_nx_expo_plugin_bug.md` | Nx Expo plugin stack overflow workaround | Dev runbook if still current | VERIFY; likely DELETE if stale | Dev infra |
| `project_playwright_e2e_setup.md` | Playwright E2E commands and seed secret caveat | E2E runbook | MOVE-OP/REPOINT | E2E docs |
| `project_product_roles_students_any_age.md` | Identity/audience role pointer | Identity canon + nav docs | KEEP as pointer for now | J1 handled |
| `project_revenuecat_setup.md` | RevenueCat setup status | Billing/store tracker | VERIFY then REPOINT/DELETE | Billing/store |
| `project_schema_drift_pattern.md` | Push-to-migrate drift diagnosis | DB runbook | MOVE-OP/REPOINT | DB docs |
| `project_session_lifecycle_decisions.md` | Wall-clock time, silence, hard caps | Product canon | PROMOTE/REPOINT | Stream 2 |
| `project_sync_script_extension.md` | Claims two sync scripts incl. absent doc sync script | `WI-386` / sync design | VERIFY then DELETE/REPOINT | `WI-386` |
| `project_themekey_removed.md` | No root key/remount or root opacity animation | UI architecture/runbook/guard | PROMOTE/MOVE-OP | UI docs |
| `reference_notion_workspace.md` | Notion workspace, tracker IDs, REST access | Notion skill / zdx-config | VERIFY then MOVE-OP/REPOINT | Notion skill |
| `user_device_small_phone.md` | User tests on Galaxy S10e | User preference | KEEP | none |

## Harness Hygiene Live Status Pointer

From the tracker on 2026-06-09:

- `WI-447` - commit CORE primitive - done and green-proven.
- `WI-450` - pre-commit slim - review/delivered on `harness-hygiene`.
- `WI-451` - Nx cache correctness - review/delivered on `harness-hygiene`; tracker now recommends `WI-452` next, then `WI-388`.
- `WI-531` - extract pipeline-rule memory cluster - Wave 5, blocks `WI-387`.
- `WI-387` - memory tidy - hard-pinned LAST.
- `WI-530` - Harness Hygiene exit-gate WP - gates `WI-533`, the eduagent Phase-P precondition.

## Audit Checklist For Each File/Rule

- [ ] Identify the exact claim/rule, not just the file.
- [ ] Classify the claim: canon, operational, preference, workstream state,
      incident rationale, tombstone, or stale contradiction.
- [ ] Locate higher-priority source: code, docs/INDEX, ADR, canon, register,
      runbook, skill, hook, CI, Cosmo item, or current user instruction.
- [ ] If left-ratchet/harness: start from DELETE and require proof to keep.
- [ ] If unique: choose PROMOTE, MOVE-OP, or KEEP with a named owner/home.
- [ ] If retained live: ensure it is visible to the right runtime(s).
- [ ] If duplicated intentionally: document the operational reason.
- [ ] If archived: verify no live index or startup path still loads it as law.
- [ ] If purged: ensure no unique current rule is lost.
- [ ] Record disposition in the matrix before editing files.

## Immediate Execution Queue

1. **B1 micro-tombstone cleanup - DONE 2026-06-09.** Verified
   `feedback_emulator_issues_doc.md`, `feedback_no_suppression.md`, and
   `feedback_precommit_typecheck.md` against current AGENTS/CLAUDE/runbook
   surfaces; removed the live memory files and index links.
2. **B2 extraction prep - PARTIAL DONE 2026-06-09.** Verified the four candidate
   footgun memories already had target homes in `.agents/skills/commit/SKILL.md`,
   `.agents/skills/commit/references/failure-recovery.md`, and
   `.agents/skills/notion/SKILL.md`; removed those duplicate memory files and
   index links. Continue B2 for platform/build/E2E footguns.
3. **B3 harness cluster handoff.** Feed commit/pre-commit/pre-push memory rows to
   `WI-531`; do not broadly prune them in this stream before extraction.
4. **B5 command/skill verification.** Diff `.claude/commands/my/*` against
   `.agents/skills/*` and ZDX replacements; mark thin adapters vs obsolete
   scaffolding.
5. **B6 archive purge plan.** Only after live memory is clean, enumerate `_archive`
   files still cited by live docs/memory and propose purge/archive retention.
