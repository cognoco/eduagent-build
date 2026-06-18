// ---------------------------------------------------------------------------
// Static analysis test: every screen must have a back/close/home button.
//
// Reads screen source files and verifies each contains at least one exit
// navigation pattern. No rendering, no mocking — pure source analysis.
// Catches regressions when someone adds a new screen without navigation.
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// Navigation patterns that count as "has an exit".
//
// [T-4 / BUG-748] router.push(...) was previously treated as an exit, but
// router.push is a forward navigation primitive — a screen can call
// router.push without ever offering the user a way *back*, so its presence
// gives a false-positive pass. The audit must only credit primitives that
// actually move the user off the current screen toward a known prior
// location: replace, the goBackOrReplace helper, the ChatShell which renders
// its own back chevron, or visible back/close affordances.
//
// Bare router.back() is intentionally NOT credited here. It only proves there
// is some prior history entry, not that the entry is the parent the user
// expects. The negative ratchet below catches live router.back() calls.
const EXIT_PATTERNS = [
  /router\.replace\(/, // router.replace(...) — replaces current entry
  /goBackOrReplace\(/, // goBackOrReplace helper (wraps router.back/replace)
  /ChatShell/, // ChatShell component has built-in back button
  /name="close"/, // Ionicons close button
  /name="chevron-back"/, // Ionicons chevron-back button
  /name="arrow-back"/, // Ionicons arrow-back button
  /accessibilityLabel="Go back"/, // Accessible back button
];

// Screens that are legitimately exempt from needing a back button
const EXEMPT_SCREENS: string[] = [
  // Root redirect — no UI, just redirects
  'index.tsx',
  // Legacy redirect — no UI, preserved for old /dashboard deep links
  '(app)/dashboard.tsx',
  // Onboarding entry — pure <Redirect /> to /(app)/onboarding/pronouns; no UI
  '(app)/onboarding/index.tsx',
  // Weekly-report index — pure <Redirect /> to /(app)/progress/reports; no UI
  '(app)/progress/weekly-report/index.tsx',
  // Tab screens — bottom tab navigation provides navigation
  '(app)/home.tsx',
  '(app)/own-learning.tsx', // Visible bottom tab (parent's "My Learning" tab)
  '(app)/library.tsx',
  '(app)/recaps/index.tsx', // Visible bottom tab (Family V1 recaps tab)
  '(app)/mentor.tsx', // Visible bottom tab (V2 mentor tab — see use-navigation-contract.ts V2_TABS)
  '(app)/subjects.tsx', // Visible bottom tab (V2 subjects tab — see use-navigation-contract.ts V2_TABS)
  '(app)/journal.tsx', // Visible bottom tab (V2 journal tab — see use-navigation-contract.ts V2_TABS)
  '(app)/more/index.tsx',
  '(app)/more/notifications.tsx', // Native Stack header provides back
  '(app)/more/account.tsx', // Native Stack header provides back
  '(app)/more/security-sessions.tsx', // Native Stack header provides back
  '(app)/more/privacy.tsx', // Native Stack header provides back
  '(app)/more/help.tsx', // Native Stack header provides back
  '(app)/progress/index.tsx', // Visible bottom tab (see (app)/_layout.tsx VISIBLE_TABS)
  // Sign-in is the auth entry point — no "back" since there's nowhere
  // to go when unauthenticated. Has links to sign-up and forgot-password.
  '(auth)/sign-in.tsx',
];

// Forward-only ratchet: route screens must not add bare router.back().
// If a future route has a truly native-stack-owned reason to call it directly,
// add it here with a dated comment and prefer migrating it away quickly.
const BARE_ROUTER_BACK_ALLOWLIST = new Set<string>();

function getAllScreenFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip _components/, _hooks/ etc — Expo Router non-route conventions
        // for co-located helpers. These are not user-navigable screens.
        if (entry.name.startsWith('_')) continue;
        walk(fullPath);
      } else if (
        entry.name.endsWith('.tsx') &&
        !entry.name.endsWith('.test.tsx') &&
        !entry.name.startsWith('_layout') &&
        // Expo Router meta-files (+html.tsx, +not-found.tsx, +native-intent.tsx)
        // are document/infra files, not user-navigable screens.
        !entry.name.startsWith('+') &&
        // PascalCase .tsx files are co-located components, not route pages
        !/^[A-Z]/.test(entry.name)
      ) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function getRelativeName(filePath: string, baseDir: string): string {
  return path.relative(baseDir, filePath).replace(/\\/g, '/');
}

function findBareRouterBackCalls(
  source: string,
  filePath = 'screen.tsx',
): Array<{ line: number; text: string }> {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const calls: Array<{ line: number; text: string }> = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'back' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'router'
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      calls.push({
        line: line + 1,
        text: node.getText(sourceFile),
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

describe('Screen navigation audit', () => {
  const appDir = path.resolve(__dirname);
  const screenFiles = getAllScreenFiles(appDir);

  // Sanity check — we should find a reasonable number of screens
  it('should find at least 20 screen files', () => {
    expect(screenFiles.length).toBeGreaterThanOrEqual(20);
  });

  const nonExemptScreens = screenFiles.filter((f) => {
    const rel = getRelativeName(f, appDir);
    return !EXEMPT_SCREENS.includes(rel);
  });

  it.each(nonExemptScreens)('%s has exit navigation', (filePath) => {
    const source = fs.readFileSync(filePath, 'utf-8');
    const relativeName = getRelativeName(filePath, appDir);

    const hasExit = EXIT_PATTERNS.some((pattern) => pattern.test(source));

    expect(hasExit).toBe(true);
    if (!hasExit) {
      // Extra context on failure (Jest shows the expect, this adds guidance)
      console.error(
        `Screen "${relativeName}" has no back/close/home button. ` +
          'Every screen must have a visible way for the user to navigate away.',
      );
    }
  });

  // [T-4 / BUG-748] Break test: a synthetic screen whose ONLY navigation
  // primitive is `router.push(...)` must NOT count as having an exit.
  // This pins the audit's stricter contract introduced by removing
  // /router\.push\(/ from EXIT_PATTERNS — preventing accidental
  // re-introduction in a future cleanup.
  it('[BUG-748] router.push alone is not credited as an exit', () => {
    const fakeScreen = `
      import { useRouter } from 'expo-router';
      export default function Forward() {
        const router = useRouter();
        return <Pressable onPress={() => router.push('/somewhere')} />;
      }
    `;
    const hasExit = EXIT_PATTERNS.some((pattern) => pattern.test(fakeScreen));
    expect(hasExit).toBe(false);
  });

  it('[BUG-748] router.back alone is not credited as an exit', () => {
    const fakeScreen = `
      const router = useRouter();
      <Pressable onPress={() => router.back()} />
    `;
    const hasExit = EXIT_PATTERNS.some((pattern) => pattern.test(fakeScreen));
    expect(hasExit).toBe(false);
  });

  it('[BUG-BACK-RATCHET] route screens do not call bare router.back()', () => {
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const filePath of screenFiles) {
      const relativeName = getRelativeName(filePath, appDir);
      if (BARE_ROUTER_BACK_ALLOWLIST.has(relativeName)) continue;

      const source = fs.readFileSync(filePath, 'utf-8');
      for (const call of findBareRouterBackCalls(source, relativeName)) {
        violations.push({ file: relativeName, ...call });
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}:${v.line} — ${v.text}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} bare router.back() call(s) in route screens:\n${message}\n\n` +
          'Use goBackOrReplace(router, parentHref), router.replace(parentHref), or a documented dismiss strategy instead.',
      );
    }

    expect(violations).toEqual([]);
  });

  it('[BUG-BACK-RATCHET] detects live router.back() calls but ignores comments', () => {
    const sample = `
      // router.back() in comments documents the historical trap.
      const router = useRouter();
      <Pressable onPress={() => router.back()} />
    `;

    expect(findBareRouterBackCalls(sample)).toEqual([
      { line: 4, text: 'router.back()' },
    ]);
    expect(
      findBareRouterBackCalls('// router.back() in a comment only'),
    ).toEqual([]);
  });
});
