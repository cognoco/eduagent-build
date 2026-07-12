import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const runbook = readFileSync(
  join(__dirname, '..', 'docs/runbooks/launch-health-alerts.md'),
  'utf8',
);

describe('launch-health Sentry ingestion-capacity invariant', () => {
  it('keeps alert readiness gated on capacity and end-to-end delivery', () => {
    const section = runbook.match(
      /## Sentry ingestion-capacity invariant[\s\S]*?(?=\n## |$)/,
    )?.[0];

    expect(section).toBeDefined();
    expect(section).toContain('active paid plan with remaining error quota');
    expect(section).toContain('non-zero on-demand error budget');
    expect(section).toContain('not suspended or past due');
    expect(section).toContain('accepted events rather than only');
    expect(section).toContain('`rate_limited` outcomes');
    expect(section).toContain('one safe synthetic creates an issue');
    expect(section).toContain('exercises an `[LH]` alert rule');
    expect(section).toContain('treat every Sentry rule as unavailable');
    expect(section).toContain('without copying credentials or payment details');
  });
});
