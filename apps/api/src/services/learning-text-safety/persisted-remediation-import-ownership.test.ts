import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const safetyDir = __dirname;

function source(name: string): string {
  return readFileSync(resolve(safetyDir, name), 'utf8');
}

function importedModules(contents: string): Set<string> {
  return new Set(
    [...contents.matchAll(/(?:\bfrom\s*|^\s*import\s*)['"]([^'"]+)['"]/gm)].map(
      (match) => match[1]!,
    ),
  );
}

describe('persisted remediation import ownership [WI-3077]', () => {
  it('keeps shared field definitions outside the apply-to-surface dependency edge', () => {
    const memoryImports = importedModules(
      source('persisted-remediation-memory.ts'),
    );
    const profileImports = importedModules(
      source('persisted-remediation-profile.ts'),
    );

    expect(memoryImports).toContain('./persisted-remediation-fields');
    expect(memoryImports).not.toContain('./persisted-remediation-apply');
    expect(profileImports).toContain('./persisted-remediation-fields');
    expect(profileImports).not.toContain('./persisted-remediation-apply');
  });
});
