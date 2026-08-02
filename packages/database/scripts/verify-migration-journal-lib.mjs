function normalizedTimestamp(value) {
  return String(value);
}

export function reconcileMigrationJournal({ migrations, appliedRows }) {
  const byHash = new Map(
    migrations.map((migration) => [migration.hash, migration]),
  );
  const appliedIndices = new Set();
  const appliedHashes = new Set();

  for (const row of appliedRows) {
    if (appliedHashes.has(row.hash)) {
      throw new Error(
        `Live Drizzle journal contains duplicate migration hash "${row.hash}"`,
      );
    }
    appliedHashes.add(row.hash);
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

function splitTopLevelSqlStatements(source) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarTag = null;
  let lineComment = false;
  let blockCommentDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
        current += '\n';
      }
      continue;
    }
    if (blockCommentDepth > 0) {
      if (character === '/' && next === '*') {
        blockCommentDepth += 1;
        index += 1;
      } else if (character === '*' && next === '/') {
        blockCommentDepth -= 1;
        index += 1;
      } else if (character === '\n') {
        current += '\n';
      }
      continue;
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length - 1;
        dollarTag = null;
      } else {
        current += character;
      }
      continue;
    }
    if (inSingleQuote) {
      current += character;
      if (character === '\\' && next) {
        current += next;
        index += 1;
      } else if (character === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (character === "'") {
        inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      current += character;
      if (character === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (character === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (character === '-' && next === '-') {
      lineComment = true;
      current += ' ';
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockCommentDepth = 1;
      current += ' ';
      index += 1;
      continue;
    }
    if (character === "'") {
      inSingleQuote = true;
      current += character;
      continue;
    }
    if (character === '"') {
      inDoubleQuote = true;
      current += character;
      continue;
    }
    if (character === '$') {
      const tag = /^\$(?:[a-z_][a-z0-9_]*)?\$/i.exec(source.slice(index));
      if (tag) {
        dollarTag = tag[0];
        current += dollarTag;
        index += dollarTag.length - 1;
        continue;
      }
    }
    if (character === ';') {
      if (current.trim()) {
        statements.push(`${current.trim()};`);
      }
      current = '';
      continue;
    }
    current += character;
  }

  if (current.trim()) {
    statements.push(current.trim());
  }
  return statements;
}

function maskSqlLiteralBodies(source) {
  let masked = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarTag = null;

  const blank = (value) => value.replace(/[^\r\n]/g, ' ');

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        masked += blank(dollarTag);
        index += dollarTag.length - 1;
        dollarTag = null;
      } else {
        masked += blank(character);
      }
      continue;
    }
    if (inSingleQuote) {
      masked += blank(character);
      if (character === '\\' && next) {
        masked += blank(next);
        index += 1;
      } else if (character === "'" && next === "'") {
        masked += ' ';
        index += 1;
      } else if (character === "'") {
        inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      masked += character;
      if (character === '"' && next === '"') {
        masked += next;
        index += 1;
      } else if (character === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (character === "'") {
      inSingleQuote = true;
      masked += ' ';
      continue;
    }
    if (character === '"') {
      inDoubleQuote = true;
      masked += character;
      continue;
    }
    if (character === '$') {
      const tag = /^\$(?:[a-z_][a-z0-9_]*)?\$/i.exec(source.slice(index));
      if (tag) {
        dollarTag = tag[0];
        masked += blank(dollarTag);
        index += dollarTag.length - 1;
        continue;
      }
    }
    masked += character;
  }

  return masked;
}

function splitTopLevelAlterActions(source) {
  const actions = [];
  let start = 0;
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (inSingleQuote) {
      if (character === "'" && next === "'") {
        index += 1;
      } else if (character === "'") {
        inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      if (character === '"' && next === '"') {
        index += 1;
      } else if (character === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (character === "'") {
      inSingleQuote = true;
    } else if (character === '"') {
      inDoubleQuote = true;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth = Math.max(0, depth - 1);
    } else if (character === ',' && depth === 0) {
      actions.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  actions.push(source.slice(start).trim());
  return actions.filter(Boolean);
}

function alterTableParts(statement) {
  const match =
    /^ALTER\s+TABLE\s+((?:(?:"[^"]+"|[a-z_][a-z0-9_$]*)\.)?(?:"[^"]+"|[a-z_][a-z0-9_$]*))\s+([\s\S]+)$/i.exec(
      normalizedStatement(statement),
    );
  if (!match) {
    return null;
  }
  return {
    tableReference: match[1],
    actions: splitTopLevelAlterActions(match[2]),
  };
}

function expandMultiActionAlterTables(source) {
  return source.replace(
    /\bALTER\s+TABLE\s+((?:(?:"[^"]+"|[a-z_][a-z0-9_$]*)\.)?(?:"[^"]+"|[a-z_][a-z0-9_$]*))\s+([\s\S]*?);/gi,
    (statement, tableReference, actionSource) => {
      const actions = splitTopLevelAlterActions(actionSource);
      return actions
        .map((action) => `ALTER TABLE ${tableReference} ${action};`)
        .join('\n');
    },
  );
}

export function extractDdlProbes(source) {
  const topLevelDdl = splitTopLevelSqlStatements(source)
    .filter((statement) => /^(?:CREATE|ALTER|DROP)\b/i.test(statement.trim()))
    .join('\n');
  const expandedLiteralSource = expandMultiActionAlterTables(topLevelDdl);
  const expandedSource = maskSqlLiteralBodies(expandedLiteralSource);
  const probes = [];
  const seen = new Set();
  let match;

  const tablePattern =
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = tablePattern.exec(expandedSource))) {
    const schema = schemaName(match[1] || match[2]);
    const name = match[3] || match[4];
    addProbe(probes, seen, {
      kind: 'relation',
      schema,
      name,
      description: `table ${schema}.${name}`,
    });
  }

  const indexPattern =
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = indexPattern.exec(expandedSource))) {
    const schema = schemaName(match[1] || match[2]);
    const name = match[3] || match[4];
    addProbe(probes, seen, {
      kind: 'relation',
      schema,
      name,
      description: `index ${schema}.${name}`,
    });
  }

  const columnPattern =
    /\bALTER\s+TABLE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?!(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b)(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = columnPattern.exec(expandedSource))) {
    const schema = schemaName(match[1] || match[2]);
    const table = match[3] || match[4];
    const name = match[5] || match[6];
    addProbe(probes, seen, {
      kind: 'column',
      schema,
      table,
      name,
      description: `column ${schema}.${table}.${name}`,
    });
  }

  const constraintPattern =
    /\bALTER\s+TABLE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+ADD\s+CONSTRAINT\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = constraintPattern.exec(expandedSource))) {
    const schema = schemaName(match[1] || match[2]);
    const table = match[3] || match[4];
    const name = match[5] || match[6];
    addProbe(probes, seen, {
      kind: 'constraint',
      schema,
      table,
      name,
      description: `constraint ${schema}.${table}.${name}`,
    });
  }

  const typePattern =
    /\bCREATE\s+TYPE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = typePattern.exec(expandedSource))) {
    const schema = schemaName(match[1] || match[2]);
    const name = match[3] || match[4];
    addProbe(probes, seen, {
      kind: 'type',
      schema,
      name,
      description: `type ${schema}.${name}`,
    });
  }

  const enumValuePattern =
    /\bALTER\s+TYPE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'((?:''|[^'])+)'/gi;
  while ((match = enumValuePattern.exec(expandedLiteralSource))) {
    const schema = schemaName(match[1] || match[2]);
    const type = match[3] || match[4];
    const value = match[5].replaceAll("''", "'");
    addProbe(probes, seen, {
      kind: 'enum-value',
      schema,
      type,
      value,
      description: `enum value ${schema}.${type}.${value}`,
    });
  }

  const policyPattern =
    /\bCREATE\s+POLICY\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+ON\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = policyPattern.exec(expandedSource))) {
    const name = match[1] || match[2];
    const schema = schemaName(match[3] || match[4]);
    const table = match[5] || match[6];
    addProbe(probes, seen, {
      kind: 'policy',
      schema,
      table,
      name,
      description: `policy ${schema}.${table}.${name}`,
    });
  }

  const nullabilityPattern =
    /\bALTER\s+TABLE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+ALTER\s+COLUMN\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+(SET|DROP)\s+NOT\s+NULL/gi;
  while ((match = nullabilityPattern.exec(expandedSource))) {
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
  while ((match = rowLevelSecurityPattern.exec(expandedSource))) {
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
  while ((match = extensionPattern.exec(expandedSource))) {
    const name = match[1] || match[2];
    addProbe(probes, seen, {
      kind: 'extension',
      name,
      description: `extension ${name}`,
    });
  }

  const dropRelationPattern =
    /\bDROP\s+(TABLE|INDEX)\s+(?:CONCURRENTLY\s+)?(IF\s+EXISTS\s+)?(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = dropRelationPattern.exec(expandedSource))) {
    const objectKind = match[1].toLowerCase();
    const schema = schemaName(match[3] || match[4]);
    const name = match[5] || match[6];
    addProbe(probes, seen, {
      kind: 'relation',
      schema,
      name,
      expectedExists: true,
      ...(match[2] ? { optionalWhenUnestablished: true } : {}),
      description: `pre-drop ${objectKind} ${schema}.${name}`,
    });
  }

  const dropTypePattern =
    /\bDROP\s+TYPE\s+(IF\s+EXISTS\s+)?(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = dropTypePattern.exec(expandedSource))) {
    const schema = schemaName(match[2] || match[3]);
    const name = match[4] || match[5];
    addProbe(probes, seen, {
      kind: 'type',
      schema,
      name,
      expectedExists: true,
      ...(match[1] ? { optionalWhenUnestablished: true } : {}),
      description: `pre-drop type ${schema}.${name}`,
    });
  }

  const dropExtensionPattern =
    /\bDROP\s+EXTENSION\s+(IF\s+EXISTS\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = dropExtensionPattern.exec(expandedSource))) {
    const name = match[2] || match[3];
    addProbe(probes, seen, {
      kind: 'extension',
      name,
      expectedExists: true,
      ...(match[1] ? { optionalWhenUnestablished: true } : {}),
      description: `pre-drop extension ${name}`,
    });
  }

  const dropColumnPattern =
    /\bALTER\s+TABLE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = dropColumnPattern.exec(expandedSource))) {
    const schema = schemaName(match[1] || match[2]);
    const table = match[3] || match[4];
    const name = match[6] || match[7];
    addProbe(probes, seen, {
      kind: 'column',
      schema,
      table,
      name,
      expectedExists: true,
      ...(match[5] ? { optionalWhenUnestablished: true } : {}),
      description: `pre-drop column ${schema}.${table}.${name}`,
    });
  }

  const dropConstraintPattern =
    /\bALTER\s+TABLE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = dropConstraintPattern.exec(expandedSource))) {
    const schema = schemaName(match[1] || match[2]);
    const table = match[3] || match[4];
    const name = match[6] || match[7];
    addProbe(probes, seen, {
      kind: 'constraint',
      schema,
      table,
      name,
      expectedExists: true,
      ...(match[5] ? { optionalWhenUnestablished: true } : {}),
      description: `pre-drop constraint ${schema}.${table}.${name}`,
    });
  }

  const dropPolicyPattern =
    /\bDROP\s+POLICY\s+(IF\s+EXISTS\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+ON\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = dropPolicyPattern.exec(expandedSource))) {
    const name = match[2] || match[3];
    const schema = schemaName(match[4] || match[5]);
    const table = match[6] || match[7];
    addProbe(probes, seen, {
      kind: 'policy',
      schema,
      table,
      name,
      expectedExists: true,
      ...(match[1] ? { optionalWhenUnestablished: true } : {}),
      description: `pre-drop policy ${schema}.${table}.${name}`,
    });
  }

  return probes;
}

function normalizedStatement(statement) {
  return statement.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
}

export function findUnsupportedDdlStatements(source) {
  const unsupported = [];
  const statements = splitTopLevelSqlStatements(source);

  for (const sourceStatement of statements) {
    const statement = normalizedStatement(sourceStatement);
    if (!/^(?:CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT)\b/i.test(statement)) {
      continue;
    }
    const probeStatement = normalizedStatement(maskSqlLiteralBodies(statement));
    const alterTable = alterTableParts(probeStatement);
    const supported = alterTable
      ? alterTable.actions.every((action) => {
          const actionStatement = `ALTER TABLE ${alterTable.tableReference} ${action}`;
          return extractDdlProbes(actionStatement).length > 0;
        })
      : extractDdlProbes(statement).length > 0;
    if (!supported) {
      unsupported.push(statement);
    }
  }

  const dynamicDdlPattern =
    /\bEXECUTE\s+(?:format\s*\(\s*)?'[^']*\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\b[^']*'/gi;
  for (const statement of statements) {
    if (!/^DO\b/i.test(statement.trim())) {
      continue;
    }
    let match;
    while ((match = dynamicDdlPattern.exec(statement))) {
      unsupported.push(normalizedStatement(match[0]));
    }
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

function effectIdentityKey(probe) {
  const {
    description: _description,
    expectedExists: _expectedExists,
    optionalWhenUnestablished: _optionalWhenUnestablished,
    ...identity
  } = probe;
  return JSON.stringify(identity);
}

function expectedAppliedEffects(appliedMigrations) {
  const state = new Set();
  for (const migration of appliedMigrations) {
    for (const probe of extractDdlProbes(migration.sql)) {
      const key = effectIdentityKey(probe);
      if (probe.expectedExists === true) {
        state.delete(key);
      } else {
        state.add(key);
      }
    }
  }
  return state;
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
  const appliedEffects = expectedAppliedEffects(appliedMigrations);

  return extractDdlProbes(pendingMigration.sql).filter((probe) => {
    if (probe.expectedExists === true) {
      return !(
        probe.optionalWhenUnestablished === true &&
        !appliedEffects.has(effectIdentityKey(probe))
      );
    }
    const repeatedAppliedEffect = appliedKeys.has(probeKey(probe));
    return !(
      repeatedAppliedEffect &&
      probeIsIdempotentlyGuarded(pendingMigration.sql, probe)
    );
  });
}
