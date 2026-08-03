export async function probeExists(query, probe) {
  if (probe.kind === 'relation' && probe.compatibleWhenAbsent) {
    const relationKinds =
      probe.relationKind === 'table'
        ? ['r']
        : probe.relationKind === 'partitioned-table'
          ? ['p']
          : ['i'];
    if (
      probe.relationKind === 'index' &&
      probe.parentSchema &&
      probe.parentTable
    ) {
      const [{ exists }] = await query(
        `SELECT (
          NOT EXISTS (
            SELECT 1 FROM pg_class named_relation
            INNER JOIN pg_namespace named_namespace
              ON named_namespace.oid = named_relation.relnamespace
            WHERE named_namespace.nspname = $1 AND named_relation.relname = $2
          ) OR EXISTS (
            SELECT 1 FROM pg_class relation
            INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
            INNER JOIN pg_index index_row ON index_row.indexrelid = relation.oid
            INNER JOIN pg_class parent ON parent.oid = index_row.indrelid
            INNER JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
            WHERE namespace.nspname = $1 AND relation.relname = $2
              AND relation.relkind = ANY($3::"char"[])
              AND parent_namespace.nspname = $4 AND parent.relname = $5
          )
        ) AS exists`,
        [
          probe.schema,
          probe.name,
          relationKinds,
          probe.parentSchema,
          probe.parentTable,
        ],
      );
      return exists;
    }
    const [{ exists }] = await query(
      `SELECT (
        NOT EXISTS (
          SELECT 1 FROM pg_class named_relation
          INNER JOIN pg_namespace named_namespace
            ON named_namespace.oid = named_relation.relnamespace
          WHERE named_namespace.nspname = $1 AND named_relation.relname = $2
        ) OR EXISTS (
          SELECT 1 FROM pg_class relation
          INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = $1 AND relation.relname = $2
            AND relation.relkind = ANY($3::"char"[])
        )
      ) AS exists`,
      [probe.schema, probe.name, relationKinds],
    );
    return exists;
  }

  if (
    probe.kind === 'relation' &&
    probe.relationKind === 'index' &&
    probe.expectedExists === true &&
    probe.parentSchema &&
    probe.parentTable
  ) {
    const [{ exists }] = await query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_class relation
        INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        INNER JOIN pg_index index_row ON index_row.indexrelid = relation.oid
        INNER JOIN pg_class parent ON parent.oid = index_row.indrelid
        INNER JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
        WHERE namespace.nspname = $1 AND relation.relname = $2
          AND relation.relkind = ANY($3::"char"[])
          AND parent_namespace.nspname = $4 AND parent.relname = $5
      ) AS exists`,
      [probe.schema, probe.name, ['i'], probe.parentSchema, probe.parentTable],
    );
    return exists;
  }

  if (probe.kind === 'relation') {
    const [{ exists }] = await query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_class relation
        INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = $1 AND relation.relname = $2
          AND ($3::boolean = false OR relation.relkind = ANY($4::"char"[]))
      ) AS exists`,
      [
        probe.schema,
        probe.name,
        probe.expectedExists === true,
        probe.relationKind === 'table'
          ? ['r']
          : probe.relationKind === 'partitioned-table'
            ? ['p']
            : ['i'],
      ],
    );
    return exists;
  }

  if (probe.kind === 'type') {
    const qualified = `"${probe.schema}"."${probe.name}"`;
    const [{ exists }] = await query(
      'SELECT to_regtype($1) IS NOT NULL AS exists',
      [qualified],
    );
    return exists;
  }

  if (probe.kind === 'column') {
    const [{ exists }] = await query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
      ) AS exists`,
      [probe.schema, probe.table, probe.name],
    );
    return exists;
  }

  if (probe.kind === 'constraint') {
    const [{ exists }] = await query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_constraint constraint_row
        INNER JOIN pg_class relation ON relation.oid = constraint_row.conrelid
        INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = $1 AND relation.relname = $2
          AND constraint_row.conname = $3
      ) AS exists`,
      [probe.schema, probe.table, probe.name],
    );
    return exists;
  }

  if (probe.kind === 'enum-value') {
    const [{ exists }] = await query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_enum enum_value
        INNER JOIN pg_type type_row ON type_row.oid = enum_value.enumtypid
        INNER JOIN pg_namespace namespace ON namespace.oid = type_row.typnamespace
        WHERE namespace.nspname = $1 AND type_row.typname = $2
          AND enum_value.enumlabel = $3
      ) AS exists`,
      [probe.schema, probe.type, probe.value],
    );
    return exists;
  }

  if (probe.kind === 'policy') {
    const [{ exists }] = await query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = $1 AND tablename = $2 AND policyname = $3
      ) AS exists`,
      [probe.schema, probe.table, probe.name],
    );
    return exists;
  }

  if (probe.kind === 'column-nullability') {
    const [{ exists }] = await query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_attribute attribute
        INNER JOIN pg_class relation ON relation.oid = attribute.attrelid
        INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = $1 AND relation.relname = $2
          AND attribute.attname = $3 AND attribute.attnum > 0
          AND NOT attribute.attisdropped AND attribute.attnotnull = $4
      ) AS exists`,
      [probe.schema, probe.table, probe.name, probe.notNull],
    );
    return exists;
  }

  if (probe.kind === 'row-level-security') {
    const [{ exists }] = await query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_class relation
        INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = $1 AND relation.relname = $2
          AND relation.relrowsecurity = $3
      ) AS exists`,
      [probe.schema, probe.table, probe.enabled],
    );
    return exists;
  }

  if (probe.kind === 'extension') {
    const [{ exists }] = await query(
      'SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = $1) AS exists',
      [probe.name],
    );
    return exists;
  }

  throw new Error(`Unsupported DDL probe kind: ${probe.kind}`);
}

export function probeIndicatesDrift(probe, exists) {
  return exists !== (probe.expectedExists ?? false);
}
