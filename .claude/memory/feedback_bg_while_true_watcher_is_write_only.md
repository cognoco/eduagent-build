---
name: feedback_bg_while_true_watcher_is_write_only
description: A run_in_background while-true bash loop is write-only and never wakes you; use the Monitor tool or an until-loop that exits on the terminal condition.
metadata:
  node_type: memory
  type: feedback
  created: 2026-07-04
  last_confirmed: 2026-07-04
  status: active
  originSessionId: 8aab4c41-5da1-4f5e-b132-b827a7aa6f88
---

A `run_in_background` bash task only re-invokes you when it **EXITS**. A
`while true; do …; sleep 60; done` PR-poll loop therefore NEVER wakes you — it
writes state transitions to its output file, but you only see them if you
manually Read that file. This caused a silent liveness lapse: a WI-1582 PR went
CLEAN at ~16:29Z, the watcher logged it, but I wasn't pinged and only noticed
when the orchestrator sent a wake ping ~100min later.

**How to apply:** never use a bare `while-true` bg loop as a WAKE source. Two
correct patterns: (1) the **Monitor tool** — streams each stdout line as a
notification, for continuous per-event watching; (2) a `run_in_background`
**until-loop that EXITS on the terminal condition** (`while true; do s=$(gh pr
view N --json state -q .state); [ "$s" = MERGED ] && { echo MERGED; break; };
sleep 60; done`) — gives exactly ONE notification when the condition trips. For
"tell me when the PR merges / CI turns green," pattern (2) is the lazy fit.

Caveat added 2026-07-08: the Monitor tool's Stage differ **lags** — it stamps an
event when it *notices*, not when the change happened, and can report a
transition minutes late. Silence is not evidence of no transition. At any
decision boundary, direct-read the source of truth; do not reason from the
absence of an event.

(The former sibling link here pointed at
`feedback_bug_ac_predeclare_red_green_revert_guard`, folded into WI-1716
(Refine gate correctness) on 2026-07-08 and deleted.)
