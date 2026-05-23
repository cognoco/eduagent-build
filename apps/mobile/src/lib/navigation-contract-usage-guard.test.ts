import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

// Navigation contract ratchet.
//
// Raw owner/proxy/study-family checks are easy to copy into new screens and
// silently bypass the centralized family/proxy navigation contract. This guard
// is forward-only: existing legacy/fallback files are allowlisted, but new
// production files must use useNavigationContract(), useNavigationDataScopeContract(),
// or the pure resolver in navigation-contract.ts.

const KNOWN_RAW_NAV_GATE_FILES = new Set<string>([
  'apps/mobile/src/app/(app)/_layout.tsx',
  'apps/mobile/src/app/(app)/dictation/_layout.tsx',
  'apps/mobile/src/app/(app)/home.tsx',
  'apps/mobile/src/app/(app)/homework/_layout.tsx',
  'apps/mobile/src/app/(app)/mentor-memory.tsx',
  'apps/mobile/src/app/(app)/more/account.tsx',
  'apps/mobile/src/app/(app)/more/accommodation.tsx',
  'apps/mobile/src/app/(app)/more/celebrations.tsx',
  'apps/mobile/src/app/(app)/more/index.tsx',
  'apps/mobile/src/app/(app)/own-learning.tsx',
  'apps/mobile/src/app/(app)/practice/index.tsx',
  'apps/mobile/src/app/(app)/progress/index.tsx',
  'apps/mobile/src/app/(app)/progress/saved.tsx',
  'apps/mobile/src/app/(app)/quiz/_layout.tsx',
  'apps/mobile/src/app/(app)/session/_layout.tsx',
  'apps/mobile/src/app/(app)/subscription.tsx',
  'apps/mobile/src/app/(app)/topic/relearn.tsx',
  'apps/mobile/src/app/create-profile.tsx',
  'apps/mobile/src/app/delete-account.tsx',
  'apps/mobile/src/app/profiles.tsx',
  'apps/mobile/src/app/session-summary/[sessionId].tsx',
  'apps/mobile/src/components/guards/RequireFamilyContext.tsx',
  'apps/mobile/src/components/home/LearnerScreen.tsx',
  'apps/mobile/src/hooks/use-active-profile-role.ts',
  'apps/mobile/src/hooks/use-clone-from-child.ts',
  'apps/mobile/src/hooks/use-consent.ts',
  'apps/mobile/src/hooks/use-dashboard.ts',
  'apps/mobile/src/hooks/use-learner-profile.ts',
  'apps/mobile/src/hooks/use-navigation-contract.ts',
  'apps/mobile/src/hooks/use-notification-response-handler.ts',
  'apps/mobile/src/hooks/use-parent-proxy.ts',
  'apps/mobile/src/hooks/use-post-session-notification-ask.ts',
  'apps/mobile/src/hooks/use-progress.ts',
  'apps/mobile/src/hooks/use-push-token-registration.ts',
  'apps/mobile/src/hooks/use-sessions.ts',
  'apps/mobile/src/hooks/use-settings.ts',
  'apps/mobile/src/lib/app-context.tsx',
  'apps/mobile/src/lib/navigation-contract.ts',
  'apps/mobile/src/lib/navigation.ts',
  'apps/mobile/src/lib/profile.ts',
  'apps/mobile/src/lib/use-mode-switch.ts',
]);

const SELF_FILE = 'apps/mobile/src/lib/navigation-contract-usage-guard.test.ts';

function repoRoot(): string {
  return resolve(__dirname, '../../../..');
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function listMobileProductionSources(): string[] {
  const out = execSync(
    'git ls-files "apps/mobile/src/**/*.ts" "apps/mobile/src/**/*.tsx"',
    { cwd: repoRoot(), encoding: 'utf-8' },
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePath)
    .filter((file) => !file.endsWith('.test.ts'))
    .filter((file) => !file.endsWith('.test.tsx'))
    .filter((file) => !file.endsWith('.d.ts'))
    .filter((file) => !file.startsWith('apps/mobile/src/i18n/'))
    .filter((file) => !file.includes('/__fixtures__/'))
    .filter((file) => !file.includes('/test-utils/'))
    .filter((file) => file !== SELF_FILE);
}

function isStudyFamilyLiteral(node: ts.Node): boolean {
  return (
    ts.isStringLiteralLike(node) &&
    (node.text === 'family' || node.text === 'study')
  );
}

function isModeComparison(node: ts.BinaryExpression): boolean {
  const operator = node.operatorToken.kind;
  if (
    operator !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    operator !== ts.SyntaxKind.ExclamationEqualsEqualsToken
  ) {
    return false;
  }

  return (
    (ts.isIdentifier(node.left) &&
      node.left.text === 'mode' &&
      isStudyFamilyLiteral(node.right)) ||
    (ts.isIdentifier(node.right) &&
      node.right.text === 'mode' &&
      isStudyFamilyLiteral(node.left))
  );
}

function rawNavigationGateFindings(absPath: string): string[] {
  if (!existsSync(absPath)) return [];
  const source = readFileSync(absPath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    absPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      if (node.text === 'useParentProxy') findings.add('useParentProxy');
      if (node.text === 'isParentProxy') findings.add('isParentProxy');
      if (node.text === 'useAppContext') findings.add('useAppContext');
    }

    if (ts.isPropertyAccessExpression(node) && node.name.text === 'isOwner') {
      findings.add('.isOwner');
    }

    if (ts.isBinaryExpression(node) && isModeComparison(node)) {
      findings.add('mode === family/study');
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return Array.from(findings).sort();
}

describe('navigation-contract raw gate ratchet', () => {
  const files = listMobileProductionSources();

  it('finds mobile production source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('does not introduce raw owner/proxy/mode gate sites outside the allowlist', () => {
    const violators = files
      .map((file) => ({
        file,
        findings: rawNavigationGateFindings(resolve(repoRoot(), file)),
      }))
      .filter((entry) => entry.findings.length > 0);

    const newViolators = violators.filter(
      (entry) => !KNOWN_RAW_NAV_GATE_FILES.has(entry.file),
    );

    if (newViolators.length > 0) {
      throw new Error(
        `New raw navigation gate(s) found outside the allowlist:\n` +
          newViolators
            .map((entry) => `  - ${entry.file}: ${entry.findings.join(', ')}`)
            .join('\n') +
          `\n\nUse the navigation contract instead of new raw isOwner / ` +
          `isParentProxy / study-family mode checks. If a legacy fallback is ` +
          `intentional, add the file to KNOWN_RAW_NAV_GATE_FILES with the ` +
          `migration debt understood.`,
      );
    }
  });

  it('shrinks the raw-gate allowlist as files are migrated', () => {
    const stillViolating = Array.from(KNOWN_RAW_NAV_GATE_FILES).filter(
      (file) => rawNavigationGateFindings(resolve(repoRoot(), file)).length > 0,
    );

    expect(stillViolating.sort()).toEqual(
      Array.from(KNOWN_RAW_NAV_GATE_FILES).sort(),
    );
  });
});
