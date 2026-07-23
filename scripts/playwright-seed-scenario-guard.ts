import { readdirSync } from 'node:fs';
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

interface SelectedRoot {
  node: ts.Node;
}

interface FunctionDefinition {
  node: ts.FunctionLikeDeclaration;
  name: string | null;
}

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

function walk(node: ts.Node, visit: (candidate: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function isWithinDirectory(filePath: string, directory: string): boolean {
  const relative = path.relative(directory, filePath);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function resolvedAliasSymbol(
  checker: ts.TypeChecker,
  initial: ts.Symbol,
): ts.Symbol {
  let symbol = initial;
  const seen = new Set<ts.Symbol>();
  while ((symbol.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(symbol)) {
    seen.add(symbol);
    const aliased = checker.getAliasedSymbol(symbol);
    if (aliased === symbol) break;
    symbol = aliased;
  }
  return symbol;
}

function resolvedSymbol(
  checker: ts.TypeChecker,
  node: ts.Node,
): ts.Symbol | null {
  const symbol = checker.getSymbolAtLocation(node);
  return symbol ? resolvedAliasSymbol(checker, symbol) : null;
}

function namespaceMemberSymbol(
  checker: ts.TypeChecker,
  namespaceExpression: ts.Expression,
  memberName: string,
): ts.Symbol | null {
  const namespaceAlias = checker.getSymbolAtLocation(namespaceExpression);
  if (!namespaceAlias) return null;
  const namespace = resolvedAliasSymbol(checker, namespaceAlias);
  if ((namespace.flags & ts.SymbolFlags.Module) === 0) return null;
  const member = checker
    .getExportsOfModule(namespace)
    .find((candidate) => candidate.getName() === memberName);
  return member ? resolvedAliasSymbol(checker, member) : null;
}

function bindingElementPropertyName(node: ts.BindingElement): string | null {
  const property = node.propertyName ?? node.name;
  return ts.isIdentifier(property) || ts.isStringLiteral(property)
    ? property.text
    : null;
}

function destructuredNamespaceMemberSymbol(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
): ts.Symbol | null {
  for (const declaration of symbol.declarations ?? []) {
    if (
      !ts.isBindingElement(declaration) ||
      !ts.isObjectBindingPattern(declaration.parent) ||
      !ts.isVariableDeclaration(declaration.parent.parent) ||
      !declaration.parent.parent.initializer
    ) {
      continue;
    }
    const memberName = bindingElementPropertyName(declaration);
    if (!memberName) continue;
    const member = namespaceMemberSymbol(
      checker,
      declaration.parent.parent.initializer,
      memberName,
    );
    if (member) return member;
  }
  return null;
}

function staticReferenceSymbol(
  checker: ts.TypeChecker,
  node: ts.Node,
): ts.Symbol | null {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      namespaceMemberSymbol(checker, node.expression, node.name.text) ??
      resolvedSymbol(checker, node.name)
    );
  }
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    (ts.isStringLiteral(node.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
  ) {
    return namespaceMemberSymbol(
      checker,
      node.expression,
      node.argumentExpression.text,
    );
  }
  if (!ts.isIdentifier(node)) return null;
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol) return null;
  return (
    destructuredNamespaceMemberSymbol(checker, symbol) ??
    resolvedAliasSymbol(checker, symbol)
  );
}

function declarationRoot(node: ts.Declaration): ts.Node | null {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isExportAssignment(node)
  ) {
    return node;
  }
  return null;
}

function collectSelectedRoots(
  entries: string[],
  testDir: string,
  program: ts.Program,
  checker: ts.TypeChecker,
): SelectedRoot[] {
  const roots = new Map<string, SelectedRoot>();
  const queue: ts.Node[] = [];
  const scannedModuleSources = new Set<string>();
  const add = (node: ts.Node): void => {
    const sourceFile = node.getSourceFile();
    const key = `${sourceFile.fileName}:${node.pos}:${node.end}`;
    if (roots.has(key)) return;
    roots.set(key, { node });
    queue.push(node);
  };
  const scanModuleSource = (sourceFile: ts.SourceFile): void => {
    if (scannedModuleSources.has(sourceFile.fileName)) return;
    scannedModuleSources.add(sourceFile.fileName);
    for (const statement of sourceFile.statements) {
      const moduleSpecifier =
        ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
          ? statement.moduleSpecifier
          : null;
      if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue;
      const importedModule = checker.getSymbolAtLocation(moduleSpecifier);
      for (const declaration of importedModule?.declarations ?? []) {
        if (
          !ts.isSourceFile(declaration) ||
          !isWithinDirectory(declaration.fileName, testDir)
        ) {
          continue;
        }
        scanModuleSource(declaration);
        if (ts.isImportDeclaration(statement) && !statement.importClause) {
          add(declaration);
        }
      }
    }
  };

  for (const entry of entries) {
    const sourceFile = program.getSourceFile(entry);
    if (sourceFile) add(sourceFile);
  }

  while (queue.length > 0) {
    const root = queue.shift();
    if (!root) break;
    scanModuleSource(root.getSourceFile());
    walk(root, (node) => {
      if (
        ts.isIdentifier(node) &&
        ts.isPropertyAccessExpression(node.parent) &&
        node.parent.name === node
      ) {
        return;
      }
      const symbol = staticReferenceSymbol(checker, node);
      for (const declaration of symbol?.declarations ?? []) {
        const sourceFile = declaration.getSourceFile();
        if (!isWithinDirectory(sourceFile.fileName, testDir)) continue;
        const selected = declarationRoot(declaration);
        if (selected) add(selected);
      }
    });
  }

  return [...roots.values()];
}

function functionKey(node: ts.FunctionLikeDeclaration): string {
  const sourceFile = node.getSourceFile();
  return `${sourceFile.fileName}:${node.pos}:${node.end}`;
}

function functionName(node: ts.FunctionLikeDeclaration): string | null {
  if ('name' in node && node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  return null;
}

function unwrapParenthesizedExpression(
  expression: ts.Expression,
): ts.Expression {
  let unwrapped = expression;
  while (ts.isParenthesizedExpression(unwrapped)) {
    unwrapped = unwrapped.expression;
  }
  return unwrapped;
}

function functionDefinition(node: ts.Node): ts.FunctionLikeDeclaration | null {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  ) {
    return node;
  }
  if (
    ts.isVariableDeclaration(node) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) ||
      ts.isFunctionExpression(node.initializer))
  ) {
    return node.initializer;
  }
  if (ts.isExportAssignment(node)) {
    const expression = unwrapParenthesizedExpression(node.expression);
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
      return expression;
    }
  }
  return null;
}

function collectFunctionDefinitions(
  roots: SelectedRoot[],
): Map<string, FunctionDefinition> {
  const definitions = new Map<string, FunctionDefinition>();
  for (const root of roots) {
    walk(root.node, (node) => {
      const definition = functionDefinition(node);
      if (!definition) return;
      definitions.set(functionKey(definition), {
        node: definition,
        name: functionName(definition),
      });
    });
  }
  return definitions;
}

function calleeSymbol(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): ts.Symbol | null {
  return staticReferenceSymbol(checker, expression);
}

function calledFunctionKeys(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): string[] {
  const keys: string[] = [];
  for (const declaration of calleeSymbol(checker, expression)?.declarations ??
    []) {
    const definition = functionDefinition(declaration);
    if (definition) keys.push(functionKey(definition));
  }
  return keys;
}

function calleeName(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): string | null {
  if (ts.isIdentifier(expression)) {
    return calleeSymbol(checker, expression)?.getName() ?? expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return calleeSymbol(checker, expression)?.getName() ?? expression.name.text;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression &&
    (ts.isStringLiteral(expression.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(expression.argumentExpression))
  ) {
    return (
      calleeSymbol(checker, expression)?.getName() ??
      expression.argumentExpression.text
    );
  }
  return null;
}

function containsCallTo(
  checker: ts.TypeChecker,
  node: ts.Node,
  functionKeys: Set<string>,
): boolean {
  let found = false;
  walk(node, (candidate) => {
    if (!ts.isCallExpression(candidate)) return;
    if (calleeName(checker, candidate.expression) === 'seedScenario') {
      found = true;
      return;
    }
    if (
      calledFunctionKeys(checker, candidate.expression).some((key) =>
        functionKeys.has(key),
      )
    ) {
      found = true;
    }
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
  const entries = selectedEntryFiles(input);
  const testDir = path.resolve(input.rootDir, input.testDir);
  const program = ts.createProgram({
    rootNames: entries,
    options: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest,
    },
  });
  const checker = program.getTypeChecker();
  const roots = collectSelectedRoots(entries, testDir, program, checker);
  const definitions = collectFunctionDefinitions(roots);
  const seedFunctions = new Set(
    [...definitions]
      .filter(([, definition]) => definition.name === 'seedScenario')
      .map(([key]) => key),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, definition] of definitions) {
      if (
        !seedFunctions.has(key) &&
        containsCallTo(checker, definition.node, seedFunctions)
      ) {
        seedFunctions.add(key);
        changed = true;
      }
    }
  }

  const scenarios = new Set<string>();
  for (const root of roots) {
    walk(root.node, (node) => {
      if (
        ts.isPropertyAssignment(node) &&
        propertyName(node) === 'seedScenario'
      ) {
        const value = stringValue(node.initializer);
        if (value) scenarios.add(value);
      }
      if (!ts.isCallExpression(node)) return;
      const name = calleeName(checker, node.expression);
      if (
        name === 'seedScenario' ||
        calledFunctionKeys(checker, node.expression).some((key) =>
          seedFunctions.has(key),
        )
      ) {
        collectCallLiterals(node, scenarios);
      }
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
