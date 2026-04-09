// ---------------------------------------------------------------------------
// Static analysis test: every screen must have a back/close/home button.
//
// Reads screen source files and verifies each contains at least one exit
// navigation pattern. No rendering, no mocking — pure source analysis.
// Catches regressions when someone adds a new screen without navigation.
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';

// Navigation patterns that count as "has an exit"
const EXIT_PATTERNS = [
  /router\.back\(\)/, // router.back()
  /router\.push\(/, // router.push(...)
  /router\.replace\(/, // router.replace(...)
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
  // Tab screens — bottom tab navigation provides navigation
  '(app)/home.tsx',
  '(app)/library.tsx',
  '(app)/more.tsx',
  // Sign-in is the auth entry point — no "back" since there's nowhere
  // to go when unauthenticated. Has links to sign-up and forgot-password.
  '(auth)/sign-in.tsx',
];

function getAllScreenFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        entry.name.endsWith('.tsx') &&
        !entry.name.endsWith('.test.tsx') &&
        !entry.name.startsWith('_layout')
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
          'Every screen must have a visible way for the user to navigate away.'
      );
    }
  });
});
