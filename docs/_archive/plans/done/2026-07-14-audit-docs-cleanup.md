---
title: Audit Documents Cleanup — Implementation Plan
date: 2026-07-14
profile: change
status: done
---

# Audit Documents Cleanup — Implementation Plan

**Goal:** Classify every document under `docs/audit/` against the current codebase and leave a concise, reliable active/reference/archive structure.
**Approach:** Inventory Markdown documents and their supporting artifacts, verify live claims from source code and tests, then record one disposition per document. Preserve historical evidence as grouped archives; keep only genuinely active audits in the active index.

## Scope

In scope:
- `docs/audit/**/*.md`
- Supporting artifacts under `docs/audit/` (`*.log`, `*.csv`, `*.json`, `*.html`, `*.tsv`) as children of their parent audit
- `docs/audit/INDEX.md`
- `docs/_archive/` destinations needed for retired audit material
- This plan

Out of scope:
- Product behavior changes
- Fixing newly confirmed code defects
- Editing unrelated docs, memory, or existing user changes

## Tasks

- [x] T1: Inventory and group every audit document — done when: every Markdown file and artifact has exactly one parent audit group.
- [x] T2: Verify each audit group's findings against current source code and tests — done when: each document has an evidence-backed disposition of active, superseded/captured, addressed, or historical-only.
- [x] T3: Apply the minimum cleanup — done when: retired material is archived as coherent groups, retained material has accurate status, and `docs/audit/INDEX.md` lists every retained group without stale claims.
- [x] T4: Verify the cleanup — done when: internal Markdown links resolve, no scoped file is unclassified, and the final diff contains only audit-cleanup changes.
