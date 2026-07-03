# Library — Clacks Channel (definition)

**What this is.** The concrete *shape* of a lane's Clacks mailboxes — the two append-only JSONL
files the orchestrator and shepherd signal over. The design rationale is
`clacks/progress-channel-design.md`; this file is the schema + provisioning. A live instance lives
at `working/lanes/<lane>/_state/`.

## Files (per lane, single-writer each)
- `outbox.jsonl` — **shepherd → orchestrator**. The shepherd is the only writer.
- `inbox.jsonl`  — **orchestrator → shepherd**. The orchestrator is the only writer; read-only to
  the shepherd.

Provisioned by the orchestrator at **lane activation** (step 4 of the activation checklist). Both
are append-only; single-writer-per-file is the correctness invariant — **no other agent writes
them** (executors are Clacks-blind).

## Outbox line schema (shepherd → orchestrator)
One JSON object per line:

| field | meaning |
|---|---|
| `id`   | `<lane-slug>-<seq>` — short unique token the shepherd assigns; lets later events / inbox commands reference it |
| `ts`   | ISO-8601 UTC timestamp |
| `lane` | lane label (self-describing once merged into the roll-up) |
| `wi`   | work-item id, or `null` for a lane-level event |
| `level`| one of the four below |
| `ref`  | `id` of a prior event this one resolves/updates, or `null` |
| `msg`  | plain-text content |

**The four levels — the only ones (no milestone / FYI / progress):**

| level | when |
|---|---|
| `needs-operator` | a **human** decision (scope / product / risk) the shepherd can't make within mandate |
| `needs-orchestrator` | a **program-level** question (cross-lane, process/mechanical) |
| `blocked` | stalled, can't proceed |
| `decision` | a non-obvious choice made *within* mandate, logged for the record |

**Threading:** when a `blocked` / `needs-*` clears, the shepherd emits a `decision` with `ref` set
to the original `id` and `msg:"resolved: …"`. That closes the loop without an FYI channel.

```json
{"id":"ini11t2-007","ts":"2026-06-14T10:32:00Z","lane":"INI-11 T2","wi":"WI-727","level":"needs-operator","ref":null,"msg":"F-105 fix could bump the retry cap 3→5 to match config — product-visible. Keep at 3 or bump?"}
```

## Inbox line schema (orchestrator → shepherd)

| field | meaning |
|---|---|
| `id`, `ts` | as above |
| `from` | `orchestrator` |
| `type` | `ruling` (operator decision, relayed verbatim) · `answer` (orchestrator's own answer to a `needs-orchestrator`) · `directive` (operational command: pause / reprioritize / rebase) · `ack` |
| `ref`  | `id` of the outbox event this responds to (or `null` for an unsolicited directive) |
| `msg`  | plain-text content |

## Rules
- **Advisory, not imperative:** inbox commands are advisory — the shepherd applies judgment, never
  blind-executes. A `ruling` is the operator's decision, relayed verbatim; the orchestrator never
  originates a `needs-operator` answer.
- **Lifecycle is NOT on this channel:** WI →Reviewing / →Closed is derived from the Cosmo-Stage
  monitor, never emitted here. This channel is **needs-a-brain only**.
- **Watchers:** both sides subscribe with a live Monitor and follow `clacks/monitor-hygiene.md`
  (`persistent:true`, manifested, reconciled — never blind-re-armed).
