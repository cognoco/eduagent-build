import fs from 'node:fs';
import path from 'node:path';

const appRouteRoot = __dirname;

function nestedLayoutFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return nestedLayoutFiles(entryPath);
    if (entry.name !== '_layout.tsx' || entryPath === __filename) return [];
    return [entryPath];
  });
}

describe('pushed nested navigator theme audit', () => {
  it('keeps every pushed V2 nested Stack on the active semantic app background', () => {
    const missingSemanticBackground = nestedLayoutFiles(appRouteRoot)
      .filter((file) => fs.readFileSync(file, 'utf8').includes('<Stack'))
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return (
          !source.includes('useThemeColors') ||
          !/contentStyle:\s*\{\s*backgroundColor:\s*colors\.background\s*\}/.test(
            source,
          )
        );
      })
      .map((file) => path.relative(appRouteRoot, file).replaceAll('\\', '/'));

    expect(missingSemanticBackground).toEqual([]);
  });
});
