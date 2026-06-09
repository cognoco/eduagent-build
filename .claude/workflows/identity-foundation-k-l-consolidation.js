// identity-foundation-k-l-consolidation.js
//
// Phase K (consolidation activity) + Phase L (unified gap analysis), bundled.
// Consolidates the 14 sub-audits of `docs/audit/2026-05-29-full-audit/` + the `.deepsec/`
// module + the Phase-A drift map into ONE machine-verified, scope-classified findings table —
// the single document the master-plan runway (M/N/O) consumes.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  EXECUTION BLOCKED ON J0.  Authoring is J0-independent; execution is NOT.
//     This script is path/lens-indirected: the corpus paths and (critically) the
//     scope-lens brief enter as `args` resolved at RUN time. J0 — canon-shape scrub +
//     domain-canon graduation — relocates the four identity domain docs into `docs/canon/`
//     and finalizes WHICH sections count as canon. That changes only the *content* of
//     `args.scopeLensBriefPath`, not this script. Before the real run, swap in the
//     post-J0 brief. Until then `scopeLensBriefPath` defaults to the G-locked
//     CANONICAL-SET.md as a PROVISIONAL lens (fine for dry-review, NOT for the real run).
// ─────────────────────────────────────────────────────────────────────────────
//
// INVOCATION (in a separate session, AFTER J0 closes):
//   Workflow({
//     scriptPath: '.claude/workflows/identity-foundation-k-l-consolidation.js',
//     args: { scopeLensBriefPath: 'docs/canon/<post-J0-canonical-set-or-INDEX>.md' }
//   })
//   (all other args default; override only to re-point corpus/brief paths post-J0)
//
// OUTPUT: the workflow RETURNS structured data; the CALLER (main loop) writes the files.
//   - `docs/audit/2026-05-29-full-audit/RECONCILED.md`  (Phase K — sections A/B/C + QA dashboard)
//   - `docs/audit/2026-05-29-full-audit/L-gap-delta.md`  (Phase L — one row per finding, full tags)
//   QA-DELIBERATE: tables are rendered by the caller DETERMINISTICALLY from the returned
//   structured `rows` — no agent re-types the verified table (transcription is a QA hole).
//   The assemble agent supplies only narrative prose (exec summary, per-workstream framing,
//   B/C cross-reference narrative).
//
// READ-ONLY CONTRACT: agents READ corpus + brief files only. No edits, no git, no pnpm,
// no state-changing commands. The only writes happen in the caller, to the two output paths.
//
// PATTERN COMPOSITION (the six-pattern card):
//   ① Fanout-And-Synthesize  — one reader per finding-bearing sub-audit (Extract)
//   ② Generate-And-Filter    — dedupe duplicates / FLAG contradictions / cluster (Dedupe, barrier)
//   ③ Classify-And-Act       — scope_class + L-tags per finding (Classify)
//   ④ Adversarial Verification — refute every scope call + provenance check (Verify) ← QA core
//   ⑤ Loop-Until-Done (degenerate) — per-source + whole-corpus completeness critics (closed corpus → 1 pass)
//   Tournament: NOT used (K generates no competing solutions to rank).
//
// QA SPINE (three INDEPENDENT mechanisms — independence is the point):
//   1. Provenance anchoring   → kills fabrication/misattribution. Every row carries
//      (source_audit, source_finding_id) + verbatim_quote; a haiku verifier confirms the
//      quote actually appears in the cited source. A scope call with no citable canonical
//      member auto-flags (canonical_set_source == "").
//   2. Adversarial refutation → kills wrong judgment calls. Scope classifications and
//      drift-map "premature resolution" claims are REFUTED by an independent opus skeptic
//      prompted to argue the opposite, default-to-flag on doubt.
//   3. Completeness critics   → kill silent omission. Per-source coverage check folds any
//      missed finding back in; a final whole-corpus critic asks what's unrepresented.
//   GOVERNING RULE — FLAG, DON'T RESOLVE (ratified with the user 2026-06-08): where a
//   verifier disagrees, the row is set `verify_status='contested'` and routed to the
//   contested appendix. The machine surfaces doubt; the architect rules it at the human gates.
//
// HUMAN GATES (outside this workflow; this script produces their INPUTS only):
//   Gate 1 — contested-set ruling (clear FIRST; a moved finding can change a workstream's
//            contradiction count, hence K.5 sizing).
//   Gate 2 — K.6 reconcile-now-vs-defer (architect ruling; fed by the K.5 sizing table). K's exit gate.
//
// MODEL TIERS are set explicitly per global rule #5 (match model to task). To make every
// agent inherit the session model instead, delete the `model:` keys.

export const meta = {
  name: 'identity-foundation-k-l-consolidation',
  description:
    'Phase K+L bundled: consolidate the 14 audit sub-audits + .deepsec + the drift map into one machine-verified, scope-classified, QA-flagged findings table (one row per finding, full L-tags) for the master-plan runway. Flag-to-human on every contested call.',
  phases: [
    { title: 'Extract', detail: 'one reader per finding-bearing sub-audit (Fanout) + class-row per inventory' },
    { title: 'Coverage', detail: 'per-source completeness critic; missed findings folded back in' },
    { title: 'Dedupe', detail: 'merge duplicates, FLAG contradictions, cluster to workstreams (barrier)' },
    { title: 'Classify', detail: 'scope_class + full L-tags per finding, each citing a canonical member' },
    { title: 'Verify', detail: 'adversarial refutation of every scope call + provenance quote-check (flag-to-human)' },
    { title: 'DriftCheck', detail: 'drift-map §2.1-2.7 vs canonical set + adversarial gate on premature-resolutions' },
    { title: 'Sizing', detail: 'K.5 per-workstream reconciliation sizing → K.6 input' },
    { title: 'Assemble', detail: 'narrative + QA dashboard + whole-corpus completeness critic' },
  ],
};

// ── Paths (all overridable via args; defaults are the current pre-J0 locations) ──────────────
const AUDIT_DIR = args?.auditDir || 'docs/audit/2026-05-29-full-audit/';
// Round-2 actionable set ONLY. The handover is emphatic: everything else under .deepsec/ is
// Round-1 history (WI-76…89, already remediated — "the #1 trap") or tooling exhaust. Do NOT widen.
const DEEPSEC_DIR = args?.deepsecDir || '.deepsec/findings/';
// Deterministic DeepSec coverage floor (round-4.2): the inline pre-step globs
// `.deepsec/findings/**/*.md` and passes the count here. If set, a shortfall of represented
// findings vs this count BLOCKS — DeepSec is the one source with a knowable file-level denominator.
// Null → check skipped (no false block on a checkout where findings/ is absent).
// Default 78 = the verified committed count of `.deepsec/findings/**/*.md` on this checkout. The
// args.deepsecExpectedCount plumbing returned null on run wf_875e3fa8-4bf, so we pin the known floor
// here. The singleton-backfill in the dedupe assembly guarantees every extracted DeepSec finding
// becomes ≥1 row, so this floor passes by construction unless extraction itself dropped a file. A
// run on a checkout WITHOUT .deepsec/findings/ must explicitly pass deepsecExpectedCount: null.
const DEEPSEC_EXPECTED_COUNT = args?.deepsecExpectedCount ?? 78;
const DRIFT_MAP_PATH = args?.driftMapPath || '_wip/identity-foundation/_research/drift-map.md';
const DRIFT_SECTIONS = args?.driftMapSections || ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'];
// PROVISIONAL pre-J0 lens. POST-J0: pass args.scopeLensBriefPath = the graduated canonical surface.
const SCOPE_LENS_BRIEF_PATH =
  args?.scopeLensBriefPath || '_wip/identity-foundation/CANONICAL-SET.md';
const OUTPUT_PATH = args?.outputPath || `${AUDIT_DIR}RECONCILED.md`;
const L_DELTA_PATH = args?.lDeltaPath || `${AUDIT_DIR}L-gap-delta.md`;

// The 5-7 workstream enum (K.1 seed). Reconciled by the dedupe/cluster agent; may collapse to 5
// (two security runs merge) or grow to 7 (a finding fits none). Matches the deep-review runs.
const WORKSTREAMS = args?.workstreams || [
  'architecture',
  'agent-instructions',
  'errors-api',
  'l10n-a11y-mobile',
  'security-pii-api',
  'security-pii-inngest',
];

// ── The 10 per-row finding-bearing sources (6 deep-review + 4 root). ─────────────────────────
// workflow-3 (inventory) + workflow-4 (recommendations) are META-OUTPUTS → excluded (feed the
// master plan's workstream discovery, not L's classification). claude/ + codex/ are DISCARDED.
const SOURCES = args?.sources || [
  { id: 'arch-whole-repo', sourceAudit: 'deep-review/arch-whole-repo',
    readPaths: [`${AUDIT_DIR}deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md`,
                `${AUDIT_DIR}deep-review/2026-05-29-arch-whole-repo/REPORT.md`] },
  { id: 'agent-instructions', sourceAudit: 'deep-review/agent-instructions',
    readPaths: [`${AUDIT_DIR}deep-review/2026-05-30-agent-instructions/SUMMARY-prioritized.md`,
                `${AUDIT_DIR}deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md`] },
  { id: 'errors-api', sourceAudit: 'deep-review/errors-api',
    readPaths: [`${AUDIT_DIR}deep-review/2026-05-30-errors-api/SUMMARY-prioritized.md`,
                `${AUDIT_DIR}deep-review/2026-05-30-errors-api/silent-failure-hunter.md`] },
  { id: 'l10n-a11y-mobile', sourceAudit: 'deep-review/l10n-a11y-mobile',
    readPaths: [`${AUDIT_DIR}deep-review/2026-05-30-l10n-a11y-mobile/SUMMARY-prioritized.md`,
                `${AUDIT_DIR}deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md`,
                `${AUDIT_DIR}deep-review/2026-05-30-l10n-a11y-mobile/localization-scanner.md`] },
  { id: 'security-pii-api', sourceAudit: 'deep-review/security-pii-api',
    readPaths: [`${AUDIT_DIR}deep-review/2026-05-30-security-pii-api/SUMMARY-prioritized.md`,
                `${AUDIT_DIR}deep-review/2026-05-30-security-pii-api/pii-leak-scanner.md`,
                `${AUDIT_DIR}deep-review/2026-05-30-security-pii-api/security-reviewer.md`] },
  { id: 'security-pii-inngest', sourceAudit: 'deep-review/security-pii-inngest',
    readPaths: [`${AUDIT_DIR}deep-review/2026-05-30-security-pii-inngest/SUMMARY-prioritized.md`,
                `${AUDIT_DIR}deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md`,
                `${AUDIT_DIR}deep-review/2026-05-30-security-pii-inngest/security-reviewer.md`] },
  { id: 'architecture-audit', sourceAudit: 'root/architecture-audit',
    readPaths: [`${AUDIT_DIR}2026-05-29-architecture-audit.md`] },
  { id: 'improve-codebase-architecture', sourceAudit: 'root/improve-codebase-architecture',
    readPaths: [`${AUDIT_DIR}2026-05-29-improve-codebase-architecture.md`] },
  { id: 'agent-skills-recommendations', sourceAudit: 'root/agent-skills-recommendations',
    readPaths: [`${AUDIT_DIR}2026-05-29-agent-skills-recommendations.md`] },
  // deepsec-handover reader ALSO reads the Round-2 findings/ export (handover references it),
  // with a hard guard against ingesting Round-1 already-remediated history.
  { id: 'deepsec-handover', sourceAudit: 'root/deepsec-handover',
    readPaths: [`${AUDIT_DIR}2026-05-31-deepsec-handover.md`], alsoRead: DEEPSEC_DIR,
    extraGuard:
      'DEEPSEC SCOPE GUARD: extract ONLY the Round-2 open findings under .deepsec/findings/ ' +
      '(BUG/HIGH/HIGH_BUG/MEDIUM subdirs, ~78 items). IGNORE Round-1 history — anything referencing ' +
      'WI-76…89, the 236-finding total, the May-16 run, or deepsec-to-wi-map.md is ALREADY REMEDIATED; ' +
      'do NOT extract it. Set the source_path of each finding to the EXACT .deepsec/findings/<SEV>/<file>.md ' +
      'it came from (this drives the deterministic file-level coverage check). ' +
      'If .deepsec/findings/ is absent on this checkout (gitignored; committed on ' +
      'PR #625), extract nothing from deepsec and say so in completeness_note (it surfaces as a gap).' },
];

// The 2 single-class INVENTORIES → ONE class-level row each (NOT N per-violation rows), so the
// ~700 i18n violations / 164 mock files don't drown the ~30 strategic findings.
const INVENTORY_SOURCES = args?.inventorySources || [
  { id: 'workflow-1-i18n', sourceAudit: 'workflow-1/findings',
    path: `${AUDIT_DIR}workflow-1/findings.md`,
    classTitle: 'Hardcoded user-visible JSX strings bypass i18n (no automated guard)' },
  { id: 'workflow-2-mocks', sourceAudit: 'workflow-2/findings',
    path: `${AUDIT_DIR}workflow-2/findings.md`,
    classTitle: 'Internal jest.mock() backlog (GC6 burn-down class)' },
];

// ── Shared context handed to every agent ─────────────────────────────────────────────────────
const SHARED_PREAMBLE = `
ACTIVITY
You are executing Phase K+L of the Identity-Foundation pre-implementation runway: consolidate a
fixed, closed audit corpus into ONE classified findings table that the master plan (M/N/O) reads.
This is NOT new auditing — you classify and reconcile findings that already exist. Do not hunt
for new bugs in the code; work the corpus.

THE SCOPE LENS (load-bearing — read it first)
Read the canonical-set brief at ${SCOPE_LENS_BRIEF_PATH}. It enumerates the ratified
identity-foundation canonical surface (the domain docs + the MMT-ADR-* decisions + the model
register). This brief is the ONLY authority for the "is this in identity-foundation scope?"
question. A scope call you cannot tie to a specific named member of this brief is, by definition,
unverifiable — cite the member or mark it uncitable.

TRUST HIERARCHY (when sources disagree)
1. Highest — the repo itself: code, tests, migrations (ground truth for whether a finding is real).
2. High — the audit corpus: the 14 sub-audits in ${AUDIT_DIR} + ${DEEPSEC_DIR}.
3. Authority-for-SCOPE-only — the canonical-set brief at ${SCOPE_LENS_BRIEF_PATH}. It decides
   in/out of identity-foundation scope; it is NOT evidence that a finding is real.
4. Low — memories, CLAUDE.md / AGENTS.md, "should"-language docs. Not evidence.

THE CANONICAL FINDING ROW (the K=L=M union schema — every finding becomes one of these)
- finding_id            assigned, stable
- provenance[]          (source_audit, source_finding_id, source_path, evidence_loc) — len>1 after a MERGE
- verbatim_quote[]      one per provenance entry — the anti-hallucination anchor
- domain                the raw area as written by the source
- workstream            one of the ${WORKSTREAMS.length} clusters (or a flagged "unassigned")
- source_severity       the source's rating VERBATIM (P1 | HIGH | RED | HIGH_BUG | …) — never re-rated
- normalized_priority   P0 | P1 | P2 | unknown — a mapped axis for sorting only
- scope_class           in-IF-scope | in-other-workstream | deferred           ← K.2
- canonical_set_source  WHICH named brief member/ADR justifies the scope call (or "" → auto-flag) ← L + QA
- in_scope              boolean (for the master plan)                          ← L
- target_workstream     the workstream that OWNS remediation — set for in-other-workstream;
                        empty for in-IF-scope; for deferred only if a future owner is already known ← L
- verify_status         confirmed | contested                                 ← QA
- contest_note          the refuter's argument, iff contested
- interim_owner         the workstream that PATCHES the live site now (layered policy). null pre-gate;
                        set at Gate-1 finalize (identity-foundation-gate1-finalize.mjs)             ← Gate 1
- execution_blocking_if_deferred   yes | no | null — the N.0 Stream-2 pull-forward input. null
                        pre-gate; set at Gate-1 finalize                                            ← Gate 1

NOTE: interim_owner + execution_blocking_if_deferred are Gate-1 OUTPUTS (a human-ratified scope
ruling happens after this workflow runs). The workflow emits them as null; the renderer
(identity-foundation-k-l-render.mjs) owns the column set for both pre- and post-gate states so a
re-render never drops them. The Gate-1 ruling itself is applied deterministically from a committed
disposition map — see identity-foundation-gate1-finalize.mjs + gate1-disposition.json.

HARD CONSTRAINTS
- Every row anchors to a verbatim quote from its cited source (with its source_path). No quote → no row.
- Do not re-rate severity: source_severity carries the rating verbatim; normalized_priority is a
  separate sort-only mapping. Unknown → "unknown" in both.
- A DUPLICATE (two audits assert the SAME defect) is merged into one row. A CONTRADICTION (two
  audits assert CONFLICTING things) is NOT merged — emit both and flag the conflict. Conflicts are
  K.5's raw material; merging them away destroys the signal.
- No edits to any file. Read-only. No git, no pnpm, no state-changing commands.
- Return strict JSON matching the StructuredOutput schema. No prose around it.
`;

// ── Schemas ──────────────────────────────────────────────────────────────────────────────────
const RAW_FINDING_PROPS = {
  source_finding_id: { type: 'string', maxLength: 120 },
  source_path: { type: 'string', maxLength: 300 }, // F1: the AUDIT file the quote was lifted from (drives the quote-check)
  title: { type: 'string', maxLength: 300 },
  verbatim_quote: { type: 'string', maxLength: 1200 },
  domain: { type: 'string', maxLength: 120 },
  // F2: corpus mixes P0/P1/P2 + CRITICAL/HIGH/MEDIUM/LOW + RED/YELLOW + BUG/HIGH_BUG. Carry the raw
  // rating verbatim (no re-rating) AND a normalized axis for sorting.
  source_severity: { type: 'string', maxLength: 40 },
  normalized_priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'unknown'] },
  evidence_loc: { type: 'string', maxLength: 300 }, // the in-REPO code site the finding points at (file:line)
};
const EXTRACT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['findings', 'extracted_count', 'completeness_note'],
  properties: {
    findings: {
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['source_finding_id', 'source_path', 'title', 'verbatim_quote', 'domain', 'source_severity', 'normalized_priority', 'evidence_loc'],
        properties: RAW_FINDING_PROPS },
    },
    extracted_count: { type: 'integer' },
    completeness_note: { type: 'string', maxLength: 600 },
  },
};
const COVERAGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'missing'],
  properties: {
    verdict: { type: 'string', enum: ['complete', 'gaps'] },
    missing: {
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        // A recovered miss carries its OWN source_path — it may have come from readPaths[1..] or a
        // findings/ file, NOT readPaths[0]. Without it the quote-check opens the wrong file.
        required: ['title', 'source_path', 'verbatim_quote', 'source_severity', 'normalized_priority', 'evidence_loc', 'why_missed'],
        properties: {
          title: { type: 'string', maxLength: 300 },
          source_path: { type: 'string', maxLength: 300 },
          verbatim_quote: { type: 'string', maxLength: 1200 },
          source_severity: { type: 'string', maxLength: 40 },
          normalized_priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'unknown'] },
          evidence_loc: { type: 'string', maxLength: 300 },
          why_missed: { type: 'string', maxLength: 400 },
        } },
    },
  },
};
const INVENTORY_ROW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'source_path', 'verbatim_quote', 'domain', 'source_severity', 'normalized_priority', 'workstream', 'instance_count', 'evidence_loc'],
  properties: {
    title: { type: 'string', maxLength: 300 },
    source_path: { type: 'string', maxLength: 300 },
    verbatim_quote: { type: 'string', maxLength: 1200 },
    domain: { type: 'string', maxLength: 120 },
    source_severity: { type: 'string', maxLength: 40 },
    normalized_priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'unknown'] },
    workstream: { type: 'string', maxLength: 60 },
    instance_count: { type: 'string', maxLength: 120 }, // e.g. "~700 across 92 files"
    evidence_loc: { type: 'string', maxLength: 300 },
  },
};
// Compact, index-referenced plan (see the dedupe section for why). The agent does NOT re-emit
// quotes/provenance — only routing for every idx + the few merge groups + the few contradictions.
// Output is linear-small and bounded regardless of corpus size (the 64k-blowout fix).
const DEDUPE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['routing', 'merges', 'contradictions'],
  properties: {
    // Every raw finding's workstream, by idx. Exactly one entry per idx (omission drops a finding).
    routing: {
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['idx', 'workstream'],
        properties: {
          idx: { type: 'integer' },
          workstream: { type: 'string', maxLength: 60 },
        } },
    },
    // Only ACTUAL duplicates (2+ findings asserting the SAME defect). Singletons are backfilled by
    // the caller, so they must NOT appear here.
    merges: {
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['member_indices', 'title', 'workstream', 'justification'],
        properties: {
          member_indices: { type: 'array', items: { type: 'integer' } }, // length >= 2
          title: { type: 'string', maxLength: 200 },
          workstream: { type: 'string', maxLength: 60 },
          justification: { type: 'string', maxLength: 500 },
        } },
    },
    // CONFLICTS (assert incompatible things) — NOT merged. Reference the conflicting findings by idx.
    contradictions: {
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['member_indices', 'workstream', 'axis', 'note'],
        properties: {
          member_indices: { type: 'array', items: { type: 'integer' } },
          workstream: { type: 'string', maxLength: 60 },
          axis: { type: 'string', maxLength: 200 },
          note: { type: 'string', maxLength: 600 },
        } },
    },
  },
};
const CLASSIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['scope_class', 'canonical_set_source', 'in_scope', 'target_workstream', 'rationale'],
  properties: {
    scope_class: { type: 'string', enum: ['in-IF-scope', 'in-other-workstream', 'deferred'] },
    canonical_set_source: { type: 'string', maxLength: 300 }, // "" if none → auto-flag
    in_scope: { type: 'boolean' },
    target_workstream: { type: 'string', maxLength: 60 },
    rationale: { type: 'string', maxLength: 600 },
  },
};
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['refuted', 'argument', 'confidence'],
  properties: {
    refuted: { type: 'boolean' }, // true = skeptic DISAGREES with the classifier's scope call
    argument: { type: 'string', maxLength: 700 },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
};
const PROVENANCE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['all_quotes_found', 'missing'],
  properties: {
    all_quotes_found: { type: 'boolean' },
    missing: { type: 'array', items: { type: 'string', maxLength: 300 } },
  },
};
const DRIFTCHECK_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['live_defects', 'premature_resolutions'],
  properties: {
    live_defects: {
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['section', 'finding', 'why_not_covered'],
        properties: {
          section: { type: 'string', maxLength: 20 },
          finding: { type: 'string', maxLength: 600 },
          why_not_covered: { type: 'string', maxLength: 600 },
        } },
    },
    premature_resolutions: {
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['section', 'canon_conclusion', 'why_unsupported'],
        properties: {
          section: { type: 'string', maxLength: 20 },
          canon_conclusion: { type: 'string', maxLength: 600 },
          why_unsupported: { type: 'string', maxLength: 600 },
        } },
    },
  },
};
const DRIFT_VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['upheld', 'argument'],
  properties: {
    upheld: { type: 'boolean' }, // true = the premature-resolution claim SURVIVES skepticism
    argument: { type: 'string', maxLength: 700 },
  },
};
const SIZING_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['per_workstream'],
  properties: {
    per_workstream: {
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['workstream', 'contradiction_count', 'effort_estimate', 'canon_dependency', 'readiness', 'note'],
        properties: {
          workstream: { type: 'string', maxLength: 60 },
          contradiction_count: { type: 'integer' },
          effort_estimate: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] }, // session-count scale
          canon_dependency: { type: 'string', enum: ['none', 'partial', 'blocking'] },
          readiness: { type: 'string', enum: ['has-partial-canon', 'from-scratch'] },
          note: { type: 'string', maxLength: 600 },
        } },
    },
  },
};
const FINAL_CRITIC_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['gaps', 'verdict'],
  properties: {
    verdict: { type: 'string', enum: ['complete', 'gaps'] },
    gaps: {
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['kind', 'detail'],
        properties: {
          kind: { type: 'string', enum: ['source-unrepresented', 'workstream-empty', 'meta-output-misclassified', 'other'] },
          detail: { type: 'string', maxLength: 500 },
        } },
    },
  },
};
const NARRATIVE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['exec_summary', 'section_b_framing', 'section_c_framing', 'per_workstream'],
  properties: {
    exec_summary: { type: 'string', maxLength: 4000 },
    section_b_framing: { type: 'string', maxLength: 3000 },
    section_c_framing: { type: 'string', maxLength: 3000 },
    per_workstream: {
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['workstream', 'prose'],
        properties: {
          workstream: { type: 'string', maxLength: 60 },
          prose: { type: 'string', maxLength: 2500 },
        } },
    },
  },
};

// F6: META-CONTEXT schema — synthesis/sanity inputs, NOT finding-row sources.
const META_CONTEXT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['workstream_hints', 'meta_report_findings', 'notes'],
  properties: {
    workstream_hints: { type: 'array', items: { type: 'string', maxLength: 200 } },
    meta_report_findings: { // the independent coverage oracle (META-REPORT's own dedup'd list)
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['title', 'verbatim_quote'],
        properties: {
          title: { type: 'string', maxLength: 300 },
          verbatim_quote: { type: 'string', maxLength: 600 },
        } },
    },
    notes: { type: 'string', maxLength: 800 },
  },
};

// ── LANE C (F6: meta-context) — read META-REPORT (an independent coverage oracle: it already
//    cross-dedupes the 6 deep-review runs) + workflow-3/4 (workstream-discovery hints). Produces
//    ADVISORY context only — never finding rows. Started early; awaited before dedupe. ──────────
const metaContextP = (async () =>
  (await agent(
    `${SHARED_PREAMBLE}

TASK (meta-context — NOT a finding source) — read three SYNTHESIS/meta artifacts and extract
ADVISORY context only. Do NOT emit findings for classification; these would double-count.
- ${AUDIT_DIR}deep-review/META-REPORT.md — the deep-review cluster's OWN cross-run dedupe + priority
  synthesis. Extract its consolidated finding list (title + a short verbatim_quote each) as a
  COVERAGE ORACLE — the independent yardstick the fan-out must recover.
- ${AUDIT_DIR}workflow-3/inventory.md and ${AUDIT_DIR}workflow-4/recommendations.md — meta-outputs.
  Extract only workstream-discovery / prioritization HINTS (short strings), not findings.
Return workstream_hints[], meta_report_findings[] (the oracle), and notes.`,
    { label: 'meta-context', phase: 'Extract', schema: META_CONTEXT_SCHEMA, model: 'sonnet' },
  )) || { workstream_hints: [], meta_report_findings: [], notes: '' })();

// ── LANE B (drift-map cross-check, K.3) — independent of the findings lane; started early for
//    genuine overlap, awaited at assembly. ────────────────────────────────────────────────────
const driftLaneP = (async () => {
  const check = await agent(
    `${SHARED_PREAMBLE}

TASK (K.3) — cross-check the Phase-A drift map against the (now newer) canonical set.
Read the drift map at ${DRIFT_MAP_PATH}, sections ${DRIFT_SECTIONS.join(', ')} (the per-domain
drift). Read the scope-lens brief at ${SCOPE_LENS_BRIEF_PATH}. The drift map was authored
2026-06-01; the canonical set was finalized later. Produce TWO lists:
  (a) live_defects        — drift-map findings the canonical set did NOT cover (still-open defects).
  (b) premature_resolutions — canonical-set conclusions the drift map did NOT actually support
       (the canon over-concluded). Each must name the canon conclusion + why the drift map's
       evidence does not support it.
Be specific and cite the drift-map section.`,
    { label: 'drift-crosscheck', phase: 'DriftCheck', schema: DRIFTCHECK_SCHEMA, model: 'opus' },
  );
  // Adversarial gate: every "premature resolution" is a plausible-but-maybe-wrong claim → refute it.
  const premature = await parallel(
    (check?.premature_resolutions || []).map((pr) => () =>
      agent(
        `${SHARED_PREAMBLE}

TASK — adversarially test ONE "premature resolution" claim from the drift cross-check. The claim
asserts the canonical set OVER-concluded on drift-map section ${pr.section}:
  canon conclusion: ${pr.canon_conclusion}
  why allegedly unsupported: ${pr.why_unsupported}
Read the drift map §${pr.section} at ${DRIFT_MAP_PATH} and the brief at ${SCOPE_LENS_BRIEF_PATH}.
Try to REFUTE the claim — i.e. show the canon conclusion IS in fact supported (or harmless).
Set upheld=true only if the claim survives (the canon genuinely over-concluded). Default to
upheld=false if the evidence is ambiguous.`,
        { label: `drift-refute:${pr.section}`, phase: 'DriftCheck', schema: DRIFT_VERDICT_SCHEMA, model: 'opus' },
      // FAIL-CLOSED: a dead refuter KEEPS the premature-resolution claim for human review (upheld=true).
      ).then((v) => ({ ...pr, upheld: v?.upheld ?? true, refuter_failed: !v, refuter_argument: v?.argument || '' })),
    ),
  );
  return { live_defects: check?.live_defects || [], premature_resolutions: premature.filter(Boolean), driftCheckFailed: !check };
})();

// ── LANE A ① EXTRACT (pipeline: extract → per-source coverage critic) ─────────────────────────
phase('Extract');
const perSource = await pipeline(
  SOURCES,
  // Stage 1 — Fanout read.
  (src) =>
    agent(
      `${SHARED_PREAMBLE}

TASK (K.1 extract) — read sub-audit "${src.id}" and enumerate EVERY distinct finding it asserts.
Read these file(s): ${src.readPaths.join(', ')}${src.alsoRead ? `\nALSO read the findings under ${src.alsoRead} (this handover references them).` : ''}${src.extraGuard ? `\n${src.extraGuard}` : ''}
For each finding, emit:
- source_finding_id (the audit's own ID, or a stable "${src.id}-N" if none)
- source_path (the EXACT file from the list above this quote was lifted from — drives the quote-check)
- title
- verbatim_quote (copy the exact sentence(s) — your anti-hallucination anchor)
- domain (as written)
- source_severity (the rating VERBATIM as the audit wrote it — e.g. P1, HIGH, RED, HIGH_BUG, BUG;
  "unknown" if unrated; do NOT re-rate)
- normalized_priority (map that rating onto P0/P1/P2 for SORTING ONLY: P0≈CRITICAL/RED/HIGH_BUG/P0,
  P1≈HIGH/BUG/YELLOW/P1, P2≈MEDIUM/LOW/P2; "unknown" if unrated)
- evidence_loc (the in-repo code file:line the finding points at)
Do NOT classify scope here. Do NOT invent findings. Set extracted_count and a completeness_note
describing anything ambiguous.`,
      { label: `extract:${src.id}`, phase: 'Extract', schema: EXTRACT_SCHEMA, model: 'sonnet' },
    ).then((r) => ({ src, extracted: r || { findings: [], extracted_count: 0, completeness_note: 'agent returned null' } })),
  // Stage 2 — completeness critic for THIS source (degenerate loop-until-done: 1 pass).
  ({ src, extracted }) =>
    agent(
      `${SHARED_PREAMBLE}

TASK (coverage critic) — re-read sub-audit "${src.id}" at ${src.readPaths.join(', ')}${src.alsoRead ? ` AND the findings under ${src.alsoRead}` : ''} and
check whether the extraction below missed any finding. You MUST cover the SAME surface the extractor
read (including any findings/ directory), not just the handover.${src.extraGuard ? `\n${src.extraGuard}` : ''}
Return verdict=complete if nothing material was missed, else verdict=gaps; for each missed finding give
title + the EXACT source_path it came from + verbatim_quote + source_severity + normalized_priority +
evidence_loc + why_missed. Be a skeptic: assume the extractor was lazy until you confirm otherwise.

EXTRACTION TO CHECK (titles + ids):
${JSON.stringify((extracted.findings || []).map((f) => ({ id: f.source_finding_id, title: f.title })), null, 0)}`,
      { label: `coverage:${src.id}`, phase: 'Coverage', schema: COVERAGE_SCHEMA, model: 'sonnet' },
    // FAIL-CLOSED: a dead coverage critic must NOT read as 'complete' (Finding round-3.1).
    ).then((cov) => ({ src, extracted, coverage: cov || { verdict: 'gaps', missing: [], coverageFailed: true } })),
);

// Inventory side-lane — ONE class-row each (parallel; not a per-finding pipeline).
const inventoryRows = await parallel(
  INVENTORY_SOURCES.map((inv) => () =>
    agent(
      `${SHARED_PREAMBLE}

TASK — sub-audit "${inv.id}" at ${inv.path} is a SINGLE-CLASS inventory enumerating many instances
of ONE finding-class ("${inv.classTitle}"). Do NOT emit one row per instance. Emit ONE class-level
row: title (the class), source_path (the inventory file ${inv.path}), a verbatim_quote from the
inventory's own summary, domain, source_severity (verbatim) + normalized_priority (P0/P1/P2/unknown),
the best-fit workstream from [${WORKSTREAMS.join(', ')}], instance_count (e.g. "~700 across 92 files"),
and evidence_loc (the inventory path). The instance list stays in the inventory file as the pointer.`,
      { label: `inventory:${inv.id}`, phase: 'Extract', schema: INVENTORY_ROW_SCHEMA, model: 'sonnet' },
    ).then((row) => ({ inv, row })),
  ),
);

// Flatten raw findings; fold any critic-recovered misses back in (closes the coverage gap).
const allRaw = [];
for (const r of perSource.filter(Boolean)) {
  for (const f of r.extracted.findings || []) {
    allRaw.push({ ...f, source_audit: r.src.sourceAudit });
  }
  (r.coverage?.missing || []).forEach((m, i) => {
    allRaw.push({
      source_finding_id: `${r.src.id}-critic-${i + 1}`,
      source_path: m.source_path || r.src.readPaths[0], // the critic's real path, not a blind [0]
      title: m.title, verbatim_quote: m.verbatim_quote, domain: 'unknown',
      source_severity: m.source_severity || 'unknown',
      normalized_priority: m.normalized_priority || 'unknown',
      evidence_loc: m.evidence_loc || r.src.readPaths[0], source_audit: r.src.sourceAudit,
    });
  });
}
// Stable integer index per raw finding — the compact dedupe plan references findings by idx.
allRaw.forEach((f, i) => { f.idx = i; });

// ── ② DEDUPE + CLUSTER (compact index-referenced plan; rows hydrated deterministically below) ──
// REWORKED 2026-06-09 (run wf_875e3fa8-4bf post-mortem): the original single agent emitted fully-
// hydrated rows (provenance + verbatim_quote[] per finding) for the WHOLE corpus in one JSON. At
// 211 raw findings that output exceeded the 64k output-token cap, the agent died, and the entire
// classify lane was starved (only the 2 inventory rows survived). The agent now emits only a
// COMPACT, index-referenced plan — workstream routing for every finding + the (few) merge groups +
// the (few) contradictions. Rows are hydrated DETERMINISTICALLY in the caller from allRaw[idx], in
// the spirit of the file's own rule ("tables are rendered deterministically; transcription is a QA
// hole"). A singleton-backfill turns every unmerged finding into its own row, so nothing is
// silently dropped — which also satisfies the DeepSec file-level floor by construction.
const metaContext = await metaContextP; // F6: advisory hints + coverage oracle, ready before clustering
phase('Dedupe');
// Slim projection for the prompt — the agent routes/spots-dups on title+short-quote+domain; it does
// NOT need (and must not re-emit) the full quotes, which stay in allRaw for deterministic hydration.
const dedupInput = allRaw.map((f) => ({
  idx: f.idx, source_audit: f.source_audit, title: f.title,
  quote: (f.verbatim_quote || '').slice(0, 300), domain: f.domain,
  source_severity: f.source_severity, normalized_priority: f.normalized_priority,
}));
const dedup = await agent(
  `${SHARED_PREAMBLE}

TASK (K.1 route + dedupe) — you have the full flat list of raw findings, each with a stable integer
"idx". Produce a COMPACT plan — do NOT re-emit quotes or provenance (the caller hydrates rows
deterministically from idx). Do THREE things:
1. ROUTE every finding to a workstream — emit one routing entry {idx, workstream} for EACH idx
   below, workstream ∈ [${WORKSTREAMS.join(', ')}] (or "unassigned" if none fits). Every idx MUST
   appear exactly once in routing — omitting an idx silently drops that finding.
2. MERGE duplicates — when 2+ findings assert the SAME defect, emit ONE merges[] entry listing all
   their member_indices (length ≥ 2) + a representative title + workstream + justification. Do NOT
   list singletons here; the caller backfills every unmerged finding as its own row.
3. FLAG contradictions — when findings CONFLICT (assert incompatible things), do NOT merge; record
   their member_indices in contradictions[] with the axis of conflict. This is K.5's raw material —
   never collapse a conflict into a merge.

WORKSTREAM-DISCOVERY HINTS (advisory, from meta-outputs — NOT findings; use only to refine routing):
${JSON.stringify(metaContext.workstream_hints, null, 0)}

RAW FINDINGS (idx-keyed):
${JSON.stringify(dedupInput, null, 0)}`,
  { label: 'dedupe-cluster', phase: 'Dedupe', schema: DEDUPE_SCHEMA, model: 'opus' },
);

// ── Deterministic hydration: build canonical rows from the compact plan + allRaw. Every raw
//    finding becomes ≥1 row (merged or singleton) — nothing is silently dropped. ────────────────
const routeByIdx = new Map((dedup?.routing || []).map((r) => [r.idx, r.workstream]));
const PRIO_ORDER = ['P0', 'P1', 'P2', 'unknown'];
const hydrateMembers = (indices, wsHint) => {
  const members = (indices || []).map((i) => allRaw[i]).filter(Boolean);
  const normalized = members.map((m) => m.normalized_priority).filter(Boolean)
    .sort((a, b) => PRIO_ORDER.indexOf(a) - PRIO_ORDER.indexOf(b))[0] || 'unknown';
  return {
    provenance: members.map((m) => ({
      source_audit: m.source_audit, source_finding_id: m.source_finding_id,
      source_path: m.source_path, evidence_loc: m.evidence_loc,
    })),
    verbatim_quote: members.map((m) => m.verbatim_quote),
    workstream: wsHint || routeByIdx.get((indices || [])[0]) || 'unassigned',
    source_severity: [...new Set(members.map((m) => m.source_severity).filter(Boolean))].join(' | ') || 'unknown',
    normalized_priority: normalized,
  };
};
const mergedIdxSet = new Set();
const idxToFindingId = new Map();
const mergeRows = (dedup?.merges || []).map((m, i) => {
  const fid = `F-${String(i + 1).padStart(3, '0')}`;
  (m.member_indices || []).forEach((idx) => { mergedIdxSet.add(idx); idxToFindingId.set(idx, fid); });
  const head = allRaw[(m.member_indices || [])[0]] || {};
  return { finding_id: fid, title: m.title || head.title || 'untitled', domain: head.domain || 'unknown',
    ...hydrateMembers(m.member_indices, m.workstream) };
});
// Singleton backfill — every raw finding not in a merge becomes its own row (guarantees coverage).
let singletonSeq = 0;
const singletonRows = allRaw.filter((f) => !mergedIdxSet.has(f.idx)).map((f) => {
  const fid = `F-${String(mergeRows.length + (++singletonSeq)).padStart(3, '0')}`;
  idxToFindingId.set(f.idx, fid);
  return { finding_id: fid, title: f.title, domain: f.domain || 'unknown', ...hydrateMembers([f.idx]) };
});
const dedupRows = [...mergeRows, ...singletonRows];
// Translate the compact plan's idx-referenced ledger/contradictions back to finding_ids.
const contradictionsOut = (dedup?.contradictions || []).map((c) => ({
  finding_ids: [...new Set((c.member_indices || []).map((idx) => idxToFindingId.get(idx)).filter(Boolean))],
  workstream: c.workstream, axis: c.axis, note: c.note,
}));
const mergeLedgerOut = (dedup?.merges || []).map((m, i) => ({
  finding_id: `F-${String(i + 1).padStart(3, '0')}`,
  merged_from: (m.member_indices || []).map((idx) => {
    const f = allRaw[idx]; return f ? `${f.source_audit}::${f.source_finding_id}` : `idx-${idx}`;
  }),
  justification: m.justification,
}));
const classifyInput = [
  ...dedupRows,
  ...inventoryRows.filter((x) => x?.row).map((x, i) => ({
    finding_id: `INV-${i + 1}`,
    provenance: [{ source_audit: x.inv.sourceAudit, source_finding_id: x.inv.id,
      source_path: x.row?.source_path || x.inv.path, evidence_loc: x.row?.evidence_loc || x.inv.path }],
    verbatim_quote: [x.row?.verbatim_quote || ''],
    title: x.row?.title || x.inv.classTitle,
    domain: x.row?.domain || 'unknown',
    workstream: x.row?.workstream || 'unassigned',
    source_severity: x.row?.source_severity || 'unknown',
    normalized_priority: x.row?.normalized_priority || 'unknown',
  })),
];

// ── ③ CLASSIFY → ④ VERIFY (per-finding pipeline; verify = the QA core, flag-to-human) ─────────
phase('Classify');
const classified = await pipeline(
  classifyInput,
  // Stage 1 — Classify-And-Act: scope + full L-tags, each scope call citing a brief member.
  (row) =>
    agent(
      `${SHARED_PREAMBLE}

TASK (K.2 + L tagging) — classify ONE finding against the scope lens at ${SCOPE_LENS_BRIEF_PATH}.
FINDING: ${JSON.stringify({ finding_id: row.finding_id, title: row.title, workstream: row.workstream, quote: row.verbatim_quote }, null, 0)}
Decide scope_class:
  - in-IF-scope        identity-foundation owns it → cite the SPECIFIC brief member (doc/ADR) in
                       canonical_set_source; leave target_workstream="".
  - in-other-workstream another workstream owns it → set target_workstream to that owner.
  - deferred           real but no workstream is ready to own it yet → leave target_workstream=""
                       UNLESS a future owner is already known, in which case name it.
Set in_scope = (scope_class == "in-IF-scope"). If you cannot cite a specific brief member for an
in-IF-scope call, leave canonical_set_source="" (it will be flagged). Give a one-paragraph rationale.`,
      { label: `classify:${row.finding_id}`, phase: 'Classify', schema: CLASSIFY_SCHEMA, model: 'sonnet' },
    // FAIL-CLOSED: a dead classifier is NOT a real 'deferred' decision (Finding round-3.3) — the
    // fallback is flagged so the verify stage forces verify_status='contested'.
    ).then((c) => ({ row, classification: c || { scope_class: 'deferred', canonical_set_source: '', in_scope: false, target_workstream: '', rationale: 'CLASSIFIER FAILED' }, classificationFailed: !c })),
  // Stage 2 — Adversarial refutation + provenance check, in parallel. FLAG, never auto-resolve.
  ({ row, classification, classificationFailed }) =>
    parallel([
      // (a) scope skeptic — prompted to argue the OPPOSITE of the classifier (opus).
      () =>
        agent(
          `${SHARED_PREAMBLE}

TASK — adversarially test a scope classification. Read the scope lens at ${SCOPE_LENS_BRIEF_PATH}.
FINDING: ${JSON.stringify({ title: row.title, quote: row.verbatim_quote }, null, 0)}
CLASSIFIER SAID: scope_class=${classification.scope_class}, canonical_set_source="${classification.canonical_set_source}",
  rationale="${classification.rationale}".
Argue the OPPOSITE as hard as you honestly can: if they said in-IF-scope, argue it is NOT (or the
cited member does not actually own it); if they said out/deferred, argue it IS in-IF-scope and was
wrongly excluded. Set refuted=true if your counter-argument is at least as strong as theirs.
Default to refuted=true when genuinely uncertain (flag-to-human is cheap; a wrong scope call is not).`,
          { label: `refute:${row.finding_id}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'opus' },
        ),
      // (b) provenance verifier — does each quote actually appear in the cited source? (haiku).
      () =>
        agent(
          `${SHARED_PREAMBLE}

TASK — provenance check (mechanical). For the finding below, confirm each verbatim_quote actually
appears in its cited audit file. Each provenance entry carries source_path — READ THAT EXACT FILE
and string-match the corresponding quote. Do NOT infer the path from source_audit.
PROVENANCE (with source_path): ${JSON.stringify(row.provenance, null, 0)}
QUOTES: ${JSON.stringify(row.verbatim_quote, null, 0)}
Map provenance[i] ↔ verbatim_quote[i]. Set all_quotes_found=false and list any quote NOT found.`,
          { label: `prov:${row.finding_id}`, phase: 'Verify', schema: PROVENANCE_SCHEMA, model: 'haiku' },
        ),
    ]).then(([refute, prov]) => {
      // FAIL-CLOSED: parallel() yields null on a thrown thunk; agent() yields null on terminal
      // failure. A null/failed verifier must CONTEST, never silently confirm.
      const noCite = classification.scope_class === 'in-IF-scope' && !classification.canonical_set_source;
      const quoteMiss = !prov || prov.all_quotes_found !== true;
      const scopeRefuted = !refute || refute.refuted === true;
      const contested = noCite || quoteMiss || scopeRefuted || classificationFailed;
      const notes = [];
      if (classificationFailed) notes.push('classifier-FAILED (fail-closed → contested)');
      if (scopeRefuted) notes.push(refute ? `scope-refuted(${refute.confidence}): ${refute.argument}` : 'scope-verifier-FAILED (fail-closed → contested)');
      if (noCite) notes.push('no-canonical-citation for in-IF-scope call');
      if (quoteMiss) notes.push(prov ? `quote-not-found: ${(prov.missing || []).join(' ; ')}` : 'provenance-verifier-FAILED (fail-closed → contested)');
      return {
        ...row,
        scope_class: classification.scope_class,
        canonical_set_source: classification.canonical_set_source,
        in_scope: classification.in_scope,
        target_workstream: classification.target_workstream,
        rationale: classification.rationale,
        verify_status: contested ? 'contested' : 'confirmed',
        contest_note: contested ? notes.join(' | ') : '',
      };
    }),
);

// ── K.5 SIZING (consumes the contradiction inventory; produces K.6's input) ───────────────────
phase('Sizing');
// Round-4.1: the sizing universe is the ACTUAL clustered set (dedupe may add a 7th or "unassigned"),
// not the original seed — otherwise a newly-discovered cluster is silently absent from K.6's input.
const actualWorkstreams = [...new Set(classified.map((r) => r.workstream).filter(Boolean))];
const sizing = await agent(
  `${SHARED_PREAMBLE}

TASK (K.5 — PRE-GATE estimate) — estimate the RECONCILIATION work per workstream (the deep part:
actually resolving the contradictions within a workstream, NOT the light classification you already
have). NOTE: this runs BEFORE the contested-row ruling (Gate 1); ruling a contested limb can dissolve
a contradiction, so these counts are an UPPER-BOUND pre-gate read that the architect re-runs post-gate.
For each
of [${actualWorkstreams.join(', ')}] (the ACTUAL clustered set — includes any 7th cluster or
"unassigned"), give: contradiction_count (from the list below), effort_estimate on
the session-count scale (XS<1, S=1-2, M=3-5, L=6-10, XL>10 sessions), canon_dependency
(none|partial|blocking — does reconciling need canonical-set-building first?), readiness
(has-partial-canon|from-scratch), and a one-paragraph note.

CONTRADICTIONS: ${JSON.stringify(contradictionsOut, null, 0)}
ROW COUNTS BY WORKSTREAM: ${JSON.stringify(
    classified.reduce((acc, r) => { acc[r.workstream] = (acc[r.workstream] || 0) + 1; return acc; }, {}), null, 0)}`,
  { label: 'sizing', phase: 'Sizing', schema: SIZING_SCHEMA, model: 'opus' },
);

// ── ASSEMBLE — narrative only (tables are rendered DETERMINISTICALLY by the caller) ────────────
phase('Assemble');
const drift = await driftLaneP;
const contested = classified.filter((r) => r.verify_status === 'contested');

// QA-failure sweep — any DEAD agent in a load-bearing lane BLOCKS finalization; it must never
// degrade silently into a passing state. (Generalizes the round-3 fail-open findings.)
const qaFailures = {
  coverage_critic_failed: perSource.filter(Boolean).filter((r) => r.coverage?.coverageFailed).map((r) => r.src.id),
  inventory_extraction_failed: inventoryRows.filter((x) => x && !x.row).length,
  dedupe_failed: !dedup,
  drift_check_failed: drift.driftCheckFailed === true,
  // Round-4.2: deterministic DeepSec file-level coverage. Count distinct findings/ source_paths that
  // made it into a row; if fewer than the pre-step's expected file count, BLOCK (one source row no
  // longer satisfies DeepSec coverage). Skipped when the expected count was not supplied.
  deepsec_coverage_shortfall: (() => {
    if (DEEPSEC_EXPECTED_COUNT == null) return null;
    const represented = new Set(
      classified.flatMap((r) => (r.provenance || []).map((p) => p.source_path))
        .filter((p) => p && p.includes('.deepsec/findings/'))).size;
    return represented < DEEPSEC_EXPECTED_COUNT ? { expected: DEEPSEC_EXPECTED_COUNT, represented } : null;
  })(),
  meta_oracle_unavailable: (metaContext.meta_report_findings || []).length === 0, // advisory: weakens the oracle cross-check, does not block
};
const hasBlockingQaFailure =
  qaFailures.coverage_critic_failed.length > 0 || qaFailures.inventory_extraction_failed > 0 ||
  qaFailures.dedupe_failed || qaFailures.drift_check_failed || !!qaFailures.deepsec_coverage_shortfall;

const qaDashboard = {
  qa_failures: qaFailures,
  per_source: perSource.filter(Boolean).map((r) => ({
    source: r.src.id,
    extracted: r.extracted.extracted_count ?? (r.extracted.findings || []).length,
    coverage: r.coverage?.verdict,
    coverage_failed: r.coverage?.coverageFailed === true,
    critic_recovered: (r.coverage?.missing || []).length,
  })),
  inventory_rows: inventoryRows.filter((x) => x?.row).length,
  total_rows: classified.length,
  merged: mergeLedgerOut.length,
  contradictions: contradictionsOut.length,
  contested: contested.length,
  contested_breakdown: {
    scope_refuted: contested.filter((r) => /scope-refuted\(/.test(r.contest_note)).length,
    no_citation: contested.filter((r) => /no-canonical-citation/.test(r.contest_note)).length,
    quote_missing: contested.filter((r) => /quote-not-found/.test(r.contest_note)).length,
    // fail-closed buckets so the breakdown sums to `contested` (Finding round-3.4):
    scope_verifier_failed: contested.filter((r) => /scope-verifier-FAILED/.test(r.contest_note)).length,
    provenance_verifier_failed: contested.filter((r) => /provenance-verifier-FAILED/.test(r.contest_note)).length,
    classifier_failed: contested.filter((r) => /classifier-FAILED/.test(r.contest_note)).length,
  },
  drift_live_defects: drift.live_defects.length,
  drift_premature_upheld: drift.premature_resolutions.filter((p) => p.upheld).length,
};

const narrative = await agent(
  `${SHARED_PREAMBLE}

TASK — write the NARRATIVE prose for the consolidated-audit document (RECONCILED.md). You do NOT
render tables — the caller renders those deterministically from verified structured rows. Provide:
- exec_summary        what the corpus says overall; the headline scope split; what the QA pass found.
- section_b_framing   how to read Section B (the canonical-set resolutions cross-reference).
- section_c_framing   how to read Section C (the drift-map cross-check) — call out upheld premature
                      resolutions and live defects as the items that still need owners.
- per_workstream      one short prose block per workstream summarizing its findings + reconciliation posture.

INPUTS (already machine-verified — do not contradict them):
QA DASHBOARD: ${JSON.stringify(qaDashboard, null, 0)}
SIZING (K.5): ${JSON.stringify(sizing?.per_workstream || [], null, 0)}
DRIFT (K.3): ${JSON.stringify({ live_defects: drift.live_defects.length, premature_upheld: drift.premature_resolutions.filter((p) => p.upheld).map((p) => p.section) }, null, 0)}
WORKSTREAM ROW COUNTS: ${JSON.stringify(classified.reduce((a, r) => { a[r.workstream] = (a[r.workstream] || 0) + 1; return a; }, {}), null, 0)}`,
  { label: 'assemble-narrative', phase: 'Assemble', schema: NARRATIVE_SCHEMA, model: 'opus' },
);

// Whole-corpus completeness critic (final loop-until-done, single pass).
const finalCritic = await agent(
  `${SHARED_PREAMBLE}

TASK — final completeness critic over the WHOLE corpus. Confirm nothing is silently dropped.
Check: (1) every finding-bearing source [${SOURCES.map((s) => s.id).concat(INVENTORY_SOURCES.map((i) => i.id)).join(', ')}]
is represented by ≥1 row; (2) no workstream that should have findings is empty; (3) the meta-outputs
(workflow-3 inventory, workflow-4 recommendations) were correctly EXCLUDED, not smuggled in.
(4) F6 ORACLE CROSS-CHECK — every META-REPORT oracle finding below should map to ≥1 of our rows;
list any oracle finding with NO corresponding row as kind="source-unrepresented".
Return verdict=gaps with specifics if anything is off.

META-REPORT ORACLE (independent yardstick): ${JSON.stringify(metaContext.meta_report_findings, null, 0)}
ROWS (id, source, workstream): ${JSON.stringify(classified.map((r) => ({ id: r.finding_id, src: (r.provenance || []).map((p) => p.source_audit), ws: r.workstream })), null, 0)}`,
  { label: 'coverage-critic', phase: 'Assemble', schema: FINAL_CRITIC_SCHEMA, model: 'opus' },
);

// FAIL-CLOSED finalization gate, tri-state (round-4.3). 'complete' requires an explicit 'complete'
// verdict, no blocking QA-lane failure, AND the independent META-REPORT oracle to have run.
// 'complete_without_oracle' = otherwise-clean but the oracle cross-check did not run (advisory loss,
// not blocking). 'blocked_on_gaps' = a 'gaps' verdict / null critic / any dead load-bearing agent.
const workflowStatus =
  (finalCritic?.verdict === 'complete' && !hasBlockingQaFailure)
    ? (qaFailures.meta_oracle_unavailable ? 'complete_without_oracle' : 'complete')
    : 'blocked_on_gaps';

// ── RETURN — the caller writes the two files, rendering tables deterministically from `rows`. ──
// Caller responsibilities (documented so the structured source-of-truth is never re-typed by an LLM):
//   RECONCILED.md (Phase K):
//     · narrative.exec_summary
//     · Section A  — rows grouped by workstream, rendered as a table from `rows` (the primary L input)
//     · Section B  — canonical-set resolutions: group `rows` by canonical_set_source (narrative.section_b_framing)
//     · Section C  — drift cross-check: `drift.live_defects` + upheld `drift.premature_resolutions` (section_c_framing)
//     · QA dashboard (from `qaDashboard`) + Contested appendix (from `contested`) + merge ledger + contradictions
//     · K.5 sizing table (from `sizing`) → the input the architect rules on at Gate 2 (K.6)
//   L-gap-delta.md (Phase L):
//     · one row per finding from `rows`, full tags (source_audit, source_finding_id, domain,
//       classification, in_scope, target_workstream, canonical_set_source) — the M/N/O input.
return {
  // FAIL-CLOSED: caller writes final files only when workflowStatus startsWith 'complete'.
  //  · 'blocked_on_gaps'         → resolve finalCritic.gaps / qaFailures, then re-run
  //                                 (resumeFromRunId caches the unchanged prefix).
  //  · 'complete_without_oracle' → safe to write, but the independent META-REPORT cross-check did
  //                                 NOT run; record the reduced-confidence caveat in the doc.
  //  · 'complete'                → all completeness mechanisms ran.
  workflowStatus,
  qaFailures, // dead-lane sweep; non-empty members explain a 'blocked_on_gaps' status
  outputPaths: { reconciled: OUTPUT_PATH, lDelta: L_DELTA_PATH },
  rows: classified,
  inventoryRows: inventoryRows.filter((x) => x?.row).map((x) => x.row),
  contradictions: contradictionsOut,
  mergeLedger: mergeLedgerOut,
  drift,
  // F3: PRE-GATE — computed before the contested ruling; architect re-runs after Gate 1.
  pre_gate_sizing: sizing?.per_workstream || [],
  metaContext, // F6: advisory hints + the coverage oracle used by the final critic
  contested,
  qaDashboard,
  narrative,
  finalCritic,
  humanGates: {
    gate1_contested: 'Rule the contested rows FIRST — a contested in/out ruling can invalidate one limb of a contradiction, dropping its count.',
    gate2_k6: 'K.6 reconcile-now-vs-defer — architect ruling, fed by the RE-RUN (post-Gate-1) sizing. This is K\'s exit gate.',
  },
};
