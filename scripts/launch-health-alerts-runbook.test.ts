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

describe('launch-health durable terminal-failure surface', () => {
  it('groups terminal dead letters while documenting their distinct privacy shapes', () => {
    const section = runbook.match(
      /## 5\. Deletion and retention[\s\S]*?(?=\n## |$)/,
    )?.[0];

    expect(section).toBeDefined();
    expect(section).toContain('`app/consent.revocation.failed`');
    expect(section).toContain('`app/account.deletion_teardown.failed`');
    expect(section).toContain(
      '`app/billing.subscription_store_teardown.failed`',
    );
    expect(section).toContain('`app/billing.alias_merge.failed`');
    expect(section).toContain('`app/consent.email-revocation.failed`');
    expect(section).toMatch(
      /three WI-2346 teardown payloads[\s\S]*opaque `accountId` or `eventId`[\s\S]*nullable Inngest `runId`[\s\S]*a bounded coarse[\s\S]*`errorName`[\s\S]*`timestamp`/,
    );
    expect(section).toMatch(
      /two pre-existing consent dead letters[\s\S]*raw `error` message text/,
    );
    expect(section).toMatch(
      /WI-2977 \(Privacy-minimize\s+consent-revocation dead-letter payloads\)/,
    );
  });
});
