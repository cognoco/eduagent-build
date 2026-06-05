# Track 2 — Workstream-sliced A-vs-B effort estimates

**Audience:** the agent (or workstream leads) executing Track 2 of the A-vs-B
directional audit.
**Reads first:** `audit-a-vs-b-shared-context.md` (the preamble), then
`audit-a-vs-b-track-1-result-cell-grid.md` (Track 1's output — your primary input).
**Output file:** `_wip/identity-foundation/audit-a-vs-b-track-2-result-workstream-estimates.md`

---

## Your job in one sentence

For each of the 6 deep-review workstreams, produce a per-workstream A-vs-B effort
estimate. The estimate is *workstream-complexity* (relative, not in person-weeks).
The PM uses it to decide where the savings are, not just how much.

---

## What you read

### Must read (the inputs)

- `audit-a-vs-b-shared-context.md` — the preamble. Trust hierarchy, framing, output
  conventions, hard constraints.
- `audit-a-vs-b-track-1-result-cell-grid.md` — Track 1's cell grid. **This is your
  primary input.** Your job is to *slice* it by workstream, not to re-walk the canon.
- The 14 sub-audits' per-workstream findings — specifically the `deep-review/`
  sub-audits. Re-read them to anchor your estimates to the workstream's specific
  findings.
- `.deepsec/` — the linked security module.

### May read (for context)

- The canon files (`_wip/identity-foundation/`). Re-read only if Track 1's cell grid
  is incomplete for a workstream. Track 1's grid should be complete enough that you
  don't need to re-walk.

### Do NOT trust (see shared-context §2.4)

- Memories, CLAUDE.md, AGENTS.md, pre-audit specs, "should"-language docs.
- Specific ages as decisions.
- The ROADMAP open-threads section.
- MMT-ADRs as evidence of code behaviour.

---

## The workstream structure

The 6 workstreams from the `deep-review/` runs:

1. **architecture** — the system shape, the data model, the cross-service contracts.
2. **agent-instructions** — the agent / harness layer, the system prompts, the boundaries.
3. **errors-api** — the API error handling, the typed error hierarchy, the boundary
   classification.
4. **l10n-a11y-mobile** — the mobile internationalisation and accessibility surface.
5. **security-pii-api** — the API's PII handling, the consent flows, the VPC surface.
6. **security-pii-inngest** — the Inngest function PII handling, the background-job
   consent flows.

**Reconcile the workstream count from the sub-audits themselves.** The 6-workstream
structure is a starting point; the actual count may be 5 (if security-pii-api and
security-pii-inngest merge cleanly) or 7 (if a `workflow-N` finding doesn't fit). Use
the count *as found*, not as assumed. Document any reconciliation in the output.

**The workstreams cut across layers.** A workstream finding can be in any layer
(canon / schema / API / mobile / LLM / ops). Track 3's layered cross-check uses this.

---

## The output table

Produce a single markdown table with rows for (workstream × layer) and columns for
the A-vs-B estimate. One row per (workstream, layer) pair. The total rows = (workstreams
× layers), where layers = {canon, schema, API, mobile, LLM, ops} (6 layers). For 6
workstreams × 6 layers = 36 rows max. (Many cells will be empty — that's fine; tag
them `n/a`.)

| # | Workstream | Layer | A-effort (relative) | B-effort (relative) | Delta | Where the delta lives | What's preserved | What's deferred (B) | Confidence | What would change your mind | Anchors |

Where:

- **Workstream** — one of the 6 (or 5/7, reconciled).
- **Layer** — one of: `canon`, `schema`, `API`, `mobile`, `LLM`, `ops`.
- **A-effort (relative)** — the effort to *build* this (workstream, layer) cell under
  option A. Use a relative scale, not person-weeks. Suggested scale:
  - `XS` — < 1 day. Trivial.
  - `S` — 1-3 days. Small.
  - `M` — 1 week. Medium.
  - `L` — 2-3 weeks. Large.
  - `XL` — > 1 month. Extra-large.
  - `n/a` — no work in this cell.
- **B-effort (relative)** — same scale, under option B.
- **Delta** — the difference, as a qualitative tag:
  - `B << A` — B saves the bulk of the work.
  - `B < A` — B saves some work.
  - `B = A` — B and A are equivalent in this cell.
  - `B > A` — B has more work (rare; usually a removal cost).
  - `n/a` — no work in either.
- **Where the delta lives** — a one-sentence description of *what specifically* is
  saved (or added) in this cell. E.g. "The under-13 exit event handler is removed;
  the 17→18 transition is unchanged."
- **What's preserved** — what stays in B that was in A. E.g. "Cat 1 / Cat 2 consent
  flows; the data-minimisation cap; the retention floor."
- **What's deferred (B)** — what moves to the v2 reintroduce backlog. E.g. "The
  enumerated VPC method catalog; the under-13 exit event; the parental-disclosure
  artifact."
- **Confidence** — `high | medium | low`. Anchored to Track 1's confidence on the
  cell(s) in this row.
- **What would change your mind** — single sentence.
- **Anchors** — `file:line`, `sub-audit/finding-ID`, `track-1#row-N` references.

---

## The estimation rules (HARD CONSTRAINTS)

1. **Anchor every estimate to Track 1's cell grid.** Every row in your table must
   reference at least one row in Track 1's output. If Track 1's grid is incomplete
   for a workstream, flag it and either (a) go back and add rows to Track 1's grid
   (don't edit Track 1's file — add a new section to your own output listing the
   missing cells), or (b) tag the row `confidence: low` and explain.

2. **No person-weeks.** The PM will game person-weeks. Use the relative scale. The
   *projection* to person-weeks is a *separate* step the PM does, not you.

3. **No pre-baked answers.** If your estimate comes out to "B is 30% faster," check
   that against the cell grid. If 30% of the work is in the front-end consent flow
   and the front-end is mostly unchanged in B, your 30% is wrong. Re-anchor.

4. **Surface cross-workstream effects.** If dropping cat-3 from the schema (workstream
   `architecture`, layer `schema`) doesn't drop the front-end work (workstream
   `l10n-a11y-mobile`, layer `mobile`) because the front-end still has to handle the
   "cat-3 cells exist in the matrix" edge case, *say so* in the row's "where the
   delta lives" column.

5. **Surface the V0/V1/B three-mode risk.** For the (any workstream, `mobile` or
   `API`) rows that touch the V0/V1 nav contract, explicitly call out the
   half-migration risk: "If the B flag is module-level, the cleanup is cheap. If
   the B flag is row-level, we have V0/V1/B."

6. **Separate the v1 launch cost from the v2 reintroduce cost.** The estimate is for
   v1. The v2 reintroduce (if B is chosen) has its own cost. Mention it in the
   "what's deferred" column but don't add it to the delta.

---

## The per-workstream summary

After the main table, produce a per-workstream summary. One section per workstream.

For each workstream:

- **Total A-effort** — sum of the row's A-effort (qualitative, not numeric).
- **Total B-effort** — sum of the row's B-effort.
- **B's wins in this workstream** — list the cells where B << A or B < A.
- **B's losses in this workstream** — list the cells where B > A.
- **Net B impact for this workstream** — one sentence: "B saves the bulk of the
  work in the consent flow; preserves the data-minimisation work; defers the
  under-13 exit event."
- **The workstream lead's confidence** — high / medium / low.

---

## The cross-workstream summary

After the per-workstream summary, produce a cross-workstream summary. **This is the
section the PM reads first.**

- **Where the savings are concentrated** — the (workstream, layer) cells with `B << A`.
- **Where the savings are diffuse** — workstreams where the savings are spread
  across layers.
- **Where there are no savings** — workstreams or layers where B = A.
- **The dominant constraint** — which workstream is the *bottleneck* (i.e. the
  workstream that has to land first for the others to make sense).
- **The half-migration risk** — the (workstream, layer) cells where the V0/V1/B risk
  is highest.
- **The directional answer** — one paragraph: "B saves [qualitative] effort,
  concentrated in [workstream / layer]; the dominant constraint is [workstream]; the
  half-migration risk is [assessment]."

---

## What you produce

- **One file:** `_wip/identity-foundation/audit-a-vs-b-track-2-result-workstream-estimates.md`.
- **One main table** with the columns above.
- **A per-workstream summary** section.
- **A cross-workstream summary** section.
- **A "missing cells from Track 1" section** if Track 1's grid was incomplete.

---

## What you must NOT do

(See shared-context §7 for the full list. The critical ones for Track 2:)

- Do not edit any file outside the output.
- Do not commit or push.
- Do not pre-bake the answer.
- Do not anchor on specific ages as architectural decisions.
- Do not trust memories, CLAUDE.md, AGENTS.md, pre-audit specs.
- Do not use person-weeks. Use the relative scale.
- Do not add the v2 reintroduce cost to the v1 delta. Mention it; don't add it.

---

## The "what would change your mind" column — examples for Track 2

- For a `B << A` row: "A test that exercises the cat-3 path in production code
  (currently dead or test-only)."
- For a `B = A` row: "A canon entry that says the workstream is cat-3-specific."
- For a `B > A` row: "A migration that adds a new cat-3 column that has to be
  removed."
- For the V0/V1/B risk row: "A grep showing that the B config flag would short-
  circuit *all* cat-3 code paths module-level."

---

## How long this should take

- A workstream lead with the right context: **half a day to a day per workstream.**
- A single analyst with the workstream context (but not the lead's depth): **1-2
  days total.**
- The bottleneck is the cross-workstream summary. Get the per-workstream summaries
  done first; the cross-workstream summary is a roll-up.

---

## Hand-off

When you finish, your output file is the input to Track 3. Track 3's agent will
re-slice your workstream estimates by layer and flag any disagreements between the
workstream view and the layer view. Make sure your per-workstream summaries are
*complete enough* for Track 3 to anchor to.
