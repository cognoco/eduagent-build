DOC: docs/specs/epics.md (last modified 2026-06-09, 392K / 6,280 lines — legacy Epic 0-16 register; NOT fully read per instruction, sampled: FR inventory header, Epic 4/7/12/WEB-A headings + cited line ranges, and existing "Superseded" annotation sites)

CLAIMS:
- Is the original epic/story breakdown (FR1-FR176+, Epics 0-16) for the whole MentoMate build — treated as the historical planning register, not a live spec.
- Per AGENTS.md/memory: "Epics 0-16 COMPLETE" — this doc's content is implementation-history, already superseded by current architecture docs (`docs/architecture.md`, `docs/audience-matrix.md`, navigation-contract, ADRs).
- Some sections already carry explicit "Superseded by <ADR/Epic/Story>" annotations (4 found: line 323 ARCH-9→MMT-ADR-0014/0016; line 356/1581 UX-10→Epic 13 Story 13.2; line 415 FR118-127→FR160-168 Epic 7 v3; lines 598/2832/2992 metering stub→real implementation).
- FR6 ("Parents can switch into child's profile for full access to learning history", line 29), Epic 4 dashboard scope (line 2432), Epic 7 self-building-library v3 (line 3184), Epic 12 persona-enum removal (line ~764), and WEB-A parent-control-center-web candidate (line 6171) currently carry NO superseded/deprecated annotation despite the current codebase having moved past or reframed each (isOwner gating replaces "switch into profile" framing per AGENTS.md Profile Shapes section; Epic 12's personaType removal is itself flagged complete elsewhere; WEB-A is explicitly "CANDIDATE / NOT STARTED" at line 471 already).

TECH VALIDITY: no broken technical assumption in the doc itself — it's an honest historical record; the gap is purely doc-hygiene (missing forward-pointer annotations), not incorrect claims.

IMPLEMENTED: per claim —
- Epics 0-16 overall: complete, per `.claude/memory/MEMORY.md` (`project_implementation_phase.md` — "Epics 0-16 COMPLETE") and AGENTS.md snapshot counts (~88 mobile screens, 49 API route groups).
- FR6 (parent switch-into-child-profile): partial/superseded-by-current-model — current gating is `isOwner`/`familyLinks`-derived role (AGENTS.md "Profile Shapes" section), not a literal "switch into child's profile" UX; needs a superseded-pointer to the isOwner model, not a rewrite.
- Epic 4 (Progress/Motivation/Parent Dashboard): complete per epics.md's own "Deferred items arriving" note already resolved by later epics; no current annotation.
- Epic 7 v3 (self-building library): complete — doc's own "What Changed from v2" table already documents its internal supersession of the v2 DAG design; this is the CURRENT architecture, just needs to be marked as such relative to Annex framing, not re-superseded.
- Epic 12 (persona enum removal): complete per AGENTS.md ("Persona Architecture (Epic 12 — COMPLETE, ThemeContext cleaned 2026-04-15)").
- WEB-A (parent control center, web): not started — already correctly marked "CANDIDATE... NOT STARTED" at line 471; no annotation gap here beyond consistency with the pass.

CANDIDATE WIs:
- WI-1460 "epics.md Annex A.5 superseded-annotation pass (FR6, Epic 4, Epic 7, Epic 12, WEB-A)" — fate: adopt. Confirmed each cited location is stale/uncontextualized relative to current source-of-truth docs and lacks a forward pointer, consistent with the doc's own existing annotation pattern (4 precedents found). This is genuinely the only residue on this row — no code changes, no other candidates map here.

VERDICT: obsolete (as a living spec) — the document is intentionally retained as historical record; only its cross-reference hygiene is incomplete.

MVP RECOMMENDATION: out of MVP critical path — pure documentation hygiene, zero runtime/product impact. Fold into general docs-debt backlog; not a blocker for Config T V2 / Google Play readiness.

CONFIDENCE: high — sampled all 5 cited locations directly, cross-checked against AGENTS.md's own current-state claims (Profile Shapes, Epic 12 completion) and the doc's own precedent annotation pattern. Zuzka questions: (1) Is a doc-hygiene pass on a 6,280-line legacy file worth scheduling now vs. deferred indefinitely — any value beyond onboarding clarity? (2) Should WI-1460 instead scope to a short "status banner" at the top of epics.md (like WI-1340's consent doc) pointing to `docs/architecture.md`/AGENTS.md, rather than 5 inline annotations — cheaper and matches the established SHIPPED-banner pattern seen on row 22?
