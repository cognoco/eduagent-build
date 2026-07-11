import * as fs from 'node:fs';
import * as path from 'node:path';

describe('workerd AsyncLocalStorage compatibility', () => {
  it('[WI-1850] production Inngest code never calls unsupported enterWith', () => {
    const sourceFiles = [
      ...fs
        .readdirSync(__dirname, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith('.ts') &&
            !entry.name.endsWith('.test.ts'),
        )
        .map((entry) => path.join(__dirname, entry.name)),
      path.join(__dirname, '../routes/inngest.ts'),
    ].map((filePath) => ({
      file: path.relative(path.join(__dirname, '..'), filePath),
      source: fs.readFileSync(filePath, 'utf8'),
    }));

    for (const { file, source } of sourceFiles) {
      expect({
        file,
        unsupportedCalls: source.match(/\.enterWith\s*\(/g) ?? [],
      }).toEqual({ file, unsupportedCalls: [] });
    }
  });
});
