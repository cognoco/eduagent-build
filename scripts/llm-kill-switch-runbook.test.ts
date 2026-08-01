import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const runbook = readFileSync(
  join(__dirname, '..', 'docs/runbooks/llm-kill-switch.md'),
  'utf8',
);

describe('LLM volume alert source-to-sink query', () => {
  const proofSection = runbook.match(
    /Record `emittedAt`[\s\S]*?(?=\n## 6\. Rollback \/ recovery)/,
  )?.[0];

  it('uses typed numeric Sentry user-attribute selectors', () => {
    expect(proofSection).toBeDefined();
    expect(proofSection).toContain('tags[count,number]:1');
    expect(proofSection).toContain('tags[threshold,number]:1');
    expect(proofSection).not.toContain(
      'environment:"production" count:1 threshold:1',
    );
  });

  it('documents revision-stable API field projections for both numeric values', () => {
    expect(proofSection).toContain('tags[count,number]');
    expect(proofSection).toContain('tags[threshold,number]');
    expect(proofSection).toContain('typed numeric user attributes');
  });
});
