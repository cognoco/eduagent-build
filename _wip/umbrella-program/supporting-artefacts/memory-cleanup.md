---
title: WI-387 memory triage — workflow results
date: 2026-06-10
scope: 55 memories from tables B/C/D of 2026-06-10-wi-387-memory-triage-prep.md
method: per-cluster triage vs MMT-ADR-0000 L4 rules + adversarial verify
ground_truth: harness-hygiene worktree
status: results-final
---
# WI-387 memory triage — workflow results (2026-06-10)

> **Provenance.** Authored in nexus as `_WIP/zdx-productionization/_state/2026-06-10-wi-387-memory-triage-results.md`; moved here 2026-06-10 (operator instruction) — a tombstone remains at the old path. Nexus-path self-references in the body are historical.

**Scope.** 55 memories from tables B/C/D of `2026-06-10-wi-387-memory-triage-prep.md` (eduagent-build `.claude/memory/`, branch `harness-hygiene`).

**Method.** Per-cluster triage agent applied MMT-ADR-0000 L4 rules to each memory, then an adversarial verifier reviewed every recommendation. Final bucket rule: `verify.verdict==='overturn'` → use `verify.new_bucket`; `'escalate'` → triage bucket stands but the memory is flagged ESCALATED; otherwise triage bucket stands.

**Ground truth.** `harness-hygiene` worktree at `/Users/vetinari/nexus/_dev/eduagent-build/.worktrees/harness-hygiene`.

**Final tally.** KEEP 16 · REVISE 23 · DRAIN 9 · MERGE 1 · ARCHIVE 5 · CONFLICT 1 = 55 · ESCALATED flags 0
*(Reflects the 2026-06-10 corrective pass — see § Corrective pass below — and the operator ruling on CONFLICT 1. At first-workflow completion: KEEP 13 · REVISE 28 · DRAIN 4 · MERGE 1 · ARCHIVE 7 · CONFLICT 2.)*

> *Post-run repair (2026-06-10, Hex): the synthesis agent's first cut duplicated `project_language_pedagogy` in the summary table, omitted `project_known_bug_patterns` entirely, and mis-stated the tally. Repaired against the workflow journal (55/55 results recovered; tally above recomputed mechanically). The `project_known_bug_patterns` entries below are reconstructed verbatim from its triage/verify journal records.*

---

## Summary


| Memory                                            | Kind    | Final bucket | Triage→Verify                         | Confidence | One-line rationale                                                                                                                       | Decision | Status   |
| --------------------------------------------------- | --------- | -------------- | ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------- |
| project_clerk_key_environments | product | REVISE | uphold | high | Mechanism stale (keys moved to EAS Env Vars); resolved incident history removable. |  |  |
| project_eas_build | product | REVISE | uphold | high | Doppler/runtime-version sections covered by canon; NX Cloud, Sentry, WSL2, build quirk are unique. |  |  |
| project_eval_llm_harness | product | REVISE | **overturn** (flow count corrected) | high | Flow count is 23 (not 17); filing-post-session absent; directory stale. |  |  |
| project_nx_expo_plugin_bug | product | REVISE | uphold | high | pre-commit-tests.sh retired; --no-verify prohibition contradicts two-level doctrine in AGENTS.md. |  |  |
| feedback_audit_check_deleted_concepts | user | KEEP | uphold | high | Category (c) methodology memory; corroborated by persona-fossil-guard.test.ts. |  |  |
| feedback_autonomous_speccing | user | KEEP | **overturn** (was REVISE) | high | Frontmatter deficiency claim used wrong schema authority; eduagent-build uses 3-field schema and file is complete. |  |  |
| feedback_llm_prompt_injection_surfacing | user | KEEP | uphold | high | Injection mitigation checklist absent from AGENTS.md/architecture.md; incident-corroborated. |  |  |
| feedback_never_switch_branch | user | KEEP | uphold | high | Explicit git checkout/switch prohibition + subagent scope absent from AGENTS.md. |  |  |
| feedback_no_jargon_kid_language | user | KEEP | corrective: REVISE→KEEP (uphold) | high | Corrective: frontmatter + pointer-ification drivers ratified out; content true, unique, useful. |  |  |
| feedback_no_ota_unless_asked | user | KEEP | uphold | high | OTA agent-behavior constraint absent from AGENTS.md; sibling pointer delegates here. |  |  |
| feedback_quiet_defaults_over_friction | user | KEEP | uphold | high | Principle absent from all live docs/; legitimate category (c). |  |  |
| feedback_testing_tracking_only | user | KEEP | corrective: REVISE→KEEP (uphold) | high | Corrective: frontmatter-only driver ratified out; content true and unique. |  |  |
| feedback_use_sonnet_agents | user | KEEP | corrective: REVISE→KEEP (uphold) | high | Corrective: frontmatter-only driver ratified out; content true and unique. |  |  |
| user_device_small_phone | user | KEEP | corrective: REVISE→KEEP (uphold) | high | Corrective: frontmatter-only driver ratified out; device fact true and load-bearing. |  |  |
| feedback_never_force_add_child | user | REVISE | corrective: REVISE→REVISE (uphold) | high | Corrective: narrowed — delete only the false "How to apply" block (AddFirstChildScreen/isParentWithNoChildren gone); principle stays. |  |  |
| feedback_voice_is_critical | user | REVISE | uphold | high | Epic 8 done; TTS default claim overstates FR144; stale Epic 8 framing. |  |  |
| feedback_never_lock_topics | user | CONFLICT | uphold | high | Memory says REQUIRED = advisory; PRD:1371 says REQUIRED = hard lock enforced by FR119. |  |  |
| doppler-secrets | mixed | REVISE | uphold | high | Stale idempotency-test claim removed; verified operational how-to retained. |  |  |
| feedback_doppler_secrets | mixed | REVISE | uphold | high | Wrong EAS command (eas secret:create vs eas env:create) and wrong denylist subject; Windows path retained. |  |  |
| project_expo_web_preview | harness | REVISE | uphold | high | Port stated as 8081; .claude/launch.json uses 8089. | Revise | REVISED |
| project_playwright_e2e_setup | harness | REVISE | uphold | high | 8 playwright projects (not 5); doppler command missing --project flag; pitfall and baseline unique. | Revise | REVISED |
| project_archon_spike_merge_rule | harness | ARCHIVE | uphold | high | Time-bounded exception expired; consistency2 branch gone, PR #176 closed without merge. | Archive | ARCHIVED |
| project_book_generation_pass | product | KEEP | uphold | high | Valid L4(a) pointer; all cited sources verified; change-classes.md confirmed. | Keep | KEPT |
| project_clerk_email_verification_fallback | product | KEEP | **overturn** (was REVISE) | high | Memory already cites deployment-and-secrets.md at lines 17-19; REVISE was based on false claim. | Keep | KEPT |
| project_cosmo_wi_project_relation_misfiling | product | KEEP | uphold | high | Live failure mode, repo guard verified, not documented in skills or AGENTS.md. | Keep | KEPT |
| project_identity_foundation_decisions | product | KEEP | uphold | high | Pure L4(a) pointer; all 12+ referenced files verified present and accurate. | Keep | KEPT |
| project_product_roles_students_any_age | product | KEEP | uphold | high | Explicit L4(a) pointer; all three canon sources verified present and accurate. | Keep | KEPT |
| project_themekey_removed | product | KEEP | uphold | high | NEVER re-add guardrails + Hermes failure mechanics absent from any ADR; code comments verify. | Keep | KEPT |
| market_language_pivot | product | REVISE | uphold | high | Core premise "English-only UI, no i18n" stale — 7 locales shipped. | Revise | REVISED |
| pricing_dual_cap | product | REVISE | uphold | high | premiumModelProfiles field dropped in 2026-05-25 tier-access-rework. | Revise | REVISED |
| project_enduser_session_pass | product | REVISE | **overturn** (revise_action corrected) | high | Six session types is correct (not five); four-strands IS a mode; only Windows-path portability fix applies. | Revise | REVISED |
| project_eval_llm_signal_metrics | product | REVISE | uphold | high | Four flows have emitsEnvelope (not one); eval-live.yml automates schedule; --validate-baseline gate missing. | Revise | REVISED |
| project_inngest_staging | product | REVISE | uphold | high | One-time sync event removable; citations to inngest.ts [BUG-237] and index.ts:301 missing. | Revise | REVISED |
| project_revenuecat_setup | product | REVISE | uphold | high | PRODUCT_TIER_MAP moved to revenuecat-webhook-handler.ts:79; store connections still pending. | Revise | REVISED |
| project_schema_drift_pattern | product | REVISE | uphold | high | Survivor of MERGE; absorb naming-trap table; remove stale incident column list. | Revise | REVISED |
| feedback_human_override_everywhere | product | DRAIN | uphold | high | Core UX principle absent from PRD.md and UX spec; disposition matrix PROMOTE/REPOINT unexecuted. | Drain | CAPTURED |
| project_brand_dark_first | product | DRAIN | corrective: ARCHIVE→DRAIN (uphold) | high | Corrective: epics.md non-counting; hex palette, no-accent-picker + override mechanic absent from architecture.md:132 — drain. | Drain | CAPTURED |
| project_eas_update_ota | product | DRAIN | corrective: KEEP→DRAIN (uphold) | high | Corrective: deployment-and-secrets.md non-counting; OTA behavior undocumented in counting docs — drain to architecture.md. | Drain | CAPTURED |
| project_freeform_library_filing_decision | product | DRAIN | corrective: ARCHIVE→DRAIN (uphold) | high | Corrective: archived-spec coverage invalid; filing policy absent from PRD/UX/CONTEXT — drain to PRD. | Drain | CAPTURED |
| project_known_bug_patterns | product | DRAIN | uphold | high | Both bug patterns are durable rules absent from AGENTS.md Code Quality Guards; fixes live in code, 15 ?? [] sites remain. | Drain | CAPTURED |
| project_language_assessments_production_first | product | DRAIN | corrective: REVISE→DRAIN (uphold) | high | Corrective: code-as-coverage rejected; production-first pedagogy rule absent from all counting docs — drain to PRD. | Drain | CAPTURED |
| project_language_pedagogy | product | DRAIN | uphold | high | Feature fully merged; durable arch facts (pedagogyMode, nativeLanguage, CEFR) absent from architecture.md (still future-tense at :1357). | Drain | CAPTURED |
| project_llm_source_provenance | product | DRAIN | uphold | high | private_sources/factual_confidence/0.88 gate absent from architecture.md LLM Response Envelope; live in code. | Drain | CAPTURED |
| project_session_lifecycle_decisions | product | DRAIN | corrective: ARCHIVE→DRAIN (uphold) | high | Corrective: epics.md non-counting; rationale, gap-cap algorithm, UI rule absent from architecture.md — drain. | Drain | CAPTURED |
| project_dev_schema_drift_trap | product | MERGE | uphold | high | Near-duplicate of project_schema_drift_pattern; naming-trap table is unique and must be absorbed. | Merge | MERGED |
| billing-payments | product | ARCHIVE | uphold | high | All content extracted into MMT-ADR-0004; architecture.md:113 closed the Stripe-only gap. | Archive | ARCHIVED |
| project_deploy_safety | product | ARCHIVE | uphold | high | All rules verbatim in AGENTS.md; two factual claims (CI push, DEPLOY_ENV unused) both wrong. | Archive | ARCHIVED |
| feedback_agent_checkpoint_cadence | user | REVISE | uphold | high | Stale cross-ref to archived feedback_agents_commit_push.md; core 4-min rule unique. | Revise | REVISED |
| feedback_e2e_cascade_root_cause | user | REVISE | uphold | high | Wrong commit hash; two broken cross-refs to archived/deleted memories. | Revise | REVISED |
| feedback_fast_iteration | user | REVISE | uphold | high | Stale pointer from CLAUDE.md to AGENTS.md for sweep rule. | Revise | REVISED |
| feedback_just_do_it | user | REVISE | uphold | high | Single stale citation: CLAUDE.md header that no longer exists. | Revise | REVISED |
| feedback_comment_not_delete | user | ARCHIVE | CONFLICT → operator ruling | high | Ruled 2026-06-10: AGENTS.md:334 clean-removal rule stands; memory superseded. | ARCHIVE | ARCHIVED |
| feedback_homework_not_socratic | user | ARCHIVE | uphold | high | FR31 (PRD:1041) fully covers all content verbatim. | ARCHIVE | ARCHIVED |
| project_agent_doc_and_memory_architecture_revisit | mixed | REVISE | corrective: REVISE→REVISE (uphold) | high | Corrective: narrowed — remove only the dead sync_script_extension pointer; no tombstone-collapse of Issue 1. | REVISE | REVISED |
| reference_notion_workspace | mixed | REVISE | uphold | high | Windows Doppler path; missing frontmatter fields. | REVISE | REVISED |

---

## Needs a ruling

### CONFLICT 1 — feedback_comment_not_delete

**Memory says:** When the user asks to "remove" UI code for a future or unreleased feature, comment it out (JSX comment blocks) rather than deleting. Keep hooks/state/handlers intact so uncommenting restores the feature. "Deleting forces reconstruction; commenting out is a quick toggle."

**Canon says (AGENTS.md:334, Code Quality Guards):** "Clean up all artifacts when removing a feature. Grep the entire project for all references: types, imports, constants, SecureStore keys, commented-out JSX, fallback branches. Orphaned types create false confidence, unreachable fallback branches inflate coverage, leaked storage keys waste device storage forever."

**The conflict.** The memory's posture applies to temporarily-hidden, not-yet-released features (quick toggle for re-enable). The canon rule was written for completed feature removals (sweep everything). Both sources are verified accurate and neither defines a scope boundary. Agents receiving a "remove this feature" instruction will get contradictory guidance about whether to delete or comment.

**Required ruling.** Does the comment-out practice still hold, and if so, what is the precise scoping condition (e.g., "only for features tagged future/unreleased in the WI, never for completed-removal decisions")? If the practice is superseded, the memory should be archived. If a scope boundary is added, it should be written into both the memory and an AGENTS.md exception.

**✅ RULED (2026-06-10, operator):** Stick with the AGENTS.md rule — the clean-removal guard (AGENTS.md:334) stands unqualified; the comment-out practice is superseded. **Final bucket: ARCHIVE.** No AGENTS.md change needed.

---

### CONFLICT 2 — feedback_never_lock_topics

**Memory says:** The Epic 7 REQUIRED relationship type "should behave like RECOMMENDED — never prevent the student from starting a topic." Surface warnings and inject LLM context, but never block access.

**Canon says (docs/PRD.md:1371):** "REQUIRED — topic is locked until prerequisite reaches 'strong' retention. Enforced by unlock logic (FR119)." Architecture.md:362 confirms the `REQUIRED | RECOMMENDED` enum on `topic_prerequisites`.

**Additional PRD self-inconsistency found by verifier.** FR124 (PRD:1365) states "dependent topics remain accessible" when a prerequisite is skipped — directly contradicting the REQUIRED-lock definition at PRD:1371. The conflict is therefore three-way: the memory, the PRD definitional section, and FR124's operational behavior all disagree.

**Background.** The Epic 7 v3 archived spec (`docs/_archive/specs/Done/2026-04-04-epic-7-library-design.md:254`) abolished the prerequisite table entirely; the living PRD §Concept Map (v1.1) reinstated REQUIRED locking. No ADR adjudicates this.

**Required ruling.** (1) Is the REQUIRED relationship type a hard lock (FR119) or an advisory signal? (2) Is FR124 ("dependent topics remain accessible when prerequisite is skipped") still the operative behavior? (3) Should the memory be archived (posture superseded) or promoted to a PRD clarification request? The verifier's note: the PRD's self-inconsistency makes this a three-way conflict — resolution likely requires fixing both the memory AND the PRD at the same time.

---

## Corrective pass (2026-06-10)

A second workflow pass (`wi387-triage-corrective-pass`, run `wf_29617a53-d8b`, 33 agents, all verifies upheld) re-audited 21 suspect dispositions after two premise defects were found and the operator ratified corrected rules:

1. **Coverage roster** — "covered/duplicated" counts only against: `docs/canon/**`, `docs/adr/`, `AGENTS.md`, root `CONTEXT.md`, and the loose spine trio (`docs/architecture.md`, `docs/PRD.md`, `docs/ux-design-specification.md`). NOT counting: `_archive/`, `docs/specs/epics.md`, `docs/project_context.md`, `docs/flows/**`, code, or any other doc. Content only in non-counting locations is not formally captured — documentation-grade truth there means DRAIN (→ Stream-2 backlog), never ARCHIVE.
2. **Revise drivers** — factual wrongness, duplication (remove, or pointer where the stub has reminder value), and drain only. Frontmatter/schema conformance and doctrinal pointer-ification are ratified out.


| Memory                                            | Prior   | Corrected | Outcome | Verify       |
| --------------------------------------------------- | --------- | ----------- | --------- | -------------- |
| billing-payments                                  | ARCHIVE | ARCHIVE   | stands  | uphold       |
| feedback_audit_check_deleted_concepts             | KEEP    | KEEP      | stands  | not-required |
| feedback_llm_prompt_injection_surfacing           | KEEP    | KEEP      | stands  | not-required |
| pricing_dual_cap                                  | REVISE  | REVISE    | stands  | not-required |
| project_brand_dark_first                          | ARCHIVE | DRAIN     | CHANGED | uphold       |
| project_freeform_library_filing_decision          | ARCHIVE | DRAIN     | CHANGED | uphold       |
| project_session_lifecycle_decisions               | ARCHIVE | DRAIN     | CHANGED | uphold       |
| feedback_agent_checkpoint_cadence                 | REVISE  | REVISE    | stands  | not-required |
| feedback_e2e_cascade_root_cause                   | REVISE  | REVISE    | stands  | not-required |
| project_language_assessments_production_first     | REVISE  | DRAIN     | CHANGED | uphold       |
| project_book_generation_pass                      | KEEP    | KEEP      | stands  | not-required |
| project_eas_update_ota                            | KEEP    | DRAIN     | CHANGED | uphold       |
| feedback_no_ota_unless_asked                      | KEEP    | KEEP      | stands  | not-required |
| feedback_fast_iteration                           | REVISE  | REVISE    | stands  | not-required |
| feedback_never_force_add_child                    | REVISE  | REVISE    | CHANGED | uphold       |
| project_agent_doc_and_memory_architecture_revisit | REVISE  | REVISE    | CHANGED | uphold       |
| feedback_no_jargon_kid_language                   | REVISE  | KEEP      | CHANGED | uphold       |
| feedback_testing_tracking_only                    | REVISE  | KEEP      | CHANGED | uphold       |
| feedback_use_sonnet_agents                        | REVISE  | KEEP      | CHANGED | uphold       |
| user_device_small_phone                           | REVISE  | KEEP      | CHANGED | uphold       |
| reference_notion_workspace                        | REVISE  | REVISE    | stands  | not-required |

---

## DRAIN backlog

These nine memories are ready to drain to L1/L3 canon. Format mirrors the Stream-2 backlog (`_dev/eduagent-build/_wip/umbrella-program/stream-2-backlog.md`): each entry is standalone and ready to paste as a backlog item.

---

### DRAIN-1 — feedback_human_override_everywhere

**Memory:** `.claude/memory/feedback_human_override_everywhere.md`
**Target layer:** L1 — `docs/PRD.md` or `docs/ux-design-specification.md` (design principles section)
**Disposition matrix reference:** `_wip/identity-foundation/2026-06-09-instruction-surface-disposition-matrix-v0.md` row 143 — PROMOTE/REPOINT, target "UX/product canon or DoR" (not yet executed).

**Content to drain:**
Every AI-driven screen must have a human override escape hatch: subject selection allows manual input; topic ordering is a recommendation not a requirement; session flow permits redirect/skip/challenge; coaching cards are surfaced as suggestions, not directives. The "Why" rationale (AI is a guide, not an authority) and the "How to apply" bullet list auditing all affected screens are the durable unique content. Absence confirmed: `docs/PRD.md`, `docs/ux-design-specification.md`, `docs/canon/`, and all ADRs return zero matches for "human override", "AI.*guide.*not.*authority", and "escape hatch".

**Active references:** The principle is applied in `docs/_archive/plans/done/2026-05-05-assessment-wiring.md:205` — confirming it is a live design constraint used in implementation.

**What remains after drain:** A one-line pointer citing the target doc section. The memory type is `feedback` so it stays in `.claude/memory/`; its body becomes the pointer.

---

### DRAIN-2 — project_language_pedagogy

**Memory:** `.claude/memory/project_language_pedagogy.md`
**Target layer:** L1 — `docs/architecture.md` section starting at line 1357 ("Epic 6 extension point")

**Content to drain:**
The as-built architecture of the language-teaching feature: `pedagogyModeSchema`, `languageCodeSchema`, `CefrLevel`, `Vocabulary` types in `packages/schemas/src/language.ts`; `pedagogyMode` required on Subject (non-optional, defaults at create-time); `nativeLanguage` stored on `teachingPreferences` (per-subject, not per-profile, with `profileId+subjectId` unique pair at `packages/database/src/schema/assessments.ts:241-244`); vocabulary + `languageProgress` route design; the language-setup onboarding flow; CEFR tracking. `docs/architecture.md:1357` still reads "Epic 6 extension point (v1.1): Language learning … will require" (future-tense) — the as-built description is missing entirely. The feature is fully merged (`diverse` branch gone); `docs/glossary.md:641` has a one-line pointer but no architecture detail.

**What remains after drain:** A thin cross-pointer to `docs/architecture.md` Epic 6 section and a cross-reference to `market_language_pivot.md`. The implementation inventory (schema types, routes, mobile components, hooks) and architecture notes (pedagogyMode/nativeLanguage placement) become part of the architecture doc; the status block (branch + PR reference) is dropped.

---

### DRAIN-3 — project_llm_source_provenance

**Memory:** `.claude/memory/project_llm_source_provenance.md`
**Target layer:** L1 — `docs/architecture.md` §LLM Response Envelope section (currently at lines 1239-1288), which covers signals/ui_hints/confidence but has zero coverage of `private_sources` or `factual_confidence`.

**Content to drain:**
The `private_sources` sub-contract: schema (`relied_on`, `insufficient`, `reason`, `factual_confidence`); the 0.88 confidence gate for `general_knowledge` eligibility; source-bound categories that require a reliable source pack; `sourceAudit` server-side persistence for explainability; streaming replace-frame alignment; the tripwire principle (universal policy, not topic-specific). All confirmed live in `packages/schemas/src/llm-envelope.ts:64,74` and `apps/api/src/services/exchange-prompts.ts:157,440-445`. Confirmed absent from `docs/architecture.md:1239-1288`, `docs/PRD.md`, `docs/adr/`, and `docs/canon/`.

**Note:** If the 0.88 threshold was a contested decision, an ADR may be warranted alongside the architecture.md extension (per the MMT-ADR-0000 significance gate). The triage does not mandate an ADR, but the decision author should assess.

**What remains after drain:** A pointer citing `docs/architecture.md §LLM Response Envelope` and noting `pnpm test:llm:enduser` as the validation gate. Recovery history and tolerance rationale (type-(b), not in any other doc) are retained in the memory body.

---

### DRAIN-4 — project_known_bug_patterns

*(Reconstructed from the workflow journal — dropped by the synthesis agent's first cut.)*

**Memory:** `.claude/memory/project_known_bug_patterns.md`
**Target layer:** L3 — `AGENTS.md ## Code Quality Guards` (as named guards alongside GC1–GC6)

**Content to drain:**
Pattern 1 — Silent Fallbacks: `?? []` on query `.data`, success-shaped catch returns, `void mutateAsync` without `.catch`, raw LLM text in fallbacks (4 sub-patterns). Pattern 2 — React state timing: `isPending` is not a sufficient concurrency guard in Alert-retry flows; require a `useRef(false)` in-flight lock alongside it. Fixes confirmed live (`[bookId].tsx:1013`, `session-summary/[sessionId].tsx:138-139`, `session/index.tsx:427`); the only written record is the archived ADR-register draft (STAB-03/04/07, `docs/_archive/parallel-adr-audit-2026-06-03/ADR-register-draft.md:460-464`), which carries no how-to-detect/how-to-apply guidance. Absent from AGENTS.md Code Quality Guards (`AGENTS.md:326-336`). Still actionable: 15 `?? []` sites remain in `apps/mobile/src`.

**What remains after drain:** Archive the memory with a tombstone pointing at the AGENTS.md section where the guards landed.

---

### DRAIN-5 — project_brand_dark_first

*(Added by the corrective pass, 2026-06-10 — prior disposition ARCHIVE rested on non-counting coverage.)*

**Memory:** `.claude/memory/project_brand_dark_first.md`
**Target:** Stream-2 estate-canon-drain | docs/canon/identity/ or a new MMT-ADR on brand theming | hex palette (#1a1a3e navy, #faf5ee cream, #2dd4bf teal, #a78bfa lavender), no-accent-picker decision + rationale, user override mechanic (dark/light/system), dark-mode-is-brand framing, post-launch neutral/slate contingency

**Rationale:** Prior ARCHIVE relied primarily on epics.md (lines 739-757), which does not count under the corrected roster. The single counting-doc citation that survives — architecture.md:132 — covers only "teal primary + lavender secondary, dark-first default, system preference by default, one light + one dark palette." It does NOT cover: specific hex values (#1a1a3e, #faf5ee, #2dd4bf, #a78bfa), the no-accent-picker decision and its rationale, the user-override mechanic (dark/light/system toggle in app settings), the dark-mode-as-brand framing, or the post-launch neutral/slate contingency. These are documentation-grade decisions not captured in any counting doc. Archiving them would be information loss; DRAIN is the correct disposition.

**What remains after drain:** archive the memory, or reduce it to a pointer at the target if the reminder has agent value — executed by WI-387 once the Stream-2 backlog carries the entry.

---

### DRAIN-6 — project_freeform_library_filing_decision

*(Added by the corrective pass, 2026-06-10 — prior disposition ARCHIVE rested on non-counting coverage.)*

**Memory:** `.claude/memory/project_freeform_library_filing_decision.md`
**Target:** product layer | docs/PRD.md | freeform chat library-filing policy: auto-file when confident, ask only when ambiguous, always allow correction; "Keep out of Library" UX copy (not "Don't save"); retire post-close "Add to library?" footer prompt; user opting out keeps session history/summary/transcript but suppresses curriculum filing and topic progress/retention

**Rationale:** Prior ARCHIVE was wrong: its sole coverage citations were docs/_archive/specs/Done/2026-05-23-freeform-library-filing.md and its companion plan — both _archive/ locations, which the corrected roster explicitly excludes. Checking every counting doc: PRD.md has no mention of the filing policy; docs/ux-design-specification.md mentions freeform mode but is silent on the filing decision; CONTEXT.md defines only the "Filing" vocabulary term (the async pipeline + status states), not the product policy choices; docs/adr/ has no filing ADR; docs/canon/ is identity-only. The memory's content (auto-file vs. ask policy, "Keep out of Library" copy, post-close footer retirement, reconcile-six-flow-specs directive) is documentation-grade product truth with no home in any counting doc — it must be drained to PRD.md, not archived.

**What remains after drain:** archive the memory, or reduce it to a pointer at the target if the reminder has agent value — executed by WI-387 once the Stream-2 backlog carries the entry.

---

### DRAIN-7 — project_session_lifecycle_decisions

*(Added by the corrective pass, 2026-06-10 — prior disposition ARCHIVE rested on non-counting coverage.)*

**Memory:** `.claude/memory/project_session_lifecycle_decisions.md`
**Target:** docs/architecture.md — Session Lifecycle section | add: wall-clock vs active-time rationale, computeActiveSeconds() gap-cap algorithm (FR210), "how to apply" UI rule (wallClockSeconds for display, durationSeconds for analytics only), hard-cap removal rationale, LLM-adaptive silence detection design

**Rationale:** Prior ARCHIVE rested entirely on epics.md as coverage — a non-counting doc under the corrected rules. Under the corrected roster, the only counting-doc hit is docs/architecture.md line 1675, a one-line Epic 13 summary table entry ("Wall-clock for users, active time internal, adaptive silence, recovery, celebrations | DONE"). That entry names the features but carries none of the rationale, the computeActiveSeconds() gap-cap algorithm (FR210), the UI "how to apply" rule (wallClockSeconds for display; durationSeconds internal only), or the hard-cap removal reasoning. No other counting doc (AGENTS.md, CONTEXT.md, docs/adr/, docs/canon/, PRD.md, ux-design-specification.md) contains this content. The memory is the only real record of these decisions; archiving it is information loss.

**What remains after drain:** archive the memory, or reduce it to a pointer at the target if the reminder has agent value — executed by WI-387 once the Stream-2 backlog carries the entry.

---

### DRAIN-8 — project_language_assessments_production_first

*(Added by the corrective pass, 2026-06-10 — prior disposition REVISE rested on non-counting coverage.)*

**Memory:** `.claude/memory/project_language_assessments_production_first.md`
**Target:** L1 | docs/PRD.md (language-learning / assessment design section) or docs/canon/identity/prd.md | Pedagogical rule: language reviews must target usable production (target-language words/chunks, spelling tolerance, tiny exchanges), not meta-knowledge; ask concrete tasks like "say hello in Italian", "translate a phrase", "use it in a two-line exchange"; avoid "main ideas", "what other words did we cover", and culture-ish questions unless the lesson explicitly taught culture/register. Rationale: generic assessment prompts drifted into "what is a greeting" framing in the 2026-05-18 review flow.

**Rationale:** The prior DRAIN→REVISE overturning rested on "the rule is encoded in assessments.ts code." The operator's corrected rules are explicit: code is NOT a counting doc. The production-first language assessment rule is a documentation-grade pedagogical design constraint — it determines how LLM assessment prompts must be framed. No counting doc covers it: docs/PRD.md, docs/architecture.md, docs/canon/identity/prd.md, docs/canon/identity/domain-model.md, AGENTS.md, CONTEXT.md, and all MMT-ADRs all return zero matches. The rule is the sole real record of this constraint. DRAIN is the correct disposition; REVISE was wrong.

**What remains after drain:** archive the memory, or reduce it to a pointer at the target if the reminder has agent value — executed by WI-387 once the Stream-2 backlog carries the entry.

---

### DRAIN-9 — project_eas_update_ota

*(Added by the corrective pass, 2026-06-10 — prior disposition KEEP rested on non-counting coverage.)*

**Memory:** `.claude/memory/project_eas_update_ota.md`
**Target:** spine | docs/architecture.md | EAS Update / OTA deployment behavior: CI ota-update job owns normal preview OTA publishing; `eas update` does not read `eas.json` build-profile env (must set EXPO_PUBLIC_* explicitly in the shell); manual OTA requires explicit user instruction

**Rationale:** Prior KEEP was justified against docs/deployment-and-secrets.md as "live canon source" — but under the corrected roster that file is not a COUNTING doc (not in docs/canon/, not an ADR, not the spine trio, not AGENTS.md/CONTEXT.md). No COUNTING doc covers OTA/EAS Update behavior: docs/architecture.md, AGENTS.md, CONTEXT.md, and docs/canon/ all confirmed empty on eas-update/OTA queries. The memory holds true, non-duplicative documentation-grade truth — the behavioral guard and the eas.json env gotcha — with no formal home. Per operator rules, this is DRAIN (never ARCHIVE when the memory is the only record). Target: docs/architecture.md deployment section.

**What remains after drain:** archive the memory, or reduce it to a pointer at the target if the reminder has agent value — executed by WI-387 once the Stream-2 backlog carries the entry.

---

## Per-memory detail

### billing-payments

**⟲ Corrective pass (2026-06-10):** re-audited under the ratified coverage roster — disposition stands; rationale re-derived from counting docs only.

**Final bucket:** ARCHIVE

**Triage→Verify:** ARCHIVE → uphold

**Rationale:** All substantive content extracted into MMT-ADR-0004 (ADR provenance note explicitly names billing-payments.md as its sole source). Architecture.md:113 now reads "RevenueCat (native IAP) + Stripe (dormant, for future web)" — the Stripe-only gap is closed. Epic 9 is DONE. The one remaining cross-reference (store connections blocked → project_revenuecat_setup.md) is a status note belonging in that setup file, not an architectural rule.

**Evidence:**

- "ADR extracted from billing-payments.md" — docs/adr/MMT-ADR-0004 § Provenance — confirmed
- "architecture.md implies Stripe-only" — docs/architecture.md:113 — now reads both providers
- "Epic 9 COMPLETE" — docs/specs/epics.md:442 — DONE confirmed
- "Do-not-delete Stripe, do-not-provision Stripe secrets" — MMT-ADR-0004 § Consequences — confirmed

---

### doppler-secrets

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Rationale:** Verified operational facts (Doppler project/config table, `doppler run` wrapper pattern, `zdx-config.yaml` selector, `load-database-env.ts` macOS path, Windows-path package.json scripts, `test:api:unit` without Doppler wrap) have no dedicated L3 home and are worth keeping. The claim that `idempotency-assistant-state.test.ts` fails without `DATABASE_URL` is contradicted by that file's comment (line 71: "These run without a real DB"). WI-89/PR #373/#374 history is resolved historical context.

**Revise action:** Remove the paragraph about the idempotency test failing without DATABASE_URL (contradicted by code). Remove the WI-89 session/PR reference. Trim to: Doppler project/config table, verified `doppler run` wrap pattern, pointer to `zdx-config.yaml`, pointer to `packages/test-utils/src/lib/load-database-env.ts`, macOS/Windows CLI paths. Update `last_confirmed` to 2026-06-10.

**Evidence:**

- "idempotency test does not require real DB" — apps/api/src/services/idempotency-assistant-state.test.ts:71 — "These run without a real DB by passing a db that throws on first use"
- "load-database-env.ts confirms /opt/homebrew/bin/doppler" — packages/test-utils/src/lib/load-database-env.ts:20 — confirmed
- "test:api:unit has no doppler wrap" — package.json:13 — confirmed
- "\.integration\.test\.ts$ excluded" — apps/api/jest.config.cjs:64 — confirmed

---

### feedback_agent_checkpoint_cadence

**⟲ Corrective pass (2026-06-10):** re-audited under the ratified coverage roster — disposition stands; rationale re-derived from counting docs only.

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Replace cross-reference "The no-git rule in `feedback_agents_commit_push.md` still wins" with a pointer to AGENTS.md (the harness-hygiene worktree's equivalent substance at AGENTS.md:95: "Agents perform code changes in isolated worktrees they own...and commit from there"). Bump `last_confirmed` to 2026-06-10.

**Evidence issues flagged by verifier:** Evidence item 4 quotes a verbatim phrase from the main CLAUDE.md, not from the harness-hygiene AGENTS.md — the wording in the worktree AGENTS.md is different. The replacement cross-reference should quote AGENTS.md:95 wording, not the CLAUDE.md phrase.

**Evidence:**

- "4-minute rule absent from AGENTS.md" — AGENTS.md (grep 'checkpoint') — 0 matches
- "Rule applied in practice" — docs/audit/2026-05-15-persona-store-compliance-triage.md:49 — exact rule applied
- "feedback_agents_commit_push.md in archive only" — docs/_archive/memory/feedback_agents_commit_push.md — confirmed archived
- "No-git rule substance live in AGENTS.md" — AGENTS.md:95 — confirmed (different wording from CLAUDE.md)

---

### feedback_audit_check_deleted_concepts

**⟲ Corrective pass (2026-06-10):** re-audited under the ratified coverage roster — disposition stands; rationale re-derived from counting docs only.

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** Type:feedback, category (c) methodology memory. The historical example (isLearner surviving post-Epic 12 sweep) is corroborated by `persona-fossil-guard.test.ts`. The procedural step "grep docs/specs/epics.md" points to a live file. Fossils may have been cleaned, but the lesson is about the reasoning pattern, not current system state.

**Evidence:**

- "Epic 12 deleted personaType" — docs/specs/epics.md:768 — confirmed
- "isLearner was a persona fossil" — persona-fossil-guard.test.ts:6-8 — confirmed
- "isLearner in FOSSIL_PATTERNS" — persona-fossil-guard.test.ts:15-20 — confirmed
- "isLearner cleaned from RemediationCard.tsx/relearn.tsx" — rg result — 0 matches (fossils removed)

---

### feedback_autonomous_speccing

**Final bucket:** KEEP (overturned from REVISE)

**Triage→Verify:** REVISE → overturn → KEEP

**Overturn reasoning:** The REVISE action was based on applying the Nexus global memory schema (which requires `created`/`last_confirmed`/`status`) to a repo that uses a lighter 3-field schema. The project-memory skill (`.agents/skills/project-memory/SKILL.md`) requires only `name`, `description`, `type` — matching exactly what the file has. Every peer memory file in this repo follows the same 3-field pattern. There is nothing to fix.

**Evidence issues:** Evidence items 3 and 4 cite `AGENTS.md#Memory File Schema` — that section does not exist in this repo's AGENTS.md. The schema authority here is the project-memory skill, not the Nexus AGENTS.md.

---

### feedback_comment_not_delete

**Final bucket:** ARCHIVE (operator ruling 2026-06-10)

**Triage→Verify:** CONFLICT → uphold → ruled: AGENTS.md clean-removal rule stands, memory superseded

See **Needs a ruling — CONFLICT 1** above (now ruled). Both citations verified exact.

---

### feedback_doppler_secrets

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** (1) Replace body with pointer to AGENTS.md § Secrets Management for the 'all secrets via Doppler' rule and wrangler prohibition. (2) Pointer to docs/deployment-and-secrets.md for EXPO_PUBLIC eas.json sync workflow and EAS Environment Variables (using correct command `eas env:create`, not `eas secret:create`). (3) Retain `C:\Tools\doppler\doppler.exe` Windows CLI path as machine-specific state not documented elsewhere. (4) Remove the `SENTRY_AUTH_TOKEN → eas secret:create` sentence — wrong command and wrong denylist subject (correct subject is `EXPO_PUBLIC_SENTRY_DSN`).

**Evidence issues flagged by verifier:** Evidence item 2 cites `scripts/setup-env.js:36` but line 36 is inside the CONFIG_MAP object — `pnpm env:sync` is defined at `package.json:44`. Minor line-number imprecision; underlying claim confirmed elsewhere.

**Evidence:**

- "'All secrets via Doppler' verbatim in AGENTS.md" — AGENTS.md:357 — confirmed
- "pnpm env:sync documented" — docs/deployment-and-secrets.md:410 + scripts/setup-env.js:166 — confirmed
- "eas env:create (not eas secret:create)" — docs/deployment-and-secrets.md:423-444 — confirmed
- "Windows Doppler path current" — package.json:12-35 — confirmed

---

### feedback_e2e_cascade_root_cause

**⟲ Corrective pass (2026-06-10):** re-audited under the ratified coverage roster — disposition stands; rationale re-derived from counting docs only.

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Replace commit hash `03507f33` with `499bf66c1`. Replace cross-reference to `feedback_fix_root_cause.md` with note that root-cause rule is now absorbed into AGENTS.md (Required Validation section). Replace cross-reference to `feedback_verify_before_marking_done.md` with note that verify-before-done rule is now in `.agents/skills/verification-before-completion/SKILL.md`. Update `last_confirmed` to 2026-06-10.

**Evidence:**

- "e2e session log exists" — docs/_vault/emulator-2026-04-30/E2Edocs/e2e-session-2026-04-22-struggles.md — confirmed
- "Preflight cites BUG-594..622" — apps/mobile/e2e/scripts/e2e-preflight.sh:4-11 — confirmed
- "03507f33 not in any branch" — git log — confirmed absent; real commit is 499bf66c1
- "feedback_fix_root_cause.md absent from memory/ and _archive/" — confirmed
- "feedback_verify_before_marking_done.md absent" — confirmed

---

### feedback_fast_iteration

**⟲ Corrective pass (2026-06-10):** re-audited under the ratified coverage roster — disposition stands; rationale re-derived from counting docs only.

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Update line 17: replace `required by CLAUDE.md \`Sweep when you fix\``with`required by AGENTS.md ## Fix Development Rules ("fixing a drift that has 3+ sibling locations")` — CLAUDE.md is a thin @AGENTS.md pointer and the sweep rule lives in AGENTS.md:323 with different wording.

**Evidence:**

- "Memory line 17 cites 'CLAUDE.md Sweep when you fix'" — .claude/memory/feedback_fast_iteration.md:17 — confirmed
- "CLAUDE.md is thin @AGENTS.md pointer" — CLAUDE.md:1-4 — confirmed
- "'Sweep when you fix' heading absent from AGENTS.md" — AGENTS.md:323 — different wording
- "Core preference unique to memory" — docs/ rg — 0 matches

---

### feedback_homework_not_socratic

**Final bucket:** ARCHIVE

**Triage→Verify:** ARCHIVE → uphold

**Rationale:** FR31 at PRD:1041 (revised by FR228, Epic 14) captures direct explanation not Socratic, two sub-modes, FR228 revision, and Socratic retained for learning mode. Lines 695-696 cover sub-modes; line 700 covers "AI never provides final answer." No working-state or unique preference survives the coverage check.

**Evidence:**

- "FR31 covers non-Socratic, sub-modes" — docs/PRD.md:1041 — confirmed verbatim
- "Check my answer/Help me mechanics" — docs/PRD.md:695-696 — confirmed
- "AI NEVER provides final answer" — docs/PRD.md:700 — confirmed verbatim
- "Socratic for learning only" — docs/PRD.md:1041 — confirmed

---

### feedback_human_override_everywhere

**Final bucket:** DRAIN

**Triage→Verify:** DRAIN → uphold

See **DRAIN backlog — DRAIN-1** above for the complete drain specification.

---

### feedback_just_do_it

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Replace `CLAUDE.md \`Sweep when you fix\``with`AGENTS.md § Fix Development Rules ("When fixing a drift that has 3+ sibling locations...")` on the final line.

**Evidence:**

- "Core 'just execute' preference absent from AGENTS.md" — AGENTS.md — 0 matches
- "Sweep rule in AGENTS.md at line 323, no 'Sweep when you fix' heading" — AGENTS.md:323 — confirmed
- "CLAUDE.md is @AGENTS.md pointer only" — CLAUDE.md:3-5 — confirmed

---

### feedback_llm_prompt_injection_surfacing

**⟲ Corrective pass (2026-06-10):** re-audited under the ratified coverage roster — disposition stands; rationale re-derived from counting docs only.

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** The injection mitigation checklist (structured output, delimiter wrapping, allowlist validation, break test, DPA scope note) is absent from AGENTS.md and architecture.md as a standing rule. AGENTS.md mandates Failure Modes tables but gives no cross-user LLM injection mitigation checklist. The originating spec is Done/archived, confirming a learned pattern.

**Evidence:**

- "Mitigations absent from AGENTS.md" — AGENTS.md § UX Resilience Rules — 0 checklist matches
- "Spec contains all five mitigations" — docs/_archive/specs/Done/2026-04-18-progress-empty-states-highlights-design.md:267 — confirmed
- "Architecture.md has no injection pattern" — docs/architecture.md — 0 relevant hits

---

### feedback_never_force_add_child

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: REVISE** (was REVISE; verify: uphold)

REVISE survives but the action is narrowed. The "How to apply" paragraph cites `AddFirstChildScreen` and `isParentWithNoChildren` / `hasLinkedChildren` checks as live code — both are absent from the current codebase (zero hits in apps/). That is a driver-1 factual error and the only legitimate REVISE trigger under corrected rules. The prior revise_action also included "add a pointer to docs/canon/identity/prd.md:408" — that is pointer-ification for doctrinal purity, which the operator explicitly excluded as a REVISE driver. The corrected action is: delete the stale "How to apply" paragraph only. The principle statement and "Why" paragraph are true and are not duplicated in any counting doc at the level of behavioral guidance.

**Corrected revise action:** Delete the "How to apply" paragraph in full (the block beginning "When touching any gate based on `isParentWithNoChildren`…"). It is the only factually false content. The principle statement and "Why" paragraph are accurate and not covered at behavioral depth in any counting doc — leave them intact. No pointer to canon is required.

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** REVISE (overturn: revise_action corrected, bucket unchanged)

**Triage→Verify:** REVISE → overturn (bucket stays REVISE, but revise_action corrected)

**Overturn reasoning:** The original revise_action said to remove `isParentWithNoChildren`/`hasLinkedChildren` enumeration as "those code paths are gone" — but `hasLinkedChildren` is live in `apps/mobile/src/components/home/LearnerScreen.tsx:129,149` and referenced in AGENTS.md:158. Only `AddFirstChildScreen` (archive-only) is stale. The file pointer in the memory should be updated to `LearnerScreen.tsx` and the stale home.tsx-as-gating-owner claim removed; `hasLinkedChildren` is retained as a live check name.

**Corrected revise action:** Remove `apps/mobile/src/app/(app)/home.tsx AddFirstChildScreen` reference (file gone from live source). Remove `isParentWithNoChildren` (absent). Keep `hasLinkedChildren` and update pointer to `apps/mobile/src/components/home/LearnerScreen.tsx:129,149`. Add pointer to `docs/canon/identity/prd.md §'Family-operator surface' (line 408)`. Keep principle and Why paragraph intact.

**Evidence:**

- "Core principle ratified in canon" — docs/canon/identity/prd.md:408 — "not a hard gate; never force add-child"
- "AddFirstChildScreen absent from live source" — rg across apps/mobile/src — 0 matches
- "hasLinkedChildren live in LearnerScreen.tsx:149" — verifier — confirmed
- "hasLinkedChildren referenced in AGENTS.md:158" — AGENTS.md:158 — confirmed

---

### feedback_never_lock_topics

**Final bucket:** CONFLICT

**Triage→Verify:** CONFLICT → uphold

See **Needs a ruling — CONFLICT 2** above. Verifier additionally identified an internal PRD inconsistency (FR124 vs PRD:1371) making this a three-way conflict.

---

### feedback_never_switch_branch

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** The explicit git checkout/switch prohibition, subagent enforcement rule, and pre-flight self-check are absent from AGENTS.md. AGENTS.md:113 covers only the worktree carve-out. Global CLAUDE.md:50 has "Stay on checked-out branch" but lacks the subagent scope.

**Evidence:**

- "Prohibition absent from AGENTS.md" — AGENTS.md — only line 113 (worktree carve-out)
- "Worktree carve-out consistent" — AGENTS.md:113 — consistent
- "Subagent/pre-flight detail unique to memory" — .claude/memory/feedback_never_switch_branch.md:3-18 — confirmed
- "Global CLAUDE.md partial equivalent" — ~/.claude/CLAUDE.md:50 — less specific, no subagent scope

---

### feedback_no_jargon_kid_language

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: KEEP** (was REVISE; verify: uphold)

Prior REVISE rested on two legs: (1) missing frontmatter fields — ruled out as a driver under corrected rules; (2) "Why" paragraph re-states UX spec coverage and should be pointer-ified — operator explicitly excludes pointer-ification for doctrinal purity as a REVISE driver. With both legs removed, no substantive driver remains. The memory is factually true, and its unique load-bearing content (the six concrete jargon examples, the verb-over-noun/concrete-over-abstract heuristic, and the moment-based language examples) is confirmed absent from all counting docs. The "Why" paragraph partially overlaps docs/ux-design-specification.md §7 (line 207) and the cognitive-accessibility table (line 1826) but adds non-duplicated framing (all-ages scope, moment examples). A true, non-duplicative, useful memory needs no change.

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Add missing frontmatter fields (`created`, `last_confirmed: 2026-06-10`, `status: active`). Compress the Why paragraph to a one-line pointer citing `docs/ux-design-specification.md §7 (line 207)` and the cognitive-accessibility table (line 1826) where the general principle is already canonised. Retain the jargon example list and the How-to-apply heuristic — these are not present in canon's copy guidelines.

**Evidence issues flagged by verifier:** Evidence item 4 claimed "zero hits" for all six jargon terms — false for "Coaching card" (~25 hits), "Retention" (~23 hits), "Curriculum" (2 hits). The correct claim is that these terms are not listed as forbidden UI strings in the spec's copy guidelines section. The REVISE disposition is still correct.

**Evidence:**

- "General no-jargon principle in UX spec" — docs/ux-design-specification.md:207 — confirmed
- "Vocabulary table covers tone split" — docs/ux-design-specification.md:1165 — confirmed
- "Cognitive accessibility plain language" — docs/ux-design-specification.md:1826 — confirmed
- "Memory referenced from live backlog" — docs/ux-todos.md:84 — confirmed
- "Frontmatter missing created/last_confirmed/status" — .claude/memory/feedback_no_jargon_kid_language.md:1-5 — confirmed

---

### feedback_no_ota_unless_asked

**⟲ Corrective pass (2026-06-10):** re-audited under the ratified coverage roster — disposition stands; rationale re-derived from counting docs only.

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** OTA agent-behavior constraint absent from AGENTS.md and deployment-and-secrets.md. Sibling pointer `project_eas_update_ota.md:18` explicitly delegates the preference guard here.

**Evidence:**

- "Rule absent from AGENTS.md" — AGENTS.md — 0 matches for 'eas update'
- "deployment-and-secrets.md covers CI OTA only" — docs/deployment-and-secrets.md:528-532 — no agent-behavior constraint
- "Sibling pointer delegates here" — .claude/memory/project_eas_update_ota.md:18 — confirmed
- "Type: feedback, category (c)" — .claude/memory/feedback_no_ota_unless_asked.md:3-11 — confirmed

---

### feedback_quiet_defaults_over_friction

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** Principle absent from all live docs/. Legitimate category (c) user/feedback preference from three named spec reviews. Indexed in MEMORY.md.

**Evidence:**

- "Principle absent from all live docs/" — rg 'quiet.default|friction|surveillance' — 0 matches
- "Type: feedback" — frontmatter confirmed
- "Indexed in MEMORY.md" — .claude/memory/MEMORY.md:94 — confirmed

---

### feedback_testing_tracking_only

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: KEEP** (was REVISE; verify: uphold)

Prior REVISE was driven entirely by missing frontmatter fields (created, last_confirmed, status). Under corrected rules, frontmatter/schema conformance is explicitly not a REVISE driver — the operator ratified it out. The content itself is true (user stated 2026-04-19, nothing in the branch supersedes it), not duplicated in any counting doc (AGENTS.md, docs/canon/**, docs/adr/**, CONTEXT.md, architecture.md, PRD.md, ux-design-specification.md all searched — zero hits for this protocol), and is an agent behavioral preference with real reminder value. A memory that is true, non-duplicative, and useful needs no change: KEEP.

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Add missing frontmatter fields: `created: 2026-04-19`, `last_confirmed: 2026-04-19`, `status: active`. No body changes needed.

**Note from verifier:** The verifier confirmed the frontmatter gap and the REVISE action is minimal. All five evidence citations verified exactly.

**Evidence:**

- "Content absent from AGENTS.md/docs/" — AGENTS.md — 0 matches for 'track silently'
- "Frontmatter missing three fields" — .claude/memory/feedback_testing_tracking_only.md:1-5 — confirmed
- "Indexed in MEMORY.md" — .claude/memory/MEMORY.md:51 — confirmed

---

### feedback_use_sonnet_agents

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: KEEP** (was REVISE; verify: uphold)

Prior REVISE was driven entirely by two factors: missing frontmatter fields (created/last_confirmed/status) and optional Haiku-tier expansion. Under the corrected rules, frontmatter/schema conformance is an explicitly excluded REVISE driver, and optional content expansion is not a driver-1/2/3 issue. The memory records a genuine user-expressed preference ("User explicitly requested 'use sonnet where possible'"), is factually true, and has no equivalent coverage in any COUNTING doc — AGENTS.md contains zero model-selection guidance (grep returns empty). No wrong content, no duplication, no documentation-grade truth needing drain. The REVISE bucket does not survive corrected rules; KEEP is correct.

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Add missing frontmatter fields (`created: <date from git log>`, `last_confirmed: 2026-06-10`, `status: active`). Optionally expand How-to-apply guidance to mention Haiku for read-only exploration tasks.

**Evidence:**

- "Frontmatter missing three fields" — .claude/memory/feedback_use_sonnet_agents.md:1-5 — confirmed
- "No model-selection guidance in eduagent-build AGENTS.md" — AGENTS.md — 0 matches
- "Nexus AGENTS.md §5 includes Haiku tier" — /Users/vetinari/nexus/AGENTS.md:85-100 — confirmed (memory omits Haiku)
- "User preference genuine" — .claude/memory/feedback_use_sonnet_agents.md:9 — confirmed

---

### feedback_voice_is_critical

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** (1) Remove the "When working on Epic 8…" paragraph — Epic 8 shipped 2026-04-03. (2) Change "TTS should be the default output mode" to reflect FR144: Voice mode is a per-session toggle (Text vs Voice), not a universal default; TEACH_BACK (FR142) defaults voice-on as a narrower exception. (3) Add pointer: the next phase of voice-first UX lives in Epic 17 (`docs/specs/2026-04-07-epic-17-voice-first-design.md`, NOT STARTED). (4) Keep the core principle: voice (STT + TTS) is product-critical for child learners.

**Evidence:**

- "Epic 8 shipped 2026-04-03" — docs/architecture.md:55 — confirmed
- "FR144 defines per-session toggle, not universal default" — docs/PRD.md:1463 — confirmed
- "TEACH_BACK voice-on is narrower exception" — docs/PRD.md:1446 (FR142) — confirmed
- "Epic 17 voice-first design NOT STARTED" — docs/specs/2026-04-07-epic-17-voice-first-design.md:20 — confirmed

---

### market_language_pivot

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Remove or correct: (1) "Launch English-only UI, targeting USA, UK, Australia" — 7 locales shipped; update to note v1 shipped with 7 locales per architecture.md. (2) "no i18n infrastructure needed" — stale; infrastructure exists. (3) "How to apply: App UI language: English only (no i18n/react-i18next)" — contradicted by live code. Keep: compliance-register pointer, language-teaching / four_strands fact (still live per architecture.md:1668), pointer to `project_language_pedagogy.md`. Bump `last_confirmed` to today.

**Evidence:**

- "7 locale files in apps/mobile/src/i18n/locales/" — directory listing — en/de/es/ja/nb/pl/pt confirmed
- "architecture.md:1699 confirms 7 locales shipped" — "7 locales | English source + 6 LLM-translated" — confirmed
- "four_strands DONE" — docs/architecture.md:1668 — "Epic 6 Language Learning: DONE"
- "Compliance register pointer valid" — docs/compliance/identity-compliance-register.md — confirmed present

---

### pricing_dual_cap

**⟲ Corrective pass (2026-06-10):** re-audited under the ratified coverage roster — disposition stands; rationale re-derived from counting docs only.

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Remove `premiumModelProfiles: 1` from the Plus row, `premiumModelProfiles: 0` from the Family row, and `premiumModelProfiles: 2` from the Pro row in the "Tier config" block — the field was dropped in the 2026-05-25 tier-access-rework (`docs/_archive/plans/done/2026-05-25-tier-access-rework-plan.md` confirms removal). Core quota numbers, 402-reason header behavior, and the two invariants (quota-visible-questions-only; parent-proxy-reject-before-decrement) are verified accurate and have no canonical home.

**Evidence:**

- "premiumModelProfiles dropped — grep 0 matches" — docs/_archive/plans/done/2026-05-25-tier-access-rework-plan.md:51,679,704,707 — confirmed
- "Tier quotas accurate" — apps/api/src/services/subscription.ts:44-118 — confirmed
- "Two invariants absent from all L1/L2/ADR docs" — docs/architecture.md, docs/prd.md, docs/adr/ — confirmed
- "Parent-proxy enforcement in metering.ts:546-549" — confirmed verbatim comment

---

### project_agent_doc_and_memory_architecture_revisit

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: REVISE** (was REVISE; verify: uphold)

Prior REVISE survives but the revise_action must narrow. Corrected rules explicitly exclude "pointer-ification for doctrinal purity" as a driver, so collapsing Issue 1 to a one-line tombstone is invalid — Issue 1's historical narrative (rollback, RECOVER table, doc-count scripts) is true and not duplicated in any COUNTING doc (AGENTS.md carries only the current resolved state; the historical why is absent). Only the dead pointer (project_sync_script_extension.md — absent from .claude/memory/) remains a valid driver-1 edit (factually wrong reference). Issue 2 is untouched valid working state. Revise_action shrinks to: remove the dead pointer bullet only.

**Corrected revise action:** Remove only the final bullet pointing to `project_sync_script_extension.md` (file does not exist in .claude/memory/). Leave Issue 1 body, Issue 2 body, and all other references unchanged.

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Replace Issue 1 body with one-line tombstone: "Issue 1 — RESOLVED 2026-06-09 (WI-386): AGENTS.md is the single source, CLAUDE.md is @AGENTS.md pointer; sync-agent-docs.mjs not revived." Remove bullet pointing to `project_sync_script_extension.md` (file does not exist). Keep Issue 2 and all open questions unchanged.

**Evidence:**

- "Issue 1 resolved" — AGENTS.md:139 — "converged 2026-06-09, WI-386" — confirmed
- "sync-agent-docs.mjs absent" — scripts/ — confirmed absent
- "Cross-agent memory still open" — .agents/memory/ — directory does not exist
- "project_sync_script_extension.md absent" — .claude/memory/ — confirmed absent

---

### project_archon_spike_merge_rule

**Final bucket:** ARCHIVE

**Triage→Verify:** ARCHIVE → uphold

**Rationale:** Time-bounded process exception expired by its own terms. `consistency2` branch absent from all branches; PR #176 closed without merging (2026-05-07); `.archon/config.yaml` shows settled `baseBranch: main`. Memory's own sunset condition (line 16) is met.

**Evidence:**

- "consistency2 branch absent" — git branch -a — confirmed
- "PR #176 closed without merge" — gh pr view 176 — state=CLOSED, mergedAt=null
- "Memory's own sunset condition at line 16" — confirmed verbatim
- ".archon settled state" — .archon/config.yaml — baseBranch: main

---

### project_book_generation_pass

**⟲ Corrective pass (2026-06-10):** re-audited under the ratified coverage roster — disposition stands; rationale re-derived from counting docs only.

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** Valid L4(a) pointer. Script present, `pnpm test:llm:book-generation` registered, default cases verified, one-retry behavior confirmed, model policy governed by MMT-ADR-0014 + registers/llm-models/master.md. `change-classes.md:21` confirms slow required gate.

**Evidence:** All 6 evidence items verified accurate.

---

### project_brand_dark_first

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: DRAIN** (was ARCHIVE; verify: uphold)

Prior ARCHIVE relied primarily on epics.md (lines 739-757), which does not count under the corrected roster. The single counting-doc citation that survives — architecture.md:132 — covers only "teal primary + lavender secondary, dark-first default, system preference by default, one light + one dark palette." It does NOT cover: specific hex values (#1a1a3e, #faf5ee, #2dd4bf, #a78bfa), the no-accent-picker decision and its rationale, the user-override mechanic (dark/light/system toggle in app settings), the dark-mode-as-brand framing, or the post-launch neutral/slate contingency. These are documentation-grade decisions not captured in any counting doc. Archiving them would be information loss; DRAIN is the correct disposition.

**Drain target:** Stream-2 estate-canon-drain | docs/canon/identity/ or a new MMT-ADR on brand theming | hex palette (#1a1a3e navy, #faf5ee cream, #2dd4bf teal, #a78bfa lavender), no-accent-picker decision + rationale, user override mechanic (dark/light/system), dark-mode-is-brand framing, post-launch neutral/slate contingency

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** ARCHIVE

**Triage→Verify:** ARCHIVE → uphold

**Rationale:** Color table, no-accent-picker decision, two-theme-only rule, system-toggle decision all verbatim in `docs/specs/epics.md` lines 739-757 and `docs/architecture.md:132`. Epic 11 DONE.

**Evidence issues flagged by verifier:** Evidence item 4 cites epics.md:739 for "Two themes only" heading but line 739 is about navy tokens; actual heading is at line 746. The co-cited range :746-748 covers it.

---

### project_clerk_email_verification_fallback

**Final bucket:** KEEP (overturned from REVISE)

**Triage→Verify:** REVISE → overturn → KEEP

**Overturn reasoning:** The REVISE was based solely on the claim that the memory "lacks a citation to deployment-and-secrets.md." This is factually wrong. Lines 17-19 of the memory already read: "`docs/pre-launch-checklist.md` and `docs/deployment-and-secrets.md` document the token-template fast path plus the Backend API fallback." All other evidence claims verified correctly.

**Evidence issues:** Evidence item 4 ("memory lacks citation") was a factual error by the triage agent.

---

### project_clerk_key_environments

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Change "Mobile Key baked in eas.json" to "injected via EAS Environment Variable at build time (not in committed eas.json)". Remove the History block (PR #101, commit 5e24261, APK build ID — resolved incident). Add pointer to `docs/deployment-and-secrets.md §Sink 2 — EAS Environment Variables`. Retain the debug signature line (`[AUTH-DEBUG] 401 received | token=present`) — no canon home.

**Evidence issues flagged by verifier:** deployment-and-secrets.md:401 is cited as "keys fixed in eas.json by commit 5e24261" but the line narrates the removal of keys (BUG-235/BUG-345), not the original fix. apps/mobile/eas.json also contains EXPO_PUBLIC_ENABLE_MODE_NAV vars in addition to what was cited; the "no Clerk key fields" claim is correct but the characterization of present fields is incomplete.

---

### project_cosmo_wi_project_relation_misfiling

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** Brand-new memory documenting a live recurring failure mode. Execute.ts repo guard verified at lines 224-258; MentoMate project ID confirmed at the cited plan file:34; repo slug confirmed via origin remote. Failure mode absent from skills and AGENTS.md Cosmo rules.

**Evidence:** All 4 evidence items verified accurate.

---

### project_deploy_safety

**Final bucket:** ARCHIVE

**Triage→Verify:** ARCHIVE → uphold

**Rationale:** All durable rules verbatim in AGENTS.md § Schema And Deploy Safety. Two factual claims both wrong: CI now uses drizzle-kit migrate (CFG-12, ci.yml:112-116); DEPLOY_ENV is used throughout deploy.yml (lines 241, 249, 259, 286, 291, 301).

**Evidence:** All 4 evidence items verified accurate.

---

### project_dev_schema_drift_trap

**Final bucket:** MERGE (into project_schema_drift_pattern)

**Triage→Verify:** MERGE → uphold

**Merge instruction:** Absorb the naming-trap table (mentomate-api-dev Worker ≠ Neon 'staging' branch ≠ Doppler dev config) and do-not-do list into the survivor (`project_schema_drift_pattern`). Strip stale "Follow-Up Still Open" items and Sentry incident framing. Correct script name `pnpm run db:generate` → `pnpm run db:generate:dev` (the wrong script is in the trap file being absorbed, per package.json:32). Delete the trap file after absorption.

**Evidence:** All 4 evidence items verified accurate.

---

### project_eas_build

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Collapse "Doppler → eas.json sync" bullet to a one-line pointer to `docs/deployment-and-secrets.md §'How secrets get there'` — but **explicitly preserve** the SENTRY_AUTH_TOKEN/eas-secret:create sub-note (has no canonical home; grep for 'eas secret|SENTRY_AUTH_TOKEN' in deployment-and-secrets.md returns 0 matches). Collapse "Runtime version policy" bullet to pointer to `docs/deployment-and-secrets.md §'Runtime Version Strategy'`. Retain NX Cloud disconnect (IID-792), Sentry disabled status, WSL2 unreliable note, build-request-failed quirk, "How to apply". Add frontmatter fields: `created`/`last_confirmed`/`status`.

**Evidence issues flagged by verifier:** The revise_action as originally stated would silently drop the SENTRY_AUTH_TOKEN/eas-secret:create storage detail by collapsing the whole Doppler bullet — that detail has no canonical home. The revise_action must explicitly preserve that sub-bullet.

---

### project_eas_update_ota

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: DRAIN** (was KEEP; verify: uphold)

Prior KEEP was justified against docs/deployment-and-secrets.md as "live canon source" — but under the corrected roster that file is not a COUNTING doc (not in docs/canon/, not an ADR, not the spine trio, not AGENTS.md/CONTEXT.md). No COUNTING doc covers OTA/EAS Update behavior: docs/architecture.md, AGENTS.md, CONTEXT.md, and docs/canon/ all confirmed empty on eas-update/OTA queries. The memory holds true, non-duplicative documentation-grade truth — the behavioral guard and the eas.json env gotcha — with no formal home. Per operator rules, this is DRAIN (never ARCHIVE when the memory is the only record). Target: docs/architecture.md deployment section.

**Drain target:** spine | docs/architecture.md | EAS Update / OTA deployment behavior: CI ota-update job owns normal preview OTA publishing; `eas update` does not read `eas.json` build-profile env (must set EXPO_PUBLIC_* explicitly in the shell); manual OTA requires explicit user instruction

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** Clean L4(a+c) pointer. OTA CI job at ci.yml:284 confirmed; `eas update --branch preview` at :371 confirmed; eas.json env comment at :356 confirmed. Sibling pointer delegates preference guard to `feedback_no_ota_unless_asked.md`. Missing frontmatter fields (created/last_confirmed/status) are a hygiene gap but not a KEEP disqualifier.

---

### project_enduser_session_pass

**Final bucket:** REVISE (overturn: revise_action corrected)

**Triage→Verify:** REVISE → overturn (bucket stays REVISE, mode-count correction is reversed)

**Overturn reasoning:** The memory's "six session types" is accurate and must not be changed to five. `scripts/enduser-session-pass.ts:39-45` defines `type Mode = 'freeform' | 'learning' | 'homework' | 'review' | 'recitation' | 'four-strands'` — six members. Line 366 has `mode: 'four-strands'` in runDefinitions. The triage agent confused `learnerProfiles.languageFourStrands` (a profile object) with `'four-strands'` (a Mode string). Apply only action 1: the Windows-path portability revision.

**Corrected revise action:** Replace the hard-coded Windows Doppler path example with a platform-agnostic form (`doppler run --project mentomate --config stg -- pnpm exec tsx scripts/premium-routing-pass.ts`) and add a note that `C:/Tools/doppler/doppler.exe` is per-machine. Do NOT change the "six session types" text.

**Evidence issues:** Evidence item citing "SessionMode union has exactly 5 values" is wrong — type is named `Mode` not `SessionMode`, has 6 members, and lines 40-44 stop one line short of `'four-strands'` at line 45.

---

### project_eval_llm_harness

**Final bucket:** REVISE (overturn: flow count corrected from 17 to 23)

**Triage→Verify:** REVISE → overturn (bucket stays REVISE, flow count corrected)

**Overturn reasoning:** The triage said "17 flows"; the verifier found 23 entries in `index.ts:101-123`. The revise_action must say 23, not 17.

**Corrected revise action:** (1) Replace "All 10 LLM flows wired" with "23 flows registered" (correct count per `apps/api/eval-llm/index.ts` FLOWS array) and add pointer to that array as the authoritative list. (2) Remove the "filing-post-session" paragraph (file does not exist). (3) Replace directory layout block with pointer to `apps/api/eval-llm/README.md`. (4) Retain snapshot-trigger trap, fixture profile IDs, and CLI commands. (5) Remove "Costs", "Architectural note", "Response-shape validation", "What's wired" — they duplicate the README.

**Evidence issues:** Evidence item 1 states "17 flows" — actual count at lines 101-123 is 23.

---

### project_eval_llm_signal_metrics

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** (1) Update "Flows opted in so far" to list four flows: exchangesFlow, probesFlow, safetyProbesFlow, languageQualityFlow. (2) Add note that `eval-live.yml` automates weekly scheduled drift check (schedule + label trigger). (3) Add `--validate-baseline` gate: deterministic, key-free check (`pnpm eval:llm -- --validate-baseline`). (4) Retain recovery history, tolerance rationale, "seed before use" warning. (5) Update test count: memory says 18, file now has 28 test definitions.

**Evidence:** All 5 evidence items verified accurate.

---

### project_expo_web_preview

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Change `expo start --web --port 8081` to `expo start --web --port 8089` — `.claude/launch.json:20` passes `'--port', '8089'`.

**Evidence issues flagged by verifier:** Evidence item 4 claims 8089 was present "since inception" — false; earliest commit (7cf7f538c) has 8081; 8089 first appeared in c80bb9036. The actionable finding (current HEAD uses 8089, memory says 8081) is correct.

---

### project_freeform_library_filing_decision

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: DRAIN** (was ARCHIVE; verify: uphold)

Prior ARCHIVE was wrong: its sole coverage citations were docs/_archive/specs/Done/2026-05-23-freeform-library-filing.md and its companion plan — both _archive/ locations, which the corrected roster explicitly excludes. Checking every counting doc: PRD.md has no mention of the filing policy; docs/ux-design-specification.md mentions freeform mode but is silent on the filing decision; CONTEXT.md defines only the "Filing" vocabulary term (the async pipeline + status states), not the product policy choices; docs/adr/ has no filing ADR; docs/canon/ is identity-only. The memory's content (auto-file vs. ask policy, "Keep out of Library" copy, post-close footer retirement, reconcile-six-flow-specs directive) is documentation-grade product truth with no home in any counting doc — it must be drained to PRD.md, not archived.

**Drain target:** product layer | docs/PRD.md | freeform chat library-filing policy: auto-file when confident, ask only when ambiguous, always allow correction; "Keep out of Library" UX copy (not "Don't save"); retire post-close "Add to library?" footer prompt; user opting out keeps session history/summary/transcript but suppresses curriculum filing and topic progress/retention

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** ARCHIVE

**Triage→Verify:** ARCHIVE → uphold

**Rationale:** Entire content covered by `docs/_archive/specs/Done/2026-05-23-freeform-library-filing.md` and its implementation plan. Decision, auto-file policy, keep-out guidance, no-blocking-prompt directive, and doc-reconciliation IDs all covered. Implementation mostly delivered per plan.

**Evidence:** All 6 evidence items verified accurate.

---

### project_identity_foundation_decisions

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** Pure L4(a) pointer. All 12+ referenced files verified present: ADRs 0007-0018, `docs/canon/identity/` four files, compliance register, CANONICAL-SET.md, ROADMAP.md, `docs/INDEX.md`, llm-models register, vetting runbook. Phase J complete per ROADMAP.md:208. R-1 COPPA contingency accurately described as unresolved.

**Evidence issues flagged by verifier:** ADR-0008 covers guardianship edge, not "payer capacity" — minor blurb imprecision that does not impair navigation.

---

### project_inngest_staging

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Remove "Inngest Cloud staging app synced 2026-04-17" (one-time event, no ongoing value). Add citations: "See `apps/api/src/routes/inngest.ts` [BUG-237] for rationale, and `apps/api/src/index.ts:301` for basePath definition."

**Evidence issues flagged by verifier:** inngest.ts cited as lines 17-19 but route declaration closes on line 21 — span should be 17-21. Not a substantive error.

---

### project_known_bug_patterns

*(Reconstructed from the workflow journal — dropped by the synthesis agent's first cut.)*

**Final bucket:** DRAIN

**Triage→Verify:** DRAIN → uphold (high confidence)

**Rationale:** Both patterns are durable engineering rules with no canonical home. They are not in AGENTS.md Code Quality Guards (which ends at GC6), not in any ADR, and not in docs/canon/. The fixes are confirmed live in the codebase (Array.isArray guard at bookId.tsx:1013, submitInFlight/challengeActionInFlightRef refs in session-summary and session/index). STAB-03/04/07 in the archive ADR draft confirm the sweep happened but that doc is archived and contains no how-to-detect/how-to-apply guidance. These patterns belong as named Code Quality Guards in AGENTS.md alongside GC1-GC6.

**Drain target:** L3 | `AGENTS.md ## Code Quality Guards` | Pattern 1 (Silent Fallbacks: `?? []` on `.data`, success-shaped catch returns, `void mutateAsync` without `.catch`, raw LLM text in fallbacks) and Pattern 2 (React state timing: `isPending` not sufficient as concurrency guard in Alert-retry flows; require `useRef(false)` lock alongside `isPending`).

**Split notes:** The entire body drains — Pattern 1's four sub-patterns and Pattern 2's ref-lock + setIsClosing-in-catch sub-variant are all durable rules with no L1/L2/L3 home. After drain, archive the memory with a tombstone pointing at the AGENTS.md section.

**Evidence:**

- Pattern 1 Array.isArray fix live — `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx:1013` — `const safeAllBooks = Array.isArray(allBooksQuery.data)` with inline comment citing the guard rationale.
- Pattern 2 useRef(false) lock live in session-summary — `apps/mobile/src/app/session-summary/[sessionId].tsx:138-139` — `submitInFlight`/`skipInFlight` refs guard mutations against double-fire.
- Pattern 2 lock live in session screen — `apps/mobile/src/app/(app)/session/index.tsx:427` — `challengeActionInFlightRef = useRef(false)`; checked at :987 and :1020 before mutations.
- Patterns swept but only recorded in an archived draft — `docs/_archive/parallel-adr-audit-2026-06-03/ADR-register-draft.md:460-464` — STAB-03/04/07 marked Implemented; never promoted to AGENTS.md.
- Neither pattern in standing rules — `AGENTS.md:326-336 (## Code Quality Guards)` — GC1–GC6 present; no rule for silent fallbacks or isPending+ref lock.
- Guidance still actionable — `apps/mobile/src` — 15 remaining `?? []` sites on query data.

**Evidence issues flagged by verifier:** Minor — the "15 rg matches" claim: rg without `--no-ignore` picked up cross-worktree hits returning 17; grep on the correct worktree confirms 15. Directional claim correct, count method fragile but not wrong.

---

### project_language_assessments_production_first

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: DRAIN** (was REVISE; verify: uphold)

The prior DRAIN→REVISE overturning rested on "the rule is encoded in assessments.ts code." The operator's corrected rules are explicit: code is NOT a counting doc. The production-first language assessment rule is a documentation-grade pedagogical design constraint — it determines how LLM assessment prompts must be framed. No counting doc covers it: docs/PRD.md, docs/architecture.md, docs/canon/identity/prd.md, docs/canon/identity/domain-model.md, AGENTS.md, CONTEXT.md, and all MMT-ADRs all return zero matches. The rule is the sole real record of this constraint. DRAIN is the correct disposition; REVISE was wrong.

**Drain target:** L1 | docs/PRD.md (language-learning / assessment design section) or docs/canon/identity/prd.md | Pedagogical rule: language reviews must target usable production (target-language words/chunks, spelling tolerance, tiny exchanges), not meta-knowledge; ask concrete tasks like "say hello in Italian", "translate a phrase", "use it in a two-line exchange"; avoid "main ideas", "what other words did we cover", and culture-ish questions unless the lesson explicitly taught culture/register. Rationale: generic assessment prompts drifted into "what is a greeting" framing in the 2026-05-18 review flow.

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** REVISE (overturned from DRAIN)

**Triage→Verify:** DRAIN → overturn → REVISE

**Overturn reasoning:** The DRAIN rationale assumed "no canonical home" for the rule — but checked only documentation files. The rule is already live in source code as `LANGUAGE_ASSESSMENT_EVAL_PROMPT` in `apps/api/src/services/assessments.ts:120-130`, matching the memory's content verbatim. The correct action is REVISE to a pointer citing the live implementation, not DRAIN to PRD.

**Revise action:** Replace body with a pointer citing `apps/api/src/services/assessments.ts:120-130` (`LANGUAGE_ASSESSMENT_EVAL_PROMPT`) as the canonical home for this rule. Retain a one-line summary: "Language assessment prompt style: ask production tasks (say X in Italian, translate a phrase, tiny exchange), not meta-knowledge summaries ('what did we cover', 'main ideas')."

**Evidence issues:** Evidence item 4 ("no live canonical spec") did not check source code. Evidence item 4's "all in _archive" characterization of docs/specs/ is also incorrect for two files, though neither covers language assessments.

---

### project_language_pedagogy

**Final bucket:** DRAIN

**Triage→Verify:** DRAIN → uphold

See **DRAIN backlog — DRAIN-2** above for the complete drain specification.

---

### project_llm_source_provenance

**Final bucket:** DRAIN

**Triage→Verify:** DRAIN → uphold

See **DRAIN backlog — DRAIN-3** above for the complete drain specification.

**Evidence issues flagged by verifier:** The triage claimed the only L3 mention is in `docs/specs/2026-06-03-owner-impact-audit-top-10.md` — that file has zero matches for the key terms. Actual L3 presences are in `docs/plans/2026-05-29-layered-codebase-risk-audit.md:306` and the `docs/audit/2026-05-29-full-audit/` artefacts. This error does not change the DRAIN disposition: the policy is absent from L1/L2.

---

### project_nx_expo_plugin_bug

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** (1) Replace "Impact" paragraph: remove reference to `scripts/pre-commit-tests.sh` (retired, D1/WI-450); note the >100-file nx-affected fallback now lives in `scripts/pre-push-tests.sh:141-148`. (2) Rewrite "How to apply" last sentence to align with two-level `--no-verify` doctrine: the >100 TS-file Windows escape is explicitly retained per MMT-ADR-0019/WI-537 until WI-542 upstream fix lands — narrow deliberate `--no-verify` for this condition is sanctioned; blanket prohibition removed. (3) Bump `last_confirmed` to 2026-06-10.

**Evidence:** All 6 evidence items verified accurate.

---

### project_playwright_e2e_setup

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** (1) Replace per-project list with pointer to `apps/mobile/playwright.config.ts` (config now has 8 projects, not 5). (2) Fix the macOS/Linux doppler command to include `--project mentomate`. (3) Keep TEST_SEED_SECRET/.dev.vars mismatch rationale. (4) Keep baseline link (`docs/audit/e2e/baseline-2026-05-14.md`, confirmed present). (5) Add `last_confirmed: 2026-06-10`.

**Evidence issues flagged by verifier:** README.md:13 is within a multi-line CI block, not a standalone local-dev command. The README Project Coverage table itself also lists only 6 projects (stale) — pointing to `playwright.config.ts` directly is preferable.

---

### project_product_roles_students_any_age

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** Explicit L4(a) pointer, self-declared signpost. All three canon sources verified: `docs/canon/identity/ontology.md`, `docs/canon/identity/prd.md Part 10` (line 324, Personas at 330, inv 4 at 339-340), `docs/audience-matrix.md` (14.4K), `apps/mobile/src/lib/navigation-contract.ts` (14.9K). Durable agent caution absent from AGENTS.md Profile Shapes.

**Evidence:** All 6 evidence items verified accurate.

---

### project_revenuecat_setup

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Replace "Code reference: `apps/api/src/routes/revenuecat-webhook.ts:81-104`" with "Code reference: `apps/api/src/services/billing/revenuecat-webhook-handler.ts:79` (PRODUCT_TIER_MAP) and `:99` (CONSUMABLE_PRODUCT_CREDITS)".

**Evidence:** All 4 evidence items verified accurate. PRODUCT_TIER_MAP confirmed at handler:79; CONSUMABLE_PRODUCT_CREDITS at :99; all pre-launch checklist RevenueCat items unchecked at lines 74-84.

---

### project_schema_drift_pattern

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action (as MERGE survivor):** (1) Absorb naming-trap table and do-not-do list from `project_dev_schema_drift_trap` (strip stale follow-up items from that file before absorbing). (2) Remove the 2026-04-14 "What was missing" column list (stale incident artifact). (3) Apply `db:generate` → `db:generate:dev` correction **to the content being absorbed** from the trap file (the survivor file itself does not contain bare `db:generate`). (4) Bump `last_confirmed` to 2026-06-10.

**Evidence issues flagged by verifier:** revise_action item 3 says to correct `pnpm run db:generate` in the survivor file, but that wording appears only in the trap file (line 29), not in the survivor. The correction applies during absorption of the trap content, not to the existing survivor body.

---

### project_session_lifecycle_decisions

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: DRAIN** (was ARCHIVE; verify: uphold)

Prior ARCHIVE rested entirely on epics.md as coverage — a non-counting doc under the corrected rules. Under the corrected roster, the only counting-doc hit is docs/architecture.md line 1675, a one-line Epic 13 summary table entry ("Wall-clock for users, active time internal, adaptive silence, recovery, celebrations | DONE"). That entry names the features but carries none of the rationale, the computeActiveSeconds() gap-cap algorithm (FR210), the UI "how to apply" rule (wallClockSeconds for display; durationSeconds internal only), or the hard-cap removal reasoning. No other counting doc (AGENTS.md, CONTEXT.md, docs/adr/, docs/canon/, PRD.md, ux-design-specification.md) contains this content. The memory is the only real record of these decisions; archiving it is information loss.

**Drain target:** docs/architecture.md — Session Lifecycle section | add: wall-clock vs active-time rationale, computeActiveSeconds() gap-cap algorithm (FR210), "how to apply" UI rule (wallClockSeconds for display, durationSeconds for analytics only), hard-cap removal rationale, LLM-adaptive silence detection design

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** ARCHIVE

**Triage→Verify:** ARCHIVE → uphold

**Rationale:** All four design decisions verbatim in `docs/specs/epics.md:838-870` (Epic 13 Key design decisions) and all code is live. Epic 13 DONE per architecture.md:1675. "Not yet implemented" claim for Epic 13.5 LLM-adaptive silence detection is stale — feature shipped at `use-session-streaming.ts:928-932`.

**Evidence issues flagged by verifier:** Memory's fallback of "8 min" is wrong — code has `FALLBACK_GAP_CAP_SECONDS = 10 * 60` (10 min), confirmed by epics.md:5575. This stale claim strengthens the ARCHIVE case.

---

### project_themekey_removed

**Final bucket:** KEEP

**Triage→Verify:** KEEP → uphold

**Rationale:** NEVER re-add guardrails and Hermes/Reanimated failure mechanics absent from any ADR or architecture.md. Code comments at `(app)/_layout.tsx:490` and `_layout.tsx:241-245` verify the removals and their reasons. `AnimatedEntry` returns 0 matches codebase-wide.

**Evidence:** All 6 evidence items verified accurate.

---

### reference_notion_workspace

**⟲ Corrective pass (2026-06-10):** re-audited under the ratified coverage roster — disposition stands; rationale re-derived from counting docs only.

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** (1) Replace Windows-only Doppler command with OS-neutral form: `doppler secrets get NOTION_API_KEY --plain -p mentomate -c dev` (note: use `-p mentomate -c dev` to match the memory's own flags, not the simplified `--config dev` form). (2) Add missing frontmatter: `created: 2026-04-16`, `last_confirmed: 2026-06-10`, `status: active`.

**Evidence issues flagged by verifier:** The revise_action cited `--config dev` but the memory uses `-p mentomate -c dev` — replacement should preserve those flags.

---

### user_device_small_phone

**⟲ CORRECTIVE PASS (2026-06-10) — supersedes the entry below. Final bucket: KEEP** (was REVISE; verify: uphold)

Prior REVISE was driven entirely by missing frontmatter fields (created, last_confirmed, status). Under corrected rules, frontmatter/schema conformance is explicitly not a REVISE driver. The memory content is factually true (Galaxy S10e device, 5.8" screen, first confirmed incident 2026-04-03), non-duplicative (zero hits for "Galaxy" or "S10e" across all COUNTING docs — AGENTS.md, CONTEXT.md, docs/architecture.md, docs/PRD.md, docs/ux-design-specification.md, docs/canon/**, docs/adr/**), and actively useful as a behavioral reminder for agents reviewing mobile UI. No legitimate REVISE driver remains under the three operator goals.

*Original first-pass entry retained below for the audit trail:*

**Final bucket:** REVISE

**Triage→Verify:** REVISE → uphold

**Revise action:** Add missing frontmatter fields: `created: 2026-04-03`, `last_confirmed: 2026-05-31` (latest spec/audit reference), `status: active`.

**Evidence:** All 5 evidence items verified accurate.
