# Memory Entries — Overlap Flags

**Purpose:** Flag memory entries that paraphrase rules now living in CLAUDE.md (global universal principles or project Inherited Rules). Step 2 reconciles these — this audit only flags candidates.

**Method:** First-pass classification based on the one-line hooks in `~/.claude/projects/C--Dev-Projects-Products-Apps-eduagent-build--memory/MEMORY.md`. Bodies of individual memory files NOT read in this pass; flagged items need body verification before any change.

**Created:** 2026-04-30, during Step 1 cleanup.

---

## ⚠ D-MEM-1 Supersession Notice (2026-05-04)

**Decision D-MEM-1 (2026-05-04)** resolved the conflict between this document and the `2026-05-03-memory-drift-audit.md` in favour of the **drift audit**. The drift audit classified the entries flagged below as REINFORCES or COMPATIBLE — meaning leave as-is. Deleting paraphrase memories is only appropriate if the corresponding CLAUDE.md rule they paraphrase is *more* visible and discoverable; currently `MEMORY.md`'s index makes the memories easier to find than the raw CLAUDE.md sections, so deleting them would reduce discoverability. The Step 2 "delete" and "reduce" recommendations in this document are **SUPERSEDED for all entries flagged by the drift audit at `docs/audit/2026-05-03-memory-drift-audit.md` line ~146**. See that file for the per-entry classification. Do NOT act on the "delete" recommendations below without first consulting the drift audit.

The `feedback_testing_no_mocks.md` divergence flag (stricter-than-CLAUDE.md claim) is **not resolved** by D-MEM-1 and remains open for Step 2.

---

## Classification legend

- **PURE PARAPHRASE** — restates a CLAUDE.md rule with no new context. Action: reduce to a one-line pointer at the authoritative source, or delete.
- **PARAPHRASE + CONTEXT** — restates a rule but adds project-specific reasoning, incident, or example. Action: keep the context; replace the restated rule with a pointer.
- **PROJECT DECISION** — genuine project state or decision, not a rule. Action: keep as-is.
- **USER PREFERENCE** — captures a workflow preference. Action: keep as-is unless preference duplicates a CLAUDE.md rule.
- **PROJECT STATE** — point-in-time fact (e.g. branch state, dates). Action: keep, but flag staleness candidates for date-check.

---

## Entries that likely paraphrase global principles

| Memory entry | Likely class | Maps to | Step 2 action |
|---|---|---|---|
| `feedback_verify_before_declaring_done.md` | PURE PARAPHRASE? | Global principle #1 ("Verify before declaring done") | Reduce to one-line pointer at global, or delete. Verify body has no extra context first. |
| `feedback_verify_before_marking_done.md` | PARAPHRASE + CONTEXT? | Global principle #1 | The Notion-specific framing ("never mark bugs Done in Notion unless 100% confident") is project context. Likely keep, but replace generic claim with pointer. |
| `feedback_thorough_investigation.md` | PURE PARAPHRASE? | Global principle #4 ("Read actual state, don't infer it") | Reduce or delete after body check. |
| `feedback_fix_root_cause.md` | PURE PARAPHRASE? | Global principle #3 ("Fix root causes, not symptoms") | Reduce or delete after body check. |

## Entries that likely paraphrase project Inherited Rules

| Memory entry | Likely class | Maps to | Step 2 action |
|---|---|---|---|
| `feedback_fix_verification_rules.md` | PURE PARAPHRASE | Inherited Rules → Fix Verification Rules (entire block) | The MEMORY.md hook explicitly summarises this block. Likely delete after body check. |
| `feedback_adversarial_review_patterns.md` | PURE PARAPHRASE | Inherited Rules → Code Quality Guards (Body double-consumption, classify-before-format, dead-code cleanup) | The MEMORY.md hook is a direct three-item paraphrase. Likely delete after body check. |
| `feedback_spec_failure_modes.md` | PURE PARAPHRASE | Inherited Rules → UX Resilience → Spec Failure Modes Before Coding | Direct restatement. Likely delete after body check. |
| `feedback_testing_no_mocks.md` | PARAPHRASE + DIVERGENCE | Inherited Rules → UX Resilience → No Internal Mocks in Integration Tests | **DIVERGENCE FLAG:** memory says "No mocks. Fixture-based test data only." — stricter than CLAUDE.md ("mock external boundaries only"). Resolve which is canonical before deleting either. |
| `feedback_no_suppression.md` | PARAPHRASE + CONTEXT? | Project CLAUDE.md "No suppression, no shortcuts" + Inherited Rules → NO-OP Dismissals | Two sources for the same family of rules. Reduce or delete. |
| `feedback_e2e_cascade_root_cause.md` | PARAPHRASE + CONTEXT | Global principle #3 + Inherited Rules → Fix Verification (Finding ID) | Project-specific incident gives context. Keep the incident; replace the rule restatement with a pointer. |

## Entries that likely paraphrase project-level (non-Inherited) rules

| Memory entry | Likely class | Maps to | Step 2 action |
|---|---|---|---|
| `feedback_run_integration_tests.md` | PURE PARAPHRASE? | Project CLAUDE.md "Required Validation" → integration test rule | Reduce or delete after body check. |
| `feedback_precommit_typecheck.md` | PURE PARAPHRASE? | Project CLAUDE.md "Required Validation" | Reduce or delete after body check. |
| `feedback_e2e_never_skip.md` | PURE PARAPHRASE? | Project CLAUDE.md "Required Validation" | Reduce or delete after body check. |
| `feedback_verify_full_ci.md` | PURE PARAPHRASE? | Inherited Rules → PR Review & CI Protocol → Fix CI | Reduce or delete after body check. |
| `feedback_batch_pr_fixes.md` | PARAPHRASE + CONTEXT? | Inherited Rules → PR Review & CI Protocol | Likely contains workflow context. Keep with pointer. |

## Entries that look like project decisions, user preferences, or state (KEEP as-is)

These are not flagged as overlap candidates — listed for completeness so the audit doesn't miss them in a future pass.

- All `project_*.md` entries (project state and decisions: `project_implementation_phase.md`, `project_eval_llm_harness.md`, `project_brand_dark_first.md`, etc.)
- Workflow preferences: `feedback_never_switch_branch.md`, `feedback_parallel_agents.md`, `feedback_fast_iteration.md`, `feedback_just_do_it.md`, `feedback_autonomous_speccing.md`, `feedback_agents_commit_push.md`, `feedback_no_pr_unless_asked.md`, `feedback_no_ota_unless_asked.md`, `feedback_use_sonnet_agents.md`, `feedback_partial_staging_stash.md`, `feedback_stash_untracked_protection.md`, `feedback_commit_skip_failing.md`, `feedback_testing_tracking_only.md`
- Pedagogy/product principles: `feedback_never_lock_topics.md`, `feedback_never_force_add_child.md`, `feedback_human_override_everywhere.md`, `feedback_quiet_defaults_over_friction.md`, `feedback_homework_not_socratic.md`, `feedback_no_jargon_kid_language.md`, `feedback_voice_is_critical.md`
- Architectural stack notes: `feedback_drizzle_transaction_cast.md`, `feedback_persona_vs_role.md`, `feedback_doppler_secrets.md`, `feedback_ota_env_vars.md`
- Tooling/process: `feedback_emulator_issues_doc.md`, `feedback_eas_no_retry.md`, `feedback_build_dedup.md`, `feedback_nx_reset_before_commit.md`, `feedback_git_pathspec_literal_brackets.md`, `feedback_git_stash_pop_kept.md`, `feedback_comment_not_delete.md`, `feedback_notion_rest_for_queries.md`, `feedback_notion_resolution_recording.md`, `feedback_llm_prompt_injection_surfacing.md`, `feedback_spec_before_code.md`, `feedback_five_root_causes.md`
- User profile / device: `user_device_small_phone.md`
- Critical decisions: `billing-payments.md`, `pricing_dual_cap.md`, `market_language_pivot.md`, `project_themekey_removed.md`
- Reference: `reference_notion_workspace.md`, `nativewind-windows.md`, `project_template_repo.md`

---

## Summary

| Bucket | Count | Notes |
|---|---|---|
| ~~Likely PURE PARAPHRASE — strong delete candidates~~ **SUPERSEDED by D-MEM-1** | ~7 | `feedback_fix_verification_rules.md`, `feedback_adversarial_review_patterns.md`, `feedback_spec_failure_modes.md`, `feedback_thorough_investigation.md`, `feedback_fix_root_cause.md`, `feedback_run_integration_tests.md`, `feedback_precommit_typecheck.md` — drift audit classifies as REINFORCES/COMPATIBLE; leave as-is. |
| ~~Likely PARAPHRASE + CONTEXT — reduce to pointer~~ **SUPERSEDED by D-MEM-1** | ~5 | `feedback_e2e_never_skip.md`, `feedback_verify_full_ci.md`, `feedback_batch_pr_fixes.md`, `feedback_no_suppression.md`, `feedback_e2e_cascade_root_cause.md` — drift audit classifies as COMPATIBLE; leave as-is. |
| **Active divergence — must resolve first (OPEN)** | **1** | `feedback_testing_no_mocks.md` is stricter than CLAUDE.md. **Not resolved by D-MEM-1.** Still open for Step 2. |
| Project decisions / preferences / state — keep | ~50 | Out of scope for this audit |

## Open questions for Step 2

1. **Divergence resolution.** `feedback_testing_no_mocks.md` says "No mocks. Fixture-based test data only." but Inherited Rules → No Internal Mocks says "Mock only true external boundaries (Stripe, Clerk JWKS, etc.)." These contradict. The codebase will tell which is actually followed; check before reconciling.
2. **MEMORY.md itself.** The index file is ~150 lines and uses one-line pointers. After Step 2 reduces several memory files to pointers, the index entries may also need updating to reflect new content.
3. **Cost of doing nothing.** Memory drift is invisible until two sources disagree. The longer this divergence sits, the more likely a future session acts on the stale paraphrase. Recommend Step 2 land the reconciliation pass within ~1-2 weeks.
4. **Body verification budget.** ~12 files need body reads to confirm class assignments. That's ~10-15 minutes of focused work in Step 2.

## Skills referenced

This audit is descriptive; no skills were invoked. Step 2 may use `simplify` or a memory-management skill if one exists.
