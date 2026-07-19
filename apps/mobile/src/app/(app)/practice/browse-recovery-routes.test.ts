import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

// [WI-2219] Forward guard: enumerates every Practice / assessment-picker /
// quiz recovery+browse CTA that can send a learner with no eligible content
// to the app's "browse" destination. Each CTA must select its destination
// via FEATURE_FLAGS.MODE_NAV_V2_ENABLED (V2 on → /(app)/subjects, off →
// /(app)/library) rather than hardcoding /(app)/library unconditionally —
// the V0/V1→V2 cutover regression this WI fixed. Any future CTA added to
// one of these files that pushes /(app)/library outside that flag-gated
// ternary fails this test (3+ sibling-sites Fix Development Rule).
const RECOVERY_BROWSE_SITES: readonly { file: string; testID: string }[] = [
  {
    file: 'apps/mobile/src/app/(app)/practice/assessment-picker.tsx',
    testID: 'assessment-picker-browse',
  },
  {
    file: 'apps/mobile/src/app/(app)/practice/index.tsx',
    testID: 'review-empty-browse',
  },
  {
    file: 'apps/mobile/src/app/(app)/quiz/index.tsx',
    testID: 'quiz-vocab-locked',
  },
];

const LIBRARY_ROUTE = '/(app)/library';
const SUBJECTS_ROUTE = '/(app)/subjects';
const V2_FLAG_PROPERTY = 'MODE_NAV_V2_ENABLED';

function repoRoot(): string {
  return resolve(__dirname, '../../../../../..');
}

function isLibraryRouteLiteral(node: ts.Node): node is ts.StringLiteralLike {
  return ts.isStringLiteralLike(node) && node.text === LIBRARY_ROUTE;
}

function referencesV2Flag(node: ts.Node): boolean {
  let found = false;
  function visit(current: ts.Node): void {
    if (found) return;
    if (
      ts.isPropertyAccessExpression(current) &&
      current.name.text === V2_FLAG_PROPERTY
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

type UnguardedLibraryPush = {
  line: number;
  snippet: string;
};

/**
 * Finds every `/(app)/library` string literal in the file that is NOT the
 * `whenFalse` branch of a `FEATURE_FLAGS.MODE_NAV_V2_ENABLED ? '/(app)/subjects'
 * : '/(app)/library'`-shaped ternary — i.e. every unconditional/unflagged
 * library push.
 */
function findUnguardedLibraryPushes(absPath: string): UnguardedLibraryPush[] {
  const source = readFileSync(absPath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    absPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const violations: UnguardedLibraryPush[] = [];

  function visit(node: ts.Node): void {
    if (isLibraryRouteLiteral(node)) {
      const parent = node.parent;
      const isGuardedFalseBranch =
        ts.isConditionalExpression(parent) &&
        parent.whenFalse === node &&
        referencesV2Flag(parent.condition) &&
        ts.isStringLiteralLike(parent.whenTrue) &&
        parent.whenTrue.text === SUBJECTS_ROUTE;

      if (!isGuardedFalseBranch) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        violations.push({
          line: line + 1,
          snippet: node.getText(sourceFile),
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

describe('Practice/assessment-picker/quiz recovery-browse routes [WI-2219]', () => {
  it.each(RECOVERY_BROWSE_SITES)(
    'keeps $testID ($file) present as a known recovery CTA',
    ({ file, testID }) => {
      const source = readFileSync(resolve(repoRoot(), file), 'utf-8');
      expect(source).toContain(`testID="${testID}"`);
    },
  );

  it.each(RECOVERY_BROWSE_SITES)(
    '$file never targets /(app)/library outside the V2-flag-gated ternary',
    ({ file }) => {
      const violations = findUnguardedLibraryPushes(resolve(repoRoot(), file));

      if (violations.length > 0) {
        throw new Error(
          `Unguarded /(app)/library push(es) in ${file}:\n` +
            violations
              .map((v) => `  - line ${v.line}: ${v.snippet}`)
              .join('\n') +
            `\n\nEvery recovery/browse CTA must select its destination via ` +
            `FEATURE_FLAGS.MODE_NAV_V2_ENABLED ? '${SUBJECTS_ROUTE}' : '${LIBRARY_ROUTE}' ` +
            `— never push '${LIBRARY_ROUTE}' unconditionally.`,
        );
      }
    },
  );
});
