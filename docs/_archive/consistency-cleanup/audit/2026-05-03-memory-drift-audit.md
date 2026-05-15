# MEMORY-DRIFT — Memory artefact audit vs. new "Sweep when you fix" rule

**Date:** 2026-05-03
**Auditor:** memory-drift-audit fork
**Scope:** All memory files in two reachable locations: project auto-memory (3 files) + repo `.claude/memory/` (96 entries incl. `MEMORY.md` + `_archive/`). The user-global location 1 (`C:\Users\JornJorgensen\.claude\memory\`) **does not exist on this machine** and was excluded.
**Status:** RECON COMPLETE (read-only — no memory files were modified)
**Rule under audit:** CLAUDE.md `Fix Verification Rules` → "**Sweep when you fix**" (line 88, project root). Mandates that drift fixes affecting 3+ sibling sites either (a) sweep all sites + install a forward-guard in the same PR, or (b) document a deferred sweep with tracked ID, owner, target date. Tagline: *"Never silently fix one of N."*

---

## TL;DR

93 memory entries audited (3 project auto-memory + 90 repo-scoped, excluding the 18 `_archive/` files which are out of scope by archival convention). Classification: **DRIVES-DRIFT 1**, **REINFORCES 8**, **AMBIGUOUS 4**, **STALE 4**, **COMPATIBLE ~76**. The single DRIVES-DRIFT finding is `feedback_commit_skip_failing.md` ("Ship what's ready, deal with the rest after") — a commit-scope analogue of "silently fix one of N" that should at minimum be amended to require a tracked follow-up entry. The REINFORCES bench is strong: `feedback_sweep_for_same_bug.md` is essentially the new rule's embryonic form and should be cited from `MEMORY.md` as the precursor. The AMBIGUOUS items are speed-vs-thoroughness preferences that need a one-sentence carve-out so an enthusiastic agent does not weaponise them against the new rule. Two project auto-memory entries carry "circle back to implement" deferrals with no owner+date — the exact failure mode the new rule prohibits — flagged as both AMBIGUOUS and STALE.

## Severity

**YELLOW** — one direct conflict (commit-scope partial), one rule-precursor that should be cross-linked, several speed memories that need a small carve-out clause. None of the conflicts will cause silent data loss; risk is "future agent cites the wrong memory to justify a half-fix."

## Methodology

- `Glob` and `ls` to inventory all three memory locations. Location 1 (`~/.claude/memory/`) returned `No such file or directory` — confirmed not present on this machine.
- `Read` of `MEMORY.md` indexes (project auto-memory + repo) for orientation; index used as a map, not as authority — every flagged file body was read.
- `Read` of all 3 project auto-memory files (full bodies).
- `Read` of all `feedback_*.md` files in repo `.claude/memory/` (47 files, full bodies). These are the highest-yield bucket because the new rule is a feedback/process rule, and feedback memories are the most likely to encode workflow drivers.
- `Read` of project memories whose names hinted at process/workflow drift relevance (`project_known_bug_patterns.md`, `project_llm_marker_antipattern.md`, `project_open_bugs.md`, `project_eval_llm_*`, `project_schema_drift_*`, `project_dev_schema_drift_trap.md`, `project_session_lifecycle_decisions.md`, `project_summary_draft_backup_deferred.md`, `project_template_repo.md`, `project_themekey_removed.md`, `project_ux_review_pass.md`, `project_persona_removal.md`, `project_ci_infrastructure.md`, `project_clerk_key_environments.md`, `project_deploy_safety.md`, `project_deploy_config_open.md`, `project_eas_build.md`, `project_eas_update_ota.md`, `project_apple_enrollment.md`, `project_brand_dark_first.md`, `project_inngest_staging.md`, `project_language_pedagogy.md`, `project_multiple_coaching_cards.md`, `project_nx_expo_plugin_bug.md`, `project_onboarding_new_dimensions.md`, `project_parent_visibility_spec.md`, `project_playwright_e2e_setup.md`, `project_prod_approval_gate.md`, `project_revenuecat_setup.md`, `project_f8_memory_source_refs.md`, `project_fingerprint_pnpm_mismatch.md`, `project_expo_web_preview.md`, `billing-payments.md`, `pricing_dual_cap.md`, `market_language_pivot.md`, `google_play_publishing.md`, `nativewind-windows.md`, `reference_notion_workspace.md`, `user_device_small_phone.md`).
- `Grep` of `[Ss]weep` against repo + global CLAUDE.md to verify the rule wording cited above.
- `git log` spot-check on commits referenced by memory entries (3ce28b45, 99d234fc, 1f513d1c, 413ece4f, 970a82a5, 349ecad8, 3b32b0a1, 5e24261) — all present.
- Used the prior-art doc `docs/audit/claude-optimization/memory-overlap-flags.md` as a cross-reference for paraphrase classification, NOT as authority for drift classification.

## Findings

### DRIVES-DRIFT (1)

#### Finding D-1 — `feedback_commit_skip_failing.md` actively encourages commit-scope partial fixes

- **File:** `C:\Dev\Projects\Products\Apps\Mentomate\.claude\memory\feedback_commit_skip_failing.md`
- **Memory `name`:** "Commit what passes, skip failing files"
- **Type:** `feedback`
- **Summary:** When pre-commit hooks fail on some files, unstage the failing files and commit + push what passes; come back to fix the rest later.
- **Trigger text (28 words):** "Stage all changed files. If pre-commit fails, identify which files caused the failure. Unstage those files, commit the rest, push. Only then go back and work on getting the failing files right."
- **Why this conflicts:** The new rule's "Never silently fix one of N" maps cleanly onto "ship a partial commit and come back later." There is no requirement in the memory to file a tracked follow-up, no owner, no target date — exactly the deferred-without-trace pattern the new rule names as the harm.
- **Recommendation:** **amend**. Add a final paragraph: *"If the unstaged files represent the same drift as the committed files (e.g. you fixed 3 of 5 sibling sites and the other 2 are still failing), the deferral must follow CLAUDE.md `Sweep when you fix` — open a tracked entry (Notion bug, plan punch-list, or `docs/audit/_changelog.md` line) with owner + target date before pushing. Speed-shipping a known partial without a tracked follow-up is the exact behavior the sweep rule prohibits."*
- **Severity:** YELLOW (workflow-shaping, not a code rule).

### REINFORCES (8)

These memories actively support the new rule. None require change. **Recommendation: leave-as-is, but cross-link `MEMORY.md` to flag `feedback_sweep_for_same_bug.md` as the explicit precursor of the new CLAUDE.md rule** (currently listed under "Workflow Preferences" with a one-line hook that does not signal its rule-canonical status).

| File | Why it reinforces |
|---|---|
| `feedback_sweep_for_same_bug.md` | Literally the new rule, written for a single instance. "After fixing a bug … grep/search for the same pattern across the entire codebase." Sign-in/sign-up cluster cited as motivating example. **Direct precursor.** |
| `feedback_e2e_cascade_root_cause.md` | "Do NOT pick 10 to close individually. Investigate the upstream cause first." Treats a cluster as one bug; mandates an infra-level sweep (preflight script). |
| `feedback_fix_root_cause.md` | Frames symptom-fix vs. root-cause via a 3-times-reported splash bug. Same framing as the new rule. |
| `feedback_five_root_causes.md` | Cross-cutting: "nearly all bugs trace to five systemic root causes" — argues for systemic fixes over local ones. |
| `feedback_fix_verification_rules.md` | Pure pointer to CLAUDE.md `Fix Verification Rules` section, where the new sweep rule lives. Will inherit the new rule by reference. |
| `feedback_thorough_investigation.md` | "NEVER declare an implementation percentage until you've confirmed from at least 3 independent search angles." Makes pre-fix sweep mandatory. |
| `feedback_no_suppression.md` | "No shortcuts — always address the root of the error." Same intent. |
| `feedback_batch_pr_fixes.md` | "Apply ALL fixes in a single pass." Batch-orientation aligns with sweep-in-one-PR. |

### AMBIGUOUS (4)

These could be weaponised against the new rule by an agent looking for license to ship fast. They are not wrong — they're optimising a real cost (waiting on the user, 60-min CI loops). They need a one-sentence carve-out so the speed argument doesn't override the sweep argument when both apply.

#### Finding A-1 — `feedback_just_do_it.md`

- **File:** `C:\Dev\Projects\Products\Apps\Mentomate\.claude\memory\feedback_just_do_it.md`
- **Memory `name`:** "Just do what the user asks — don't add unnecessary confirmation gates"
- **Type:** `feedback`
- **Summary:** When the user gives a clear action command, execute immediately rather than asking confirmation questions.
- **Trigger text (≤30 words):** "If the user says 'do X', do X first, then mention any caveats. Don't block on non-critical warnings. Reserve confirmation gates for truly destructive or irreversible actions."
- **Why ambiguous:** Confirmation-gate aversion is about clarification, not fix scope. But the same "just do it" mindset can rationalise scope-narrowing ("they asked me to fix this file, not sweep") — the discriminator the agent will reach for under deadline pressure.
- **Recommendation:** **amend** — append: *"This rule is about confirmation gates, not fix scope. If a fix touches 3+ sibling locations, the sweep rule (CLAUDE.md `Sweep when you fix`) applies — sweep or track-defer in the same PR; do not ship a single-site fix and 'come back later' without a tracked entry."*

#### Finding A-2 — `feedback_fast_iteration.md`

- **File:** `C:\Dev\Projects\Products\Apps\Mentomate\.claude\memory\feedback_fast_iteration.md`
- **Memory `name`:** "User demands fast iteration — 60-min feedback loops are unacceptable"
- **Type:** `feedback`
- **Summary:** Optimise for the fastest path to a testable artifact on device; never add gates that increase iteration time without clear safety justification.
- **Trigger text (≤30 words):** "Never add gates that increase iteration time without clear safety justification."
- **Why ambiguous:** A sweep + guard test is a "gate that increases iteration time." An agent could use this memory to argue against the sweep rule in a pre-launch crunch.
- **Recommendation:** **amend** — append: *"Sweep + guard tests required by CLAUDE.md `Sweep when you fix` are *correctness* gates, not ceremony. They count as 'clear safety justification' and override iteration-speed preference."*

#### Finding A-3 — Project auto-memory: `project_nx_cloud_credit_optimizations.md`

- **File:** `C:\Users\JornJorgensen\.claude\projects\C--Dev-Projects-Products-Apps-Mentomate\memory\project_nx_cloud_credit_optimizations.md`
- **Memory `name`:** "Nx Cloud credit optimization opportunities"
- **Type:** `project`
- **Summary:** 3 identified savings opportunities for Nx Cloud spend, all marked "not yet implemented."
- **Trigger text (≤30 words):** "Optimization opportunities (not yet implemented): … Circle back to implement these after finishing Nx Cloud analysis session."
- **Why ambiguous:** A list of 3 deferred items with no owner, no target date, no tracked ID, dated 30+ days ago. This is the *exact* failure mode the new rule names: "documented a deferred sweep" without the required owner+target. Either promote into proper deferred-sweep entries, or close out as not-now.
- **Recommendation:** **amend** — either (a) convert each opportunity into a Notion item / docs/plans entry with owner + target date, then update memory to point at it, or (b) explicitly mark "deferred indefinitely, not on the pre-launch path" so future agents stop treating it as live work.

#### Finding A-4 — Project auto-memory: `project_nx_cloud_identities.md`

- **File:** `C:\Users\JornJorgensen\.claude\projects\C--Dev-Projects-Products-Apps-Mentomate\memory\project_nx_cloud_identities.md`
- **Memory `name`:** "Nx Cloud contributor identity fragmentation"
- **Type:** `project`
- **Summary:** 6+ contributors shown for 2 real users; needs `.mailmap` to consolidate; "user wants to address later."
- **Trigger text (≤30 words):** "Add a `.mailmap` file to repo root to consolidate identities. Not yet created — user wants to address later."
- **Why ambiguous:** Same pattern as A-3 — deferred without ID/owner/date. Note: `project_ci_infrastructure.md` already says `.mailmap` was added 2026-04-03, so this memory is also potentially STALE — verify whether the consolidation is complete or whether more identity mappings are still missing.
- **Recommendation:** **amend** or **delete** after a 2-minute check of `.mailmap` in repo root. If the file consolidates all 6+ identities, this memory is stale and should be archived. If it only covers some, file the remaining gap as a tracked entry.

### STALE (4)

Listed for hygiene, not actionable for the drift question.

| File | Why stale |
|---|---|
| `MEMORY.md` (repo `.claude/memory/MEMORY.md`) | Header says `## Active Work (2026-04-30)` and `Active branch: \`proc-optimization\``. Current branch is `consistency` (per env). Index needs a refresh — agents reading this trust the active-work block. |
| `project_summary_draft_backup_deferred.md` | "Server-side backup proposed and **deferred** 2026-04-24" — 9 days old; if still deferred, fine; if revisited, update. Verify before next plan-cycle. |
| `project_open_bugs.md` | "Bug batch 2026-04-15 (10 bugs, all closed to Done)" — 18 days old; "No P0/P1 to worry about" claim should be re-verified before being relied on. |
| `project_nx_cloud_identities.md` | Listed under STALE in addition to AMBIGUOUS A-4: `.mailmap` was added 2026-04-03 per `project_ci_infrastructure.md`, so the "Not yet created" claim contradicts a sibling memory. |

### COMPATIBLE (~76, count only per audit-doc convention)

The remaining ~76 memories are consistent with the new rule but neither actively reinforce nor undercut it. Breakdown by type (approx):

- `project` state/decision memories (eval-llm harness, EAS, Clerk keys, RevenueCat, language pedagogy, deploy safety, schema drift patterns, persona removal, theme keys, etc.) — ~38 files. These are "what is true about the system" rather than "how to behave," so the sweep rule does not apply.
- `feedback` workflow/process memories not flagged above (`feedback_doppler_secrets`, `feedback_e2e_runbook`, `feedback_e2e_never_skip`, `feedback_eas_no_retry`, `feedback_build_dedup`, `feedback_no_pr_unless_asked`, `feedback_no_ota_unless_asked`, `feedback_use_sonnet_agents`, `feedback_agents_commit_push`, `feedback_never_switch_branch`, `feedback_parallel_agents`, `feedback_partial_staging_stash`, `feedback_stash_untracked_protection`, `feedback_git_pathspec_literal_brackets`, `feedback_git_stash_pop_kept`, `feedback_nx_reset_before_commit`, `feedback_emulator_issues_doc`, `feedback_drizzle_transaction_cast`, `feedback_persona_vs_role`, `feedback_ota_env_vars`, `feedback_precommit_typecheck`, `feedback_run_integration_tests`, `feedback_verify_full_ci`, `feedback_verify_before_declaring_done`, `feedback_verify_before_marking_done`, `feedback_testing_no_mocks`, `feedback_testing_tracking_only`, `feedback_adversarial_review_patterns`, `feedback_spec_failure_modes`, `feedback_spec_before_code`, `feedback_llm_prompt_injection_surfacing`, `feedback_notion_resolution_recording`, `feedback_notion_rest_for_queries`, `feedback_homework_not_socratic`, `feedback_no_jargon_kid_language`, `feedback_voice_is_critical`, `feedback_quiet_defaults_over_friction`, `feedback_human_override_everywhere`, `feedback_never_lock_topics`, `feedback_never_force_add_child`, `feedback_comment_not_delete`, `feedback_autonomous_speccing`) — ~35 files. Each is scope-orthogonal to the sweep rule.
- `reference` / `user` / pricing / brand / market entries (`reference_notion_workspace.md`, `nativewind-windows.md`, `user_device_small_phone.md`, `billing-payments.md`, `pricing_dual_cap.md`, `market_language_pivot.md`) — ~6 files. Domain facts.

### Out of scope by archival convention

`_archive/` directory (18 files: `project_accent_cascade_broken.md`, `project_cr_124_scope.md`, `project_deploy_schemas_bug.md`, `project_epic15_code_review.md`, `project_epic16_code_review.md`, `project_epic7_library_redesign.md`, `project_expo_router_pollution.md`, `project_implementation_phase.md`, `project_memory_system_audit.md`, `project_persona_analysis.md`, `project_signin_broken_flow.md`, `project_signin_clerk_key_root_cause.md`, `project_signin_race_condition.md`, `project_staging_clerk_key.md`, `project_theme_unification.md`, `project_web_flow_bugs.md`, `feedback_worktree_windows_issues.md`, `project_cr_124_scope.md`). Archived memories are explicitly marked as historical context — agents are not expected to follow them as live guidance, so they cannot drive current drift behavior. One file in `_archive/` was spot-read (`project_memory_system_audit.md`) to confirm the archival convention; no live-rule content was found.

## Recommended actions

| File | Classification | Recommendation | One-line rationale |
|---|---|---|---|
| `feedback_commit_skip_failing.md` | DRIVES-DRIFT | **amend** (append carve-out citing sweep rule) | Direct conflict at commit scope — must require a tracked follow-up when partial maps to a cluster. |
| `feedback_just_do_it.md` | AMBIGUOUS | **amend** (one-sentence sweep-rule pointer) | Speed memory could rationalise scope-narrowing under deadline pressure. |
| `feedback_fast_iteration.md` | AMBIGUOUS | **amend** (clarify "safety gate" vs "ceremony gate") | "Never add gates" could be misread as license to skip sweep + guard tests. |
| `project_nx_cloud_credit_optimizations.md` (auto-memory) | AMBIGUOUS + STALE | **amend** (add owner+date OR mark "deferred indefinitely") | "Circle back to implement" with no tracking is the exact failure-mode the new rule names. |
| `project_nx_cloud_identities.md` (auto-memory) | AMBIGUOUS + STALE | **amend** or **delete** after `.mailmap` check | Conflicts with `project_ci_infrastructure.md` which says `.mailmap` shipped 2026-04-03. |
| `MEMORY.md` (repo) | STALE | **amend** (refresh "Active Work" header) | Active branch + active-work block 30+ days behind current state. |
| `project_summary_draft_backup_deferred.md` | STALE | **leave-as-is**, re-verify next plan cycle | "Deferred 2026-04-24" — fine if still deferred. |
| `project_open_bugs.md` | STALE | **leave-as-is**, re-verify before relying on "no P0/P1" claim | 18 days old; fine for context, not for guarantees. |
| `feedback_sweep_for_same_bug.md` | REINFORCES | **leave-as-is**; cross-link in `MEMORY.md` index as new-rule precursor | Should be cited as the explicit motivating example of the new CLAUDE.md rule. |
| All other REINFORCES (7) | REINFORCES | **leave-as-is** | Consistent with rule, no change needed. |
| ~76 COMPATIBLE | COMPATIBLE | **leave-as-is** | Scope-orthogonal to the sweep rule. |
| 18 `_archive/*` | OUT-OF-SCOPE | **leave-as-is** | Archived per convention; not live guidance. |

## Cross-coupling notes

- **`docs/audit/claude-optimization/memory-overlap-flags.md`** (2026-04-30) already flagged `feedback_fix_verification_rules.md`, `feedback_adversarial_review_patterns.md`, `feedback_spec_failure_modes.md`, `feedback_thorough_investigation.md`, `feedback_fix_root_cause.md`, `feedback_run_integration_tests.md`, `feedback_precommit_typecheck.md`, `feedback_e2e_never_skip.md`, `feedback_verify_full_ci.md`, `feedback_batch_pr_fixes.md` as PURE-PARAPHRASE delete candidates. **The drift audit has the opposite recommendation: REINFORCES means leave alone.** A future Step 2 of the overlap-cleanup should reconcile — deleting paraphrase memories is fine *only if the CLAUDE.md rule they paraphrase is more visible and discoverable than the memory they replace.* Right now several of these memories are easier to find than the corresponding CLAUDE.md section (because `MEMORY.md` indexes them), so deleting them would make the rule *less* visible to future agents. Recommend overlap-cleanup defer until `MEMORY.md` is restructured to point at CLAUDE.md sections.
- **`feedback_testing_no_mocks.md` divergence** noted in the overlap-flags doc is unrelated to the sweep rule and was not re-evaluated here. Still open.
- **Project auto-memory location 2** (`C:\Users\JornJorgensen\.claude\projects\…\memory\`) is the first place an agent reads at session start (it auto-loads). Two of the three files there carry "circle back" deferrals 30+ days old — visible-by-default location, stale-by-default content. Highest leverage for cleanup: the auto-memory location, not the repo memory location.

## Audit honesty disclosures

- **Sampling rule.** Full bodies read for: all 3 project auto-memory files, all 47 `feedback_*.md` files in repo memory, plus 38 `project_*.md` / `reference_*.md` / `user_*.md` / domain-fact files in repo memory whose names suggested process or workflow relevance. **18 `_archive/*` files were excluded** by archival convention (one spot-read confirmed convention). **No `project_*` or `reference_*` body was deemed relevant after read** — they are domain state, not behavior rules. The COMPATIBLE bucket (~76) includes ~6 files whose names suggested pure domain content (e.g. `project_eas_build.md`, `pricing_dual_cap.md`) and were spot-checked to confirm — none flagged.
- **Location 1 (user-global memory) was not audited** because the directory does not exist on this machine (`ls` returns "No such file or directory"). The audit-prompt's mention of "~50 files" appears to refer to a different machine or to the now-relocated content under location 3 (repo memory).
- **No memory file was modified** during this audit (read-only). No `git add`, `git commit`, or `git push` was run.
- **Drift discriminator used:** "Would an agent following this memory take a partial fix when 3+ sibling locations are affected?" Speed-vs-thoroughness memories were classified AMBIGUOUS only when a plausible read of the memory text would license that behavior, not merely because they argued for speed.
- **Time spent:** ~50 min recon + writing.
- **Not done in this audit:** verification of whether each REINFORCES memory's *content* still reflects current code (e.g., `feedback_e2e_cascade_root_cause.md` cites `apps/mobile/e2e/scripts/e2e-preflight.sh`; not verified that the script still exists). Out of scope; covered by the broader STALE-recheck in `docs/audit/_changelog.md` cycles.
