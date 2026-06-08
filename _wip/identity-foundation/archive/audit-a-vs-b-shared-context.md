# Audit A vs B — shared context (preamble for all three tracks)

**Audience:** the agents executing Tracks 1, 2, and 3 of the A-vs-B directional audit.
**Purpose:** defines the trust hierarchy, the framing, the output conventions, and the rules
that all three tracks share. **Read this before doing anything else.**

---

## 1. The decision we're supporting

The PM is choosing between two v1 launch options for the identity-foundation stream:

- **Option A — full scope.** v1 serves all three consent categories:
  - Category 1: adult (gives own consent)
  - Category 2: minor able to consent (under a regime's digital-consent age; gives own consent under Art 8(1) / COPPA-out)
  - **Category 3: minor not able to consent** (under the digital-consent age; consent flows from a parent/guardian under Art 8(2) / COPPA-under-13)
- **Option B — reduced scope.** v1 serves categories 1 and 2 only. Category 3 is *deferred to v2*
  behind a module-level config flag.

**The decision is gut-feel today.** The PM needs a directional estimate — code-anchored, not
canon-anchored — to support a real ruling. This audit is the input to that ruling.

**Specific ages are NOT the architectural primitive.** The architectural primitive is
**"v1 serves categories 1+2 only; category 3 deferred to v2"** (under option B) or
**"v1 serves all three categories"** (under option A). The specific launch-floor age is a
*parameter*, not a structure. Don't anchor on "11" or "13" as if they were decisions; the
canon has historical references to "11" that are *not* anchored to a documented decision and
the "13+" framing in the fillers walkthrough §I entries is a *launch default*, not the
architectural primitive.

**What "the canon" means in this audit.** "The canon" = the new docs under
`_wip/identity-foundation/`. Specifically: `identity-foundation-prd.md` (especially Part 10
§I), `identity-ontology.md` §R, `domain-model.md`, `ROADMAP.md` (phase structure only — the
open-threads section is stale), the §I ledger entries, and the planned-but-not-yet-written
`data-model.md` + `MMT-ADR-0011` / `MMT-ADR-0012`. The canon is the *target* the v1 build
is supposed to hit. **The canon was written assuming option A.** That bias is the *reason*
this audit exists: we need a code-anchored estimate because the canon cannot give us one.

**"The canon" does NOT mean** the legacy docs (`docs/specs/`, `docs/plans/`, the
pre-execution prose of the 14 sub-audits), the MMT-ADRs as evidence of code behaviour, the
repo-level `docs/architecture.md` / `docs/audience-matrix.md` / `docs/project_context.md`,
or any of the drift suspects in §2.4. Those artefacts are tiered separately in §2 and are
*not* "the canon" for this audit's purposes.

---

## 2. The trust hierarchy (READ THIS CAREFULLY)

There is **significant drift between the code and the documentation.** The agents must
not treat the canon as ground truth. The trust hierarchy for this audit is:

### 2.1 Highest trust — code, tests, migrations

- **Code in `apps/api/`, `apps/mobile/`, `packages/schemas/`, `packages/`.** What the code
  *does* is the most-trustworthy artefact. Cite as `file:line`.
- **Tests.** What the test suite actually exercises. Tests lie less than docs. Cite as
  `file:line` with the test name. A test that exists and runs is high-trust; a test that's
  `it.skip`'d or `it.todo` is medium-trust.
- **Migration files in `apps/api/drizzle/`** (or wherever the schema migrations live).
  The migration history is the most reliable code-history artefact in the repo. Cite as
  `NNNN_<name>.sql:line` or equivalent.

### 2.2 High trust — the 14 sub-audits + `.deepsec/`

- **`docs/audit/2026-05-29-full-audit/`** (14 sub-audits) and **`.deepsec/`** (in the same
  repo). These are *code-anchored* — the findings cite code. They may have been written
  assuming option A; that's a known bias to watch for, but the *findings themselves*
  (which are code-anchored) are high-trust.
- **Notion-bug-verification (2026-05-23) is OUT OF SCOPE.** The PM confirmed earlier that
  the 14 sub-audits in the 2026-05-29 cluster (plus `.deepsec/`) are the in-scope corpus.
  Do not read `docs/audit/2026-05-23-notion-bug-verification/`.

### 2.3 Medium trust — the new canon (the "intended" side)

- **`_wip/identity-foundation/identity-foundation-prd.md`** (especially Part 10 §I).
- **`_wip/identity-foundation/identity-ontology.md` §R.**
- **`_wip/identity-foundation/domain-model.md`.**
- **`_wip/identity-foundation/ROADMAP.md`** (the phase structure is *plan-shaped*, not
  *estimate-shaped*; use for workstream structure only).
- **The §I ledger entries** — including the 11 fillers walkthrough entries pasted 2026-06-04
  and the pre-existing I-A1 / I-PB-B1 entries.

These describe what the *system is supposed to do*. They are the **"intended"** side of
the canon-vs-code delta. They are NOT ground truth. They are *one input* to the audit,
specifically the input that defines the *target*.

### 2.4 Low trust — drift suspects (DO NOT trust as ground truth)

- **Memories in `.claude/memory/`.** Session-spanning, may have drifted, may encode
  decisions that were never made (e.g. the "11" age-floor heritage).
- **`CLAUDE.md` and `AGENTS.md`** at the repo root and at any sub-path. These are auto-
  generated from `.ruler/AGENTS.md` (or hand-maintained, depending on location). They
  describe conventions, not state. **Do not cite as evidence of code behaviour.**
- **Specs in `docs/specs/` and plans in `docs/plans/`** that pre-date the 14 sub-audits.
  These were the *inputs* to the audit, not the *output*. They may have been written
  assuming option A. Use only for context, not as the "intended" side of a delta.
- **Any doc that uses "should" in a normative sense about current code behaviour.**
  "The schema *should* validate the under-13 boundary" is not the same as "the schema
  validates the under-13 boundary." The first is a *target*; the second is a *fact*.
- **The `MMT-ADR-NNNN` decisions in `docs/adr/`.** These are *decisions*, not *state*.
  They tell us what was decided; they don't tell us what the code does. Cite as the
  "decided" side of a delta; not as the "actual" side.
- **The ROADMAP open-threads section.** Known stale — says "11" floor; the actual
  decision is category-taxonomy-based, not age-based. Treat with caution.

### 2.5 The audit's framing rule (HARD CONSTRAINT)

**Every cell in the output table must cite a code file:line, a test file:line, a migration
file:line, or a sub-audit finding ID as the anchor for the "actual" side.** Canon citations
alone are not sufficient for the "actual" column. Canon citations are welcome for the
"intended" column.

If you can't anchor a cell to code, tag the row **confidence: low** and explain why in
the "what would change your mind" column.

---

## 3. The audit's framing — categories, not ages

- **Categories are the architectural primitive.** Cat 1 / Cat 2 / Cat 3 are the structure.
- **Ages are parameters.** The launch-floor age is a config value. The per-jurisdiction
  digital-consent age is a config value. None of them are architectural decisions.
- **The A vs B question is "does v1 serve Cat 3?"** not "what's the launch floor?"
- **The "11" and "13" references in the canon are not decisions.** Don't treat them as such.
  Use them as *historical anchors* if you need to, but the audit's categories are 1/2/3.

---

## 4. Output conventions (all three tracks)

### 4.1 Format

- **Markdown tables.** PM reads tables, not prose.
- **One table per output file.** Long outputs are hard to compare; one table per file.
- **Row per unit of analysis.** Cell-grid = row per canon/audit cell; workstream-estimates =
  row per workstream × layer; layered-cross-check = row per layer × workstream.
- **Columns include confidence tags.** Every row gets `confidence: high | medium | low`.
- **Last column is "what would change your mind."** This is a single-sentence column that
  tells the PM what evidence would shift the row's conclusion. (E.g. "A test that
  exercises the under-13 boundary-crossing in production code.")

### 4.2 Anchoring

- **`file:line` for code.** Always absolute path from repo root.
- **`test_file:line` + test name** for tests.
- **`NNNN_<name>.sql:line`** for migrations.
- **`sub-audit-name/finding-ID`** for sub-audit findings (e.g. `deep-review/security-pii-api/F-3`).
- **`prd.md#section`** or **`prd.md#I-P1`** for canon references.

### 4.3 What "delta" means in this audit

The delta between canon and code has three possible shapes:

- **Canon says X, code does X** → no delta. Row tagged `aligned`.
- **Canon says X, code does Y (or nothing)** → drift. Row tagged `drift: code lacks | code diverges`.
- **Canon silent, code does Z** → undocumented behaviour. Row tagged `undocumented: code-only`.

The A vs B tagging happens *after* the delta is established:

- **`A-only`** — the row's anchor is a cat-3-only surface. Removing it is a B win.
- **`B-only`** — the row's anchor is a cat-1/cat-2 surface that B preserves.
- **`both`** — the row's anchor is shared between A and B. The delta (if any) is the same
  in both options.
- **`A-only-and-undocumented`** — the row is a cat-3 surface that the canon doesn't even
  document. This is a *finding* in its own right; surface it.

### 4.4 The "no canon changes" rule (HARD CONSTRAINT)

**This audit is read-only.** Do not edit any file in `_wip/identity-foundation/`,
`docs/adr/`, `apps/`, `packages/`, `docs/`, or anywhere else. Do not run `pnpm`, `git
commit`, `drizzle-kit`, or any state-changing command. The output is a *new* file in
`_wip/identity-foundation/` whose name starts with `audit-a-vs-b-track-N-result-`
(filled in by the agent). The PM reviews the result; the canon team decides what to do
with it.

### 4.5 What to do if you find something the audit didn't ask for

If you find a finding that doesn't fit the A-vs-B framing (e.g. a security finding that
applies regardless of A or B), record it in a **"out-of-scope findings"** section at the
bottom of the output file. Do not drop it. The PM may want to know.

---

## 5. The workstream structure (for Tracks 2 and 3)

The 14 sub-audits identify six workstreams (the 6 `deep-review/` runs):

1. **architecture** — the system shape, the data model, the cross-service contracts.
2. **agent-instructions** — the agent / harness layer, the system prompts, the boundaries.
3. **errors-api** — the API error handling, the typed error hierarchy, the boundary
   classification.
4. **l10n-a11y-mobile** — the mobile internationalisation and accessibility surface.
5. **security-pii-api** — the API's PII handling, the consent flows, the VPC surface.
6. **security-pii-inngest** — the Inngest function PII handling, the background-job
   consent flows.

The exact number may be 5 (if security-pii-api and security-pii-inngest merge) or 7 (if
a `workflow-N` finding doesn't fit) — the agents should reconcile the count from the
sub-audits themselves. Use the workstream count *as found*, not as assumed.

**The workstreams cut across layers.** Track 3's layered cross-check uses this to its
advantage — a finding can be in `security-pii-api` (workstream) and `API` (layer) and
`LLM trust boundary` (sub-layer).

---

## 6. The cell grid (for Track 1's reference)

Track 1's job is to produce a cell grid with rows for the canon + audit surface and
columns for (canon says, code does, drift, A/B/both, confidence, what would change your
mind). The shared preamble defines the rules; the Track 1 prompt defines the cell set.

A reasonable starting cell set (the agent should expand this, not restrict to it):

- **§I ledger cells:** the 11 fillers walkthrough entries (I-P1 through I-P6, I-L1 through
  I-L5) + I-A1 + I-PB-B1. Each cell is "canon says X; code does Y."
- **Ontology cells:** the age-bracket taxonomy in `identity-ontology.md` §R. Each
  age-bracket is a cell.
- **Domain-model cells:** the schema-level cat-3 surface (parental-rel FK on
  `payer_person_id`, data-minimisation-by-age table, consent-receipt table,
  under-13 boundary event handler). Each is a cell.
- **Sub-audit cells:** the 14 sub-audits' findings, grouped by workstream. Each finding
  is a cell.
- **Audience-matrix cells:** the 8 cells in the `mode × isOwner × hasLinkedChildren ×
  canGiveOwnConsent` grid. Each is a cell.
- **Boundary-crossing matrix cells:** the 9 cells in the `current_category ×
  target_category` grid. Each is a cell.
- **Disclosure-matrix cells:** the rows in the `category × join_event × boundary_event`
  table. Each row is a cell.
- **V0/V1 nav cells:** the V0 production / V1 not-yet-shipped split. Each tab in
  `LEGACY_GUARDIAN_TABS` / `FAMILY_TABS` / `STUDY_TABS` is a cell. The PR-376-style
  half-migration risk is its own cell.

The agent should *expand* the cell set based on what the canon and audits surface, not
restrict to this list. The list is a starting point, not a ceiling.

---

## 7. What the agent must NOT do

- Do not edit any file outside the output `audit-a-vs-b-track-N-result-*.md`.
- Do not commit anything.
- Do not push anything.
- Do not run state-changing commands.
- Do not invoke `/commit` or any other git workflow.
- Do not pre-bake the answer. The audit's job is to *find* the delta, not confirm a
  prior.
- Do not anchor on specific ages ("11," "13," "13+") as architectural decisions. The
  audit's categories are 1/2/3.
- Do not trust memories, CLAUDE.md, AGENTS.md, pre-audit specs, or "should"-language
  docs as evidence of code behaviour. (See §2.4.)
- Do not skip the "what would change your mind" column. It is the most useful column
  for the PM.

---

## 8. The output file naming

- **Track 1:** `audit-a-vs-b-track-1-result-cell-grid.md`
- **Track 2:** `audit-a-vs-b-track-2-result-workstream-estimates.md`
- **Track 3:** `audit-a-vs-b-track-3-result-layered-cross-check.md`

If an agent's output exceeds a single file's reasonable size, it may produce
`audit-a-vs-b-track-N-result-<short-name>.md` (multiple files), but the agent must
declare the file list at the top of the first file.

---

## 9. The sequencing

- **Track 1 must complete first.** Track 2 reads Track 1's output.
- **Track 2 must complete before Track 3.** Track 3 reads Tracks 1 and 2.
- **Tracks 1, 2, 3 can run in parallel only if the agents are working from a frozen
  canon and audit corpus** — which they are, as of the audit's start. But Track 2's
  agent must read Track 1's output, and Track 3's agent must read both. **Sequential
  execution is the safe default.**

---

## 10. The "what would change your mind" column — examples

A few examples to seed the agent's thinking (not to copy verbatim):

- "A test that exercises the under-13 boundary-crossing in production code." (Would
  change the row from `drift: code lacks` to `aligned`.)
- "A migration that adds the parental-rel FK to `payer_person_id`." (Would change the
  row from `A-only-and-undocumented` to `A-only`.)
- "The `decision-adr-link` ratchet failing on a new `docs/specs/` decision block that
  references Cat 3." (Would change the row from `B-only` to `both`.)
- "The PM ruling that Cat 3 is launch-live." (Would change every `A-only` row to
  `B-only` — but the audit's job is to inform the ruling, not to be re-run after it.)
