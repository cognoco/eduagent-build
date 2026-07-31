import {
  Node,
  Project,
  type CallExpression,
  type SourceFile,
  SyntaxKind,
} from 'ts-morph';

type Finding = {
  file: string;
  line: number;
  message: string;
};

const CANONICAL_FILE = 'apps/api/src/services/curriculum-core.ts';
const PUBLIC_REEXPORT_FILE = 'apps/api/src/services/curriculum.ts';
const EXPORT_FILE = 'apps/api/src/services/export.ts';
const FAMILY_BRIDGE_FILE = 'apps/api/src/services/family-bridge.ts';
const PROGRESS_FILE = 'apps/api/src/services/progress.ts';
const PROGRESS_HISTORY_FUNCTIONS = new Set([
  'getLearningResumeTarget',
  'getContinueSuggestion',
]);

function normalizedPath(sourceFile: SourceFile): string {
  return sourceFile.getFilePath().replaceAll('\\', '/');
}

function importedDatabaseNames(
  sourceFile: SourceFile,
  exportedName: string,
): Set<string> {
  const names = new Set<string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== '@eduagent/database')
      continue;
    for (const namedImport of declaration.getNamedImports()) {
      if (namedImport.getName() !== exportedName) continue;
      names.add(namedImport.getAliasNode()?.getText() ?? exportedName);
    }
    const namespaceImport = declaration.getNamespaceImport();
    if (namespaceImport) {
      names.add(`${namespaceImport.getText()}.${exportedName}`);
    }
  }
  return names;
}

function importedSqlExpressions(sourceFile: SourceFile): Set<string> {
  // Keep `sql` for terse in-memory fixtures and production files that obtain
  // the tag through a local re-export.
  const names = new Set<string>(['sql']);
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== 'drizzle-orm') continue;
    for (const namedImport of declaration.getNamedImports()) {
      if (namedImport.getName() !== 'sql') continue;
      names.add(namedImport.getAliasNode()?.getText() ?? 'sql');
    }
    const namespaceImport = declaration.getNamespaceImport();
    if (namespaceImport) {
      names.add(`${namespaceImport.getText()}.sql`);
    }
  }
  return names;
}

function containingFunctionName(node: Node): string | undefined {
  return node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)?.getName();
}

function referencesImportedTable(
  node: Node | undefined,
  importedNames: Set<string>,
): boolean {
  if (!node) return false;
  if (Node.isIdentifier(node)) return importedNames.has(node.getText());
  return (
    Node.isPropertyAccessExpression(node) && importedNames.has(node.getText())
  );
}

function nodeReferencesCurricula(
  node: Node,
  importedNames: Set<string>,
): boolean {
  if (referencesImportedTable(node, importedNames)) return true;
  return node
    .getDescendants()
    .some((descendant) => referencesImportedTable(descendant, importedNames));
}

function chainSelectsWholeRows(call: CallExpression): boolean {
  const candidates = [
    call,
    ...call.getDescendantsOfKind(SyntaxKind.CallExpression),
  ];
  return candidates.some((candidate) => {
    const expression = candidate.getExpression();
    return (
      Node.isPropertyAccessExpression(expression) &&
      expression.getName() === 'select' &&
      candidate.getArguments().length === 0
    );
  });
}

function chainProjectsCurricula(
  call: CallExpression,
  importedNames: Set<string>,
): boolean {
  const candidates = [
    call,
    ...call.getDescendantsOfKind(SyntaxKind.CallExpression),
  ];
  return candidates.some((candidate) => {
    const expression = candidate.getExpression();
    if (
      !Node.isPropertyAccessExpression(expression) ||
      expression.getName() !== 'select'
    ) {
      return false;
    }
    return candidate
      .getArguments()
      .some((argument) => nodeReferencesCurricula(argument, importedNames));
  });
}

function chainOrdersByCurriculaVersion(
  call: Node,
  importedNames: Set<string>,
): boolean {
  const callExpressions = [
    ...(Node.isCallExpression(call) ? [call] : []),
    ...call
      .getAncestors()
      .filter((ancestor): ancestor is CallExpression =>
        Node.isCallExpression(ancestor),
      ),
  ];
  return callExpressions.some((candidate) => {
    const expression = candidate.getExpression();
    if (
      !Node.isPropertyAccessExpression(expression) ||
      expression.getName() !== 'orderBy'
    ) {
      return false;
    }
    return candidate
      .getArguments()
      .some((argument) =>
        argument
          .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
          .some(
            (property) =>
              property.getName() === 'version' &&
              referencesImportedTable(property.getExpression(), importedNames),
          ),
      );
  });
}

function chainHasProfileScopedSubjectJoin(
  call: CallExpression,
  subjectNames: Set<string>,
  curriculaNames: Set<string>,
): boolean {
  const candidates = [
    call,
    ...call
      .getAncestors()
      .filter((ancestor): ancestor is CallExpression =>
        Node.isCallExpression(ancestor),
      ),
  ];
  const isImportedColumn = (
    node: Node,
    importedNames: Set<string>,
    columnName: string,
  ): boolean =>
    Node.isPropertyAccessExpression(node) &&
    node.getName() === columnName &&
    referencesImportedTable(node.getExpression(), importedNames);

  const hasMandatoryConjunct = (
    node: Node,
    matches: (predicate: CallExpression) => boolean,
  ): boolean => {
    if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node)) {
      return hasMandatoryConjunct(node.getExpression(), matches);
    }
    if (!Node.isCallExpression(node)) return false;
    const operator = node.getExpression().getText();
    if (operator === 'or') return false;
    if (operator === 'and') {
      return node
        .getArguments()
        .some((argument) => hasMandatoryConjunct(argument, matches));
    }
    return matches(node);
  };

  const hasSubjectJoin = candidates.some((candidate) => {
    const expression = candidate.getExpression();
    if (
      !Node.isPropertyAccessExpression(expression) ||
      expression.getName() !== 'innerJoin'
    ) {
      return false;
    }
    const [table, on] = candidate.getArguments();
    if (!referencesImportedTable(table, subjectNames) || !on) return false;
    return hasMandatoryConjunct(on, (predicate) => {
      if (predicate.getExpression().getText() !== 'eq') return false;
      const [left, right] = predicate.getArguments();
      if (!left || !right) return false;
      return (
        (isImportedColumn(left, subjectNames, 'id') &&
          isImportedColumn(right, curriculaNames, 'subjectId')) ||
        (isImportedColumn(right, subjectNames, 'id') &&
          isImportedColumn(left, curriculaNames, 'subjectId'))
      );
    });
  });
  if (!hasSubjectJoin) return false;

  return candidates.some((candidate) => {
    const expression = candidate.getExpression();
    if (
      !Node.isPropertyAccessExpression(expression) ||
      expression.getName() !== 'where'
    ) {
      return false;
    }
    return candidate.getArguments().some((argument) =>
      hasMandatoryConjunct(argument, (predicate) => {
        if (predicate.getExpression().getText() !== 'eq') return false;
        const [left, right] = predicate.getArguments();
        if (!left || !right) return false;
        const isSubjectProfile = (node: Node): boolean =>
          Node.isPropertyAccessExpression(node) &&
          node.getName() === 'profileId' &&
          referencesImportedTable(node.getExpression(), subjectNames);
        return (
          (isSubjectProfile(left) && right.getText() === 'profileId') ||
          (isSubjectProfile(right) && left.getText() === 'profileId')
        );
      }),
    );
  });
}

function staticRawSqlText(argument: Node | undefined): string | undefined {
  if (!argument) return undefined;
  if (Node.isStringLiteral(argument)) return argument.getLiteralText();
  if (Node.isNoSubstitutionTemplateLiteral(argument)) {
    return argument.getLiteralText();
  }
  if (Node.isTemplateExpression(argument)) {
    return [
      argument.getHead().getLiteralText(),
      ...argument
        .getTemplateSpans()
        .map((span) => span.getLiteral().getLiteralText()),
    ].join(' ');
  }
  if (Node.isBinaryExpression(argument)) {
    const left = staticRawSqlText(argument.getLeft());
    const right = staticRawSqlText(argument.getRight());
    return [left, right]
      .filter((part): part is string => part !== undefined)
      .join(' ');
  }
  if (
    Node.isParenthesizedExpression(argument) ||
    Node.isAsExpression(argument)
  ) {
    return staticRawSqlText(argument.getExpression());
  }
  return undefined;
}

const RAW_CURRICULA_READ =
  /\b(?:FROM|JOIN)\s+(?:(?:"[^"]+"|[A-Z_][\w$]*)\s*\.\s*)?(?:"curricula"|curricula)(?![\w$])/iu;

function analyzeLatestCurriculumReads(sourceFile: SourceFile): Finding[] {
  const file = normalizedPath(sourceFile);
  const curriculaNames = importedDatabaseNames(sourceFile, 'curricula');
  const subjectNames = importedDatabaseNames(sourceFile, 'subjects');
  const sqlExpressions = importedSqlExpressions(sourceFile);

  const findings: Finding[] = [];
  const progressFunctionsWithAllHistoryRead = new Set<string>();
  const progressFunctionsWithProfileScopedAllHistoryRead = new Set<string>();
  const progressFunctionsWithDelegation = new Set<string>();

  function recordRawSqlRead(node: Node, sqlText: string): void {
    if (!RAW_CURRICULA_READ.test(sqlText)) return;

    const functionName = containingFunctionName(node);
    if (
      file.endsWith(PUBLIC_REEXPORT_FILE) &&
      functionName === 'releaseBookGenerationClaimIfEmpty' &&
      /SELECT\s+MAX\(latest_curricula\.version\)/iu.test(sqlText) &&
      /NOT\s+EXISTS/iu.test(sqlText)
    ) {
      return;
    }

    findings.push({
      file,
      line: node.getStartLineNumber(),
      message:
        'raw SQL curricula read must delegate latest selection or use a named atomic-write exemption',
    });
  }

  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expression = call.getExpression();
    const functionName = containingFunctionName(call);

    if (
      Node.isIdentifier(expression) &&
      expression.getText() === 'getLatestCurricula'
    ) {
      if (functionName) progressFunctionsWithDelegation.add(functionName);
      continue;
    }

    if (!Node.isPropertyAccessExpression(expression)) continue;
    const method = expression.getName();

    if (
      method === 'raw' &&
      sqlExpressions.has(expression.getExpression().getText())
    ) {
      const [argument] = call.getArguments();
      const sqlText = staticRawSqlText(argument);
      if (sqlText) recordRawSqlRead(call, sqlText);
      continue;
    }

    if (
      method === 'from' ||
      method === 'innerJoin' ||
      method === 'leftJoin' ||
      method === 'rightJoin' ||
      method === 'fullJoin'
    ) {
      const [table] = call.getArguments();
      if (!referencesImportedTable(table, curriculaNames)) continue;
      if (
        method !== 'from' &&
        !chainSelectsWholeRows(call) &&
        !chainProjectsCurricula(call, curriculaNames) &&
        !chainOrdersByCurriculaVersion(call, curriculaNames)
      ) {
        // A curricula join used only to enforce a parent-chain predicate is
        // not a latest-curriculum read. A join-rooted whole-row selection or a
        // projected query ordered by curriculum version is guarded.
        continue;
      }

      if (
        file.endsWith(CANONICAL_FILE) &&
        functionName === 'getLatestCurricula'
      ) {
        continue;
      }
      if (
        method === 'from' &&
        file.endsWith(PROGRESS_FILE) &&
        functionName &&
        PROGRESS_HISTORY_FUNCTIONS.has(functionName)
      ) {
        progressFunctionsWithAllHistoryRead.add(functionName);
        if (
          chainHasProfileScopedSubjectJoin(call, subjectNames, curriculaNames)
        ) {
          progressFunctionsWithProfileScopedAllHistoryRead.add(functionName);
        }
        continue;
      }

      findings.push({
        file,
        line: call.getStartLineNumber(),
        message:
          'direct curricula query must delegate latest-version selection to getLatestCurriculum/getLatestCurricula',
      });
      continue;
    }

    if (method !== 'findFirst' && method !== 'findMany') continue;
    const receiver = expression.getExpression().getText();
    if (!/(?:^|\.)query\.curricula$/u.test(receiver)) continue;

    if (
      file.endsWith(EXPORT_FILE) &&
      functionName === 'generateExport' &&
      method === 'findMany'
    ) {
      continue;
    }
    if (
      file.endsWith(FAMILY_BRIDGE_FILE) &&
      functionName === 'resolveCurriculum' &&
      method === 'findFirst' &&
      call.getText().includes('eq(curricula.version, 1)')
    ) {
      continue;
    }

    findings.push({
      file,
      line: call.getStartLineNumber(),
      message:
        'relational curricula read is unordered or duplicates the canonical latest-version accessor',
    });
  }

  for (const tagged of sourceFile.getDescendantsOfKind(
    SyntaxKind.TaggedTemplateExpression,
  )) {
    if (!sqlExpressions.has(tagged.getTag().getText())) continue;
    const sqlText = tagged.getTemplate().getText();
    recordRawSqlRead(tagged, sqlText);
  }

  if (file.endsWith(PROGRESS_FILE)) {
    for (const functionName of PROGRESS_HISTORY_FUNCTIONS) {
      if (
        !progressFunctionsWithAllHistoryRead.has(functionName) ||
        !progressFunctionsWithProfileScopedAllHistoryRead.has(functionName)
      ) {
        findings.push({
          file,
          line: 1,
          message: `${functionName} must retain its profile-scoped all-version curriculum read for historical sessions`,
        });
      }
      if (!progressFunctionsWithDelegation.has(functionName)) {
        findings.push({
          file,
          line: 1,
          message: `${functionName} must delegate its latest-per-subject map to getLatestCurricula`,
        });
      }
    }
  }

  return findings;
}

function source(filePath: string, text: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile(filePath, text);
}

describe('latest curriculum read guard [WI-2463]', () => {
  it('rejects an unordered relational latest-curriculum read', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          import { curricula, subjects } from '@eduagent/database';
          async function load(db: any, subjectId: string) {
            return db.query.curricula.findFirst({ where: eq(curricula.subjectId, subjectId) });
          }
        `,
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('unordered'),
      }),
    ]);
  });

  it('rejects an unordered relational read even without a curricula import', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          async function load(db: any) {
            return db.query.curricula.findFirst();
          }
        `,
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('unordered'),
      }),
    ]);
  });

  it('rejects join-rooted and raw SQL curricula reads', () => {
    const joinFindings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          import * as database from '@eduagent/database';
          async function load(db: any) {
            return db.select({ id: database.curricula.id }).from(database.subjects)
              .innerJoin(database.curricula, eq(database.curricula.subjectId, database.subjects.id))
              .orderBy(desc(database.curricula.version));
          }
        `,
      ),
    );
    const rawFindings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          async function load(db: any) {
            return db.execute(sql\`SELECT * FROM curricula ORDER BY version DESC\`);
          }
        `,
      ),
    );

    expect(joinFindings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('delegate'),
      }),
    ]);
    expect(rawFindings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('raw SQL'),
      }),
    ]);
  });

  it('rejects an unordered projected curricula join', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          import { curricula, subjects } from '@eduagent/database';
          async function load(db: any) {
            return db.select({ id: curricula.id }).from(subjects)
              .innerJoin(curricula, eq(curricula.subjectId, subjects.id))
              .limit(1);
          }
        `,
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('delegate'),
      }),
    ]);
  });

  it('accepts a parent-chain join that projects no curricula columns', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          import { curricula, subjects } from '@eduagent/database';
          async function load(db: any) {
            return db.select({ id: subjects.id }).from(subjects)
              .innerJoin(curricula, eq(curricula.subjectId, subjects.id))
              .where(eq(subjects.profileId, 'profile-id'));
          }
        `,
      ),
    );

    expect(findings).toEqual([]);
  });

  it('rejects raw SQL with a quoted curricula table name', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          async function load(db: any) {
            return db.execute(sql\`SELECT * FROM "curricula"\`);
          }
        `,
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('raw SQL'),
      }),
    ]);
  });

  it('rejects raw SQL with a schema-qualified curricula table name', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          async function load(db: any) {
            return db.execute(sql\`SELECT * FROM public.curricula\`);
          }
        `,
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('raw SQL'),
      }),
    ]);
  });

  it('rejects static sql.raw curricula reads but ignores dynamic SQL it cannot prove', () => {
    const staticFindings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          async function load(db: any) {
            return db.execute(sql.raw('SELECT * FROM public."curricula"'));
          }
        `,
      ),
    );
    const dynamicFindings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          async function load(db: any, query: string) {
            return db.execute(sql.raw(query));
          }
        `,
      ),
    );

    expect(staticFindings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('raw SQL'),
      }),
    ]);
    expect(dynamicFindings).toEqual([]);
  });

  it('rejects interpolated and namespace-qualified raw SQL curricula reads', () => {
    const interpolatedFindings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          import { sql } from 'drizzle-orm';
          async function load(db: any, subjectId: string) {
            return db.execute(sql.raw(\`SELECT * FROM curricula WHERE subject_id = '\${subjectId}'\`));
          }
        `,
      ),
    );
    const namespaceFindings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          import * as drizzle from 'drizzle-orm';
          async function load(db: any) {
            const tagged = await db.execute(drizzle.sql\`SELECT * FROM curricula\`);
            const raw = await db.execute(drizzle.sql.raw('SELECT * FROM curricula'));
            return { tagged, raw };
          }
        `,
      ),
    );
    const aliasFindings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          import { sql as drizzleSql } from 'drizzle-orm';
          async function load(db: any) {
            return db.execute(drizzleSql.raw('SELECT * FROM curricula'));
          }
        `,
      ),
    );
    const dynamicTemplateFindings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          import { sql } from 'drizzle-orm';
          async function load(db: any, curriculaTable: string) {
            return db.execute(sql.raw(\`\${curriculaTable}\`));
          }
        `,
      ),
    );

    expect(interpolatedFindings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('raw SQL'),
      }),
    ]);
    expect(namespaceFindings).toHaveLength(2);
    expect(namespaceFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('raw SQL'),
        }),
      ]),
    );
    expect(aliasFindings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('raw SQL'),
      }),
    ]);
    expect(dynamicTemplateFindings).toEqual([]);
  });

  it('accepts the named atomic latest-version write predicate', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        PUBLIC_REEXPORT_FILE,
        `
          async function releaseBookGenerationClaimIfEmpty(db: any, subjectId: string) {
            return db.update(books).where(sql\`
              NOT EXISTS (
                SELECT 1 FROM curriculum_topics
                INNER JOIN curricula ON curricula.id = curriculum_topics.curriculum_id
                WHERE curricula.version = (
                  SELECT MAX(latest_curricula.version)
                  FROM curricula AS latest_curricula
                  WHERE latest_curricula.subject_id = \${subjectId}
                )
              )
            \`);
          }
        `,
      ),
    );

    expect(findings).toEqual([]);
  });

  it('rejects a duplicated ordered latest-curriculum query', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          import { curricula } from '@eduagent/database';
          async function load(db: any, subjectIds: string[]) {
            return db.select().from(curricula)
              .where(inArray(curricula.subjectId, subjectIds))
              .orderBy(desc(curricula.version));
          }
        `,
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('delegate'),
      }),
    ]);
  });

  it('accepts canonical delegation without a direct curricula read', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        'apps/api/src/services/new-consumer.ts',
        `
          import { curricula } from '@eduagent/database';
          import { getLatestCurricula } from './curriculum';
          async function load(db: any, profileId: string, subjectIds: string[]) {
            return getLatestCurricula(db, profileId, subjectIds);
          }
        `,
      ),
    );

    expect(findings).toEqual([]);
  });

  it('accepts only the named all-history, version-1, and progress historical-read exemptions', () => {
    const exportFindings = analyzeLatestCurriculumReads(
      source(
        EXPORT_FILE,
        `
          import { curricula } from '@eduagent/database';
          export async function generateExport(db: any, subjectIds: string[]) {
            return db.query.curricula.findMany({ where: inArray(curricula.subjectId, subjectIds) });
          }
        `,
      ),
    );
    const familyFindings = analyzeLatestCurriculumReads(
      source(
        FAMILY_BRIDGE_FILE,
        `
          import { curricula } from '@eduagent/database';
          async function resolveCurriculum(db: any, subjectId: string) {
            return db.query.curricula.findFirst({
              where: and(eq(curricula.subjectId, subjectId), eq(curricula.version, 1)),
            });
          }
        `,
      ),
    );
    const progressFindings = analyzeLatestCurriculumReads(
      source(
        PROGRESS_FILE,
        `
          import { curricula, subjects } from '@eduagent/database';
          import { getLatestCurricula } from './curriculum';
          async function getLearningResumeTarget(db: any, profileId: string, subjectIds: string[]) {
            const history = await db.select().from(curricula)
              .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
              .where(and(inArray(curricula.subjectId, subjectIds), eq(subjects.profileId, profileId)));
            const latest = await getLatestCurricula(db, profileId, subjectIds);
            return { history, latest };
          }
          async function getContinueSuggestion(db: any, profileId: string, subjectIds: string[]) {
            const history = await db.select().from(curricula)
              .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
              .where(and(inArray(curricula.subjectId, subjectIds), eq(subjects.profileId, profileId)));
            const latest = await getLatestCurricula(db, profileId, subjectIds);
            return { history, latest };
          }
        `,
      ),
    );

    expect(exportFindings).toEqual([]);
    expect(familyFindings).toEqual([]);
    expect(progressFindings).toEqual([]);
  });

  it('rejects a progress all-history read without an explicit profile predicate', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        PROGRESS_FILE,
        `
          import { curricula } from '@eduagent/database';
          import { getLatestCurricula } from './curriculum';
          async function getLearningResumeTarget(db: any, profileId: string, subjectIds: string[]) {
            const history = await db.select().from(curricula).where(inArray(curricula.subjectId, subjectIds));
            const latest = await getLatestCurricula(db, profileId, subjectIds);
            return { history, latest };
          }
          async function getContinueSuggestion(db: any, profileId: string, subjectIds: string[]) {
            const history = await db.select().from(curricula).where(inArray(curricula.subjectId, subjectIds));
            const latest = await getLatestCurricula(db, profileId, subjectIds);
            return { history, latest };
          }
        `,
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          'getLearningResumeTarget must retain its profile-scoped all-version curriculum read',
        ),
      }),
      expect.objectContaining({
        message: expect.stringContaining(
          'getContinueSuggestion must retain its profile-scoped all-version curriculum read',
        ),
      }),
    ]);
  });

  it('rejects a progress history read whose subject join does not follow the ownership chain', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        PROGRESS_FILE,
        `
          import { curricula, subjects } from '@eduagent/database';
          import { getLatestCurricula } from './curriculum';
          async function getLearningResumeTarget(db: any, profileId: string, subjectIds: string[]) {
            const history = await db.select().from(curricula)
              .innerJoin(subjects, eq(subjects.profileId, profileId))
              .where(and(inArray(curricula.subjectId, subjectIds), eq(subjects.profileId, profileId)));
            const latest = await getLatestCurricula(db, profileId, subjectIds);
            return { history, latest };
          }
          async function getContinueSuggestion(db: any, profileId: string, subjectIds: string[]) {
            const history = await db.select().from(curricula)
              .innerJoin(subjects, eq(subjects.profileId, profileId))
              .where(and(inArray(curricula.subjectId, subjectIds), eq(subjects.profileId, profileId)));
            const latest = await getLatestCurricula(db, profileId, subjectIds);
            return { history, latest };
          }
        `,
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          'getLearningResumeTarget must retain its profile-scoped all-version curriculum read',
        ),
      }),
      expect.objectContaining({
        message: expect.stringContaining(
          'getContinueSuggestion must retain its profile-scoped all-version curriculum read',
        ),
      }),
    ]);
  });

  it('rejects progress ownership equalities hidden beneath a disjunction', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        PROGRESS_FILE,
        `
          import { curricula, subjects } from '@eduagent/database';
          import { getLatestCurricula } from './curriculum';
          async function getLearningResumeTarget(db: any, profileId: string, subjectIds: string[]) {
            const history = await db.select().from(curricula)
              .innerJoin(subjects, or(eq(subjects.id, curricula.subjectId), sql\`true\`))
              .where(or(eq(subjects.profileId, profileId), sql\`true\`));
            const latest = await getLatestCurricula(db, profileId, subjectIds);
            return { history, latest };
          }
          async function getContinueSuggestion(db: any, profileId: string, subjectIds: string[]) {
            const history = await db.select().from(curricula)
              .innerJoin(subjects, or(eq(subjects.id, curricula.subjectId), sql\`true\`))
              .where(or(eq(subjects.profileId, profileId), sql\`true\`));
            const latest = await getLatestCurricula(db, profileId, subjectIds);
            return { history, latest };
          }
        `,
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          'getLearningResumeTarget must retain its profile-scoped all-version curriculum read',
        ),
      }),
      expect.objectContaining({
        message: expect.stringContaining(
          'getContinueSuggestion must retain its profile-scoped all-version curriculum read',
        ),
      }),
    ]);
  });

  it('rejects a progress history path that stops delegating its latest map', () => {
    const findings = analyzeLatestCurriculumReads(
      source(
        PROGRESS_FILE,
        `
          import { curricula, subjects } from '@eduagent/database';
          import { getLatestCurricula } from './curriculum';
          async function getLearningResumeTarget(db: any, profileId: string, subjectIds: string[]) {
            return db.select().from(curricula)
              .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
              .where(and(inArray(curricula.subjectId, subjectIds), eq(subjects.profileId, profileId)));
          }
          async function getContinueSuggestion(db: any, profileId: string, subjectIds: string[]) {
            const history = await db.select().from(curricula)
              .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
              .where(and(inArray(curricula.subjectId, subjectIds), eq(subjects.profileId, profileId)));
            const latest = await getLatestCurricula(db, profileId, subjectIds);
            return { history, latest };
          }
        `,
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          'getLearningResumeTarget must delegate',
        ),
      }),
    ]);
  });

  it('accepts the current production tree', () => {
    const project = new Project({
      tsConfigFilePath: 'apps/api/tsconfig.json',
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths('apps/api/src/**/*.ts');

    const findings = project
      .getSourceFiles()
      .filter((file) => {
        const path = normalizedPath(file);
        return (
          !path.endsWith('.test.ts') &&
          !path.endsWith('.integration.test.ts') &&
          !path.endsWith('/test-seed.ts')
        );
      })
      .flatMap(analyzeLatestCurriculumReads);

    expect(findings).toEqual([]);
  });
});
