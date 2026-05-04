import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Category =
  | 'EXTERNAL'
  | 'pure-data-stub'
  | 'auth/middleware-bypass'
  | 'service-stub-with-business-logic'
  | 'redundant-with-integration-test'
  | 'rate-limit-bypass';

type SliceId =
  | 'slice-A'
  | 'slice-B'
  | 'slice-C'
  | 'slice-D'
  | 'slice-E'
  | 'slice-F'
  | 'slice-G'
  | 'slice-H'
  | 'slice-I'
  | 'slice-J';

type Basis = 'exact-override' | 'heuristic';

type Row = {
  location: string;
  file: string;
  line: number;
  specifier: string;
  slice: SliceId;
  category: Category;
  basis: Basis;
  reason: string;
};

type Override = {
  category: Category;
  reason: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const outputDir = resolve(repoRoot, 'docs/plans/2026-05-04-c1-mock-inventory');
const checkMode = process.argv.includes('--check');

const sliceTitles: Record<SliceId, string> = {
  'slice-A': 'apps/api/src/services (unit)',
  'slice-B': 'apps/api/src/routes (unit)',
  'slice-C': 'apps/api/src/middleware + apps/api/src/inngest (unit)',
  'slice-D': 'apps/mobile/src/app',
  'slice-E': 'apps/mobile/src/components',
  'slice-F': 'apps/mobile/src/hooks + apps/mobile/src/lib',
  'slice-G': 'apps/api/src local integration tests',
  'slice-H': 'tests/integration cross-package',
  'slice-I': 'apps/api/eval-llm',
  'slice-J': 'packages/*',
};

const exactOverrides: Record<string, Override> = {
  'apps/api/src/services/account.test.ts:15': {
    category: 'service-stub-with-business-logic',
    reason: 'mocks createSubscription from the internal billing service',
  },
  'apps/api/src/services/consent.test.ts:5': {
    category: 'service-stub-with-business-logic',
    reason: 'mocks internal notifications rendering and delivery helpers',
  },
  'apps/api/src/services/evaluate-data.test.ts:16': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs evaluate decision logic and failure handling',
  },
  'apps/api/src/services/interview.test.ts:5': {
    category: 'service-stub-with-business-logic',
    reason:
      'partial llm mock carries conditional behavior beyond a boundary stub',
  },
  'apps/api/src/services/interview.test.ts:42': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs curriculum bootstrap logic with multiple internal branches',
  },
  'apps/api/src/services/learner-input.test.ts:5': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs learner-profile mutation logic',
  },
  'apps/api/src/services/memory.test.ts:6': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs embedding generation logic behind an internal service',
  },
  'apps/api/src/services/notifications.test.ts:26': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs settings-driven notification behavior and counters',
  },
  'apps/api/src/services/profile.test.ts:5': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs consent state-machine logic',
  },
  'apps/api/src/services/retention-data.test.ts:12': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs retention decision helpers with real business rules',
  },
  'apps/api/src/services/retention-data.test.ts:19': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs adaptive-teaching capacity logic',
  },
  'apps/api/src/services/retention-data.test.ts:26': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs XP ledger synchronization logic',
  },
  'apps/api/src/services/session/session-cache.test.ts:20': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs prior-learning fetch and summarization logic',
  },
  'apps/api/src/services/session/session-cache.test.ts:29': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs retention preference logic',
  },
  'apps/api/src/services/session/session-cache.test.ts:35': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs settings-driven learning mode logic',
  },
  'apps/api/src/services/session/session-cache.test.ts:40': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs learner-profile context building logic',
  },
  'apps/api/src/services/snapshot-aggregation.test.ts:8': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs milestone detection logic',
  },
  'apps/api/src/services/snapshot-aggregation.test.ts:13': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs celebration queueing logic',
  },
  'apps/api/src/services/snapshot-aggregation.test.ts:17': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs language curriculum progress logic',
  },
  'apps/api/src/services/verification-completion.test.ts:16': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs evaluate parsing and SM-2 mapping logic',
  },
  'apps/api/src/services/verification-completion.test.ts:22': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs teach-back parsing and rubric mapping logic',
  },
  'apps/api/src/services/xp.test.ts:12': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs settings-derived XP mode rules',
  },
  'apps/api/src/routes/consent.test.ts:41': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses Clerk JWT verification in route tests',
  },
  'apps/api/src/routes/dashboard.test.ts:5': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses Clerk JWT verification in route tests',
  },
  'apps/api/src/routes/dashboard.test.ts:47': {
    category: 'service-stub-with-business-logic',
    reason: 'mixes real and fake dashboard service behavior',
  },
  'apps/api/src/routes/dashboard.test.ts:61': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses parent-access enforcement via family-access',
  },
  'apps/api/src/routes/dashboard.test.ts:74': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs weekly-report service behavior',
  },
  'apps/api/src/routes/dictation.test.ts:49': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses metering via mocked billing service',
  },
  'apps/api/src/routes/dictation.test.ts:83': {
    category: 'rate-limit-bypass',
    reason: 'disables checkAndLogRateLimit in route coverage',
  },
  'apps/api/src/routes/homework.test.ts:61': {
    category: 'service-stub-with-business-logic',
    reason: 'defines SubjectInactiveError inline while stubbing session logic',
  },
  'apps/api/src/routes/interview.test.ts:20': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses Clerk JWT verification in route tests',
  },
  'apps/api/src/routes/interview.test.ts:103': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses metering via mocked billing service',
  },
  'apps/api/src/routes/interview.test.ts:152': {
    category: 'service-stub-with-business-logic',
    reason: 'partial interview service mock hides real branching',
  },
  'apps/api/src/routes/learner-profile.test.ts:13': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses Clerk JWT verification in route tests',
  },
  'apps/api/src/routes/learner-profile.test.ts:72': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses family-access ownership checks',
  },
  'apps/api/src/routes/quiz.test.ts:1': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses Clerk JWT verification in route tests',
  },
  'apps/api/src/routes/quiz.test.ts:30': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses metering via mocked billing service',
  },
  'apps/api/src/routes/sessions.test.ts:5': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses Clerk JWT verification in route tests',
  },
  'apps/api/src/routes/sessions.test.ts:130': {
    category: 'service-stub-with-business-logic',
    reason:
      'defines SubjectInactiveError inline and replaces many session methods',
  },
  'apps/api/src/routes/sessions.test.ts:327': {
    category: 'service-stub-with-business-logic',
    reason: 'partial interleaved service mock hides internal branching',
  },
  'apps/api/src/routes/stripe-webhook.test.ts:23': {
    category: 'service-stub-with-business-logic',
    reason: 'stubs subscription tier config branching',
  },
  'apps/api/src/routes/subjects.test.ts:72': {
    category: 'service-stub-with-business-logic',
    reason:
      'defines SubjectNotLanguageLearningError inline and overrides behavior',
  },
  'apps/api/src/middleware/auth.test.ts:33': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses JWT verification while testing auth middleware',
  },
  'apps/api/src/middleware/metering.test.ts:6': {
    category: 'auth/middleware-bypass',
    reason: 'bypasses JWT verification while testing metering middleware',
  },
  'apps/api/src/middleware/profile-scope.test.ts:17': {
    category: 'service-stub-with-business-logic',
    reason: 'getProfile mock branches on profileId',
  },
  'apps/api/src/inngest/functions/consent-reminders.test.ts:17': {
    category: 'service-stub-with-business-logic',
    reason: 'helper mock contains nested consent-state branching',
  },
  'apps/api/src/inngest/functions/freeform-filing.test.ts:56': {
    category: 'service-stub-with-business-logic',
    reason: 'createScopedRepository mock carries inline session logic',
  },
  'apps/api/src/inngest/functions/interview-persist-curriculum.test.ts:26': {
    category: 'service-stub-with-business-logic',
    reason: 'partial interview service mock hides curriculum branching',
  },
  'apps/api/src/inngest/functions/quota-reset.test.ts:53': {
    category: 'service-stub-with-business-logic',
    reason: 'subscription config mock branches by tier',
  },
  'apps/api/src/inngest/functions/trial-expiry.test.ts:57': {
    category: 'service-stub-with-business-logic',
    reason: 'trial mock branches by days-until-expiry',
  },
  'apps/api/src/services/quiz/vocabulary.integration.test.ts:1': {
    category: 'service-stub-with-business-logic',
    reason:
      'full llm barrel mock hides router and safety logic in an integration test',
  },
  'apps/api/src/services/session-summary.integration.test.ts:17': {
    category: 'EXTERNAL',
    reason:
      'partial llm mock replaces only routeAndCall at the provider boundary',
  },
  'apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts:22':
    {
      category: 'EXTERNAL',
      reason: 'partial llm mock replaces routeAndCall at the provider boundary',
    },
  'apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts:28':
    {
      category: 'service-stub-with-business-logic',
      reason:
        'full notifications barrel mock hides internal formatting and delivery behavior',
    },
};

const externalSpecifiers = [
  /^expo-router$/,
  /^expo-/,
  /^@expo\//,
  /^react-native/,
  /^@react-native\//,
  /^@react-navigation\//,
  /^@expo\/vector-icons$/,
  /^@clerk\//,
  /^@sentry\//,
  /^nativewind$/,
  /^stripe$/,
  /^inngest$/,
  /^inngest\//,
  /^react-i18next$/,
];

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf-8',
  }).trim();
}

function listTestFiles(): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--', '*.test.ts', '*.test.tsx'],
    {
      cwd: repoRoot,
      encoding: 'utf-8',
    }
  );

  return output
    .split('\0')
    .map((file) => file.trim().replace(/\\/g, '/'))
    .filter((file) => file.length > 0)
    .filter((file) => getSlice(file) !== null);
}

function getSlice(file: string): SliceId | null {
  if (file.startsWith('apps/api/eval-llm/')) return 'slice-I';
  if (file.startsWith('packages/')) return 'slice-J';
  if (file.startsWith('tests/integration/')) return 'slice-H';
  if (file.startsWith('apps/api/src/') && file.includes('.integration.test.')) {
    return 'slice-G';
  }
  if (file.startsWith('apps/api/src/routes/')) return 'slice-B';
  if (
    file.startsWith('apps/api/src/middleware/') ||
    file.startsWith('apps/api/src/inngest/')
  ) {
    return 'slice-C';
  }
  if (file.startsWith('apps/api/src/services/')) return 'slice-A';
  if (file.startsWith('apps/mobile/src/app/')) return 'slice-D';
  if (file.startsWith('apps/mobile/src/components/')) return 'slice-E';
  if (
    file.startsWith('apps/mobile/src/hooks/') ||
    file.startsWith('apps/mobile/src/lib/')
  ) {
    return 'slice-F';
  }
  return null;
}

function findMocks(
  file: string,
  source: string
): Array<{ line: number; specifier: string }> {
  const matches: Array<{ line: number; specifier: string }> = [];
  const pattern = /jest\.mock\s*\(\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null = pattern.exec(source);

  while (match) {
    const before = source.slice(0, match.index);
    const line = before.split(/\r?\n/).length;
    matches.push({
      line,
      specifier: match[1] ?? '',
    });
    match = pattern.exec(source);
  }

  return matches;
}

function isExternalSpecifier(specifier: string): boolean {
  const normalized = specifier.replace(/\\/g, '/');

  if (externalSpecifiers.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (
    normalized.includes('/sentry') ||
    normalized.includes('/stripe') ||
    normalized.includes('/inngest/client') ||
    normalized.includes('services/ocr') ||
    normalized.includes('react-native-purchases')
  ) {
    return true;
  }

  if (
    normalized.includes('/llm') ||
    normalized.includes('llm-client') ||
    normalized.includes('llm/router')
  ) {
    return true;
  }

  return false;
}

function isMobileBusinessLogicMock(specifier: string): boolean {
  const normalized = specifier.replace(/\\/g, '/');
  const businessPatterns = [
    '/lib/api-client',
    '/hooks/use-progress',
    '/hooks/use-settings',
    '/hooks/use-curriculum',
    '/hooks/use-sessions',
    '/hooks/use-interview',
    '/hooks/use-homework-ocr',
    '/hooks/use-account',
    '/hooks/use-parent-proxy',
    '/hooks/use-milestone-tracker',
    '/hooks/use-dashboard',
    '/hooks/use-retry-filing',
    '/hooks/use-speech-recognition',
    '/hooks/use-text-to-speech',
    '/lib/message-outbox',
    '/lib/secure-storage',
    '/lib/session-recovery',
    '/lib/sse',
    '/lib/analytics',
  ];

  return businessPatterns.some((part) => normalized.includes(part));
}

function isPureDataStubSpecifier(specifier: string): boolean {
  const normalized = specifier.replace(/\\/g, '/');
  const purePatterns = [
    '@eduagent/database',
    '@eduagent/schemas',
    '/utils/uuid',
    '/services/account',
    '/services/profile',
    '/lib/profile',
    '/lib/theme',
    '/lib/navigation',
    '/lib/platform-alert',
    '/lib/format-api-error',
    '/subject',
    '/logger',
    '/parking-lot',
  ];

  return purePatterns.some((part) => normalized.includes(part));
}

function classify(
  file: string,
  line: number,
  specifier: string,
  slice: SliceId
): Override & { basis: Basis } {
  const key = `${file}:${line}`;
  const normalized = specifier.replace(/\\/g, '/');

  if (exactOverrides[key]) {
    return { ...exactOverrides[key], basis: 'exact-override' };
  }

  if (
    normalized.includes('middleware/jwt') ||
    normalized.endsWith('/jwt') ||
    normalized.includes('middleware/auth') ||
    normalized.includes('services/family-access')
  ) {
    return {
      category: 'auth/middleware-bypass',
      basis: 'heuristic',
      reason: 'bypasses auth or ownership middleware in test coverage',
    };
  }

  if (
    (slice === 'slice-B' || slice === 'slice-C') &&
    normalized.includes('/services/billing')
  ) {
    return {
      category: 'auth/middleware-bypass',
      basis: 'heuristic',
      reason: 'bypasses quota or metering checks through mocked billing state',
    };
  }

  if (slice === 'slice-H') {
    if (
      normalized.includes('apps/api/src/inngest/client') ||
      normalized.includes('apps/api/src/services/stripe') ||
      normalized.includes('apps/api/src/services/sentry')
    ) {
      return {
        category: 'EXTERNAL',
        basis: 'heuristic',
        reason:
          'cross-package integration mock targets an external-boundary adapter',
      };
    }
  }

  if (slice === 'slice-I' && normalized.includes('runner/llm-client')) {
    return {
      category: 'EXTERNAL',
      basis: 'heuristic',
      reason: 'eval harness mock replaces the runner LLM transport boundary',
    };
  }

  if (
    (slice === 'slice-C' || slice === 'slice-G') &&
    (normalized === '../client' || normalized === './client')
  ) {
    return {
      category: 'EXTERNAL',
      basis: 'heuristic',
      reason: 'mock targets the Inngest client wrapper boundary',
    };
  }

  if (slice === 'slice-F' && normalized.includes('/hooks/use-revenuecat')) {
    return {
      category: 'EXTERNAL',
      basis: 'heuristic',
      reason: 'hook wraps the RevenueCat SDK boundary',
    };
  }

  if (isExternalSpecifier(normalized)) {
    return {
      category: 'EXTERNAL',
      basis: 'heuristic',
      reason: 'mock targets an external SDK or adapter boundary',
    };
  }

  if (
    (slice === 'slice-D' || slice === 'slice-E' || slice === 'slice-F') &&
    isMobileBusinessLogicMock(normalized)
  ) {
    return {
      category: 'service-stub-with-business-logic',
      basis: 'heuristic',
      reason: 'mobile test mock replaces app-level hook or client logic',
    };
  }

  if (isPureDataStubSpecifier(normalized)) {
    return {
      category: 'pure-data-stub',
      basis: 'heuristic',
      reason:
        'mock returns fixtures or constants without crossing a real boundary',
    };
  }

  if (normalized.startsWith('./') || normalized.startsWith('../')) {
    return {
      category: 'pure-data-stub',
      basis: 'heuristic',
      reason:
        'relative mock defaults to an internal fixture stub unless overridden',
    };
  }

  return {
    category: 'EXTERNAL',
    basis: 'heuristic',
    reason: 'bare-module mock defaults to an external dependency boundary',
  };
}

function renderTsv(rows: Row[]): string {
  const header = ['location', 'specifier', 'category', 'basis', 'reason'].join(
    '\t'
  );
  const body = rows
    .map((row) =>
      [row.location, row.specifier, row.category, row.basis, row.reason].join(
        '\t'
      )
    )
    .join('\n');
  return `${header}\n${body}\n`;
}

function renderSummary(rows: Row[], commit: string, branch: string): string {
  const total = rows.length;
  const files = new Set(rows.map((row) => row.file)).size;
  const byCategory = groupCount(rows, (row) => row.category);
  const bySlice = groupCount(rows, (row) => row.slice);

  const categoryLines = Object.entries(byCategory)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, count]) => `| \`${category}\` | ${count} |`)
    .join('\n');

  const sliceLines = Object.entries(sliceTitles)
    .map(([slice, title]) => {
      const count = bySlice[slice as SliceId] ?? 0;
      return `| \`${slice}\` | ${title} | ${count} |`;
    })
    .join('\n');

  return `# C1 Mock Inventory Artifacts

Generated from repo state with \`pnpm exec tsx scripts/generate-c1-mock-inventory.ts\`.

- Commit: \`${commit}\`
- Branch: \`${branch}\`
- Total \`jest.mock()\` rows: **${total}**
- Test files with at least one row: **${files}**

Rows are classified with a mix of exact overrides from the Phase 1 plan and
repeatable heuristics. The \`basis\` column in each TSV shows which path was
used for that row.

## Category Counts

| Category | Count |
| --- | ---: |
${categoryLines}

## Slice Counts

| Slice | Surface | Count |
| --- | --- | ---: |
${sliceLines}
`;
}

function groupCount<T>(
  items: T[],
  keyFn: (item: T) => string
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function writeFileChecked(filePath: string, content: string): boolean {
  const existing = safeRead(filePath);
  if (checkMode) {
    return existing === content;
  }

  writeFileSync(filePath, content, 'utf-8');
  return true;
}

function safeRead(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function main(): void {
  const files = listTestFiles();
  const rows: Row[] = [];

  for (const file of files) {
    const slice = getSlice(file);
    if (!slice) continue;

    const absPath = resolve(repoRoot, file);
    const source = readFileSync(absPath, 'utf-8');
    for (const mock of findMocks(file, source)) {
      const classified = classify(file, mock.line, mock.specifier, slice);
      rows.push({
        location: `${file}:${mock.line}`,
        file,
        line: mock.line,
        specifier: mock.specifier,
        slice,
        category: classified.category,
        basis: classified.basis,
        reason: classified.reason,
      });
    }
  }

  rows.sort((a, b) => a.location.localeCompare(b.location));

  const commit = git(['rev-parse', '--short', 'HEAD']);
  const branch = git(['branch', '--show-current']);
  const summary = renderSummary(rows, commit, branch);
  const bySlice = rows.reduce<Record<SliceId, Row[]>>((acc, row) => {
    acc[row.slice] ??= [];
    acc[row.slice].push(row);
    return acc;
  }, {} as Record<SliceId, Row[]>);

  mkdirSync(outputDir, { recursive: true });

  const filesToWrite: Array<{ path: string; content: string }> = [
    {
      path: resolve(outputDir, 'README.md'),
      content: summary,
    },
    ...Object.keys(sliceTitles).map((slice) => ({
      path: resolve(outputDir, `${slice}.tsv`),
      content: renderTsv(bySlice[slice as SliceId] ?? []),
    })),
  ];

  const staleFiles = filesToWrite.filter(
    (entry) => !writeFileChecked(entry.path, entry.content)
  );

  if (checkMode && staleFiles.length > 0) {
    const names = staleFiles
      .map((entry) => relative(repoRoot, entry.path).replace(/\\/g, '/'))
      .join('\n');
    throw new Error(
      `C1 mock inventory artifacts are out of date. Regenerate them with:\n` +
        `pnpm exec tsx scripts/generate-c1-mock-inventory.ts\n\n` +
        `Stale files:\n${names}`
    );
  }

  const total = rows.length;
  const fileCount = new Set(rows.map((row) => row.file)).size;
  console.log(
    `${
      checkMode ? 'Verified' : 'Generated'
    } C1 mock inventory: ${total} rows across ${fileCount} files.`
  );
}

main();
