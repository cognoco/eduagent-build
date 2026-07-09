# Rollback - 0134 subscription_payers primary-payer unique index

Safe if duplicate-primary data has not accumulated after rollback. Before
applying the forward migration, verify existing rows are clean:

```sql
SELECT subscription_id
FROM subscription_payers
WHERE role = 'primary'
GROUP BY subscription_id
HAVING COUNT(*) > 1;
```

To roll back:

```sql
DROP INDEX IF EXISTS "subscription_payers_primary_subscription_unique";
```

Data loss: none. Dropping the index does not modify `subscription_payers` rows;
it only removes the database guard that rejects a second primary payer for the
same subscription.
