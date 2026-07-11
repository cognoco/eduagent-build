import { getTableConfig } from 'drizzle-orm/pg-core';

import { billingAlerts } from './billing.js';

describe('billing alerts schema', () => {
  it('constrains source and delivery status values at the database boundary', () => {
    const config = getTableConfig(billingAlerts);

    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'billing_alerts_email_status_check',
      'billing_alerts_push_status_check',
      'billing_alerts_source_check',
    ]);
  });

  it('indexes the exact latest-alert feed order per subscription', () => {
    const config = getTableConfig(billingAlerts);
    const index = config.indexes.find(
      (candidate) =>
        candidate.config.name === 'billing_alerts_subscription_occurred_id_idx',
    );

    expect(index).toBeDefined();
    const columns = index!.config.columns as Array<{
      name?: string;
      indexConfig?: { order?: string };
    }>;
    expect(
      columns.map((column) => ({
        name: column.name ?? null,
        order: column.indexConfig?.order ?? null,
      })),
    ).toEqual([
      { name: 'subscription_id', order: 'asc' },
      { name: 'occurred_at', order: 'desc' },
      { name: 'id', order: 'desc' },
    ]);
  });
});
