/**
 * WI-2386 whole-repo consent-purpose contract guard.
 *
 * Whole-consent production paths must consume the typed purpose set from
 * @eduagent/schemas. This guard rejects the former default/literal proxies and
 * keeps the only historical SQL exceptions explicit and reviewable.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Node, Project, SourceFile, SyntaxKind } from 'ts-morph';

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_GLOBS = [
  'apps/*/src/**/*.ts',
  'apps/*/src/**/*.tsx',
  'packages/*/src/**/*.ts',
  'packages/*/src/**/*.tsx',
];
const HISTORICAL_MIGRATION_ALLOWLIST = new Set([
  'apps/api/drizzle/0109_identity_reseed.sql',
  'apps/api/drizzle/0114_identity_cutover_homes.sql',
  'apps/api/drizzle/0115_identity_cutover_reseed.sql',
]);
const CONSENT_PURPOSE_LITERALS = new Set(['platform_use', 'llm_disclosure']);

export type ConsentPurposeGuardRule =
  | 'default-purpose-identifier'
  | 'literal-purpose-selector'
  | 'literal-purpose-write'
  | 'implicit-database-purpose-default'
  | 'defaulted-purpose-parameter'
  | 'unallowlisted-historical-purpose-sql';

export interface ConsentPurposeViolation {
  file: string;
  line: number;
  rule: ConsentPurposeGuardRule;
}

function isTestFile(file: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

function isCanonicalPurposeDeclaration(file: string, node: Node): boolean {
  if (file !== 'packages/schemas/src/consent.ts') return false;
  return (
    node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ===
    'CONSENT_PURPOSES'
  );
}

function lineOf(source: SourceFile, node: Node): number {
  return source.getLineAndColumnAtPos(node.getStart()).line;
}

export function analyzeSource(
  file: string,
  content: string,
): ConsentPurposeViolation[] {
  if (isTestFile(file)) return [];
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(file, content);
  const violations: ConsentPurposeViolation[] = [];
  const add = (node: Node, rule: ConsentPurposeGuardRule) => {
    violations.push({ file, line: lineOf(source, node), rule });
  };

  for (const identifier of source.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (identifier.getText() === 'DEFAULT_CONSENT_PURPOSE') {
      add(identifier, 'default-purpose-identifier');
    }
  }

  for (const parameter of source.getDescendantsOfKind(SyntaxKind.Parameter)) {
    if (parameter.getName() === 'purpose' && parameter.getInitializer()) {
      add(parameter, 'defaulted-purpose-parameter');
    }
  }

  for (const literal of source.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    if (!CONSENT_PURPOSE_LITERALS.has(literal.getLiteralText())) continue;
    if (isCanonicalPurposeDeclaration(file, literal)) continue;

    const property = literal.getFirstAncestorByKind(
      SyntaxKind.PropertyAssignment,
    );
    if (property?.getName() === 'purpose') {
      add(literal, 'literal-purpose-write');
      continue;
    }

    const call = literal.getFirstAncestorByKind(SyntaxKind.CallExpression);
    if (call) {
      const expression = call.getExpression();
      if (
        Node.isPropertyAccessExpression(expression) &&
        expression.getName() === 'default'
      ) {
        add(literal, 'implicit-database-purpose-default');
        continue;
      }
      if (
        (expression.getText() === 'eq' || expression.getText() === 'inArray') &&
        call.getArguments()[0]?.getText().endsWith('.purpose')
      ) {
        add(literal, 'literal-purpose-selector');
      }
    }
  }

  for (const tagged of source.getDescendantsOfKind(
    SyntaxKind.TaggedTemplateExpression,
  )) {
    if (tagged.getTag().getText() !== 'sql') continue;
    const template = tagged.getTemplate().getText();
    if (
      [...CONSENT_PURPOSE_LITERALS].some((purpose) =>
        template.includes(purpose),
      ) &&
      /\bpurpose\b/.test(template)
    ) {
      add(tagged, 'literal-purpose-selector');
    }
  }
  return violations;
}

function relative(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}

export function collectConsentPurposeViolations(): ConsentPurposeViolation[] {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(
    SOURCE_GLOBS.map((glob) => path.join(REPO_ROOT, glob)),
  );
  const violations = project.getSourceFiles().flatMap((source) => {
    const file = relative(source.getFilePath());
    if (
      isTestFile(file) ||
      file === 'scripts/check-consent-purpose-contract.ts'
    ) {
      return [];
    }
    return analyzeSource(file, source.getFullText());
  });

  const migrationDir = path.join(REPO_ROOT, 'apps/api/drizzle');
  for (const entry of fs.readdirSync(migrationDir)) {
    if (!entry.endsWith('.sql')) continue;
    const file = `apps/api/drizzle/${entry}`;
    const content = fs.readFileSync(path.join(migrationDir, entry), 'utf8');
    const purposeIndex = Math.min(
      ...[...CONSENT_PURPOSE_LITERALS]
        .map((purpose) => content.indexOf(purpose))
        .filter((index) => index >= 0),
    );
    if (
      purposeIndex !== Infinity &&
      !HISTORICAL_MIGRATION_ALLOWLIST.has(file)
    ) {
      violations.push({
        file,
        line: content.slice(0, purposeIndex).split('\n').length,
        rule: 'unallowlisted-historical-purpose-sql',
      });
    }
  }
  return violations.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
  );
}

function main(): number {
  const violations = collectConsentPurposeViolations();
  if (violations.length === 0) {
    process.stdout.write('consent-purpose-contract: clean\n');
    return 0;
  }
  process.stderr.write('consent-purpose-contract: forbidden proxies found\n');
  for (const violation of violations) {
    process.stderr.write(
      `  ${violation.file}:${violation.line} ${violation.rule}\n`,
    );
  }
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}
