# The Clacks — Orchestrator ↔ Shepherd Progress Channel (design note)

**What this is.** The design + rationale for the **Clacks**: the comms layer the Quartet signals
over. The concrete file shape (line schemas + provisioning) is `library/clacks-channel.md`; this
note is the *why*. Status: design locked and wired into the shepherd + orchestrator protocols.

## Name
This channel — the `_state/{inbox,outbox}.jsonl` mailboxes + the Cosmo-Stage signaling the
orchestrator derives lifecycle from + the Monitor watchers on both sides — is collectively the
**Clacks**, the **Quartet's** comms layer. Stack: **ZDX → Cosmo → Clacks → Quartet**.

## Problem
A shepherd runs as a **separate session** driving a lane. The orchestrator (program session) needs
visibility into the shepherd's in-flight state — but only the parts that need a brain — and a way
to send rulings/directives back, **without the operator manually relaying status in either
direction**.

Two channels exist already, with a gap:
- **Control plane — Cosmo WI `Stage`** (Backlog→Executing→Reviewing→Closed). Lifecycle truth.
  Already monitored (a poll over the workstream's WIs).
- **Summary plane — Cosmo `complete` + tracker checkpoint.** Terminal narrative, after the fact.
- **The gap:** in-flight exceptions, non-obvious decisions, blockers, escalations — currently
  surface only if the shepherd messages the operator. This channel fills that gap.

## Design

### Two planes, divided by labor
- **Lifecycle → the Cosmo-Stage monitor.** WI start / →Reviewing / →Closed / lane-complete. The
  shepherd emits **nothing** here; the orchestrator derives it.
- **Needs-a-brain → this channel.** Only events that change what the orchestrator or operator would
  *do*.

### Mailboxes — per-shepherd, not central
Each lane gets its own mailbox under `working/lanes/<lane>/_state/`:
- `outbox.jsonl` — shepherd → orchestrator (append-only).
- `inbox.jsonl`  — orchestrator → shepherd (append-only).

**Single writer per file** → zero append contention, git-isolated, and **addressable** (the
orchestrator targets exactly one shepherd). Provisioned by the orchestrator at **lane activation**.
The orchestrator maintains a **derived central roll-up** (the program roster / dashboard) by
aggregating outboxes — "central" is a read view, **never** the write target.

> **PM-role note (WI-1370, filed not reconciled).** "The orchestrator maintains" the roll-up is
> correct today — the orchestrator is the program-role-of-today (`planning-rules.md` §2.5) and no
> PM-role holder is live yet. This ownership framing is revisited at PM-role adoption
> (`roles/program-manager-protocol.md`'s roster-ownership clause covers the roster; dashboard
> remains PM-referenced, not owned). Owner: WS-26 lane. Target: at PM-role adoption — tied to the
> WI-1357 orchestrator-hardening wave or the first live PM session, whichever lands first. Do not
> reconcile before adoption.

*Why per-shepherd over one central file:* single-writer correctness (no reliance on atomic
`O_APPEND` discipline across heterogeneous agents), no central git merge hotspot, clean
bidirectional addressing (each shepherd reads only its own inbox), self-contained lifecycle, and it
maps to the actor/mailbox model that is the right fleet primitive.

### Outbox event schema
One JSON object per line — fields and the four levels are specified in `library/clacks-channel.md`.
The four levels and what the orchestrator does with each:

| level | meaning | orchestrator action |
|---|---|---|
| **`needs-operator`** | a **human** decision (scope, product, risk) | relay to the operator; the ruling returns via the inbox. **Never** originate the answer. |
| **`needs-orchestrator`** | a **program-level** question (cross-lane, process/mechanical) | answer it directly; escalate to the operator only if it turns out to touch scope/product/risk |
| **`blocked`** | stalled, cannot proceed | assess, route or resolve, track until cleared |
| **`decision`** | a **non-obvious** choice made within mandate, logged for the record | no action; informs the roll-up and later review |

**Boundary (the high threshold):** lifecycle transitions are **not** emitted (Cosmo-Stage owns
them). No progress narration, no chatter. *If a line wouldn't make the orchestrator act or make the
operator want to know, it isn't written. When in doubt, don't emit.*

**Resolution / threading — why there is no `milestone` level:** the one thing `milestone` would
provide is knowing when a `blocked` / `needs-*` clears. That is handled by `ref`: the shepherd
emits a `decision` with `ref` = the original event's `id` and `msg` = `"resolved: …"`. The
orchestrator thus always sees **open → resolved** without opening an FYI/chatter channel.

### Inbox command schema (orchestrator → shepherd)
`type` ∈ `ruling` (operator decision, relayed) · `answer` (orchestrator's own answer to a
`needs-orchestrator`) · `directive` (operational command: pause / reprioritize / rebase) · `ack`.
**Guardrails:** inbox commands are **advisory** — the shepherd applies its own judgment, never
blind-executes. `ruling` content is the operator's, **relayed verbatim** by the orchestrator, who
never originates a `needs-operator` answer.

### Cadence
- **Shepherd emits (outbox):** at the four triggers only — plus a `ref`-resolution when a thread
  clears.
- **Shepherd subscribes (inbox):** a **live watcher** on its inbox (a Monitor on `inbox.jsonl`),
  armed at activation — **symmetric to the orchestrator's outbox watcher** — so a ruling wakes a
  *held* shepherd. Read at checkpoint + on-block is the **fallback** for watcher death
  (reboot/session-end). *(A checkpoint-only pull reintroduces the operator as transport — a blocked
  shepherd never reaches a checkpoint, so a human would have to nudge "check your inbox." Symmetric
  subscription removes that.)*
- **Orchestrator:** watches each provisioned outbox; surfaces by level; writes
  `ruling`/`answer`/`directive` to the relevant inbox; keeps the roll-up current.

Both watchers are subject to **monitor hygiene** (`clacks/monitor-hygiene.md`): tracked in a
manifest, `persistent:true`, reconciled (never blind-re-armed) after compaction/restart.

### The closed loop
```
shepherd → outbox: needs-operator (id=X)
  → orchestrator pinged → relays to operator
     → operator rules
        → orchestrator → inbox: ruling (ref=X)
           → shepherd (woken by inbox watcher) reads, acts
              → outbox: decision (ref=X, "resolved: …")
                 → orchestrator sees the loop close, updates the roll-up
```
The orchestrator is the **router**, not a relay the operator must feed. `needs-orchestrator`
short-circuits the operator entirely.

## Productization (later)
This is the `orchestrator↔shepherd` agnostic seam. The layout is the **actor/mailbox model** (each
agent = an addressable endpoint with an in/out queue).
- **Prototype (now):** file-backed mailboxes on the shared checkout (co-located sessions).
- **Fleet (later):** swap the backend (Cosmo-backed, a small store, or a bus) behind the same
  schema + an `emit()` / `subscribe()` contract. The per-agent-mailbox logical model carries over;
  the physical file is an implementation detail.
- **Runtime-agnostic:** a Claude or Codex shepherd emits the same schema; a Claude or Codex
  orchestrator subscribes the same way. **Shepherd↔executor stays native-by-design** — executors
  report to their shepherd; the shepherd aggregates and emits upward; executors never touch this
  channel (Clacks-blind).

**Binding note.** This document defines the runtime-neutral Clacks channel. Claude Code, Codex, or
another harness can host either side if its binding supplies the same mailbox and monitor semantics.
Watcher runtime state belongs under `.cosmo-watch/` or the declared gitignored runtime dir, never as
in-place edits to `_quartet/clacks/*`.
