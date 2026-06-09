#!/usr/bin/env node
// identity-foundation-k-l-render.mjs
//
// Deterministic caller-side companion to `identity-foundation-k-l-consolidation.js` (Phase K+L).
// The workflow returns machine-verified structured data; THIS script turns it into the two output
// files mechanically. No LLM, no re-typing of a verified row — that is the QA contract: the verified
// `rows` are the source of truth, and rendering them must never re-transcribe them.
//
// Two modes:
//   node identity-foundation-k-l-render.mjs --build-args
//       Assemble the args skeleton for the Workflow invocation. Globs `.deepsec/findings/**/*.md`
//       for deepsecExpectedCount; leaves scopeLensBriefPath as a post-J0 placeholder to fill in.
//
//   node identity-foundation-k-l-render.mjs --render <result.json>
//       Read the workflow's returned JSON (saved to <result.json>) and write RECONCILED.md +
//       L-gap-delta.md to the paths in result.outputPaths. ENFORCES the workflowStatus gate:
//       'blocked_on_gaps' → writes nothing, prints qaFailures + finalCritic.gaps, exits 1.
//
// This is a plain Node script run by the caller — it may use the filesystem and the clock (unlike
// the workflow script, which cannot).

import { readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const AUDIT_DIR = 'docs/audit/2026-05-29-full-audit/';
const DEEPSEC_FINDINGS = '.deepsec/findings/';

// ── shared markdown helpers ──────────────────────────────────────────────────────────────────
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ').trim();
const table = (headers, rows) => {
  if (!rows.length) return '_(none)_\n';
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}\n`;
};
const groupBy = (arr, key) =>
  arr.reduce((a, x) => { const k = x[key] || '(unset)'; (a[k] ||= []).push(x); return a; }, {});
const sev = (row) => `${cell(row.source_severity)} (${cell(row.normalized_priority)})`;
const provList = (row) => (row.provenance || []).map((p) => `${p.source_audit}#${p.source_finding_id}`).join('; ');

// ── --build-args ─────────────────────────────────────────────────────────────────────────────
function countDeepsecFindings() {
  if (!existsSync(DEEPSEC_FINDINGS)) return null; // gitignored-absent → null → workflow skips the check
  let n = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.md')) n++;
    }
  };
  walk(DEEPSEC_FINDINGS);
  return n;
}

function buildArgs() {
  const deepsecExpectedCount = countDeepsecFindings();
  const args = {
    // REQUIRED post-J0: the graduated canonical surface (the scope lens). Replace before running.
    scopeLensBriefPath: 'docs/canon/<POST-J0-CANONICAL-SET-OR-INDEX>.md',
    // The rest default inside the workflow script; override only to re-point post-J0 corpus paths.
    deepsecExpectedCount,
  };
  process.stdout.write(JSON.stringify(args, null, 2) + '\n');
  if (deepsecExpectedCount == null) {
    process.stderr.write(
      'WARN: .deepsec/findings/ absent on this checkout — DeepSec file-level coverage check will be ' +
      'SKIPPED. Get on PR #625 or regenerate (pnpm deepsec export --format md-dir --out ./findings).\n');
  } else {
    process.stderr.write(`OK: deepsecExpectedCount=${deepsecExpectedCount} (.deepsec/findings/ md files).\n`);
  }
  if (!existsSync(AUDIT_DIR)) {
    process.stderr.write(`WARN: ${AUDIT_DIR} not found — confirm the corpus path post-J0.\n`);
  }
  process.stderr.write(
    'ACTION: set scopeLensBriefPath to the post-J0 graduated canonical surface, then invoke:\n' +
    "  Workflow({ scriptPath: '.claude/workflows/identity-foundation-k-l-consolidation.js', args: <the JSON above> })\n");
}

// ── --render ─────────────────────────────────────────────────────────────────────────────────
function renderReconciled(r, stamp) {
  const status = r.workflowStatus;
  const caveat = status === 'complete_without_oracle'
    ? '\n> ⚠️ **complete_without_oracle** — the independent META-REPORT oracle did not run; treat ' +
      'completeness as single-checked (per-source + final critic only).\n'
    : '';
  const d = r.qaDashboard || {};
  const f = r.qaFailures || {};

  const out = [];
  out.push(`# Consolidated Audit — Identity-Foundation Phase K (RECONCILED)\n`);
  out.push(`_Generated ${stamp} · workflowStatus: **${status}** · ${r.rows.length} findings_\n`);
  out.push(caveat);
  out.push(`\n> **Deterministically rendered** from the workflow's machine-verified rows. Every row ` +
    `traces to a quoted source (provenance + verbatim quote, quote-checked); contested rows are ` +
    `flagged, never silently confirmed.\n`);

  // QA dashboard — read this first.
  out.push(`\n## QA dashboard (read first)\n`);
  out.push(table(['Metric', 'Value'], [
    ['total findings', d.total_rows],
    ['inventory class-rows', d.inventory_rows],
    ['merged (dedupe)', d.merged],
    ['contradictions flagged', d.contradictions],
    ['contested (→ Gate 1)', d.contested],
    ['drift live-defects', d.drift_live_defects],
    ['drift premature-resolutions upheld', d.drift_premature_upheld],
  ]));
  if (d.contested_breakdown) {
    out.push(`\n**Contested breakdown:** ` +
      Object.entries(d.contested_breakdown).map(([k, v]) => `${k}=${v}`).join(' · ') + '\n');
  }
  out.push(`\n**QA-lane failures (blocking unless empty):** ` +
    `coverage_critic_failed=${JSON.stringify(f.coverage_critic_failed || [])} · ` +
    `inventory_extraction_failed=${f.inventory_extraction_failed} · ` +
    `dedupe_failed=${f.dedupe_failed} · drift_check_failed=${f.drift_check_failed} · ` +
    `deepsec_coverage_shortfall=${JSON.stringify(f.deepsec_coverage_shortfall || null)} · ` +
    `meta_oracle_unavailable=${f.meta_oracle_unavailable} (advisory)\n`);
  out.push(`\nPer-source extraction:\n`);
  out.push(table(['Source', 'Extracted', 'Coverage', 'Coverage failed', 'Critic-recovered'],
    (d.per_source || []).map((s) => [s.source, s.extracted, s.coverage, s.coverage_failed, s.critic_recovered])));

  // Exec summary.
  out.push(`\n## Executive summary\n\n${(r.narrative && r.narrative.exec_summary) || '_(no narrative)_'}\n`);

  // Section A — findings by workstream (the primary output L consumes).
  out.push(`\n## Section A — Findings classified by workstream\n`);
  const byWs = groupBy(r.rows, 'workstream');
  const wsNarr = Object.fromEntries(((r.narrative && r.narrative.per_workstream) || []).map((w) => [w.workstream, w.prose]));
  for (const ws of Object.keys(byWs).sort()) {
    out.push(`\n### ${ws}  ·  ${byWs[ws].length} findings\n`);
    if (wsNarr[ws]) out.push(`\n${wsNarr[ws]}\n`);
    out.push(table(
      ['ID', 'Title', 'Sev (norm)', 'Scope', 'In-scope', 'Target WS', 'Canonical source', 'Verify', 'Provenance'],
      byWs[ws].map((row) => [
        row.finding_id, row.title, sev(row), row.scope_class, row.in_scope ? 'yes' : 'no',
        row.target_workstream, row.canonical_set_source, row.verify_status, provList(row),
      ])));
  }

  // Section B — canonical-set resolutions cross-reference.
  out.push(`\n## Section B — Canonical-set resolutions cross-reference\n`);
  out.push(`\n${(r.narrative && r.narrative.section_b_framing) || ''}\n`);
  const inScope = r.rows.filter((row) => row.scope_class === 'in-IF-scope');
  const byCanon = groupBy(inScope, 'canonical_set_source');
  for (const src of Object.keys(byCanon).sort()) {
    out.push(`\n**${src || '(uncited — flagged)'}**\n`);
    out.push(table(['ID', 'Title', 'Verify'], byCanon[src].map((row) => [row.finding_id, row.title, row.verify_status])));
  }

  // Section C — drift cross-check.
  out.push(`\n## Section C — Drift-map cross-check (K.3)\n`);
  out.push(`\n${(r.narrative && r.narrative.section_c_framing) || ''}\n`);
  out.push(`\n**Live defects** (drift findings the canonical set did not cover):\n`);
  out.push(table(['§', 'Finding', 'Why not covered'],
    ((r.drift && r.drift.live_defects) || []).map((x) => [x.section, x.finding, x.why_not_covered])));
  out.push(`\n**Premature resolutions** (canon conclusions the drift map did not support; upheld = survived skepticism):\n`);
  out.push(table(['§', 'Canon conclusion', 'Why unsupported', 'Upheld', 'Refuter failed'],
    ((r.drift && r.drift.premature_resolutions) || []).map((x) =>
      [x.section, x.canon_conclusion, x.why_unsupported, x.upheld ? 'YES' : 'no', x.refuter_failed ? 'yes' : ''])));

  // K.5 sizing + K.6 decision prompt.
  out.push(`\n## K.5 — Reconciliation sizing (PRE-GATE; re-run after Gate 1)\n`);
  out.push(table(['Workstream', 'Contradictions', 'Effort', 'Canon dependency', 'Readiness', 'Note'],
    (r.pre_gate_sizing || []).map((s) =>
      [s.workstream, s.contradiction_count, s.effort_estimate, s.canon_dependency, s.readiness, s.note])));
  out.push(`\n### K.6 — Architect ruling (K's exit gate)\n`);
  out.push(`\n${(r.humanGates && r.humanGates.gate2_k6) || ''}\n`);
  out.push(`\n> **Gate 1 first:** ${(r.humanGates && r.humanGates.gate1_contested) || ''}\n`);

  // Appendices.
  out.push(`\n## Appendix — Contested rows (Gate 1 worklist)\n`);
  out.push(table(['ID', 'Title', 'Workstream', 'Scope', 'Contest note'],
    (r.contested || []).map((row) => [row.finding_id, row.title, row.workstream, row.scope_class, row.contest_note])));
  out.push(`\n## Appendix — Merge ledger\n`);
  out.push(table(['Finding', 'Merged from', 'Justification'],
    (r.mergeLedger || []).map((m) => [m.finding_id, (m.merged_from || []).join('; '), m.justification])));
  out.push(`\n## Appendix — Contradictions (K.5 raw material)\n`);
  out.push(table(['Findings', 'Workstream', 'Axis', 'Note'],
    (r.contradictions || []).map((c) => [(c.finding_ids || []).join(' ⟷ '), c.workstream, c.axis, c.note])));

  return out.join('\n');
}

function renderLDelta(r, stamp) {
  // Phase L exit gate: one row per finding, tagged (source-audit, source-finding-id, domain,
  // disposition[=scope_class, the M-bucket seed], in-scope?, interim-owner, execution-blocking-if-
  // deferred[=the N.0 input], defer-to-which-workstream?, canonical-set-source). Merged findings
  // join their provenance into the source columns (still one row per finding).
  //
  // The Gate-1 fields (interim_owner, execution_blocking_if_deferred) are null pre-gate and are
  // populated by identity-foundation-gate1-finalize.mjs. This renderer owns the column set for BOTH
  // states, so re-rendering a finalized result never silently drops the Gate-1 schema.
  const out = [];
  const finalized = r.rows.some((row) => row.interim_owner != null || row.execution_blocking_if_deferred != null);
  out.push(`# Unified Gap Delta — Identity-Foundation Phase L${finalized ? ' (GATE-1 FINALIZED)' : ' (PRE-GATE)'}\n`);
  out.push(`_Generated ${stamp} · one row per finding · ${r.rows.length} findings · derived from RECONCILED.md_\n`);
  out.push(finalized
    ? `\n> Gate 1 closed. Every row carries a final **Disposition** (M-bucket seed: in-IF-scope / in-other-workstream / deferred), **Interim owner**, and **Blk** (execution-blocking-if-deferred → the N.0 pull-forward input).\n`
    : `\n> PRE-GATE: **Interim owner** / **Blk** populate at Gate-1 finalize; rendered as \`—\` until then. **Disposition** (= scope_class) is the M-bucket seed.\n`);

  // Scope tally (the M-bucket seed counts — keeps clear-out and defer in distinct buckets).
  const tally = { 'in-IF-scope': 0, 'in-other-workstream': 0, deferred: 0, blocking: 0, contested: 0 };
  for (const x of r.rows) {
    if (tally[x.scope_class] != null) tally[x.scope_class] += 1;
    if (x.execution_blocking_if_deferred === 'yes') tally.blocking += 1;
    if (x.verify_status === 'contested') tally.contested += 1;
  }
  out.push(`\n## Scope tally (M-bucket seed)\n`);
  out.push(table(['Disposition', 'Count'], [
    ['in-IF-scope (model obligation)', tally['in-IF-scope']],
    ['in-other-workstream (clear-out, named owner)', tally['in-other-workstream']],
    ['deferred (no owner yet — M bucket 4)', tally.deferred],
    ['execution-blocking (N.0 pull-forward)', tally.blocking],
    ['contested', tally.contested],
  ]));

  out.push(`\n## Full delta table\n`);
  const blk = (v) => (v === 'yes' ? '**Y**' : v === 'no' ? 'n' : '—');
  out.push(table(
    ['Finding', 'Title', 'Source audit(s)', 'Source finding id(s)', 'Domain', 'Disposition (M-seed)',
     'In-scope?', 'Interim owner', 'Blk', 'Defer-to-workstream', 'Canonical-set source', 'Verify'],
    r.rows.map((row) => [
      row.finding_id, row.title,
      (row.provenance || []).map((p) => p.source_audit).join('; '),
      (row.provenance || []).map((p) => p.source_finding_id).join('; '),
      row.domain, row.scope_class, row.in_scope ? 'yes' : 'no',
      row.interim_owner || '—', blk(row.execution_blocking_if_deferred),
      row.target_workstream || '—', row.canonical_set_source || '—', row.verify_status,
    ])));
  return out.join('\n');
}

function render(resultPath) {
  const r = JSON.parse(readFileSync(resultPath, 'utf8'));
  // STATUS GATE — fail-closed: write only on an explicit complete* status.
  if (!r.workflowStatus || r.workflowStatus === 'blocked_on_gaps') {
    process.stderr.write(`BLOCKED: workflowStatus=${r.workflowStatus} — writing NOTHING.\n`);
    process.stderr.write(`qaFailures: ${JSON.stringify(r.qaFailures, null, 2)}\n`);
    process.stderr.write(`finalCritic.gaps: ${JSON.stringify(r.finalCritic && r.finalCritic.gaps, null, 2)}\n`);
    process.stderr.write('Resolve the gaps, then re-run the workflow (resumeFromRunId caches the unchanged prefix).\n');
    process.exit(1);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const reconciled = renderReconciled(r, stamp);
  const lDelta = renderLDelta(r, stamp);
  writeFileSync(r.outputPaths.reconciled, reconciled);
  writeFileSync(r.outputPaths.lDelta, lDelta);
  process.stderr.write(
    `Wrote ${r.outputPaths.reconciled} (${r.rows.length} findings) and ${r.outputPaths.lDelta}.\n` +
    (r.workflowStatus === 'complete_without_oracle'
      ? 'NOTE: complete_without_oracle — the META-REPORT cross-check did not run; caveat is in the doc banner.\n' : ''));
}

// ── entry ────────────────────────────────────────────────────────────────────────────────────
const [, , mode, arg] = process.argv;
if (mode === '--build-args') {
  buildArgs();
} else if (mode === '--render') {
  if (!arg) { process.stderr.write('usage: --render <result.json>\n'); process.exit(2); }
  render(arg);
} else if (mode === '--render-l') {
  // L-only render — used after Gate-1 finalize so RECONCILED.md (which carries hand-authored K.6
  // decision content) is NOT regenerated. Accepts a raw task output or a bare result object.
  if (!arg) { process.stderr.write('usage: --render-l <result.json>\n'); process.exit(2); }
  const raw = JSON.parse(readFileSync(arg, 'utf8'));
  const r = raw.result || raw;
  if (!r.workflowStatus || r.workflowStatus === 'blocked_on_gaps') {
    process.stderr.write(`BLOCKED: workflowStatus=${r.workflowStatus} — writing NOTHING.\n`);
    process.exit(1);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(r.outputPaths.lDelta, renderLDelta(r, stamp));
  process.stderr.write(`Wrote ${r.outputPaths.lDelta} (${r.rows.length} findings, L-only).\n`);
} else {
  process.stderr.write(
    'usage:\n' +
    '  node identity-foundation-k-l-render.mjs --build-args\n' +
    '  node identity-foundation-k-l-render.mjs --render <result.json>\n' +
    '  node identity-foundation-k-l-render.mjs --render-l <result.json>   # L-only (post-Gate-1)\n');
  process.exit(2);
}
