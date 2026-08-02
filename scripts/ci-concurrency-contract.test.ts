import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

type Concurrency = {
  group?: unknown;
  'cancel-in-progress'?: unknown;
};

function readConcurrency(): Concurrency {
  const workflow = parse(
    readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8'),
  ) as { concurrency?: Concurrency };
  return workflow.concurrency ?? {};
}

function groupExpression(): string {
  return String(readConcurrency().group ?? '');
}

function cancelExpression(): string {
  return String(readConcurrency()['cancel-in-progress'] ?? '');
}

describe('CI concurrency contract', () => {
  it('keeps an idle main push attributable to its commit SHA', () => {
    expect(groupExpression()).toContain('github.sha');
  });

  it('does not replace an intermediate main commit during rapid merges', () => {
    const group = groupExpression();

    expect(group).toContain('github.sha');
    expect(cancelExpression()).toContain("github.event_name == 'pull_request'");
  });

  it('cancels stale heads while keeping one concurrency group per pull request', () => {
    const group = groupExpression();

    expect(group).toContain('github.event.pull_request.number');
    expect(cancelExpression()).toContain("github.event_name == 'pull_request'");
  });

  it('keeps a historical main rerun isolated from newer main evidence', () => {
    expect(groupExpression()).toContain('github.sha');
  });
});
