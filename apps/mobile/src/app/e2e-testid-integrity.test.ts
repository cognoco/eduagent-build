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
import * as path from 'path';

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
  'library-scroll',
  'library-screen',
  'library-tab',
  'home-screen',
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
  // Parent child-detail flows still reference selectors from the previous
  // all-in-one child detail page. The current child detail route is scoped to
  // profile settings, while reports, consent, and subject drill-down moved to
  // separate surfaces/components. Track this as E2E drift until the parent
  // Maestro flows are rewritten against the current navigation model.
  'subject-card-Mathematics',
  'child-reports-link',
  'consent-section',
  'withdraw-consent-button',
  'grace-period-banner',
  'cancel-deletion-button',
  'subject-raw-input-Mathematics',
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
} {
  const staticIds = new Set<string>();
  const dynamicPrefixes: string[] = [];

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

  // String literals inside JSX expression bodies. Skips template literals
  // (handled separately by dynamicPattern).
  const stringLiteralPattern =
    /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"/g;

  for (const file of tsxFiles) {
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
        stringLiteralPattern.lastIndex = 0;
        let litMatch;
        while ((litMatch = stringLiteralPattern.exec(body)) !== null) {
          staticIds.add(litMatch[1] ?? litMatch[2]!);
        }
      }
    }
  }

  return { staticIds, dynamicPrefixes };
}

function isExternalId(id: string): boolean {
  return EXTERNAL_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** IDs containing Maestro env vars (e.g. ${SUBJECT_ID}) — dynamic at runtime. */
function isMaestroEnvVar(id: string): boolean {
  return id.includes('${');
}

describe('E2E testID integrity', () => {
  const yamlFiles = collectFiles(E2E_FLOWS_DIR, '.yaml');
  const tsxFiles = collectFiles(SOURCE_DIR, '.tsx');
  const maestroIds = extractMaestroIds(yamlFiles);
  const { staticIds, dynamicPrefixes } = extractSourceTestIds(tsxFiles);

  it('should find Maestro flow files', () => {
    expect(yamlFiles.length).toBeGreaterThan(0);
  });

  it('should find source files with testIDs', () => {
    expect(staticIds.size).toBeGreaterThan(0);
  });

  // Build the list of Maestro IDs that are NOT in source (excluding known drift)
  const missingIds: Array<{ id: string; files: string[] }> = [];

  for (const [id, files] of maestroIds) {
    if (isExternalId(id)) continue;
    if (isMaestroEnvVar(id)) continue;
    if (KNOWN_DRIFT.has(id)) continue;
    if (staticIds.has(id)) continue;
    if (dynamicPrefixes.some((prefix) => id.startsWith(prefix))) continue;
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
    (id) => staticIds.has(id) || dynamicPrefixes.some((p) => id.startsWith(p)),
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
