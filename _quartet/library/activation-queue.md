# Library — Activation Queue (definition)

**What this is.** The *shape* of the program **activation queue** — the program-wide forward view
of which Initiative activates when. Lives with the roster (`working/program/`); the orchestrator
maintains it. Defined separately from the roster because it answers a different question: the
roster is *what exists*, the queue is *what fires next, and on what condition*.

**Role:** the queue is **gate-ordered, not date-ordered** (`planning-rules.md` §6.2). Each entry is
a condition on a named event, never a calendar position.

## Entry shape
One line per Initiative (every Initiative appears, including "much later" ones —
`planning-rules.md` §6.1):

`INI-NN · gate condition(s) · blast-radius class · notes`

## The standard activation gates (all must clear — `planning-rules.md` §6.3)
- **Blast-radius class** — out-of-radius work may run parallel to a rewrite anytime; in-radius work
  serializes behind (or coordinates with) the constructing wave.
- **Pipeline-proven, not pipeline-finished** — a few WIs through claim→execute→review→close cleanly
  on the machinery; never "the first Initiative completed end-to-end."
- **Attention budget** — the honest human-capacity call, made per activation window; never encoded
  as a dependency.
- Plus any named **operator/product gates** (a required human ruling, an external trigger) — listed
  as explicit conditions on the entry.

## Rules
- **Full forward view** (`planning-rules.md` §6.1): a queue showing only the near-term subset can't
  be reconciled against the roster and is wrong by construction.
- **Gates are conditions, not edges** (`planning-rules.md` §5.3): resource contention, same-file
  blast radius, operator-ruling gates, and product triggers are **queue gates**, not dependency
  edges.
- **Activation cross-refs exported boundary nodes only** — the program schedules **activations
  against exported milestones**, never another Initiative's internal items (`planning-rules.md`
  §5.5).
