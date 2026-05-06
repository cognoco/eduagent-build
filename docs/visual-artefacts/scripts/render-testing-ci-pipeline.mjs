import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const outSvg = path.join(root, 'mentomate-testing-ci-pipeline-v1.svg');
const outPng = path.join(root, 'mentomate-testing-ci-pipeline-v1.png');

const W = 3072;
const H = 2048;
const LEFT = 320;
const TOP = 180;
const RIGHT = 40;
const BOTTOM_LEGEND_Y = 1888;

const C = {
  navy: '#05234d',
  blue: '#0b56b3',
  teal: '#087579',
  green: '#0f7a43',
  purple: '#6f2dbd',
  orange: '#e86c00',
  red: '#d7261f',
  ink: '#1f2a3d',
  muted: '#5c6676',
  paper: '#fbf8ef',
  panel: '#fffefa',
  faintBlue: '#eef6ff',
  faintTeal: '#eaf8f7',
  faintGreen: '#edf8f1',
  faintPurple: '#f5efff',
  faintOrange: '#fff3e6',
  faintRed: '#fff1f0',
  line: '#97a3b6',
};

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function wrap(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function textBlock(x, y, lines, opts = {}) {
  const {
    size = 26,
    weight = 500,
    fill = C.ink,
    lineHeight = Math.round(size * 1.28),
    anchor = 'start',
    italic = false,
    maxChars,
  } = opts;
  const rows = Array.isArray(lines) ? lines : wrap(lines, maxChars ?? 48);
  const style = italic ? 'font-style:italic;' : '';
  const spans = rows
    .map((line, i) => {
      const dy = i === 0 ? 0 : lineHeight;
      return `<tspan x="${x}" dy="${dy}">${esc(line)}</tspan>`;
    })
    .join('');
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}" style="${style}">${spans}</text>`;
}

function rect(x, y, w, h, opts = {}) {
  const {
    fill = C.panel,
    stroke = C.blue,
    sw = 3,
    r = 12,
    dash = '',
    opacity = 1,
    filter = '',
  } = opts;
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
  const filterAttr = filter ? ` filter="${filter}"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"${dashAttr}${filterAttr}/>`;
}

function pill(x, y, w, h, label, opts = {}) {
  const {
    fill = C.faintBlue,
    stroke = C.blue,
    color = C.navy,
    size = 22,
    weight = 700,
  } = opts;
  return [
    rect(x, y, w, h, { fill, stroke, sw: 2.4, r: 10 }),
    textBlock(x + w / 2, y + h / 2 + size / 3, label, {
      size,
      weight,
      fill: color,
      anchor: 'middle',
      maxChars: Math.max(10, Math.floor(w / (size * 0.55))),
      lineHeight: size * 1.05,
    }),
  ].join('\n');
}

function panel(x, y, w, h, title, subtitle, opts = {}) {
  const {
    fill = C.panel,
    stroke = C.blue,
    titleColor = C.navy,
    headerFill = 'transparent',
    dash = '',
  } = opts;
  return [
    rect(x, y, w, h, { fill, stroke, sw: 3.2, r: 14, dash, filter: 'url(#softShadow)' }),
    headerFill === 'transparent'
      ? ''
      : `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="52" rx="12" fill="${headerFill}" opacity="0.88"/>`,
    textBlock(x + 22, y + 34, title, { size: 24, weight: 800, fill: titleColor, maxChars: 48 }),
    subtitle
      ? textBlock(x + 22, y + 66, subtitle, {
          size: 16,
          weight: 600,
          fill: C.muted,
          italic: true,
          maxChars: 68,
        })
      : '',
  ].join('\n');
}

function bulletList(x, y, items, opts = {}) {
  const { size = 18, color = C.ink, maxChars = 42, lineHeight = 23, gap = 7 } = opts;
  const parts = [];
  let cy = y;
  for (const item of items) {
    const rows = wrap(item, maxChars);
    parts.push(`<circle cx="${x}" cy="${cy - 7}" r="4.6" fill="${opts.dot ?? C.blue}"/>`);
    parts.push(
      textBlock(
        x + 17,
        cy,
        rows,
        { size, weight: 500, fill: color, lineHeight, maxChars },
      ),
    );
    cy += rows.length * lineHeight + gap;
  }
  return parts.join('\n');
}

function arrow(x1, y1, x2, y2, opts = {}) {
  const { color = C.blue, width = 4, dash = '', marker = 'arrowBlue', bend } = opts;
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
  if (bend) {
    const d = `M ${x1} ${y1} C ${bend[0]} ${bend[1]}, ${bend[2]} ${bend[3]}, ${x2} ${y2}`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dashAttr} marker-end="url(#${marker})"/>`;
  }
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${dashAttr} marker-end="url(#${marker})"/>`;
}

function lane(num, title, subtitle, y, h, color) {
  return [
    `<line x1="28" y1="${y}" x2="${W - 28}" y2="${y}" stroke="#b7c1cf" stroke-width="2"/>`,
    `<rect x="28" y="${y}" width="${LEFT - 38}" height="${h}" fill="#fbf8ef" opacity="0.84"/>`,
    `<circle cx="66" cy="${y + 48}" r="25" fill="${color}"/>`,
    textBlock(66, y + 58, String(num), {
      size: 27,
      weight: 900,
      fill: '#ffffff',
      anchor: 'middle',
    }),
    textBlock(108, y + 42, title, { size: 24, weight: 900, fill: C.navy, maxChars: 18 }),
    textBlock(54, y + 128, subtitle, { size: 20, weight: 500, fill: C.ink, maxChars: 25, lineHeight: 27 }),
    `<line x1="${LEFT}" y1="${y}" x2="${LEFT}" y2="${y + h}" stroke="#5f94b2" stroke-width="2"/>`,
  ].join('\n');
}

function stepCard(x, y, w, h, num, title, body, opts = {}) {
  const color = opts.color ?? C.blue;
  const fill = opts.fill ?? C.faintBlue;
  return [
    rect(x, y, w, h, { fill, stroke: color, sw: 3, r: 12 }),
    `<circle cx="${x + 34}" cy="${y + 36}" r="20" fill="${color}"/>`,
    textBlock(x + 34, y + 45, num, { size: 22, weight: 900, fill: '#fff', anchor: 'middle' }),
    textBlock(x + 66, y + 33, title, { size: 23, weight: 900, fill: color, maxChars: Math.floor(w / 13) }),
    textBlock(x + 28, y + 78, body, {
      size: 18,
      weight: 520,
      fill: C.ink,
      maxChars: Math.floor(w / 10.5),
      lineHeight: 23,
    }),
  ].join('\n');
}

function workflowBox(x, y, w, h, title, trigger, commands, opts = {}) {
  const color = opts.color ?? C.blue;
  const fill = opts.fill ?? C.faintBlue;
  return [
    panel(x, y, w, h, title, trigger, { fill, stroke: color, titleColor: color, headerFill: opts.headerFill ?? '#ffffff' }),
    bulletList(x + 24, y + 104, commands, {
      size: opts.size ?? 18,
      maxChars: opts.maxChars ?? Math.floor(w / 10.5),
      dot: color,
      lineHeight: opts.lineHeight ?? 23,
    }),
  ].join('\n');
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      text { font-family: Inter, "Segoe UI", Arial, Helvetica, sans-serif; letter-spacing: 0; }
    </style>
    <pattern id="paper" patternUnits="userSpaceOnUse" width="96" height="96">
      <rect width="96" height="96" fill="${C.paper}"/>
      <path d="M0 42 C20 38 43 44 64 40 S93 38 96 43" fill="none" stroke="#e7dfcf" stroke-width="1" opacity="0.33"/>
      <path d="M16 0 C18 26 14 54 19 96" fill="none" stroke="#eee6d7" stroke-width="1" opacity="0.36"/>
    </pattern>
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#06274d" flood-opacity="0.10"/>
    </filter>
    <marker id="arrowBlue" markerWidth="16" markerHeight="16" refX="14" refY="8" orient="auto" markerUnits="strokeWidth">
      <path d="M2,2 L14,8 L2,14 Z" fill="${C.blue}"/>
    </marker>
    <marker id="arrowTeal" markerWidth="16" markerHeight="16" refX="14" refY="8" orient="auto" markerUnits="strokeWidth">
      <path d="M2,2 L14,8 L2,14 Z" fill="${C.teal}"/>
    </marker>
    <marker id="arrowGreen" markerWidth="16" markerHeight="16" refX="14" refY="8" orient="auto" markerUnits="strokeWidth">
      <path d="M2,2 L14,8 L2,14 Z" fill="${C.green}"/>
    </marker>
    <marker id="arrowPurple" markerWidth="16" markerHeight="16" refX="14" refY="8" orient="auto" markerUnits="strokeWidth">
      <path d="M2,2 L14,8 L2,14 Z" fill="${C.purple}"/>
    </marker>
    <marker id="arrowOrange" markerWidth="16" markerHeight="16" refX="14" refY="8" orient="auto" markerUnits="strokeWidth">
      <path d="M2,2 L14,8 L2,14 Z" fill="${C.orange}"/>
    </marker>
    <marker id="arrowRed" markerWidth="16" markerHeight="16" refX="14" refY="8" orient="auto" markerUnits="strokeWidth">
      <path d="M2,2 L14,8 L2,14 Z" fill="${C.red}"/>
    </marker>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#paper)"/>
  ${rect(4, 4, W - 8, H - 8, { fill: 'none', stroke: C.navy, sw: 4, r: 24 })}

  ${textBlock(W / 2, 78, 'Mentomate Testing + CI Pipeline', {
    size: 66,
    weight: 900,
    fill: C.navy,
    anchor: 'middle',
  })}
  ${textBlock(W / 2, 126, 'Local verification, GitHub Actions gates, E2E scope, mobile builds, deploy safety, and feedback loops', {
    size: 28,
    weight: 650,
    fill: C.muted,
    anchor: 'middle',
    italic: true,
    maxChars: 180,
  })}
  <line x1="28" y1="160" x2="${W - 28}" y2="160" stroke="${C.navy}" stroke-width="3"/>

  ${lane(1, 'Change + Local', 'Smallest useful checks before PR: targeted Jest, area lint, typecheck, and integration only when behavior crosses package or DB boundaries.', 180, 300, C.teal)}
  ${lane(2, 'Primary CI Gate', 'The required PR/main workflow validates install, database migrations, workspace lint, unit tests, typecheck, and builds.', 480, 430, C.blue)}
  ${lane(3, 'E2E + Scope', 'Expensive suites are routed by trigger and changed files: Playwright web smoke, API integration, and Maestro mobile flows.', 910, 420, C.purple)}
  ${lane(4, 'Build + Deploy', 'After quality gates, JS-only mobile changes go OTA; native changes build with EAS; API deploys run migration safeguards first.', 1330, 360, C.orange)}
  ${lane(5, 'Feedback + Guardrails', 'Artifacts, automation, and repo rules close the loop.', 1690, 198, C.green)}

  ${stepCard(365, 204, 345, 238, '1', 'Developer change', 'Code, schema, workflow, or test updates. Docs-only changes are ignored by the main CI path filters.', { color: C.teal, fill: C.faintTeal })}
  ${stepCard(750, 204, 520, 238, '2', 'Local validation menu', 'Targeted: pnpm exec jest --findRelatedTests <changed-files> --no-coverage. API: nx run api:lint/typecheck. Mobile: nx lint mobile + tsc --noEmit. Integration tests when DB, auth, scoping, Inngest, or contracts change.', { color: C.teal, fill: C.faintTeal })}
  ${stepCard(1310, 204, 360, 238, '3', 'PR / push trigger', 'GitHub Actions starts on pull_request and push to main. PR concurrency cancels superseded runs; main commits queue.', { color: C.blue, fill: C.faintBlue })}
  ${stepCard(1710, 204, 340, 238, '4', 'PR automation', 'Claude Code Review is advisory and posts PR feedback. @claude comment workflow can inspect CI and repository context.', { color: C.purple, fill: C.faintPurple })}
  ${stepCard(2090, 204, 520, 238, '5', 'Review protocol', 'Before merge: read gh pr diff, check gh pr checks, triage automated review comments, and fix high correctness/security findings.', { color: C.red, fill: C.faintRed })}

  ${arrow(710, 323, 750, 323, { color: C.teal, marker: 'arrowTeal' })}
  ${arrow(1270, 323, 1310, 323, { color: C.blue, marker: 'arrowBlue' })}
  ${arrow(1670, 323, 1710, 323, { color: C.purple, marker: 'arrowPurple' })}
  ${arrow(2050, 323, 2090, 323, { color: C.red, marker: 'arrowRed' })}

  ${workflowBox(365, 512, 420, 350, 'ci.yml trigger + setup', 'pull_request + push main', [
    'paths-ignore skips docs, markdown, IDE and agent metadata',
    'checkout with base branch for PR diff scripts',
    'pnpm/action-setup + Node 22 + pnpm cache',
    'Nx daemon disabled for deterministic CI',
  ], { color: C.blue, fill: C.faintBlue })}
  ${workflowBox(825, 512, 430, 350, 'CI database lane', 'pgvector PostgreSQL service', [
    'DATABASE_URL points at local CI Postgres',
    'CREATE EXTENSION IF NOT EXISTS vector',
    'drizzle-kit migrate validates committed SQL',
    'Clean stale tsbuildinfo and dist outputs',
  ], { color: C.green, fill: C.faintGreen })}
  ${workflowBox(1295, 512, 520, 350, 'Workspace quality gate', 'required main job', [
    'pnpm exec nx run-many -t lint test typecheck',
    'pnpm exec nx run-many -t build --exclude=@eduagent/mobile',
    'API integration tests run when API/database/schemas/retention/lockfile changed',
    'Self-healing CI logs fix proposals on failure',
  ], { color: C.blue, fill: C.faintBlue })}
  ${workflowBox(1855, 512, 430, 350, 'Unit test surface', 'Jest through Nx targets', [
    'Mobile: ~194 suites / ~2,150 tests',
    'API: ~187 suites / ~3,220 tests',
    'Co-located tests; no __tests__ folders',
    'Shared schemas stay in @eduagent/schemas',
  ], { color: C.teal, fill: C.faintTeal })}
  ${workflowBox(2325, 512, 430, 350, 'CI outputs', 'pass, fail, or advisory signal', [
    'Required checks gate PR merge policy',
    'Validate CLAUDE.md counts is advisory',
    'Nx Cloud hooks are present for future distribution',
    'Failed checks feed reviewer and fix workflow',
  ], { color: C.orange, fill: C.faintOrange })}

  ${arrow(785, 687, 825, 687, { color: C.green, marker: 'arrowGreen' })}
  ${arrow(1255, 687, 1295, 687, { color: C.blue, marker: 'arrowBlue' })}
  ${arrow(1815, 687, 1855, 687, { color: C.teal, marker: 'arrowTeal' })}
  ${arrow(2285, 687, 2325, 687, { color: C.orange, marker: 'arrowOrange' })}
  ${arrow(1515, 862, 1515, 940, { color: C.purple, marker: 'arrowPurple', dash: '10 8' })}

  ${workflowBox(365, 950, 440, 318, 'e2e-web.yml', 'PR to main/develop/improvements + manual', [
    'Installs Playwright Chromium',
    'Builds schemas package',
    'Runs pnpm run test:e2e:web:smoke',
    'Uploads Playwright report and test-results',
  ], { color: C.purple, fill: C.faintPurple })}
  ${workflowBox(845, 950, 460, 318, 'e2e-ci.yml scope gate', 'workflow_run after CI + nightly + manual', [
    'Skips if upstream CI failed',
    'Changed-file analysis chooses API and mobile suites',
    'Schedule/dispatch runs all E2E scopes',
    'Concurrency cancels stale branch E2E runs',
  ], { color: C.purple, fill: C.faintPurple })}
  ${workflowBox(1345, 950, 430, 318, 'API integration E2E', 'scheduled/manual advisory', [
    'pgvector Postgres service',
    'db:push in this suite only; migration SQL already validated in ci.yml',
    'jest tests/integration with maxWorkers=2',
    'continue-on-error does not block merge',
  ], { color: C.green, fill: C.faintGreen })}
  ${workflowBox(1815, 950, 575, 318, 'Mobile Maestro E2E', 'runtime mobile-affecting changes', [
    'Builds schemas, writes apps/api/.dev.vars, starts wrangler dev',
    'Caches APK and Gradle; injects fresh JS on cache hit',
    'Runs Android emulator and Maestro smoke/nightly tags',
    'Uploads screenshots, failure screen, and logcat artifacts',
  ], { color: C.purple, fill: C.faintPurple })}
  ${workflowBox(2430, 950, 325, 318, 'Contract test surface', 'tests/integration/', [
    '~32 integration suites / ~290 cases',
    'Use real database and service boundaries',
    'No internal mocks in integration tests',
  ], { color: C.teal, fill: C.faintTeal })}

  ${arrow(805, 1109, 845, 1109, { color: C.purple, marker: 'arrowPurple' })}
  ${arrow(1305, 1109, 1345, 1109, { color: C.green, marker: 'arrowGreen', dash: '10 8' })}
  ${arrow(1775, 1109, 1815, 1109, { color: C.purple, marker: 'arrowPurple', dash: '10 8' })}
  ${arrow(2390, 1109, 2430, 1109, { color: C.teal, marker: 'arrowTeal', dash: '10 8' })}

  ${workflowBox(365, 1372, 455, 270, 'OTA update from ci.yml', 'push main after CI main passes', [
    'Runs only when mobile or schemas changed',
    'Skips if native files changed',
    'Publishes EAS Update to preview channel',
    'Warns that native changes need full EAS build',
  ], { color: C.orange, fill: C.faintOrange })}
  ${workflowBox(860, 1372, 455, 270, 'mobile-ci.yml', 'CI workflow_run success + dispatch', [
    'check-affected detects mobile and native changes',
    'Manual dispatch can lint/test and build selected profile/platform',
    'Native changes build Android preview APK',
    'EAS profile controls dev/preview/prod',
  ], { color: C.orange, fill: C.faintOrange })}
  ${workflowBox(1355, 1372, 525, 270, 'deploy.yml API quality gate', 'push main + manual dispatch', [
    'Push main: lightweight lint + typecheck because CI already ran PR suite',
    'Manual deploy: adds API unit and integration tests',
    'Quality gate always precedes API deploy',
    'Production uses GitHub environment approval',
  ], { color: C.orange, fill: C.faintOrange })}
  ${workflowBox(1920, 1372, 435, 270, 'Migration + target safety', 'before Cloudflare deploy', [
    'Asserts the correct environment DATABASE_URL secret exists',
    'Verifies deploy target host before migrations',
    'Runs drizzle-kit migrate against selected target',
    'No db:push in staging/prod',
  ], { color: C.red, fill: C.faintRed })}
  ${workflowBox(2395, 1372, 360, 270, 'Release endpoints', 'post-gate delivery', [
    'wrangler deploy --env staging/production',
    'Sync Worker secrets from Doppler when token is present',
    'Manual mobile deploy builds with EAS',
  ], { color: C.orange, fill: C.faintOrange })}

  ${arrow(820, 1507, 860, 1507, { color: C.orange, marker: 'arrowOrange' })}
  ${arrow(1315, 1507, 1355, 1507, { color: C.orange, marker: 'arrowOrange' })}
  ${arrow(1880, 1507, 1920, 1507, { color: C.red, marker: 'arrowRed' })}
  ${arrow(2355, 1507, 2395, 1507, { color: C.orange, marker: 'arrowOrange' })}

  ${panel(365, 1714, 510, 158, 'Artifacts + observability', 'Reports make failures reviewable instead of opaque', { fill: C.faintGreen, stroke: C.green, titleColor: C.green, headerFill: '#ffffff' })}
  ${bulletList(390, 1796, ['Playwright reports', 'Maestro screenshots + logcat', 'Sentry and Cloudflare logs after deploy'], { size: 18, maxChars: 48, dot: C.green, lineHeight: 22 })}
  ${panel(925, 1714, 480, 158, 'Advisory automation', 'Helpful, but not a substitute for review protocol', { fill: C.faintPurple, stroke: C.purple, titleColor: C.purple, headerFill: '#ffffff' })}
  ${bulletList(950, 1796, ['Claude Code Review comments', '@claude issue and PR comment workflow', 'Self-healing CI proposals'], { size: 18, maxChars: 46, dot: C.purple, lineHeight: 22 })}
  ${panel(1455, 1714, 570, 158, 'Required verification rule', 'Changed code is not fixed code', { fill: C.faintRed, stroke: C.red, titleColor: C.red, headerFill: '#ffffff' })}
  ${bulletList(1480, 1796, ['Run related tests, lint, and typecheck', 'Break tests for security/data fixes', 'No suppressions or shortcuts'], { size: 18, maxChars: 56, dot: C.red, lineHeight: 22 })}
  ${panel(2075, 1714, 680, 158, 'Merge readiness', 'The last mile is explicit', { fill: C.faintBlue, stroke: C.blue, titleColor: C.blue, headerFill: '#ffffff' })}
  ${bulletList(2100, 1796, ['gh pr diff shows the actual changed files', 'gh pr checks must pass, including automated review signals', 'Review comments are triaged by severity before merge'], { size: 18, maxChars: 72, dot: C.blue, lineHeight: 22 })}

  ${rect(28, BOTTOM_LEGEND_Y + 14, W - 56, 126, { fill: '#fffdf6', stroke: C.navy, sw: 2.5, r: 14 })}
  ${textBlock(54, BOTTOM_LEGEND_Y + 52, 'LEGEND', { size: 22, weight: 900, fill: C.navy })}
  ${arrow(190, BOTTOM_LEGEND_Y + 48, 284, BOTTOM_LEGEND_Y + 48, { color: C.blue, marker: 'arrowBlue' })}
  ${textBlock(300, BOTTOM_LEGEND_Y + 55, 'Control / workflow dependency', { size: 18, weight: 700, fill: C.ink })}
  ${arrow(600, BOTTOM_LEGEND_Y + 48, 694, BOTTOM_LEGEND_Y + 48, { color: C.green, marker: 'arrowGreen' })}
  ${textBlock(710, BOTTOM_LEGEND_Y + 55, 'Database / test data setup', { size: 18, weight: 700, fill: C.ink })}
  ${arrow(995, BOTTOM_LEGEND_Y + 48, 1089, BOTTOM_LEGEND_Y + 48, { color: C.purple, marker: 'arrowPurple', dash: '10 8' })}
  ${textBlock(1105, BOTTOM_LEGEND_Y + 55, 'Conditional E2E or advisory lane', { size: 18, weight: 700, fill: C.ink })}
  ${arrow(1470, BOTTOM_LEGEND_Y + 48, 1564, BOTTOM_LEGEND_Y + 48, { color: C.orange, marker: 'arrowOrange' })}
  ${textBlock(1580, BOTTOM_LEGEND_Y + 55, 'Release / deploy path', { size: 18, weight: 700, fill: C.ink })}
  ${arrow(1875, BOTTOM_LEGEND_Y + 48, 1969, BOTTOM_LEGEND_Y + 48, { color: C.red, marker: 'arrowRed' })}
  ${textBlock(1985, BOTTOM_LEGEND_Y + 55, 'Risk / guardrail check', { size: 18, weight: 700, fill: C.ink })}
  ${pill(2290, BOTTOM_LEGEND_Y + 24, 142, 48, 'Required', { fill: C.faintBlue, stroke: C.blue, color: C.blue, size: 19 })}
  ${pill(2455, BOTTOM_LEGEND_Y + 24, 142, 48, 'Advisory', { fill: C.faintPurple, stroke: C.purple, color: C.purple, size: 19 })}
  ${pill(2620, BOTTOM_LEGEND_Y + 24, 160, 48, 'Manual', { fill: C.faintOrange, stroke: C.orange, color: C.orange, size: 19 })}
  ${pill(2805, BOTTOM_LEGEND_Y + 24, 176, 48, 'Scheduled', { fill: C.faintGreen, stroke: C.green, color: C.green, size: 19 })}

  ${textBlock(54, BOTTOM_LEGEND_Y + 104, 'Source: .github/workflows/{ci,e2e-ci,e2e-web,mobile-ci,deploy,claude-code-review,claude}.yml and AGENTS.md validation rules. Counts snapshot: 2026-05-01.', {
    size: 18,
    weight: 600,
    fill: C.muted,
    maxChars: 180,
  })}
</svg>
`;

await fs.writeFile(outSvg, svg, 'utf8');
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPng);

console.log(`Wrote ${path.relative(process.cwd(), outSvg)}`);
console.log(`Wrote ${path.relative(process.cwd(), outPng)}`);
