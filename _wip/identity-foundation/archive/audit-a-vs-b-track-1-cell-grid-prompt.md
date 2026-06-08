# Track 1 — Cell-grid audit (canon vs code, A/B tagged)

**Audience:** the agent executing Track 1 of the A-vs-B directional audit.
**Reads first:** `audit-a-vs-b-shared-context.md` (the preamble — trust hierarchy, framing,
output conventions, hard constraints).
**Output file:** `_wip/identity-foundation/audit-a-vs-b-track-1-result-cell-grid.md`

---

## Your job in one sentence

Walk the canon (`_wip/identity-foundation/`) and the 14 sub-audits + `.deepsec/`, and for
every cell in the cell grid produce a row with: **canon says**, **code does**, **drift
type**, **A/B/both**, **confidence**, **what would change your mind**, and the
**anchors** (code `file:line` for the "actual" side, canon `prd.md#section` for the
"intended" side, sub-audit `finding-ID` where applicable).

The output is a *directional audit*, not a precise estimate. The PM uses it to decide
whether to invest in a more accurate estimation or act on the directional result.

---

## What you read

### Must read (the canon — "intended" side)

- `_wip/identity-foundation/identity-foundation-prd.md` — focus on Part 10 §I.
  - The 11 fillers walkthrough entries (I-P1 through I-P6, I-L1 through I-L5), pasted 2026-06-04.
  - The pre-existing I-A1 (per-purpose disclosure & helper-grant consent) entry.
  - The I-PB-B1 ("no legal usage floor") entry from the 2026-06-03 counsel walkthrough.
  - Any other §I entries you find. **Do a sweep** — there may be entries I haven't enumerated.
- `_wip/identity-foundation/identity-ontology.md` §R — the age-bracket taxonomy.
- `_wip/identity-foundation/domain-model.md` — the data model.
- `_wip/identity-foundation/ROADMAP.md` — the phase structure (use for workstream structure only;
  do not trust the open-threads section as ground truth).

### Must read (the audits — code-anchored)

- `docs/audit/2026-05-29-full-audit/` — the 14 sub-audits. Specifically:
  - `deep-review/` — 6 runs (architecture, agent-instructions, errors-api, l10n-a11y-mobile,
    security-pii-api, security-pii-inngest). These are the *primary* code-anchored inputs.
  - `workflow-1/`, `workflow-2/`, `workflow-3/`, `workflow-4/` — the workflow runs. Workflow-3
    is an inventory; workflow-4 is recommendations (meta-outputs). Workflow-1 and workflow-2
    contain findings.
  - Root-level files including `deepsec-handover.md`.
- **`.deepsec/`** — the linked security module in the same repo.

### Must read (the code — the "actual" side)

The cells you produce must be anchored to code. Read:

- `apps/api/` — focus on:
  - `apps/api/src/services/safe-non-core.ts`
  - `apps/api/src/services/llm/envelope.ts`
  - `apps/api/src/services/challenge-round/note-draft.ts`
  - `apps/api/src/services/consent/` (if it exists; enumerate first)
  - `apps/api/src/services/` more broadly (sweep for consent / VPC / age-related files)
  - The API route handlers in `apps/api/src/routes/` — sweep for age-gated or consent-gated
    handlers
- `apps/mobile/` — focus on:
  - `apps/mobile/src/app/(app)/_layout.tsx:122-185` — the V0 helpers
  - `apps/mobile/src/lib/navigation-contract.ts` — `STUDY_TABS`, `FAMILY_TABS`,
    `LEGACY_GUARDIAN_TABS`
  - `apps/mobile/src/app-context.tsx:53-61, 70` — the V0-off short-circuits
  - `apps/mobile/src/app/(app)/learner/LearnerScreen.tsx` — the `showParentHome` branch
  - The "More" tab screens in `apps/mobile/src/app/(app)/more/` (especially `account.tsx`
    and `privacy.tsx`)
- `packages/schemas/` — focus on:
  - `packages/schemas/src/profiles.ts:38-54` — `birthYearSchema` + the `H11` tag
  - `packages/schemas/src/profiles.ts:10` — `conversationLanguageSchema`
  - The age-bracket function `computeAgeBracket` (canonical, in `@eduagent/schemas`)
  - Sweep for other age-related schemas
- `apps/api/drizzle/` (or wherever the schema migrations live) — the migration history

### Do NOT trust (see shared-context §2.4)

- Memories, CLAUDE.md, AGENTS.md, pre-audit specs, "should"-language docs.
- The "11" and "13" ages as decisions. Categories are 1/2/3.
- The ROADMAP open-threads section.
- The MMT-ADR decisions as evidence of code behaviour (they're evidence of *decisions*, not
  *state*).

---

## The cell grid (your output)

Produce a single markdown table. Columns:

| # | Cell name | Canon says | Code does | Drift type | A/B/both | Confidence | What would change your mind | Anchors |

Where:

- **Cell name** — short, descriptive. E.g. "I-P1: 13+ launch floor", "parental-rel FK on
  `payer_person_id`", "audience-matrix cell: family × owner × has-children × can-give-consent=no".
- **Canon says** — the *intended* behaviour, citing the canon.
- **Code does** — the *actual* behaviour, citing the code (file:line) or the audits
  (finding-ID). If the code does nothing, write "code lacks" and explain in the
  anchors.
- **Drift type** — one of: `aligned`, `drift: code lacks`, `drift: code diverges`,
  `undocumented: code-only`, `A-only-and-undocumented`.
- **A/B/both** — one of: `A-only`, `B-only`, `both`, `A-only-and-undocumented` (combines
  drift type and A/B tag for the "canon silent, code does cat-3 surface" case).
- **Confidence** — `high | medium | low`. High = code-anchored and cross-validated; medium
  = code-anchored but inferred; low = inferred from canon/audits without code cross-check.
- **What would change your mind** — a single sentence describing the evidence that
  would shift the row's conclusion.
- **Anchors** — a comma-separated list of `file:line`, `test:line`, `migration:line`,
  `sub-audit/finding-ID`, `prd.md#section` references.

### The cell set (starting point — expand, don't restrict)

You should produce rows for AT LEAST the following cells. Expand the set as you find more.

**§I ledger cells (the 13 known entries):**
1. I-P1: 13+ launch floor
2. I-P2: IARC 9+ band
3. I-P3: per-program applicability at 13+
4. I-P4: Kids Category posture
5. I-P5: joining-teen double-charge disclosure + 14-day grace
6. I-P6: `payer_person_id` = store-account-holder
7. I-L1: retention periods
8. I-L2: dormancy + notice
9. I-L3: moved-country grace 30 days
10. I-L4: boundary-crossing verification
11. I-L5: co-guardian one-of / one-of-plus-notice
12. I-A1: per-purpose disclosure & helper-grant consent
13. I-PB-B1: no legal usage floor

**Ontology cells:**
14. The age-bracket taxonomy (one cell per bracket — Cat 1, Cat 2, Cat 3)
15. The `computeAgeBracket` function (does it match the taxonomy?)

**Domain-model cells:**
16. `payer_person_id` parental-rel FK (does it exist? what's its type?)
17. Data-minimisation-by-age table (does it exist? per-age-tier profiles?)
18. Consent-receipt table (does it exist? what does it store?)
19. Under-13 boundary event handler (does the code have one?)
20. The `birthYearSchema` `H11` tag (what does it assert?)

**Sub-audit cells (one per finding):**
21+. Every finding in the 14 sub-audits. Group by workstream. Each finding is a cell.

**Audience-matrix cells (8 cells):**
~29. The full `mode × isOwner × hasLinkedChildren × canGiveOwnConsent` grid. For each
cell, answer: "is this cell reachable at launch under A? Under B? What does the code
do in this cell?"

**Boundary-crossing matrix cells (9 cells):**
~38. The full `current_category × target_category` grid. For each cell: "what does the
canon say? What does the code do?"

**Disclosure-matrix cells:**
~44. The rows of the `category × join_event × boundary_event` table. For each row:
"what disclosure does the canon specify? What does the code emit?"

**V0/V1 nav cells:**
~50. The tabs in `LEGACY_GUARDIAN_TABS` / `FAMILY_TABS` / `STUDY_TABS`. For each tab:
"is this tab in V0? V1? Both? What's the V0/V1/B risk if we add a B flag without
removing the cat-3 path?"

**V0/V1/B three-mode risk cell:**
51. The half-migration risk itself. "If we add a B flag without removing the cat-3
code paths, do we have V0/V1/B? What's the cleanup cost?"

**Out-of-scope findings (at the bottom, not in the main table):**
- Any finding that doesn't fit the A-vs-B framing. Record it; do not drop it.

---

## The drift type taxonomy (use exactly these strings)

- `aligned` — canon and code agree.
- `drift: code lacks` — canon specifies behaviour; code does not implement it.
- `drift: code diverges` — canon specifies behaviour; code implements *different*
  behaviour.
- `undocumented: code-only` — code implements behaviour; canon does not document it.
- `A-only-and-undocumented` — a special case of `undocumented: code-only` where the
  undocumented behaviour is cat-3-specific. This is a *finding* in its own right;
  surface it.

---

## The A/B tagging taxonomy (use exactly these strings)

- `A-only` — the cell is cat-3-specific. Removing it is a B win.
- `B-only` — the cell is cat-1/cat-2 specific. B preserves it.
- `both` — the cell is shared between A and B. The drift (if any) is the same in both
  options.
- `A-only-and-undocumented` — the cell is cat-3-specific AND the canon doesn't document
  it. (This combines the drift type and the A/B tag; use this *string* in the
  A/B/both column.)

---

## What you produce

- **One file:** `_wip/identity-foundation/audit-a-vs-b-track-1-result-cell-grid.md`.
- **One main table** with the columns above.
- **An "out-of-scope findings" section** at the bottom for findings that don't fit the
  A-vs-B framing.
- **A "summary statistics" section** at the top with:
  - Total cells.
  - Cells by drift type.
  - Cells by A/B tag.
  - Total `A-only` cells (the *B wins*).
  - Total `A-only-and-undocumented` cells (the *B wins + findings*).
  - High-confidence cells vs medium vs low.

If the output is too large for a single file, split into
`audit-a-vs-b-track-1-result-cell-grid-<short-name>.md` files and declare the file
list at the top of the first file.

---

## What you must NOT do

(See shared-context §7 for the full list. The critical ones for Track 1:)

- Do not edit any file outside the output.
- Do not commit or push.
- Do not pre-bake the answer.
- Do not anchor on specific ages as architectural decisions.
- Do not trust memories, CLAUDE.md, AGENTS.md, pre-audit specs.
- Do not skip the "what would change your mind" column.

---

## The "what would change your mind" column — examples for Track 1

- For an `A-only` cell with `drift: code lacks`: "A migration adding the cat-3 column
  to the relevant table, with a passing test that exercises it."
- For an `aligned` cell: "A test that exercises the behaviour in production code
  (currently only asserted via type)."
- For a `B-only` cell with `undocumented: code-only`: "A canon entry in §I that
  documents the behaviour, or a code change that removes it (since B doesn't need
  it)."
- For the V0/V1/B three-mode risk cell: "A grep showing that the B config flag would
  short-circuit *all* cat-3 code paths module-level, not row-level."

---

## How long this should take

- A focused agent with the right tooling: **half a day to a day.**
- The cell set is the bottleneck. If the agent is producing <30 rows, it's probably
  under-scoping. If it's producing >200 rows, it's probably over-scoping — focus on
  the cells that are most likely to differ between A and B.

---

## Hand-off

When you finish, your output file is the input to Track 2. Track 2's agent will read
your cell grid and produce per-workstream A-vs-B estimates. Make sure the cell grid
is *complete enough* for Track 2 to anchor to — Track 2 should not have to re-walk
the canon.
