# Supervisor Watchdog Contract — heartbeat-staleness-poll → resume-relaunch (WI-1563)

**What this is.** The cross-OS interface for the **non-agent** watchdog that recovers a supervised
session (orchestrator / shepherd / PM) whose process died silently — most urgently, a session that
hit the 5-hour rate-limit window and never came back. The watchdog reads `heartbeat.json`
(`library/heartbeat-contract.md`), and is deliberately **not an LLM/agent** — a plain script run by
an OS scheduler — so it can never itself be rate-limited into uselessness.

**Shipped in this WI:** the Windows implementation, `clacks/supervisor-watchdog.ps1`, run by a
Windows Scheduled Task (registration helper: `clacks/register-supervisor-watchdog-task.ps1`,
operator-run, not auto-installed). **Not shipped:** a macOS/Ramtop launchd+bash port. This doc is
written so that port is a drop-in against the same algorithm and file shapes, not a redesign
(Surface-first, per this WI's scope — simplicity first, no speculative cross-platform code).

## Inputs

- One or more `heartbeat.json` files (`library/heartbeat-contract.md`), passed as paths to watch
  (CLI args on the Windows implementation — see the script header). No new manifest schema is
  introduced for "which heartbeats to watch"; the operator/registration script simply lists the
  paths, the same way `working/program/monitor-manifest.json` lists watcher commands.
- `now` — wall-clock time, or an injected override for deterministic testing (mirrors
  `clacks/l1-liveness-check.js`'s `--now` convention).
- Per-session backoff state, `<heartbeat-dir>/supervisor-recovery-state.json` — the watchdog's own
  bookkeeping, single-writer = watchdog.

## Outputs

- Side effect: executes the heartbeat's `relaunch_command` when the algorithm below triggers.
- `<heartbeat-dir>/supervisor-recovery.jsonl` — an append-only breadcrumb log, single-writer =
  watchdog (kept separate from `outbox.jsonl` deliberately — see *Why not outbox.jsonl* below).
- A manifest entry pointing at `supervisor-recovery.jsonl` should be added to the relevant
  `monitor-manifest.json` (lane or program) so the **existing** reconcile/watch machinery
  (`clacks/monitor-hygiene.md`) picks it up — this is how "the PM/liveness watcher sees the
  recovery" (AC-4) without inventing a second notification path.

## Algorithm (per watched heartbeat)

```
staleness = now - heartbeat.last_alive

1. staleness < STALE_THRESHOLD_MIN (30)
     -> HEALTHY. No action.

2. staleness >= STALE_THRESHOLD_MIN:
   a. if heartbeat.host == local hostname AND Get-Process(heartbeat.pid) exists
        -> HANG-SUSPECTED (process alive, session unresponsive). Do NOT respawn — that would
           create a duplicate session on a shared checkout (the exact capacity hazard
           `roles/program-manager-protocol.md` flags). Log a breadcrumb and re-check next poll.
   b. else (process confirmed gone, or host != local and therefore unverifiable — logged as such):
        if now < heartbeat.window_resets_at
              -> WINDOW-NOT-RESET. No action. This is the "never burn a fresh window" guarantee —
                 it holds even if the process death had nothing to do with rate limits, because
                 `window_resets_at` is always >= the true reset time (library/heartbeat-contract.md).
        if now >= heartbeat.window_resets_at:
              if now < recovery_state.next_attempt_not_before
                    -> BACKOFF-WAIT. No action (see Backoff curve).
              else
                    -> RESPAWN: run relaunch_command (non-blocking spawn — the watchdog must not
                       block waiting on the relaunched session).
                       recovery_state.attempt_count += 1
                       recovery_state.next_attempt_not_before = now + backoff(attempt_count)
                       append breadcrumb: respawn-attempt

3. On any poll where heartbeat.last_alive has advanced past the most recent respawn attempt's
   timestamp -> the session is back. Reset recovery_state.attempt_count to 0 and clear
   next_attempt_not_before.
```

## Staleness threshold — false-positive safety

`STALE_THRESHOLD_MIN = 30`. Justification: the recommended heartbeat-write cadence is 2 minutes
(`library/heartbeat-contract.md`, reusing `clacks/lease.ts`'s `HEARTBEAT_MS`). 30 minutes is **15x**
that cadence — comfortable margin for a missed cycle, clock skew between hosts, and the longest
single blocking tool call this harness runs (Bash tool cap: 10 minutes) without mistaking a busy
session for a dead one. It is well short of the liveness-checker's own "~2 hour" L1 floor for
lane-quiet, because process-death detection should be much faster than work-quiet detection — a
dead process will never resume on its own, whereas a quiet-but-alive lane might.

## PID guard — duplicate-session safety

A stale heartbeat is **not** proof the process is dead — it could be hung-but-alive. Respawning
into that state creates two sessions on a shared checkout, a documented hazard
(`roles/program-manager-protocol.md` "Capacity management"). The watchdog only respawns after
confirming the recorded `pid` is gone, **and only when `host` matches its own hostname** — a
cross-host heartbeat's `pid` is not independently verifiable by this watchdog, so that case falls
through to trusting staleness + the window gate alone (a residual, explicitly accepted risk for the
cross-host case; the Windows implementation shipped here only watches same-host sessions).

## Backoff curve — no respawn-loop, no window-burn

Backoff only paces retries **after** the window-reset gate has already passed — it cannot itself
cause a premature respawn, because step 2b's window check runs first, every time, regardless of
backoff state. Its only job is to stop a broken `relaunch_command` (bad path, auth failure, etc.)
from respawning every 10-minute poll forever:

| attempt | wait before next attempt |
|---|---|
| 1 | 10 min |
| 2 | 30 min |
| 3 | 60 min |
| 4 | 120 min |
| 5 | 120 min (cap) |
| 6 | give up — breadcrumb an `escalate` event and stop auto-retrying until `supervisor-recovery-state.json` is cleared (operator/shepherd action) |

## Poll interval

The Windows Scheduled Task runs `supervisor-watchdog.ps1` every **10 minutes**. Worst-case detection
latency for a genuine death is therefore `STALE_THRESHOLD_MIN + poll interval` ≈ 40 minutes — hours
faster than the incidents that motivated this WI, without needing sub-minute polling.

## Why not `outbox.jsonl` for the breadcrumb

`library/clacks-channel.md` fixes `outbox.jsonl` as **shepherd-only, single-writer** ("no other
agent writes them"). The watchdog is not the shepherd and is not an agent at all — writing there
would break that invariant for a channel three other docs (`clacks-channel.md`,
`monitor-hygiene.md`, `liveness-checker.md`) depend on staying single-writer. Instead the watchdog
owns its own append-only file, `supervisor-recovery.jsonl`, wired into the **existing** manifest/
reconcile machinery via a manifest entry (not a new watch mechanism). Once a session resumes, it
should post its own `[orch-status]`/`decision` acknowledgment into the real Clacks/Workstream
channel per the normal protocol — the watchdog's breadcrumb is evidence of the recovery action
itself, not a replacement for that.

### `supervisor-recovery.jsonl` schema

```json
{"ts":"2026-07-04T23:41:00Z","session_id":"orchestrator:ramtop-20260704T1900Z","event":"respawn-attempt","attempt":1,"msg":"[orch-status] stale since 2026-07-04T19:32:00Z; window reset confirmed 2026-07-04T23:32:00Z; relaunching"}
```

`event` ∈ `hang-suspected` \| `window-wait` \| `respawn-attempt` \| `escalate`.

## Where this binds

- `library/heartbeat-contract.md` — the file this contract polls.
- `clacks/supervisor-watchdog.ps1` — the Windows implementation of this algorithm.
- `clacks/register-supervisor-watchdog-task.ps1` — operator-run Scheduled Task registration.
- `clacks/monitor-hygiene.md` — the manifest entry that makes `supervisor-recovery.jsonl` visible to
  existing reconcile/watch machinery.
- Future: a macOS/Ramtop launchd+bash implementation of this same algorithm (not built here).
