import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

// [WI-2219 / WI-2467] Cross-cutting forward guard: enumerates every
// empty-state / recovery "browse Library" CTA that can send a learner with
// no eligible content to the app's browse destination -- the original
// WI-2219 Practice/assessment-picker/quiz sites (formerly
// apps/mobile/src/app/(app)/practice/browse-recovery-routes.test.ts, now
// consolidated here) plus the WI-2467 sibling sites outside that scope. Each
// CTA must select its destination via FEATURE_FLAGS.MODE_NAV_V2_ENABLED (V2
// on -> /(app)/subjects, off -> /(app)/library) rather than hardcoding
// /(app)/library unconditionally -- the same V0/V1->V2 cutover regression
// WI-2219 fixed. Any future CTA added to one of these files that pushes
// /(app)/library outside that flag-gated ternary fails this test (3+
// sibling-sites Fix Development Rule). This guard covers exactly the sites
// enumerated below -- it is not an app-wide scan of every /(app)/library
// reference in the codebase.
const BROWSE_LIBRARY_CTA_SITES: readonly { file: string; testID: string }[] = [
  // WI-2219 — Practice / assessment-picker / quiz recovery CTAs.
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
  // WI-2467 — sibling empty-state browse-Library CTAs.
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
  {
    file: 'apps/mobile/src/app/(app)/progress/saved.tsx',
    testID: 'saved-empty-library-cta',
  },
  {
    file: 'apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx',
    testID: 'vocabulary-empty-library',
  },
];

const LIBRARY_ROUTE = '/(app)/library';
const SUBJECTS_ROUTE = '/(app)/subjects';
const V2_FLAG_OBJECT = 'FEATURE_FLAGS';
const V2_FLAG_PROPERTY = 'MODE_NAV_V2_ENABLED';

function repoRoot(): string {
  return resolve(__dirname, '../../../..');
}

function isLibraryRouteLiteral(node: ts.Node): node is ts.StringLiteralLike {
  return ts.isStringLiteralLike(node) && node.text === LIBRARY_ROUTE;
}

/**
 * True only for the exact positive condition `FEATURE_FLAGS.MODE_NAV_V2_ENABLED`
 * -- i.e. a property access on the `FEATURE_FLAGS` identifier reading the
 * `MODE_NAV_V2_ENABLED` property, with no negation and no other object. A
 * differently-named object with a same-named property (`other.MODE_NAV_V2_ENABLED`)
 * or a negated read (`!FEATURE_FLAGS.MODE_NAV_V2_ENABLED`) does not match.
 */
function isV2FlagPositiveCondition(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === V2_FLAG_OBJECT &&
    node.name.text === V2_FLAG_PROPERTY
  );
}

type UnguardedLibraryPush = {
  line: number;
  snippet: string;
};

/**
 * Finds every `/(app)/library` string literal in the file that is NOT the
 * `whenFalse` branch of a `FEATURE_FLAGS.MODE_NAV_V2_ENABLED ? '/(app)/subjects'
 * : '/(app)/library'`-shaped ternary -- i.e. every unconditional/unflagged
 * library push, every push guarded by a differently-named or negated
 * condition, and every push with the branches swapped or repointed.
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
        isV2FlagPositiveCondition(parent.condition) &&
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

describe('Empty-state / recovery browse-Library CTA routes [WI-2219, WI-2467]', () => {
  it.each(BROWSE_LIBRARY_CTA_SITES)(
    'keeps $testID ($file) present as a known browse-Library CTA',
    ({ file, testID }) => {
      const source = readFileSync(resolve(repoRoot(), file), 'utf-8');
      // Most sites set testID as a JSX attribute (`testID="foo"`); a few
      // (e.g. ErrorFallback's primaryAction/secondaryAction props) set it as
      // an object property (`testID: 'foo'`) instead. Both are real presence.
      const isPresent =
        source.includes(`testID="${testID}"`) ||
        source.includes(`testID: '${testID}'`);
      expect(isPresent).toBe(true);
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
            `\n\nEvery browse-Library CTA must select its destination via ` +
            `${V2_FLAG_OBJECT}.${V2_FLAG_PROPERTY} ? '${SUBJECTS_ROUTE}' : ` +
            `'${LIBRARY_ROUTE}' -- never push '${LIBRARY_ROUTE}' ` +
            `unconditionally, behind a differently-named/negated condition, ` +
            `or with the branches swapped.`,
        );
      }
    },
  );
});
