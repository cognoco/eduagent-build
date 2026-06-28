# Bug Lane — execution tracker (Standing Lane)

**What this is.** The lane entry-point for the **Bug Lane** shepherd (the doc
`shepherd-protocol.md` tells you to read on arrival). This is a **Standing Lane**: it works
**exactly like any other Quartet shepherd lane** — full bidirectional orchestrator channel,
typed executors, separate reviewer — with **one** difference: **there is no PRG initiative /
proto-epic** behind it. It has no "done means" and never graduates; it's continuous bug intake.

**Process scaffold:** `_wip/identity-foundation/shepherd-protocol.md` (cross-lane standard) +
`_wip/identity-foundation/subagent-brief-standard.md` (typed-executor profiles) +
`executor-protocol.md` (builder deep-doc). You orchestrate; you do **not** do execution-class
work (code, repro, investigation, audit) in your own seat — dispatch a typed executor.

---

## Charter

Drive each Work Item in the **Bug Lane** Cosmo Workstream from its current Stage to **Cosmo
Close**, one WI at a time, as bugs are fed in. Unrelated one-off defects — no shared theme,
no cutover/identity coupling. Distinct from **PRG-18 Flow Remediation** (Zuzka's *bounded*
post-cutover mop-up) and **PRG-06/WS-18** (identity cutover).

- **Cosmo Workstream:** **Bug Lane** — `3858bce9-1f7c-8083-905b-d94bca4a4325`.
- **Per-WI state (source of truth):** Cosmo. Do not copy the WI list here (pointers, not
  copies). Live query: WS-relation `contains 3858bce9-1f7c-8083-905b-d94bca4a4325` against the
  Cosmo WI DB `f170be9e-04ae-45d4-9618-28f2438666bd`.

## Operating model

Standard Quartet shepherd. The **only** deviation from a PRG lane is the absence of a PRG row.

- **Bidirectional Clacks channel** — `_wip/bug-lane/_state/{inbox,outbox}.jsonl`, one JSON
  object per line (`{id, ts, from, type, ref, msg}`):
  - **inbox** = orchestrator → you (rulings, feedback, cross-lane context the orchestrator
    judges relevant to your lane).
  - **outbox** = you → orchestrator (status, findings, escalations).
- **Two input paths, one reporting discipline.** The **operator may give you direct
  instructions in-session**; the **orchestrator** sends rulings/feedback over the inbox.
  Whichever path an instruction arrives by, **keep the orchestrator informed of EVERYTHING** —
  mirror operator-direct instructions and your actions to the **outbox** so the orchestrator
  has the full picture and can feed back anything relevant. You are **not** disconnected from
  the orchestrator; the orchestrator stays in the loop.
- **Reviewer (Gate 2):** the separate reviewer session must cover the **Bug Lane** workstream.
  Confirm coverage on arrival; do **not** wire/own the review watcher. If unconfirmed, flag.
- **Worktrees:** `.worktrees/WI-NN/` via the repo worktree-setup skill. One single-writer
  applier per worktree; never parallel writers on one tree.

## Standing rules (inherited)

- Claim before execute; finalize via `cosmo:execute complete`; never self-close (reviewer-only).
- `main`-based worktrees; new-llm branch is FROZEN unless a WI explicitly says otherwise.
- Sonnet/standard for executors; Opus only for genuine reasoning-hard plan-phases.

## Standup state

- **Awaiting specific instructions** (operator + orchestrator, together). On arrival: orient,
  confirm reviewer coverage, post a standup line to the outbox, then **await direction** — do
  **not** auto-select Work Items.

## Change log

- **2026-06-20 — Standing Lane stood up.** Model: standard Quartet shepherd, no PRG. Scaffold
  provisioned (this tracker + bidirectional channel). Kickoff prompt handed to operator.
