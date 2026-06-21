---
name: Cosmo refine requires current-code inspection
description: Use when refining Cosmo work items or moving items toward Ready.
type: feedback
---

Cosmo refinement must inspect the current affected code/docs before promoting a Work Item to `Ready`.

**Why:** On 2026-06-21, 10 work items were refined using Cosmo fields and the mechanical DoR gate, but without checking current code for each item. That made at least one `Ready` / `Auto` classification too shallow.

**How to apply:** Before `--to-ready`, identify the likely affected files/docs from the item title, description, AC, and source links; read/search the current repo surface; base AC and Execution Path on that evidence. If the affected surface cannot be found or the scope is not bounded, leave the item in `Refining` or classify `Assisted` rather than `Auto`, and record the missing investigation.
