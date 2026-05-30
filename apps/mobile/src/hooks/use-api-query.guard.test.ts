import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

// Forward-only ratchet for the read-query de-duplication (plan
// 2026-05-29-centralize-duplication-time-query-route, Phase B). useApiQuery
// absorbs the combinedSignal/assertOk/parse boilerplate; this guard counts how
// many `queryFn` sites still inline `combinedSignal(` and fails if that count
// grows. Mutation callbacks (`mutationFn`) are intentionally excluded — they
// are not migratable to useApiQuery. The long tail burns down via the
// B-followup sweep; the baseline only ever decreases.
const BASELINE = 93;

const EXCLUDED = new Set([
  'apps/mobile/src/hooks/use-api-query.ts',
  'apps/mobile/src/lib/query-timeout.ts',
]);

function repoRoot(): string {
  return resolve(__dirname, '../../../..');
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function hookSources(): string[] {
  const out = execSync(
    'git ls-files --cached --others --exclude-standard "apps/mobile/src/hooks/*.ts" "apps/mobile/src/hooks/*.tsx"',
    { cwd: repoRoot(), encoding: 'utf-8' },
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePath)
    .filter((file) => !file.endsWith('.d.ts'))
    .filter((file) => !/\.test\.|\.guard\./.test(file))
    .filter((file) => !EXCLUDED.has(file));
}

function parse(file: string): ts.SourceFile | null {
  const abs = resolve(repoRoot(), file);
  if (!existsSync(abs)) return null;
  return ts.createSourceFile(
    file,
    readFileSync(abs, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

// Count `queryFn:` property assignments whose body still calls combinedSignal().
function inlineQueryFnSites(sourceFile: ts.SourceFile): number {
  let count = 0;
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'queryFn') ||
        (ts.isStringLiteral(node.name) && node.name.text === 'queryFn'))
    ) {
      if (/combinedSignal\(/.test(node.initializer.getText(sourceFile))) {
        count += 1;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return count;
}

describe('read-query boilerplate ratchet', () => {
  const files = hookSources();

  it('enumerates hook source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('does not grow the count of inline queryFn boilerplate', () => {
    let total = 0;
    const perFile: string[] = [];
    for (const file of files) {
      const sourceFile = parse(file);
      if (!sourceFile) continue;
      const n = inlineQueryFnSites(sourceFile);
      if (n > 0) perFile.push(`${file}: ${n}`);
      total += n;
    }

    // Surfaced on failure so the offending files are obvious.
    if (total > BASELINE) {
      throw new Error(
        `Inline queryFn+combinedSignal sites rose to ${total} (baseline ${BASELINE}).\n` +
          `Use useApiQuery for new read hooks. Sites:\n${perFile.join('\n')}`,
      );
    }
    expect(total).toBeLessThanOrEqual(BASELINE);
  });
});
