import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, resolve } from 'path';

export interface Violation {
  file: string;
  line?: number;
  reason: string;
}

export interface CheckResult {
  code: string;
  title: string;
  passed: boolean;
  checkedCount: number;
  violations: Violation[];
}

export interface FlowFile {
  absPath: string;
  repoPath: string;
  contents: string;
  lines: string[];
  tags: string[];
  isSetup: boolean;
}

export interface ValidatorInputs {
  repoRoot: string;
  flows: FlowFile[];
  setupFlows: FlowFile[];
  appTestIds: Set<string>;
  appTestIdWildcards: RegExp[];
  seedScenarios: Set<string>;
  setupHelperNames: Set<string>;
  optionalAllowlist: string[];
  testIdAllowlist: Set<string>;
  launchLegacyAllowlist: Set<string>;
  registryTags: Set<string>;
}

export function findRepoRoot(start: string = process.cwd()): string {
  let cur = resolve(start);
  while (cur !== '/') {
    try {
      statSync(join(cur, 'pnpm-workspace.yaml'));
      return cur;
    } catch {
      cur = dirname(cur);
    }
  }
  throw new Error('Could not find repo root (no pnpm-workspace.yaml found)');
}

function walk(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      out.push(...walk(full, ext));
    } else if (ext.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

export function loadFlow(absPath: string, repoRoot: string): FlowFile {
  const contents = readFileSync(absPath, 'utf8');
  const lines = contents.split(/\r?\n/);
  const repoPath = relative(repoRoot, absPath).replace(/\\/g, '/');
  const isSetup = repoPath.includes('/flows/_setup/');
  return {
    absPath,
    repoPath,
    contents,
    lines,
    tags: extractTags(contents),
    isSetup,
  };
}

export function extractTags(contents: string): string[] {
  // Frontmatter ends at the first standalone `---` line (or EOF).
  const lines = contents.split(/\r?\n/);
  let frontEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && lines[i].trim() === '---') {
      frontEnd = i;
      break;
    }
  }
  const front = lines.slice(0, frontEnd);
  const tags: string[] = [];
  let inTags = false;
  for (const line of front) {
    if (/^tags:\s*$/.test(line)) {
      inTags = true;
      continue;
    }
    if (inTags) {
      const m = line.match(/^\s+-\s+([\w-]+)\s*$/);
      if (m) {
        tags.push(m[1]);
        continue;
      }
      // Inline list form: tags: [a, b]
      if (line.match(/^\S/) || line.trim() === '') {
        inTags = false;
      }
    }
    // Inline form on the same line
    const inline = line.match(/^tags:\s*\[(.+)\]\s*$/);
    if (inline) {
      for (const part of inline[1].split(',')) {
        const cleaned = part.trim().replace(/^['"]|['"]$/g, '');
        if (cleaned) tags.push(cleaned);
      }
    }
  }
  return tags;
}

export function loadAllFlows(repoRoot: string): {
  flows: FlowFile[];
  setupFlows: FlowFile[];
} {
  const flowsRoot = join(repoRoot, 'apps/mobile/e2e/flows');
  const all = walk(flowsRoot, ['.yaml', '.yml']);
  const flows: FlowFile[] = [];
  const setupFlows: FlowFile[] = [];
  for (const p of all) {
    const f = loadFlow(p, repoRoot);
    if (f.isSetup) setupFlows.push(f);
    else flows.push(f);
  }
  return { flows, setupFlows };
}

// Capture testIDs from JSX props (testID=, tabBarButtonTestID=) and from
// object literals (testID:, tabBarButtonTestID:) used by config-driven UIs.
const TESTID_PROP_RE = /(?:testID|tabBarButtonTestID)\s*[=:]\s*/g;
const STRING_LITERAL_RE = /['"`]([^'"`\n]+?)['"`]/g;

function consumeBalancedBraces(source: string, openIdx: number): string {
  // source[openIdx] must be '{'. Returns the substring between the matching braces.
  let depth = 0;
  let i = openIdx;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(openIdx + 1, i);
    }
  }
  // Unbalanced — return the rest as best-effort.
  return source.slice(openIdx + 1);
}

function collectLiteralsFromValue(
  value: string,
  exact: Set<string>,
  wildcards: RegExp[],
): void {
  STRING_LITERAL_RE.lastIndex = 0;
  let lit: RegExpExecArray | null;
  while ((lit = STRING_LITERAL_RE.exec(value)) !== null) {
    const s = lit[1];
    if (!s) continue;
    // Skip obvious non-testID strings (likely component names, types, or sentences).
    if (s.length > 100) continue;
    if (s.includes(' ') && !s.includes('${')) continue; // testIDs are kebab-case, no spaces
    if (s.includes('${')) {
      // Template literal — convert to wildcard regex.
      const pattern =
        '^' +
        s
          .replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)
          .replace(/\\\$\\\{[^}]+\\\}/g, '.+') +
        '$';
      try {
        wildcards.push(new RegExp(pattern));
      } catch {
        // skip malformed
      }
    } else {
      exact.add(s);
    }
  }
}

export function loadAppTestIds(repoRoot: string): {
  exact: Set<string>;
  wildcards: RegExp[];
} {
  const srcRoot = join(repoRoot, 'apps/mobile/src');
  const files = walk(srcRoot, ['.tsx', '.ts']).filter(
    (f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'),
  );
  const exact = new Set<string>();
  const wildcards: RegExp[] = [];
  for (const f of files) {
    let contents: string;
    try {
      contents = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    TESTID_PROP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TESTID_PROP_RE.exec(contents)) !== null) {
      const after = contents.slice(m.index + m[0].length);
      const first = after[0];
      let valueRegion = '';
      if (first === '{') {
        // JSX expression — consume balanced braces from absolute index.
        valueRegion = consumeBalancedBraces(contents, m.index + m[0].length);
      } else if (first === '"' || first === "'" || first === '`') {
        // Bare string literal — grab up to ~200 chars (single literals are short).
        valueRegion = after.slice(0, 200);
      } else {
        // Object property: testID: 'foo' or testID: cond ? 'a' : 'b',
        // scan up to the next comma at depth 0 or end of line.
        let depth = 0;
        let end = 0;
        for (let i = 0; i < after.length; i++) {
          const c = after[i];
          if (c === '(' || c === '[' || c === '{') depth++;
          else if (c === ')' || c === ']' || c === '}') {
            if (depth === 0) {
              end = i;
              break;
            }
            depth--;
          } else if ((c === ',' || c === '\n') && depth === 0) {
            end = i;
            break;
          }
        }
        valueRegion = after.slice(0, end || 200);
      }
      collectLiteralsFromValue(valueRegion, exact, wildcards);
    }
  }
  return { exact, wildcards };
}

export function loadSeedScenarios(repoRoot: string): Set<string> {
  const file = join(repoRoot, 'apps/api/src/services/test-seed.ts');
  const contents = readFileSync(file, 'utf8');
  const set = new Set<string>();
  // Match the SeedScenario type union members: | 'scenario-name'
  // First find the type declaration block.
  const typeMatch = contents.match(
    /export\s+type\s+SeedScenario\s*=\s*([\s\S]*?);/,
  );
  if (!typeMatch) return set;
  const body = typeMatch[1];
  const re = /['"]([a-z0-9-]+)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    set.add(m[1]);
  }
  return set;
}

export function loadSetupHelperNames(repoRoot: string): Set<string> {
  const dir = join(repoRoot, 'apps/mobile/e2e/flows/_setup');
  const set = new Set<string>();
  try {
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.yaml') || name.endsWith('.yml')) set.add(name);
    }
  } catch {
    // empty
  }
  return set;
}

export function loadAllowlistFile(repoRoot: string, relPath: string): string[] {
  const p = join(repoRoot, relPath);
  let contents: string;
  try {
    contents = readFileSync(p, 'utf8');
  } catch {
    return [];
  }
  return contents
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

export function loadRegistryTags(repoRoot: string): Set<string> {
  const file = join(repoRoot, 'apps/mobile/e2e/CONVENTIONS.md');
  let contents: string;
  try {
    contents = readFileSync(file, 'utf8');
  } catch {
    return new Set();
  }
  const set = new Set<string>();
  // Look for a "Tag Registry" section. Extract all backtick-wrapped tag tokens
  // appearing inside table rows or comma-separated tag lists.
  const startIdx = contents.search(/^##\s+Tag Registry/m);
  if (startIdx === -1) return set;
  const tail = contents.slice(startIdx);
  const re = /`([a-z][a-z0-9-]{1,})`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tail)) !== null) {
    set.add(m[1]);
  }
  return set;
}

export function loadInputs(repoRoot: string): ValidatorInputs {
  const { flows, setupFlows } = loadAllFlows(repoRoot);
  const { exact: appTestIds, wildcards: appTestIdWildcards } =
    loadAppTestIds(repoRoot);
  return {
    repoRoot,
    flows,
    setupFlows,
    appTestIds,
    appTestIdWildcards,
    seedScenarios: loadSeedScenarios(repoRoot),
    setupHelperNames: loadSetupHelperNames(repoRoot),
    optionalAllowlist: loadAllowlistFile(
      repoRoot,
      'apps/mobile/e2e/optional-allowlist.txt',
    ),
    testIdAllowlist: new Set(
      loadAllowlistFile(repoRoot, 'apps/mobile/e2e/testid-allowlist.txt'),
    ),
    launchLegacyAllowlist: new Set(
      loadAllowlistFile(
        repoRoot,
        'apps/mobile/e2e/launch-legacy-allowlist.txt',
      ),
    ),
    registryTags: loadRegistryTags(repoRoot),
  };
}
