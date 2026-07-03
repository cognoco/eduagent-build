# Library — Program Roster (definition)

**What this is.** The *shape* of the program **roster** — the program-altitude working artifact the
orchestrator maintains. The roster is a board of **Initiative rows** + a pointer to the activation
queue (`library/activation-queue.md`). This file defines the shape; the live instance lives at
`working/program/program-roster.md`.

**Role:** the roster is the program's **standing hypothesis** (`planning-rules.md` §3.1) — the
inventory of Initiatives and their state. It is a board of rows and pointers, **not** a home for
delivery detail (that lives in each lane's tracker) or live WI state (that lives in Cosmo).

## Row schema (each Initiative is one proto-epic row)

`ID · Status · Owner · Outcome · Depends-on · Decomposition (pointer) · Activate-when`

| Field | Meaning |
|---|---|
| **ID** | roster-local Initiative id (`INI-NN`) |
| **Status** | lifecycle: `proposed` / `active` / `graduated` / `parked` / `killed` |
| **Owner** | who drives it |
| **Outcome** | the one-line result that defines "done" |
| **Depends-on** | cross-Initiative gates — references to **exported boundary nodes**, never foreign internal items (`planning-rules.md` §5.2) |
| **Decomposition (pointer)** | link to the Initiative's `_wip`/`working/lanes/<lane>/` workspace + ratified plan |
| **Activate-when** | the gate condition — the highest-value field; the one thing Cosmo can't express (`planning-rules.md` §1.3) |

## Rules
- **Pointers, never copies** (`planning-rules.md` §1.4): every fact has exactly one home; the
  roster points. It carries no row-internal delivery detail, no WI numbers, no live statuses beyond
  the coarse Initiative `Status`.
- **High bar for new rows** (`planning-rules.md` §3.2): absorb into existing clusters first; a new
  Initiative needs a coherent outcome, a distinct executor/supervision profile, and enough mass to
  charter. The last routing line is always the **unrouted-intake** holding row.
- **The roster + this proto-epic schema are the inputs to a top-down delivery layer** — keep the
  schema stable.
- Companion artifacts: the **activation queue** (`library/activation-queue.md`) and the
  **dashboard** (`library/dashboard.md`, a generated view — never a home).
