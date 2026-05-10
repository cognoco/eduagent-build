import * as fs from 'fs';
import * as path from 'path';

const COMPONENTS_DIR = path.resolve(__dirname);

const FORBIDDEN_PATTERNS = [
  {
    name: 'persona vocabulary',
    pattern: /\bpersona(?:Type|FromBirthYear)?\b/i,
  },
  {
    name: 'usePersona hook',
    pattern: /\busePersona\b/,
  },
  {
    name: 'bare isLearner flag',
    pattern: /\bisLearner\b/,
  },
  {
    name: 'bare isParent flag',
    pattern: /\bisParent\b/,
  },
] as const;

function getProductionSourceFiles(dir: string): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...getProductionSourceFiles(fullPath));
      continue;
    }

    if (
      entry.isFile() &&
      /\.[jt]sx?$/.test(entry.name) &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.spec.')
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('component persona fossil guard', () => {
  it('keeps production components free of deleted persona-era vocabulary', () => {
    const violations: string[] = [];

    for (const file of getProductionSourceFiles(COMPONENTS_DIR)) {
      const source = fs.readFileSync(file, 'utf8');
      const relativePath = path
        .relative(COMPONENTS_DIR, file)
        .replace(/\\/g, '/');

      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        const match = pattern.exec(source);
        if (match) {
          violations.push(`${relativePath}: ${name} (${match[0]})`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
