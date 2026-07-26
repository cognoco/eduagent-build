BEGIN TRANSACTION READ ONLY;

SELECT
  current_database() AS database_name,
  current_setting('neon.project_id', true) AS project_id,
  current_setting('neon.branch_id', true) AS branch_id,
  current_setting('neon.endpoint_id', true) AS endpoint_id,
  current_setting('transaction_read_only') AS transaction_read_only;

WITH targets(legacy_target, target_oid) AS (
  VALUES
    ('accounts', 'accounts'::regclass),
    ('profiles', 'profiles'::regclass),
    ('subscriptions', 'subscriptions'::regclass)
)
SELECT
  targets.legacy_target,
  count(c.oid)::integer AS fk_count
FROM targets
LEFT JOIN pg_constraint c
  ON c.contype = 'f'
 AND c.confrelid = targets.target_oid
 AND c.conrelid NOT IN (
   'profiles'::regclass,
   'accounts'::regclass,
   'family_links'::regclass,
   'consent_states'::regclass
 )
GROUP BY targets.legacy_target
ORDER BY targets.legacy_target;

SELECT
  c.conrelid::regclass::text AS child_table,
  c.conname AS constraint_name,
  c.confrelid::regclass::text AS legacy_target,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.confrelid IN (
    'profiles'::regclass,
    'subscriptions'::regclass,
    'accounts'::regclass
  )
  AND c.conrelid NOT IN (
    'profiles'::regclass,
    'accounts'::regclass,
    'family_links'::regclass,
    'consent_states'::regclass
  )
ORDER BY legacy_target, child_table, constraint_name;

SELECT sm.id
FROM support_messages sm
LEFT JOIN person p ON p.id = sm.profile_id
WHERE p.id IS NULL
ORDER BY sm.id;

COMMIT;
