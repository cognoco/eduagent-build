import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  Node,
  Project,
  SyntaxKind,
  type CallExpression,
  type SourceFile,
} from 'ts-morph';

const ALLOW_MARKER = 'scope-allow:';
const SERVICES_ROOT = 'apps/api/src/services';

const PARENT_CHAIN_TABLE_VARS = new Set([
  'subjects',
  'curricula',
  'curriculumBooks',
  'curriculumChapters',
  'curriculumTopics',
]);

const SCOPED_PREDICATE_TOKENS = [
  '.profileId',
  '.ownerProfileId',
  '.parentProfileId',
  '.childProfileId',
  '.fromProfileId',
  '.toProfileId',
  '.subjectId',
  '.bookId',
  '.topicId',
  '.curriculumId',
  '.personId',
  '.organizationId',
  '.subscriptionId',
  'profileId',
  'ownerProfileId',
  'parentProfileId',
  'childProfileId',
  'fromProfileId',
  'toProfileId',
  'subjectId',
  'bookId',
  'topicId',
  'curriculumId',
  'personId',
  'chargePersonId',
  'organizationId',
  'subscriptionId',
  'profileIds',
  'assertParentAccess',
  'assertChildBelongsToParent',
  'verifyPersonOwnership',
  'verifyPersonIsOrgAdmin',
  'verifyProfileOwnership',
  'requireCallerPersonId',
  'personScoped',
  'profileScoped',
  'profile-scoped',
];

const PROFILE_SCOPED_SCAN_EXCEPTIONS = new Set([
  // source_child_profile_id is provenance; topic ownership is parent-chain via
  // curriculum_topics.book_id -> curriculum_books -> subjects.profile_id.
  'curriculum_topics',
]);

interface Violation {
  file: string;
  line: number;
  table: string;
  operation: 'select' | 'update' | 'delete';
  snippet: string;
}

function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    try {
      statSync(join(dir, 'pnpm-workspace.yaml'));
      return dir;
    } catch {
      // keep walking
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const SERVICES_DIR = join(REPO_ROOT, SERVICES_ROOT);
const SCHEMA_DIR = join(REPO_ROOT, 'packages/database/src/schema');

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (entry.isFile() && shouldScanFile(full)) {
      out.push(full);
    }
  }
}

function shouldScanFile(absPath: string): boolean {
  const rel = relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.startsWith(`${SERVICES_ROOT}/`)) return false;
  if (!rel.endsWith('.ts')) return false;
  if (rel.endsWith('.test.ts')) return false;
  if (rel.endsWith('.integration.test.ts')) return false;
  if (rel.endsWith('.guard.test.ts')) return false;
  return true;
}

function loadTableVarNamesBySqlName(): Map<string, string> {
  const tableVars = new Map<string, string>();
  for (const entry of readdirSync(SCHEMA_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const text = readFileSync(join(SCHEMA_DIR, entry.name), 'utf8');
    for (const match of text.matchAll(
      /export const ([A-Za-z_$][\w$]*) = pgTable\(\s*['"]([a-z_]+)['"]/g,
    )) {
      tableVars.set(match[2]!, match[1]!);
    }
  }
  return tableVars;
}

function loadScopedTableVars(): Set<string> {
  const tableVarsBySqlName = loadTableVarNamesBySqlName();
  const tableVars = new Set<string>(PARENT_CHAIN_TABLE_VARS);
  for (const sqlName of loadProfileScopedSqlTableNames()) {
    const tableVar = tableVarsBySqlName.get(sqlName);
    if (tableVar) tableVars.add(tableVar);
  }
  return tableVars;
}

function loadProfileScopedSqlTableNames(): string[] {
  const tableNames: string[] = [];
  for (const entry of readdirSync(SCHEMA_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const text = readFileSync(join(SCHEMA_DIR, entry.name), 'utf8');
    for (const match of text.matchAll(/pgTable\(\s*['"]([a-z_]+)['"]/g)) {
      const tableName = match[1]!;
      if (PROFILE_SCOPED_SCAN_EXCEPTIONS.has(tableName)) continue;
      const tableStart = match.index!;
      const nextTableStart = text.indexOf('pgTable(', tableStart + 1);
      const tableBlock = text.slice(
        tableStart,
        nextTableStart === -1 ? undefined : nextTableStart,
      );
      if (declaresProfileColumn(tableBlock)) {
        tableNames.push(tableName);
      }
    }
  }
  return tableNames;
}

function declaresProfileColumn(tableBlock: string): boolean {
  return /\b[A-Za-z_$][\w$]*\s*:\s*(?:uuid|text)\(\s*['"](?:[a-z_]+_)?profile_id['"]/m.test(
    tableBlock,
  );
}

function getStatementText(node: Node): string {
  const statement = node.getFirstAncestor((ancestor) =>
    Node.isStatement(ancestor),
  );
  return (statement ?? node).getText();
}

function getStatementSnippet(node: Node): string {
  return getStatementText(node).replace(/\s+/g, ' ').trim().slice(0, 180);
}

function hasInlineAllow(sourceFile: SourceFile, node: Node): boolean {
  const startLine = node.getStartLineNumber();
  const lines = sourceFile.getFullText().split(/\r?\n/);
  const start = Math.max(1, startLine - 3);
  const nearby = lines.slice(start - 1, startLine).join('\n');
  return (
    nearby.includes(ALLOW_MARKER) ||
    getStatementText(node).includes(ALLOW_MARKER)
  );
}

function hasScopedPredicate(node: Node): boolean {
  const text = getStatementText(node);
  if (!/\.where\s*\(/.test(text)) return false;
  return SCOPED_PREDICATE_TOKENS.some((token) => text.includes(token));
}

function identifierText(node: Node | undefined): string | null {
  if (!node) return null;
  if (Node.isIdentifier(node)) return node.getText();
  if (Node.isPropertyAccessExpression(node)) return node.getName();
  return null;
}

function classifyCall(
  call: CallExpression,
  scopedTableVars: Set<string>,
): { operation: 'select' | 'update' | 'delete'; table: string } | undefined {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return undefined;

  const methodName = expression.getName();
  if (methodName === 'from') {
    const table = identifierText(call.getArguments()[0]);
    if (table && scopedTableVars.has(table)) {
      return { operation: 'select', table };
    }
  }

  if (methodName === 'update' || methodName === 'delete') {
    const table = identifierText(call.getArguments()[0]);
    if (table && scopedTableVars.has(table)) {
      return { operation: methodName, table };
    }
  }

  return undefined;
}

function scanSourceFile(
  sourceFile: SourceFile,
  scopedTableVars: Set<string>,
): Violation[] {
  const violations: Violation[] = [];
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const match = classifyCall(call, scopedTableVars);
    if (!match) continue;
    if (hasScopedPredicate(call)) continue;
    if (hasInlineAllow(sourceFile, call)) continue;

    violations.push({
      file: relative(REPO_ROOT, sourceFile.getFilePath()).replace(/\\/g, '/'),
      line: call.getStartLineNumber(),
      table: match.table,
      operation: match.operation,
      snippet: getStatementSnippet(call),
    });
  }
  return violations;
}

function scanServices(): Violation[] {
  const files: string[] = [];
  walk(SERVICES_DIR, files);
  const project = new Project({
    tsConfigFilePath: join(REPO_ROOT, 'apps/api/tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });
  const scopedTableVars = loadScopedTableVars();
  const violations: Violation[] = [];

  for (const file of files) {
    const sourceFile = project.addSourceFileAtPath(file);
    violations.push(...scanSourceFile(sourceFile, scopedTableVars));
  }

  return violations;
}

describe('[WI-1449] profile-scoped service query guard', () => {
  it('flags direct profile-scoped table access without a scoped predicate or inline allow', () => {
    const violations = scanServices();
    if (violations.length > 0) {
      throw new Error(
        [
          'Direct service queries touching profile-scoped or parent-chain tables need',
          'an explicit profile/owner predicate, a parent-chain ownership helper, or',
          `a narrow inline // ${ALLOW_MARKER} <reason> comment.`,
          '',
          ...violations.map(
            (v) =>
              `  - ${v.file}:${v.line} ${v.operation}(${v.table}) ${v.snippet}`,
          ),
        ].join('\n'),
      );
    }
    expect(violations).toEqual([]);
  });

  it('self-check: detects an unscoped direct select fixture', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      '/fixture.ts',
      `async function f(db: any) { return db.select().from(memoryFacts); }`,
    );
    expect(scanSourceFile(source, new Set(['memoryFacts']))).toHaveLength(1);
  });

  it('self-check: accepts scoped predicates and inline allows', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      '/fixture.ts',
      [
        `async function a(db: any, profileId: string) {`,
        `  await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));`,
        `}`,
        `async function b(db: any) {`,
        `  // ${ALLOW_MARKER} global maintenance scan with separately audited caller`,
        `  await db.select().from(memoryFacts);`,
        `}`,
      ].join('\n'),
    );
    expect(scanSourceFile(source, new Set(['memoryFacts']))).toHaveLength(0);
  });
});
