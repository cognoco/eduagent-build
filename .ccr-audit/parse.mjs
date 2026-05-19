// Parser for Claude Code Review (CCR) findings across last 100 closed PRs.
// Reads PR list + bot comments via gh CLI and emits findings.json + summary.md.
//
// Severity mapping (mapping rule for this audit):
//   MUST FIX, Must Fix, "must fix before merge", "[CRITICAL]", "Critical" header,
//   "🔴 Bug"/"🔴 Critical"             -> Critical (unless body explicitly says High/Medium)
//   SHOULD FIX, Should Fix,
//   "[HIGH]", "High" header, "🟠 High" -> High
//   "Medium" header / "[MEDIUM]" / "🟡"-> Medium
//   "HIGH - Must Fix" prefix          -> High  (overrides Must Fix)
//   CONSIDER / Minor Notes / Low / Style / Info -> SKIP
//
// We collect one finding per item under each severity section. Items are
// detected as: numbered list (1. / **1.**), markdown table rows, bold lead-ins
// (**Title** ...), or H3/H4 subheadings.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const REPO = 'cognoco/eduagent-build';
const OUT_DIR = path.resolve('C:/Dev/Projects/Products/Apps/eduagent-build/.ccr-audit');
mkdirSync(OUT_DIR, { recursive: true });

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function ghJson(apiPath) {
  try {
    const out = gh(['api', '--paginate', apiPath]);
    // --paginate may concatenate JSON arrays "[ ... ][ ... ]"; gh handles via newline boundaries.
    // Easier: parse as multiple arrays and concat.
    const trimmed = out.trim();
    if (!trimmed) return [];
    // gh --paginate for arrays returns concatenated arrays separated by no delimiter; split by `][` boundary
    if (trimmed.startsWith('[')) {
      // Try direct parse first
      try { return JSON.parse(trimmed); } catch {}
      const parts = trimmed.split(/\]\s*\[/);
      let all = [];
      for (let i = 0; i < parts.length; i++) {
        let s = parts[i];
        if (i > 0) s = '[' + s;
        if (i < parts.length - 1) s = s + ']';
        all = all.concat(JSON.parse(s));
      }
      return all;
    }
    return JSON.parse(trimmed);
  } catch (e) {
    console.error(`gh api failed for ${apiPath}:`, e.message);
    return [];
  }
}

// Load PR list
const prs = JSON.parse(execFileSync('cat', [path.join(OUT_DIR, 'prs.json')], { encoding: 'utf8' }));
console.error(`Scanning ${prs.length} PRs...`);

// --- Parser ---

const SEVERITY = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium' };

// Detect section start lines and what severity they map to.
function classifySectionHeader(line) {
  const norm = line.toLowerCase().replace(/[*#:`]/g, '').trim();
  // Skip-tag matches first
  if (/^(consider|nit|nits|nice to have|info|minor|minor notes|positive|positives|positive highlights|approved|overview|review metadata|notes|notes:|what.?s good|approve|what works|optional|low(:|$| ))/.test(norm)) return null;
  if (/^(must fix(?: before merge)?|must-fix|musts|critical( findings)?|blocking|🔴.*(bug|critical|risk|must))/.test(norm)) return 'Critical';
  // Explicit High markers
  if (/^(high( findings| issues| - .*)?|🟠.*(high|risk))/.test(norm)) return 'High';
  if (/^(should fix|should-fix|important|high\/medium)/.test(norm)) return 'High';
  if (/^(medium( findings| issues)?|🟡.*(risk|medium|warn|caution))/.test(norm)) return 'Medium';
  return null;
}

// Some PRs use inline severity prefixes per item: "**Critical:** ...", "[HIGH]", "🔴 ..."
function classifyInlinePrefix(text) {
  const t = text.replace(/^[*\-`>\s]*/, '');
  if (/^(\[critical\]|\*\*?critical:?\*?\*?|🔴 ?critical|severity: ?critical)/i.test(t)) return 'Critical';
  if (/^(\[high\]|\*\*?high:?\*?\*?|🟠 ?high|severity: ?high)/i.test(t)) return 'High';
  if (/^(\[medium\]|\*\*?medium:?\*?\*?|🟡 ?medium|severity: ?medium)/i.test(t)) return 'Medium';
  // Older "🔴 Bug" treat as Critical (it was used for blocking bugs)
  if (/^(🔴 ?(bug|critical|risk|blocker|fix))/i.test(t)) return 'Critical';
  // Inline list label form: "Must-fix [1] ...", "Should-fix [4] ...", "Nit [6] ..."
  // Require a list-marker (numeric tag in brackets, parens, or colon) to avoid matching
  // prose like "**IMPORTANT:** ..." or "Must fix the build" in narrative text.
  if (/^must[- ]?fix\s*(\[\d+\]|\(\d+\)|\d+\b|:)/i.test(t)) return 'Critical';
  if (/^should[- ]?fix\s*(\[\d+\]|\(\d+\)|\d+\b|:)/i.test(t)) return 'High';
  if (/^(nit|low|minor|nice[- ]to[- ]have|info|style)\s*(\[\d+\]|\(\d+\)|\d+\b|:)/i.test(t)) return 'SKIP';
  return null;
}

// Heuristic for category
function categorize(body) {
  const b = body.toLowerCase();
  if (/(idor|profileid|auth|scoping|leak|privilege|injection|secret|csrf|xss|sql injection|prompt injection)/.test(b)) return 'security';
  if (/(data loss|drop|cascade|destroy|delete data|silent recovery|silent fallback|silently)/.test(b)) return 'data-loss';
  if (/(performance|perf|slow|n\+1|unbounded|memory|leak|timeout)/.test(b)) return 'perf';
  if (/(test|jest|mock|coverage|assert|integration)/.test(b)) return 'tests';
  if (/(bug|incorrect|wrong|race|deadlock|crash|throw|never|broken)/.test(b)) return 'correctness';
  return 'other';
}

// Extract file references like `apps/api/src/foo.ts:42` or backtick-wrapped paths
function extractFileRefs(body) {
  const out = new Set();
  // backtick path with optional :line
  const re = /`([a-zA-Z0-9_./\-\[\]@]+\.(?:ts|tsx|js|jsx|mjs|cjs|md|json|yml|yaml|sql|sh|toml|css|html)(?::~?\d+)?)`/g;
  let m;
  while ((m = re.exec(body))) {
    out.add(m[1]);
  }
  // Bare paths apps/... or packages/... or src/...
  const re2 = /\b((?:apps|packages|src|scripts|tests|docs)\/[a-zA-Z0-9_./\-\[\]]+\.(?:ts|tsx|js|jsx|mjs|cjs|md|json|yml|yaml|sql|sh|toml)(?::\d+)?)\b/g;
  while ((m = re2.exec(body))) {
    out.add(m[1]);
  }
  return Array.from(out);
}

// Split a markdown table body's data rows. Returns array of cell-arrays.
function parseTableRows(tableBlock) {
  const lines = tableBlock.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return [];
  // first is header, second is separator, rest are data
  const data = lines.slice(2);
  return data.map(l => {
    // strip leading/trailing |
    const trimmed = l.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map(c => c.trim());
  });
}

// Slice body into severity sections.
// Returns array of { severity, content }.
function sliceSections(body) {
  const lines = body.split('\n');
  const sections = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // section header detection: lines starting with ### or ## or **...** alone, or bold-only line.
    let header = null;
    if (/^#{2,4}\s+/.test(line)) {
      header = line.replace(/^#{2,4}\s+/, '').trim();
    } else if (/^\*\*[^*]+\*\*\s*$/.test(line.trim())) {
      header = line.trim().replace(/^\*\*|\*\*$/g, '');
    } else if (/^(MUST FIX|SHOULD FIX|CONSIDER|MUST-FIX|SHOULD-FIX)\s*(:|$|—|–)/i.test(line.trim())) {
      // Header only if the label stands alone or is followed by a separator — NOT "Must-fix [1] ..."
      header = line.trim();
    } else if (/^(High|Medium|Critical|Low|Must Fix|Should Fix)\s*[-–]/i.test(line.trim()) &&
               !/\[\d+\]/.test(line.trim())) {
      // "HIGH - Must Fix Before Merge" — but not "Must-fix [1] - description"
      header = line.trim();
    }
    if (header !== null) {
      const sev = classifySectionHeader(header);
      // Only treat as a section boundary when this header has a recognized severity OR
      // matches an explicit skip section (Consider/Nit/Low/Positive/etc).
      const isExplicitSkipSection = /^(consider|nit|nits|nice to have|info|minor|minor notes|positive|positives|positive highlights|approved|overview|review metadata|notes|notes:|what.?s good|approve|what works|optional|low(:|$| ))/
        .test(header.toLowerCase().replace(/[*#:`]/g, '').trim());
      if (sev) {
        if (current) sections.push(current);
        current = { severity: sev, header, content: '' };
        continue;
      } else if (isExplicitSkipSection) {
        if (current) sections.push(current);
        current = null;
        continue;
      }
      // Unrecognized header candidate (e.g., a bold item title like "**1. Title**" or
      // generic H3 like "### Findings") — fall through and treat as section content.
    }
    if (current) current.content += line + '\n';
  }
  if (current) sections.push(current);
  return sections;
}

// Extract findings inside a section's content.
function extractFindingsFromSection(content) {
  const findings = [];
  // Case A: Markdown table
  const tableMatch = content.match(/(^\|.+\|\s*\n\|[-:|\s]+\|\s*\n(?:\|.+\|\s*\n?)+)/m);
  if (tableMatch) {
    const rows = parseTableRows(tableMatch[1]);
    for (const cells of rows) {
      if (cells.length < 2) continue;
      // Format observed: | File | Line | Issue | Rule | Suggested Fix |
      const file = cells[0] || '';
      const line = cells[1] || '';
      const issue = cells[2] || cells.slice(2).join(' | ') || '';
      // Skip checklist-style rows where the "Issue" cell is empty (e.g., pass/fail tables).
      if (issue.replace(/[`*\s]/g, '').length < 8) continue;
      // Title: take the first sentence of issue (preferring text before a period or em-dash).
      const titleSrc = issue.split(/(?<=[.!?])\s|[—–]/)[0] || issue;
      const title = titleSrc.replace(/[`*]/g, '').trim().slice(0, 200);
      const body = `File: ${file}\nLine: ${line}\nIssue: ${issue}\n` +
        (cells[3] ? `Rule: ${cells[3]}\n` : '') +
        (cells[4] ? `Suggested Fix: ${cells[4]}\n` : '');
      findings.push({ title, body });
    }
    // Also try numbered items below the table (rare)
  }

  // Case B: Numbered or bold-titled items "**N. Title**" / "1. **Title**" / "**Title**"
  if (findings.length === 0) {
    // Split on lines that look like new finding starts: "**1.", "1.", "**Issue N", "**Title**" at line start
    const splits = content.split(/\n(?=(?:\*\*\d+\.|^\d+\.|\*\*Issue \d+|\*\*M\d+|\*\*H\d+|\*\*C\d+|\*\*[A-Z][^*]{4,}\*\*\s*\n))/m);
    for (const chunk of splits) {
      const trimmed = chunk.trim();
      if (trimmed.length < 30) continue; // too short to be a real finding
      // First non-empty line, with leading numbering / bold / italic markers stripped.
      const firstLine = (trimmed.split('\n').find(l => l.trim().length > 0) || '').trim();
      const cleaned = firstLine
        .replace(/^[*_`>\-\s]+/, '')
        .replace(/^(?:\d+\.\s*)/, '')
        .replace(/^[*_`]+/, '')
        .replace(/[`*_]+$/, '')
        .trim();
      const title = (cleaned || trimmed.slice(0, 120)).slice(0, 200);
      findings.push({ title, body: trimmed });
    }
  }
  return findings;
}

// Also: detect "Issue N: ..." style (PR 215 second pass).
// And handle short summary line "(0C/1H/2M/0L)" - we don't enumerate from the count, but use as a sanity check.

// Inline-prefix flat-list scan. Handles bodies like:
//   "Must-fix [1] ...\nMust-fix [2] ...\nShould-fix [4] ...\nNit [6] ..."
// Each non-empty line is checked: a recognized prefix starts a new finding;
// other lines are appended to the pending finding's body.
function scanInlineFlat(body) {
  const out = [];
  const lines = body.split(/\n/);
  let pending = null;
  let skipping = false;
  for (const ln of lines) {
    const sev = classifyInlinePrefix(ln);
    if (sev === 'SKIP') {
      // boundary — flush pending then start ignoring until next labeled item
      if (pending) out.push(pending);
      pending = null;
      skipping = true;
      continue;
    }
    if (sev) {
      if (pending) out.push(pending);
      const stripped = ln.replace(/^[*`>\-\s]+/, '').trim();
      const title = stripped.replace(/^\*\*[^*]+\*\*\s*/, '').slice(0, 200);
      pending = { severity: sev, title: title || stripped.slice(0, 200), body: ln + '\n' };
      skipping = false;
      continue;
    }
    if (pending && !skipping) {
      pending.body += ln + '\n';
    }
  }
  if (pending) out.push(pending);
  return out;
}

// Top-level: parse one comment body and yield findings array.
function parseBody(body) {
  if (!body || body.length < 60) return [];
  const out = [];

  // Drop the metadata <details> block to avoid false positives.
  body = body.replace(/<details>[\s\S]*?<\/details>/g, '');

  const sections = sliceSections(body);
  // Determine if sections look "real" — at least one non-empty content section.
  const realSections = sections.filter(s => s.content.trim().length >= 30);

  if (realSections.length > 0) {
    for (const sec of realSections) {
      const items = extractFindingsFromSection(sec.content);
      for (const it of items) {
        const inline = classifyInlinePrefix(it.body);
        if (inline === 'SKIP') continue;
        out.push({
          severity: inline && inline !== 'SKIP' ? inline : sec.severity,
          title: it.title,
          body: it.body,
        });
      }
    }
  } else {
    // No real sections — try flat inline-label list (Must-fix [N] / Should-fix [N] / Nit [N]).
    out.push(...scanInlineFlat(body));
  }

  // Final filter: drop any items missing severity or with too-short body.
  return out.filter(f => f.severity && f.severity !== 'SKIP' && (f.body || '').replace(/[\s`*]/g, '').length >= 20);
}

// Iterate PRs, gather findings
const findings = [];
const perPR = [];

let scanned = 0;
let prsWithAny = 0;

for (const pr of prs) {
  scanned++;
  if (scanned % 10 === 0) console.error(`  ${scanned}/${prs.length} ...`);
  const comments = ghJson(`repos/${REPO}/issues/${pr.number}/comments`);
  const claudeComments = comments.filter(c => c.user && c.user.login === 'claude[bot]');
  let cCount = 0, hCount = 0, mCount = 0;
  if (claudeComments.length > 0) prsWithAny++;
  for (const c of claudeComments) {
    const items = parseBody(c.body || '');
    for (const it of items) {
      if (!it.severity) continue;
      const f = {
        pr_number: pr.number,
        pr_title: pr.title,
        pr_merged: !!pr.mergedAt,
        pr_merged_at: pr.mergedAt || null,
        pr_head_branch: pr.headRefName,
        pr_base_branch: pr.baseRefName,
        ccr_run_id: `comment-${c.id}`,
        ccr_run_url: c.html_url,
        severity: it.severity,
        title: it.title.slice(0, 240),
        body: it.body,
        file_refs: extractFileRefs(it.body),
        category: categorize(it.body),
      };
      findings.push(f);
      if (f.severity === 'Critical') cCount++;
      else if (f.severity === 'High') hCount++;
      else if (f.severity === 'Medium') mCount++;
    }
  }
  perPR.push({
    number: pr.number,
    title: pr.title,
    passes: claudeComments.length,
    c: cCount, h: hCount, m: mCount,
  });
}

console.error(`Scanned ${scanned} PRs; ${prsWithAny} had CCR activity; ${findings.length} findings collected.`);

// Sanity dedupe identical (pr_number + severity + title) — but spec says don't dedupe across passes.
// So we keep all but stably sort.
findings.sort((a, b) => (a.pr_number - b.pr_number) || a.severity.localeCompare(b.severity));

writeFileSync(path.join(OUT_DIR, 'findings.json'), JSON.stringify(findings, null, 2));

const totalC = findings.filter(f => f.severity === 'Critical').length;
const totalH = findings.filter(f => f.severity === 'High').length;
const totalM = findings.filter(f => f.severity === 'Medium').length;

const lines = [];
lines.push(`# CCR Findings Audit — Last 100 Closed PRs`);
lines.push('');
lines.push(`Repo: \`${REPO}\``);
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push(`Total PRs scanned: ${scanned}`);
lines.push(`PRs with any CCR comment: ${prsWithAny}`);
lines.push(`Total findings (Critical+High+Medium): ${findings.length}`);
lines.push(`- Critical: ${totalC}`);
lines.push(`- High:     ${totalH}`);
lines.push(`- Medium:   ${totalM}`);
lines.push('');
lines.push(`## Per-PR breakdown`);
lines.push('');
// sort desc by number for readability
perPR.sort((a, b) => b.number - a.number);
for (const p of perPR) {
  const title = (p.title || '').slice(0, 90);
  lines.push(`- PR #${p.number} (${title}): ${p.c}C / ${p.h}H / ${p.m}M findings across ${p.passes} CCR passes`);
}

writeFileSync(path.join(OUT_DIR, 'summary.md'), lines.join('\n') + '\n');
console.error('Wrote findings.json and summary.md');
