# Plan — Populate ZDX Work Items DB with DeepSec findings

## Context

A DeepSec scan of `eduagent-build` (run `20260516050543-3902c61be7bd5834`,
2026-05-16) produced **236 security findings** across 168 files. The raw
artefact lives at `.deepsec/data/eduagent-build/reports/report.json` and is
gitignored — purely local. This task lands those findings as work items in the
ZDX master Work Items DB (Notion data source `36fd1119-9955-4684-8bfe-deb145e6a21f`),
so they can be triaged, bundled, and dispatched through the ZDX lifecycle. It
doubles as a real-world test of the ZDX standard at capture scale.

## Decisions

- **Master DB, not a satellite.** Per user: this is as much a ZDX-standard test
  as a DeepSec activity.
- **1 finding = 1 Item.** No merging — merging would impose Item-level grouping
  and muddy traceability. Grouping is done softly via Work Packages.
- **Provisional Work Packages now.** 14 WPs grouped by vulnerability family;
  final PR-sizing + Execution Path classification deferred to triage/refinement.
- **Traceability** via the `Found In` field on every page + a DS-NNN ↔ WI-NN
  index file. No Notion upload of the report.

## Field mapping

| ZDX property | Value |
|---|---|
| Layer | `Item` (findings) / `WP` (bundles) |
| Type | `Bug` |
| Priority | HIGH/HIGH_BUG → `P1`; MEDIUM/BUG → `P2` |
| Tags | `security` |
| Stage / State | `Captured` / `Active` |
| Execution Path | `Unset` (triage decision) |
| Project | MentoMate (`3658bce9-1f7c-8128-9f9b-fa7fcf75a13b`) |
| Parent item | the family WP |
| Found In | `DeepSec scan <run> · <file>:<lines> · <slug> · DS-NNN` |
| Risk/Impact | set for P1 items (schema requires it for P0/P1) |
| Acceptance Criteria | left empty — a Refining-stage deliverable |

## Work Package families (14)

WP-ACL (41), WP-COST (39), WP-RACE (30), WP-LLM (22), WP-XTEN (22),
WP-LOGIC (16), WP-CONSENT (14), WP-CICD (13), WP-DATA (11), WP-WEBHOOK (7),
WP-STALE (7), WP-INPUT (6), WP-DISCLOSE (5), WP-SCORE (3) — 236 total.
Created as WI-76..WI-89.

## Execution

1. Flatten findings → `work/findings.json`, assign DS-001..DS-236, map slug→family.
2. Create 14 WP pages (REST API, Notion token from Infisical `/agents-shared`).
3. Create 236 Item pages, each with `Parent item` → its WP.
4. Backfill each WP body with a child-Item findings table.
5. Write `deepsec-to-wi-map.md` traceability index.

## Verification

- Row count: 250 new pages (14 WP + 236 Item) under Project=MentoMate.
- `Validity` formula = `✓ Valid` on a sample across stages.
- Every Item has a non-empty `Found In` with a `DS-NNN` token.
- DS-NNN ↔ WI-NN index covers all 236 findings with no gaps.

## Scripts / artefacts

`work/` (gitignored): `findings.json`, `families.cjs`, `wpmeta.cjs`,
`lib.cjs`, `create-wps.cjs`, `create-items.cjs`, `created-wps.json`,
`created-items.json`. Index: `deepsec-to-wi-map.md`.
