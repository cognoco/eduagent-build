import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

// [WI-2467] Scoped sibling-site forward guard: enumerates the four WI-2467
// empty-state "browse Library" CTAs outside WI-2219's Practice/
// assessment-picker/quiz scope
// (apps/mobile/src/app/(app)/practice/browse-recovery-routes.test.ts). Each
// CTA must select its destination via FEATURE_FLAGS.MODE_NAV_V2_ENABLED (V2
// on -> /(app)/subjects, off -> /(app)/library) rather than hardcoding
// /(app)/library unconditionally -- the same V0/V1->V2 cutover regression
// WI-2219 fixed, at these sibling sites its enumeration guard didn't cover.
// Any future CTA added to one of these four files that pushes
// /(app)/library outside that flag-gated ternary fails this test (3+
// sibling-sites Fix Development Rule). This guard covers exactly the four
// WI-2467 AC-listed sites -- it is not an app-wide scan of every
// /(app)/library reference in the codebase.
const BROWSE_LIBRARY_CTA_SITES: readonly { file: string; testID: string }[] = [
  {
    file: 'apps/mobile/src/components/progress/AccordionTopicList.tsx',
    testID: 'accordion-topics-browse',
  },
  {
    file: 'apps/mobile/src/app/(app)/_subscription/_components/ChildPaywall.tsx',
    testID: 'browse-library-button',
  },
  {
    file: 'apps/mobile/src/components/session/LibraryPrompt.tsx',
    testID: 'session-library-link',
  },
  {
    file: 'apps/mobile/src/app/(app)/progress/index.tsx',
    testID: 'progress-start-learning',
  },
];

const LIBRARY_ROUTE = '/(app)/library';
const SUBJECTS_ROUTE = '/(app)/subjects';
const V2_FLAG_PROPERTY = 'MODE_NAV_V2_ENABLED';

function repoRoot(): string {
  return resolve(__dirname, '../../../..');
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
 * : '/(app)/library'`-shaped ternary -- i.e. every unconditional/unflagged
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

describe('Empty-state browse-Library CTA routes [WI-2467]', () => {
  it.each(BROWSE_LIBRARY_CTA_SITES)(
    'keeps $testID ($file) present as a known empty-state browse-Library CTA',
    ({ file, testID }) => {
      const source = readFileSync(resolve(repoRoot(), file), 'utf-8');
      expect(source).toContain(`testID="${testID}"`);
    },
  );

  it.each(BROWSE_LIBRARY_CTA_SITES)(
    '$file never targets /(app)/library outside the V2-flag-gated ternary',
    ({ file }) => {
      const violations = findUnguardedLibraryPushes(resolve(repoRoot(), file));

      if (violations.length > 0) {
        throw new Error(
          `Unguarded /(app)/library push(es) in ${file}:\n` +
            violations
              .map((v) => `  - line ${v.line}: ${v.snippet}`)
              .join('\n') +
            `\n\nEvery empty-state browse-Library CTA must select its ` +
            `destination via FEATURE_FLAGS.MODE_NAV_V2_ENABLED ? ` +
            `'${SUBJECTS_ROUTE}' : '${LIBRARY_ROUTE}' -- never push ` +
            `'${LIBRARY_ROUTE}' unconditionally.`,
        );
      }
    },
  );
});
