import * as fs from 'node:fs';
import * as path from 'node:path';

describe('workerd AsyncLocalStorage compatibility', () => {
  it('[WI-1850] production Inngest code never calls unsupported enterWith', () => {
    const sourceFiles = ['helpers.ts', 'client.ts'].map((file) => ({
      file,
      source: fs.readFileSync(path.join(__dirname, file), 'utf8'),
    }));

    for (const { file, source } of sourceFiles) {
      expect({
        file,
        unsupportedCalls: source.match(/\.enterWith\s*\(/g) ?? [],
      }).toEqual({ file, unsupportedCalls: [] });
    }
  });
});
