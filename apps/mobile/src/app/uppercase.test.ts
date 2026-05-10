import * as fs from 'fs';
import * as path from 'path';

function getAppFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAppFiles(fullPath));
      continue;
    }
    if (
      entry.name.endsWith('.tsx') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.startsWith('_layout') &&
      !entry.name.startsWith('+')
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('user-facing Text stays sentence case in app routes', () => {
  const appDir = path.resolve(__dirname);
  const appFiles = getAppFiles(appDir);

  it.each(appFiles)(
    '%s does not use uppercase text transforms on Text',
    (file) => {
      const source = fs.readFileSync(file, 'utf8');
      if (source.includes('// uppercase-allowed:')) {
        return;
      }

      expect(source).not.toMatch(
        /<Text[\s\S]*?className=\{?["'`][^"'`]*\buppercase\b[^"'`]*["'`]\}?[\s\S]*?>/m,
      );
      expect(source).not.toMatch(
        /<Text[\s\S]*?style=\{\{[\s\S]*?textTransform:\s*['"]uppercase['"][\s\S]*?\}\}/m,
      );
    },
  );
});
