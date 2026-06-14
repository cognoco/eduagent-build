# Orchestrator ↔ Shepherd Progress Channel — design note

**Status:** Design (decisions locked 2026-06-14). **Not yet wired** — the running PRG-11
Tier-2 shepherd does not use this; lifecycle visibility today comes from the Cosmo-Stage
monitor. Wiring = a short "Progress channel" section in `shepherd-protocol.md` + one kickoff
line + an orchestrator-side watcher.

**Productization target:** PRG-5 (execution-mechanism / the orchestration loop). This is the
`orchestrator↔shepherd` agnostic seam PRG-5 is scoped to own. Cross-ref:
`_wip/umbrella-program/supporting-artefacts/mechanism-productionization-design-input.md`.

## Problem

A shepherd runs as a **separate session** driving a lane. The orchestrator (program session)
needs visibility into the shepherd's in-flight state — but only the parts that need a brain —
and a way to send rulings/directives back, **without the operator manually relaying status in
either direction**.

Two channels exist today, with a gap:
- **Control plane — Cosmo WI `Stage`** (Backlog→Executing→Reviewing→Closed). Lifecycle truth.
  Already monitored (a poll over the workstream's WIs).
- **Summary plane — Cosmo `complete` + tracker §5.** Terminal narrative, after the fact.
- **The gap:** in-flight exceptions, non-obvious decisions, blockers, escalations — currently
  surface only if the shepherd messages the operator. This channel fills that gap.

## Design

### Two planes, divided by labor
- **Lifecycle → the Cosmo-Stage monitor.** WI start / →Reviewing / →Closed / lane-complete.
  The shepherd emits **nothing** here; the orchestrator derives it.
- **Needs-a-brain → this channel.** Only events that change what the orchestrator or operator
  would *do*.

### Mailboxes — per-shepherd, not central
Each lane gets its own mailbox under `_wip/<lane>/_state/`:
- `outbox.jsonl` — shepherd → orchestrator (append-only).
- `inbox.jsonl`  — orchestrator → shepherd (append-only).

**Single writer per file** → zero append contention, git-isolated, and **addressable** (the
orchestrator targets exactly one shepherd). Provisioned by the orchestrator at **lane
activation** (it always knows when a shepherd comes online — it slices the WIs and hands the
kickoff). The orchestrator maintains a **derived central roll-up** (the program roster /
dashboard) by aggregating outboxes — "central" is a read view, **never** the write target.

*Why per-shepherd over one central file:* single-writer correctness (no reliance on atomic
`O_APPEND` discipline across heterogeneous agents), no central git merge hotspot, clean
bidirectional addressing (each shepherd reads only its own inbox), self-contained lifecycle,
and it maps to the actor/mailbox model that is the right PRG-5 fleet primitive.

### Outbox event schema
One JSON object per line:

| field | meaning |
|---|---|
| `id`   | short unique token the shepherd assigns (e.g. `prg11t2-007`); lets later events / inbox commands reference it |
| `ts`   | ISO-8601 UTC timestamp |
| `lane` | lane label (self-describing once merged into the roll-up) |
| `wi`   | work-item id, or null for a lane-level event |
| `level`| one of the four below |
| `ref`  | id of a prior event this one resolves/updates, or null |
| `msg`  | plain-text content |

**The four levels — and what the orchestrator does with each:**

| level | meaning | orchestrator action |
|---|---|---|
| **`needs-operator`** | a **human** decision (scope, product, risk) | relay to the operator; the ruling returns via the inbox. **Never** originate the answer. |
| **`needs-orchestrator`** | a **program-level** question (cross-lane coordination, process/mechanical) | answer it directly; escalate to the operator only if it turns out to touch scope/product/risk |
| **`blocked`** | stalled, cannot proceed | assess, route or resolve, track until cleared |
| **`decision`** | a **non-obvious** choice made within mandate, logged for the record | no action; informs the roll-up and later review |

**Boundary (the high threshold):** lifecycle transitions are **not** emitted (Cosmo-Stage owns
them). No progress narration, no chatter. *If a line wouldn't make the orchestrator act or make
the operator want to know, it isn't written. When in doubt, don't emit.*

**Resolution / threading — why there is no `milestone` level:** the one thing `milestone` would
have provided is knowing when a `blocked` / `needs-*` clears. That is handled by `ref`: the
shepherd emits a `decision` with `ref` = the original event's `id` and `msg` = `"resolved: …"`.
The orchestrator thus always sees **open → resolved** without opening an FYI/chatter channel.

Example outbox line:
```json
{"id":"prg11t2-007","ts":"2026-06-14T10:32:00Z","lane":"PRG-11 T2","wi":"WI-727","level":"needs-operator","ref":null,"msg":"F-105 fix could bump the retry cap 3→5 to match config — product-visible. Keep at 3 (no behaviour change) or bump?"}
```

### Inbox command schema (orchestrator → shepherd)

| field | meaning |
|---|---|
| `id`, `ts` | as above |
| `from` | `orchestrator` |
| `type` | `ruling` (operator decision, relayed) · `answer` (orchestrator's own answer to a `needs-orchestrator`) · `directive` (operational command: pause / reprioritize / rebase) · `ack` |
| `ref`  | id of the outbox event this responds to (or null for an unsolicited directive) |
| `msg`  | plain-text content |

**Guardrails:** inbox commands are **advisory** — the shepherd applies its own judgment, never
blind-executes. `ruling` content is the operator's, **relayed verbatim** by the orchestrator,
who never originates a `needs-operator` answer.

### Cadence
- **Shepherd emits (outbox):** at the four triggers only — needs a human, needs the
  orchestrator, blocked, or a non-obvious decision — plus a `ref`-resolution when a thread clears.
- **Shepherd reads (inbox):** at **checkpoints** (between WIs) and **on block**. Not a continuous
  tail — urgent course-corrections are rare, and checkpoint+on-block bounds the wait without
  standing machinery.
- **Orchestrator:** watches each provisioned outbox; surfaces by level (`needs-*` / `blocked`
  loud → relay or answer; `decision` → record); writes `ruling`/`answer`/`directive` to the
  relevant inbox; keeps the roll-up current.

### The closed loop
```
shepherd → outbox: needs-operator (id=X)
  → orchestrator pinged → relays to operator
     → operator rules
        → orchestrator → inbox: ruling (ref=X)
           → shepherd (next checkpoint / on block) reads, acts
              → outbox: decision (ref=X, "resolved: …")
                 → orchestrator sees the loop close, updates the roll-up
```
The orchestrator is the **router**, not a relay the operator must feed. `needs-orchestrator`
short-circuits the operator entirely.

## Productization (PRG-5)

This is the `orchestrator↔shepherd` seam named in PRG-5's agnosticity scope; the layout is the
**actor/mailbox model** (each agent = an addressable endpoint with an in/out queue).
- **Prototype (now):** file-backed mailboxes on the shared checkout (co-located sessions).
- **Fleet (PRG-5):** swap the backend (Cosmo-backed, a small store, or a bus) behind the same
  schema + an `emit()` / `subscribe()` contract. The per-agent-mailbox logical model carries
  over; the physical file is an implementation detail.
- **Runtime-agnostic:** a Claude or Codex shepherd emits the same schema; a Claude or Codex
  orchestrator subscribes the same way. **Shepherd↔executor stays native-by-design** —
  executors report to their shepherd; the shepherd aggregates and emits upward; executors never
  touch this channel.

## Open items before wiring
1. A `shepherd-protocol.md` "Progress channel" section + one kickoff line (emit-triggers +
   inbox-check cadence).
2. An orchestrator-side watcher that tails provisioned outboxes (sibling of the Cosmo-Stage
   monitor) and surfaces by level.
3. The `id` convention (e.g. `<lane-slug>-<seq>`).
