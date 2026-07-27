import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PRE_PUSH_SCRIPT = join(__dirname, 'pre-push-tests.sh');

describe('pre-push Jest launcher', () => {
  it('invokes Jest through Node instead of a Windows command shim', () => {
    const script = readFileSync(PRE_PUSH_SCRIPT, 'utf8');

    expect(script).toContain(
      'node "$WORKSPACE_ROOT/node_modules/jest/bin/jest.js"',
    );
    expect(script).not.toContain('pnpm exec jest --findRelatedTests');
  });
});
