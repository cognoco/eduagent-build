---
title: S2-02 — Docs-tree reorg mapping table (MentoMate Stream-2 estate-canon drain)
status: "APPROVED — D3 ruled (operator, 2026-07-15 sitting 2): bulk as tabled + all 7 §7 judgment calls as recommended (audience-matrix → registers/, flows → registers/ lockstep, project_context.md stays root, screenshots → compliance/store/ whole, visual-artefacts scripts bundled, §5 small-file targets, rot item i folds into execution, item ii → WI-2081). Execution = WI-2074 (S2-11, Wave 3 per D7) + WI-2076 (S2-13). §I.4 diagram amendment (+compliance/ +audit/) rides WI-757. Ruling record: slice plan § RULINGS."
wave: Wave-0
date: 2026-07-14
provenance: >
  Produced against /Users/vetinari/nexus/_dev/eduagent-build @ working tree state
  2026-07-14. Read-only inventory + repo-wide grep. Zero files moved, renamed, or
  edited. No git operations performed. Sole input to operator D3 (approve docs-tree
  mapping); the reorg itself is a later, separately-authorized WI (S2-11), which per
  operator ruling executes only after the ADR backfill.
sealed-quarantine: >
  docs/_archive/parallel-adr-audit-2026-06-03/ was NOT opened or read (3 files inside,
  counted only via directory listing, never grepped or catted). Its disposition is
  KEEP / do-not-touch by construction of this exercise; nothing in this report
  depends on its contents.
---

# S2-02 — Docs-tree reorg mapping table

## 0. Scope and method

Inventoried **790 files** under `docs/` (`find docs -type f`) plus the repo-root
loose docs already known to J3. For every file/dir proposed to move, ran `rg`
across the whole repo (excluding `node_modules`, `.git`, the sealed quarantine
dir, and lockfiles) to find every citation by basename, then bucketed hits by
consuming location (CI workflows, checker scripts, code comments, agent
doctrine, `.claude/memory/`, other `docs/` files, `_wip/` planning docs,
`docs/_archive/` — frozen/historical). No file was moved, edited, or renamed.

---

## 1. The target layout (§I.4, quoted)

From `docs/adr/MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md`,
Part I.4 "Physical placement":

```
repo root
  README.md                      project entry signpost
  CONTEXT.md                     L0 glossary — root anchor (+ per-area CONTEXT.md, distributed)
  CLAUDE.md  AGENTS.md            cross-cutting agent doctrine (lives where the harness loads it)
docs/                            ← root holds only subdirectories; never loose canon
  canon/                         L1 — spine: architecture.md, prd.md, ux-design-specification.md, principles.md
    <domain>/                    L1 — a stream's domain canon, prefix-dropped (first: identity/ — ontology.md, domain-model.md, data-model.md, prd.md)
  adr/                           L2 — decisions (README.md authoring guide + MMT-ADR-*.md)
  specs/                         L3 — feature definitions + acceptance (domain nests within)
  plans/                         L3 — implementation plans
  runbooks/                      L3 — operational procedures
  registers/                     L3 — governed data masters + their immutable provenance trails (domain nests within, e.g. registers/llm-models/)
  assets/                        non-doc artifacts: images, mockups, screenshots, diagrams, logos
  _archive/                      retired / tombstoned docs
.claude/memory/                  L4 — lessons / working memory (agent-runtime state, versioned)
```

**My reading, mapped one level deeper than the ADR text spells out:**

| Layer | Directory | What actually belongs here (this exercise's reading) |
|---|---|---|
| L1 canon | `docs/canon/` | The estate spine (`architecture.md`, `prd.md`, `ux-design-specification.md`, `principles.md`) at `canon/` root; per-stream domain canon nests at `canon/<domain>/`, prefix-dropped |
| L2 decisions | `docs/adr/` | Already fully conformant — `MMT-ADR-*.md` + `README.md` authoring guide |
| L3 operational | `docs/specs/` `docs/plans/` `docs/runbooks/` `docs/registers/` | Feature defs+AC, implementation plans, ops procedures, governed-data masters |
| Assets | `docs/assets/` | Non-doc artifacts only — images, mockups, screenshots, diagrams, logos. **Not** scripts, not markdown prose |
| Drain | `docs/_archive/` | Retired/tombstoned docs |
| L4 memory | `.claude/memory/` | Outside `docs/` entirely |

**Two directories in active use are not named anywhere in §I.4's tree, yet the
ADR text itself (line 87) and the J3 disposition doc both treat them as
established siblings:** `docs/compliance/` (ADR-0000 prose calls it "a sibling
type directory" in passing, without adding it to the §I.4 diagram) and
`docs/audit/` (J3 calls it "the Meta layer," with **no ADR-0000 grounding at
all** — this is asserted only by the J3 disposition doc, not by the ADR). This
is flagged in §6 (Risk notes) as a real gap: if Stream 2 formalizes the tree,
ADR-0000's own diagram should probably be amended to list these two — today
they're sanctioned by convention/J3-precedent, not by the text an agent would
actually grep.

---

## 2. Current-state summary

`docs/` holds **790 files**. Breakdown:

| Bucket | File count | §I.4 status |
|---|---|---|
| `_archive/` (incl. 3-file sealed quarantine, untouched) | 329 | Conformant — the drain, working as designed |
| `audit/` | 137 | Conformant by J3-precedent (no ADR-0000 text names it) |
| `plans/` | 59 | Conformant |
| `adr/` | 34 | Conformant |
| `logo-designs/` | 64 | Asset-shaped, not yet under `assets/` |
| `flows/` | 32 | **Misclassified by J3** — see §5 |
| `visual-artefacts/` | 19 | Asset-shaped but mixed with generator scripts — see §5 |
| `specs/` | 14 | Conformant |
| `_vault/` | 13 | Nonstandard — historical snapshot |
| `runbooks/` | 11 | Conformant |
| `reviews/` | 11 | Nonstandard, not in J3's original enumeration (appeared/grew after 2026-06-09) |
| `registers/` | 8 | Conformant |
| `mockups/` | 7 | Asset-shaped |
| `analysis/` | 6 | Nonstandard |
| `compliance/` | 10 | Conformant by ADR-0000 passing-mention |
| `canon/` | 5 | Conformant (identity domain only so far) |
| `screenshots_and_store_info/` | 4 | Asset/compliance mix |
| `meetings/` | 4 | Nonstandard, mixed content (see §5) |
| `testing/` | 1 | Nonstandard, not in J3's enumeration; **Stream-2 planning docs already treat this as a live target dir** (see §5) |
| `incidents/` | 1 | Nonstandard, not in J3's enumeration |
| `assets/` | 1 (`.gitkeep` only) | The sanctioned dir exists and is **empty** — nothing has been drained into it yet |
| `E2Edocs/` | 1 | Nonstandard, heavily cited (see §5) |
| `_scratch/` | 1 | Nonstandard, zero citations |
| **Root loose files** | 18 | **All nonconformant** — §I.4 says root holds subdirectories only |

**How far from conformant:** roughly **77%** of the 790 files (`_archive` + `audit` + `plans` + `adr` + `specs` + `runbooks` + `registers` + `compliance` + `canon`) already sit in a sanctioned home. The remaining ~23% (182 files: 164 across 13 nonstandard/asset dirs + 18 root loose files) is exactly what J3 deferred to Stream 2, plus two dirs (`incidents/`, `reviews/`) that didn't exist yet when J3 ran and were never dispositioned by anyone. **`docs/assets/` is a no-op today by construction** — it's the sanctioned drain target but is empty, meaning every "assets" bucket move below is a first-fill, not a merge.

---

## 3. The mapping table

Citation counts are **total grep hits** (raw lines) across the whole repo,
excluding the sealed quarantine dir. "Unique files" is the number of distinct
files carrying at least one hit. Full breakdowns are in §4.

### 3.1 Root loose files (all currently nonconformant — §I.4 forbids loose canon at `docs/` root)

| # | Current path | Proposed target | Layer | Rationale | Citations (lines / files) |
|---|---|---|---|---|---|
| 1 | `docs/architecture.md` | `docs/canon/architecture.md` | L1 canon (spine) | Named explicitly in §I.4 spine list | 402 / 140 |
| 2 | `docs/PRD.md` | `docs/canon/prd.md` (note: lowercase — matches §I.4's literal spine listing; no collision with existing `docs/canon/identity/prd.md`, a different domain doc) | L1 canon (spine) | Named explicitly in §I.4 spine list | 80 / 33 |
| 3 | `docs/ux-design-specification.md` | `docs/canon/ux-design-specification.md` | L1 canon (spine) | Named explicitly in §I.4 spine list | 56 / 23 |
| 4 | `docs/audience-matrix.md` | **UNHOMED — see §5** | Cross-cutting, not identity domain canon per J3's explicit ruling | J3 ruled DEFER, no target named | 83 / 46 |
| 5 | `docs/glossary.md` | **NOT THIS WI'S TO MOVE — see §5** | Rogue non-canon draft, phased bucket-1/2/3 disposition already owned by planned WI **S2-12** | J3: "not J3's to move/delete"; Stream-2 planning already has a dedicated slice for it | 25 / 13 |
| 6 | `docs/project_context.md` | **UNHOMED — recommend KEEP at `docs/` root as a named exception** | Agent-doctrine satellite, doesn't cleanly fit L0–L4 | J3: "KEEP at root; doc-architecture question is Stream-2, not identity-reachable" — and it's load-bearing CI input (see §6) | 65 / 35 |
| 7 | `docs/change-classes.md` | `docs/runbooks/change-classes.md` | L3 operational (CI-routing procedure) | Pure "what to run for this diff" procedure; J3 bucketed as L3, target ambiguous between specs/runbooks — runbooks fits the content | 31 / 17 |
| 8 | `docs/deployment-and-secrets.md` | `docs/runbooks/deployment-and-secrets.md` | L3 operational | Ops procedure guide | 38 / 18 |
| 9 | `docs/e2e-smoke-pack.md` | `docs/runbooks/e2e-smoke-pack.md` | L3 operational | Release-gate procedure | 3 / 3 |
| 10 | `docs/future-app-options.md` | **UNHOMED — see §5** | Speculative, no completion date, disclaims commitment | Doesn't cleanly satisfy L3's "has a completion date after which it's history" test | 1 / 1 |
| 11 | `docs/llm-issues.md` | `docs/runbooks/llm-issues.md` | L3 operational (living troubleshooting log) | Best available fit despite the "living, never archived" tension (flagged in §5) | 3 / 3 |
| 12 | `docs/pre-launch-checklist.md` | `docs/runbooks/pre-launch-checklist.md` | L3 operational | Release checklist, clear runbook shape | 7 / 5 |
| 13 | `docs/ux-todos.md` | **UNHOMED — see §5** | Rolling backlog list, not a procedure or a spec | Doesn't fit any L3 sub-type cleanly | 4 / 3 |
| 14 | `docs/ci-troubleshooting.md` | `docs/runbooks/ci-troubleshooting.md` | L3 operational | Textbook runbook content, already superseding a memory file | 2 / 1 |
| 15 | `docs/Strategy_analysis.md` | **UNHOMED — see §5** | Zero citations anywhere; isolated strategy memo | Thematically identical to `docs/analysis/` content, which is itself undispositioned | 0 / 0 |
| 16 | `docs/logo.svg` | `docs/assets/logo.svg` | Asset | Canonical brand SVG, exactly what `assets/` exists for | 2 / 2 |
| 17 | `docs/privacy-policy.html` | `docs/compliance/privacy-policy.html` (not `assets/` — see §5) | Compliance/legal | Overwhelmingly cross-cited by `docs/compliance/*` and audit docs as a compliance artifact, not a static asset | 15 / 10 |
| 18 | `docs/INDEX.md` | **KEEP, no move** | Cross-layer umbrella index | J3: root-level index by design; also §I.4's own text implies `docs/` root may carry its per-directory `README.md`-style index | (self-referential only) |

### 3.2 Nonstandard directories (J3-named, DEFER Stream 2, per-file fate)

| # | Current path | Proposed target | Layer | Rationale | Citations (lines / files) |
|---|---|---|---|---|---|
| 19 | `docs/E2Edocs/e2e-runbook.md` (1 file) | `docs/runbooks/e2e-runbook.md` | L3 operational | It IS a runbook; heavily cited by live tooling (see §6 — CI-adjacent risk) | 41 / 22 |
| 20 | `docs/_scratch/ci-cd-event-map.html` (1 file) | `docs/assets/ci-cd-event-map.html` (if still wanted) or `docs/_archive/` (if stale) | Asset or archive | Zero external citations — safest file in the whole tree to move; purely a content-freshness judgment call | 0 / 0 |
| 21 | `docs/_vault/emulator-2026-04-30/**` (13 files) | `docs/_archive/vault/emulator-2026-04-30/**` | Archive | It's a named point-in-time snapshot/backup (`.claude-commands/` + duplicated `E2Edocs/`) — textbook archive material | 14 / 8 |
| 22 | `docs/analysis/**` (6 files) | **UNHOMED — see §5**, recommend `docs/_archive/analysis/` (joining the two siblings already archived there) | Archive (partial precedent exists) | See §5 — two sibling files from this same folder were already archived in a 2026-05 cleanup; the remaining 6 are the same shape | 29 / 11 |
| 23 | `docs/meetings/2026-06-04-age-floor-decision-minutes.md`, `2026-06-05-launch-posture-decision-brief.md`, `age-country-explorer.html` (3 files) | `docs/_archive/meetings/` (minutes/briefs) + `docs/assets/` or `tools/` (the HTML explorer — see §5) | Archive / unhomed | Genuine meeting minutes/decision briefs — historical once the decision is made | 12 / 8 (combined, minus the item below) |
| 24 | `docs/meetings/minors-compliance-requirements.md` (1 file) | `docs/compliance/minors-compliance-requirements.md` | **Reclassified out of the "meetings" bucket entirely** — see §5 | Despite its location, this is a live, heavily-cited compliance checklist (LIST A/LIST B), not meeting minutes | 15 / 9 |

### 3.3 Asset-shaped directories (J3 bucketed under "assets", target `assets/`)

| # | Current path | Proposed target | Layer | Rationale | Citations (lines / files) |
|---|---|---|---|---|---|
| 25 | `docs/logo-designs/**` (64 files) | `docs/assets/logo-designs/**` | Asset | Pure image/SVG library; matches §I.4's "logos" example exactly | 8 / 5 |
| 26 | `docs/mockups/**` (7 files) | `docs/assets/mockups/**` | Asset | Matches §I.4's "mockups" example exactly | 2 / 2 |
| 27 | `docs/screenshots_and_store_info/**` (4 files) | **Judgment call — see §5**, lean `docs/compliance/store/**` | Asset/compliance mix | Contains both store-listing copy (asset-like) and a compliance checklist heavily cross-cited by `docs/compliance/` and `docs/audit/` | 12 / 5 |
| 28 | `docs/visual-artefacts/**` (19 files) | `docs/assets/visual-artefacts/**` for the images/HTML; **`scripts/` or a new non-docs home for the 3 generator scripts + data/css/js support files — see §5** | Asset (mixed) | §I.4's `assets/` is "non-doc artifacts: images... diagrams" — it does not describe holding build scripts | 48 / 13 |
| 29 | `docs/flows/**` (32 files) | **NOT an assets-bucket item — see §5, reclassify to L3** | Misclassified by J3 | Every file in this directory today is markdown (flow inventories, a master-directory index, plans/), not a single image | 129 / 65 |

### 3.4 Directories that postdate J3 (2026-06-09) — never dispositioned by anyone

| # | Current path | Proposed target | Layer | Rationale | Citations (lines / files) |
|---|---|---|---|---|---|
| 30 | `docs/incidents/2026-04-stg-push-incident.md` (1 file) | `docs/runbooks/incidents/2026-04-stg-push-incident.md` | L3 operational | Postmortem actively cited by a live DB-safety checker script (see §6) — keep near ops, not archived | 1 / 1 |
| 31 | `docs/reviews/2026-06-10-learning-flow-simplification-deepdive/**` (11 files) | `docs/audit/2026-06-10-learning-flow-simplification-deepdive/**` | Matches established precedent | `docs/audit/INDEX.md:31` documents that the *only prior occupant* of `docs/reviews/` (`2026-06-09-codebase-atlas`) was already migrated to `docs/audit/` on 2026-06-10. This is live-cited by two active specs, not stale — same treatment applies | 6 / 6 |
| 32 | `docs/testing/flaky-quarantine.md` (1 file) | **KEEP, or promote `docs/testing/` to a recognized L3 sibling — see §5** | L3 operational (emerging) | Two *already-drafted* Stream-2 planning docs (`_wip/umbrella-program/2026-07-12-stream-2-slice-plan-DRAFT.md` row S2-10, `stream-2-backlog.md`) name `docs/testing/` as the intended landing zone for other memory-migration content. Moving it now would fight a decision already in flight | 5 / 4 |

---

## 4. Citation-update appendix

Convention: **CODE/CI** = a real functional dependency (script output, checker
input, `.gitignore` pattern, CI-action input path) that will actually break or
mislead if not updated in the same change-set as the move. **DOCTRINE** =
`AGENTS.md`/`CLAUDE.md`/`CONTEXT.md`. **DOCS** = another file under `docs/`.
**MEMORY** = `.claude/memory/`. **WIP** = `_wip/` planning docs (ephemeral by
nature; lower priority, but shown for completeness). **ARCHIVE** =
`docs/_archive/` (frozen; will not be edited going forward — informational
only, not part of the update burden).

### 4.1 `docs/architecture.md` → `docs/canon/architecture.md`

**402 lines across 140 files.** Category breakdown: 45 in `docs/_archive/` (frozen), 2 `docs/INDEX.md`, 7 doctrine, 3 code comments, 0 CI, 190 in `_wip/`, remainder (~110) other `docs/` files.

- **`docs/INDEX.md:67,102`** — the seed-caveat text already names this file for the eventual drain; both lines need the new path.
- **Doctrine (7 hits, `CONTEXT.md` + `AGENTS.md`):** `CONTEXT.md:10`; `AGENTS.md:9,90,345,353,358,433`. All are prose pointers (`` `docs/architecture.md` ``), not code — a straightforward find/replace, but they are the highest-traffic doc an agent reads first.
- **Code comments (3, low risk, comment-only):** `apps/api/src/services/exchanges.test.ts:1927`, `apps/api/src/services/exchanges.ts:413`, `packages/retention/README.md:60`.
- **Top `docs/` citers (representative, not exhaustive):** `docs/specs/epics.md` (10 hits), `docs/adr/MMT-ADR-0000-...md` (10, self-referential meta-citations of its own tree diagram — see §1), `docs/audit/2026-06-30-adr-provenance-revet.md` (7), `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` (6), `docs/adr/README.md` (5), `docs/audit/2026-07-12-one-way-door-risk-register.md` (4, includes `docs/architecture.md:1245`, `:1912`, `:1934`, `:1961`, `:1975`, `:2029` **line-anchored** citations — these will need re-anchoring if the move causes any content renumbering, not just a path change), `docs/project_context.md` (3), several `docs/plans/*` and other `docs/adr/MMT-ADR-*` files (1–3 each).
- **`_wip/` (190 hits)** — overwhelmingly identity-foundation and umbrella-program planning docs already in flight; not itemized line-by-line here (ephemeral, many will be superseded before Stream 2 executes), but the volume itself is a signal: this is the single most cross-referenced file in the repo.

### 4.2 `docs/PRD.md` → `docs/canon/prd.md`

**80 lines / 33 files.** 5 archive, 2 `docs/INDEX.md`, 1 doctrine (`AGENTS.md:433`, shared with architecture.md), 1 code comment, 2 memory, 50 `_wip/`, 14 other docs.

- **Code:** `apps/api/src/services/subject.ts:78` — `` * PRD (docs/PRD.md "Subject Limits") defines TWO limits: ``.
- **Memory (2):** `.claude/memory/project_freeform_library_filing_decision.md:9` (relative link `../../docs/PRD.md`), `.claude/memory/feedback_never_lock_topics.md:9`.
- **Docs (representative):** multiple `docs/adr/MMT-ADR-*.md` files citing PRD sections in passing (0000, 0004, 0019, 0021, 0023 — 1-3 hits each).
- **Note:** `docs/canon/identity/prd.md` already exists (a *domain* PRD, unrelated file) — confirmed no path collision with the proposed `docs/canon/prd.md` spine target.

### 4.3 `docs/ux-design-specification.md` → `docs/canon/ux-design-specification.md`

**56 lines / 23 files.** 7 archive, 2 `docs/INDEX.md`, 0 doctrine, 0 code/CI, 32 `_wip/`, 10 other docs (`docs/adr/MMT-ADR-0000` ×4, `docs/specs/epics.md` ×2, `docs/architecture.md` ×1, `docs/adr/README.md` ×1, `docs/adr/MMT-ADR-0019` ×1). Lowest-risk of the three spine moves — no code or CI coupling found.

### 4.4 `docs/audience-matrix.md` (UNHOMED — see §5 for target)

**83 lines / 46 files.** Confirmed live citation: `docs/canon/identity/prd.md:325` — **not line 319 as this WI's brief assumed**; the file has grown since J3 was written (2026-06-09) and the anchor has already drifted 6 lines. This is itself a demonstration of the exact citation-rot risk this exercise exists to prevent.

- **Doctrine:** `AGENTS.md:214` — the "Profile Shapes" section's pointer to the full audience matrix, plus the F1–F14 gating-gap reference.
- **Memory:** `.claude/memory/project_product_roles_students_any_age.md:18`.
- **Heaviest citer cluster — `docs/flows/master-directory/**` (14 files, 1 hit each):** every per-flow page in the flow master directory cites `audience-matrix.md` in its "Sources" header line (e.g. `docs/flows/master-directory/billing/BILLING-04.md:6`, `.../home/HOME-01.md` through `HOME-07.md`, `.../account/ACCOUNT-03.md`, `ACCOUNT-30.md`, `.../parent/PARENT-03.md`, `.../learn/LEARN-17.md`, plus the directory's own `README.md` and `_template.md` and `docs/flows/flow-master-directory.md:17` and `docs/flows/mobile-app-flow-inventory.md`). **This ties `audience-matrix.md`'s move directly to `docs/flows/`'s move (§3.3 item 29) — they should be sequenced together or the flow pages will cite a stale path the moment either one lands.**
- **Audit cluster (large):** `docs/audit/2026-05-31-logical-gap-audit.md` (22 hits — the single heaviest citer of this file in the whole repo), `docs/audit/2026-05-29-full-audit/workflow-4/recommendations.md` (6), `.../workflow-4/findings.csv` (3, embedded in structured data), `.../deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` (3), `docs/audit/INDEX.md` (1), `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` (1). All under `docs/audit/`, which stays put — only the string needs updating, not a path move on the citing side.
- **Docs (other):** `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`, `docs/glossary.md`.
- **`_wip/` (20):** identity-foundation and quartet planning docs.

### 4.5 `docs/glossary.md` — see §5 (not a simple move; excluded from citation-update burden here)

25 lines / 13 files, mostly `_wip/umbrella-program/` and `_wip/identity-foundation/` planning docs that already track its phased bucket-1/2/3 disposition under planned WI **S2-12**. One code hit: `apps/api/drizzle/0107_gorgeous_cardiac.sql:11` — **an applied, immutable migration file** (per this repo's migration-immutability rule) whose comment cites `docs/glossary.md §4`; this citation can never be fixed in place if glossary.md moves or is deleted — flagged in §6.

### 4.6 `docs/project_context.md` — see §5 (recommend KEEP; citations shown for completeness)

**65 lines / 35 files.** 16 archive, 0 `docs/INDEX.md`, 5 doctrine, **7 CI** (highest CI-coupling of anything in this table — see §6), 0 memory, 27 `_wip/`, 7 other docs.

- **CI (7, all real, all path-dependent):** `.github/actions/claude-review/action.yml:9,39,155,171` and `.github/workflows/claude-code-review.yml:77,165,185` — the Claude Code Review workflow's trusted-checkout mechanism reads this exact path as one of its rule sources.
- **Doctrine (5):** `CONTEXT.md:10,336`, `AGENTS.md:9,89,358`.

### 4.7 `docs/change-classes.md` → `docs/runbooks/change-classes.md`

**31 lines / 17 files.** 2 archive, 2 CI, 2 doctrine, 21 `_wip/`, 1 other doc.

- **CI (2, comment-only, low risk):** `.github/workflows/api-quality-gate.yml:53`, `.github/workflows/ci.yml:358`.
- **Doctrine (2):** `AGENTS.md:373,511`.

### 4.8 `docs/deployment-and-secrets.md` → `docs/runbooks/deployment-and-secrets.md`

**38 lines / 18 files.** 2 archive, 3 CI, 0 doctrine, 2 code, 8 memory, 18 `_wip/` (some overlap counted), 4 other docs.

- **CI (3, comment-only):** `.github/workflows/mobile-fallback-ota.yml:17`, `.github/workflows/deploy.yml:426,561`.
- **Code (2, comment-only):** `scripts/setup-env.js:151`, `packages/database/scripts/verify-db-target.mjs:44`.
- **Memory (8, heaviest memory-coupling of any root file):** `.claude/memory/project_eas_build.md:16,22`, `project_clerk_email_verification_fallback.md:18`, `project_eas_update_ota.md:10,21`, `feedback_doppler_secrets.md:7,13`, `project_clerk_key_environments.md:11`.

### 4.9 `docs/e2e-smoke-pack.md` → `docs/runbooks/e2e-smoke-pack.md`

3 lines / 3 files. Real: `docs/change-classes.md:41` (itself moving in lockstep — update both in the same commit) and `apps/mobile/e2e/scripts/run-smoke.sh:21` (script comment).

### 4.10 `docs/future-app-options.md`, `docs/ux-todos.md`, `docs/Strategy_analysis.md`, `docs/llm-issues.md`, `docs/pre-launch-checklist.md`, `docs/ci-troubleshooting.md`, `docs/logo.svg`

All low-citation (0–7 hits), no CI coupling. Notable real code hits: `docs/llm-issues.md` cited by `apps/mobile/src/components/session/MessageBubble.test.tsx:20` and `apps/mobile/src/components/common/ThemedMarkdown.tsx:35` (both comments); `docs/logo.svg` cited by `apps/mobile/src/components/AnimatedSplash.tsx:63` (comment); `docs/ci-troubleshooting.md` cited by `.claude/memory/feedback_nx_reset_before_commit.md:7` via a `superseded_by:` frontmatter field — **this is a structured field, not prose; it must be updated precisely or the memory's own schema linkage breaks.**

### 4.11 `docs/privacy-policy.html` → `docs/compliance/privacy-policy.html`

**15 lines / 10 files** — every single one is a real, substantive citation; there is no archive/noise bucket here.

- `docs/compliance/README.md:25` — relative link `[docs/privacy-policy.html](../privacy-policy.html)` — **this relative link breaks on any move that changes the depth delta between the two files; moving both to the same `compliance/` directory as proposed actually simplifies this to `./privacy-policy.html`.**
- `docs/compliance/dpia.md:5`, `docs/compliance/2026-07-04-launch-compliance-closure-check-early-pass.md:9,52,66` — active legal-reconciliation notes citing specific line ranges inside the HTML (`privacy-policy.html:21,66` and `:67-73`) — **line-anchored citations that must be re-verified, not just path-updated, since HTML line numbers are exactly the kind of anchor that drifts.**
- `docs/meetings/minors-compliance-requirements.md:8,307` — reinforces §5's finding that this "meetings" file is functionally compliance content.
- `docs/audit/2026-06-07-data-retention-and-erasure-audit.md:98,100,119`.
- `docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md:120`, `_wip/mvp-roadmap/MVP-DEFINITION.md:118`, `_quartet/working/program/counsel-packet-2026-07-07.md:23`.

### 4.12 `docs/E2Edocs/e2e-runbook.md` → `docs/runbooks/e2e-runbook.md`

**41 lines / 22 files — the highest citation-to-content ratio in this entire table (1 file generating 22 citers).**

- **`package.json:38,40,44`** — three `pretest:e2e*` npm scripts literally print `` See docs/E2Edocs/e2e-runbook.md `` in their console error text when the Maestro guard trips. **These are functional strings a developer sees at the terminal, not comments** — highest-priority update in this whole appendix.
- `apps/mobile/e2e/scripts/e2e-lib.sh:16`, `e2e-preflight.sh:6` — shell script comments.
- `.agents/skills/e2e/SKILL.md:11` (the master) and its synced copy `.claude/skills/e2e/SKILL.md:11` — **only edit the `.agents/` master; the sync script (`scripts/sync-skills.mjs`) regenerates the `.claude/` copy, so editing the copy directly would be silently overwritten.**
- `.claude/commands/my/fix-notion-bugs.md:87`, `worktree-bugfix.md:89`, `e2e.md:6,157`, `run-tests.md:86,102` — five more command-doc citations.
- `_wip/identity-foundation/2026-06-09-instruction-surface-disposition-matrix-v0.md:136` — an already-closed disposition entry referencing this same path (informational).

### 4.13 `docs/_vault/emulator-2026-04-30/**` → `docs/_archive/vault/emulator-2026-04-30/**`

14 lines / 8 files. Only 2 non-docs hits, both memory: `.claude/memory/feedback_e2e_cascade_root_cause.md:9`, `_wip/umbrella-program/supporting-artefacts/memory-cleanup.md:412`. Low risk.

### 4.14 `docs/meetings/**` (split disposition — see §5)

- **`minors-compliance-requirements.md`** → folded into §4.11 above (it's really a compliance citation cluster, 9 files / 15 hits).
- **`2026-06-04-age-floor-decision-minutes.md`** — cited by `_wip/identity-foundation/_research/gemini-minors-zdr.md:206` and `_wip/identity-foundation/_research/age-consent-landscape/verification-2026-06-05.md:8` as a "trusted overlay" of verified findings. **J3's stated reason for deferring this file ("the LLM memo cited by ADR-0014/0016") does not currently verify** — `rg` finds zero references to `docs/meetings/` anywhere in either `MMT-ADR-0014-router-runtime-vetting-split.md` or `MMT-ADR-0016-safety-and-judge-architecture.md` as of this scan. Either the citation was edited out under the pre-live in-place-edit rule, or J3's premise was already inaccurate. **Re-verify before treating this as a hard blocker for Stream 2** — flagged in §6.
- **`2026-06-05-launch-posture-decision-brief.md`** — cited once, in `_wip/mvp-roadmap/inventory.jsonl:28` (a Cosmo WI `found_in` provenance field — informational, not a live functional reference).
- **`age-country-explorer.html`** — **zero citations found anywhere.** Safest file to move/relocate in the entire `meetings/` bucket.

### 4.15 `docs/logo-designs/**` → `docs/assets/logo-designs/**`

8 lines / 5 files. Two are real **code** citations, both comments: `apps/mobile/src/components/common/octo-mate-paths.ts:2` ("Generated from docs/logo-designs/mentor-mascot/octo-mate.svg"), `apps/mobile/src/components/common/mentor-mascot-geometry.ts:5`. Remainder are `docs/specs/epics.md:741` (resolved/struck-through historical note), `docs/_archive/specs/Done/2026-06-10-mentor-mascot-and-birth-animation.md` (4 hits, frozen), `_quartet/working/lanes/new-llm-integration/behavior-change-inventory.md:346`.

### 4.16 `docs/visual-artefacts/**`

48 lines / 13 files. Real, concrete hits:
- **`.gitignore:154,155`** — `docs/visual-artefacts/exports/png/*.png` and `.../exports/pptx/*.pptx`. **A literal ignore-pattern that must move with the directory or newly-generated exports will be tracked by accident.**
- `.deepsec/data/eduagent-build/error-files.manifest.json:250,251` and two files under `.deepsec/data/.../debug/` — auto-generated tool output, will self-heal on next tool run, no manual edit needed.
- Internal self-references (`docs/visual-artefacts/data/atlas-data.js` citing the directory in comments) and cross-hits inside `docs/audit/`, `docs/reviews/`, `docs/plans/` (2 each) that are just "see the diagrams in visual-artefacts" pointers.

### 4.17 `docs/flows/**` (reclassified — see §5)

**129 lines / 65 files — the largest unique-file fan-out after `architecture.md` itself.** Breakdown by citer location: `docs/_archive/plans/done/` (32, frozen), `docs/audit/` (13), internal self-citations within `docs/flows/` (12), `docs/_archive/specs/Done/` (10, frozen), `docs/_archive/consistency-cleanup/audit/` (10, frozen), `docs/audit/e2e/` (8), `_quartet/working/lanes/mobile-ux-nav/` (3), `.claude/commands/my/` (3), `docs/visual-artefacts/data/` (2), `docs/reviews/` (2), `docs/plans/` (4 total), **`AGENTS.md:216,228`** (2 — the Profile Shapes / nav-mode section's pointer to `docs/flows/mobile-app-flow-inventory.md`), remainder scattered 1–2 each across `_wip/`, `apps/mobile/e2e/flows/` (coincidental directory-name overlap, not a real citation of `docs/flows/`). Given the tight coupling documented in §4.4 with `audience-matrix.md`, **sequence these two moves together.**

### 4.18 `docs/incidents/`, `docs/reviews/`, `docs/testing/`

- **`docs/incidents/2026-04-stg-push-incident.md`** — 1 citation, but it's load-bearing: `packages/database/scripts/check-db-push-target.mjs:51`, a **live guard script comment** pointing at this exact postmortem.
- **`docs/reviews/2026-06-10-learning-flow-simplification-deepdive/**`** — cited by two **active, unarchived specs**: `docs/specs/2026-06-27-felt-knowing-loop.md:19` and `docs/specs/2026-06-27-homework-autofile-recall-bridge.md:5`, plus `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md:599`. Also cited (informationally, as a git-history pointer, not a live path) by `packages/database/scripts/check-reference-only-migrations.mjs:235`, which explicitly states in its own text that the target path was "retired from HEAD 2026-06-10" and lives only in git history — **no live-path risk from that one**, already self-documenting.
- **`docs/testing/flaky-quarantine.md`** — cited by `tools/quarantine/quarantine.json:3` (a live registry file, comment field) and two **already-drafted** Stream-2 planning docs that name `docs/testing/` as a landing zone for unrelated future content.

---

## 5. Unhomed / judgment-call section (feeds operator D3)

1. **`docs/audience-matrix.md`.** J3 ruled DEFER but named no target, only that it is "not identity domain canon." Candidates:
   - (a) `docs/canon/audience-matrix.md` — treat as a 5th spine doc (living cross-cutting true-state document).
   - (b) `docs/canon/navigation/audience-matrix.md` — new domain-canon folder, paired with `docs/flows/` once reclassified (see item 5 below); the two are already tightly coupled per §4.4/§4.17.
   - (c) `docs/registers/audience-matrix/master.md` — its own self-description ("reconstructed scaffold," periodically "re-verified against HEAD," F-numbered findings with file:line citations) matches the `registers/llm-models/master.md` pattern (a governed master + provenance trail) more closely than prose canon.
   - **Recommendation: (c).** The doc's own framing is provenance-and-verification-shaped, not principle-shaped; forcing it into `canon/` would misrepresent its actual maintenance model (it's re-derived from code, not decided).

2. **`docs/glossary.md`.** Confirmed out of scope for a simple move — J3 explicitly says "not J3's to move/delete," and Stream-2 planning already carries a dedicated slice (**S2-12**, "Glossary bucket-3 routing") with its own bucket-1/2/3 disposition already ratified elsewhere. **Recommendation: exclude entirely from S2-11's move list; S2-12 owns it.**

3. **`docs/project_context.md`.** Doesn't cleanly satisfy any L0–L4 test — it's "repo-specific implementation rules" (per `AGENTS.md`'s own description of it), closer to L1 canon in spirit but explicitly excluded from the identity-domain canon graduation. It is also the single most CI-coupled file found in this scan (7 real hits in `.github/actions/claude-review/action.yml` + `claude-code-review.yml`, used as a literal trusted-rules-source path).
   - Candidate targets: stay at `docs/` root (a named, permanent exception to "no loose canon"); or `docs/canon/project_context.md` (if the CI action's `review_rules_path` input is updated in lockstep).
   - **Recommendation: keep at root as a documented exception.** The CI coupling makes this the highest-blast-radius move in the entire table for the least architectural benefit — nothing about its content changes meaning by staying loose.

4. **`docs/future-app-options.md`.** Explicitly "not a commitment," no completion date — fails L3's own discriminating test. Candidates: `docs/specs/` (if treated as a very early-stage speculative spec), `docs/plans/` (if treated as backlog), or genuinely a new "not yet L3" holding pattern this ADR doesn't define. **Recommendation: `docs/specs/future-app-options.md`,** flagged with a note that it is explicitly pre-spec.

5. **`docs/flows/**` — reclassify out of the "assets" bucket.** J3's table lumps `flows/` in with `logo-designs/ mockups/ screenshots_and_store_info/ visual-artefacts/` under "assets / legal artifact," target `assets/`. **This does not match current contents**: every one of the 32 files under `docs/flows/` today is markdown (flow-access inventories, a route-shell map, a master-directory index + per-flow pages, two revision plans) — zero images. Candidates: `docs/specs/flows/` (feature-inventory shape), `docs/registers/flows/` (given its master-directory + per-flow-page structure resembles a governed register more than a spec), or a new `docs/canon/navigation/` home paired with `audience-matrix.md`. **Recommendation:** pair with item 1(b)/1(c) above — whichever way `audience-matrix.md` lands, `flows/` should land beside it, since 14+ flow pages already cite the matrix as a co-equal source. This is a genuine judgment call for the operator, not a mechanical one.

6. **`docs/ux-todos.md`.** A "rolling list," explicitly never meant to be archived on ship — doesn't fit L3's "ephemeral → archived on ship" lifecycle either. **Recommendation: `docs/plans/ux-todos.md`** as the closest available fit, flagged that its living/rolling nature is atypical for the directory.

7. **`docs/Strategy_analysis.md`.** Zero citations anywhere in the repo — completely isolated. Thematically identical to the unhomed `docs/analysis/` bucket (item 8) — both are strategy/market memos with no code, CI, or cross-doc dependency. **Recommendation: fold into whatever disposition item 8 gets** (most likely `docs/_archive/analysis/` or a new `docs/registers/research/`), rather than deciding it in isolation.

8. **`docs/analysis/**` (6 remaining files).** No sanctioned §I.4 home exists for "market/pedagogy research inputs." A 2026-04-30 cleanup already triaged and archived two sibling files from this exact folder (`architecture-inputs.md`, `spec-vs-code-audit-2026-04-13.md` — both now under `docs/_archive/analysis/`), establishing precedent that this folder drains to `_archive/`. The 6 remaining files (product brief + 4 research docs + one file with a space in its name, `research/How adults actually acquire languag.txt`) are the same shape — inputs that were consumed once and are now historical. **Recommendation: `docs/_archive/analysis/`,** joining the already-archived siblings — but flag that `docs/architecture.md`, `docs/PRD.md`, and `docs/ux-design-specification.md` all still cite this folder in their own YAML frontmatter (`docs/analysis/product-brief-EduAgent-2025-12-11.md`, `.../research/market-ai-tutoring-research-2024-12-11.md`, `.../epics-inputs.md`) — **two of those three cited filenames (`epics-inputs.md`, `architecture-inputs.md`) no longer exist in `docs/analysis/` at all** (already archived) — see §6 for this pre-existing rot.

9. **`docs/screenshots_and_store_info/**`.** J3 bucketed as "assets," but the folder is a mix: pure store-listing copy (asset-like) and a store-compliance checklist that `docs/compliance/2026-07-04-launch-compliance-closure-check-early-pass.md` treats as a co-equal artifact alongside `dpia.md`/`ropa.md`. Splitting the folder would break its own internal relative links (`store-compliance-checklist.md` cites 3 sibling files by relative path). **Recommendation: keep the folder intact, move whole to `docs/compliance/store/`** given the compliance citations outweigh the asset citations 2:1 in this scan — but this is a real toss-up the operator should rule on, not a mechanical call.

10. **`docs/visual-artefacts/scripts/`, `/data/`, `/assets/` (css/js support files).** These are code (3 `.mjs` render/validate/export scripts, a `.js` data file, a `.js`/`.css` pair), not "non-doc artifacts" in §I.4's sense (images/mockups/screenshots/diagrams/logos). Moving them into `docs/assets/` would put executable code inside a documentation-artifact drain. **Recommendation: split — images/HTML/SVG outputs go to `docs/assets/visual-artefacts/`; the 3 generator scripts + their data/css/js dependencies either stay bundled with the outputs they generate (pragmatic, keeps the regen pipeline working without path surgery inside the scripts) or move to a `scripts/` home at repo root (architecturally cleaner, but requires updating 3 scripts' internal relative `data`/`assets` references).** Flagging both options rather than forcing one.

11. **`docs/meetings/` residue (minutes/briefs/HTML explorer) after `minors-compliance-requirements.md` is pulled out.** Three files remain: two genuine decision records and one interactive HTML tool. **Recommendation:** `docs/_archive/meetings/` for the two dated minutes/briefs (their decisions are made, downstream artifacts already exist); `age-country-explorer.html` has zero citations and no clear doc-shaped home — flag as truly unhomed, candidates `docs/assets/` (if it's a static artifact) or deletion-candidate (if it was a scratch tool, given its `_scratch`-adjacent naming pattern and total lack of inbound references).

---

## 6. Risk notes

**CI-breaking / high-blast-radius:**

- **`docs/project_context.md` is read by name, at that exact path, by `.github/actions/claude-review/action.yml` (4 sites) and `.github/workflows/claude-code-review.yml` (3 sites)** as part of the Claude Code Review workflow's trusted-rules mechanism. This is the strongest argument in the whole table for the §5 recommendation to leave it in place — any move requires a coordinated code change to those 2 files in the *same* change-set, not a follow-up.
- **`package.json`'s three `pretest:e2e*` guard scripts hardcode the literal string `docs/E2Edocs/e2e-runbook.md`** in console error output. If `E2Edocs/` moves to `docs/runbooks/` without updating these 3 lines, the guard will print a stale, misleading path to every developer who trips it.
- **`.gitignore:154-155` hardcodes `docs/visual-artefacts/exports/{png,pptx}/*`.** Moving the directory without updating `.gitignore` risks either (a) newly-generated exports getting committed by accident, or (b) the ignore rule silently doing nothing (harmless but confusing).
- **`docs/compliance/README.md:25` and `docs/compliance/dpia.md:5` use *relative* markdown links** (`../privacy-policy.html`) to `docs/privacy-policy.html`. The proposed move (privacy-policy.html into `docs/compliance/`) actually *simplifies* these to same-directory links — a rare case where the move improves rather than breaks a citation, but only if done correctly (not left half-migrated).

**Immutable / unfixable citations (flag, do not attempt to fix):**

- **`apps/api/drizzle/0107_gorgeous_cardiac.sql:11`** cites `docs/glossary.md §4` in a SQL comment inside an **applied, immutable migration** (this repo's own rule: applied migrations are never edited). If `glossary.md` is ever deleted (per its bucket-3 disposition), this citation becomes permanently unfixable-in-place. Not a blocker for this reorg (glossary.md isn't moving under S2-11 — see §5 item 2), but worth recording now so it isn't rediscovered as a surprise later.

**Pre-existing citation rot found incidentally (not caused by this reorg, but directly on-point for why this exercise matters):**

- **`docs/canon/identity/prd.md:325` currently carries the audience-matrix.md citation** — the task brief for this WI assumed line 319 (per J3's 2026-06-09 text). The file has grown 6 lines since J3 ran and the anchor has already silently drifted. Demonstrates the exact failure mode a bulk move risks amplifying at scale.
- **`scripts/jest.config.cjs:5` and `scripts/jest-ci-reporter.cjs:8` both cite `docs/superpowers/specs/2026-05-14-ci-failure-readability-design.md`.** No `docs/superpowers/` directory exists anywhere in the current tree (confirmed via `find`), and no git history shows the file under that path either. This citation is **already dangling today**, unrelated to any move proposed here. J3 named `superpowers/` as one of six nonstandard dirs needing Stream-2 disposition; it appears to have already been removed by unrelated cleanup without these two script comments being updated. Recommend a separate, small follow-up (outside this WI) to fix or remove these two comments.
- **`docs/architecture.md`, `docs/PRD.md`, and `docs/ux-design-specification.md` all cite, in their own YAML frontmatter, two files that no longer exist**: `docs/analysis/epics-inputs.md` and `docs/analysis/architecture-inputs.md`. Both were already archived to `docs/_archive/analysis/` in a 2026-04-30 cleanup (documented in `docs/_archive/consistency-cleanup/audit/2026-04-30-cleanup-triage.md:123`), but the three spine docs' frontmatter "inputs" lists were never updated. `docs/PRD.md` additionally has 5 **body** citations to the same two now-missing paths (lines 384, 487, 527, 937, 1750). This predates and is independent of the reorg proposed here, but the reorg is a natural moment to fix it in the same pass if the operator wants it folded in.
- **J3's stated blocking rationale for deferring `docs/meetings/`** ("the LLM memo cited by ADR-0014/0016 at its current path") **does not currently verify** — see §4.14. Either it was resolved by an in-place ADR edit (permitted pre-live) or the premise was inaccurate from the start. Re-check before treating this as a real blocker in the Stream-2 slice plan.

**Gaps in the target model itself (not this WI's to fix, but worth surfacing for D3):**

- `docs/audit/` has **zero grounding in ADR-0000's own text** — its "sanctioned Meta layer" status rests entirely on the J3 disposition doc's assertion. `docs/compliance/` gets one passing mention in ADR-0000 prose (line 87) but isn't in the §I.4 tree diagram. If Stream 2 formalizes the reorg, consider a small ADR-0000 amendment adding both to the diagram — today an agent grepping only the diagram would miss both.
- `docs/assets/` is empty (`.gitkeep` only) — every asset move proposed in this table is a first-fill, not a merge. There's no existing convention to match against inside `assets/` itself; the sub-structure (`assets/logo-designs/`, `assets/mockups/`, `assets/visual-artefacts/`) proposed here is this report's own judgment, not derived from precedent.

---

## 7. Summary of open items requiring D3 ruling

Per §5/§6 above, the following need an explicit operator decision before S2-11 can execute against this mapping:

1. Target for `audience-matrix.md` (canon-spine vs. domain-canon vs. register) — and whether `flows/` moves in lockstep with it.
2. Whether `flows/` is reclassified out of "assets" (recommended) and where it lands.
3. Whether `project_context.md` stays at root permanently (recommended) or moves with a coordinated CI-action edit.
4. `future-app-options.md`, `ux-todos.md`, `Strategy_analysis.md`, `docs/analysis/` — four small, low-citation files/dirs whose only real blocker is "no clean §I.4 slot," not citation risk.
5. `screenshots_and_store_info/` — split vs. move-whole-to-compliance.
6. `visual-artefacts/` scripts — bundle-with-outputs vs. relocate-to-repo-root-scripts.
7. Whether to fold the three pre-existing-rot findings (§6) into this WI's execution or file them as separate small follow-ups.
