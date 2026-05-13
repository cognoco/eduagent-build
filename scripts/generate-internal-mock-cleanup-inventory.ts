import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';

type MockKind =
  | 'jest.mock'
  | 'jest.doMock'
  | 'jest.unstable_mockModule'
  | 'vi.mock';

type RiskClass = 'P0' | 'P1' | 'P2' | 'P3';

type Area =
  | 'Mobile tests'
  | 'API Inngest tests'
  | 'API eval-llm tests'
  | 'API route + top-level integration tests'
  | 'API service/middleware unit tests'
  | 'Shared package tests'
  | 'Other tests';

type Classification = {
  area: Area;
  classification: RiskClass;
  retainedReason: string;
  cleanupBatch: string;
  basis: string;
};

type MockRow = Classification & {
  file: string;
  line: number;
  mockKind: MockKind;
  target: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = resolve(
  REPO_ROOT,
  'docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv',
);

const SCAN_ROOTS = ['apps', 'packages', 'tests'];
const TEST_FILE_PATTERN = /\.(test|spec)\.(cjs|mjs|js|jsx|ts|tsx)$/;
const SKIPPED_DIRS = new Set([
  '.git',
  '.nx',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'out-tsc',
]);

const HIGH_TRAFFIC_MOBILE_FILES = new Set([
  'apps/mobile/src/app/(app)/library.test.tsx',
  'apps/mobile/src/app/(app)/session/index.test.tsx',
  'apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx',
  'apps/mobile/src/app/session-summary/[sessionId].test.tsx',
  'apps/mobile/src/components/home/ParentHomeScreen.test.tsx',
]);

function main(): void {
  const checkMode = process.argv.includes('--check');
  const rows = collectRows();
  const csv = renderCsv(rows);

  if (checkMode) {
    const existing = existsSync(OUTPUT_PATH)
      ? readFileSync(OUTPUT_PATH, 'utf-8')
      : null;
    if (existing !== csv) {
      throw new Error(
        `Mock cleanup inventory CSV is stale. Regenerate it with:\n` +
          `pnpm exec tsx scripts/generate-internal-mock-cleanup-inventory.ts`,
      );
    }
    printSummary('Verified', rows);
    return;
  }

  writeFileSync(OUTPUT_PATH, csv, 'utf-8');
  printSummary('Generated', rows);
}

function collectRows(): MockRow[] {
  const files = listTestFiles();
  const rows: MockRow[] = [];

  for (const file of files) {
    const source = readFileSync(resolve(REPO_ROOT, file), 'utf-8');
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(file),
    );

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const mockKind = getMockKind(node);
        if (mockKind) {
          const firstArg = node.arguments[0];
          const target =
            firstArg && ts.isStringLiteralLike(firstArg)
              ? firstArg.text
              : '<non-literal>';
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile),
          );
          rows.push({
            file,
            line: line + 1,
            mockKind,
            target,
            ...classifyMock(file, target),
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return rows.sort((a, b) => {
    const byFile = a.file.localeCompare(b.file);
    if (byFile !== 0) return byFile;
    const byLine = a.line - b.line;
    if (byLine !== 0) return byLine;
    return a.target.localeCompare(b.target);
  });
}

function listTestFiles(): string[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    const absRoot = resolve(REPO_ROOT, root);
    if (existsSync(absRoot)) {
      collectTestFiles(absRoot, files);
    }
  }
  return files.sort();
}

function collectTestFiles(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        collectTestFiles(absPath, files);
      }
      continue;
    }

    if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      files.push(normalizePath(relative(REPO_ROOT, absPath)));
    }
  }
}

function getScriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function getMockKind(node: ts.CallExpression): MockKind | null {
  const expression = node.expression;
  if (!ts.isPropertyAccessExpression(expression)) {
    return null;
  }

  const owner = expression.expression;
  if (!ts.isIdentifier(owner)) {
    return null;
  }

  const method = expression.name.text;
  if (owner.text === 'jest') {
    if (method === 'mock') return 'jest.mock';
    if (method === 'doMock') return 'jest.doMock';
    if (method === 'unstable_mockModule') return 'jest.unstable_mockModule';
  }

  if (owner.text === 'vi' && method === 'mock') {
    return 'vi.mock';
  }

  return null;
}

function classifyMock(file: string, target: string): Classification {
  const area = getArea(file);
  const normalizedTarget = normalizePath(target);
  const boundary = classifyBoundary(file, normalizedTarget);

  if (boundary) {
    return {
      area,
      classification: 'P3',
      retainedReason: boundary.reason,
      cleanupBatch: 'Retain',
      basis: boundary.basis,
    };
  }

  if (isIntegrationFile(file)) {
    return {
      area,
      classification: 'P0',
      retainedReason:
        'temporary-internal: integration test mock reaches app behavior',
      cleanupBatch: 'Batch 1 - integration mock ratchet',
      basis: 'integration-file-internal-target',
    };
  }

  if (file.startsWith('apps/mobile/')) {
    return {
      area,
      classification: 'P2',
      retainedReason: classifyMobileReason(normalizedTarget),
      cleanupBatch: classifyMobileBatch(file, normalizedTarget),
      basis: 'mobile-internal-target',
    };
  }

  if (isApiCriticalWorkflow(file, normalizedTarget)) {
    return {
      area,
      classification: 'P1',
      retainedReason: classifyApiReason(normalizedTarget),
      cleanupBatch: classifyApiBatch(file, normalizedTarget),
      basis: 'api-critical-workflow-target',
    };
  }

  if (file.startsWith('apps/api/')) {
    return {
      area,
      classification: 'P1',
      retainedReason: classifyApiReason(normalizedTarget),
      cleanupBatch: classifyApiBatch(file, normalizedTarget),
      basis: 'api-internal-target',
    };
  }

  if (normalizedTarget === '<non-literal>') {
    return {
      area,
      classification: 'P2',
      retainedReason: 'temporary-internal: dynamic mock target needs review',
      cleanupBatch: 'Manual review',
      basis: 'dynamic-target',
    };
  }

  return {
    area,
    classification: 'P2',
    retainedReason: 'pure-data-stub: internal fixture or package mock',
    cleanupBatch: 'Opportunistic cleanup',
    basis: 'shared-package-or-other-internal-target',
  };
}

function classifyBoundary(
  file: string,
  target: string,
): { reason: string; basis: string } | null {
  if (target === '<non-literal>') {
    return null;
  }

  if (isNativeBoundary(target)) {
    return {
      reason: 'native-boundary: platform or React Native module shim',
      basis: 'known-native-boundary',
    };
  }

  if (isExternalSdk(target)) {
    return {
      reason: 'external-boundary: third-party SDK or framework runtime',
      basis: 'known-external-sdk',
    };
  }

  if (isObservabilityBoundary(target)) {
    return {
      reason: 'observability: logging or error-capture sink',
      basis: 'observability-wrapper',
    };
  }

  if (isInngestTransportBoundary(file, target)) {
    return {
      reason: 'transport-boundary: Inngest dispatch/client capture',
      basis: 'inngest-transport-wrapper',
    };
  }

  if (
    file.startsWith('apps/api/eval-llm/') &&
    target.includes('/runner/llm-client')
  ) {
    return {
      reason: 'external-boundary: eval harness LLM transport client',
      basis: 'eval-llm-transport-wrapper',
    };
  }

  if (isProviderBoundary(target)) {
    return {
      reason: 'external-boundary: provider wrapper without app logic',
      basis: 'known-provider-wrapper',
    };
  }

  if (isMobilePlatformWrapper(target)) {
    return {
      reason: 'native-boundary: approved mobile platform wrapper',
      basis: 'mobile-platform-wrapper',
    };
  }

  return null;
}

function getArea(file: string): Area {
  if (file.startsWith('apps/mobile/')) return 'Mobile tests';
  if (file.startsWith('apps/api/eval-llm/')) return 'API eval-llm tests';
  if (file.startsWith('apps/api/src/inngest/')) return 'API Inngest tests';
  if (file.startsWith('tests/integration/')) {
    return 'API route + top-level integration tests';
  }
  if (isIntegrationFile(file) || file.startsWith('apps/api/src/routes/')) {
    return 'API route + top-level integration tests';
  }
  if (
    file.startsWith('apps/api/src/services/') ||
    file.startsWith('apps/api/src/middleware/')
  ) {
    return 'API service/middleware unit tests';
  }
  if (file.startsWith('packages/')) return 'Shared package tests';
  return 'Other tests';
}

function isIntegrationFile(file: string): boolean {
  return (
    file.startsWith('tests/integration/') ||
    file.includes('.integration.test.') ||
    file.includes('.integration.spec.')
  );
}

function isNativeBoundary(target: string): boolean {
  return [
    /^expo-router$/,
    /^expo-/,
    /^@expo\//,
    /^react-native$/,
    /^react-native-/,
    /^@react-native\//,
    /^@react-navigation\//,
    /^@expo\/vector-icons$/,
    /^nativewind$/,
  ].some((pattern) => pattern.test(target));
}

function isExternalSdk(target: string): boolean {
  return [
    /^@clerk\//,
    /^@sentry\//,
    /^stripe$/,
    /^inngest$/,
    /^inngest\//,
    /^react-i18next$/,
    /^uuid$/,
  ].some((pattern) => pattern.test(target));
}

function isObservabilityBoundary(target: string): boolean {
  return (
    target.includes('/sentry') ||
    target.endsWith('sentry') ||
    target.includes('/logger') ||
    target.endsWith('/logger')
  );
}

function isInngestTransportBoundary(file: string, target: string): boolean {
  if (
    target.includes('/inngest/client') ||
    target === '../inngest/client' ||
    target === '../../inngest/client' ||
    target === 'apps/api/src/inngest/client'
  ) {
    return true;
  }

  return (
    file.includes('/inngest/') &&
    (target === '../client' || target === './client')
  );
}

function isProviderBoundary(target: string): boolean {
  return (
    target.includes('/services/stripe') ||
    target.endsWith('/stripe') ||
    target.includes('/services/ocr') ||
    target.endsWith('/ocr') ||
    target.includes('react-native-purchases')
  );
}

function isMobilePlatformWrapper(target: string): boolean {
  return [
    '/lib/theme',
    '/lib/navigation',
    '/lib/platform-alert',
    '/lib/secure-storage',
    '/lib/haptics',
    '/lib/color-scheme',
  ].some((part) => target.includes(part));
}

function classifyMobileReason(target: string): string {
  if (target.includes('/lib/api-client')) {
    return 'ui-harness-debt: API client mock hides query/error behavior';
  }
  if (
    target.includes('/lib/profile') ||
    target.includes('/hooks/use-profile')
  ) {
    return 'ui-harness-debt: profile/auth provider is mocked';
  }
  if (target.includes('/hooks/')) {
    return 'ui-harness-debt: query or state hook is mocked';
  }
  if (target.includes('/components/')) {
    return 'ui-harness-debt: component subtree mock';
  }
  return 'ui-harness-debt: internal mobile module mock';
}

function classifyMobileBatch(file: string, target: string): string {
  if (HIGH_TRAFFIC_MOBILE_FILES.has(file)) {
    return 'Batch 3 - mobile query/profile harness';
  }

  if (
    file.includes('/progress') ||
    file.includes('/report') ||
    target.includes('/progress') ||
    target.includes('/report')
  ) {
    return 'Batch 7 - progress/report mobile screens';
  }

  if (
    target.includes('/lib/api-client') ||
    target.includes('/lib/profile') ||
    target.includes('/hooks/')
  ) {
    return 'Batch 3 - mobile query/profile harness';
  }

  return 'Opportunistic mobile cleanup';
}

function isApiCriticalWorkflow(file: string, target: string): boolean {
  return (
    file.includes('/inngest/functions/') ||
    file.includes('/routes/') ||
    file.includes('/middleware/') ||
    target.includes('@eduagent/database') ||
    target.includes('/services/') ||
    target.includes('/middleware/') ||
    target.includes('/llm') ||
    target.endsWith('/llm') ||
    target.includes('/billing') ||
    target.includes('/quota') ||
    target.includes('/settings') ||
    target.includes('/profile') ||
    target.includes('/account') ||
    target.includes('/session')
  );
}

function classifyApiReason(target: string): string {
  if (target.includes('@eduagent/database')) {
    return 'critical-workflow: database mock can hide scoping or write behavior';
  }
  if (
    target.includes('/middleware/') ||
    target.includes('/family-access') ||
    target.includes('/billing') ||
    target.includes('/quota') ||
    target.includes('/metering')
  ) {
    return 'critical-workflow: guard, ownership, quota, or billing path mocked';
  }
  if (target.includes('/llm') || target.endsWith('/llm')) {
    return 'critical-workflow: LLM router/envelope path mocked';
  }
  if (target.includes('/services/') || target.startsWith('./')) {
    return 'critical-workflow: sibling service behavior mocked';
  }
  return 'critical-workflow: API internal module mock';
}

function classifyApiBatch(file: string, target: string): string {
  if (isIntegrationFile(file)) {
    return 'Batch 1 - integration mock ratchet';
  }

  if (file.includes('/session-completed.test.')) {
    return 'Batch 2 - session-completed Inngest chain';
  }

  if (file.includes('/inngest/functions/')) {
    return 'Batch 2 - Inngest workflow harness';
  }

  if (
    target.includes('/llm') ||
    target.endsWith('/llm') ||
    target.includes('/embeddings')
  ) {
    return 'Batch 6 - LLM/provider fixture cleanup';
  }

  if (
    file.includes('/metering') ||
    file.includes('/trial') ||
    file.includes('/billing') ||
    file.includes('/quota') ||
    file.includes('/revenuecat') ||
    file.includes('/stripe') ||
    target.includes('/billing') ||
    target.includes('/quota') ||
    target.includes('/subscription')
  ) {
    return 'Batch 5 - billing/quota lifecycle';
  }

  if (file.includes('/routes/')) {
    return 'Batch 4 - API route real-service tests';
  }

  return 'Opportunistic API cleanup';
}

function renderCsv(rows: MockRow[]): string {
  const header = [
    'file',
    'line',
    'mock_kind',
    'target',
    'area',
    'classification',
    'retained_reason',
    'cleanup_batch',
    'basis',
  ];

  return (
    [
      header.join(','),
      ...rows.map((row) =>
        [
          row.file,
          String(row.line),
          row.mockKind,
          row.target,
          row.area,
          row.classification,
          row.retainedReason,
          row.cleanupBatch,
          row.basis,
        ]
          .map(csvCell)
          .join(','),
      ),
    ].join('\n') + '\n'
  );
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function printSummary(action: 'Generated' | 'Verified', rows: MockRow[]): void {
  const files = new Set(rows.map((row) => row.file));
  const jestMockRows = rows.filter((row) => row.mockKind === 'jest.mock');
  console.log(
    `${action} mock cleanup inventory: ${rows.length} rows across ` +
      `${files.size} files (${jestMockRows.length} jest.mock rows).`,
  );

  console.log('\nBy area:');
  for (const [area, areaRows] of grouped(rows, (row) => row.area)) {
    const p3 = areaRows.filter((row) => row.classification === 'P3').length;
    console.log(
      `- ${area}: ${areaRows.length - p3} internal-ish, ${p3} retained boundary`,
    );
  }

  console.log('\nBy classification:');
  for (const [risk, riskRows] of grouped(rows, (row) => row.classification)) {
    console.log(`- ${risk}: ${riskRows.length}`);
  }

  console.log('\nTop internal-ish targets:');
  for (const [target, count] of topCounts(
    rows.filter((row) => row.classification !== 'P3'),
    (row) => row.target,
    12,
  )) {
    console.log(`- ${target}: ${count}`);
  }

  console.log('\nTop internal-ish files:');
  for (const [file, count] of topCounts(
    rows.filter((row) => row.classification !== 'P3'),
    (row) => row.file,
    12,
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

function grouped<T>(
  items: T[],
  keyFn: (item: T) => string,
): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return Array.from(groups).sort(([a], [b]) => a.localeCompare(b));
}

function topCounts<T>(
  items: T[],
  keyFn: (item: T) => string,
  limit: number,
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

main();
