# Cleanup Triage — 2026-04-30

> **Source:** Triage plan at `C:\Users\ZuzanaKopečná\.claude\plans\1-yes-skip-git-build-encapsulated-spark.md`. This report is the deliverable; execution (deletes / archive moves) happens in a separate phase after the user approves categories.

## Summary

| Metric | Value |
| ------ | ----- |
| Files triaged (active, per-file) | **164** |
| Folders treated as already-archived (folder-level only) | **4** (totaling ~55 files) |
| **Cat 1 — Definitely obsolete / stale** | **25** (8 delete · 17 archive) |
| **Cat 2 — Possibly obsolete** | **23** (mostly archive or update-in-place) |
| **Cat 3 — Keep** | **116** |
| Inbound-link conflicts requiring co-changes | **8** (see "Conflicts" section) |
| Already-archived folders requiring action | **3** (move to formal `docs/_archive/`) |
| Out-of-scope security item flagged | **1** (`.scratch/notion_key.txt`) |

## Methodology (brief)

For every active in-scope file: read the file → verify referenced state via `git log` / `Grep` / file existence (Option B verification depth) → assign category 1/2/3 → recommend delete vs. archive. Three Sonnet subagents handled chunks in parallel; coordinator handled special cases and the inbound-link cross-check. See the linked plan for full methodology.

**Already-archived folders** (`docs/specs/Done/`, `docs/specs/deffered/`, `docs/plans/done/`, `.claude/memory/_archive/`) were summarized at folder level only, per user direction.

## Conflicts — co-changes required during execution

These are inbound references to files marked Cat 1. They don't change the categorization, but they are loose threads the execution plan must address in the same commit (or risk leaving broken links).

| # | Pointer (must update) | Points at (Cat 1) | Co-change required |
| - | --------------------- | ----------------- | ------------------ |
| C1 | `.claude/memory/MEMORY.md` indexes 5 Cat 1 memory files (project_cr_124_scope, project_epic15_code_review, project_expo_router_pollution, project_implementation_phase, project_web_flow_bugs) | 5 of 6 Cat 1 memory files | Remove or repoint those 5 lines in MEMORY.md to `_archive/` paths |
| C2 | `docs/architecture.md` frontmatter (lines 10-12) lists all 3 `FB-Run023-*.yaml` files as input docs | All 3 yaml files (Cat 1 archive) | Update frontmatter paths to `docs/_archive/factory-briefs/FB-Run023-*.yaml` |
| C3 | `docs/ux-design-specification.md` frontmatter (lines 8-10) lists all 3 yaml files as input docs | Same 3 yaml files | Same — update paths |
| C4 | `docs/specs/epics.md` lines 461-462 mark `animation-improvements-design.md` and `quiz-ui-redesign-finding-fixes.md` as `IN PROGRESS` | Both Cat 1 archive | Update epics.md rows: change status to `DONE` (work shipped per `f510b6bd` + `1e50b6ea`) and repoint to archive paths, or remove the rows |
| C5 | `docs/E2Edocs/e2e-emulator-issues.md:2063` references `e2e-bug-fix-plan.md` (FIX-01..FIX-12) | Cat 1 delete | Either drop the line or replace with a git-history pointer (`see commit 6e096385`) |
| C6 | `docs/flows/mobile-app-flow-inventory.md:253` references `2026-04-16-animation-improvements-design.md` | Cat 1 archive | Update path or drop the cross-reference |
| C7 | `docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md:3` and `…phase-2-4-enforcement.md:3` reference `bug-fix-plan HR.md` as parent finding | Cat 1 archive | Update path to `docs/_archive/plans/bug-fix-plan HR.md` (still findable, just relocated) |
| C8 | `.claude/memory/project_expo_web_preview.md` (Cat 3) references `project_expo_router_pollution.md` | Cat 1 archive | Update reference to `_archive/project_expo_router_pollution.md` |

Additional weak references that are NOT blocking but worth knowing:
- `apps/api/drizzle/0020_lyrical_blue_blade.rollback.md` (out-of-scope code dir) references `project_epic15_code_review.md` finding `EP15-C1`. Markdown comment in a SQL rollback note; safe to leave.
- `docs/flows/end-user-test-report-2026-04-18.md` (Cat 2 archive) references `project_expo_router_pollution.md` and `2026-04-18-quiz-ui-redesign-finding-fixes.md`. Both move together with the report; resolves itself.
- `.claude/memory/_archive/project_theme_unification.md` references `project_accent_cascade_broken.md`. Both already archive-bound; resolves itself.

---

## Category 1 — Definitely obsolete / stale (25 files)

### 1A · Delete (8 files)

Pure transients. Git history is the audit trail.

| File | Reason | Evidence |
| ---- | ------ | -------- |
| `.claude/memory/project_accent_cascade_broken.md` | Orphan stub. File body is one line: "Archived. See `_archive/project_accent_cascade_broken.md`". The real archive copy already exists. | Read of file confirms 1-line redirect; archive copy present at `.claude/memory/_archive/project_accent_cascade_broken.md`. Not indexed by `MEMORY.md`. |
| `docs/E2Edocs/e2e-bug-fix-plan.md` | Header self-marks "Closed out 2026-04-02"; all 12 fixes applied and verified. | `git log` shows `6e096385 fix: LLM reliability, E2E flow fixes` applied the fixes; e2e-emulator-issues.md notes "FIX-01 through FIX-12… all fixes verified in source code". |
| `docs/E2Edocs/e2e-test-results.md` | Header reads "⚠️ Stale data (2026-04-02): Last E2E session results are from mid-March 2026. All open bugs have been consolidated into Notion." 16+ E2E sessions have run since. | Spot-checked — line 3 of file confirms verbatim. |
| `docs/E2Edocs/e2e-visual-findings.md` | Visual review from session 23 (2026-03-23); all MAJOR/MINOR cosmetic findings swept in subsequent waves. | `c80bb903`, `fdb5099a` closed navigation + layout bugs; branch `e2e/session-23-visual-review` long merged. |
| `docs/flows/web-flow-bug-findings.md` | All listed bugs (WEB-01, WEB-02 + 33 affected screens) marked "Fixed in current branch"; memory `project_web_flow_bugs.md` confirms "All code-level web bugs FIXED". | `75ace696 fix: goBackOrReplace navigation helper`. |
| `docs/plans/order.md` | "Recommended Execution Order" tier list from before current state; Tier 1 items shipped (progressive disclosure done; freeform-filing retry `89898d2b`); BD-10 / 2A.10 are tracked in `bug-fix-plan HR.md`. No actionable content remains. | Spot-checked — items 1-2 confirmed shipped in git log. |
| `docs/specs/2026-04-14-status.md` | Point-in-time gap snapshot from 2026-04-14; every row resolved or superseded by a more recent Done/ spec or active plan. | Each listed gap has a Done/ counterpart per `Glob docs/specs/Done/2026-04-*`. |
| `governance/index.json` | Spec Kit template scaffold never populated. All 4 `precedence` paths (`architecture-decisions.md`, `memories/adopted-patterns.md`, `tech-stack.md`, `P1-plan.md`) and the `artifacts.{plan,spec,tasks}` paths under `specs/001-walking-skeleton/` do not exist. Nothing else in the repo references this file. | `Grep` for the 4 path strings returned only this file itself. Glob confirmed none of the targets exist. |

### 1B · Archive (17 files)

Lessons-learned / decision context worth keeping for archaeology, but not active.

| File | Recommend → | Reason | Evidence |
| ---- | ----------- | ------ | -------- |
| `.claude/memory/project_cr_124_scope.md` | `.claude/memory/_archive/` | IDOR fix CLOSED via scoped repo + break tests; 3 commits on `proxy-parent-fix` merged. | File self-marks CLOSED with 3 SHAs; `MEMORY.md` echoes "CR-124-SCOPE… closed". |
| `.claude/memory/project_epic15_code_review.md` | `.claude/memory/_archive/` | All Criticals + Importants CLOSED 2026-04-19 (file's own header). EP15-C2 / C3 closing commits found. | `b16d0616 fix(api): resolve EP15-C3`; `0170f81f feat(mobile): shared ErrorFallback/LoadingFallback [Epic-15]`. |
| `.claude/memory/project_expo_router_pollution.md` | `.claude/memory/_archive/` | Bug fixed: `apps/mobile/src/app/(app)/session/` now contains only `_layout.tsx`, `index.tsx`, `index.test.tsx`; helper files moved to `_helpers/`. Lessons about Expo Router behavior worth archive-keeping. | `ls` of `(app)/session/` confirms 3 files; `(app)/homework/` clean too. |
| `.claude/memory/project_implementation_phase.md` | `.claude/memory/_archive/` | "Agent 1 quiz personalization pending in worktree" stale — merged in `1f513d1c`. Active branch listed as `improvements`; current branch is `proc-optimization`. The four-agents-dispatched section is fully stale. | `git log`: `1f513d1c feat(api): quiz personalization [P0.1, P1.2]`. |
| `.claude/memory/project_web_flow_bugs.md` | `.claude/memory/_archive/` | All code-level bugs self-marked FIXED; goBackOrReplace pattern now in CLAUDE.md verbatim. | File reads "All code-level web bugs FIXED. WEB-02 swept (33 screens). goBackOrReplace mandatory." |
| `docs/manual-testing-bugs.md` | `docs/_archive/` (root level) | Header says superseded 2026-04-02; bugs transferred to Notion. Device-testing log has lessons-learned value. | Self-annotated superseded; BUG-M06 fix `6e096385`. |
| `docs/plans/2026-04-07-epic-17-phase-a-voice-input_NS.md` | `docs/_archive/plans/` | Plan suffix `_NS` ("Not Started"); no implementation commits found; voice work Epic 8 (gap closure) shipped via different design. Future Epic 17 work uses different spec. | `Grep` for `packages/schemas/src/voice.ts` Phase A additions returned nothing; only Epic 8 voice.ts in code. |
| `docs/plans/2026-04-15-learning-flow-bug-fixes.md` | `docs/_archive/plans/` | Plan for 13 bugs (F-1..F-13); all shipped across `fdb5099a`, `89898d2b`, `07fc8253`, `eadd169b`. | Multiple commit SHAs in agent's verification. |
| `docs/plans/2026-04-19-playwright-e2e-web-test-plan.md` | `docs/_archive/plans/` | Plan self-reports "Status: Implemented and green… maintenance mode"; every phase row = Completed. | `6a04c4ed`, `998fea92` confirm E2E journeys shipped. |
| `docs/plans/2026-04-21-medium-priority-e2e-tests.md` | `docs/_archive/plans/` | All Phase 2/3 Maestro flow files exist on disk; commit message confirms "13 new Maestro flows + 3 seed scenarios for 95% E2E coverage". | `6356e2c2` + `ls apps/mobile/e2e/flows/`. |
| `docs/plans/2026-04-27-unified-learning-resume.md` | `docs/_archive/plans/` | Plan header "Status: Implemented"; `getLearningResumeTarget` service + `GET /v1/progress/resume-target` route both exist. | `apps/api/src/services/progress.ts:781` exports it. |
| `docs/plans/bug-fix-plan HR.md` | `docs/_archive/plans/` | Tracker of PRs #1-40 legacy review; S-01..S-05 ✅ Fixed inline; S-06 extracted to dedicated plan files; only BD-10, 2A.10 open (tracked elsewhere). | `3e194a2a`, `ead83fb3` close most HR items. **Note co-change C7** — the two S-06 plan files reference this as parent. |
| `docs/specs/2026-04-16-animation-improvements-design.md` | `docs/_archive/specs/` | All animation deliverables shipped (PenWritingAnimation → MagicPenAnimation, BookPageFlipAnimation, BrandCelebration, DeskLamp). | `f510b6bd feat: animation overhaul`. **Note co-change C4** — `epics.md` row says `IN PROGRESS`; needs update. |
| `docs/specs/2026-04-18-quiz-ui-redesign-finding-fixes.md` | `docs/_archive/specs/` | F-032..F-041 fixes shipped in `1e50b6ea`; Done/ folder has companion `2026-04-18-quiz-gaps-completion-design.md`. | **Note co-change C4** — `epics.md` says `IN PROGRESS`. |
| `docs/FB-Run023-languages.yaml` | `docs/_archive/factory-briefs/` | Factory brief from 2026-01-17 segment-research workflow (3+ months old); references `docs/Run023_2026-01-17/` which doesn't exist. Segment ("Language Learner") still partially relevant but the brief is historical research. | **Note co-change C2/C3** — referenced from architecture.md + ux-design-specification.md frontmatter. |
| `docs/FB-Run023-learner.yaml` | `docs/_archive/factory-briefs/` | Same Run023 set; segment "Eager Learner (Self-Directed Adult)" explicitly contradicts strictly-11+ product constraint per CLAUDE.md and memory. | Memory's "Product Constraint — Strictly 11+" block explicitly dropped adult segment. |
| `docs/FB-Run023-parents.yaml` | `docs/_archive/factory-briefs/` | Same Run023 set; "Parents (Homework Help)" segment is the only one still aligned with product. Archive together for consistency rather than split the set. | All 3 yaml files share the same Run023 metadata block. |

---

## Category 2 — Possibly obsolete (23 files)

User judgment recommended. Most are partial overlaps, "phase 1 done / phase 2-N pending," or status-pages whose facts have drifted.

### 2A · Memory files needing content updates (9)

These memory files are still live and indexed — but their bodies contain stale claims that should be updated, not archived. Recommended action: **edit in place**.

| File | What's stale | Suggested update |
| ---- | ------------ | --------------- |
| `.claude/memory/MEMORY.md` | Indexes 5 Cat 1 files (see C1); also says "Agent 1 quiz personalization pending" (merged `1f513d1c`); says "exchanges remaining" (wired `002f5bad`); says active branch `improvements` (current is `proc-optimization`); EP15-C2/C3 noted as open (closed). | After Cat 1 moves, repoint or remove those 5 entries; update branch / status lines. |
| `.claude/memory/project_eval_llm_harness.md` | "8 of 9 flows wired; exchanges remaining" — exchanges now wired. | Update flow count. |
| `.claude/memory/project_eval_llm_signal_metrics.md` | `baseline.json` "not yet created" note may be stale. | Verify and update. |
| `.claude/memory/project_llm_audit_2026_04_18.md` | Phase 3 agent table all 4 merged; "F1.1 not migrated" likely stale (`3ce28b45 complete envelope migration`). | Strip agent table; update status flags. |
| `.claude/memory/project_llm_marker_antipattern.md` | Same `3ce28b45` envelope migration. F1.1+ "NOT MIGRATED" probably stale. | Update Bucket A status. |
| `.claude/memory/project_onboarding_new_dimensions.md` | Schema partially shipped (`99d234fc` adds `conversation_language`, `pronouns`, `InterestEntry`); "not yet in schema" line stale. | Update schema-status line. |
| `.claude/memory/project_open_bugs.md` | EP15-C2/C3 listed as open code review findings; both have closing commits. | Move those to Closed list. |
| `.claude/memory/project_ux_review_pass.md` | Progressive disclosure shipped (`89898d2b`); was listed as "remaining". | Move to Done. |

### 2B · Memory files — archive (2)

| File | Recommend → | Reason | Evidence |
| ---- | ----------- | ------ | -------- |
| `.claude/memory/project_neon_transaction_facts.md` | `.claude/memory/_archive/` | Driver swap executed `c80bb903`; recommendations have been acted on. Architectural facts retain reference value. | `git show c80bb903` confirms neon-serverless WebSocket Pool switch. |
| `.claude/memory/project_schema_drift_staging_fix.md` | `.claude/memory/_archive/` | One-time 2026-04-15 incident note; generic pattern fully documented in `project_schema_drift_pattern.md` (Cat 3 keep). | Content duplicates lessons already in the pattern file. |

### 2C · Docs — archive (8)

| File | Recommend → | Reason | Evidence |
| ---- | ----------- | ------ | -------- |
| `docs/analysis/architecture-inputs.md` | `docs/_archive/analysis/` | Status `in-progress-architecture-phase` (2026-02-14); decisions superseded by `docs/architecture.md` (status `complete`). | `architecture.md` frontmatter lists this as input. |
| `docs/analysis/spec-vs-code-audit-2026-04-13.md` | `docs/_archive/analysis/` | 2026-04-13 audit; most gaps actioned (Epic 7 `f986e8f9`); 2-3 open gaps tracked elsewhere (CEFR card, FluencyDrill). | Partial — keep as historical record. |
| `docs/E2Edocs/e2e-session-2026-04-22-struggles.md` | `docs/_archive/E2Edocs/` | Infrastructure debugging log from 2026-04-22; all 5 issues fixed; lessons consolidated into `e2e-emulator-issues.md` (Cat 3). | `e2e-emulator-issues.md` references this as post-mortem. |
| `docs/E2Edocs/e2e-test-bugs.md` | `docs/_archive/E2Edocs/` | Mix of resolved (BUG-6 `08abeaa`) + emulator-quirk documentation (BUG-1, BUG-3, BUG-4); not a live tracker. | Open ones are emulator workarounds, not product bugs. |
| `docs/flows/end-user-test-report-2026-04-18.md` | `docs/_archive/flows/` | 60+ flows audit from 2026-04-18; findings cross-referenced to Notion; not a live work tracker. | Improvements branch shipped most findings. |
| `docs/flows/end-user-test-report-parent-flows-2026-04-19.md` | `docs/_archive/flows/` | Parent flow audit; Phases 1-2 shipped (`68a2288c`); Phases 3-5 tracked in plan, not here. | `parent-vocab.ts` exists; phase 3-5 components still pending. |
| `docs/flows/end-user-test-report-quiz-flows-2026-04-19.md` | `docs/_archive/flows/` | Quiz audit; core fixes shipped `68a2288c`; remaining UX polish items tracked in Notion / `ux-todos.md`. | F-Q-01 etc. are polish, not blocking. |
| `docs/template-repo-proposal.md` | `docs/_archive/` (root) | Status "awaiting partner review" 2026-03-27; no template repo work started; future plan with detailed extraction inventory. | `Grep` finds no template-repo activity in git log. |

### 2D · Docs/plans needing user judgment (4)

| File | Status | Recommend |
| ---- | ------ | --------- |
| `docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md` | Plan's own 2026-04-27 status table says Phases 0.0/0.1/0.3 NOT DONE; `c80bb903` (driver swap) may have moved it forward. | **User: verify Phase 0 status.** If complete, archive. Otherwise keep. |
| `docs/plans/2026-04-15-S06-rls-phase-2-4-enforcement.md` | Blocked on Phase 0+1 completing. | **User: tied to row above.** Archive together if Phase 0+1 done. |
| `docs/plans/2026-04-20-prelaunch-llm-tuning.md` | Track 1 shipped (`de9f55b3`, `235d6b8c`); Tracks 0/2/3 (probe battery, hand-edit B.1 tone, model comparison) have no commits — `apps/api/eval-llm/fixtures/probes/` doesn't exist. | **Keep** — partially done with active remaining work. |
| `docs/plans/2026-04-22-library-wiring-and-session-debugging.md` | Parts 1-2 shipped (`2e901ac3`); Part 3 (auto-close after 2 exchanges) marked NOT YET FIXED but `855a632f` (stream-fallback guard) may resolve it. | **User: verify Part 3 status.** If fixed, archive. |

### 2E · Docs needing content updates (1)

| File | What's stale | Suggested update |
| ---- | ------------ | --------------- |
| `README.md` | "Project Status" section claims "Epics 0-5 complete… Phase 1 mobile… mock data… Auth (Clerk) not yet implemented… Not yet implemented: real API integration, SSE streaming, database connection, E2E tests." Reality (per memory): Epics 0-16 complete; auth, API integration, SSE, DB, E2E all shipped; pre-launch with stores blocked. | Rewrite Project Status section + the small "Currently using mock data" line. Also: Stripe is dormant (mobile uses RevenueCat IAP) — Tech Stack table is misleading. |

---

## Category 3 — Keep (116 files)

### 3A · Memory — active rules and architecture facts (~80 files)

All `feedback_*.md` (~40) entries are active workflow / product rules indexed by `MEMORY.md` and currently relied on. All listed Cat 3 except updates noted in 2A. Brief group summary:

- `feedback_*` files (~40) — active workflow / product / process rules. Keep all.
- `project_*` not in Cat 1/2 (~30) — active architecture facts (schema, billing, persona, language, brand, deploy safety, infra), pre-launch blockers (Apple, Google, prod approval gate, deploy config), known issues (NX expo plugin, accent), in-flight specs (parent visibility, F8, summary draft deferred, schema drift pattern, neon — wait, neon is Cat 2B).
- Cross-cutting: `MEMORY.md` (kept with edits — see 2A), `billing-payments.md`, `pricing_dual_cap.md`, `market_language_pivot.md`, `nativewind-windows.md`, `user_device_small_phone.md`, `reference_notion_workspace.md`, `google_play_publishing.md`, `feedback_*` series.

Per-file evidence is brief ("active workflow rule", "active architecture fact"); see agent table in commit history if per-file detail needed for any specific Cat 3 row.

### 3B · Docs — active reference + in-flight (36 files)

| File | Why kept |
| ---- | -------- |
| `docs/PRD.md` | Foundation product requirements; no superseding doc. |
| `docs/architecture.md` | Live architecture reference; called out by CLAUDE.md. |
| `docs/project_context.md` | AI-agent rules; called out by CLAUDE.md. |
| `docs/ux-design-specification.md` | Full UX spec; referenced by architecture.md. |
| `docs/pre-launch-checklist.md` | Active checklist; Apple/Google/Env-gate items still open. |
| `docs/deployment-and-secrets.md` | Live operational guide for Doppler / Workers / Cloudflare. |
| `docs/ux-todos.md` | Active rolling list (created 2026-04-26); H-priority items unresolved. |
| `docs/changelog.md` | **User's personal cleanup log** (untracked at HEAD). Self-references this very task as "RUNNING #9". Do not touch. |
| `docs/privacy-policy.html` | Required for both blocked store submissions; will be needed when unblocked. |
| `docs/logo.svg` | Out of scope (binary asset), but list anyway for completeness. |
| `docs/screenshots_and_store_info/store description.md` | App / Play Store listing copy; needed when stores unblock. |
| `docs/E2Edocs/e2e-emulator-issues.md` | Required reading before any emulator work (per memory rule). **Note co-change C5.** |
| `docs/E2Edocs/e2e-tech-spec.md` | Active Maestro infrastructure spec. |
| `docs/E2Edocs/e2e-testing-strategy.md` | Active strategy doc; explains framework selection rationale. |
| `docs/flows/flow-improvments.md` (typo in filename — keep filename for now) | Rolling UX audit; many items still open. |
| `docs/flows/learning-path-flows.md` | Updated 2026-04-18; current learning-path IA. |
| `docs/flows/mobile-app-flow-inventory.md` | Master flow inventory; source of truth for E2E coverage. **Note co-change C6.** |
| `docs/analysis/product-brief-EduAgent-2025-12-11.md` | Foundation brief; cited by 3 docs. |
| `docs/analysis/research/evidence based learning science.md` | Pedagogy research input; no superseding doc. |
| `docs/analysis/research/market-ai-tutoring-research-2024-12-11.md` | Market research baseline; cited by PRD. |
| `docs/claude-optimization/inherited-rules-skill-mapping.md` | Active 2026-04-30 working doc for ongoing CLAUDE.md cleanup. |
| `docs/claude-optimization/memory-overlap-flags.md` | Active 2026-04-30 working doc; flags canonical conflicts. |
| `docs/specs/epics.md` | Canonical FR spec; 6,273 lines covering FR1-FR261. **Note co-change C4.** |
| `docs/specs/2026-04-07-epic-17-voice-first-design.md` | Master spec for not-yet-shipped Epic 17. |
| `docs/specs/2026-04-18-llm-personalization-audit.md` | Active LLM tuning reference; Phase 3 in progress. |
| `docs/specs/2026-04-18-llm-reliability-ux-audit.md` | "Why" record for envelope migration; referenced by CLAUDE.md. |
| `docs/specs/2026-04-18-llm-response-envelope.md` | Canonical envelope contract; CLAUDE.md non-negotiable rule explicitly names this file. |
| `docs/specs/2026-04-19-prompt-tuning-design.md` | Active spec for B.1-B.5 prompt tuning. |
| `docs/specs/2026-04-28-profile-as-lens.md` (if present — verify) | Active spec for next major feature cycle. |
| `docs/superpowers/specs/2026-04-18-parent-narrative-design.md` | Phases 3-5 not implemented; spec is design authority. |
| `docs/superpowers/specs/2026-04-24-progress-screen-redesign-design.md` | Phase 2 redesign spec; needed for progress-screen Phase 2. |
| `docs/superpowers/specs/2026-04-29-filing-timed-out-observer-design.md` | Spec dated 1 day ago; implementation underway. |
| `docs/superpowers/plans/2026-04-19-parent-narrative-implementation.md` | Phases 3-5 not started. |
| `docs/superpowers/plans/2026-04-20-feedback-and-early-adopter.md` | Feedback system shipped (`f2343ee8`); plan checklist not all ticked — **user: verify and may move to 2C archive**. |
| `docs/superpowers/plans/2026-04-23-llm-never-truncate.md` | Phase 1 shipped; Phases 2-4 telemetry-gated. |
| `docs/plans/2026-04-29-profile-as-lens-phase-1.md` (if present) | New plan; PRs not yet started. |

---

## Already-archived folders — folder-level recommendations

| Folder | File count | Recommendation | Notes |
| ------ | ---------- | -------------- | ----- |
| `docs/specs/Done/` | 31 | **Move** to `docs/_archive/specs/Done/` as-is | Preserves the segregated archive intent under the formal `docs/_archive/` umbrella |
| `docs/specs/deffered/` | 3 | **Rename + Move** to `docs/_archive/specs/deferred/` | Fixes the `deffered` typo on relocation |
| `docs/plans/done/` | 8 | **Move** to `docs/_archive/plans/done/` as-is | Same rationale as `specs/Done/` |
| `.claude/memory/_archive/` | 13 | **No action** — already in correct location | New memory archives append here (per project convention) |

Optional: if the user prefers a flatter archive, `docs/_archive/specs/Done/` could collapse to `docs/_archive/specs/` (and similarly for plans). The plan recommended preserving subfolder structure.

---

## Special cases (non-table notes)

### Out of scope but worth surfacing

- **`.scratch/notion_key.txt`** — loose secret in working tree. **Action recommended (security):** add `.scratch/` to `.gitignore`, **rotate the Notion API key**, remove the file from the working tree. This is not part of the doc-triage scope but should not sit untouched.

### Already addressed before this triage ran

- `MEMORY.md` integrity already healthy — 96/96 indexed memory files exist; only orphan was `project_accent_cascade_broken.md` (already a duplicate stub of the archive copy). No broken links to fix from the index side.

---

## Execution plan (placeholder)

After approval of this report, a separate execution plan will cover the actual deletes / moves. Recommended phasing:

1. **Phase E0 — Pre-flight.** Create `docs/_archive/` skeleton: `plans/`, `specs/`, `analysis/`, `E2Edocs/`, `flows/`, `factory-briefs/`. Commit empty.
2. **Phase E1 — Cat 1 deletes (8 files).** Delete the 8 files in 1A in one commit. No co-changes needed except `governance/index.json` deletion (and remove the empty `governance/` folder).
3. **Phase E2 — Cat 1 archives + co-changes.** For each archive move, also patch the inbound references (conflicts table). Suggested chunking:
   - **E2a:** Memory archives (5 files: `cr_124_scope`, `epic15_code_review`, `expo_router_pollution`, `implementation_phase`, `web_flow_bugs`). Co-update `MEMORY.md` (5 lines) + `project_expo_web_preview.md` (1 line).
   - **E2b:** Doc plan/spec archives (8 files in 1B). Co-update `epics.md` rows (C4), `mobile-app-flow-inventory.md` (C6), the 2 S-06 RLS plans (C7), and `e2e-emulator-issues.md` (C5).
   - **E2c:** Yaml + manual-testing archives (4 files). Co-update `architecture.md` and `ux-design-specification.md` frontmatters (C2, C3).
4. **Phase E3 — Already-archived folder moves (3 folder operations).** Move `specs/Done/`, `specs/deffered/` (with rename), `plans/done/`. Single commit per folder.
5. **Phase E4 — Cat 2 user-decision items.** Apply user's verdicts on the 4 user-judgment plans (2D), the 9 memory updates (2A), and `README.md` rewrite (2E).
6. **Phase E5 — Verification.** Re-grep for Cat 1 basenames repo-wide; confirm zero broken inbound references. Run `pnpm exec nx run-many -t lint` if any markdown linting is configured.

Each phase = one commit minimum, granular `git revert` if anything goes wrong.

---

## Notes on confidence

- All Cat 1 / Cat 2 evidence cells were sourced from agent verification (read of file body + `git log --grep` + `Grep` for code presence). Spot-checked 3 rows manually (e2e-test-results.md header, project_expo_router_pollution.md, plans/order.md tier 1) — all confirmed.
- File counts: agents reported summary counts that disagreed with their actual table row counts. The numbers in this report's Summary section come from the consolidated tables, not agent summaries.
- The "active triaged" total of 164 excludes the 55 already-archived files (folder-level only) and excludes binary / out-of-scope items (`logo.svg`, `.codex/`, `.claude/commands/`, `.claude/my-skills/`, `.claude/worktrees/`, `_bmad-output/`, `.expo/`, `apps/`, `packages/`, `node_modules/`, `.git/`, `.github/`, `.nx/`).
