<!-- TEMPLATE — first-run blank. Copy to program-roster.md (strip `.template`), swap every «PLACEHOLDER», delete this comment. Shape: ../../library/program-roster.md. Do NOT copy the snapshot program-roster.md beside this file — that is a prior program's content. -->

# «PROGRAM NAME» — Program Roster

> The program's **standing hypothesis**: the inventory of Initiatives and their state. A board of
> rows + pointers — **not** a home for delivery detail (that lives in each lane's tracker) or live WI
> state (that lives in Cosmo). Pointers, never copies. Shape: `../../library/program-roster.md`.

## Board (one row per Initiative)

| ID | Status | Owner | Outcome | Depends-on | Decomposition (pointer) | Activate-when |
|---|---|---|---|---|---|---|
| PRG-01 | proposed | «owner» | «one-line result that defines done» | «exported boundary node(s), or —» | «working/lanes/<lane>/ + ratified plan» | «the gate condition» |
| … | | | | | | |
| PRG-NN | — | — | **unrouted intake** (holding row — keep last) | — | — | — |

`Status` ∈ proposed · active · graduated · parked · killed.

## Activation queue
Forward view of what fires next, on what condition → `activation-queue.md` (shape:
`../../library/activation-queue.md`). The dashboard (`dashboard.html`) is a generated view over this
roster + Cosmo — never a home.
