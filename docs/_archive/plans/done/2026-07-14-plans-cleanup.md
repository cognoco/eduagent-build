---
title: Plans Cleanup — Implementation Plan
date: 2026-07-14
profile: change
status: done
---

# Plans Cleanup — Implementation Plan

**Goal:** Classify every document under `docs/plans/` against current code and leave only genuinely active or current-reference plans in the live plan workspace.
**Approach:** Verify implementation claims from source and tests, classify each plan as active, partial, addressed, superseded, or historical, then archive coherent completed/superseded groups while preserving live residues in a current disposition register.

## Scope

In scope:
- `docs/plans/**/*.md`
- Supporting HTML artifacts under `docs/plans/`
- Archive destinations under `docs/_archive/plans/`

Out of scope:
- Implementing unfinished plan tasks
- Changing product behavior
- Updating external work-item lifecycle state

## Tasks

- [x] T1: Inventory every plan and group related artifacts — done when: all 58 starting Markdown plans and two HTML artifacts have one review lane.
- [x] T2: Verify plan completion/status against current code and tests — done when: every plan has a current-code disposition and any surviving gap is named.
- [x] T3: Apply the minimum cleanup — done when: completed/superseded plans are archived coherently and live plans have accurate status/indexing.
- [x] T4: Verify inventory, links, and diff scope — done when: no starting plan is unclassified, active local links resolve, and `git diff --check` passes.
