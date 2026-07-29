# BID-42 Release Engineering — Shepherd Session Handoff

Resume: `_quartet/working/lanes/release-eng/execution-tracker.md`

Updated: 2026-07-29T19:33:29Z
Identity: `codex:shepherd:release-eng`

## Current Position

Start every session at the tracker linked above. It is canon for charter,
authority, pointers, sequence, and supervision notes; this file is disposable
session-continuity notes only.

- Lane: `release-eng` (WS-54 — Store, Billing & Release).
- Batch: `BID-42` — Release engineering: activation instrumentation,
  RevenueCat, and push credentials. Live Delivery Batch relation is the sole
  membership authority — never this file.
- Membership is a **timestamped live-relation observation**, not a fixed
  count. As of the tracker's last recorded query
  (`2026-07-24T14:56:01Z`, eight rows, `has_more=false`), re-query the Work
  Items data source `36fd1119-9955-4684-8bfe-deb145e6a21f` filtered to
  `Delivery Batch` containing page `3a58bce9-1f7c-8122-ba4c-f7fc3079d5a3`
  before acting — the count above is stale the moment a member is admitted,
  Closed, or the Brief is amended.

## Monitors / Clacks

- [`_quartet/working/lanes/release-eng/_state/monitor-manifest.json`](monitor-manifest.json)
  — materialized at rest and git-tracked via a lane-scoped `.gitignore`
  negation (`.gitignore:228`) layered over the general rule (`.gitignore:224`)
  that still gitignores every sibling lane's manifest. Currently an empty
  `monitors: []` placeholder plus top-level
  `"tracker": "_quartet/working/lanes/release-eng/execution-tracker.md"`. When
  a Shepherd actively runs the lane and arms a monitor, it appends an entry
  (schema: target/purpose/command/task-id) and removes it on teardown,
  preserving the `tracker` pointer and never deleting the file.
- Durable executor evidence lives under
  `.cosmo-watch/release-eng/executors/<WI-ID>/` (repo-relative, gitignored),
  the same convention as `.cosmo-watch/bid-49/executors/` and
  `.cosmo-watch/platform-hardening/logs/`.

## Next Action

Resolve the next action from each live Work Item's `Stage` + `State` + claim
tuple per the tracker's "Units / slice" and "Sequence" sections — do not route
from this file's prose, which is a point-in-time note, not authority.
