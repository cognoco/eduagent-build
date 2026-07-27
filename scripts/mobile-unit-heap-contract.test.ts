import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const packageJson = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };

describe('[WI-2845] canonical mobile unit heap contract', () => {
  it('runs the complete serialized mobile suite through Node with the supported heap limit', () => {
    expect(packageJson.scripts['test:mobile:unit']).toBe(
      'node --max-old-space-size=6144 ./node_modules/jest/bin/jest.js --config apps/mobile/jest.config.cjs --runInBand --forceExit',
    );
  });
});
