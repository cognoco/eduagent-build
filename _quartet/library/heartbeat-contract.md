# Heartbeat Contract — process-level liveness for supervised sessions (WI-1563)

**What this is.** The small, documented file format a long-lived orchestrator/shepherd/PM session
writes to prove it is still alive at the OS-process level. This is a **new, lower layer**
underneath the liveness machinery `library/liveness-checker.md` already defines:

| Layer | Detects | Checked by | Doc |
|---|---|---|---|
| **L0 (this doc)** | the session's **process** died (crash, host reboot, silent rate-limit death) | the non-agent supervisor watchdog | this doc + `library/supervisor-watchdog-contract.md` |
| **L1** | the **lane** has gone quiet past an announced deadline (process may be alive but not making progress) | orchestrator, checking a shepherd | `library/liveness-checker.md` §L1 |
| **L2** | an **executor's claim** outlived its TTL | shepherd, checking an executor | `library/liveness-checker.md` §L2 |

L0 exists because L1/L2 both assume *something* is still reading the manifest and running the
scheduled check — they have no answer for "the orchestrator/shepherd session itself is gone and
nothing will ever fire the L1/L2 check again." That is exactly what killed two shepherd sessions
overnight 2026-07-04: a rate-limit death with nothing watching the process to relaunch it. L0 is
consumed by the watchdog defined in `library/supervisor-watchdog-contract.md`, and is designed as a
standalone contract so WI-1602 (adaptive cadence) can read it without re-deriving this shape.

## Where it lives

Same directory convention as `monitor-manifest.json` (`clacks/monitor-hygiene.md`) — sibling to the
manifest and to `inbox.jsonl`/`outbox.jsonl`, not a new location:

- Shepherd/lane session → `working/lanes/<lane>/_state/heartbeat.json`
- Orchestrator/PM session → `working/program/heartbeat.json`

Same git-hygiene class as `inbox.jsonl`/`outbox.jsonl` (`library/clacks-channel.md`):
**untracked-but-NOT-gitignored**, single-writer. Unlike the Clacks mailboxes this is **not**
append-only — it is one JSON object, overwritten in place each tick, because only current state
matters.

## Schema

```json
{
  "session_id": "orchestrator:ramtop-20260704T1900Z",
  "role": "orchestrator",
  "lane": "program",
  "host": "Surface",
  "pid": 41232,
  "last_alive": "2026-07-04T19:32:00Z",
  "window_resets_at": "2026-07-05T00:32:00Z",
  "relaunch_command": "claude --resume orchestrator-ramtop-20260704T1900Z -p \"Resume per _quartet/roles/orchestrator-protocol.md orient-on-resume.\""
}
```

| field | meaning |
|---|---|
| `session_id` | `<role>:<identity>-<start-ts>` — matches the identity convention already used for lease sessions (`clacks/lease.ts`) and Workstream `Orchestrator` values (`roles/program-manager-protocol.md`) |
| `role` | `orchestrator` \| `shepherd` \| `program-manager` |
| `lane` | the lane slug, or `program` for a program-wide (orchestrator/PM) session |
| `host` | machine name (`Surface`, `Ramtop`, …) — the watchdog only trusts `pid` when this matches its own host |
| `pid` | best-effort OS process id of the CLI process hosting the session (obtained by the session running e.g. `$PID` / `echo $$` at heartbeat-write time). Used for the watchdog's duplicate-session guard, not for anything else. |
| `last_alive` | ISO-8601 UTC — set on every heartbeat write |
| `window_resets_at` | ISO-8601 UTC — see *Window-reset field* below |
| `relaunch_command` | the exact command the watchdog runs verbatim to resume this session |

## Write cadence — wall-clock, not turn-bound

**A session must not rely on writing this file only between agent turns.** A single long-running
tool call (this harness's Bash tool caps at 10 minutes; a `persistent:true` Monitor can run far
longer) would then look identical to death. The write must come from a **wall-clock timer
independent of turn-taking** — the same shape `clacks/lease.ts` already establishes for a different
resource (`HEARTBEAT_MS = 2 * 60 * 1000`, a plain `setInterval` in `review-watcher.ts`'s persistent
process, chosen there specifically because "a plain wall-clock timer... satisfies... no dependency
on any session/compaction event"). This contract reuses that cadence and that shape rather than
inventing a new one: **recommended heartbeat-write interval = 2 minutes**, via a lightweight
persistent companion process/task (a `Monitor(persistent:true)` loop, or a tiny script run
alongside the session) — not the LLM turn loop itself.

## Window-reset field — the design fork, flagged

`window_resets_at` is what lets a dumb watchdog decide "is it safe to respawn" without ever calling
back into a rate-limited API. **There is no confirmed programmatic signal on this harness that
exposes an authoritative token-window reset time to a running session** (not verified as part of
this WI — a genuine open question, not assumed away). Two options were considered:

- **Option A — time-based gate (adopted as the default here).** Every heartbeat write sets
  `window_resets_at = last_alive + 5h`, unconditionally, regardless of *why* the session might die
  next. This is deliberately conservative and rolls forward every 2 minutes: if the process dies
  the instant after a heartbeat write, the last-written `window_resets_at` is still exactly
  "5 hours from the last proof of life" — safe by construction, because a fresh window cannot have
  been burned any earlier than that proof of life. It over-waits in the pure-crash case (a plain
  process crash unrelated to rate limits gets held for up to 5h before respawn) — an explicit,
  accepted trade-off: AC-3 prioritizes never burning a window over fast recovery from ordinary
  crashes.
- **Option B — a cheap harness probe** (e.g. a trivial headless call that would fail fast against a
  still-exhausted window without being processed/billed) that could shrink the wait for the
  ordinary-crash case. **Not built in this WI** — verifying that such a probe genuinely does not
  consume the window itself, and that its failure mode is script-distinguishable, requires
  exercising a live rate-limit boundary, which this WI cannot safely do. **Flagged as a design fork
  for the shepherd/orchestrator / WI-1602 to evaluate**, not guessed at here.

If the harness later exposes a genuine reset-time signal, a session MAY write a tighter
(never-earlier-than-actual) value into `window_resets_at` instead of the rolling `+5h` default —
the field's contract is "the earliest time it is safe to assume a fresh window," not specifically
"last_alive + 5h"; that formula is just the safe fallback when no better signal exists.

## Threat-model note

`relaunch_command` is executed **verbatim** by the watchdog (`library/supervisor-watchdog-contract.md`).
That is arbitrary local execution driven by file content. Accepted here because the file is
single-writer, session-authored, and lives on the same trusted local host the watchdog runs on —
**do not** repurpose this contract to consume a heartbeat file from an untrusted source or a
different trust boundary without re-examining this assumption.

## Where this binds

- `library/supervisor-watchdog-contract.md` — the consumer: staleness-poll + window gate + PID
  guard + backoff + breadcrumb.
- `library/liveness-checker.md` — sibling layer (L1/L2); this doc adds L0 without altering L1/L2.
- `clacks/monitor-hygiene.md` — same manifest-adjacent, gitignore-untracked runtime-file class as
  `monitor-manifest.json` / `inbox.jsonl` / `outbox.jsonl`.
- `clacks/lease.ts` — source of the reused 2-minute wall-clock heartbeat cadence and the
  "plain timer, no session/compaction dependency" shape.
- Relates: WI-1602 (adaptive cadence over this contract, out of scope here), WI-1607 (folded into
  this WI's resume-relaunch + window-gate requirement).
