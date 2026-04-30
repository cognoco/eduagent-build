# EduAgent Project Memory

## Implementation Status

- [project_implementation_phase.md](_archive/project_implementation_phase.md) — Epics 0-16 COMPLETE. LLM tuning phase COMPLETE (all 4 agents merged).
- [project_session_lifecycle_decisions.md](project_session_lifecycle_decisions.md) — Wall-clock for users, active time internal. Adaptive silence. Hard caps removed.

## Active Work (2026-04-30)

- Active branch: **`proc-optimization`**. Phase 3 LLM tuning COMPLETE (all 4 agents merged).
- [project_llm_audit_2026_04_18.md](project_llm_audit_2026_04_18.md) — Three audit specs in docs/specs/: personalization, reliability/UX, response envelope. 9 prompt surfaces mapped.
- [project_llm_marker_antipattern.md](project_llm_marker_antipattern.md) — 5 marker/JSON-in-text patterns. F1.2 hotfix shipped. Plan `docs/plans/2026-04-19-bucket-a-envelope-migration.md` (Bucket A).
- [project_eval_llm_harness.md](project_eval_llm_harness.md) — `apps/api/eval-llm/` + `pnpm eval:llm`. All 9 flows wired (exchanges added in 002f5bad).
- [project_eval_llm_signal_metrics.md](project_eval_llm_signal_metrics.md) — Layer 1 signal-distribution regression guard. `emitsEnvelope` flag + `--check-baseline`/`--update-baseline`. Restored 2026-04-21 after concurrent-edit loss.
- [project_onboarding_new_dimensions.md](project_onboarding_new_dimensions.md) — conversationLanguage (mandatory), interestContext, pronouns. Spec `docs/specs/2026-04-19-onboarding-new-dimensions.md` (Bucket C).
- [project_f8_memory_source_refs.md](project_f8_memory_source_refs.md) — Struggle/StrengthEntry provenance back-links. Spec `docs/specs/2026-04-19-memory-sources-f8.md` (Bucket C).
- [project_parent_visibility_spec.md](project_parent_visibility_spec.md) — Two specs 2026-04-18: parent privacy/RLS + progress highlights. Pending implementation.
- [project_ux_review_pass.md](project_ux_review_pass.md) — Home timeout nav, topic features, consent offline, progressive disclosure DONE. Hierarchy flattening under evaluation.
- [project_summary_draft_backup_deferred.md](project_summary_draft_backup_deferred.md) — Local draft autosave shipped `DRAFT-BULLETPROOF-01` (2026-04-23). Server-side mirror deferred 2026-04-24 over volume concerns; design options already mapped.
- [project_language_pedagogy.md](project_language_pedagogy.md) — four_strands pedagogy, vocabulary CRUD, CEFR levels.
- [project_deploy_safety.md](project_deploy_safety.md) — deploy.yml uses drizzle-kit migrate (not push --force) for prod.
- [project_eas_update_ota.md](project_eas_update_ota.md) — OTA IMPLEMENTED. JS-only changes deploy in ~5 min.

## Product Constraint — Strictly 11+

Two production dead-code branches removed 2026-04-19 in commit `970a82a5`: `AgeBracket.child` (unreachable for 11+ users) and dictation `getLiteraryTheme` ≤7 + ≤10 branches (fairy tales, Narnia). Eval harness fixtures updated to 5 profiles aged 11-17.

## Known Issues

- [project_nx_expo_plugin_bug.md](project_nx_expo_plugin_bug.md) — @nx/expo/plugin stack overflow on Windows. Run Jest/eslint directly.
- [project_open_bugs.md](project_open_bugs.md) — No P0/P1. BUG-359/397/311/237 fixed 2026-04-15. EP15-C2/C3 CLOSED 2026-04-19.
- [project_known_bug_patterns.md](project_known_bug_patterns.md) — Systemic patterns: silent fallbacks + React state timing gaps.
- [project_schema_drift_pattern.md](project_schema_drift_pattern.md) — push→migrate transition silently skips columns. Fix dev: `db:push:dev`.
- [project_dev_schema_drift_trap.md](project_dev_schema_drift_trap.md) — `mentomate-api-dev` "column does not exist" → `db:push:dev` + `db:generate`. Neon "staging" ≠ dev Worker's DB.
- [project_expo_router_pollution.md](_archive/project_expo_router_pollution.md) — Helpers under `app/(app)/` treated as routes. Fix: `_components/`, `_hooks/` dirs.

## Auth

- [project_clerk_key_environments.md](project_clerk_key_environments.md) — Clerk key alignment table. Must match end-to-end per environment.

## Pre-Launch Action Items

- [project_prod_approval_gate.md](project_prod_approval_gate.md) — GitHub Environment protection rules missing for production.
- [project_deploy_config_open.md](project_deploy_config_open.md) — Production deploy targeting unverified (user-flagged 2026-03-28).

## Critical Architecture Decisions

- [billing-payments.md](billing-payments.md) — Mobile IAP (RevenueCat), Stripe dormant for future web. Epic 9 COMPLETE.
- [pricing_dual_cap.md](pricing_dual_cap.md) — Free: 10/day + 100/month. Plus: 700/month, no daily limit.
- [market_language_pivot.md](market_language_pivot.md) — English UI only. Language TEACHING active (four_strands). GDPR-everywhere.
- [project_themekey_removed.md](project_themekey_removed.md) — NEVER use key={themeKey} OR Animated.View opacity on root layout.
- [feedback_drizzle_transaction_cast.md](feedback_drizzle_transaction_cast.md) — PgTransaction → Database cast pattern for transactions.

## Workflow Preferences

- Commit early + push after every commit. Never batch large changes.
- [feedback_never_switch_branch.md](feedback_never_switch_branch.md) — NEVER switch branches unless user explicitly asks.
- [feedback_parallel_agents.md](feedback_parallel_agents.md) — Parallel agents in same tree, no worktrees. Coordinator commits sequentially.
- [feedback_fast_iteration.md](feedback_fast_iteration.md) — 60-min feedback loops unacceptable. CI gates, but optimize speed.
- [feedback_fix_verification_rules.md](feedback_fix_verification_rules.md) — Changed ≠ verified. Break tests, finding IDs, no silent recovery.
- [feedback_sweep_for_same_bug.md](feedback_sweep_for_same_bug.md) — After fixing a bug, sweep codebase for same pattern.
- [feedback_just_do_it.md](feedback_just_do_it.md) — Clear action commands = execute immediately, don't gate on confirmations.
- [feedback_autonomous_speccing.md](feedback_autonomous_speccing.md) — Decide small stuff yourself, only ask on genuinely big trade-offs.
- [feedback_agents_commit_push.md](feedback_agents_commit_push.md) — Subagents never commit by default; coordinator commits via `/commit`. Exception: user-instructed one-off subagent commits are OK.
- [feedback_no_pr_unless_asked.md](feedback_no_pr_unless_asked.md) — NEVER create a PR unless explicitly asked.
- [feedback_no_ota_unless_asked.md](feedback_no_ota_unless_asked.md) — NEVER run eas update (OTA) unless user asks.
- [feedback_use_sonnet_agents.md](feedback_use_sonnet_agents.md) — Use Sonnet for subagents where possible; reserve Opus for deep reasoning.
- [feedback_partial_staging_stash.md](feedback_partial_staging_stash.md) — Pre-commit tests full working tree; stash in-progress files before partial commits.
- [feedback_stash_untracked_protection.md](feedback_stash_untracked_protection.md) — Always `--keep-index -u` when stashing; `-u` protects untracked files from lint-staged destruction.
- [feedback_commit_skip_failing.md](feedback_commit_skip_failing.md) — If pre-commit fails on some files, unstage them, commit+push what passes, fix failures after.
- [feedback_testing_tracking_only.md](feedback_testing_tracking_only.md) — When testing flows, track silently — surface flows tested + bugs at the end, not play-by-play.

## Android SDK & Build

- Windows username `ZuzanaKopečná` contains `č` — breaks native executables/JNI.
- Emulator/ADB at `C:\Android\Sdk`, Doppler CLI at `C:\Tools\doppler\doppler.exe`.
- [project_eas_build.md](project_eas_build.md) — EAS Build config, OTA operational, NX Cloud connected, Sentry upload disabled.
- [project_fingerprint_pnpm_mismatch.md](project_fingerprint_pnpm_mismatch.md) — Fingerprint policy fails in pnpm monorepo. Using appVersion policy.
- [project_ci_infrastructure.md](project_ci_infrastructure.md) — NX Cloud, path filters, E2E APK caching, Husky pre-commit.

## Testing Infrastructure

- [project_playwright_e2e_setup.md](project_playwright_e2e_setup.md) — Playwright E2E: must use `doppler run -c stg`, seed secret, Clerk token placeholder

## Deployment & Secrets

- [feedback_doppler_secrets.md](feedback_doppler_secrets.md) — All secrets via Doppler. EXPO_PUBLIC vars synced via `pnpm env:sync`.
- [feedback_ota_env_vars.md](feedback_ota_env_vars.md) — Manual OTA must set target env vars explicitly.
- [project_inngest_staging.md](project_inngest_staging.md) — Inngest sync URL is `/v1/inngest` (not `/inngest`). Staging synced 2026-04-17.

## Store Publishing — BOTH BLOCKED (2026-03-27)

- [project_apple_enrollment.md](project_apple_enrollment.md) — Apple enrollment pending since ~2026-03-13.
- [google_play_publishing.md](google_play_publishing.md) — Account flagged/disabled 2026-03-26, appeal in progress.
- [project_revenuecat_setup.md](project_revenuecat_setup.md) — RevenueCat project created, store connections blocked.

## Brand & UX Decisions

- [project_brand_dark_first.md](project_brand_dark_first.md) — Teal primary + lavender secondary. No accent picker. Dark default.
- [project_multiple_coaching_cards.md](project_multiple_coaching_cards.md) — Coaching cards REMOVED. Intent cards in place.

## Persona Architecture (Epic 12 — COMPLETE, ThemeContext cleaned 2026-04-15)

- [project_persona_removal.md](project_persona_removal.md) — personaType DB enum removed. Tokens flat by colorScheme.
- [feedback_persona_vs_role.md](feedback_persona_vs_role.md) — Server-side: use family_links role, not birthYear age.

## Core Learning Philosophy

- [feedback_never_lock_topics.md](feedback_never_lock_topics.md) — NEVER lock/block topics. Prerequisites advisory.
- [feedback_never_force_add_child.md](feedback_never_force_add_child.md) — Never force add-child. Solo/skip path always available for parent accounts.
- [feedback_human_override_everywhere.md](feedback_human_override_everywhere.md) — Every AI-driven screen must allow human override.
- [feedback_quiet_defaults_over_friction.md](feedback_quiet_defaults_over_friction.md) — Default to quiet, infer from sustained behavior, surface controls only when sought. Surveillance and friction are both UX bugs.
- [feedback_homework_not_socratic.md](feedback_homework_not_socratic.md) — Homework: explain + verify, NOT Socratic.
- [feedback_no_jargon_kid_language.md](feedback_no_jargon_kid_language.md) — No app jargon. Plain language for all ages.
- [feedback_voice_is_critical.md](feedback_voice_is_critical.md) — Voice input AND output critical — kids don't type.

## Development Process & Feedback

- [feedback_spec_before_code.md](feedback_spec_before_code.md) — Spec before code. Use BMAD commands.
- [feedback_spec_failure_modes.md](feedback_spec_failure_modes.md) — Every spec needs Failure Modes table.
- [feedback_five_root_causes.md](feedback_five_root_causes.md) — 5 systemic root causes.
- [feedback_comment_not_delete.md](feedback_comment_not_delete.md) — Comment out, don't delete unreleased UI features.
- [feedback_testing_no_mocks.md](feedback_testing_no_mocks.md) — Prefer real solutions; don't add new `jest.mock()` unless existing pattern requires it. External-boundary mocks (LLM API, Inngest framework) OK.
- [feedback_precommit_typecheck.md](feedback_precommit_typecheck.md) — Run tsc + lint before committing.
- [feedback_e2e_never_skip.md](feedback_e2e_never_skip.md) — Never skip E2E tests.
- [feedback_batch_pr_fixes.md](feedback_batch_pr_fixes.md) — Batch PR fixes, validate locally, push once.
- [feedback_emulator_issues_doc.md](feedback_emulator_issues_doc.md) — ALWAYS read e2e-emulator-issues.md before emulator work.
- [feedback_eas_no_retry.md](feedback_eas_no_retry.md) — NEVER retry eas build without checking dashboard first.
- [feedback_build_dedup.md](feedback_build_dedup.md) — After merge/build trigger, wait 3 min + check before triggering.
- [feedback_fix_root_cause.md](feedback_fix_root_cause.md) — Fix actual root cause, not symptoms.
- [feedback_no_suppression.md](feedback_no_suppression.md) — No eslint-disable. Fix code or improve lint rule.
- [feedback_run_integration_tests.md](feedback_run_integration_tests.md) — ALWAYS run integration tests locally before committing API changes.
- [feedback_adversarial_review_patterns.md](feedback_adversarial_review_patterns.md) — Body double-consumption, classify-before-format, dead code cleanup.
- [feedback_llm_prompt_injection_surfacing.md](feedback_llm_prompt_injection_surfacing.md) — LLM reads user A → surfaces to user B = injection vector.
- [feedback_verify_full_ci.md](feedback_verify_full_ci.md) — On CI failure, run full validation.
- [feedback_thorough_investigation.md](feedback_thorough_investigation.md) — NEVER take shortcuts in codebase analysis.
- [feedback_verify_before_declaring_done.md](feedback_verify_before_declaring_done.md) — Never declare a fix done without testing it first.
- [feedback_verify_before_marking_done.md](feedback_verify_before_marking_done.md) — Never mark bugs Done in Notion unless 100% confident.
- [feedback_e2e_cascade_root_cause.md](feedback_e2e_cascade_root_cause.md) — 20+ same-day Notion bugs with "Cascading X" in Found In = ONE infra bug. Fix upstream, don't close N individually.
- [feedback_git_pathspec_literal_brackets.md](feedback_git_pathspec_literal_brackets.md) — Expo Router `[id].tsx`: git treats `[...]` as glob, use `:(literal)` prefix.
- [feedback_nx_reset_before_commit.md](feedback_nx_reset_before_commit.md) — NX cache causes phantom `@nx/enforce-module-boundaries` errors. Run `pnpm exec nx reset` to clear.
- [feedback_git_stash_pop_kept.md](feedback_git_stash_pop_kept.md) — `git stash pop` "stash entry is kept" = apply was INCOMPLETE. Never drop without verifying with `git stash show --stat` first.

## User Profile

- [user_device_small_phone.md](user_device_small_phone.md) — Tests on Galaxy S10e (5.8"). Check small-screen layout.

## Reference & Tooling

- [reference_notion_workspace.md](reference_notion_workspace.md) — Notion MCP often unavailable; use REST API via `doppler.exe`. Bug Tracker DB: `b8ce802f...`.
- [project_expo_web_preview.md](project_expo_web_preview.md) — `.claude/launch.json` `mobile` target. Cold bundle ~18s. Auth-walled past sign-in.
- [nativewind-windows.md](nativewind-windows.md) — pnpm patchedDependencies + metro forceWriteFileSystem.
- [project_template_repo.md](project_template_repo.md) — Reusable SaaS mobile template extraction plan.
- [feedback_notion_rest_for_queries.md](feedback_notion_rest_for_queries.md) — Always REST API for exhaustive Notion queries.
- [feedback_notion_resolution_recording.md](feedback_notion_resolution_recording.md) — Record resolution on Done items. Never reopen.

## Custom Skills

- `/e2e`, `/ship`, `/fix-ci`, `/dispatch`, `/notion`, `/build`, `/commit` — all operational
- Husky pre-commit: `tsc --build` (incremental) + lint-staged + surgical tests

## Cross-Project Assets

- `~/.claude/CLAUDE.md` — PR protocol, Architecture Playbooks, Doppler rule
- `~/.claude/playbooks/payment-access-system.md` — Reusable payment/billing discovery questionnaire

## Archived

Resolved/historical memories in `_archive/`. Use `git log --grep` for context on past issues.
- [project_cr_124_scope.md](_archive/project_cr_124_scope.md) — CR-124-SCOPE session-recap IDOR closed via scoped repo + break tests (3 commits on proxy-parent-fix).
- [project_epic15_code_review.md](_archive/project_epic15_code_review.md) — ALL Criticals+Importants CLOSED 2026-04-19. C2 test coverage filled (220 tests).
- [project_web_flow_bugs.md](_archive/project_web_flow_bugs.md) — All code-level web bugs FIXED. WEB-02 swept (33 screens). goBackOrReplace mandatory.
