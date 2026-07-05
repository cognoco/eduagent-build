# Library — Clacks Channel (definition)

**What this is.** The concrete *shape* of a lane's Clacks mailboxes — the two append-only JSONL
files the orchestrator and shepherd signal over. The design rationale is
`clacks/progress-channel-design.md`; this file is the schema + provisioning. A live instance lives
at `working/lanes/<lane>/_state/`.

**Binding note.** This is the runtime-neutral channel schema. Claude Code, Codex, or another
harness may host either endpoint if it preserves the same single-writer mailbox contract.

## Files (per lane, single-writer each)
- `outbox.jsonl` — **shepherd → orchestrator**. The shepherd is the only writer.
- `inbox.jsonl`  — **orchestrator → shepherd**. The orchestrator is the only writer; read-only to
  the shepherd.

Provisioned by the orchestrator at **lane activation** (step 4 of the activation checklist). Both
are append-only; single-writer-per-file is the correctness invariant — **no other agent writes
them** (executors are Clacks-blind).

## Envelope decision — keep the split, don't unify (WI-1230)
Two distinct envelopes (outbox: `lane`/`wi`/`level`; inbox: `from`/`type`), not one unified shape
shared by both directions. **Rationale:** single-writer-per-file is what makes concurrent JSONL
appends safe on a shared, Windows-hosted checkout — the shepherd is the only `outbox.jsonl` writer,
the orchestrator the only `inbox.jsonl` writer. A unified envelope buys no routing benefit (each
file already has exactly one writer and one reader) and reintroduces the thing the split avoids:
two agents' schemas coupled through one shape, so a change either side needs (e.g. outbox's `level`
enum) forces a review of the other side's writer too. Keep them independently evolvable.

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
- **Working-tree-only — never `git add`, never `git stash -u`:** `inbox.jsonl` / `outbox.jsonl`
  (and the sibling `.perID-seen.json`) are untracked-but-NOT-gitignored, co-located with tracked
  files in `_state/`. **WI-1245** fixture-proved 3 loss vectors on this seam: `git pull
  --no-rebase` (conflict markers land in the append-only file), `git stash -u` (channels stranded
  on a SHARED `refs/stash`), and `git add _state/` (sweeps channels into staging) — any of the
  three can revert a live channel to a stale snapshot and silently drop appended lines on a
  concurrent, shared checkout. Never run any of the three against these files. This is **interim
  hardening only**; **WI-1257** ratified the durable fix (Option A, mechanic A-2: relocate the 3
  channel files to a literal out-of-repo path — `library/artifact-disposition.md` §3), and
  **WI-1245** built the indirection point every reader/writer resolves the lane `_state` directory
  through (`clacks/lane-state-path.mjs`, the `QUARTET_LANE_STATE_ROOT` env key) — a no-op by
  default. The actual cutover (flipping the default, migrating the 3 channel files, re-arming
  monitors) is a separate, coordinated cross-session migration and is **not yet live** — this doc
  still makes **no `.gitignore` change**.

## Enforcement — schema can't silently drift
This doc is prose; without a check, a hand-authored line can drift from it unnoticed until a
reader chokes on it. `clacks/validate-channel-envelope.js` checks a `outbox.jsonl` / `inbox.jsonl`
against the two schemas above: required fields present, `level` / `type` restricted to their enum,
inbox `from` is always `orchestrator`, and — the drift this schema most needs to catch — no line
carries a field that belongs to the *other* direction's envelope (e.g. an inbox line with a stray
`level` or `lane`). Read-only; never rewrites the channel file.

```
node _quartet/clacks/validate-channel-envelope.js working/lanes/<lane>/_state/outbox.jsonl
node _quartet/clacks/validate-channel-envelope.js working/lanes/<lane>/_state/inbox.jsonl
```

Run it whenever a line was hand-authored (not appended by the normal orchestrator/shepherd flow),
and as part of the `monitor-hygiene.md` reconcile ritual on suspicion of a malformed channel.
Exit 0 = every line valid; exit 1 = violations printed to stderr, one per line.

## Self-referential framework change — adopts at the next session boundary
This doc is **framework canon** (consistent with the same discipline in
`roles/orchestrator-protocol.md`'s "Self-referential framework change" clause,
`roles/shepherd-protocol.md`'s "Adoption timing" note, and `clacks/monitor-hygiene.md`). It is
never hot-swapped under a running session — it takes effect starting with the **next session**
that reads it. A live shepherd or orchestrator session mid-run under the pre-amendment schema is
not retroactively bound by an amendment it never read.
