---
title: Repository Documentation and Assets Cleanup — Implementation Plan
date: 2026-07-14
profile: change
status: done
---

# Repository Documentation and Assets Cleanup — Implementation Plan

**Goal:** Remove demonstrably obsolete documentation and documentation assets across the repository without deleting current canon, operational guidance, generated agent resources, or runtime assets.
**Approach:** Inventory tracked documentation-like files, divide the remaining surface into content, media, and non-`docs/` lanes, and verify every deletion against current code, inbound references, or a named successor. Preserve uncertain material and record its disposition instead of guessing.

## Scope

In scope:
- `docs/` except folders already dispositioned in the preceding cleanup
- Root-level Markdown and stray documentation work products
- Tracked documentation media (`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `pdf`)
- Documentation-like files under `apps/` and `packages/` when they are clearly obsolete or unreferenced work products
- One exact duplicate under `docs/_archive/` and one historical `_wip/` reference made stale by deleting its completed root plan

Out of scope:
- Runtime application assets still imported by code or build configuration
- `.agents/`, `.claude/`, `.archon/`, and `.deepsec/` generated or operational resources
- `_wip/` and `_quartet/` active concurrent work
- Historical material already under `docs/_archive/` or `docs/_vault/`, except exact accidental duplicates

## Tasks

- [x] T1: Inventory the remaining documentation and media surface — done when: tracked counts, top-level ownership, inbound references, and duplicate hashes are available.
- [x] T2: Audit remaining `docs/` content against code and current canon — done when: each deletion has a current successor or addressed-state proof and uncertain files are retained.
- [x] T3: Audit documentation media and visual folders — done when: unused or duplicate historical assets are removed and runtime/imported assets are untouched.
- [x] T4: Audit root and package-local documentation artifacts — done when: stray completed plans and obsolete package notes are removed or archived with references repaired.
- [x] T5: Remove empty obsolete directories and repair active inbound links — done when: no tracked active document points to a deleted path and no cleanup-created empty container remains.
- [x] T6: Verify the cleanup — done when: deleted-path reference checks, decision/ADR guard, atlas validation, diff checks, and secret/large-file scan pass; changed-file count is reported before commit.

## Outcome

- Deleted completed root work-item plans, completed scratch artifacts, a stale rescue ledger, an unreferenced scratch HTML map, and a stale Playwright selector audit whose executable tests supersede it.
- Deleted exact duplicate logo/archive exports, unused logo inputs, unreferenced static diagrams and mockups, and two unimported app logo assets.
- Retained imported/build assets, canonical mascot sources, referenced visual references, the validated visual atlas, store-compliance material, and the reserved `docs/assets/` destination.
- Retained stale-but-authoritative documents that require a separate synchronization or survivor-triage pass: `docs/INDEX.md`, `docs/compliance/README.md`, `docs/compliance/edpb_dpia_filled_2026_v1.md`, `docs/ux-design-specification.md`, and `docs/ux-todos.md`.
