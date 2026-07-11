# Mentomate Project Memory

## Implementation Status

- [project_session_lifecycle_decisions.md](project_session_lifecycle_decisions.md) — Wall-clock for users, active time internal. Adaptive silence. Hard caps removed.

## Shepherding & Cosmo Workflow

- **Quartet mechanics** → `_quartet/_quartet-wip/quartet-findings.md` (2026-07-01). **Cosmo WI finalization** → `_wip/umbrella-program/cosmo-finalization-guide.md` (2026-06-20).
- [project_cosmo_wi_project_relation_misfiling.md](project_cosmo_wi_project_relation_misfiling.md) — Nexus-context captures inherit the Nexus Project; VERIFY genuine misfiling before repointing — estate-machinery items are often correctly Nexus; never repoint to defeat the guard.
- [project_prg14_agent_instructions_lane.md](project_prg14_agent_instructions_lane.md) — Repo CI/merge gotchas: docs-PR `paths-ignore` blocks the required `main` check; merge-on-UNSTABLE ok for advisory-red; `session/index.test.tsx` ambient flake.
- [feedback_bg_while_true_watcher_is_write_only.md](feedback_bg_while_true_watcher_is_write_only.md) — bg while-true poll loops never wake you (notify only on EXIT); use Monitor or an until-loop; Monitor lags — direct-read at decision boundaries.
- [feedback_orchestrator_liveness_and_mcp_independence.md](feedback_orchestrator_liveness_and_mcp_independence.md) — Liveness deadlines/probes for shepherd lanes; Notion MCP outage never stops work (bun CLIs + REST). Canon: `orchestrator-protocol.md` on Nexus main.
- [feedback_clacks_state_files_must_be_gitignored.md](feedback_clacks_state_files_must_be_gitignored.md) — Tracked clacks `_state/*.jsonl` reverted by concurrent resets; gitignore landed; superseded by Supabase substrate (WS-50).
- [feedback_never_auto_pick_wi_301.md](feedback_never_auto_pick_wi_301.md) — Never claim, land, or merge WI-301 autonomously.
- [feedback_concurrent_cosmo_prep_collision_guard.md](feedback_concurrent_cosmo_prep_collision_guard.md) — Cosmo snapshots stale in minutes under parallel sessions; fan-out briefs that write Cosmo need a pre-write collision guard (Modified + live claim; skip-and-report).
- [feedback_rtk_zsh_heredoc_python_mangling.md](feedback_rtk_zsh_heredoc_python_mangling.md) — Quote-dense inline python via `rtk bash -lc` heredoc breaks at parse time; Write script to scratchpad + `rtk python3 <file>` instead.
- [project_mentomate_program_roadmap.md](project_mentomate_program_roadmap.md) — Program-manager role + PGM-1 roadmap page in Cosmo (swimlanes, gates, rulings queue).

## Identity Foundation & V2 Shell

- [project_identity_foundation_decisions.md](project_identity_foundation_decisions.md) — Pointer to ratified identity/policy/router/safety ADRs + `docs/registers/llm-models/`; runway in `_wip/identity-foundation/`.
- [feedback_s6_deferred_irreversible.md](feedback_s6_deferred_irreversible.md) — S6 (V2 cutover & deletions) DEFERRED + IRREVERSIBLE; never autonomous; state that S6 removes the flag-flip rollback before any destructive step.

## Known Issues

- [project_nx_expo_plugin_bug.md](project_nx_expo_plugin_bug.md) — @nx/expo/plugin stack overflow on Windows. Run Jest/eslint directly.
- [project_known_bug_patterns.md](project_known_bug_patterns.md) — Systemic patterns: silent fallbacks + React state timing gaps.
- [project_schema_drift_pattern.md](project_schema_drift_pattern.md) — push→migrate transition silently skips columns; "column does not exist" → `db:push:dev` + `db:generate:dev`.
- [project_ci_db_journaled_chain_divergence.md](project_ci_db_journaled_chain_divergence.md) — CI tests DB lacks prod's out-of-chain FK repoints; verify migration premise before authoring schema migrations.
- [project_claude_review_self_referential_401.md](project_claude_review_self_referential_401.md) — PR editing `claude*.yml` workflows shows benign RED claude-review (self-referential 401).
- [project_conflicting_pr_blocks_ci.md](project_conflicting_pr_blocks_ci.md) — CONFLICTING PR → zero github-actions runs; check `gh pr view --json mergeable` FIRST; fix = rebase.
- [feedback_flag_collapse_breaks_legacy_pinned_unit_mocks.md](feedback_flag_collapse_breaks_legacy_pinned_unit_mocks.md) — Flag collapse mass-breaks legacy-pinned mock-DB unit tests; diagnose by crash-site histogram.
- [feedback_nx_reset_before_commit.md](feedback_nx_reset_before_commit.md) — Stale NX graph cache → false module-boundaries errors on commit; `pnpm exec nx reset` first.

## Auth

- [project_clerk_key_environments.md](project_clerk_key_environments.md) — Clerk key alignment table. Must match end-to-end per environment.
- [project_clerk_email_verification_fallback.md](project_clerk_email_verification_fallback.md) — Token-template drift can omit `email_verified`; API falls back to Clerk Backend API.

## Critical Architecture Decisions

- [project_eval_llm_harness.md](project_eval_llm_harness.md) — `apps/api/eval-llm/` + `pnpm eval:llm`; FLOWS array in `index.ts` is authoritative.
- [project_eval_llm_signal_metrics.md](project_eval_llm_signal_metrics.md) — Signal-distribution regression guard: `emitsEnvelope` + `--check-baseline`/`--update-baseline`.
- [project_llm_source_provenance.md](project_llm_source_provenance.md) — Private source provenance, sourceAudit metadata, 0.88-gated general knowledge.
- [pricing_dual_cap.md](pricing_dual_cap.md) — Free: 10/day + 100/month. Plus: 700/month; routing → `MMT-ADR-0014` + llm-models register.
- [market_language_pivot.md](market_language_pivot.md) — English UI only; language TEACHING active (four_strands); consent/age-floor → compliance register.
- [project_themekey_removed.md](project_themekey_removed.md) — NEVER use key={themeKey} OR Animated.View opacity on root layout.

## Workflow Preferences

- [feedback_verify_code_not_memory_or_docs.md](feedback_verify_code_not_memory_or_docs.md) — Code questions: verify against current source (cite file:line) BEFORE answering.
- [feedback_verify_claims_against_source_before_canon.md](feedback_verify_claims_against_source_before_canon.md) — Read SOURCE before writing implementation claims into canon; surface corrections, never quietly patch.
- [project_zdx_bundle_guard_family.md](project_zdx_bundle_guard_family.md) — /cosmo:bundle defect family (absorb destroys unchecked fields; 4th: formation leaves Description/AC properties empty). Enumerate what a child carries before deciding what a bundle copies.
- Commit early + push after every commit. Never batch large changes.
- [feedback_never_switch_branch.md](feedback_never_switch_branch.md) — NEVER switch branches unless user explicitly asks.
- [feedback_fast_iteration.md](feedback_fast_iteration.md) — 60-min feedback loops unacceptable. CI gates, but optimize speed.
- [feedback_just_do_it.md](feedback_just_do_it.md) — Clear action commands = execute immediately, don't gate on confirmations.
- [feedback_autonomous_speccing.md](feedback_autonomous_speccing.md) — Decide small stuff yourself; ask only on genuinely big trade-offs.
- [feedback_code_review_should_fix.md](feedback_code_review_should_fix.md) — Valid should-fixes get fixed now; rule on validity, don't ask permission.
- [feedback_no_ota_unless_asked.md](feedback_no_ota_unless_asked.md) — NEVER run eas update (OTA) unless user asks.
- [feedback_testing_tracking_only.md](feedback_testing_tracking_only.md) — Track flow-testing silently; surface flows + bugs at the end.

## Android SDK & Build

- Windows: username `ZuzanaKopečná` breaks Maestro JNI (use `/c/tools/maestro/bin/maestro` + TEMP override); ADB at `C:\Android\Sdk`, Doppler at `C:\Tools\doppler\doppler.exe`. macOS/Linux: standard PATH.
- [project_eas_build.md](project_eas_build.md) — EAS Build config; NX Cloud disconnected; Sentry upload disabled.
- [project_eas_update_ota.md](project_eas_update_ota.md) — OTA IMPLEMENTED. JS-only changes deploy in ~5 min via expo-updates.

## Testing Infrastructure

- [project_playwright_e2e_setup.md](project_playwright_e2e_setup.md) — Playwright E2E: `doppler run -c stg`, seed secret, baseline 23m/48% (2026-05-14).
- [project_enduser_session_pass.md](project_enduser_session_pass.md) — Live API-level LLM quality gates incl. premium routing + source-audit checks.
- [project_book_generation_pass.md](project_book_generation_pass.md) — Live book/topic-map generation quality gate.

## Deployment & Secrets

- [feedback_doppler_secrets.md](feedback_doppler_secrets.md) — All secrets via Doppler. EXPO_PUBLIC vars via `pnpm env:sync`.
- [doppler-secrets.md](doppler-secrets.md) — Secret resolution: project `mentomate`, configs `dev/stg/prd`; wrap patterns.
- [project_inngest_staging.md](project_inngest_staging.md) — Inngest sync URL is `/v1/inngest` (not `/inngest`).
- [project_revenuecat_setup.md](project_revenuecat_setup.md) — RevenueCat project exists; store product/connection/webhook setup remains.

## Brand & UX Decisions

- [project_brand_dark_first.md](project_brand_dark_first.md) — Teal primary + lavender secondary. No accent picker. Dark default.
- [project_product_roles_students_any_age.md](project_product_roles_students_any_age.md) — Pointer: role/persona/login model → `docs/canon/identity/`; not a kids-only app.
- Coaching cards are LIVE: `BaseCoachingCard` in `ParentHomeScreen.tsx`; `coaching_card_cache` backs home.

## Core Learning Philosophy

- [project_language_pedagogy.md](project_language_pedagogy.md) — four_strands mode (alongside socratic); vocabulary CRUD, CEFR, language-progress routes.
- [project_freeform_library_filing_decision.md](project_freeform_library_filing_decision.md) — Pointer to `MMT-ADR-0021`: freeform Library filing at 5 exchanges.
- [project_language_assessments_production_first.md](project_language_assessments_production_first.md) — Language reviews test production/translation, not abstract summaries.
- [feedback_never_lock_topics.md](feedback_never_lock_topics.md) — NEVER lock/block topics. Prerequisites advisory (WI-587 ratified).
- [feedback_never_force_add_child.md](feedback_never_force_add_child.md) — Never force add-child; solo/skip path always available.
- [feedback_human_override_everywhere.md](feedback_human_override_everywhere.md) — Every AI-driven screen must allow human override.
- [feedback_quiet_defaults_over_friction.md](feedback_quiet_defaults_over_friction.md) — Quiet defaults; surveillance and friction are both UX bugs.
- [feedback_no_jargon_kid_language.md](feedback_no_jargon_kid_language.md) — No app jargon. Plain language for all ages.
- [feedback_voice_is_critical.md](feedback_voice_is_critical.md) — Voice input AND output critical — kids don't type.

## Development Process & Feedback

- [project_agent_doc_and_memory_architecture_revisit.md](project_agent_doc_and_memory_architecture_revisit.md) — Open: AGENTS.md profile + cross-agent memory architecture (Cortex = prior art).
- [feedback_audit_check_deleted_concepts.md](feedback_audit_check_deleted_concepts.md) — Before governance posture on violations, check if the concept was deleted by an epic.
- [feedback_llm_prompt_injection_surfacing.md](feedback_llm_prompt_injection_surfacing.md) — LLM reads user A → surfaces to user B = injection vector.
- [feedback_e2e_cascade_root_cause.md](feedback_e2e_cascade_root_cause.md) — 20+ same-day "Cascading X" bugs = ONE infra bug; fix upstream.
- [feedback_prepush_bail_masks_failures.md](feedback_prepush_bail_masks_failures.md) — Pre-push `--bail` + leading flake masks real fails; verify without --bail before SKIP_PRE_PUSH.
- [feedback_forward_ratchets_not_in_prepush.md](feedback_forward_ratchets_not_in_prepush.md) — Forward-only ratchets aren't in local pre-push; run `check-change-class.sh --run` before claiming CI-clean.
- [feedback_batch_merge_verify_main_green.md](feedback_batch_merge_verify_main_green.md) — After batch merge under strict=false, check main's own CI; green PRs can combine red.
- [feedback_fk_violation_not_rls_and_masked_step_bisect.md](feedback_fk_violation_not_rls_and_masked_step_bisect.md) — Integration FK-violation = parent genuinely absent, never role-leak; masked CI step invalidates run-history bisect.

## User Profile & Tooling

- [feedback_flow_testing_from_main.md](feedback_flow_testing_from_main.md) — For mobile flow-plan reruns and flow-status evidence.
- [user_device_small_phone.md](user_device_small_phone.md) — Tests on Galaxy S10e (5.8"). Check small-screen layout.
- [reference_notion_workspace.md](reference_notion_workspace.md) — Issue Tracker split: NEW bugs → Open `3598bce9...`; archive `b8ce802f...`.
- [project_expo_web_preview.md](project_expo_web_preview.md) — `.claude/launch.json` `mobile` target; auth-walled past sign-in.
- `/e2e`, `/ship`, `/fix-ci`, `/dispatch`, `/notion`, `/build`, `/commit` operational; `/e2e` OS-aware, default flow `app-launch-devclient.yaml`.
- Husky pre-commit: `tsc --build` (incremental) + lint-staged + surgical tests.
- `~/.claude/playbooks/payment-access-system.md` — reusable payment/billing discovery questionnaire.

## Archived

Resolved/historical memories in `_archive/` (implementation-phase, expo-router pollution, CR-124, Epic-15 review, web-flow bugs). Use `git log --grep` for past-issue context. Pre-launch GitHub-env rules + template-repo plan tracked in Notion.
