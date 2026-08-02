export const DATABASE_ROLE_CAPABILITIES_QUERY = `
  SELECT
    current_user AS role_name,
    role.rolsuper AS is_superuser,
    (
      role.rolcreatedb
      OR has_database_privilege(current_user, current_database(), 'CREATE')
    ) AS can_create_database,
    role.rolcreaterole AS can_create_role,
    role.rolreplication AS can_replicate,
    role.rolbypassrls AS bypasses_rls,
    EXISTS (
      SELECT 1
      FROM pg_namespace namespace
      WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND has_schema_privilege(current_user, namespace.oid, 'CREATE')
    ) AS can_create_schema,
    (
      EXISTS (
        SELECT 1
        FROM pg_class object
        INNER JOIN pg_namespace namespace
          ON namespace.oid = object.relnamespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND pg_has_role(current_user, object.relowner, 'MEMBER')
      )
      OR EXISTS (
        SELECT 1
        FROM pg_namespace namespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND pg_has_role(current_user, namespace.nspowner, 'MEMBER')
      )
      OR EXISTS (
        SELECT 1
        FROM pg_type object
        INNER JOIN pg_namespace namespace
          ON namespace.oid = object.typnamespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND pg_has_role(current_user, object.typowner, 'MEMBER')
      )
      OR EXISTS (
        SELECT 1
        FROM pg_proc object
        INNER JOIN pg_namespace namespace
          ON namespace.oid = object.pronamespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND pg_has_role(current_user, object.proowner, 'MEMBER')
      )
    ) AS owns_application_objects,
    EXISTS (
      SELECT 1
      FROM pg_class object
      INNER JOIN pg_namespace namespace
        ON namespace.oid = object.relnamespace
      WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND object.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND (
          has_table_privilege(current_user, object.oid, 'INSERT')
          OR has_table_privilege(current_user, object.oid, 'UPDATE')
          OR has_table_privilege(current_user, object.oid, 'DELETE')
          OR has_table_privilege(current_user, object.oid, 'TRUNCATE')
          OR has_table_privilege(current_user, object.oid, 'TRIGGER')
          OR has_table_privilege(current_user, object.oid, 'REFERENCES')
        )
    ) AS has_table_writes,
    EXISTS (
      SELECT 1
      FROM pg_class object
      INNER JOIN pg_namespace namespace
        ON namespace.oid = object.relnamespace
      WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND object.relkind = 'S'
        AND (
          has_sequence_privilege(current_user, object.oid, 'USAGE')
          OR has_sequence_privilege(current_user, object.oid, 'UPDATE')
        )
    ) AS has_sequence_writes,
    EXISTS (
      SELECT 1
      FROM pg_roles reachable
      WHERE reachable.oid <> role.oid
        AND pg_has_role(current_user, reachable.oid, 'SET')
        AND (
          reachable.rolsuper
          OR reachable.rolcreatedb
          OR reachable.rolcreaterole
          OR reachable.rolreplication
          OR reachable.rolbypassrls
          OR has_database_privilege(
            reachable.rolname,
            current_database(),
            'CREATE'
          )
          OR EXISTS (
            SELECT 1
            FROM pg_namespace namespace
            WHERE namespace.nspname NOT IN (
              'pg_catalog',
              'information_schema'
            )
              AND namespace.nspname NOT LIKE 'pg_toast%'
              AND has_schema_privilege(
                reachable.rolname,
                namespace.oid,
                'CREATE'
              )
          )
          OR EXISTS (
            SELECT 1
            FROM pg_class object
            INNER JOIN pg_namespace namespace
              ON namespace.oid = object.relnamespace
            WHERE namespace.nspname NOT IN (
              'pg_catalog',
              'information_schema'
            )
              AND namespace.nspname NOT LIKE 'pg_toast%'
              AND pg_has_role(
                reachable.rolname,
                object.relowner,
                'MEMBER'
              )
          )
          OR EXISTS (
            SELECT 1
            FROM pg_namespace namespace
            WHERE namespace.nspname NOT IN (
              'pg_catalog',
              'information_schema'
            )
              AND namespace.nspname NOT LIKE 'pg_toast%'
              AND pg_has_role(
                reachable.rolname,
                namespace.nspowner,
                'MEMBER'
              )
          )
          OR EXISTS (
            SELECT 1
            FROM pg_type object
            INNER JOIN pg_namespace namespace
              ON namespace.oid = object.typnamespace
            WHERE namespace.nspname NOT IN (
              'pg_catalog',
              'information_schema'
            )
              AND namespace.nspname NOT LIKE 'pg_toast%'
              AND pg_has_role(
                reachable.rolname,
                object.typowner,
                'MEMBER'
              )
          )
          OR EXISTS (
            SELECT 1
            FROM pg_proc object
            INNER JOIN pg_namespace namespace
              ON namespace.oid = object.pronamespace
            WHERE namespace.nspname NOT IN (
              'pg_catalog',
              'information_schema'
            )
              AND namespace.nspname NOT LIKE 'pg_toast%'
              AND pg_has_role(
                reachable.rolname,
                object.proowner,
                'MEMBER'
              )
          )
          OR EXISTS (
            SELECT 1
            FROM pg_class object
            INNER JOIN pg_namespace namespace
              ON namespace.oid = object.relnamespace
            WHERE namespace.nspname NOT IN (
              'pg_catalog',
              'information_schema'
            )
              AND namespace.nspname NOT LIKE 'pg_toast%'
              AND object.relkind IN ('r', 'p', 'v', 'm', 'f')
              AND (
                has_table_privilege(
                  reachable.rolname,
                  object.oid,
                  'INSERT'
                )
                OR has_table_privilege(
                  reachable.rolname,
                  object.oid,
                  'UPDATE'
                )
                OR has_table_privilege(
                  reachable.rolname,
                  object.oid,
                  'DELETE'
                )
                OR has_table_privilege(
                  reachable.rolname,
                  object.oid,
                  'TRUNCATE'
                )
                OR has_table_privilege(
                  reachable.rolname,
                  object.oid,
                  'TRIGGER'
                )
                OR has_table_privilege(
                  reachable.rolname,
                  object.oid,
                  'REFERENCES'
                )
              )
          )
          OR EXISTS (
            SELECT 1
            FROM pg_class object
            INNER JOIN pg_namespace namespace
              ON namespace.oid = object.relnamespace
            WHERE namespace.nspname NOT IN (
              'pg_catalog',
              'information_schema'
            )
              AND namespace.nspname NOT LIKE 'pg_toast%'
              AND object.relkind = 'S'
              AND (
                has_sequence_privilege(
                  reachable.rolname,
                  object.oid,
                  'USAGE'
                )
                OR has_sequence_privilege(
                  reachable.rolname,
                  object.oid,
                  'UPDATE'
                )
              )
          )
        )
    ) AS has_forbidden_set_role_path,
    EXISTS (
      SELECT 1
      FROM information_schema.administrable_role_authorizations
    ) AS has_role_admin_path,
    (
      SELECT count(*)
      FROM pg_class object
      INNER JOIN pg_namespace namespace
        ON namespace.oid = object.relnamespace
      WHERE namespace.nspname NOT IN (
        'pg_catalog',
        'information_schema',
        'drizzle'
      )
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND object.relkind IN ('r', 'p')
    ) AS application_table_count,
    (
      SELECT count(*)
      FROM pg_class object
      INNER JOIN pg_namespace namespace
        ON namespace.oid = object.relnamespace
      WHERE namespace.nspname NOT IN (
        'pg_catalog',
        'information_schema',
        'drizzle'
      )
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND object.relkind IN ('r', 'p')
        AND NOT has_table_privilege(current_user, object.oid, 'SELECT')
    ) AS missing_table_select_count,
    (
      SELECT count(*)
      FROM pg_class object
      INNER JOIN pg_namespace namespace
        ON namespace.oid = object.relnamespace
      WHERE namespace.nspname NOT IN (
        'pg_catalog',
        'information_schema',
        'drizzle'
      )
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND object.relkind IN ('r', 'p')
        AND NOT has_table_privilege(current_user, object.oid, 'INSERT')
    ) AS missing_table_insert_count,
    (
      SELECT count(*)
      FROM pg_class object
      INNER JOIN pg_namespace namespace
        ON namespace.oid = object.relnamespace
      WHERE namespace.nspname NOT IN (
        'pg_catalog',
        'information_schema',
        'drizzle'
      )
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND object.relkind IN ('r', 'p')
        AND NOT has_table_privilege(current_user, object.oid, 'UPDATE')
    ) AS missing_table_update_count,
    (
      SELECT count(*)
      FROM pg_class object
      INNER JOIN pg_namespace namespace
        ON namespace.oid = object.relnamespace
      WHERE namespace.nspname NOT IN (
        'pg_catalog',
        'information_schema',
        'drizzle'
      )
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND object.relkind IN ('r', 'p')
        AND NOT has_table_privilege(current_user, object.oid, 'DELETE')
    ) AS missing_table_delete_count,
    (
      SELECT count(*)
      FROM pg_class object
      INNER JOIN pg_namespace namespace
        ON namespace.oid = object.relnamespace
      WHERE namespace.nspname NOT IN (
        'pg_catalog',
        'information_schema',
        'drizzle'
      )
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND object.relkind = 'S'
    ) AS application_sequence_count,
    (
      SELECT count(*)
      FROM pg_class object
      INNER JOIN pg_namespace namespace
        ON namespace.oid = object.relnamespace
      WHERE namespace.nspname NOT IN (
        'pg_catalog',
        'information_schema',
        'drizzle'
      )
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND object.relkind = 'S'
        AND NOT has_sequence_privilege(current_user, object.oid, 'USAGE')
    ) AS missing_sequence_usage_count,
    (
      SELECT count(*)
      FROM pg_class object
      INNER JOIN pg_namespace namespace
        ON namespace.oid = object.relnamespace
      WHERE namespace.nspname NOT IN (
        'pg_catalog',
        'information_schema',
        'drizzle'
      )
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND object.relkind = 'S'
        AND NOT has_sequence_privilege(current_user, object.oid, 'UPDATE')
    ) AS missing_sequence_update_count
  FROM pg_roles role
  WHERE role.rolname = current_user
`;

export const CURRENT_DATABASE_ROLE_QUERY = 'SELECT current_user AS role_name';
