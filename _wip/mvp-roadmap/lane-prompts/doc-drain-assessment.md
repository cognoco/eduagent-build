# Brief — Documentation-drain assessment (WS-36 → MVP-refinement relevance)

**Role:** researcher-type agent, **strictly read-only** — no Cosmo writes, no repo edits beyond
the single output file. Commissioned by the operator (2026-07-22 PM roadmapping sitting).
**Runtime home:** a fresh session rooted in `~/nexus` (needs both the nexus repo and the
`_dev/eduagent-build` checkout).

## The problem, in one paragraph

MentoMate's MVP pipeline is refinement-constrained: ~106 of 213 MVP work items still need
acceptance criteria written before any agent can build them. Refiners derive ACs from the repo's
canonical documentation — and parts of that canon are known-stale (legacy Omni-era and pre-V2
docs). The observed failure mode is real and recurring: ACs derived from legacy documentation
that collapse when the rubber hits the road (recent expensive instance: mentor-notice was built
from an un-ratified draft spec and now carries a 7-point remediation list). A parked lane —
**WS-36 "Stream 2 — Estate-Canon Drain"** (18 open items) — exists to migrate/refresh exactly this
documentation, but it is estate housekeeping and currently OFF the MVP roadmap. The question:
**which parts of the drain, if done early, would materially improve the quality of the remaining
MVP refinement — and which parts can safely stay parked?**

## Inputs (read these)

1. The 18 open WS-36 items — Cosmo Workstream "Stream 2 — Estate-Canon Drain"
   (page `…see Workstreams DB, WS-36`), Work Items DB `36fd1119-9955-4684-8bfe-deb145e6a21f`,
   filter `Workstream contains WS-36`. Read each item's description + linked doc paths.
2. The MVP backlog needing refinement, by lane (the demand side): the per-lane table in
   `_dev/eduagent-build/_wip/mvp-roadmap/2026-07-22-mvp-sequencing-draft.md` §3. Refinement
   order: **Supporter & Linking (WS-32) first** — incl. the new jurisdiction-consent cluster
   (WI-2532/2533/2534/2535) — then **Core Learning Loop (WS-46)**, then the rest.
3. The canonical-doc map: `_dev/eduagent-build/docs/INDEX.md`, `docs/architecture.md`,
   `docs/project_context.md`, `docs/canon/**` (esp. `docs/canon/identity/`), plus
   `docs/_archive/**` for what has already been superseded.
4. Known staleness signals: `git log` on the doc paths each drain item names (last-touched vs.
   the code it describes), and any `docs/specs`/`docs/plans` with contradicted status headers.

## Method

For each of the 18 drain items:
1. Identify the **doc surface** it would migrate/refresh (paths).
2. Map that surface to the **upcoming refinement demand**: which of the unrefined MVP items
   (by lane, WS-32 and WS-46 weighted highest) would a refiner plausibly consult that surface
   for? Cite the WI-IDs.
3. Score **corruption risk** if left stale: HIGH (stale content will actively mislead ACs — says
   things the code no longer does), MEDIUM (incomplete; refiner must fall back to code-reading),
   LOW (irrelevant to remaining MVP work, or purely archival).
4. Estimate **effort class** (S/M/L) for the drain item itself.

Do not trust item descriptions alone — spot-check the actual docs against the actual code for at
least every HIGH candidate. An empty/clean-looking doc is a claim about your query, not the world.

## Output (the only file you write)

`_dev/eduagent-build/_wip/mvp-roadmap/2026-07-XX-doc-drain-assessment.md` containing:

1. **Split proposal** — three lists with one-line rationales:
   - **Accelerate into MVP** (HIGH risk × touches WS-32/WS-46 refinement × effort S/M): propose
     sequencing *ahead of* the refinement wave.
   - **Do opportunistically** (MEDIUM): pick-list, no scheduling.
   - **Stay parked** (LOW): remain estate-track, untouched.
2. **Per-item evidence table**: drain WI → doc paths → dependent MVP WIs → risk → effort → bucket.
3. **Gaps found along the way** that no drain item covers (stale doc, no owner) — list only;
   do NOT capture new work items (the PM will).
4. **Confidence + what you did not check.**

## Boundaries

- Read-only on Cosmo and the repo (output file excepted). No item edits, no claims, no closes.
- No doc rewriting — this is an assessment, not the drain itself.
- Recommendations are input to an operator ruling; nothing you write is self-executing.
- If you find something alarming outside scope (e.g. a doc actively lying about a security
  behavior), note it in §3 of the output and stop there.
