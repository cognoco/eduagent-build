// audit-a-vs-b-track-1-cell-grid.js
//
// Produces the cell-grid markdown file for Track 1 of the A-vs-B directional audit.
// Reads the canon (in _wip/identity-foundation/) and the 14 sub-audits + .deepsec/,
// produces a single cell-grid table with one row per (cell × canon/code/drift/A-B/confidence/anchors).
// Adversarial-verification pass is targeted at the load-bearing cells (A-only, A-only-and-undocumented, low-confidence).
//
// INVOCATION (in a separate session — the user invokes this, this script does not invoke itself):
//   Workflow({
//     scriptPath: '.claude/workflows/audit-a-vs-b-track-1-cell-grid.js',
//     args: {}  // no args needed; output path is hard-coded below
//   })
//
// OUTPUT: _wip/identity-foundation/audit-a-vs-b-track-1-result-cell-grid.md
//
// READ-ONLY CONTRACT (the activity is an audit, not a fix):
//   - No edits to any file outside the output path above.
//   - No git commit / push; no pnpm; no drizzle-kit; no state-changing commands.
//   - Write only to the output path. Surface findings that don't fit A-vs-B in the
//     "out-of-scope findings" section of the output, do not drop them.

export const meta = {
  name: 'audit-a-vs-b-track-1-cell-grid',
  description:
    'Cell-grid audit (canon vs code, A/B tagged). Fan-out by audit surface, targeted verification on load-bearing cells, synthesize to a single markdown table with summary statistics.',
  phases: [
    { title: 'Fan-out by audit surface' },
    { title: 'Reconciliation + targeted verification' },
    { title: 'Synthesize + write output' },
  ],
};

const OUTPUT_PATH =
  '_wip/identity-foundation/audit-a-vs-b-track-1-result-cell-grid.md';

const CANON_DIR = '_wip/identity-foundation/';
const AUDIT_DIR = 'docs/audit/2026-05-29-full-audit/';
const DEEPSEC_DIR = '.deepsec/';

const SHARED_PREAMBLE = `
AUDIENCE
You are executing Track 1 of the A-vs-B directional audit for the identity-foundation stream.
The PM is choosing between Option A (v1 serves all three consent categories including Cat 3) and
Option B (v1 serves Cat 1+2 only, Cat 3 deferred to v2). You produce the cell-grid evidence base
that Tracks 2 and 3 will read.

TRUST HIERARCHY (read carefully)
1. Highest trust — code in apps/api/, apps/mobile/, packages/schemas/, packages/; tests; migration
   files in apps/api/drizzle/. Cite as file:line.
2. High trust — the 14 sub-audits in ${AUDIT_DIR} and ${DEEPSEC_DIR}. Cite as sub-audit/finding-ID
   (e.g. deep-review/2026-05-30-security-pii-api/F-3).
3. Medium trust — the new canon in ${CANON_DIR} (identity-foundation-prd.md Part 10 §I,
   identity-ontology.md §R, domain-model.md, data-model.md, ROADMAP.md, §I ledger entries, and
   MMT-ADR-0011 / MMT-ADR-0012 in docs/adr/ — all now written). Canon is the "intended" side.
4. Low trust — DO NOT use as ground truth: memories in .claude/memory/, CLAUDE.md / AGENTS.md
   anywhere, pre-audit specs in docs/specs/ and docs/plans/, "should"-language docs, the
   MMT-ADR-* decisions in docs/adr/ (they describe decisions, not state), the ROADMAP open-threads
   section (known stale, says "11" floor — that is residue, not a decision), and any specific age
   ("11", "13", "13+") treated as an architectural decision.

HARD CONSTRAINTS
- Every cell's "actual" side MUST anchor to code (file:line), test (file:line + test name),
  migration (NNNN_<name>.sql:line), or sub-audit finding-ID. Canon citations alone are NOT
  sufficient for the "actual" column. Canon citations are welcome for the "intended" column.
- If you cannot anchor a cell to code, tag the row "confidence: low" and explain in the
  "what would change your mind" column.
- Categories, not ages. The architectural primitive is "v1 serves Cat 1+2 only" vs "v1 serves
  all three". The "11" and "13" references in the canon are NOT decisions — do not anchor on
  them. The audit's categories are 1 / 2 / 3.
- Do not pre-bake the answer. The audit's job is to find the delta, not confirm a prior.
- Do not edit any file outside ${OUTPUT_PATH}. Do not commit or push. Do not run state-changing
  commands.

CELL SCHEMA (every row you emit must conform)
- # (integer, sequential within your slice)
- cellName (short descriptive, e.g. "I-P1: 13+ launch floor", "parental-rel FK on payer_person_id",
  "audience-matrix cell: family × owner × has-children × can-give-consent=no")
- canonSays (the intended behaviour, citing the canon; can be empty for "code-only" cells)
- codeDoes (the actual behaviour, citing code/test/migration/finding-ID; "code lacks" if absent)
- driftType (one of: aligned | drift: code lacks | drift: code diverges | undocumented: code-only | A-only-and-undocumented)
- aBTag (one of: A-only | B-only | both | A-only-and-undocumented)
- confidence (one of: high | medium | low)
- whatWouldChangeYourMind (single sentence; SPECIFIC — name the file/test/migration/finding that would shift the row)
- anchors (comma-separated list of file:line, test:line, migration:line, sub-audit/finding-ID, prd.md#section references)

DRIFT TYPE TAXONOMY (use exactly these strings)
- aligned — canon and code agree
- drift: code lacks — canon specifies behaviour; code does not implement it
- drift: code diverges — canon specifies behaviour; code implements different behaviour
- undocumented: code-only — code implements behaviour; canon does not document it
- A-only-and-undocumented — a special case of undocumented: code-only where the undocumented behaviour is Cat-3-specific (this is a finding in its own right)

A/B TAGGING TAXONOMY (use exactly these strings)
- A-only — the cell is Cat-3-specific. Removing it is a B win.
- B-only — the cell is Cat-1/Cat-2 specific. B preserves it.
- both — the cell is shared between A and B. The drift (if any) is the same in both options.
- A-only-and-undocumented — combines drift type and A/B tag; use this string in the A/B column.

YOUR OUTPUT
- Return a strict JSON object matching the schema passed to StructuredOutput. No prose around it.
- Cover every cell in the cell set assigned to you. If you discover a cell outside your assigned
  surface, list it under "additionalCellsDiscovered" so the reconciliation agent can pick it up.
- For each cell, your "whatWouldChangeYourMind" must be specific — name the file/test/migration/
  finding that, if found, would shift the row. Generic boilerplate ("more investigation needed")
  is rejected.
`;

const CELL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['surface', 'cells', 'additionalCellsDiscovered'],
  properties: {
    surface: { type: 'string' },
    cells: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'cellName',
          'canonSays',
          'codeDoes',
          'driftType',
          'aBTag',
          'confidence',
          'whatWouldChangeYourMind',
          'anchors',
        ],
        properties: {
          cellName: { type: 'string', maxLength: 200 },
          canonSays: { type: 'string', maxLength: 1500 },
          codeDoes: { type: 'string', maxLength: 1500 },
          driftType: {
            type: 'string',
            enum: [
              'aligned',
              'drift: code lacks',
              'drift: code diverges',
              'undocumented: code-only',
              'A-only-and-undocumented',
            ],
          },
          aBTag: {
            type: 'string',
            enum: ['A-only', 'B-only', 'both', 'A-only-and-undocumented'],
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          whatWouldChangeYourMind: { type: 'string', maxLength: 500 },
          anchors: { type: 'string', maxLength: 1000 },
        },
      },
    },
    additionalCellsDiscovered: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

const SURFACES = [
  {
    key: 'sI-ledger',
    prompt: `Read the §I ledger entries in ${CANON_DIR}identity-foundation-prd.md (Part 10 §I).
Specifically produce cells for the 11 fillers walkthrough entries (I-P1 through I-P6, I-L1 through
I-L5), the pre-existing I-A1, and I-PB-B1. Sweep for any other §I entries — the prompt mentions a
2026-06-04 paste of the 11 entries; do not assume that list is exhaustive. For each cell, walk the
canon statement and then anchor the "code does" side in apps/api/, apps/mobile/, packages/schemas/,
and the migrations in apps/api/drizzle/.`,
  },
  {
    key: 'ontology',
    prompt: `Read ${CANON_DIR}identity-ontology.md §R (age-bracket taxonomy) and the canonical
computeAgeBracket function in @eduagent/schemas. Produce one cell per age bracket (Cat 1, Cat 2,
Cat 3) plus a cell for "does the computeAgeBracket function match the taxonomy?". Anchor the
"actual" side to packages/schemas/src/profiles.ts and the migrations that define the bracket
boundaries.`,
  },
  {
    key: 'domain-model',
    prompt: `Read ${CANON_DIR}domain-model.md and ${CANON_DIR}data-model.md (planned but possibly
not yet written — enumerate first). Produce cells for: (a) the parental-rel FK on payer_person_id
(does it exist? type? nullable?), (b) the data-minimisation-by-age table (does it exist? per-
age-tier profiles?), (c) the consent-receipt table (does it exist? what does it store?), (d) the
under-13 boundary event handler (does the code have one?), (e) the birthYearSchema H11 tag in
packages/schemas/src/profiles.ts:38-54 (what does it assert?). Anchor all "actual" side to code
or "code lacks" with explanation.`,
  },
  {
    key: 'sub-audits-architecture',
    prompt: `Read ${AUDIT_DIR}deep-review/2026-05-29-arch-whole-repo/. Produce one cell per finding in the
architecture sub-audit. For each finding, emit cellName="<sub-audit>/<finding-ID>", canonSays="" (or
the canon's relevant claim if one exists), codeDoes="<finding's code-anchored statement>", and
apply the A/B tag based on whether the finding's anchor is Cat-3-specific.`,
  },
  {
    key: 'sub-audits-agent-instructions',
    prompt: `Read ${AUDIT_DIR}deep-review/2026-05-30-agent-instructions/. Produce one cell per finding. Same
schema as the other sub-audit surfaces.`,
  },
  {
    key: 'sub-audits-errors-api',
    prompt: `Read ${AUDIT_DIR}deep-review/2026-05-30-errors-api/. Produce one cell per finding. Same schema.`,
  },
  {
    key: 'sub-audits-l10n-a11y-mobile',
    prompt: `Read ${AUDIT_DIR}deep-review/2026-05-30-l10n-a11y-mobile/. Produce one cell per finding. Same schema.`,
  },
  {
    key: 'sub-audits-security-pii-api',
    prompt: `Read ${AUDIT_DIR}deep-review/2026-05-30-security-pii-api/ and ${DEEPSEC_DIR}. Produce one cell per
finding across both. Same schema.`,
  },
  {
    key: 'sub-audits-security-pii-inngest',
    prompt: `Read ${AUDIT_DIR}deep-review/2026-05-30-security-pii-inngest/. Produce one cell per finding. Same schema.`,
  },
  {
    key: 'audience-matrix',
    prompt: `Read the audience matrix in docs/compliance/audience-matrix.md. Produce 8 cells — the full
mode × isOwner × hasLinkedChildren × canGiveOwnConsent grid. For each cell: "is this cell reachable
at launch under A? Under B? What does the code do?" Anchor the "actual" side to apps/mobile/src/app/
(app)/_layout.tsx:122-185 and apps/mobile/src/app-context.tsx:53-61, 70.`,
  },
  {
    key: 'boundary-crossing',
    prompt: `Produce 9 cells — the full current_category × target_category grid (3x3). For each:
"what does the canon say? what does the code do?" Anchor to the under-13 boundary event handler
(if it exists; otherwise tag "code lacks") and any cross-category transitions in the canon.`,
  },
  {
    key: 'disclosure-matrix',
    prompt: `Produce cells for the rows of the category × join_event × boundary_event table. For
each row: "what disclosure does the canon specify? what does the code emit?" Anchor to the consent
flows in apps/api/src/routes/ and apps/mobile/src/. If the disclosure-matrix table is not yet
defined in the canon, produce a "code-only" cell for each disclosure the code emits that the canon
does not document.`,
  },
  {
    key: 'v0v1-nav',
    prompt: `Read apps/mobile/src/lib/navigation-contract.ts (STUDY_TABS, FAMILY_TABS,
LEGACY_GUARDIAN_TABS) and the V0/V1 helpers in apps/mobile/src/app/(app)/_layout.tsx:122-185.
Produce one cell per tab across the three tab sets, plus a dedicated cell for the
PR-376-style half-migration risk (the "V0/V1/B three-mode risk" cell). For each tab cell: "is this
tab in V0? V1? Both? What's the V0/V1/B risk if we add a B flag without removing the Cat-3 path?"`,
  },
];

phase('Fan-out by audit surface');
const surfaceResults = await parallel(
  SURFACES.map((s) => () =>
    agent(`${SHARED_PREAMBLE}\n\nYOUR ASSIGNED SURFACE (surface key: ${s.key}):\n${s.prompt}`, {
      label: `surface:${s.key}`,
      phase: 'Fan-out by audit surface',
      schema: CELL_SCHEMA,
    }).then((r) => ({ surface: s.key, ...(r || { cells: [], additionalCellsDiscovered: [] }) })),
  ),
);

const allCells = surfaceResults.filter(Boolean).flatMap((r) => r.cells || []);
const additionalDiscovered = surfaceResults
  .filter(Boolean)
  .flatMap((r) => r.additionalCellsDiscovered || []);

// Reconciliation agent: review additionalCellsDiscovered, decide if any should be added,
// and confirm the cell count is in the 30-200 band.
phase('Reconciliation + targeted verification');
const reconciliation = await agent(
  `You are the reconciliation agent for Track 1's cell grid.

SURFACE RESULTS: ${JSON.stringify({ allCells, additionalDiscovered }, null, 0)}

Your job:
1. Confirm the cell count is in the 30-200 band. If <30, the audit is under-scoping; surface
   surfaces that produced suspiciously few cells. If >200, the audit is over-scoping; flag the
   top 3 surfaces to trim.
2. For each entry in additionalDiscovered, decide whether to add it as a new cell. If yes,
   emit a fresh cell row. If no, explain why in one sentence.
3. Filter the cell grid down to the VERIFY SET: cells where aBTag in ('A-only', 'A-only-and-undocumented')
   OR confidence == 'low'. This is the load-bearing set — if any of these is wrong, the
   directional conclusion is wrong. Return them as the verifySet array.
4. If the verifySet has more than 60 cells, split it into batches of 15-20 cells each and
   return as verifyBatches. Otherwise, return a single batch.

OUTPUT a strict JSON object matching the schema.`,
  {
    label: 'reconcile',
    phase: 'Reconciliation + targeted verification',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['cellCountAssessment', 'newCells', 'verifyBatches', 'notes'],
      properties: {
        cellCountAssessment: {
          type: 'object',
          additionalProperties: false,
          required: ['totalCells', 'inBand', 'notes'],
          properties: {
            totalCells: { type: 'integer' },
            inBand: { type: 'boolean' },
            notes: { type: 'string', maxLength: 1000 },
          },
        },
        newCells: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'cellName',
              'canonSays',
              'codeDoes',
              'driftType',
              'aBTag',
              'confidence',
              'whatWouldChangeYourMind',
              'anchors',
            ],
            properties: {
              cellName: { type: 'string', maxLength: 200 },
              canonSays: { type: 'string', maxLength: 1500 },
              codeDoes: { type: 'string', maxLength: 1500 },
              driftType: {
                type: 'string',
                enum: [
                  'aligned',
                  'drift: code lacks',
                  'drift: code diverges',
                  'undocumented: code-only',
                  'A-only-and-undocumented',
                ],
              },
              aBTag: {
                type: 'string',
                enum: ['A-only', 'B-only', 'both', 'A-only-and-undocumented'],
              },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              whatWouldChangeYourMind: { type: 'string', maxLength: 500 },
              anchors: { type: 'string', maxLength: 1000 },
            },
          },
        },
        verifyBatches: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['batchId', 'cellNames'],
            properties: {
              batchId: { type: 'string' },
              cellNames: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        notes: { type: 'string', maxLength: 2000 },
      },
    },
  },
);

const finalCells = [
  ...allCells,
  ...((reconciliation && reconciliation.newCells) || []),
];

const verifyBatches = (reconciliation && reconciliation.verifyBatches) || [];

if (verifyBatches.length === 0) {
  log('verifySet is empty — skipping adversarial verification phase.');
} else {
  const verifyBatchesJson = JSON.stringify(verifyBatches, null, 0);
  const verifyResults = await parallel(
    verifyBatches.map((batch) => () =>
      agent(
        `You are an adversarial verifier for Track 1's cell grid. Your job is to REFUTE
the load-bearing cells. Default to refuted=true if uncertain. The audit's directional
conclusion depends on these cells being right; do not be polite.

BATCH: ${batch.batchId}
CELLS: ${verifyBatchesJson}

For each cell in this batch:
1. Open the file/test/migration/finding the cell's anchors cite.
2. Verify the "code does" claim matches the code. If the anchor is missing or the claim is
   misread, REFUTE.
3. Verify the A/B tag is consistent with the code's actual category-handling. If the code
   treats the cell as both A and B but the tag is "A-only", REFUTE.
4. Verify "whatWouldChangeYourMind" is SPECIFIC — generic boilerplate ("more investigation
   needed") is a refutation.

OUTPUT a strict JSON object matching the schema. For each cell, return verdict
("confirmed" | "refuted" | "demote-to-low"), refutationEvidence (one sentence, specific),
and refinedWhatWouldChangeYourMind (only if you have a more specific version).`,
        {
          label: `verify:${batch.batchId}`,
          phase: 'Reconciliation + targeted verification',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['batchId', 'verdicts'],
            properties: {
              batchId: { type: 'string' },
              verdicts: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['cellName', 'verdict', 'refutationEvidence', 'refinedWhatWouldChangeYourMind'],
                  properties: {
                    cellName: { type: 'string' },
                    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'demote-to-low'] },
                    refutationEvidence: { type: 'string', maxLength: 800 },
                    refinedWhatWouldChangeYourMind: { type: 'string', maxLength: 500 },
                  },
                },
              },
            },
          },
        },
      ).then((r) => r || { batchId: batch.batchId, verdicts: [] }),
    ),
  );

  // Apply verifier outcomes to the cell grid.
  const verdictByCell = new Map();
  for (const batch of verifyResults.filter(Boolean)) {
    for (const v of batch.verdicts || []) {
      verdictByCell.set(v.cellName, v);
    }
  }
  for (const cell of finalCells) {
    const v = verdictByCell.get(cell.cellName);
    if (!v) continue;
    if (v.verdict === 'refuted') {
      cell._refuted = true;
      cell._refutationEvidence = v.refutationEvidence;
    } else if (v.verdict === 'demote-to-low') {
      cell.confidence = 'low';
      cell._refutationEvidence = v.refutationEvidence;
    }
    if (v.refinedWhatWouldChangeYourMind) {
      cell.whatWouldChangeYourMind = v.refinedWhatWouldChangeYourMind;
    }
  }
}

phase('Synthesize + write output');
const summary = await agent(
  `You are the synthesizer for Track 1's cell grid.

CELLS: ${JSON.stringify(finalCells, null, 0)}

Your job: produce the final markdown file content for ${OUTPUT_PATH}.

Structure:
1. A header (audit name, date, one-paragraph framing of A vs B).
2. A "Summary statistics" section with:
   - Total cells
   - Cells by drift type (counts)
   - Cells by A/B tag (counts)
   - Total A-only cells (the B wins)
   - Total A-only-and-undocumented cells (the B wins + findings)
   - High-confidence vs medium vs low counts
3. The main cell-grid table with columns: # | Cell name | Canon says | Code does |
   Drift type | A/B/both | Confidence | What would change your mind | Anchors.
   One row per cell. If a cell was refuted, OMIT it from the main table and list it under
   "Refuted cells" with the refutation evidence.
4. An "Out-of-scope findings" section for cells that don't fit the A-vs-B framing.
5. A "Notes" section flagging cells where the verifier demoted confidence to low, and any
   reconciliation concerns.

Rules:
- The cell count in the summary must match the actual count of rows in the main table.
- The output is pure markdown. No code fences around the whole file.
- This is a long file; that is expected. Do not truncate.
- Read the requirements file carefully: the format must follow the column order and drift
  type / A/B tag taxonomies exactly.

OUTPUT: return the full markdown content as a single string in the field "content".`,
  {
    label: 'synthesize',
    phase: 'Synthesize + write output',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['content'],
      properties: {
        content: { type: 'string' },
      },
    },
  },
);

// NOTE: file writing is done by the caller (main loop) after this workflow returns —
// Write is not an available workflow-script hook. We return the content here.
return {
  outputPath: OUTPUT_PATH,
  content: summary.content,
  totalCells: finalCells.length,
  refutedCount: finalCells.filter((c) => c._refuted).length,
  notes: (reconciliation && reconciliation.notes) || '',
};
