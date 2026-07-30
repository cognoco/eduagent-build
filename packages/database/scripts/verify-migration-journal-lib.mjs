function normalizedTimestamp(value) {
  return String(value);
}

export function reconcileMigrationJournal({ migrations, appliedRows }) {
  const byHash = new Map(
    migrations.map((migration) => [migration.hash, migration]),
  );
  const appliedIndices = new Set();

  for (const row of appliedRows) {
    const migration = byHash.get(row.hash);
    if (!migration) {
      throw new Error(
        `Live Drizzle journal contains unknown migration hash "${row.hash}"`,
      );
    }
    if (
      normalizedTimestamp(row.created_at) !==
      normalizedTimestamp(migration.when)
    ) {
      throw new Error(
        `Live Drizzle journal created_at mismatch for ${migration.tag}: ` +
          `expected ${migration.when}, found ${row.created_at}`,
      );
    }
    appliedIndices.add(migration.idx);
  }

  if (appliedIndices.size > 0) {
    const highestApplied = Math.max(...appliedIndices);
    for (const migration of migrations) {
      if (migration.idx > highestApplied) {
        break;
      }
      if (!appliedIndices.has(migration.idx)) {
        throw new Error(
          `Live Drizzle journal is missing applied migration ${migration.tag} ` +
            `before later applied entries`,
        );
      }
    }
  }

  return {
    applied: migrations.filter((migration) =>
      appliedIndices.has(migration.idx),
    ),
    pending: migrations.filter(
      (migration) => !appliedIndices.has(migration.idx),
    ),
  };
}

function addProbe(probes, seen, probe) {
  const key = JSON.stringify(probe);
  if (!seen.has(key)) {
    seen.add(key);
    probes.push(probe);
  }
}

function schemaName(capturedSchema) {
  return capturedSchema || 'public';
}

export function extractDdlProbes(source) {
  const probes = [];
  const seen = new Set();
  let match;

  const tablePattern =
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"\.)?"([^"]+)"/gi;
  while ((match = tablePattern.exec(source))) {
    const schema = schemaName(match[1]);
    addProbe(probes, seen, {
      kind: 'relation',
      schema,
      name: match[2],
      description: `table ${schema}.${match[2]}`,
    });
  }

  const indexPattern =
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"\.)?"([^"]+)"/gi;
  while ((match = indexPattern.exec(source))) {
    const schema = schemaName(match[1]);
    addProbe(probes, seen, {
      kind: 'relation',
      schema,
      name: match[2],
      description: `index ${schema}.${match[2]}`,
    });
  }

  const columnPattern =
    /\bALTER\s+TABLE\s+(?:"([^"]+)"\.)?"([^"]+)"\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
  while ((match = columnPattern.exec(source))) {
    const schema = schemaName(match[1]);
    addProbe(probes, seen, {
      kind: 'column',
      schema,
      table: match[2],
      name: match[3],
      description: `column ${schema}.${match[2]}.${match[3]}`,
    });
  }

  const constraintPattern =
    /\bALTER\s+TABLE\s+(?:"([^"]+)"\.)?"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"/gi;
  while ((match = constraintPattern.exec(source))) {
    const schema = schemaName(match[1]);
    addProbe(probes, seen, {
      kind: 'constraint',
      schema,
      table: match[2],
      name: match[3],
      description: `constraint ${schema}.${match[2]}.${match[3]}`,
    });
  }

  const typePattern = /\bCREATE\s+TYPE\s+(?:"([^"]+)"\.)?"([^"]+)"/gi;
  while ((match = typePattern.exec(source))) {
    const schema = schemaName(match[1]);
    addProbe(probes, seen, {
      kind: 'type',
      schema,
      name: match[2],
      description: `type ${schema}.${match[2]}`,
    });
  }

  const enumValuePattern =
    /\bALTER\s+TYPE\s+(?:"([^"]+)"\.)?"([^"]+)"\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'((?:''|[^'])+)'/gi;
  while ((match = enumValuePattern.exec(source))) {
    const schema = schemaName(match[1]);
    const value = match[3].replaceAll("''", "'");
    addProbe(probes, seen, {
      kind: 'enum-value',
      schema,
      type: match[2],
      value,
      description: `enum value ${schema}.${match[2]}.${value}`,
    });
  }

  const policyPattern =
    /\bCREATE\s+POLICY\s+"([^"]+)"\s+ON\s+(?:"([^"]+)"\.)?"([^"]+)"/gi;
  while ((match = policyPattern.exec(source))) {
    const schema = schemaName(match[2]);
    addProbe(probes, seen, {
      kind: 'policy',
      schema,
      table: match[3],
      name: match[1],
      description: `policy ${schema}.${match[3]}.${match[1]}`,
    });
  }

  const nullabilityPattern =
    /\bALTER\s+TABLE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+ALTER\s+COLUMN\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+(SET|DROP)\s+NOT\s+NULL/gi;
  while ((match = nullabilityPattern.exec(source))) {
    const schema = schemaName(match[1] || match[2]);
    const table = match[3] || match[4];
    const name = match[5] || match[6];
    const notNull = match[7].toUpperCase() === 'SET';
    addProbe(probes, seen, {
      kind: 'column-nullability',
      schema,
      table,
      name,
      notNull,
      description: `${notNull ? 'not-null' : 'nullable'} column ${schema}.${table}.${name}`,
    });
  }

  const rowLevelSecurityPattern =
    /\bALTER\s+TABLE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+(ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY/gi;
  while ((match = rowLevelSecurityPattern.exec(source))) {
    const schema = schemaName(match[1] || match[2]);
    const table = match[3] || match[4];
    const enabled = match[5].toUpperCase() === 'ENABLE';
    addProbe(probes, seen, {
      kind: 'row-level-security',
      schema,
      table,
      enabled,
      description: `row-level security ${schema}.${table} ${
        enabled ? 'enabled' : 'disabled'
      }`,
    });
  }

  const extensionPattern =
    /\bCREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = extensionPattern.exec(source))) {
    const name = match[1] || match[2];
    addProbe(probes, seen, {
      kind: 'extension',
      name,
      description: `extension ${name}`,
    });
  }

  return probes;
}

function normalizedStatement(statement) {
  return statement.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
}

function explicitlyIdempotentDrop(statement) {
  return (
    /^DROP\s+\w+\s+IF\s+EXISTS\b/i.test(statement) ||
    /^ALTER\s+TABLE\b[\s\S]*?\bDROP\s+(?:COLUMN|CONSTRAINT)\s+IF\s+EXISTS\b/i.test(
      statement,
    )
  );
}

export function findUnsupportedDdlStatements(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '');
  const unsupported = [];
  const statementPattern =
    /^\s*((?:CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT)\b[\s\S]*?);/gim;
  let match;

  while ((match = statementPattern.exec(withoutComments))) {
    const statement = normalizedStatement(match[1]);
    if (
      extractDdlProbes(statement).length === 0 &&
      !explicitlyIdempotentDrop(statement)
    ) {
      unsupported.push(statement);
    }
  }

  const dynamicDdlPattern =
    /\bEXECUTE\s+(?:format\s*\(\s*)?'[^']*\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\b[^']*'/gi;
  while ((match = dynamicDdlPattern.exec(withoutComments))) {
    unsupported.push(normalizedStatement(match[0]));
  }

  return [...new Set(unsupported)];
}

function escapedPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function probeKey(probe) {
  const { description: _description, ...identity } = probe;
  return JSON.stringify(identity);
}

function probeIsIdempotentlyGuarded(source, probe) {
  const name = escapedPattern(probe.name || '');

  if (probe.kind === 'relation') {
    return new RegExp(
      `\\bCREATE\\s+(?:UNIQUE\\s+)?(?:TABLE|INDEX)\\s+IF\\s+NOT\\s+EXISTS\\s+(?:[^;]*\\.)?["']?${name}["']?\\b`,
      'i',
    ).test(source);
  }

  if (probe.kind === 'column') {
    return new RegExp(
      `\\bADD\\s+(?:COLUMN\\s+)?IF\\s+NOT\\s+EXISTS\\s+["']?${name}["']?\\b`,
      'i',
    ).test(source);
  }

  if (probe.kind === 'enum-value') {
    return new RegExp(
      `\\bADD\\s+VALUE\\s+IF\\s+NOT\\s+EXISTS\\s+'${escapedPattern(
        probe.value,
      )}'`,
      'i',
    ).test(source);
  }

  if (probe.kind === 'extension') {
    return new RegExp(
      `\\bCREATE\\s+EXTENSION\\s+IF\\s+NOT\\s+EXISTS\\s+["']?${name}["']?\\b`,
      'i',
    ).test(source);
  }

  if (probe.kind === 'constraint' || probe.kind === 'policy') {
    return new RegExp(
      `\\bIF\\s+NOT\\s+EXISTS\\b[\\s\\S]{0,1600}\\b(?:conname|policyname)\\s*=\\s*'${name}'[\\s\\S]{0,1600}\\b(?:ADD\\s+CONSTRAINT|CREATE\\s+POLICY)\\s+["']?${name}["']?`,
      'i',
    ).test(source);
  }

  return (
    probe.kind === 'column-nullability' || probe.kind === 'row-level-security'
  );
}

export function pendingMigrationDdlProbes({
  appliedMigrations,
  pendingMigration,
}) {
  const appliedKeys = new Set(
    appliedMigrations.flatMap((migration) =>
      extractDdlProbes(migration.sql).map(probeKey),
    ),
  );

  return extractDdlProbes(pendingMigration.sql).filter((probe) => {
    const repeatedAppliedEffect = appliedKeys.has(probeKey(probe));
    return !(
      repeatedAppliedEffect &&
      probeIsIdempotentlyGuarded(pendingMigration.sql, probe)
    );
  });
}
