import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ts from 'typescript';

type MatchPattern = RegExp | RegExp[];

export interface PlaywrightProjectSelection {
  name: string;
  dependencies?: string[];
  testMatch: MatchPattern;
  testIgnore?: MatchPattern;
}

interface CollectorInput {
  rootDir: string;
  testDir: string;
  projects: PlaywrightProjectSelection[];
  selectedProjects: string[];
  testIgnore?: MatchPattern;
}

interface CoverageInput {
  requiredScenarios: Iterable<string>;
  apiBaseUrl: string;
  headers: Record<string, string>;
  fetchImpl?: typeof fetch;
}

type RequestedExports = Set<string> | null;

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function asPatterns(pattern: MatchPattern | undefined): RegExp[] {
  return pattern ? (Array.isArray(pattern) ? pattern : [pattern]) : [];
}

function matchesAny(filePath: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(filePath);
  });
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return SOURCE_EXTENSIONS.includes(path.extname(entry.name))
      ? [entryPath]
      : [];
  });
}

function selectedProjects(
  projects: PlaywrightProjectSelection[],
  names: string[],
): PlaywrightProjectSelection[] {
  const byName = new Map(projects.map((project) => [project.name, project]));
  const resolved = new Map<string, PlaywrightProjectSelection>();
  const visit = (name: string): void => {
    if (resolved.has(name)) return;
    const project = byName.get(name);
    if (!project) throw new Error(`Unknown Playwright project: ${name}`);
    resolved.set(name, project);
    for (const dependency of project.dependencies ?? []) visit(dependency);
  };
  for (const name of names) visit(name);
  return [...resolved.values()];
}

function selectedEntryFiles(input: CollectorInput): string[] {
  const testDir = path.resolve(input.rootDir, input.testDir);
  const projects = selectedProjects(input.projects, input.selectedProjects);
  const globalIgnore = asPatterns(input.testIgnore);

  return listSourceFiles(testDir).filter((filePath) => {
    const normalized = filePath.replaceAll(path.sep, '/');
    if (matchesAny(normalized, globalIgnore)) return false;
    return projects.some(
      (project) =>
        !matchesAny(normalized, asPatterns(project.testIgnore)) &&
        matchesAny(normalized, asPatterns(project.testMatch)),
    );
  });
}

function resolveRelativeImport(
  importerPath: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith('.')) return null;
  const unresolved = path.resolve(path.dirname(importerPath), specifier);
  const candidates = [
    unresolved,
    ...SOURCE_EXTENSIONS.map((extension) => `${unresolved}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) =>
      path.join(unresolved, `index${extension}`),
    ),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next extension candidate.
    }
  }
  return null;
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function parseSource(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
}

function importedExports(importDeclaration: ts.ImportDeclaration): Set<string> {
  const requested = new Set<string>();
  const clause = importDeclaration.importClause;
  if (!clause) return requested.add('*');
  if (clause.name) requested.add('default');
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      requested.add('*');
    } else {
      for (const element of clause.namedBindings.elements) {
        requested.add(element.propertyName?.text ?? element.name.text);
      }
    }
  }
  return requested;
}

function mergeRequestedExports(
  selections: Map<string, RequestedExports>,
  filePath: string,
  requested: RequestedExports,
): boolean {
  if (!selections.has(filePath)) {
    selections.set(filePath, requested);
    return true;
  }
  const existing = selections.get(filePath);
  if (existing === undefined) return false;
  if (existing === null || requested === null) {
    if (existing === null) return false;
    selections.set(filePath, null);
    return true;
  }
  const before = existing.size;
  for (const name of requested) existing.add(name);
  return existing.size !== before;
}

function collectModuleSelections(
  entries: string[],
): Map<string, RequestedExports> {
  const selections = new Map<string, RequestedExports>();
  const queue = [...entries];
  for (const entry of entries) selections.set(entry, null);

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (!filePath) break;
    const sourceFile = parseSource(filePath);
    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        continue;
      }
      const importedPath = resolveRelativeImport(
        filePath,
        statement.moduleSpecifier.text,
      );
      if (!importedPath) continue;
      if (
        mergeRequestedExports(
          selections,
          importedPath,
          importedExports(statement),
        )
      ) {
        queue.push(importedPath);
      }
    }
  }
  return selections;
}

function declarationName(node: ts.Node): string | null {
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
    node.name
  ) {
    return node.name.text;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return null;
}

function selectedRoots(
  sourceFile: ts.SourceFile,
  requested: RequestedExports,
): ts.Node[] {
  if (requested === null || requested.has('*')) return [sourceFile];
  const roots: ts.Node[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = declarationName(declaration);
        if (name && requested.has(name)) roots.push(declaration);
      }
    } else {
      const name = declarationName(statement);
      if (name && requested.has(name)) roots.push(statement);
    }
  }
  return roots;
}

function walk(node: ts.Node, visit: (candidate: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function collectFunctionDefinitions(roots: ts.Node[]): Map<string, ts.Node> {
  const definitions = new Map<string, ts.Node>();
  for (const root of roots) {
    walk(root, (node) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        definitions.set(node.name.text, node);
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
      ) {
        definitions.set(node.name.text, node.initializer);
      }
    });
  }
  return definitions;
}

function containsCallTo(node: ts.Node, names: Set<string>): boolean {
  let found = false;
  walk(node, (candidate) => {
    if (!ts.isCallExpression(candidate)) return;
    const name = calleeName(candidate.expression);
    if (name && names.has(name)) found = true;
  });
  return found;
}

function stringValue(expression: ts.Expression): string | null {
  return ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
    ? expression.text
    : null;
}

function propertyName(property: ts.ObjectLiteralElementLike): string | null {
  if (!('name' in property) || !property.name) return null;
  return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
    ? property.name.text
    : null;
}

function collectCallLiterals(
  call: ts.CallExpression,
  scenarios: Set<string>,
): void {
  for (const argument of call.arguments) {
    const direct = stringValue(argument);
    if (direct) scenarios.add(direct);
    if (!ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = propertyName(property);
      if (name !== 'scenario' && name !== 'seedScenario') continue;
      const value = stringValue(property.initializer);
      if (value) scenarios.add(value);
    }
  }
}

export function collectSelectedPlaywrightSeedScenarios(
  input: CollectorInput,
): string[] {
  const moduleSelections = collectModuleSelections(selectedEntryFiles(input));
  const roots = [...moduleSelections].flatMap(([filePath, requested]) =>
    selectedRoots(parseSource(filePath), requested),
  );
  const definitions = collectFunctionDefinitions(roots);
  const seedFunctions = new Set(['seedScenario']);

  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, definition] of definitions) {
      if (
        !seedFunctions.has(name) &&
        containsCallTo(definition, seedFunctions)
      ) {
        seedFunctions.add(name);
        changed = true;
      }
    }
  }

  const scenarios = new Set<string>();
  for (const root of roots) {
    walk(root, (node) => {
      if (
        ts.isPropertyAssignment(node) &&
        propertyName(node) === 'seedScenario'
      ) {
        const value = stringValue(node.initializer);
        if (value) scenarios.add(value);
      }
      if (!ts.isCallExpression(node)) return;
      const name = calleeName(node.expression);
      if (name && seedFunctions.has(name)) collectCallLiterals(node, scenarios);
    });
  }
  return [...scenarios].sort();
}

export async function assertDeployedSeedScenarioCoverage(
  input: CoverageInput,
): Promise<void> {
  const target = input.apiBaseUrl.replace(/\/$/, '');
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(
      `${target}/v1/__test/scenarios`,
      { headers: input.headers },
    );
  } catch {
    throw new Error(`${target}: catalog request failed`);
  }
  if (!response.ok) {
    throw new Error(
      `${target}: catalog request failed with HTTP ${response.status}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    throw new Error(`${target}: catalog response was malformed`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { scenarios?: unknown }).scenarios) ||
    !(parsed as { scenarios: unknown[] }).scenarios.every(
      (scenario) => typeof scenario === 'string',
    )
  ) {
    throw new Error(`${target}: catalog response was malformed`);
  }

  const deployed = new Set((parsed as { scenarios: string[] }).scenarios);
  const missing = [...new Set(input.requiredScenarios)]
    .filter((scenario) => !deployed.has(scenario))
    .sort();
  if (missing.length > 0) {
    throw new Error(`${target}: missing scenarios: ${missing.join(', ')}`);
  }
}

function parseArguments(argv: string[]): {
  configPath: string;
  selectedProjects: string[];
} {
  let configPath = 'apps/mobile/playwright.config.ts';
  const selectedProjects: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument) continue;
    if (argument === '--config') configPath = argv[++index] ?? '';
    else if (argument.startsWith('--config=')) {
      configPath = argument.slice('--config='.length);
    } else if (argument === '--project') {
      selectedProjects.push(argv[++index] ?? '');
    } else if (argument.startsWith('--project=')) {
      selectedProjects.push(argument.slice('--project='.length));
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (
    !configPath ||
    selectedProjects.length === 0 ||
    selectedProjects.includes('')
  ) {
    throw new Error('Pass --config and at least one --project');
  }
  return { configPath, selectedProjects };
}

async function main(): Promise<void> {
  const { configPath, selectedProjects } = parseArguments(
    process.argv.slice(2),
  );
  const loaded = (await import(
    pathToFileURL(path.resolve(configPath)).href
  )) as {
    default: {
      testDir?: string;
      testIgnore?: MatchPattern;
      projects?: PlaywrightProjectSelection[];
    };
  };
  const config = loaded.default;
  if (!config.testDir || !config.projects) {
    throw new Error(
      `Playwright config is missing testDir/projects: ${configPath}`,
    );
  }

  const requiredScenarios = collectSelectedPlaywrightSeedScenarios({
    rootDir: process.cwd(),
    testDir: config.testDir,
    projects: config.projects,
    selectedProjects,
    testIgnore: config.testIgnore,
  });
  const runtime = (await import(
    pathToFileURL(path.resolve('apps/mobile/e2e-web/helpers/runtime.ts')).href
  )) as {
    apiBaseUrl: string;
    buildTestSeedHeaders(): Record<string, string>;
  };
  await assertDeployedSeedScenarioCoverage({
    requiredScenarios,
    apiBaseUrl: runtime.apiBaseUrl,
    headers: runtime.buildTestSeedHeaders(),
  });
  console.log(
    `Playwright seed catalog covers ${requiredScenarios.length} selected scenarios at ${runtime.apiBaseUrl}.`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      `Playwright seed scenario guard failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
