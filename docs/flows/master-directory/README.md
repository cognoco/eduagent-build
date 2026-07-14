# Master Directory Pages

> **STATUS: PARKED — revive after V2 cutover (decided 2026-06-18).** Only 21 of ~168 flows have detail pages (~12.5%), and the existing pages are framed against the V0/V1 nav model (Family/Study mode, proxy, Recaps tab) that V2 ("mentor-is-the-app", `docs/plans/v2-plan/`) retires. Finishing them against the old shell would be throwaway work. **Revive plan:** after the V2 S6 cutover, rebuild these pages V2-shell-aware. The existing 21 pages are kept as reference + revival seed; their "Sources" headers cite `student-flow-access-inventory.md` / `mentor-flow-access-inventory.md`, which are parked alongside this system for the same reason. Do not delete.

This directory contains one durable detail page per product flow.

The flow pages are not execution logs. They should stay useful after a revision pass finishes by recording:

- the product meaning of the flow
- which audiences can access it
- whether student and mentor access share behavior or differ by scope
- the canonical entry points and routes
- ownership and privacy rules
- what should happen when the wrong audience deep-links into it
- known bugs, doc drift, and validation limits

Use [`_template.md`](_template.md) for new pages.

## Related documents

- [`../flow-master-directory.md`](../flow-master-directory.md) — parent register. Index of all flows + audience labels + vocabulary translation table.
- [Archived navigation-contract design](../../_archive/specs/Done/2026-05-21-navigation-contract.md) — historical target contract; current navigation code owns behavior.
- [`../audience-matrix.md`](../audience-matrix.md) — historical F1–F14 gating snapshot. Cite only as parked context and verify current code.

## Grouping

| Folder | Flow IDs |
| --- | --- |
| `auth/` | `AUTH-*` |
| `account/` | `ACCOUNT-*` |
| `home/` | `HOME-*`, `SUBJECT-*` when primarily home/setup |
| `learn/` | `LEARN-*`, `PRACTICE-*`, `QUIZ-*`, `DICT-*` |
| `homework/` | `HOMEWORK-*` |
| `billing/` | `BILLING-*` |
| `parent/` | `PARENT-*` |
| `cross-cutting/` | `CC-*` |

## Status Values

| Status | Meaning |
| --- | --- |
| `Not mapped` | Listed in the master register but no deep page exists yet. |
| `Draft` | Initial mapping exists but needs review. |
| `Mapped` | Checked against inventories, navigation contract, and current app routes. |
| `Needs product decision` | Expected audience or scope is ambiguous. |
| `Blocked` | Mapping depends on missing current docs, unavailable route, or unresolved product decision. |
