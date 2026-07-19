// ---------------------------------------------------------------------------
// Static analysis test: every Maestro E2E id selector must match a testID
// in source code.
//
// Prevents the class of bug where a refactor renames or removes a testID
// but Maestro flows still reference the old name — causing silent E2E
// failures that look like navigation timeouts.
//
// No rendering, no mocking — pure source + YAML analysis.
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

const E2E_FLOWS_DIR = path.resolve(__dirname, '../../e2e/flows');
const SOURCE_DIR = path.resolve(__dirname, '..');

// Platform / third-party IDs that are not React Native testIDs
const EXTERNAL_ID_PREFIXES = ['android:id/', 'com.android.', 'com.google.'];

// Pre-existing testID drift from earlier refactors. Each entry is a Maestro id
// selector that no longer has a matching testID in source. These E2E flows are
// already broken and should be fixed — but we track them here so this test
// catches NEW regressions without blocking on the backlog.
//
// When you fix one: remove it from this set, add/restore the testID in source,
// and update the Maestro flow if needed.
const KNOWN_DRIFT = new Set([
  // coaching-card + coaching-card-primary: FIXED — all E2E flows updated to intent-* cards
  // add-subject-button: FIXED — all E2E flows updated to intent-learn
  // Tab bar IDs: now captured via tabBarButtonTestID pattern extraction
  // Profile creation persona selectors
  'persona-auto-hint',
  'persona-learner',
  'persona-teen',
  'persona-theme-parent',
  // Location selectors from consent/COPPA flows
  'location-us',
  'location-eu',
  'location-other',
  // Library/learning screens renamed during route restructuring
  // library-screen: FIXED — testID added to apps/mobile/src/app/(app)/library.tsx root View
  // home-screen: FIXED — testID added to apps/mobile/src/app/(app)/home.tsx root View
  'library-scroll',
  'library-tab',
  'learn-new-screen',
  'shelf-book-list',
  // Session summary
  'summary-score',
  'summary-topics',
  'summary-close',
  // Parent dashboard
  'parent-dashboard-summary',
  'parent-dashboard-summary-primary',
  'child-card',
  'transcript-scroll',
  'exchange-0',
  'guided-info-0',
  // Subject filter
  'subject-filter-tabs',
  'filter-all',
  // Intent cards
  'intent-learn-new',
  'intent-freeform',
  // Retention/recall
  'recall-question',
  'recall-answer-input',
  'recall-submit',
  // Practice subject picker
  'practice-subject-picker',
  // Settings accent color swatches (removed during theme refactor)
  'accent-swatch-teal',
  'accent-swatch-rose',
  'accent-swatch-indigo',
  // Parent/teen view switcher
  'switch-to-teen',
  // Password toggle on sign-in (removed or renamed in PasswordInput)
  'sign-in-password-toggle',
  // Library refactor in progress: empty-state component removed
  // (BookRow/LibraryEmptyState deletion). bug-237 Maestro flow needs update.
  'library-add-subject-empty',
  // dashboard-scroll: legacy Family-dashboard testID. dashboard.tsx is now a
  // <Redirect /> stub kept for old deep links (see screen-navigation
  // EXEMPT_SCREENS). seed-and-sign-in.yaml + return-to-home-safe.yaml still
  // reference it as an *optional/notVisible* fallback landing alongside
  // learner-screen and parent-home-screen — safe to leave in place, but the
  // Maestro flows can drop these branches in a follow-up cleanup.
  'dashboard-scroll',
  // DRAFT slow-net flows (first-curriculum-polling-timeout, sse-reconnect-banner)
  // use this sentinel for testIDs that need to be added to source code before
  // the flow can run. Each flow's header lists the prerequisite work.
  '<PLACEHOLDER_TESTID>',
]);

function collectFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  function walk(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(ext)) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function isTestOnlySourceFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  return (
    /\.(?:test|spec|fixture|fixtures)\.[jt]sx?$/.test(normalized) ||
    /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|fixtures|test-utils)(?:\/|$)/.test(
      normalized,
    ) ||
    /(?:^|\/)(?:test-setup|setup-tests?|setupTests|jest\.setup)\.[jt]sx?$/.test(
      normalized,
    )
  );
}

function extractValueProducingTestIds(expression: string): {
  staticIds: string[];
  dynamicPrefixes: string[];
} {
  const sourceFile = ts.createSourceFile(
    'test-id-expression.tsx',
    `const value = (${expression});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const statement = sourceFile.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) {
    return { staticIds: [], dynamicPrefixes: [] };
  }

  const initializer = statement.declarationList.declarations[0]?.initializer;
  if (!initializer) return { staticIds: [], dynamicPrefixes: [] };

  const staticIds: string[] = [];
  const dynamicPrefixes: string[] = [];
  function collectValue(node: ts.Expression): void {
    if (ts.isParenthesizedExpression(node)) {
      collectValue(node.expression);
    } else if (
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      collectValue(node.expression);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      if (node.text) staticIds.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      if (node.head.text) dynamicPrefixes.push(node.head.text);
    } else if (ts.isConditionalExpression(node)) {
      collectValue(node.whenTrue);
      collectValue(node.whenFalse);
    } else if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.QuestionQuestionToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.AmpersandAmpersandToken,
      ].includes(node.operatorToken.kind)
    ) {
      collectValue(node.left);
      collectValue(node.right);
    }
  }

  collectValue(initializer);
  return { staticIds, dynamicPrefixes };
}

/** Extract id: "..." selectors from Maestro YAML flows (non-comment lines). */
function extractMaestroIds(yamlFiles: string[]): Map<string, string[]> {
  const idToFiles = new Map<string, string[]>();
  const idPattern = /^\s*(?:id:\s*"([^"]+)"|id:\s*'([^']+)')/;

  for (const file of yamlFiles) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('#')) continue;
      const match = idPattern.exec(line);
      if (match) {
        const id = match[1] ?? match[2]!;
        const existing = idToFiles.get(id);
        const relPath = path.relative(E2E_FLOWS_DIR, file).replace(/\\/g, '/');
        if (existing) {
          if (!existing.includes(relPath)) existing.push(relPath);
        } else {
          idToFiles.set(id, [relPath]);
        }
      }
    }
  }
  return idToFiles;
}

/** Extract static testIDs and dynamic testID prefixes from source TSX files. */
function extractSourceTestIds(tsxFiles: string[]): {
  staticIds: Set<string>;
  dynamicPrefixes: string[];
  derivedSuffixes: string[];
} {
  const staticIds = new Set<string>();
  const dynamicPrefixes: string[] = [];
  const derivedSuffixes: string[] = [];

  // Static: testID="value", testID='value', testID: 'value', testID: "value"
  // Also: tabBarButtonTestID: 'value' (Expo Router tab config)
  const staticPatterns = [
    /testID="([^"]+)"/g,
    /testID='([^']+)'/g,
    /testID:\s*'([^']+)'/g,
    /testID:\s*"([^"]+)"/g,
    /tabBarButtonTestID:\s*'([^']+)'/g,
    /tabBarButtonTestID:\s*"([^"]+)"/g,
  ];

  // Dynamic template: testID={`prefix-${...}`} — extract the prefix before ${
  const dynamicPattern = /testID=\{`([^$`]+)\$\{/g;
  // Derived suffix: testID={testID ? `${testID}-primary` : undefined}
  const derivedSuffixPattern =
    /testID=\{[^`]*`\$\{[^}]+\}([^`$]+)`\s*:\s*undefined\s*\}/g;

  for (const file of tsxFiles) {
    // Test mocks are not evidence that the production app emits an ID.
    if (isTestOnlySourceFile(file)) continue;

    const source = fs.readFileSync(file, 'utf-8');

    for (const pattern of staticPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source)) !== null) {
        staticIds.add(match[1]!);
      }
    }

    dynamicPattern.lastIndex = 0;
    let match;
    while ((match = dynamicPattern.exec(source)) !== null) {
      dynamicPrefixes.push(match[1]!);
    }

    derivedSuffixPattern.lastIndex = 0;
    while ((match = derivedSuffixPattern.exec(source)) !== null) {
      derivedSuffixes.push(match[1]!);
    }

    // Walk every `testID={...}` expression body with balanced-brace tracking
    // (so nested template-literal interpolations don't terminate early), then
    // pull string literals — covers ternary, ??, ||, bare-literal expressions:
    //   testID={cond ? 'result-text-input' : `problem-input-${i}`} → 'result-text-input'
    //   testID={messagesTestID ?? 'chat-messages'}                  → 'chat-messages'
    //   testID={x || 'fallback'}                                    → 'fallback'
    const startRe = /testID=\{/g;
    let startMatch;
    while ((startMatch = startRe.exec(source)) !== null) {
      let depth = 1;
      let i = startMatch.index + startMatch[0].length;
      const start = i;
      let inString: '"' | "'" | '`' | null = null;
      while (i < source.length && depth > 0) {
        const ch = source[i];
        const prev = i > 0 ? source[i - 1] : '';
        if (inString) {
          if (ch === inString && prev !== '\\') inString = null;
        } else {
          if (ch === '"' || ch === "'" || ch === '`') {
            inString = ch as '"' | "'" | '`';
          } else if (ch === '{') {
            depth++;
          } else if (ch === '}') {
            depth--;
            if (depth === 0) break;
          }
        }
        i++;
      }
      if (depth === 0) {
        const body = source.slice(start, i);
        const valueIds = extractValueProducingTestIds(body);
        dynamicPrefixes.push(...valueIds.dynamicPrefixes);
        for (const id of valueIds.staticIds) {
          staticIds.add(id);
        }
      }
    }
  }

  return { staticIds, dynamicPrefixes, derivedSuffixes };
}

function isExternalId(id: string): boolean {
  return EXTERNAL_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** IDs containing Maestro env vars (e.g. ${SUBJECT_ID}) — dynamic at runtime. */
function isMaestroEnvVar(id: string): boolean {
  return id.includes('${');
}

function withTempSource(
  relativePath: string,
  source: string,
  assertion: (fixturePath: string) => void,
): void {
  const fixtureDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'e2e-testid-integrity-'),
  );
  const fixturePath = path.join(fixtureDir, relativePath);

  try {
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
    fs.writeFileSync(fixturePath, source);
    assertion(fixturePath);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
}

describe('E2E testID integrity', () => {
  const yamlFiles = collectFiles(E2E_FLOWS_DIR, '.yaml');
  // Scan both .tsx and .ts — testIDs can live in non-JSX modules too (e.g.,
  // hooks that return toast configs with a `testID:` field, like
  // use-clone-from-child.ts → 'clone-toast-open').
  const sourceFiles = [
    ...collectFiles(SOURCE_DIR, '.tsx'),
    ...collectFiles(SOURCE_DIR, '.ts'),
  ];
  const maestroIds = extractMaestroIds(yamlFiles);
  const { staticIds, dynamicPrefixes, derivedSuffixes } =
    extractSourceTestIds(sourceFiles);

  function hasMatchingDerivedSuffix(id: string): boolean {
    return derivedSuffixes.some(
      (suffix) =>
        id.endsWith(suffix) && staticIds.has(id.slice(0, -suffix.length)),
    );
  }

  it('should find Maestro flow files', () => {
    expect(yamlFiles.length).toBeGreaterThan(0);
  });

  it('should find source files with testIDs', () => {
    expect(staticIds.size).toBeGreaterThan(0);
  });

  it('finds dynamic testID prefixes nested in conditional expressions', () => {
    withTempSource(
      'conditional.tsx',
      'const row = <View testID={complete ? `assistant-response-complete-$' +
        '{index}` : undefined} />;',
      (fixturePath) => {
        expect(extractSourceTestIds([fixturePath]).dynamicPrefixes).toContain(
          'assistant-response-complete-',
        );
      },
    );
  });

  it.each([
    {
      kind: 'static string',
      source:
        "const row = <View testID={'satisfies-static-id' satisfies string} />;",
      collection: 'staticIds',
      expected: 'satisfies-static-id',
    },
    {
      kind: 'dynamic template',
      source:
        'const row = <View testID={(`satisfies-dynamic-$' +
        '{index}` satisfies string)} />;',
      collection: 'dynamicPrefixes',
      expected: 'satisfies-dynamic-',
    },
  ] as const)(
    'finds $kind testIDs under satisfies expressions',
    ({ source, collection, expected }) => {
      withTempSource('satisfies.tsx', source, (fixturePath) => {
        expect(extractSourceTestIds([fixturePath])[collection]).toContain(
          expected,
        );
      });
    },
  );

  it('ignores static testIDs from test files', () => {
    withTempSource(
      'static.test.tsx',
      'const row = <View testID="mock-static" />;',
      (fixturePath) => {
        expect(extractSourceTestIds([fixturePath]).staticIds).not.toContain(
          'mock-static',
        );
      },
    );
  });

  it('ignores direct dynamic testID prefixes from spec files', () => {
    withTempSource(
      'dynamic.spec.tsx',
      'const row = <View testID={`mock-direct-$' + '{index}`} />;',
      (fixturePath) => {
        expect(
          extractSourceTestIds([fixturePath]).dynamicPrefixes,
        ).not.toContain('mock-direct-');
      },
    );
  });

  it('ignores templates used only inside a testID predicate', () => {
    withTempSource(
      'predicate.tsx',
      'const row = <View testID={shouldRender(`decoy-$' +
        "{index}`) ? 'actual-id' : undefined} />;",
      (fixturePath) => {
        const extracted = extractSourceTestIds([fixturePath]);
        expect(extracted.dynamicPrefixes).not.toContain('decoy-');
        expect(extracted.staticIds).toContain('actual-id');
      },
    );
  });

  it('ignores quoted values used only inside a testID predicate', () => {
    withTempSource(
      'quoted-predicate.tsx',
      "const row = <View testID={shouldRender('quoted-decoy') ? 'actual-id' : undefined} />;",
      (fixturePath) => {
        const extracted = extractSourceTestIds([fixturePath]);
        expect(extracted.staticIds).not.toContain('quoted-decoy');
        expect(extracted.staticIds).toContain('actual-id');
      },
    );
  });

  it('ignores quoted values passed to a testID helper', () => {
    withTempSource(
      'call-argument.tsx',
      "const row = <View testID={formatTestId('call-argument-decoy')} />;",
      (fixturePath) => {
        expect(extractSourceTestIds([fixturePath]).staticIds).not.toContain(
          'call-argument-decoy',
        );
      },
    );
  });

  it('ignores the concrete test-utils native redirect shim', () => {
    const nativeShimsPath = path.join(
      SOURCE_DIR,
      'test-utils',
      'native-shims.ts',
    );

    expect(extractSourceTestIds([nativeShimsPath]).staticIds).not.toContain(
      'redirect',
    );
  });

  it('ignores fixture and test setup source paths', () => {
    withTempSource(
      '__fixtures__/mock-source.tsx',
      'const row = <View testID="fixture-only" />;',
      (fixturePath) => {
        expect(extractSourceTestIds([fixturePath]).staticIds).not.toContain(
          'fixture-only',
        );
      },
    );
    withTempSource(
      'test-setup.ts',
      'const row = <View testID="setup-only" />;',
      (fixturePath) => {
        expect(extractSourceTestIds([fixturePath]).staticIds).not.toContain(
          'setup-only',
        );
      },
    );
  });

  // Build the list of Maestro IDs that are NOT in source (excluding known drift)
  const missingIds: Array<{ id: string; files: string[] }> = [];

  for (const [id, files] of maestroIds) {
    if (isExternalId(id)) continue;
    if (isMaestroEnvVar(id)) continue;
    if (KNOWN_DRIFT.has(id)) continue;
    if (staticIds.has(id)) continue;
    if (dynamicPrefixes.some((prefix) => id.startsWith(prefix))) continue;
    if (hasMatchingDerivedSuffix(id)) continue;
    missingIds.push({ id, files });
  }

  it('every Maestro id: selector must match a testID in source', () => {
    if (missingIds.length > 0) {
      const report = missingIds
        .map(({ id, files }) => `  "${id}" used in: ${files.join(', ')}`)
        .join('\n');
      throw new Error(
        `${missingIds.length} Maestro id selector(s) have no matching testID in source:\n${report}\n\n` +
          'Either the testID was removed/renamed in source (add it back) or ' +
          'the Maestro flow needs updating. If this is pre-existing drift, ' +
          'add it to KNOWN_DRIFT with a comment explaining when it will be fixed.',
      );
    }
  });

  // Shrink-wrap: alert when a KNOWN_DRIFT entry is fixed (testID re-added)
  // so the entry can be removed from the allowlist.
  const resolvedDrift = [...KNOWN_DRIFT].filter(
    (id) =>
      staticIds.has(id) ||
      dynamicPrefixes.some((p) => id.startsWith(p)) ||
      hasMatchingDerivedSuffix(id),
  );

  it('KNOWN_DRIFT entries should be removed once fixed', () => {
    if (resolvedDrift.length > 0) {
      throw new Error(
        `${resolvedDrift.length} KNOWN_DRIFT entry/entries now have matching testIDs in source — remove them from the allowlist:\n` +
          resolvedDrift.map((id) => `  "${id}"`).join('\n'),
      );
    }
  });
});
