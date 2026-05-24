import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

type RawNavigationGateKind =
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

type LegitimateRawNavigationGateFile = {
  file: string;
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

// Terminal navigation contract ratchet.
//
// Raw owner/proxy/study-family checks are easy to copy into new screens and
// silently bypass the centralized family/proxy navigation contract. This list
// is not a migration backlog: each entry is a justified, fixed exception for
// V0 fallback plumbing or a primitive that feeds the contract itself. If a
// finding count changes, either remove the exception or update it with a fresh
// rationale.
const LEGITIMATE_RAW_NAV_GATE_FILES: readonly LegitimateRawNavigationGateFile[] =
  [
    // Contract-only after PR 3: showAccommodationChildEditor is V0-safe in
    // the contract, so the screen reads only the gate. The remaining raw
    // read is `childProfile?.isOwner`, which classifies the EDIT TARGET
    // profile (not the active user's navigation ownership).
    {
      file: 'apps/mobile/src/app/(app)/more/accommodation.tsx',
      reason:
        'child-target read: childProfile?.isOwner classifies the edit target, not navigation ownership. Active-user gating flows through contract.gates.showAccommodationChildEditor.',
      expectedFindings: { 'profile-owner-read': 1 },
    },
    // Contract-only after PR 3: showCelebrationsChildEditor is V0-safe; the
    // remaining raw read is the child target (`childProfile?.isOwner`).
    {
      file: 'apps/mobile/src/app/(app)/more/celebrations.tsx',
      reason:
        'child-target read: childProfile?.isOwner classifies the edit target, not navigation ownership. Active-user gating flows through contract.gates.showCelebrationsChildEditor.',
      expectedFindings: { 'profile-owner-read': 1 },
    },
    // Contract-only after PR 3: showAddChild and showRemoveFamilyMember are
    // V0-safe in the contract. The remaining raw read filters the linked-
    // children list rows (`p.isOwner`) — a list predicate, not a navigation
    // ownership decision for the current user.
    {
      file: 'apps/mobile/src/app/(app)/more/index.tsx',
      reason:
        'list filter: p.isOwner filters which sibling profiles appear in the linked-children list. Navigation gating flows through contract.gates.showAddChild and .showRemoveFamilyMember.',
      expectedFindings: { 'profile-owner-read': 1 },
    },
    // V0-fallback: own-learning is the retained legacy route/redirect until the 5-tab fallback is retired.
    {
      file: 'apps/mobile/src/app/(app)/own-learning.tsx',
      reason:
        'V0-fallback: retained own-learning route reads legacy mode/proxy state for redirects.',
      expectedFindings: {
        'raw-hook-call': 2,
        'raw-hook-import': 2,
        'study-family-mode-compare': 1,
      },
    },
    // V0-fallback: progress screen keeps legacy study/family scope for MODE_NAV_V1 off.
    {
      file: 'apps/mobile/src/app/(app)/progress/index.tsx',
      reason:
        'V0-fallback: progress screen uses contract scope in V1 and legacy mode scope only when V1 is off.',
      expectedFindings: {
        'raw-hook-call': 1,
        'raw-hook-import': 1,
        'study-family-mode-compare': 2,
      },
    },
    // V0-fallback: saved progress reads contract.gates.showLearningActions in V1 and falls back to the raw proxy hook in V0.
    {
      file: 'apps/mobile/src/app/(app)/progress/saved.tsx',
      reason:
        'V0-fallback: saved progress gates the delete action through contract.gates.showLearningActions in V1 and reads raw proxy state only in the legacy branch.',
      expectedFindings: {
        'proxy-state-read': 1,
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
    // V0-fallback + family-member labels: subscription contract-gates UI visibility and consolidates the
    // remaining non-UI owner reads. One raw activeProfile.isOwner read feeds analytics, child-paywall routing,
    // and the V0 fallback for billing/remove-member gates; the other two findings are member.isOwner reads on
    // family-pool member rows (different entity, domain data not navigation gating).
    {
      file: 'apps/mobile/src/app/(app)/subscription.tsx',
      reason:
        'V0-fallback + family-member labels: subscription gates UI visibility through the contract, keeps one consolidated owner read for analytics/paywall/V0 fallback, and reads member.isOwner on family-pool rows.',
      expectedFindings: { 'profile-owner-read': 3 },
    },
    // Account/profile ownership: profile creation still validates owner status outside app-tab navigation.
    {
      file: 'apps/mobile/src/app/create-profile.tsx',
      reason:
        'account/profile ownership: create-profile validates parent-owned profile creation outside the tab contract.',
      expectedFindings: { 'profile-owner-read': 1 },
    },
    // Account/profile ownership: account deletion still validates owner status outside app-tab navigation.
    {
      file: 'apps/mobile/src/app/delete-account.tsx',
      reason:
        'account/profile ownership: delete-account validates owner-only account deletion outside the tab contract.',
      expectedFindings: { 'profile-owner-read': 1 },
    },
    // V0-fallback: profile switcher keeps legacy app-context reset until V0 is retired.
    {
      file: 'apps/mobile/src/app/profiles.tsx',
      reason:
        'V0-fallback: profile switcher resets legacy app context and still needs owner/child profile filtering.',
      expectedFindings: {
        'profile-owner-read': 4,
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
    // V0-fallback: session summary keeps explicit proxy compatibility outside the normal V1 review path.
    {
      file: 'apps/mobile/src/app/session-summary/[sessionId].tsx',
      reason:
        'V0-fallback: session summary still reads raw proxy state for retained legacy proxy summaries.',
      expectedFindings: {
        'proxy-state-read': 5,
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
    // Contract primitive: compatibility guard owns legacy mode detection for screens that have not deleted V0.
    {
      file: 'apps/mobile/src/components/guards/RequireFamilyContext.tsx',
      reason:
        'contract primitive: compatibility guard owns legacy mode detection for family-only children.',
      expectedFindings: {
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
    // Contract primitive: role resolver feeds resolveNavigationContract().
    {
      file: 'apps/mobile/src/hooks/use-active-profile-role.ts',
      reason:
        'contract primitive: active-profile role resolver is an input to resolveNavigationContract.',
      expectedFindings: {
        'profile-owner-read': 1,
        'proxy-state-read': 1,
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
    // Bridge context switch: Learn-this-too must switch the adult back to Study before opening Library.
    {
      file: 'apps/mobile/src/hooks/use-clone-from-child.ts',
      reason:
        'bridge context switch: Learn-this-too recovery action writes Study mode before opening Library.',
      expectedFindings: {
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
    // Account/profile ownership: consent APIs are parent-owned data surfaces, not tab visibility gates.
    {
      file: 'apps/mobile/src/hooks/use-consent.ts',
      reason:
        'account/profile ownership: consent status query is enabled only for parent-owned profiles.',
      expectedFindings: { 'profile-owner-read': 1 },
    },
    // Data-scope fallback: dashboard query scope uses contract in V1 and legacy mode/profile in V0.
    {
      file: 'apps/mobile/src/hooks/use-dashboard.ts',
      reason:
        'V0-fallback: dashboard data scope uses contract queryScope in V1 and legacy mode/profile in V0.',
      expectedFindings: {
        'profile-owner-read': 1,
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
    // Account/profile ownership: learner-profile child editor queries are parent-owned data surfaces.
    {
      file: 'apps/mobile/src/hooks/use-learner-profile.ts',
      reason:
        'account/profile ownership: learner-profile child editor query is enabled only for parent-owned profiles.',
      expectedFindings: { 'profile-owner-read': 1 },
    },
    // Contract primitive: hook adapter gathers raw context and feeds the pure resolver.
    {
      file: 'apps/mobile/src/hooks/use-navigation-contract.ts',
      reason:
        'contract primitive: useNavigationContract is the only hook adapter that feeds raw app/proxy context into the resolver.',
      expectedFindings: {
        'proxy-state-read': 7,
        'raw-hook-call': 2,
        'raw-hook-import': 2,
      },
    },
    // Data-scope fallback: notification tap handling compares legacy app context when V1 is disabled.
    {
      file: 'apps/mobile/src/hooks/use-notification-response-handler.ts',
      reason:
        'V0-fallback: notification tap handling uses contract queryScope in V1 and legacy app context in V0.',
      expectedFindings: {
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
    // Contract primitive: parent-proxy helper is the raw proxy state owner.
    {
      file: 'apps/mobile/src/hooks/use-parent-proxy.ts',
      reason:
        'contract primitive: parent-proxy helper owns raw proxy-state derivation before the contract consumes it.',
      expectedFindings: {
        'profile-owner-read': 1,
        'proxy-state-read': 2,
      },
    },
    // Data-scope fallback: progress query scope uses contract in V1 and legacy mode/profile in V0.
    {
      file: 'apps/mobile/src/hooks/use-progress.ts',
      reason:
        'V0-fallback: progress data scope uses contract queryScope in V1 and legacy mode/profile in V0.',
      expectedFindings: {
        'profile-owner-read': 1,
        'raw-hook-call': 2,
        'raw-hook-import': 1,
      },
    },
    // Contract primitive: push-token registration must read raw proxy state before deciding registration eligibility.
    {
      file: 'apps/mobile/src/hooks/use-push-token-registration.ts',
      reason:
        'contract primitive: push-token registration reads raw proxy state to avoid registering proxied child sessions.',
      expectedFindings: {
        'proxy-state-read': 2,
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
    // Data-scope fallback: session query scope uses contract in V1 and legacy mode/profile in V0.
    {
      file: 'apps/mobile/src/hooks/use-sessions.ts',
      reason:
        'V0-fallback: session data scope uses contract queryScope in V1 and legacy mode/profile in V0.',
      expectedFindings: {
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
    // Account/profile ownership: settings hooks expose parent-owned settings, not tab visibility.
    {
      file: 'apps/mobile/src/hooks/use-settings.ts',
      reason:
        'account/profile ownership: parent-owned settings queries remain outside the tab navigation contract.',
      expectedFindings: { 'profile-owner-read': 3 },
    },
    // Contract primitive: app-context owns V0 mode and capability short-circuits.
    {
      file: 'apps/mobile/src/lib/app-context.tsx',
      reason:
        'contract primitive: app-context owns V0 mode state and the required MODE_NAV_V0/MODE_NAV_V1 short-circuits.',
      expectedFindings: { 'profile-owner-read': 2 },
    },
    // V0-fallback: legacy compatibility boundary owns Study/Family tab branching while V0 exists.
    {
      file: 'apps/mobile/src/lib/legacy-navigation-contract.ts',
      reason:
        'V0-fallback: legacy navigation compatibility boundary owns MODE_NAV_V0 Study/Family tab branching.',
      expectedFindings: {
        'profile-owner-read': 2,
        'study-family-mode-compare': 3,
      },
    },
    // Contract primitive: pure resolver owns all final raw owner/proxy interpretation.
    {
      file: 'apps/mobile/src/lib/navigation-contract.ts',
      reason:
        'contract primitive: resolveNavigationContract is the allowed owner/proxy decision point.',
      expectedFindings: {
        'profile-owner-read': 4,
        'proxy-state-read': 24,
      },
    },
    // V0-fallback: navigation helper maps legacy mode to return paths when V1 is disabled.
    {
      file: 'apps/mobile/src/lib/navigation.ts',
      reason:
        'V0-fallback: navigation helper maps legacy app context to return destinations while V0 remains supported.',
      expectedFindings: {
        'raw-hook-call': 1,
        'raw-hook-import': 1,
        'study-family-mode-compare': 1,
      },
    },
    // Profile primitive: profile provider owns raw owner/child profile selection and switching.
    {
      file: 'apps/mobile/src/lib/profile.ts',
      reason:
        'profile primitive: profile provider owns raw owner/child profile selection and switch bookkeeping.',
      expectedFindings: { 'profile-owner-read': 8 },
    },
    // Mode mutation: app-context mutation helper is the write boundary for Study/Family mode.
    {
      file: 'apps/mobile/src/lib/use-mode-switch.ts',
      reason:
        'mode mutation: useModeSwitch is the write boundary for Study/Family context changes.',
      expectedFindings: {
        'raw-hook-call': 1,
        'raw-hook-import': 1,
      },
    },
  ];

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

  it('keeps every terminal exception justified and unique', () => {
    expect(legitimateFiles.size).toBe(LEGITIMATE_RAW_NAV_GATE_FILES.length);

    const ungrounded = LEGITIMATE_RAW_NAV_GATE_FILES.filter(
      (entry) =>
        !entry.reason.includes(':') ||
        entry.reason.toLowerCase().includes('todo') ||
        entry.reason.toLowerCase().includes('migration debt') ||
        Object.keys(entry.expectedFindings).length === 0,
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
          `intentional, add a narrowly justified LEGITIMATE_RAW_NAV_GATE_FILES ` +
          `entry with fixed expected finding counts.`,
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
          `  reason: ${entry.reason}\n` +
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
