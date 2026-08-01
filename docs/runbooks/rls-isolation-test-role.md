# RLS isolation integration-test role

`profile-isolation.integration.test.ts` switches to the fixed
`rls_isolation_test` role so PostgreSQL evaluates the `concepts` and
`concept_mastery` policies as a non-owner. The tests never create roles, grant
membership, or otherwise mutate the external role catalog.

## Disposable local PostgreSQL

After migrations, explicitly provision and verify the role:

```bash
DATABASE_URL=postgresql://... pnpm db:setup:rls-test-role:local
```

The command refuses `--apply-local` unless the URL host is `localhost`,
`127.0.0.1`, or `::1`. Re-running it is safe. Check without mutation with:

```bash
DATABASE_URL=postgresql://... pnpm db:check:rls-test-role
```

## Shared dev integration Neon — operator action only

Do not run this against staging or production. Connect specifically to the
shared **dev integration** database as its integration harness role. First
record the exact target and verify that the role is absent or already safe:

```sql
SELECT current_database(), current_user;

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolreplication, rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname IN (current_user, 'rls_isolation_test')
ORDER BY rolname;

SELECT granted.rolname AS granted_role,
       member.rolname AS member_role,
       membership.admin_option,
       membership.inherit_option,
       membership.set_option
FROM pg_catalog.pg_auth_members membership
JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
JOIN pg_catalog.pg_roles member ON member.oid = membership.member
WHERE member.rolname = current_user
ORDER BY granted.rolname;
```

The required mutation is intentionally narrow and repeatable. `\gexec` makes
the membership target the exact `current_user` recorded above:

```sql
BEGIN;

DO $setup$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'rls_isolation_test'
  ) THEN
    CREATE ROLE rls_isolation_test
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$setup$;

GRANT USAGE ON SCHEMA public TO rls_isolation_test;
GRANT SELECT, INSERT ON TABLE public.concepts, public.concept_mastery
  TO rls_isolation_test;
SELECT format(
  'GRANT rls_isolation_test TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE',
  current_user
) \gexec

COMMIT;
```

Verify the exact capability and the non-owner context:

```sql
SELECT current_user AS harness_role,
       pg_has_role(current_user, 'rls_isolation_test', 'SET') AS can_set,
       has_schema_privilege('rls_isolation_test', 'public', 'USAGE') AS schema_usage,
       has_table_privilege('rls_isolation_test', 'public.concepts', 'SELECT,INSERT')
         AS concepts_access,
       has_table_privilege('rls_isolation_test', 'public.concept_mastery', 'SELECT,INSERT')
         AS mastery_access;

BEGIN;
SET LOCAL ROLE rls_isolation_test;
SELECT current_user, session_user,
       current_user <> session_user AS non_owner_context;
ROLLBACK;
```

Expected booleans are all `true`; after `SET LOCAL ROLE`, `current_user` is
`rls_isolation_test` while `session_user` remains the recorded harness role.

Rollback, using the same dev integration harness connection:

```sql
BEGIN;
SELECT format('REVOKE rls_isolation_test FROM %I', current_user) \gexec
REVOKE SELECT, INSERT ON TABLE public.concepts, public.concept_mastery
  FROM rls_isolation_test;
REVOKE USAGE ON SCHEMA public FROM rls_isolation_test;
DROP ROLE rls_isolation_test;
COMMIT;
```

`DROP ROLE` deliberately refuses if unexpected dependencies remain; investigate
them instead of broadening the rollback.
