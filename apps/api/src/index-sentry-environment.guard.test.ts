import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Sentry worker environment configuration [WI-2788]', () => {
  it('pins the SDK environment tag to the worker ENVIRONMENT binding', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8');
    const optionsBody = source.match(
      /Sentry\.withSentry\(\s*\(env\)\s*=>\s*\(\{([\s\S]*?)\}\),\s*\/\/ Hono/,
    )?.[1];

    expect(optionsBody).toBeDefined();
    expect(optionsBody).toMatch(
      /environment:\s*\(env as unknown as Bindings\)\.ENVIRONMENT/,
    );
  });
});
