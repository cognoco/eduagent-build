// audit-a-vs-b-track-2-workstream-estimates.js
//
// Produces the per-workstream A-vs-B effort estimates for Track 2.
// Reads Track 1's cell grid (the atomic evidence base) and slices it by (workstream × layer)
// with a relative effort tag (A vs B) for each cell.
//
// INVOCATION (in a separate session, after Track 1's output is reviewed):
//   Workflow({
//     scriptPath: '.claude/workflows/audit-a-vs-b-track-2-workstream-estimates.js',
//     args: { track1Path: '_wip/identity-foundation/audit-a-vs-b-track-1-result-cell-grid.md' }
//   })
//
// OUTPUT: _wip/identity-foundation/audit-a-vs-b-track-2-result-workstream-estimates.md
//
// READ-ONLY CONTRACT: same as Track 1. No edits outside the output path. No git, no pnpm,
// no state-changing commands.

export const meta = {
  name: 'audit-a-vs-b-track-2-workstream-estimates',
  description:
    'Per-workstream A-vs-B effort estimates. Reads Track 1\'s cell grid, slices by (workstream × layer), applies relative effort tags (A vs B) and delta. Includes internal-consistency pass to prevent pre-baked answers.',
  phases: [
    { title: 'Fan-out by workstream + internal-consistency pass' },
    { title: 'Cross-workstream synthesis + write output' },
  ],
};

const OUTPUT_PATH =
  '_wip/identity-foundation/audit-a-vs-b-track-2-result-workstream-estimates.md';
const TRACK1_PATH_DEFAULT =
  '_wip/identity-foundation/audit-a-vs-b-track-1-result-cell-grid.md';

const TRACK1_PATH = args?.track1Path || TRACK1_PATH_DEFAULT;
if (!TRACK1_PATH) {
  throw new Error(
    'audit-a-vs-b-track-2: pass args.track1Path (path to Track 1\'s cell grid markdown).',
  );
}

const CANON_DIR = '_wip/identity-foundation/';
const AUDIT_DIR = 'docs/audit/2026-05-29-full-audit/';
const DEEPSEC_DIR = '.deepsec/';

const SHARED_PREAMBLE = `
AUDIENCE
You are executing Track 2 of the A-vs-B directional audit. The PM is choosing between Option A
(v1 serves all three consent categories including Cat 3) and Option B (v1 serves Cat 1+2 only,
Cat 3 deferred to v2). You produce per-workstream effort estimates that the PM uses to see WHERE
the savings are, not just how much.

INPUTS
- Track 1's cell grid at ${TRACK1_PATH}. This is your primary input. Re-walking the canon is
  only needed if Track 1's grid is incomplete for a workstream — and if so, FLAG it in the
  "missing cells from Track 1" section, do not silently re-walk.
- The 14 sub-audits in ${AUDIT_DIR} and ${DEEPSEC_DIR} for re-reading the per-workstream findings.

TRUST HIERARCHY (same as Track 1)
1. Highest trust — code, tests, migrations.
2. High trust — the 14 sub-audits + .deepsec/.
3. Medium trust — the new canon in ${CANON_DIR}.
4. Low trust — memories, CLAUDE.md / AGENTS.md, pre-audit specs, "should"-language docs, the
   MMT-ADR-* decisions (those describe decisions, not state), specific ages as decisions, the
   ROADMAP open-threads section.

HARD CONSTRAINTS
- Anchor every row in your output table to at least one row in Track 1's cell grid. If Track 1
  is incomplete for a workstream, list the missing cells in a "missing cells from Track 1"
  section — do not silently re-walk the canon in this track.
- NO person-weeks. Use the relative scale below. The PM will game person-weeks; the projection
  to person-weeks is a separate step the PM does, not you.
- NO pre-baked answers. After you produce your table, do an internal-consistency pass: for
  every "B << A" cell, verify it against Track 1's anchors. If 30% of the work is in the
  front-end consent flow and the front-end is mostly unchanged in B, your 30% is wrong. Re-anchor.
- Surface cross-workstream effects. If dropping Cat-3 from the schema (workstream architecture,
  layer schema) doesn't drop the front-end work (workstream l10n-a11y-mobile, layer mobile)
  because the front-end still has to handle the "Cat-3 cells exist in the matrix" edge case,
  say so in the row's "where the delta lives" column.
- Surface the V0/V1/B three-mode risk. For (any workstream, mobile or API) rows that touch the
  V0/V1 nav contract, explicitly call out the half-migration risk.
- Separate v1 launch cost from v2 reintroduce cost. The estimate is for v1. The v2 reintroduce
  has its own cost — mention it in "what's deferred (B)" but do NOT add it to the v1 delta.
- Do not edit any file outside ${OUTPUT_PATH}. Do not commit or push. Do not run state-changing
  commands.

WORKSTREAMS (reconcile from Track 1's grid; the count may be 5/6/7)
1. architecture — system shape, data model, cross-service contracts
2. agent-instructions — agent / harness layer, system prompts, boundaries
3. errors-api — API error handling, typed error hierarchy, boundary classification
4. l10n-a11y-mobile — mobile internationalisation and accessibility surface
5. security-pii-api — API PII handling, consent flows, VPC surface
6. security-pii-inngest — Inngest function PII handling, background-job consent flows

LAYERS (the 6 layers, each cell uses one of these)
1. canon — _wip/identity-foundation/ artefacts
2. schema — packages/schemas/, migrations in apps/api/drizzle/
3. API — apps/api/src/routes/, apps/api/src/services/ (excluding LLM-specific services)
4. mobile — apps/mobile/src/app/, apps/mobile/src/lib/, navigation contract, V0/V1 helpers
5. LLM — apps/api/src/services/llm/, the envelope, safe-non-core dispatcher, challenge-round services
6. ops — Inngest functions, background jobs, retention/deletion, dormancy handling

RELATIVE EFFORT SCALE (use exactly these strings)
- XS — < 1 day. Trivial.
- S — 1-3 days. Small.
- M — 1 week. Medium.
- L — 2-3 weeks. Large.
- XL — > 1 month. Extra-large.
- n/a — no work in this cell.

DELTA TAXONOMY (use exactly these strings)
- B << A — B saves the bulk of the work
- B < A — B saves some work
- B = A — B and A are equivalent in this cell
- B > A — B has more work (rare; usually a removal cost)
- n/a — no work in either

ROW SCHEMA (every row you emit must conform)
- # (integer, sequential)
- workstream (one of the 6)
- layer (one of: canon | schema | API | mobile | LLM | ops)
- aEffort (XS | S | M | L | XL | n/a)
- bEffort (same scale)
- delta (B << A | B < A | B = A | B > A | n/a)
- whereTheDeltaLives (one sentence: what specifically is saved or added)
- whatsPreserved (what stays in B that was in A)
- whatsDeferredB (what moves to the v2 reintroduce backlog; mention v2 cost, do not add to delta)
- confidence (high | medium | low; usually inherited from Track 1's cell confidence)
- whatWouldChangeYourMind (single sentence, specific)
- anchors (comma-separated list of track-1#row-N, sub-audit/finding-ID, file:line references)

YOUR OUTPUT
- Return a strict JSON object matching the schema passed to StructuredOutput. No prose around it.
- Many (workstream, layer) cells will be empty — tag them n/a for both effort and delta.
- Your internal-consistency-pass verdicts (one per B << A row) go in the consistencyChecks array.
`;

const WORKSTREAM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['workstream', 'rows', 'consistencyChecks', 'summary'],
  properties: {
    workstream: { type: 'string' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'workstream',
          'layer',
          'aEffort',
          'bEffort',
          'delta',
          'whereTheDeltaLives',
          'whatsPreserved',
          'whatsDeferredB',
          'confidence',
          'whatWouldChangeYourMind',
          'anchors',
        ],
        properties: {
          workstream: { type: 'string' },
          layer: { type: 'string', enum: ['canon', 'schema', 'API', 'mobile', 'LLM', 'ops'] },
          aEffort: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL', 'n/a'] },
          bEffort: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL', 'n/a'] },
          delta: { type: 'string', enum: ['B << A', 'B < A', 'B = A', 'B > A', 'n/a'] },
          whereTheDeltaLives: { type: 'string', maxLength: 500 },
          whatsPreserved: { type: 'string', maxLength: 500 },
          whatsDeferredB: { type: 'string', maxLength: 500 },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          whatWouldChangeYourMind: { type: 'string', maxLength: 500 },
          anchors: { type: 'string', maxLength: 1000 },
        },
      },
    },
    consistencyChecks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['rowIndex', 'verdict', 'evidence'],
        properties: {
          rowIndex: { type: 'integer' },
          verdict: { type: 'string', enum: ['consistent', 'inconsistent', 're-anchored'] },
          evidence: { type: 'string', maxLength: 500 },
        },
      },
    },
    summary: {
      type: 'object',
      additionalProperties: false,
      required: ['totalAEffort', 'totalBEffort', 'bWins', 'bLosses', 'netBImpact', 'leadConfidence'],
      properties: {
        totalAEffort: { type: 'string', maxLength: 200 },
        totalBEffort: { type: 'string', maxLength: 200 },
        bWins: { type: 'array', items: { type: 'string', maxLength: 200 } },
        bLosses: { type: 'array', items: { type: 'string', maxLength: 200 } },
        netBImpact: { type: 'string', maxLength: 600 },
        leadConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
    },
  },
};

const WORKSTREAMS = [
  {
    key: 'architecture',
    prompt: `${SHARED_PREAMBLE}\n\nYOUR WORKSTREAM: architecture.\n\nRead Track 1's cell grid at ${TRACK1_PATH} and identify every cell that falls in the
architecture workstream (the system shape, the data model, the cross-service contracts).\n\nProduce rows for (architecture × {canon, schema, API, mobile, LLM, ops}). For each row, apply
the effort tag (A vs B) and the delta. Run the internal-consistency pass on every B << A row.`,
  },
  {
    key: 'agent-instructions',
    prompt: `${SHARED_PREAMBLE}\n\nYOUR WORKSTREAM: agent-instructions (the agent / harness layer, system prompts, boundaries).\n\nRead Track 1's cell grid at ${TRACK1_PATH} and identify every cell that falls in this workstream.
Produce rows for (agent-instructions × {canon, schema, API, mobile, LLM, ops}). Run the
internal-consistency pass.`,
  },
  {
    key: 'errors-api',
    prompt: `${SHARED_PREAMBLE}\n\nYOUR WORKSTREAM: errors-api (API error handling, typed error hierarchy, boundary classification).\n\nRead Track 1's cell grid at ${TRACK1_PATH}. Produce rows for (errors-api × {canon, schema, API,
mobile, LLM, ops}). Run the internal-consistency pass.`,
  },
  {
    key: 'l10n-a11y-mobile',
    prompt: `${SHARED_PREAMBLE}\n\nYOUR WORKSTREAM: l10n-a11y-mobile (mobile internationalisation and accessibility surface).\n\nRead Track 1's cell grid at ${TRACK1_PATH}. Produce rows for (l10n-a11y-mobile × {canon, schema,
API, mobile, LLM, ops}). Run the internal-consistency pass. Pay particular attention to the
"front-end has to handle the Cat-3 cells exist in the matrix" edge case — surface it in
whereTheDeltaLives if it applies.`,
  },
  {
    key: 'security-pii-api',
    prompt: `${SHARED_PREAMBLE}\n\nYOUR WORKSTREAM: security-pii-api (API PII handling, consent flows, VPC surface).\n\nRead Track 1's cell grid at ${TRACK1_PATH}. Produce rows for (security-pii-api × {canon, schema,
API, mobile, LLM, ops}). Run the internal-consistency pass.`,
  },
  {
    key: 'security-pii-inngest',
    prompt: `${SHARED_PREAMBLE}\n\nYOUR WORKSTREAM: security-pii-inngest (Inngest function PII handling, background-job consent flows).\n\nRead Track 1's cell grid at ${TRACK1_PATH}. Produce rows for (security-pii-inngest × {canon,
schema, API, mobile, LLM, ops}). Run the internal-consistency pass.`,
  },
];

phase('Fan-out by workstream + internal-consistency pass');
const workstreamResults = await parallel(
  WORKSTREAMS.map((w) => () =>
    agent(w.prompt, {
      label: `workstream:${w.key}`,
      phase: 'Fan-out by workstream + internal-consistency pass',
      schema: WORKSTREAM_SCHEMA,
    }).then((r) => r || { workstream: w.key, rows: [], consistencyChecks: [], summary: null }),
  ),
);

const allRows = workstreamResults.filter(Boolean).flatMap((r) => r.rows || []);
const allConsistencyChecks = workstreamResults
  .filter(Boolean)
  .flatMap((r) => r.consistencyChecks || []);
const allSummaries = workstreamResults
  .filter(Boolean)
  .map((r) => ({ workstream: r.workstream, summary: r.summary }))
  .filter((s) => s.summary);

phase('Cross-workstream synthesis + write output');
const synthesis = await agent(
  `You are the cross-workstream synthesizer for Track 2.

WORKSTREAM ROWS: ${JSON.stringify(allRows, null, 0)}
WORKSTREAM SUMMARIES: ${JSON.stringify(allSummaries, null, 0)}
CONSISTENCY CHECKS: ${JSON.stringify(allConsistencyChecks, null, 0)}

Your job: produce the final markdown file content for ${OUTPUT_PATH}.

Structure:
1. A header (audit name, date, one-paragraph framing).
2. The main (workstream × layer) table with columns: # | Workstream | Layer | A-effort |
   B-effort | Delta | Where the delta lives | What's preserved | What's deferred (B) |
   Confidence | What would change your mind | Anchors. One row per (workstream, layer) cell.
3. A per-workstream summary section: one subsection per workstream, each showing total A-effort,
   total B-effort, B's wins, B's losses, net B impact (one sentence), and the workstream lead's
   confidence.
4. A cross-workstream summary (this is the section the PM reads FIRST):
   - Where the savings are concentrated (the (workstream, layer) cells with B << A)
   - Where the savings are diffuse (workstreams where savings spread across layers)
   - Where there are no savings (workstreams or layers where B = A)
   - The dominant constraint (the bottleneck workstream — the one that has to land first)
   - The half-migration risk assessment (the (workstream, layer) cells where V0/V1/B risk is highest)
   - The directional answer (one paragraph: B saves [qualitative] effort, concentrated in
     [workstream / layer]; dominant constraint is [workstream]; half-migration risk is [assessment])
5. A "Missing cells from Track 1" section if any workstream was incomplete in Track 1.
6. A "Consistency check verdicts" section listing all the internal-consistency pass outcomes.

Rules:
- Use the exact effort/delta/confidence taxonomies from the preamble.
- The cell count in the cross-workstream summary must match the actual row count in the main
  table.
- This is a long file; that is expected. Do not truncate.
- Read the requirements file carefully: the format must follow the column order and taxonomies exactly.

OUTPUT: return the full markdown content as a single string in the field "content".`,
  {
    label: 'synthesize',
    phase: 'Cross-workstream synthesis + write output',
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
  content: (synthesis && synthesis.content) || '',
  totalRows: allRows.length,
  workstreamCount: WORKSTREAMS.length,
  consistencyChecks: allConsistencyChecks.length,
};
