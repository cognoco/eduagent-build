# Working state (live instances)

This is the **Working** leg of the triad — the live instances a running Quartet produces, as
opposed to the reusable **Brain** (`../roles/`) and **Library** (`../library/`). It is kept inside
`_quartet/` **for now**; its ultimate home (inside `_quartet/` vs. an external per-program path) is
a deferred production decision.

## Layout
```
working/
  program/   program-altitude working state (one per program)
    program-roster.md      live roster instance       (shape: ../library/program-roster.md)
    dashboard.html         live dashboard instance     (shape: ../library/dashboard.md)
  lanes/     initiative-altitude working state (one dir per active lane)
    <lane>/
      execution-tracker.md (shape: ../library/execution-tracker.md)
      _state/
        inbox.jsonl        orchestrator → shepherd   (shape: ../library/clacks-channel.md)
        outbox.jsonl       shepherd → orchestrator
```

## ⚠ Snapshot status (read before trusting these)
`program/program-roster.md` and `program/dashboard.html` are **point-in-time copies** taken from the
live program tracking at extraction time. **They are NOT the operational source** — the live copies
remain in their original `_wip/` location and continue to move until the cutover relocates them.
Treat the files here as a seed for the relocated operational home, not as current truth.

**Starting a NEW program?** Do **not** copy or augment the snapshot content here. Copy the blank
`*.template.md` / `*.template.html` files in `program/`, strip the `.template` suffix, and synthesize
fresh from the Library schemas (`../library/`). The snapshot roster/dashboard belong to the *prior*
program and must not bleed into a new one's working state.

`lanes/` is intentionally **empty** — live lane working state (each lane's tracker + `_state/`
channels) is not bulk-copied here; it stays in its operational `_wip/<lane>/` home until cutover.
The structure above shows where a lane's working state lands once instantiated from the Library.

## Why it's separate from Brain/Library
Working state is the *output* of running the Brain against the Library — it mutates continuously,
is per-instance, and is archived at graduation. It must never be confused with the reusable
definitions: the Library holds the *shape* of a roster; this holds *a* roster's current value.
