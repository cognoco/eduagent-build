# Audit & Cleanup Tracking - Index

**Purpose:** Single home for active audit reports, cleanup analyses, and execution notes. These are *meta-work* artefacts about the repo - they are NOT product documentation.

**Index established:** 2026-05-02 (consolidation pulled in `docs/cleanup-triage-2026-04-30.md`, `docs/changelog.md`, and `docs/claude-optimization/*` from the wider `docs/` tree).

**Out of scope (intentionally left where they are):**
- `docs/_archive/analysis/spec-vs-code-audit-2026-04-13.md` — already retired into the formal archive.
- `docs/_archive/E2Edocs/e2e-2026-04-30-empirical-state.md` — point-in-time snapshot (archived)
- `docs/_vault/emulator-2026-04-30/` — self-contained "stash" of replaced docs from the emulator-fix WIP; distinct purpose.
- `.claude/memory/_archive/` — per-repo convention; new memory archives append here.

---

## Active (current work)

| File | Date | Scope |
|---|---|---|
| [_changelog.md](_changelog.md) | 2026-04-30 → ongoing | **User's personal cleanup activity log.** Numbered session-by-session record of the broader Claude/repo optimization effort (Claude config, modern CLI tools, memory cascade, stale-doc sweep, context-audit passes, emulator WIP). Appended to as work proceeds. *Not* a product changelog despite the legacy filename. Renamed from `docs/changelog.md` 2026-05-02. |
| [test-mocks.md](test-mocks.md) | 2026-05-12 | Current mock-boundary audit and recommended reduction strategy. |
| [goal-spike.md](goal-spike.md) + follow-ups | 2026-05-13/14 | `/goal` spike proposals and GC1/mock-drain scope notes. |
| [e2e/](e2e/) | 2026-05-14 | E2E quality uplift proposal, measured baseline, and raw local run logs. |
| [2026-07-08-wi-1181-dependency-lockfile-hygiene.md](2026-07-08-wi-1181-dependency-lockfile-hygiene.md) | 2026-07-08 | WS-34 `WI-1181` dependency-lockfile hygiene audit: `pnpm why` classifications for flagged dev/build transitive dependencies and no-op lockfile outcome. |
| [2026-07-11-consent-denial-behavior.md](2026-07-11-consent-denial-behavior.md) | 2026-07-11 | `WI-1761` current consent-denial path: immediate erasure, retained residue, mobile recovery, ruled-direction diff, and post-counsel build slices. |

## Reference (analysis done; execution detail inside the doc itself)

| File | Date | Scope |
|---|---|---|
| [2026-06-09-codebase-atlas/](2026-06-09-codebase-atlas/) | 2026-06-09 | **30-agent codebase review + functional atlas** (branch `new-llm` @ `df3e8e44b`). The surviving content is the 15-domain functional atlas (`atlas/*.md`): per-domain screen → user-task → backend `file:line` maps, nav-depth tables, buried-capability lists — the evidence substrate for the mentor-is-the-app shell-redesign spec. The PART 1 bug register (15 lens reports) was retired 2026-06-10: live findings migrated to the Notion Issue Tracker, full detail in git history at the pre-move path `docs/reviews/2026-06-09-codebase-atlas/bugs/`. Folder moved here from `docs/reviews/` 2026-06-10. |
| [2026-05-29-full-audit/workflow-1/](2026-05-29-full-audit/workflow-1/) | 2026-05-30 | **i18n hardcoded-string audit** (mobile JSX). Multi-agent workflow over all 265 non-test `apps/mobile/src/**/*.tsx`. 960 confirmed user-visible strings bypassing `t()` across 92 files (694 high — incl. 200 `accessibilityLabel`s). Seed inventory + `proposed-baseline.json` for the planned Phase 3 ratchet. |
| [2026-05-29-full-audit/workflow-2/](2026-05-29-full-audit/workflow-2/) | 2026-05-30 | **GC6 internal-mock backlog survey.** Multi-agent workflow over 164 test files / 716 `jest.mock()` sites. Real backlog = 153 internal-violation sites (API 103, mobile 50; 101 `trivial-requireActual`). Full classification in `catalog.csv`. Caveat: ignore the `already-gc1-allow` "convertible" count. |
| [2026-05-29-full-audit/workflow-3/](2026-05-29-full-audit/workflow-3/) | 2026-05-30 | **`inngest.send()` core-send compliance sweep** (semantic complement to the syntactic `safe-non-core.guard.test.ts` ratchet). 48 real dispatches; 2 confirmed HIGH mismatches — `mislabeled-core-send` (revenuecat-webhook-handler.ts:446) and `hidden-core-safesend` (subject.ts:161). |
| [2026-05-29-full-audit/workflow-4/](2026-05-29-full-audit/workflow-4/) | 2026-05-30 | **Audience-matrix re-verification** of `docs/audience-matrix.md`. Multi-agent workflow re-locating each gate by description. Only 3/32 citations still accurate (line/symbol rot from the navigation-contract migration); findings mostly hold (9 of F1–F14). Corrected citation map inside. |
| [2026-05-29-full-audit/deep-review/](2026-05-29-full-audit/deep-review/) | 2026-05-29/30 | **Deep-review audit archive.** Six `/deep-review` runs across architecture, agent instructions, API security/PII, Inngest security/PII, API error handling, and mobile l10n/a11y. Start with `META-REPORT.md` for consolidated findings and the remediation plan; per-run summaries live under dated subdirectories. |
| [2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md](2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md) | 2026-05-29 | Deepening opportunities (shallow→deep module consolidation for testability & AI-navigability). 11 candidates across API tutoring engine, mobile navigation, route/schema seams. Recommended start: #1–#3, #5, #6. Companion to the mined root `CONTEXT.md`. |
| [2026-05-29-full-audit/2026-05-29-architecture-audit.md](2026-05-29-full-audit/2026-05-29-architecture-audit.md) | 2026-05-29 | Whole-monorepo architecture review (module complexity, silent failures, type-safety gaps, test-coverage holes, LLM-friendliness). Headline: untested billing/quota tier. |
| [2026-05-08-web-e2e-full-suite-bug-ledger.md](2026-05-08-web-e2e-full-suite-bug-ledger.md) | 2026-05-08 | Web E2E full-suite bug ledger. |
| [2026-05-11-end-user-playwright-bug-pass.md](2026-05-11-end-user-playwright-bug-pass.md) | 2026-05-11 | Seeded end-user Playwright bug pass. |
| [2026-05-11-parent-home-end-user-audit.md](2026-05-11-parent-home-end-user-audit.md) | 2026-05-11 | Parent home end-user audit. |
| [2026-05-11-single-learner-ux-pass.md](2026-05-11-single-learner-ux-pass.md) | 2026-05-11 | Single learner UX pass. |
| [_audit-report-template.md](_audit-report-template.md) | 2026-05-02 | Template for future audit reports. |

## Archived

| Location | Scope |
|---|---|
| [../_archive/consistency-cleanup/audit/](../_archive/consistency-cleanup/audit/) | Completed artefact-consistency cleanup plan, source recons, overview docs, C9 handover, and dispatch graph. |
| [../_archive/consistency-cleanup/visual-artefacts/](../_archive/consistency-cleanup/visual-artefacts/) | Visual artefacts generated specifically for the completed cleanup plan. |

---

## How to add a new audit doc

1. Filename: date-prefix in ISO form (`YYYY-MM-DD-<slug>.md`) for date-scoped reports, mirroring the existing `2026-05-02-*` files. Use a descriptive non-dated name only for living docs (e.g. `_changelog.md`).
2. Add a row to the table above under the matching status section.
3. When something moves from **Active** → **Reference**, just relocate its row. No need to date-stamp the move itself; the file's own header is the source of truth.
4. If a tracking doc becomes fully obsolete (the audit it tracked is closed AND no future audit cites it), it can move to `docs/_archive/` - not stay here.
