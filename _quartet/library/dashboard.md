# Library — Dashboard (definition)

**What this is.** The *shape* of the program **dashboard** ("Flight Deck") — a generated visual
over the program state, for the operator and stakeholders. This file defines what it shows; the
live instance lives at `working/program/dashboard.html`.

**The cardinal rule: a view, never a home.** The dashboard is **regenerated** from the roster +
Cosmo at every umbrella touch. It holds no authoritative fact of its own — on any disagreement, the
roster and Cosmo win. It states this about itself.

## What it shows
A board / gate-rail / field-guide over **Initiatives × bundles × gates**:
- **Board** — every Initiative row with its `Status`, outcome, owner.
- **Gate rail** — the activation queue rendered as gate conditions (what fires next, on what).
- **Field guide** — orientation for a non-author reader (what the Initiatives are, how to read the
  board).

## Rules
- **Generated, never hand-authored as truth** — regenerate at umbrella touches; never edit it to
  record a fact that isn't in the roster/Cosmo first.
- **HTML gets a dark/light toggle** (estate rule): default dark, remember the choice.
- It doubles as the hand-built prototype for any future top-down delivery-layer UI — keep its data
  model aligned with the roster's proto-epic schema (`library/program-roster.md`).
