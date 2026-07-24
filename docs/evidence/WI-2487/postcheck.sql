BEGIN TRANSACTION READ ONLY;

SELECT count(*)::integer AS surviving_nonlegacy_profiles_fks
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.confrelid = 'profiles'::regclass
  AND c.conrelid NOT IN (
    'profiles'::regclass,
    'accounts'::regclass,
    'family_links'::regclass,
    'consent_states'::regclass
  );

SELECT count(*)::integer AS support_message_orphans
FROM support_messages sm
LEFT JOIN person p ON p.id = sm.profile_id
WHERE p.id IS NULL;

SELECT count(*)::integer AS deleted_ids_still_present
FROM support_messages
WHERE id = ANY(ARRAY[
  '019f1349-8e7d-736e-bfb1-f5e7458530d1',
  '019f1349-8e7e-7176-9f5b-3929832ec9d3',
  '019f1349-8fea-7713-acf5-79abd7291606',
  '019f1349-9214-704c-ba8b-d8a392a3541d',
  '019f1349-9243-73c1-ac0d-b769666774f1'
]::uuid[]);

SELECT count(*)::integer AS intentionally_unmodified_subscription_fks
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid = 'subscriptions'::regclass;

SELECT count(*)::integer AS account_deletion_test_logins_remaining
FROM login
WHERE email IN (
    'integration-deletion@integration.test',
    'integration-deletion-other@integration.test'
  )
   OR clerk_user_id IN (
    'integration-deletion-user',
    'integration-deletion-other-user'
  );

SELECT
  current_setting('neon.project_id', true) AS project_id,
  current_setting('neon.branch_id', true) AS branch_id,
  current_setting('neon.endpoint_id', true) AS endpoint_id;

COMMIT;
