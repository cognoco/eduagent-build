# _quartet-wip — meta artifacts (NOT the runnable system)

Artifacts from **building / auditing / dogfooding the Quartet itself**, kept separate from the real
machinery (the Brain `roles/`, Library `library/`, comms `clacks/`, and working-state `working/`
above). A Quartet **orchestrator does not read these to operate** — they are about *evolving* the
system, not *running* it.

- `quartet-findings.md` — dogfood findings about the **reusable Quartet machinery** (the hand-off
  surface; the operator converts these to work items at critical mass for the ZDX/Quartet stream).
- `repo-findings.md` — dogfood findings about **this deployment's** state/mess (relocation, environment,
  cleanup). Program work, not machinery. (Split from the former merged `findings.md`, 2026-07-01.)
- `audit.md` — build / cutover audit of the Quartet system.
