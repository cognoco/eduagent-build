// audit-a-vs-b-track-3-layered-cross-check.js
//
// Produces the layered cross-check for Track 3.
// Re-slices Track 1's cell grid and Track 2's workstream estimates by (layer × workstream)
// instead of by workstream. Flags any disagreements between the workstream view and the
// layer view. The disagreement log is the section the PM reads FIRST.
//
// INVOCATION (in a separate session, after the human gate on Track 2's cross-workstream summary):
//   Workflow({
//     scriptPath: '.claude/workflows/audit-a-vs-b-track-3-layered-cross-check.js',
//     args: {
//       track1Path: '_wip/identity-foundation/audit-a-vs-b-track-1-result-cell-grid.md',
//       track2Path: '_wip/identity-foundation/audit-a-vs-b-track-2-result-workstream-estimates.md'
//     }
//   })
//
// OUTPUT: _wip/identity-foundation/audit-a-vs-b-track-3-result-layered-cross-check.md
//
// READ-ONLY CONTRACT: same as Tracks 1 and 2.

export const meta = {
  name: 'audit-a-vs-b-track-3-layered-cross-check',
  description:
    'Layered cross-check. Re-slices Tracks 1 and 2 by (layer × workstream), applies verdict taxonomy, and produces a disagreement log with adversarial sanity-checks on resolutions. The disagreement log is the most useful section for the PM.',
  phases: [
    { title: 'Fan-out by layer' },
    { title: 'Adversarial sanity-check on disagreement resolutions' },
    { title: 'Cross-layer synthesis + write output' },
  ],
};

const OUTPUT_PATH =
  '_wip/identity-foundation/audit-a-vs-b-track-3-result-layered-cross-check.md';
const TRACK1_PATH_DEFAULT =
  '_wip/identity-foundation/audit-a-vs-b-track-1-result-cell-grid.md';
const TRACK2_PATH_DEFAULT =
  '_wip/identity-foundation/audit-a-vs-b-track-2-result-workstream-estimates.md';

const TRACK1_PATH = args?.track1Path || TRACK1_PATH_DEFAULT;
const TRACK2_PATH = args?.track2Path || TRACK2_PATH_DEFAULT;
if (!TRACK1_PATH || !TRACK2_PATH) {
  throw new Error(
    'audit-a-vs-b-track-3: pass args.track1Path and args.track2Path (paths to Tracks 1 and 2 output markdowns).',
  );
}

const LAYERS = ['canon', 'schema', 'API', 'mobile', 'LLM', 'ops'];
const VERDICT_TAXONOMY = [
  'aligned',
  'workstream-concentrated',
  'layer-diffuse',
  'disagreement',
  'n/a',
];

const SHARED_PREAMBLE = `
AUDIENCE
You are executing Track 3 of the A-vs-B directional audit. The PM is choosing between Option A
(v1 serves all three consent categories including Cat 3) and Option B (v1 serves Cat 1+2 only,
Cat 3 deferred to v2). You produce the layered cross-check — a re-slice of Tracks 1 and 2 by
(layer × workstream) and, critically, a disagreement log that flags where the workstream view
and the layer view diverge.

INPUTS
- Track 1's cell grid at ${TRACK1_PATH}. The workstream-agnostic, code-anchored view.
- Track 2's per-workstream estimates at ${TRACK2_PATH}. The workstream-sliced view.
- The 14 sub-audits in docs/audit/2026-05-29-full-audit/ and .deepsec/ for re-reading if the
  re-slice is incomplete.
- The canon in _wip/identity-foundation/ for the same reason.

TRUST HIERARCHY (same as Tracks 1 and 2)
1. Highest trust — code, tests, migrations.
2. High trust — the 14 sub-audits + .deepsec/.
3. Medium trust — the new canon.
4. Low trust — memories, CLAUDE.md / AGENTS.md, pre-audit specs, "should"-language docs, the
   MMT-ADR-* decisions, specific ages as decisions, the ROADMAP open-threads section.

HARD CONSTRAINTS
- Re-slice Tracks 1 and 2 by (layer × workstream). Do not re-walk the canon.
- NO person-weeks. Use Track 2's relative scale.
- For each (layer, workstream) cell, classify with the verdict taxonomy. The disagreement log
  is the most useful section of your output.
- For each logged disagreement, run a quick adversarial sanity-check on the resolution column
  (Track-1-lens / Track-2-lens) — do not accept a resolution without specific evidence.
- Do not edit any file outside ${OUTPUT_PATH}. Do not commit or push. Do not run state-changing
  commands.

LAYERS (6)
1. canon — _wip/identity-foundation/ artefacts
2. schema — packages/schemas/, migrations in apps/api/drizzle/
3. API — apps/api/src/routes/, apps/api/src/services/ (excluding LLM-specific services)
4. mobile — apps/mobile/src/app/, apps/mobile/src/lib/, navigation contract, V0/V1 helpers
5. LLM — apps/api/src/services/llm/, the envelope, safe-non-core dispatcher, challenge-round services
6. ops — Inngest functions, background jobs, retention/deletion, dormancy handling

WORKSTREAMS (reconcile from Track 1's grid; the count may be 5/6/7)
1. architecture
2. agent-instructions
3. errors-api
4. l10n-a11y-mobile
5. security-pii-api
6. security-pii-inngest

VERDICT TAXONOMY (use exactly these strings)
- aligned — Track 1 and Track 2 agree on this cell
- workstream-concentrated — Track 2 says the savings are concentrated in this workstream;
  Track 1 says the workstream is the dominant constraint
- layer-diffuse — Track 2 says the savings are spread across layers; Track 1 says the workstream
  cuts across layers
- disagreement — Track 1 and Track 2 disagree on the cell's A/B tag, drift type, or confidence
- n/a — no work in this cell

ROW SCHEMA (every row you emit must conform)
- # (integer, sequential)
- layer (one of: canon | schema | API | mobile | LLM | ops)
- workstream (one of the 6)
- cellsInThisCell (integer — count from Track 1's grid falling in this (layer, workstream) pair)
- aEffort (one of: XS | S | M | L | XL | n/a, inherited from Track 2)
- bEffort (one of: XS | S | M | L | XL | n/a)
- delta (one of: B << A | B < A | B = A | B > A | n/a, inherited from Track 2)
- verdict (one of: aligned | workstream-concentrated | layer-diffuse | disagreement | n/a)
- confidence (one of: high | medium | low; generally lower than Track 2's because this is a re-slice)
- whatWouldChangeYourMind (single sentence, specific)
- anchors (comma-separated list of track-1#row-N, track-2#row-N, file:line, sub-audit/finding-ID references)

DISAGREEMENT LOG SCHEMA (one entry per disagreement)
- cell (the (layer, workstream) pair)
- track1View (what Track 1's cell grid says)
- track2View (what Track 2's per-workstream estimate says)
- likelyCause (your best guess at why they disagree)
- resolution (your call: which is more likely correct, and why)
- whatWouldResolveItDefinitively (the evidence that would settle the disagreement)
`;

const LAYER_WORKSTREAM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['layer', 'rows', 'disagreements', 'summary'],
  properties: {
    layer: { type: 'string' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'layer',
          'workstream',
          'cellsInThisCell',
          'aEffort',
          'bEffort',
          'delta',
          'verdict',
          'confidence',
          'whatWouldChangeYourMind',
          'anchors',
        ],
        properties: {
          layer: { type: 'string' },
          workstream: { type: 'string' },
          cellsInThisCell: { type: 'integer' },
          aEffort: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL', 'n/a'] },
          bEffort: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL', 'n/a'] },
          delta: { type: 'string', enum: ['B << A', 'B < A', 'B = A', 'B > A', 'n/a'] },
          verdict: { type: 'string', enum: VERDICT_TAXONOMY },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          whatWouldChangeYourMind: { type: 'string', maxLength: 500 },
          anchors: { type: 'string', maxLength: 1000 },
        },
      },
    },
    disagreements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'cell',
          'track1View',
          'track2View',
          'likelyCause',
          'resolution',
          'whatWouldResolveItDefinitively',
        ],
        properties: {
          cell: { type: 'string' },
          track1View: { type: 'string', maxLength: 800 },
          track2View: { type: 'string', maxLength: 800 },
          likelyCause: { type: 'string', maxLength: 500 },
          resolution: { type: 'string', maxLength: 800 },
          whatWouldResolveItDefinitively: { type: 'string', maxLength: 500 },
        },
      },
    },
    summary: {
      type: 'object',
      additionalProperties: false,
      required: ['totalAEffort', 'totalBEffort', 'bWins', 'bLosses', 'netBImpact', 'layerConfidence'],
      properties: {
        totalAEffort: { type: 'string', maxLength: 200 },
        totalBEffort: { type: 'string', maxLength: 200 },
        bWins: { type: 'array', items: { type: 'string', maxLength: 200 } },
        bLosses: { type: 'array', items: { type: 'string', maxLength: 200 } },
        netBImpact: { type: 'string', maxLength: 600 },
        layerConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
    },
  },
};

const LAYER_PROMPTS = LAYERS.map((layer) => ({
  key: layer,
  prompt: `${SHARED_PREAMBLE}\n\nYOUR LAYER: ${layer}.\n\nRead Track 1's cell grid at ${TRACK1_PATH} and Track 2's per-workstream estimates at
${TRACK2_PATH}. For every workstream (architecture, agent-instructions, errors-api,
l10n-a11y-mobile, security-pii-api, security-pii-inngest), produce a row in the
${layer} × workstream slice. Apply the verdict taxonomy. For each disagreement you find, emit
a disagreement log entry.\n\nIf a (layer, workstream) cell is empty in both Track 1 and Track 2, tag it n/a.`,
}));

phase('Fan-out by layer');
const layerResults = await parallel(
  LAYER_PROMPTS.map((l) => () =>
    agent(l.prompt, {
      label: `layer:${l.key}`,
      phase: 'Fan-out by layer',
      schema: LAYER_WORKSTREAM_SCHEMA,
    }).then((r) => r || { layer: l.key, rows: [], disagreements: [], summary: null }),
  ),
);

const allRows = layerResults.filter(Boolean).flatMap((r) => r.rows || []);
const allDisagreements = layerResults
  .filter(Boolean)
  .flatMap((r) => r.disagreements || []);
const allSummaries = layerResults
  .filter(Boolean)
  .map((r) => ({ layer: r.layer, summary: r.summary }))
  .filter((s) => s.summary);

phase('Adversarial sanity-check on disagreement resolutions');
let sanityCheckedDisagreements = allDisagreements;
if (allDisagreements.length > 0) {
  const sanityResult = await agent(
    `You are the adversarial sanity-checker for Track 3's disagreement log.

DISAGREEMENTS: ${JSON.stringify(allDisagreements, null, 0)}

For each disagreement:
1. Read the resolution column. Is the resolution SPECIFIC? If it just says "Track 1 is right"
   without naming the evidence, that is a refutation of the resolution.
2. Read the likelyCause. Is it a real cause, or is it hand-waving?
3. Read the whatWouldResolveItDefinitively. Is it actionable — does it name a specific test/
   migration/finding/grep that would settle the question?

Default to refuted=true (resolution is weak) if uncertain. The disagreement log is the most
useful section of Track 3 — do not let weak resolutions leak through.

For each disagreement, return verdict ("resolution-confirmed" | "resolution-refuted" |
"resolution-needs-tightening") and a one-sentence sharpening of the resolution if it needs
tightening.`,
    {
      label: 'sanity-check-disagreements',
      phase: 'Adversarial sanity-check on disagreement resolutions',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['checks'],
        properties: {
          checks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['cell', 'verdict', 'sharpenedResolution'],
              properties: {
                cell: { type: 'string' },
                verdict: {
                  type: 'string',
                  enum: ['resolution-confirmed', 'resolution-refuted', 'resolution-needs-tightening'],
                },
                sharpening: { type: 'string', maxLength: 800 },
                sharpenedResolution: { type: 'string', maxLength: 800 },
              },
            },
          },
        },
      },
    },
  );

  // Apply sanity-check outcomes: replace the resolution with the sharpened one if tightening.
  const checkByCell = new Map();
  for (const c of (sanityResult && sanityResult.checks) || []) {
    checkByCell.set(c.cell, c);
  }
  sanityCheckedDisagreements = allDisagreements.map((d) => {
    const c = checkByCell.get(d.cell);
    if (!c) return d;
    if (c.verdict === 'resolution-needs-tightening' && c.sharpenedResolution) {
      return { ...d, resolution: c.sharpenedResolution };
    }
    if (c.verdict === 'resolution-refuted') {
      return { ...d, _resolutionFlagged: true, _sharpening: c.sharpening };
    }
    return d;
  });
} else {
  log('No disagreements found in Track 3 — skipping sanity-check phase.');
}

phase('Cross-layer synthesis + write output');
const synthesis = await agent(
  `You are the cross-layer synthesizer for Track 3.

LAYER ROWS: ${JSON.stringify(allRows, null, 0)}
LAYER SUMMARIES: ${JSON.stringify(allSummaries, null, 0)}
DISAGREEMENTS (sanity-checked): ${JSON.stringify(sanityCheckedDisagreements, null, 0)}

Your job: produce the final markdown file content for ${OUTPUT_PATH}.

Structure:
1. A header (audit name, date, one-paragraph framing of A vs B + the layered cross-check purpose).
2. The main (layer × workstream) table with columns: # | Layer | Workstream | Cells in this
   cell | A-effort | B-effort | Delta | Cross-check verdict | Confidence | What would change
   your mind | Anchors. One row per (layer, workstream) pair.
3. A per-layer summary section: one subsection per layer with total A-effort, total B-effort,
   B's wins, B's losses, net B impact (one sentence), and the layer's confidence.
4. A cross-layer summary (this is the section the PM reads FIRST):
   - Where the savings are concentrated by layer (the layers with the most B << A cells)
   - Where the savings are concentrated by workstream (the workstreams with the most B << A
     cells — compare to Track 2's concentration; if they disagree, flag it)
   - The cross-cutting constraints (cells where the workstream view and layer view disagree)
   - The half-migration risk by layer (the layers where V0/V1/B risk is highest — compare to
     Track 2's half-migration risk; if they disagree, flag it)
   - The directional answer (one paragraph: B saves [qualitative] effort, concentrated in
     [layer] (specifically [workstream] within that layer); the dominant constraint is
     [layer/workstream]; the half-migration risk is [assessment])
5. A "Disagreement log" section (the most useful section for the PM): one entry per
   disagreement with the cell, Track 1's view, Track 2's view, the likely cause, the resolution,
   and what would resolve it definitively. For entries where the resolution was flagged as
   weak, add a "[resolution-flagged]" note.

Rules:
- Use the exact verdict/effort/delta/confidence taxonomies from the preamble.
- The cell count in the cross-layer summary must match the actual row count in the main table.
- This is a long file; that is expected. Do not truncate.
- Read the requirements file carefully: the format must follow the column order and taxonomies exactly.

OUTPUT: return the full markdown content as a single string in the field "content".`,
  {
    label: 'synthesize',
    phase: 'Cross-layer synthesis + write output',
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
  disagreementsCount: sanityCheckedDisagreements.length,
  resolutionsFlagged: sanityCheckedDisagreements.filter((d) => d._resolutionFlagged).length,
};
