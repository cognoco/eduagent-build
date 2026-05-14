# Audit & Cleanup Tracking - Index

**Purpose:** Single home for active audit reports, cleanup analyses, and execution notes. These are *meta-work* artefacts about the repo - they are NOT product documentation.

**Index established:** 2026-05-02 (consolidation pulled in `docs/cleanup-triage-2026-04-30.md`, `docs/changelog.md`, and `docs/claude-optimization/*` from the wider `docs/` tree).

**Out of scope (intentionally left where they are):**
- `docs/_archive/analysis/spec-vs-code-audit-2026-04-13.md` — already retired into the formal archive; left in place.
- `docs/E2Edocs/e2e-2026-04-30-empirical-state.md` — point-in-time snapshot, but lives next to its referencing runbook on purpose.
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

## Reference (analysis done; execution detail inside the doc itself)

| File | Date | Scope |
|---|---|---|
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
