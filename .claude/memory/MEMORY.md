# Mentomate Project Memory

## Implementation Status

- [project_implementation_phase.md](_archive/project_implementation_phase.md) — Epics 0-16 COMPLETE. LLM tuning phase COMPLETE (all 4 agents merged).
- [project_session_lifecycle_decisions.md](project_session_lifecycle_decisions.md) — Wall-clock for users, active time internal. Adaptive silence. Hard caps removed.

## Identity Foundation (re-platform)

- [project_identity_foundation_decisions.md](project_identity_foundation_decisions.md) — Pointer to the ratified identity/policy-engine/router/safety ADRs + the `docs/registers/llm-models/` register. Current runway state lives in `_wip/identity-foundation/ROADMAP.md`; canon membership lives in `_wip/identity-foundation/CANONICAL-SET.md`.

## Known Issues

- [project_nx_expo_plugin_bug.md](project_nx_expo_plugin_bug.md) — @nx/expo/plugin stack overflow on Windows. Run Jest/eslint directly.
- [project_known_bug_patterns.md](project_known_bug_patterns.md) — Systemic patterns: silent fallbacks + React state timing gaps.
- [project_schema_drift_pattern.md](project_schema_drift_pattern.md) — push→migrate transition silently skips columns; `mentomate-api-dev` "column does not exist" → `db:push:dev` + `db:generate:dev`. Neon "staging" ≠ dev Worker's DB.
- [project_expo_router_pollution.md](_archive/project_expo_router_pollution.md) — Helpers under `app/(app)/` treated as routes. Fix: `_components/`, `_hooks/` dirs.

## Auth

- [project_clerk_key_environments.md](project_clerk_key_environments.md) — Clerk key alignment table. Must match end-to-end per environment.
- [project_clerk_email_verification_fallback.md](project_clerk_email_verification_fallback.md) — Clerk token-template drift can omit `email_verified`; API falls back to Clerk Backend API instead of expiring sessions.

## Pre-Launch Action Items

- GitHub Environment protection rules + deploy targeting — tracked in Notion (archived from memory 2026-05-04).

## Critical Architecture Decisions

- [project_eval_llm_harness.md](project_eval_llm_harness.md) — `apps/api/eval-llm/` + `pnpm eval:llm`. All 10 LLM flows wired. Fixture-driven snapshot harness for prompt builders.
- [project_eval_llm_signal_metrics.md](project_eval_llm_signal_metrics.md) — Layer 1 signal-distribution regression guard. `emitsEnvelope` flag + `--check-baseline`/`--update-baseline`.
- [project_llm_source_provenance.md](project_llm_source_provenance.md) — Private source provenance, sourceAudit metadata, and 0.88-gated general knowledge for ordinary rung 1-4 tutoring exchanges.
- [pricing_dual_cap.md](pricing_dual_cap.md) — Free: 10/day + 100/month. Plus: 700/month, no daily limit; model routing details live in `MMT-ADR-0014` + `docs/registers/llm-models/master.md`.
- [market_language_pivot.md](market_language_pivot.md) — English UI only. Language TEACHING active (four_strands). Consent/age-floor → `docs/compliance/identity-compliance-register.md` (canon).
- [project_themekey_removed.md](project_themekey_removed.md) — NEVER use key={themeKey} OR Animated.View opacity on root layout.

## Workflow Preferences

- Commit early + push after every commit. Never batch large changes.
- [feedback_never_switch_branch.md](feedback_never_switch_branch.md) — NEVER switch branches unless user explicitly asks.
- [feedback_agent_checkpoint_cadence.md](feedback_agent_checkpoint_cadence.md) — Long-running agents save durable checkpoints every 4 minutes; no git from subagents.
- [feedback_fast_iteration.md](feedback_fast_iteration.md) — 60-min feedback loops unacceptable. CI gates, but optimize speed.
- [feedback_just_do_it.md](feedback_just_do_it.md) — Clear action commands = execute immediately, don't gate on confirmations.
- [feedback_autonomous_speccing.md](feedback_autonomous_speccing.md) — Decide small stuff yourself, only ask on genuinely big trade-offs.
- [feedback_no_ota_unless_asked.md](feedback_no_ota_unless_asked.md) — NEVER run eas update (OTA) unless user asks.
- [feedback_use_sonnet_agents.md](feedback_use_sonnet_agents.md) — Use Sonnet for subagents where possible; reserve Opus for deep reasoning.
- [feedback_test_receipts.md](feedback_test_receipts.md) — Stale `.test-receipts/*` push-hook failures: record, verify, then commit receipt-only follow-up.
- [feedback_testing_tracking_only.md](feedback_testing_tracking_only.md) — When testing flows, track silently — surface flows tested + bugs at the end, not play-by-play.

## Android SDK & Build

- Windows username `ZuzanaKopečná` contains `č` — breaks Maestro JNI on Windows (use `/c/tools/maestro/bin/maestro` + TEMP override).
- Windows paths: Emulator/ADB at `C:\Android\Sdk`, Doppler at `C:\Tools\doppler\doppler.exe`. macOS/Linux: standard PATH.
- [project_eas_build.md](project_eas_build.md) — EAS Build config, OTA operational, NX Cloud disconnected (2026-06-01, IID-792), Sentry upload disabled.
- [project_eas_update_ota.md](project_eas_update_ota.md) — OTA IMPLEMENTED. JS-only changes deploy in ~5 min via expo-updates.

## Testing Infrastructure

- [project_playwright_e2e_setup.md](project_playwright_e2e_setup.md) — Playwright E2E: `doppler run -c stg`, seed secret, baseline 23m/48% pass (2026-05-14)
- [project_enduser_session_pass.md](project_enduser_session_pass.md) — Live API-level LLM quality gates: end-user pass plus Plus/Family premium-routing pass; includes private source-audit checks.
- [project_book_generation_pass.md](project_book_generation_pass.md) — Live book/topic-map generation quality gate upstream of tutoring sessions.

## Deployment & Secrets

- [feedback_doppler_secrets.md](feedback_doppler_secrets.md) — All secrets via Doppler. EXPO_PUBLIC vars synced via `pnpm env:sync`.
- [doppler-secrets.md](doppler-secrets.md) — Test secret resolution: project `mentomate`, configs `dev/stg/prd`. `DATABASE_URL` and friends needed by `*.test.ts` files that include integration paths. Archon's validate/push wrap via `doppler run`.
- [project_inngest_staging.md](project_inngest_staging.md) — Inngest sync URL is `/v1/inngest` (not `/inngest`). Staging synced 2026-04-17.

## Store Publishing

- [project_revenuecat_setup.md](project_revenuecat_setup.md) — RevenueCat project exists; remaining work is store product/connection/webhook setup.

## Brand & UX Decisions

- [project_brand_dark_first.md](project_brand_dark_first.md) — Teal primary + lavender secondary. No accent picker. Dark default.
- [project_product_roles_students_any_age.md](project_product_roles_students_any_age.md) — Pointer: role/persona/login model → `docs/canon/identity/` (ontology + prd Part 10); nav IA → navigation-contract/audience-matrix. Caution: not a kids-only app.
- Coaching cards REMOVED, intent cards in place (archived from memory 2026-05-04).

## Persona Architecture (Epic 12 — COMPLETE, ThemeContext cleaned 2026-04-15)


## Core Learning Philosophy

- [project_language_pedagogy.md](project_language_pedagogy.md) — four_strands pedagogy mode (alongside socratic). Vocabulary CRUD, CEFR levels, language-progress routes.
- [project_freeform_library_filing_decision.md](project_freeform_library_filing_decision.md) — Ask Anything saves sessions by default; Library filing is separate, auto-file when confident, keep-out-of-Library remains available.
- [project_language_assessments_production_first.md](project_language_assessments_production_first.md) — Language reviews must test production/translation/tiny exchanges, not abstract topic summaries or culture-ish "idea of a greeting" prompts.
- [feedback_never_lock_topics.md](feedback_never_lock_topics.md) — NEVER lock/block topics. Prerequisites advisory.
- [feedback_never_force_add_child.md](feedback_never_force_add_child.md) — Never force add-child. Solo/skip path always available for parent accounts.
- [feedback_human_override_everywhere.md](feedback_human_override_everywhere.md) — Every AI-driven screen must allow human override.
- [feedback_quiet_defaults_over_friction.md](feedback_quiet_defaults_over_friction.md) — Default to quiet, infer from sustained behavior, surface controls only when sought. Surveillance and friction are both UX bugs.
- [feedback_no_jargon_kid_language.md](feedback_no_jargon_kid_language.md) — No app jargon. Plain language for all ages.
- [feedback_voice_is_critical.md](feedback_voice_is_critical.md) — Voice input AND output critical — kids don't type.

## Development Process & Feedback

- [project_agent_doc_and_memory_architecture_revisit.md](project_agent_doc_and_memory_architecture_revisit.md) — Open: AGENTS.md/CLAUDE.md content profile + cross-agent memory architecture. Memories currently Claude-only; Cortex (Nexus repo) is prior art for shared memory.
- [feedback_audit_check_deleted_concepts.md](feedback_audit_check_deleted_concepts.md) — Before governance posture on rule violations, check if the concept was deleted by an epic. Literal grep misses aliases.
- [feedback_llm_prompt_injection_surfacing.md](feedback_llm_prompt_injection_surfacing.md) — LLM reads user A → surfaces to user B = injection vector.
- [feedback_e2e_cascade_root_cause.md](feedback_e2e_cascade_root_cause.md) — 20+ same-day Notion bugs with "Cascading X" in Found In = ONE infra bug. Fix upstream, don't close N individually.
- [feedback_nx_reset_before_commit.md](feedback_nx_reset_before_commit.md) — NX cache causes phantom `@nx/enforce-module-boundaries` errors. Run `pnpm exec nx reset` to clear.

## User Profile

- [user_device_small_phone.md](user_device_small_phone.md) — Tests on Galaxy S10e (5.8"). Check small-screen layout.

## Reference & Tooling

- [reference_notion_workspace.md](reference_notion_workspace.md) — Issue Tracker split 2026-05-18: NEW bugs → Open `3598bce9...`; Resolved archive `b8ce802f...`. REST via Doppler.
- [project_expo_web_preview.md](project_expo_web_preview.md) — `.claude/launch.json` `mobile` target. Cold bundle ~18s. Auth-walled past sign-in.
- Template repo extraction plan — tracked in Notion (archived from memory 2026-05-04).

## Custom Skills

- `/e2e`, `/ship`, `/fix-ci`, `/dispatch`, `/notion`, `/build`, `/commit` — all operational. **`/e2e` OS-aware (macOS/Windows/Linux) since 2026-05-14**, default flow `app-launch-devclient.yaml` — see `.agents/skills/e2e/SKILL.md`.
- Husky pre-commit: `tsc --build` (incremental) + lint-staged + surgical tests

## Cross-Project Assets

- `~/.claude/CLAUDE.md` — PR protocol, Architecture Playbooks, Doppler rule
- `~/.claude/playbooks/payment-access-system.md` — Reusable payment/billing discovery questionnaire

## Archived

Resolved/historical memories in `_archive/`. Use `git log --grep` for context on past issues.
- [project_cr_124_scope.md](_archive/project_cr_124_scope.md) — CR-124-SCOPE session-recap IDOR closed via scoped repo + break tests (3 commits on proxy-parent-fix).
- [project_epic15_code_review.md](_archive/project_epic15_code_review.md) — ALL Criticals+Importants CLOSED 2026-04-19. C2 test coverage filled (220 tests).
- [project_web_flow_bugs.md](_archive/project_web_flow_bugs.md) — All code-level web bugs FIXED. WEB-02 swept (33 screens). goBackOrReplace mandatory.
