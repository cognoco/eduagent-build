import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

type RawNavigationGateKind =
  | 'contract-diagnostic-read'
  | 'profile-owner-read'
  | 'proxy-state-read'
  | 'raw-hook-call'
  | 'raw-hook-import'
  | 'study-family-mode-compare';

type RawNavigationGateFinding = {
  kind: RawNavigationGateKind;
  snippet: string;
};

type FindingCounts = Partial<Record<RawNavigationGateKind, number>>;

// Three buckets, three meanings.
//
// `boundary`            Forever-allowed: file owns raw owner/proxy/mode reads
//                       on behalf of the rest of the app, OR owns mode-write.
// `v0-fallback`         Temporary: file dies when MODE_NAV_V0_ENABLED retires.
// `non-nav-domain-read` `isOwner` (or mode) is read to classify a domain
//                       entity (account, family-member row, child target),
//                       not to gate the active user's navigation.
type BoundaryCategory = 'boundary' | 'v0-fallback' | 'non-nav-domain-read';

type LegitimateRawNavigationGateFile = {
  file: string;
  category: BoundaryCategory;
  reason: string;
  expectedFindings: FindingCounts;
};

const RAW_NAVIGATION_HOOKS = new Set(['useAppContext', 'useParentProxy']);
const NAVIGATION_CONTRACT_HOOKS = new Set([
  'useNavigationContract',
  'useNavigationDataScopeContract',
  'useNavigationHomeContract',
  'useNavigationShellContract',
]);

// =====================================================================
// Boundary allowlist (Phase 6 terminal shape)
// =====================================================================
// These files OWN the raw owner/proxy/mode reads on behalf of the rest of
// the app, or own the Study/Family mode write boundary. They are the only
// sites where the navigation contract's raw inputs may be touched.
//
// This set is pinned by the `boundary allowlist matches canonical Phase 6
// boundary` test against CANONICAL_BOUNDARY_FILES below. Adding to or
// removing from it requires updating CANONICAL_BOUNDARY_FILES and the
// source spec.
const BOUNDARY_FILES: readonly LegitimateRawNavigationGateFile[] = [
  {
    file: 'apps/mobile/src/hooks/use-navigation-contract.ts',
    category: 'boundary',
    reason:
      'boundary: useNavigationContract is the only hook adapter feeding raw app/proxy context into resolveNavigationContract.',
    expectedFindings: {
      'proxy-state-read': 7,
      'raw-hook-call': 2,
      'raw-hook-import': 2,
    },
  },
  {
    file: 'apps/mobile/src/lib/navigation-contract.ts',
    category: 'boundary',
    reason:
      'boundary: resolveNavigationContract is the sole owner of raw owner/proxy decisions.',
    expectedFindings: {
      'profile-owner-read': 3,
      'proxy-state-read': 24,
    },
  },
  {
    file: 'apps/mobile/src/lib/legacy-navigation-contract.ts',
    category: 'boundary',
    reason:
      'boundary: legacy navigation compatibility layer owns MODE_NAV_V0 Study/Family tab branching.',
    expectedFindings: {
      'profile-owner-read': 2,
      'study-family-mode-compare': 3,
    },
  },
  {
    file: 'apps/mobile/src/lib/app-context.tsx',
    category: 'boundary',
    reason:
      'boundary: app-context owns V0 mode state and the MODE_NAV_V0/MODE_NAV_V1 short-circuits. The mode-seq effect is split (identity-only seq-bump + full-set override-reset, WI-816), so isOwner is read in both dep arrays.',
    expectedFindings: { 'profile-owner-read': 3 },
  },
  {
    file: 'apps/mobile/src/lib/profile.ts',
    category: 'boundary',
    reason:
      'boundary: profile provider owns raw owner/child profile selection and isExplicitProxyMode.',
    expectedFindings: { 'profile-owner-read': 8 },
  },
  {
    file: 'apps/mobile/src/hooks/use-parent-proxy.ts',
    category: 'boundary',
    reason:
      'boundary: parent-proxy helper owns raw proxy-state derivation before the contract consumes it.',
    expectedFindings: {
      'profile-owner-read': 1,
      'proxy-state-read': 2,
    },
  },
  {
    file: 'apps/mobile/src/hooks/use-active-profile-role.ts',
    category: 'boundary',
    reason:
      'boundary: active-profile role resolver is an input to resolveNavigationContract.',
    expectedFindings: {
      'profile-owner-read': 1,
      'proxy-state-read': 1,
      'raw-hook-call': 1,
      'raw-hook-import': 1,
    },
  },
  {
    file: 'apps/mobile/src/lib/use-mode-switch.ts',
    category: 'boundary',
    reason:
      'boundary: useModeSwitch is the write boundary for Study/Family context changes; useEnsureStudyMode and useEnterFamilyMode are lightweight setMode wrappers consumed by bridge navigations and the family-route opt-in CTA. The `mode !== "family"` short-circuit inside useEnsureStudyMode is the canonical bridge read that lets every consumer drop their own mode comparison.',
    expectedFindings: {
      'raw-hook-call': 3,
      'raw-hook-import': 1,
      'study-family-mode-compare': 1,
    },
  },
  {
    file: 'apps/mobile/src/hooks/use-push-token-registration.ts',
    category: 'boundary',
    reason:
      'boundary: push-token registration reads raw proxy state to avoid registering proxied child sessions on the parent device. Auxiliary to the canonical 8 — the test harness for this hook does not wire AppContext/QueryClient, so reading via useNavigationContract is not currently viable.',
    expectedFindings: {
      'proxy-state-read': 1,
      'raw-hook-call': 1,
      'raw-hook-import': 1,
    },
  },
];

// Canonical Phase 6 boundary set. This array exists so the boundary
// allowlist cannot drift silently — any change must update both. See
// docs/specs/2026-05-21-navigation-contract.md.
//
// First 8 entries match the plan's "Expected final boundary files" list
// verbatim. The 9th entry (use-push-token-registration) is an audited
// auxiliary boundary — see its `reason` in BOUNDARY_FILES.
const CANONICAL_BOUNDARY_FILES: readonly string[] = [
  'apps/mobile/src/hooks/use-active-profile-role.ts',
  'apps/mobile/src/hooks/use-navigation-contract.ts',
  'apps/mobile/src/hooks/use-parent-proxy.ts',
  'apps/mobile/src/hooks/use-push-token-registration.ts',
  'apps/mobile/src/lib/app-context.tsx',
  'apps/mobile/src/lib/legacy-navigation-contract.ts',
  'apps/mobile/src/lib/navigation-contract.ts',
  'apps/mobile/src/lib/profile.ts',
  'apps/mobile/src/lib/use-mode-switch.ts',
];

// =====================================================================
// V0-fallback exceptions
// =====================================================================
// Each entry implements an explicit V0 fallback branch (mostly query-scope
// fallbacks and the legacy own-learning route). All entries die together
// when MODE_NAV_V0_ENABLED is retired.
const V0_FALLBACK_FILES: readonly LegitimateRawNavigationGateFile[] = [
  {
    file: 'apps/mobile/src/hooks/use-entry-gate.ts',
    category: 'v0-fallback',
    reason:
      'V0-fallback: centralized entry-gate hook reads contract.isParentProxy in the V1-off arm to preserve V0 profile-load allow-through; replaces the per-screen ternaries (7 raw sites collapsed into 1).',
    expectedFindings: { 'proxy-state-read': 1 },
  },
  {
    file: 'apps/mobile/src/app/(app)/own-learning.tsx',
    category: 'v0-fallback',
    reason:
      'V0-fallback: retained own-learning route reads legacy mode/proxy state for redirects until the 5-tab fallback is retired.',
    expectedFindings: {
      'raw-hook-call': 2,
      'raw-hook-import': 2,
      'study-family-mode-compare': 1,
    },
  },
  {
    file: 'apps/mobile/src/app/(app)/progress/index.tsx',
    category: 'v0-fallback',
    reason:
      'V0-fallback: progress screen uses contract queryScope in V1 and legacy mode scope only when V1 is off.',
    expectedFindings: {
      'raw-hook-call': 1,
      'raw-hook-import': 1,
      'study-family-mode-compare': 2,
    },
  },
  {
    file: 'apps/mobile/src/app/profiles.tsx',
    category: 'v0-fallback',
    reason:
      'V0-fallback: profile switcher resets legacy app context and still needs owner/child profile filtering until V0 is retired.',
    expectedFindings: {
      'profile-owner-read': 4,
      'raw-hook-call': 1,
      'raw-hook-import': 1,
    },
  },
  {
    file: 'apps/mobile/src/hooks/use-dashboard.ts',
    category: 'v0-fallback',
    reason:
      'V0-fallback: dashboard data scope uses contract queryScope in V1 and legacy mode/profile in V0.',
    expectedFindings: {
      'profile-owner-read': 1,
      'raw-hook-call': 1,
      'raw-hook-import': 1,
    },
  },
  {
    file: 'apps/mobile/src/hooks/use-notification-response-handler.ts',
    category: 'v0-fallback',
    reason:
      'V0-fallback: notification tap handling uses contract queryScope in V1 and legacy app context in V0.',
    expectedFindings: {
      'raw-hook-call': 1,
      'raw-hook-import': 1,
    },
  },
  {
    file: 'apps/mobile/src/hooks/use-progress.ts',
    category: 'v0-fallback',
    reason:
      'V0-fallback: progress data scope uses contract queryScope in V1 and legacy mode/profile in V0.',
    expectedFindings: {
      'profile-owner-read': 1,
      'raw-hook-call': 2,
      'raw-hook-import': 1,
    },
  },
  {
    file: 'apps/mobile/src/hooks/use-sessions.ts',
    category: 'v0-fallback',
    reason:
      'V0-fallback: session data scope uses contract queryScope in V1 and legacy mode/profile in V0.',
    expectedFindings: {
      'raw-hook-call': 1,
      'raw-hook-import': 1,
    },
  },
];

// =====================================================================
// Non-navigation domain reads
// =====================================================================
// These files contain `isOwner` reads, but the reads classify a domain
// entity (account ownership, family-member row, child-target edit) — NOT
// the active user's navigation ownership. They are NOT navigation gates
// and must NOT be migrated to the contract.
const NON_NAV_DOMAIN_FILES: readonly LegitimateRawNavigationGateFile[] = [
  {
    file: 'apps/mobile/src/app/(app)/more/accommodation.tsx',
    category: 'non-nav-domain-read',
    reason:
      'child-target read: childProfile?.isOwner classifies the edit target, not navigation ownership. Active-user gating flows through contract.gates.showAccommodationChildEditor.',
    expectedFindings: { 'profile-owner-read': 1 },
  },
  {
    file: 'apps/mobile/src/app/session-summary/[sessionId].tsx',
    category: 'non-nav-domain-read',
    reason:
      'child-target read: useParentProxy() is consumed only for childProfile.consentStatus + childProfile.id, which describe the mentor-memory navigation target. Active-user proxy gating routes through contract.gates.showLearningActions.',
    expectedFindings: {
      'raw-hook-call': 1,
      'raw-hook-import': 1,
    },
  },
  {
    file: 'apps/mobile/src/app/(app)/more/celebrations.tsx',
    category: 'non-nav-domain-read',
    reason:
      'child-target read: childProfile?.isOwner classifies the edit target, not navigation ownership. Active-user gating flows through contract.gates.showCelebrationsChildEditor.',
    expectedFindings: { 'profile-owner-read': 1 },
  },
  {
    file: 'apps/mobile/src/app/(app)/more/index.tsx',
    category: 'non-nav-domain-read',
    reason:
      'list filter: p.isOwner filters which sibling profiles appear in the linked-children list. Navigation gating flows through contract.gates.showAddChild and .showRemoveFamilyMember.',
    expectedFindings: { 'profile-owner-read': 1 },
  },
  {
    file: 'apps/mobile/src/app/(app)/subscription.tsx',
    category: 'non-nav-domain-read',
    reason:
      'family-member labels: subscription gates UI visibility through the contract, keeps one consolidated owner read for analytics/paywall/V0 fallback, and reads member.isOwner on family-pool rows.',
    expectedFindings: { 'profile-owner-read': 3 },
  },
  {
    file: 'apps/mobile/src/app/create-profile.tsx',
    category: 'non-nav-domain-read',
    reason:
      'account ownership: create-profile validates parent-owned profile creation outside the tab contract.',
    expectedFindings: { 'profile-owner-read': 1 },
  },
  {
    file: 'apps/mobile/src/app/delete-account.tsx',
    category: 'non-nav-domain-read',
    reason:
      'account ownership: delete-account validates owner-only account deletion outside the tab contract.',
    expectedFindings: { 'profile-owner-read': 1 },
  },
  {
    file: 'apps/mobile/src/hooks/use-consent.ts',
    category: 'non-nav-domain-read',
    reason:
      'account ownership: consent status query is enabled only for parent-owned profiles.',
    expectedFindings: { 'profile-owner-read': 1 },
  },
  {
    file: 'apps/mobile/src/hooks/use-learner-profile.ts',
    category: 'non-nav-domain-read',
    reason:
      'account ownership: learner-profile child editor query is enabled only for parent-owned profiles.',
    expectedFindings: { 'profile-owner-read': 1 },
  },
  {
    file: 'apps/mobile/src/hooks/use-settings.ts',
    category: 'non-nav-domain-read',
    reason:
      'account ownership: parent-owned settings queries remain outside the tab navigation contract.',
    expectedFindings: { 'profile-owner-read': 3 },
  },
];

const LEGITIMATE_RAW_NAV_GATE_FILES: readonly LegitimateRawNavigationGateFile[] =
  [...BOUNDARY_FILES, ...V0_FALLBACK_FILES, ...NON_NAV_DOMAIN_FILES];

const SELF_FILE = 'apps/mobile/src/lib/navigation-contract-usage-guard.test.ts';

function repoRoot(): string {
  return resolve(__dirname, '../../../..');
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function listMobileProductionSources(): string[] {
  const out = execSync(
    'git ls-files --cached --others --exclude-standard "apps/mobile/src/**/*.ts" "apps/mobile/src/**/*.tsx"',
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

function normalizeSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, ' ').trim();
}

function findingKey(finding: RawNavigationGateFinding): string {
  return `${finding.kind}: ${finding.snippet}`;
}

function countFindings(findings: RawNavigationGateFinding[]): FindingCounts {
  const counts: FindingCounts = {};
  for (const finding of findings) {
    counts[finding.kind] = (counts[finding.kind] ?? 0) + 1;
  }
  return counts;
}

function formatCounts(counts: FindingCounts): string {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `${kind}=${count}`)
    .join(', ');
}

function navigationContractVariables(sourceFile: ts.SourceFile): Set<string> {
  const variables = new Set<string>();

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      NAVIGATION_CONTRACT_HOOKS.has(node.initializer.expression.text)
    ) {
      variables.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return variables;
}

function importedRawHookNames(
  node: ts.ImportDeclaration,
): RawNavigationGateFinding[] {
  const findings: RawNavigationGateFinding[] = [];
  const namedBindings = node.importClause?.namedBindings;
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return findings;

  for (const element of namedBindings.elements) {
    const importedName = element.propertyName?.text ?? element.name.text;
    if (!RAW_NAVIGATION_HOOKS.has(importedName)) continue;

    findings.push({
      kind: 'raw-hook-import',
      snippet:
        element.name.text === importedName
          ? importedName
          : `${importedName} as ${element.name.text}`,
    });
  }

  return findings;
}

function rawHookLocalNames(sourceFile: ts.SourceFile): Map<string, string> {
  const names = new Map<string, string>();

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isImportDeclaration(node)) return;
    const namedBindings = node.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) return;

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (RAW_NAVIGATION_HOOKS.has(importedName)) {
        names.set(element.name.text, importedName);
      }
    }
  });

  return names;
}

function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isShorthandPropertyAssignment(parent) && parent.name === node) ||
    (ts.isImportSpecifier(parent) && parent.name === node)
  );
}

function isPropertyAccessName(node: ts.Identifier): boolean {
  return (
    ts.isPropertyAccessExpression(node.parent) && node.parent.name === node
  );
}

function bindingLocalName(
  bindingName: ts.BindingName,
  propertyName: string,
): string | null {
  if (!ts.isObjectBindingPattern(bindingName)) return null;

  for (const element of bindingName.elements) {
    const importedName =
      element.propertyName?.getText() ?? element.name.getText();
    if (importedName === propertyName && ts.isIdentifier(element.name)) {
      return element.name.text;
    }
  }

  return null;
}

function rawProxyVariableNames(
  sourceFile: ts.SourceFile,
  rawHookNames: ReadonlyMap<string, string>,
): Set<string> {
  const variableDeclarations: ts.VariableDeclaration[] = [];

  function collect(node: ts.Node): void {
    if (ts.isVariableDeclaration(node)) {
      variableDeclarations.push(node);
    }
    ts.forEachChild(node, collect);
  }

  collect(sourceFile);

  const names = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;

    for (const declaration of variableDeclarations) {
      const initializer = declaration.initializer;
      if (!initializer) continue;

      if (
        ts.isCallExpression(initializer) &&
        ts.isIdentifier(initializer.expression)
      ) {
        const calledName = initializer.expression.text;
        if (rawHookNames.get(calledName) === 'useParentProxy') {
          const localName = bindingLocalName(declaration.name, 'isParentProxy');
          if (localName && !names.has(localName)) {
            names.add(localName);
            changed = true;
          }
        }

        if (calledName === 'useProfile') {
          const localName = bindingLocalName(
            declaration.name,
            'isExplicitProxyMode',
          );
          if (localName && !names.has(localName)) {
            names.add(localName);
            changed = true;
          }
        }
      }

      if (
        ts.isIdentifier(declaration.name) &&
        ts.isIdentifier(initializer) &&
        names.has(initializer.text) &&
        !names.has(declaration.name.text)
      ) {
        names.add(declaration.name.text);
        changed = true;
      }
    }
  }

  return names;
}

function rawNavigationGateFindings(
  absPath: string,
): RawNavigationGateFinding[] {
  if (!existsSync(absPath)) return [];
  const source = readFileSync(absPath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    absPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: RawNavigationGateFinding[] = [];
  const rawHookNames = rawHookLocalNames(sourceFile);
  const contractVariables = navigationContractVariables(sourceFile);
  const rawProxyNames = rawProxyVariableNames(sourceFile, rawHookNames);

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      findings.push(...importedRawHookNames(node));
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      rawHookNames.has(node.expression.text)
    ) {
      findings.push({
        kind: 'raw-hook-call',
        snippet: `${rawHookNames.get(node.expression.text)}()`,
      });
    }

    if (ts.isPropertyAccessExpression(node)) {
      const propertyName = node.name.text;
      if (propertyName === 'isOwner') {
        findings.push({
          kind: 'profile-owner-read',
          snippet: normalizeSnippet(node.getText(sourceFile)),
        });
      }

      if (
        propertyName === 'isParentProxy' &&
        !(
          ts.isIdentifier(node.expression) &&
          contractVariables.has(node.expression.text)
        )
      ) {
        findings.push({
          kind: 'proxy-state-read',
          snippet: normalizeSnippet(node.getText(sourceFile)),
        });
      }

      // `contract.diagnostic.*` is for tests/snapshots only. Production
      // code that branches on `diagnostic.reason` etc. is creating a
      // hidden second public API for the contract — fail the guard.
      if (
        propertyName === 'diagnostic' &&
        ts.isIdentifier(node.expression) &&
        contractVariables.has(node.expression.text)
      ) {
        findings.push({
          kind: 'contract-diagnostic-read',
          snippet: normalizeSnippet(node.getText(sourceFile)),
        });
      }
    }

    if (
      ts.isIdentifier(node) &&
      rawProxyNames.has(node.text) &&
      !isDeclarationName(node) &&
      !isPropertyAccessName(node)
    ) {
      findings.push({
        kind: 'proxy-state-read',
        snippet: node.text,
      });
    }

    if (ts.isBinaryExpression(node) && isModeComparison(node)) {
      findings.push({
        kind: 'study-family-mode-compare',
        snippet: normalizeSnippet(node.getText(sourceFile)),
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings.sort((a, b) => findingKey(a).localeCompare(findingKey(b)));
}

describe('navigation-contract terminal usage ratchet', () => {
  const files = listMobileProductionSources();
  const legitimateFiles = new Map(
    LEGITIMATE_RAW_NAV_GATE_FILES.map((entry) => [entry.file, entry]),
  );

  it('finds mobile production source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('boundary allowlist matches the canonical Phase 6 boundary set', () => {
    const boundaryFiles = BOUNDARY_FILES.map((entry) => entry.file).sort();
    const canonical = [...CANONICAL_BOUNDARY_FILES].sort();
    expect(boundaryFiles).toEqual(canonical);
  });

  it('keeps every terminal exception justified, categorized, and unique', () => {
    expect(legitimateFiles.size).toBe(LEGITIMATE_RAW_NAV_GATE_FILES.length);

    const ungrounded = LEGITIMATE_RAW_NAV_GATE_FILES.filter(
      (entry) =>
        !entry.reason.includes(':') ||
        entry.reason.toLowerCase().includes('todo') ||
        entry.reason.toLowerCase().includes('migration debt') ||
        Object.keys(entry.expectedFindings).length === 0 ||
        !entry.category,
    );

    expect(ungrounded).toEqual([]);
  });

  it('does not introduce raw owner/proxy/mode gate sites outside terminal exceptions', () => {
    const violators = files
      .map((file) => ({
        file,
        findings: rawNavigationGateFindings(resolve(repoRoot(), file)),
      }))
      .filter((entry) => entry.findings.length > 0);

    const newViolators = violators.filter(
      (entry) => !legitimateFiles.has(entry.file),
    );

    if (newViolators.length > 0) {
      throw new Error(
        `New raw navigation gate(s) found outside terminal exceptions:\n` +
          newViolators
            .map(
              (entry) =>
                `  - ${entry.file}: ${entry.findings
                  .map(findingKey)
                  .join(', ')}`,
            )
            .join('\n') +
          `\n\nUse the navigation contract instead of new raw isOwner / ` +
          `isParentProxy / study-family mode checks. If a legacy fallback is ` +
          `intentional, add a narrowly justified entry to BOUNDARY_FILES, ` +
          `V0_FALLBACK_FILES, or NON_NAV_DOMAIN_FILES with fixed expected ` +
          `finding counts.`,
      );
    }
  });

  it('keeps terminal exception findings fixed', () => {
    const mismatches = LEGITIMATE_RAW_NAV_GATE_FILES.flatMap((entry) => {
      const findings = rawNavigationGateFindings(
        resolve(repoRoot(), entry.file),
      );
      const actual = countFindings(findings);
      const expected = entry.expectedFindings;

      if (JSON.stringify(actual) === JSON.stringify(expected)) return [];

      return [
        `${entry.file}\n` +
          `  category: ${entry.category}\n` +
          `  reason:   ${entry.reason}\n` +
          `  expected: ${formatCounts(expected)}\n` +
          `  actual:   ${formatCounts(actual)}\n` +
          `  findings: ${findings.map(findingKey).join('; ') || '(none)'}`,
      ];
    });

    if (mismatches.length > 0) {
      throw new Error(
        `Terminal raw navigation gate exception(s) changed:\n` +
          mismatches.join('\n') +
          `\n\nIf the actual count decreased, remove or narrow the exception. ` +
          `If it increased, migrate the new raw gate or update the terminal ` +
          `exception with a specific rationale.`,
      );
    }

    const missingFiles = LEGITIMATE_RAW_NAV_GATE_FILES.filter(
      (entry) => !files.includes(entry.file),
    );

    expect(missingFiles).toEqual([]);
  });
});
