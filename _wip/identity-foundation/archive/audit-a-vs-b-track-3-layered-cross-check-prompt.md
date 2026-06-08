# Track 3 — Layered cross-check (re-slice Tracks 1 and 2 by layer)

**Audience:** the agent executing Track 3 of the A-vs-B directional audit.
**Reads first:** `audit-a-vs-b-shared-context.md` (the preamble), then
`audit-a-vs-b-track-1-result-cell-grid.md` (Track 1's output), then
`audit-a-vs-b-track-2-result-workstream-estimates.md` (Track 2's output).
**Output file:** `_wip/identity-foundation/audit-a-vs-b-track-3-result-layered-cross-check.md`

---

## Your job in one sentence

Re-slice Track 1's cell grid and Track 2's workstream estimates *by layer*
(canon / schema / API / mobile / LLM / ops) instead of by workstream. Flag any
disagreements between the workstream view and the layer view. The PM uses this
to answer "where in the stack are the savings?"

---

## What you read

### Must read (the inputs)

- `audit-a-vs-b-shared-context.md` — the preamble. Trust hierarchy, framing, output
  conventions, hard constraints.
- `audit-a-vs-b-track-1-result-cell-grid.md` — Track 1's cell grid. The
  workstream-agnostic view.
- `audit-a-vs-b-track-2-result-workstream-estimates.md` — Track 2's per-workstream
  estimates. The workstream-sliced view.

### May read (for context)

- The 14 sub-audits + `.deepsec/` if Track 1 or 2 is incomplete.
- The canon files (`_wip/identity-foundation/`) for the same reason.

### Do NOT trust (see shared-context §2.4)

- Memories, CLAUDE.md, AGENTS.md, pre-audit specs, "should"-language docs.
- Specific ages as decisions.
- The ROADMAP open-threads section.
- MMT-ADRs as evidence of code behaviour.

---

## The layer set

The 6 layers:

1. **canon** — `_wip/identity-foundation/` artefacts (PRD, ontology, domain model,
   ROADMAP).
2. **schema** — `packages/schemas/`, migrations in `apps/api/drizzle/`, the
   `birthYearSchema` and related types.
3. **API** — `apps/api/src/routes/`, `apps/api/src/services/` (excluding LLM-specific
   services).
4. **mobile** — `apps/mobile/src/app/`, `apps/mobile/src/lib/`, the navigation contract
   and the V0/V1 helpers.
5. **LLM** — `apps/api/src/services/llm/`, the envelope, the safe-non-core dispatcher,
   the challenge-round services. (This is the *LLM trust boundary* layer; it's
   distinct from `API` because LLM responses drive state-machine decisions.)
6. **ops** — Inngest functions, background jobs, retention/deletion, dormancy
   handling.

**Reconcile the layer set from the cell grid and the workstream estimates.** The
6-layer structure is a starting point. If the agents surface a layer not in the
list (e.g. `agent-instructions` as a layer, not a workstream), add it. Document any
reconciliation in the output.

**Layers cut across workstreams.** A single finding can be in (workstream
`security-pii-api`, layer `API`) and (workstream `security-pii-inngest`, layer
`ops`). The cross-check is the *re-slice*, not a new analysis.

---

## The output table

Produce a single markdown table with rows for (layer × workstream) and columns for
the cross-check. The total rows = (layers × workstreams) = 6 × 6 = 36 max. Many
cells will be empty — tag them `n/a`.

| # | Layer | Workstream | Cells in this (layer, workstream) cell | A-effort | B-effort | Delta | Cross-check verdict | Confidence | What would change your mind | Anchors |

Where:

- **Layer** — one of: `canon`, `schema`, `API`, `mobile`, `LLM`, `ops`.
- **Workstream** — one of the 6 (or 5/7, reconciled).
- **Cells in this (layer, workstream) cell** — the count of cells from Track 1's grid
  that fall in this (layer, workstream) pair. (E.g. 4 cells from Track 1 are in
  (workstream `architecture`, layer `schema`).)
- **A-effort** — the A-effort from Track 2 for this (layer, workstream) pair. Use
  Track 2's relative scale.
- **B-effort** — the B-effort from Track 2.
- **Delta** — the delta from Track 2.
- **Cross-check verdict** — one of:
  - `aligned` — Track 1 and Track 2 agree on this cell.
  - `workstream-concentrated` — Track 2 says the savings are concentrated in this
    workstream; Track 1 says the workstream is the dominant constraint.
  - `layer-diffuse` — Track 2 says the savings are spread across layers; Track 1 says
    the workstream cuts across layers.
  - `disagreement` — Track 1 and Track 2 disagree on the cell's A/B tag, drift type,
    or confidence. Explain in the anchors.
  - `n/a` — no work in this cell.
- **Confidence** — `high | medium | low`. Generally lower than Track 2's confidence
  because this is a re-slice.
- **What would change your mind** — single sentence.
- **Anchors** — `track-1#row-N`, `track-2#row-N`, `file:line`, `sub-audit/finding-ID`
  references.

---

## The per-layer summary

After the main table, produce a per-layer summary. One section per layer.

For each layer:

- **Total A-effort** — sum of the row's A-effort (qualitative, not numeric).
- **Total B-effort** — sum of the row's B-effort.
- **B's wins in this layer** — the (layer, workstream) cells where B << A or B < A.
- **B's losses in this layer** — the cells where B > A.
- **Net B impact for this layer** — one sentence: "B saves the bulk of the work in
  the schema layer (3 cells); preserves the API layer (no work in this cell);
  defers the LLM layer (2 cells)."
- **Layer's confidence** — high / medium / low.

---

## The cross-layer summary

After the per-layer summary, produce a cross-layer summary. **This is the section
the PM reads first.**

- **Where the savings are concentrated by layer** — the layers with the most `B << A`
  cells.
- **Where the savings are concentrated by workstream** — the workstreams with the
  most `B << A` cells. (Compare this to Track 2's "where the savings are
  concentrated" — if they disagree, flag it.)
- **The cross-cutting constraints** — the cells where the workstream view and the
  layer view disagree.
- **The half-migration risk by layer** — the layers where the V0/V1/B risk is
  highest. (Compare this to Track 2's "half-migration risk" — if they disagree,
  flag it.)
- **The directional answer** — one paragraph: "B saves [qualitative] effort,
  concentrated in [layer] (specifically [workstream] within that layer); the
  dominant constraint is [layer/workstream]; the half-migration risk is
  [assessment]."

---

## The disagreement log

If Track 1 and Track 2 disagree on any (layer, workstream) cell, log it in a
**"disagreement log"** section. For each disagreement:

- **The cell** — (layer, workstream).
- **Track 1's view** — what Track 1's cell grid says.
- **Track 2's view** — what Track 2's per-workstream estimate says.
- **The likely cause** — your best guess at why they disagree.
- **The resolution** — your call: which is more likely correct, and why.
- **What would resolve it definitively** — the evidence that would settle the
  disagreement.

This is the *most useful* section of Track 3's output. The PM uses it to decide
whether to invest in a more accurate estimation.

---

## What you produce

- **One file:** `_wip/identity-foundation/audit-a-vs-b-track-3-result-layered-cross-check.md`.
- **One main table** with the columns above.
- **A per-layer summary** section.
- **A cross-layer summary** section.
- **A "disagreement log"** section.

---

## What you must NOT do

(See shared-context §7 for the full list. The critical ones for Track 3:)

- Do not edit any file outside the output.
- Do not commit or push.
- Do not pre-bake the answer.
- Do not anchor on specific ages as architectural decisions.
- Do not trust memories, CLAUDE.md, AGENTS.md, pre-audit specs.
- Do not use person-weeks. Use the relative scale.
- Do not re-walk the canon. Re-slice Tracks 1 and 2's outputs.

---

## The "what would change your mind" column — examples for Track 3

- For a `disagreement` row: "A direct read of the code at the (layer, workstream)
  cell's anchor that resolves whether the cell is cat-3-specific or shared."
- For a `workstream-concentrated` row: "A test that exercises the workstream's
  cat-3 path in production code (currently dead or test-only)."
- For a `layer-diffuse` row: "A canon entry that says the layer is cat-3-specific
  and concentrated in a single workstream."
- For a V0/V1/B risk row: "A grep showing that the B config flag would short-
  circuit *all* cat-3 code paths module-level, not row-level."

---

## How long this should take

- A focused agent with the right tooling: **half a day to a day.**
- The bottleneck is the disagreement log. Get the per-layer summaries done first;
  the disagreement log is a roll-up.
- Track 3 is the *cheapest* of the three tracks. If it's taking longer than Track 1
  or Track 2, the inputs are probably incomplete — flag it and surface to the PM.

---

## Hand-off

When you finish, your output file is the *final* audit artefact. The PM reads:

1. Track 3's cross-layer summary.
2. Track 3's disagreement log.
3. Track 2's cross-workstream summary.
4. Track 1's summary statistics.

The PM uses these to decide:
- Is the result "black or white" (act on it)? Or "grey" (invest in a more accurate
  estimation)?
- If grey, what would nudge the result close to an edge?

The audit's job is done at this point. The PM rules; the canon team acts.
