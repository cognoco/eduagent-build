# Audit & Cleanup Tracking — Index

**Purpose:** Single home for audit reports, cleanup triage, optimization analyses, and execution punch lists. These are *meta-work* artefacts about the cleanup of the repo — they are NOT product documentation, and they are distinct from `docs/_archive/` (which holds the *destinations* of artefacts removed from active rotation).

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
| [2026-05-02-artefact-consistency-punchlist.md](2026-05-02-artefact-consistency-punchlist.md) | 2026-05-02 | Living tracker for the 9-agent artefact-consistency audit. Lists "Already shipped" / "In flight" / "Track B remaining" items keyed by `AUDIT-*` IDs (PR refs included). |
| [2026-05-02-audit-schema-2-plan.md](2026-05-02-audit-schema-2-plan.md) | 2026-05-02 | Plan-only doc for the response-schema migration finding (36 of 41 API routes call `c.json()` without runtime Zod validation). YELLOW-leaning-RED severity. No PRs opened. |
| [_changelog.md](_changelog.md) | 2026-04-30 → ongoing | **User's personal cleanup activity log.** Numbered session-by-session record of the broader Claude/repo optimization effort (Claude config, modern CLI tools, memory cascade, stale-doc sweep, context-audit passes, emulator WIP). Appended to as work proceeds. *Not* a product changelog despite the legacy filename. Renamed from `docs/changelog.md` 2026-05-02. |

## Reference (analysis done; execution detail inside the doc itself)

| File | Date | Scope |
|---|---|---|
| [2026-04-30-cleanup-triage.md](2026-04-30-cleanup-triage.md) | 2026-04-30 | The big general sweep: 164 active files triaged into Cat 1/2/3, with co-change conflicts, folder-level recommendations, an out-of-scope security flag (`.scratch/notion_key.txt`), and a phased execution plan (E0–E5). Re-read before any future doc-pruning effort. |
| [claude-optimization/inherited-rules-skill-mapping.md](claude-optimization/inherited-rules-skill-mapping.md) | 2026-04-30 | First-pass mapping of CLAUDE.md "Inherited Rules" subsections vs. loaded skills. Phase A/B/C executed (3 deletes, 4 paraphrase reductions, 16 keeps). Contains a 2026-05-02 note flagging that the `ux-dead-end-audit` skill referenced inside never materialized — affected mappings remain unresolved. |
| [claude-optimization/memory-overlap-flags.md](claude-optimization/memory-overlap-flags.md) | 2026-04-30 | Step-1 classification of memory entries that paraphrase global / inherited CLAUDE.md rules. Bodies of individual memories were not read in this pass — flagged items still need body verification before any change. |

---

## How to add a new audit doc

1. Filename: date-prefix in ISO form (`YYYY-MM-DD-<slug>.md`) for date-scoped reports, mirroring the existing `2026-05-02-*` files. Use a descriptive non-dated name only for living docs (e.g. `_changelog.md`).
2. Add a row to the table above under the matching status section.
3. When something moves from **Active** → **Reference**, just relocate its row. No need to date-stamp the move itself; the file's own header is the source of truth.
4. If a tracking doc becomes fully obsolete (the audit it tracked is closed AND no future audit cites it), it can move to `docs/_archive/` — not stay here.
