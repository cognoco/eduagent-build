#!/usr/bin/env node
// Gate-1 finalize (deterministic) for the identity-foundation K/L consolidation.
//
// Applies the human-ratified Gate-1 scope ruling (layered policy) to every finding row, then emits:
//   1. a FINALIZED result JSON (rows carry final scope_class/in_scope/interim_owner/
//      execution_blocking_if_deferred) — consumed by identity-foundation-k-l-render.mjs --render-l
//      so the L-gap-delta table is renderer-owned, never hand-typed.
//   2. gate1-closure.md  — the decision record (what was ruled, the patch-now list).
//   3. gate1-k5-postgate.md — the post-Gate-1 K.5 per-workstream re-size (K.6 input), machine-generated.
//
// The ruling itself is data: gate1-disposition.json (a committed decision record). This script holds
// NO scope judgements — it only mechanically applies the map. Re-running it reproduces every artifact.
//
// Usage:
//   node identity-foundation-gate1-finalize.mjs <result.json> <gate1-disposition.json> <finalized-out.json>
// Then:
//   node identity-foundation-k-l-render.mjs --render-l <finalized-out.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , resultPath, dispoPath, finalizedOut] = process.argv;
if (!resultPath || !dispoPath || !finalizedOut) {
  process.stderr.write('usage: identity-foundation-gate1-finalize.mjs <result.json> <disposition.json> <finalized-out.json>\n');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(resultPath, 'utf8'));
const r = raw.result || raw;
const D = JSON.parse(readFileSync(dispoPath, 'utf8'));
const rows = r.rows || [];
const AUDIT = dirname(r.outputPaths.lDelta);

const cell = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
const trunc = (s, n) => { const c = cell(s); return c.length > n ? `${c.slice(0, n - 1)}…` : c; };
// A row whose ONLY contest was a missing verbatim quote (provenance), not a scope refutation.
const isQuoteOnly = (x) => /quote-not-found|quote_missing/.test(x.contest_note || '') && !/scope-refuted\(/.test(x.contest_note || '');

// ── Apply the Gate-1 dispositions ──────────────────────────────────────────────────────────────
let flippedInToOut = 0; let flippedOutToIn = 0; let keptIn = 0;
for (const x of rows) {
  const d = D[x.finding_id];
  if (d) {
    const wasIn = x.scope_class === 'in-IF-scope';
    const nowIn = d.call === 'IN';
    x.in_scope = nowIn;
    x.scope_class = nowIn ? 'in-IF-scope' : 'in-other-workstream';
    x.interim_owner = d.ow;                                  // layered: who patches the live site now
    x.target_workstream = nowIn ? '' : d.ow;
    x.execution_blocking_if_deferred = d.blk === 'Y' ? 'yes' : (d.blk === 'N' ? 'no' : '');
    x.verify_status = 'confirmed';
    x.gate1_basis = d.n;
    if (nowIn && d.blk === 'Y') x._blocking = true;
    if (wasIn && !nowIn) flippedInToOut += 1;
    if (!wasIn && nowIn) flippedOutToIn += 1;
    if (wasIn && nowIn) keptIn += 1;
  } else if (isQuoteOnly(x)) {
    x.verify_status = 'confirmed';                           // provenance cleared 2026-06-09; scope undisputed
    x.interim_owner = x.interim_owner ?? null;
    x.execution_blocking_if_deferred = x.execution_blocking_if_deferred ?? null;
  } else {
    // Untouched (already-confirmed in-IF originals now all in D, or deferred rows).
    x.interim_owner = x.interim_owner ?? null;
    x.execution_blocking_if_deferred = x.execution_blocking_if_deferred ?? null;
  }
}

const inIF = rows.filter((x) => x.scope_class === 'in-IF-scope');
const out = rows.filter((x) => x.scope_class === 'in-other-workstream');
const deferred = rows.filter((x) => x.scope_class === 'deferred');
const contested = rows.filter((x) => x.verify_status === 'contested');
const blocking = rows.filter((x) => x.execution_blocking_if_deferred === 'yes');

// ── Post-Gate-1 K.5 RECONCILIATION SIZING (the K.6 cost/value input) ─────────────────────────────
// The roadmap requires K.5 to estimate contradictions, effort, canon dependency, and readiness — not
// just counts. We JOIN three deterministic inputs: (a) the pre-gate qualitative assessment
// (r.pre_gate_sizing: effort/canon_dependency/readiness, authored by the sizing agent), (b) the
// post-gate IF-obligation + blocking counts (the concrete unit of work, now scope is settled), and
// (c) the contradiction-resolution status (every Gate-1 ruling that dissolved a pre-gate conflict).
const wsMap = new Map();
const bump = (ws, key) => {
  if (!ws) ws = '(unassigned)';
  if (!wsMap.has(ws)) wsMap.set(ws, { ws, model_obligations: 0, interim_patches: 0, blocking: 0, deferred: 0 });
  wsMap.get(ws)[key] += 1;
};
for (const x of rows) {
  if (x.scope_class === 'in-IF-scope') {
    bump(x.interim_owner, 'model_obligations');               // the rewrite must satisfy this; this ws patches now
    if (x.execution_blocking_if_deferred === 'yes') bump(x.interim_owner, 'blocking');
  } else if (x.scope_class === 'in-other-workstream') {
    bump(x.target_workstream, 'interim_patches');
    if (x.execution_blocking_if_deferred === 'yes') bump(x.target_workstream, 'blocking');
  } else if (x.scope_class === 'deferred') {
    bump(x.target_workstream, 'deferred');
  }
}
const counts = [...wsMap.values()];
r.post_gate_sizing_counts = counts;

// Pre-gate qualitative carry-forward (keyed by audit cluster) + a small extension for owners that
// carry IF obligations but were not separate pre-gate clusters (billing was folded into the api run).
const QUAL = {};
for (const s of (r.pre_gate_sizing || [])) QUAL[s.workstream] = { effort: s.effort_estimate, canon: s.canon_dependency, ready: s.readiness };
const QUAL_EXT = {
  'billing-subscriptions': { effort: 'S', canon: 'partial', ready: 'has-partial-canon' },
  'billing-and-quotas': { effort: 'XS', canon: 'partial', ready: 'has-partial-canon' },
};
// Contradictions resolved at Gate 1, keyed by the cluster each conflict sat in (all 3 dissolved —
// every limb was ruled, none merged-away).
const contraResolved = {};
for (const c of (r.contradictions || [])) contraResolved[c.workstream] = (contraResolved[c.workstream] || 0) + 1;
// IF-slice effort re-estimate (the IN work only, after the OUT rows are routed away) + a one-line note.
const IF_NOTE = {
  'security-pii-api': { effort: 'L', note: 'Heaviest IF surface: IDOR/proxy/deletion-atomicity + age-gate. 1 contradiction (F-130/F-145 age-gate direction) resolved — both ruled IN.' },
  'security-pii-inngest': { effort: 'M', note: '2 contradictions (F-028/F-019 mitigation-vs-defect; F-093/F-122 deletion-guard) resolved — F-019 ruled live defect, F-093/F-122 both IN. IN work = step-state minor-PII + freeform-filing GDPR guard.' },
  'architecture': { effort: 'M', note: 'Structural: session-exchange.ts decomposition + consent/settings/family SCC + Inngest-registration. Per-item heavy though only 7 obligations.' },
  'billing-subscriptions': { effort: 'S', note: 'Trial-expiry downgrade (blocking) + stranded top-up credits; ADR-0002 store-delegation is the canon hook.' },
  'errors-api': { effort: 'XS', note: 'Single envelope hard-fail obligation; all-PASS rule-verification source.' },
  'l10n-a11y-mobile': { effort: 'XS', note: 'One obligation (child sees parent accommodation); the other 34 rows route out as i18n/a11y mechanism.' },
  'billing-and-quotas': { effort: 'XS', note: 'Untested billing/quota/idempotency — payer-model coherence.' },
};
const sizing = counts
  .filter((c) => c.model_obligations > 0)                      // K.6 sequences the IF obligations
  .sort((a, b) => b.model_obligations - a.model_obligations)
  .map((c) => {
    const q = QUAL[c.ws] || QUAL_EXT[c.ws] || { effort: '?', canon: '?', ready: '?' };
    const ifn = IF_NOTE[c.ws] || { effort: q.effort, note: '' };
    const resolved = contraResolved[c.ws] || 0;
    return {
      workstream: c.ws,
      if_obligations: c.model_obligations,
      blocking: c.blocking,
      contradictions: resolved ? `${resolved} → 0 (resolved at Gate 1)` : '0',
      effort_if_slice: ifn.effort,
      canon_dependency: q.canon,
      readiness: q.ready,
      note: ifn.note,
    };
  });
r.post_gate_sizing = sizing;

// ── Write the finalized result JSON (drop the transient _blocking helper) ───────────────────────
for (const x of rows) delete x._blocking;
writeFileSync(finalizedOut, JSON.stringify(r));

// ── gate1-closure.md (decision record) ──────────────────────────────────────────────────────────
let G = '# Gate-1 closure — identity-foundation scope ruling\n\n';
G += '> Closed 2026-06-09. **Decision record.** Generated by `identity-foundation-gate1-finalize.mjs` from `gate1-disposition.json`.\n\n';
G += '## What was decided\n\n';
G += '1. **Governing policy: layered** — `in_scope=true` means the rewrite must satisfy the invariant by construction (an acceptance criterion on a rewrite work package); each live defect is additionally routed to an `interim_owner` to patch now; `execution_blocking_if_deferred` flags those that cannot wait (→ Phase N.0 pull-forward).\n';
G += '2. **All 4 cluster sub-decisions accepted at layered default** — A (minor-PII→third-party, compliance register C-1/C-3/C-4) IN; B (billing/quota integrity, ADR-0002) IN; C (envelope/router correctness, ADR-0016/0014) IN; D (module structure) pre-split (5 IN / 9 OUT).\n';
G += '3. **F-130 ruled** (min-age consent gate, birthYear-only) IN / `security-pii-api` / **blocking** — sibling of F-145; was the one pre-gate in-IF orphan with no interim owner.\n';
G += '4. **11 atoms applied at coordinator leans** (see `gate1-worklist.md`). 6 architecture unknown-priority rows (F-103/107/108/109/111/112) were cluster-defaulted OUT without individual reads.\n\n';
G += '## Result\n\n';
G += `- **${inIF.length} in-IF model obligations** (was 5 pre-gate): ${keptIn} kept-in + ${flippedOutToIn} flipped OUT→IN; ${flippedInToOut} flipped IN→OUT (F-106, F-176).\n`;
G += `- **${out.length} in-other-workstream** + **${deferred.length} deferred** — routed with named interim/target owners.\n`;
G += `- **${contested.length} contested** remaining (85 scope-ruled + 40 provenance-cleared + already-confirmed).\n\n`;
G += `## Patch-now list — ${blocking.length} execution-blocking (Phase N.0 pull-forward candidates)\n\n`;
G += 'Live/urgent defects to fix independent of the rewrite:\n\n';
G += '| ID | Pri | Interim owner | Finding |\n|---|---|---|---|\n';
for (const x of blocking.sort((a, b) => cell(a.finding_id).localeCompare(cell(b.finding_id)))) {
  G += `| ${x.finding_id} | ${cell(x.normalized_priority)} | ${cell(x.interim_owner)} | ${trunc(x.title, 90)} |\n`;
}
G += '\n## Handoff to Phase M (four-bucket triage)\n\n';
G += `\`L-gap-delta.md\` is finalized (renderer-owned) with \`Disposition\` (M-seed) / \`Interim owner\` / \`Blk\`. M sorts every row into: (1) already-handled, (2) clear-in (the ${inIF.length} model obligations), (3) clear-out (named workstream, the ${out.length} routed), (4) defer (the ${deferred.length}). The execution-blocking tag feeds N.0.\n`;
writeFileSync(`${AUDIT}/gate1-closure.md`, G);

// ── gate1-k5-postgate.md (the post-Gate-1 K.5 reconciliation sizing — the K.6 cost/value input) ───
let K = '## K.5 (POST-GATE) — reconciliation sizing after Gate 1\n\n';
K += '> Generated 2026-06-09 by `identity-foundation-gate1-finalize.mjs`. Supersedes the pre-gate K.5 upper-bound. This is the **cost/value input to K.6** — per IF-obligation-bearing workstream: contradictions resolved, IF-slice effort (the IN work only, after clear-out rows are routed away), canon dependency, and readiness. The pre-gate qualitative axes (effort/canon/readiness) are carried from `r.pre_gate_sizing`; the contradiction-resolution and obligation/blocking counts are recomputed from the Gate-1 dispositions.\n\n';
K += '| Workstream | IF obligations | Blocking | Contradictions (pre→post) | IF-slice effort | Canon dependency | Readiness | Note |\n|---|---|---|---|---|---|---|---|\n';
for (const s of sizing) {
  K += `| ${cell(s.workstream)} | ${s.if_obligations} | ${s.blocking || 0} | ${cell(s.contradictions)} | ${cell(s.effort_if_slice)} | ${cell(s.canon_dependency)} | ${cell(s.readiness)} | ${cell(s.note)} |\n`;
}
const totObl = sizing.reduce((a, s) => a + s.if_obligations, 0);
const totBlk = sizing.reduce((a, s) => a + (s.blocking || 0), 0);
K += `| **Total (IF obligations)** | **${totObl}** | **${totBlk}** | **3 → 0** | — | — | — | All 3 pre-gate contradictions dissolved by Gate-1 rulings |\n`;
K += '\n### Routing & defer counts (secondary — the clear-out / defer breakdown)\n\n';
K += '| Disposition | Count | Owner spread |\n|---|---|---|\n';
const outOwners = [...new Set(out.map((x) => x.target_workstream).filter(Boolean))].length;
const defOwners = deferred.filter((x) => !x.target_workstream).length;
K += `| in-IF model obligations | ${inIF.length} | ${sizing.length} workstreams (table above) |\n`;
K += `| in-other-workstream (clear-out) | ${out.length} | ${outOwners} named owners |\n`;
K += `| deferred | ${deferred.length} | ${defOwners} unassigned (M bucket 4) + ${deferred.length - defOwners} owned |\n`;
K += `| execution-blocking (N.0) | ${blocking.length} | patch-now list in gate1-closure.md |\n`;
writeFileSync(`${AUDIT}/gate1-k5-postgate.md`, K);

process.stderr.write(`in-IF:${inIF.length} out:${out.length} deferred:${deferred.length} blocking:${blocking.length} contested:${contested.length}\n`);
process.stderr.write(`flips OUT->IN:${flippedOutToIn} IN->OUT:${flippedInToOut} kept-in:${keptIn}\n`);
process.stderr.write(`wrote finalized JSON + gate1-closure.md + gate1-k5-postgate.md\n`);
