function normalizedTimestamp(value) {
  return String(value);
}

export function reconcileMigrationJournal({ migrations, appliedRows }) {
  const byHash = new Map();
  for (const migration of migrations) {
    const existing = byHash.get(migration.hash);
    if (existing) {
      throw new Error(
        `Committed migrations ${existing.tag} and ${migration.tag} share ` +
          `duplicate hash "${migration.hash}"`,
      );
    }
    byHash.set(migration.hash, migration);
  }
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

function truncateIdentifier(value, maxBytes = 63) {
  if (!value || Buffer.byteLength(value, 'utf8') <= maxBytes) {
    return value;
  }
  const bytes = Buffer.from(value, 'utf8');
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) {
    end -= 1;
  }
  return bytes.subarray(0, end).toString('utf8');
}

function identifier(quoted, unquoted) {
  return truncateIdentifier(quoted ?? unquoted?.toLowerCase());
}

function identifierWithSuffix(value, suffix) {
  return `${truncateIdentifier(value, 63 - Buffer.byteLength(suffix, 'utf8'))}${suffix}`;
}

function arrayTypeName(value) {
  return truncateIdentifier(`_${value}`);
}

function schemaName(quoted, unquoted) {
  return identifier(quoted, unquoted) || 'public';
}

function quoteUsesBackslashEscapes(source, quoteIndex) {
  const prefix = source[quoteIndex - 1];
  const beforePrefix = source[quoteIndex - 2];
  return (
    (prefix === 'E' || prefix === 'e') &&
    (!beforePrefix || !/[a-z0-9_$]/i.test(beforePrefix))
  );
}

function splitTopLevelSqlStatements(source) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let singleQuoteUsesBackslashEscapes = false;
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
      if (singleQuoteUsesBackslashEscapes && character === '\\' && next) {
        current += next;
        index += 1;
      } else if (character === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (character === "'") {
        inSingleQuote = false;
        singleQuoteUsesBackslashEscapes = false;
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
      singleQuoteUsesBackslashEscapes = quoteUsesBackslashEscapes(
        source,
        index,
      );
      current += character;
      continue;
    }
    if (character === '"') {
      inDoubleQuote = true;
      current += character;
      continue;
    }
    if (
      character === '$' &&
      (index === 0 || !/[a-z0-9_$]/i.test(source[index - 1]))
    ) {
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
  let singleQuoteUsesBackslashEscapes = false;
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
      if (singleQuoteUsesBackslashEscapes && character === '\\' && next) {
        masked += blank(next);
        index += 1;
      } else if (character === "'" && next === "'") {
        masked += ' ';
        index += 1;
      } else if (character === "'") {
        inSingleQuote = false;
        singleQuoteUsesBackslashEscapes = false;
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
      singleQuoteUsesBackslashEscapes = quoteUsesBackslashEscapes(
        source,
        index,
      );
      masked += ' ';
      continue;
    }
    if (character === '"') {
      inDoubleQuote = true;
      masked += character;
      continue;
    }
    if (
      character === '$' &&
      (index === 0 || !/[a-z0-9_$]/i.test(source[index - 1]))
    ) {
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
  let singleQuoteUsesBackslashEscapes = false;
  let inDoubleQuote = false;
  let dollarTag = null;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (inSingleQuote) {
      if (singleQuoteUsesBackslashEscapes && character === '\\' && next) {
        index += 1;
      } else if (character === "'" && next === "'") {
        index += 1;
      } else if (character === "'") {
        inSingleQuote = false;
        singleQuoteUsesBackslashEscapes = false;
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
      singleQuoteUsesBackslashEscapes = quoteUsesBackslashEscapes(
        source,
        index,
      );
    } else if (character === '"') {
      inDoubleQuote = true;
    } else if (
      character === '$' &&
      (index === 0 || !/[a-z0-9_$]/i.test(source[index - 1]))
    ) {
      const tag = /^\$(?:[a-z_][a-z0-9_]*)?\$/i.exec(source.slice(index));
      if (tag) {
        dollarTag = tag[0];
        index += dollarTag.length - 1;
      }
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

function maskParenthesizedBodies(source) {
  let depth = 0;
  let masked = '';
  for (const character of source) {
    if (character === '(') {
      depth += 1;
      masked += ' ';
    } else if (character === ')') {
      depth = Math.max(0, depth - 1);
      masked += ' ';
    } else {
      masked += depth > 0 ? (character === '\n' ? '\n' : ' ') : character;
    }
  }
  return masked;
}

function createTableBody(source) {
  const statement = normalizedStatement(maskSqlLiteralBodies(source));
  const match =
    /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|[a-z_][a-z0-9_$]*)\.)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s*\(([\s\S]*)\)$/i.exec(
      statement,
    );
  if (!match) {
    return null;
  }
  return match[1];
}

function createTablePrimaryKeyIndexNames(source, tableName) {
  const body = createTableBody(source);
  if (!body) {
    return [];
  }
  const names = [];
  for (const definition of splitTopLevelAlterActions(body)) {
    const structural = maskParenthesizedBodies(definition);
    if (!/\bPRIMARY\s+KEY\b/i.test(structural)) {
      continue;
    }
    const named =
      /\bCONSTRAINT\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+PRIMARY\s+KEY\b/i.exec(
        structural,
      );
    names.push(
      named
        ? identifier(named[1], named[2])
        : identifierWithSuffix(tableName, '_pkey'),
    );
  }
  return [...new Set(names)];
}

function createTableNamedConstraintIndexNames(source) {
  const body = createTableBody(source);
  if (!body) {
    return [];
  }
  const names = [];
  for (const definition of splitTopLevelAlterActions(body)) {
    const structural = maskParenthesizedBodies(definition);
    const named =
      /\bCONSTRAINT\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+(?:PRIMARY\s+KEY|UNIQUE|EXCLUDE)\b/i.exec(
        structural,
      );
    if (named) {
      names.push(identifier(named[1], named[2]));
    }
  }
  return [...new Set(names)];
}

function createTableColumnNames(source) {
  const body = createTableBody(source);
  if (!body) {
    return [];
  }
  const names = [];
  for (const definition of splitTopLevelAlterActions(body)) {
    const column = /^(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+[\s\S]+$/i.exec(
      definition,
    );
    if (
      column &&
      !/^(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|LIKE)$/i.test(
        column[1] ?? column[2],
      )
    ) {
      names.push(identifier(column[1], column[2]));
    }
  }
  return [...new Set(names)];
}

function createTableHasUnnamedConstraintIndexes(source) {
  const body = createTableBody(source);
  return Boolean(
    body &&
    splitTopLevelAlterActions(body).some((definition) => {
      const structural = maskParenthesizedBodies(definition);
      return (
        /\b(?:UNIQUE|EXCLUDE)\b/i.test(structural) &&
        !/\bCONSTRAINT\s+(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+(?:UNIQUE|EXCLUDE)\b/i.test(
          structural,
        )
      );
    }),
  );
}

function createTableInlineNotNullColumns(source) {
  const body = createTableBody(source);
  if (!body) {
    return [];
  }
  const names = [];
  for (const definition of splitTopLevelAlterActions(body)) {
    const tablePrimaryKey =
      /^(?:CONSTRAINT\s+(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+)?PRIMARY\s+KEY\s*\(([\s\S]*)\)$/i.exec(
        definition,
      );
    if (tablePrimaryKey) {
      for (const target of splitTopLevelAlterActions(tablePrimaryKey[1])) {
        const primaryColumn = /^(?:"([^"]+)"|([a-z_][a-z0-9_$]*))$/i.exec(
          target.trim(),
        );
        if (primaryColumn) {
          names.push(identifier(primaryColumn[1], primaryColumn[2]));
        }
      }
      continue;
    }

    const column = /^(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+([\s\S]+)$/i.exec(
      definition,
    );
    if (
      !column ||
      /^(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|LIKE)$/i.test(
        column[1] ?? column[2],
      ) ||
      !/\b(?:NOT\s+NULL|PRIMARY\s+KEY|smallserial|serial|bigserial|GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY)\b/i.test(
        maskParenthesizedBodies(column[3]),
      )
    ) {
      continue;
    }
    names.push(identifier(column[1], column[2]));
  }
  return [...new Set(names)];
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

function tableIdentityFromReference(reference) {
  const match =
    /^(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))$/i.exec(
      reference,
    );
  return match
    ? {
        schema: schemaName(match[1], match[2]),
        name: identifier(match[3], match[4]),
      }
    : null;
}

function recordAppliedUnmodeledConstraintIndexes(state, source) {
  for (const statement of splitTopLevelSqlStatements(source)) {
    const alterTable = alterTableParts(
      normalizedStatement(maskSqlLiteralBodies(statement)),
    );
    if (
      !alterTable ||
      !alterTable.actions.some((action) =>
        /^ADD\s+(?:UNIQUE|EXCLUDE|PRIMARY\s+KEY)\b/i.test(action),
      )
    ) {
      continue;
    }
    const table = tableIdentityFromReference(alterTable.tableReference);
    if (!table) {
      continue;
    }
    const key = effectIdentityKey({ kind: 'relation', ...table });
    const entry = state.get(key);
    if (entry) {
      state.set(key, {
        ...entry,
        probe: { ...entry.probe, hasUnmodeledConstraintIndexes: true },
      });
    }
  }
}

function expandMultiActionAlterTables(source) {
  return splitTopLevelSqlStatements(source)
    .flatMap((statement) => {
      const alterTable = alterTableParts(statement);
      if (!alterTable) {
        return [statement];
      }
      return alterTable.actions.map(
        (action) => `ALTER TABLE ${alterTable.tableReference} ${action};`,
      );
    })
    .join('\n');
}

function expandMultiTargetDrops(source) {
  return splitTopLevelSqlStatements(source)
    .flatMap((statement) => {
      const match =
        /^DROP\s+(TABLE|INDEX|TYPE|EXTENSION)\s+(IF\s+EXISTS\s+)?([\s\S]+)$/i.exec(
          normalizedStatement(statement),
        );
      if (!match) {
        return [statement];
      }
      const targetSource = match[3].replace(/\s+RESTRICT\s*$/i, '');
      const targets = splitTopLevelAlterActions(targetSource);
      if (targets.length < 2) {
        return [statement];
      }
      const ifExists = match[2] || '';
      return targets.map((target) => `DROP ${match[1]} ${ifExists}${target};`);
    })
    .join('\n');
}

function extractDdlProbesFromStatement(source) {
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
    const schema = schemaName(match[1], match[2]);
    const name = identifier(match[3], match[4]);
    const partitionParent =
      /\bPARTITION\s+OF\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/i.exec(
        expandedSource,
      );
    addProbe(probes, seen, {
      kind: 'relation',
      relationKind: /\bPARTITION\s+BY\b/i.test(expandedSource)
        ? 'partitioned-table'
        : 'table',
      schema,
      name,
      ...(partitionParent
        ? {
            parentSchema: schemaName(partitionParent[1], partitionParent[2]),
            parentTable: identifier(partitionParent[3], partitionParent[4]),
          }
        : {}),
      ...(createTableHasUnnamedConstraintIndexes(source)
        ? { hasUnmodeledConstraintIndexes: true }
        : {}),
      description: `table ${schema}.${name}`,
    });
    addProbe(probes, seen, {
      kind: 'type',
      schema,
      name,
      description: `table row type ${schema}.${name}`,
    });
    const arrayName = arrayTypeName(name);
    addProbe(probes, seen, {
      kind: 'type',
      schema,
      name: arrayName,
      description: `table array type ${schema}.${arrayName}`,
    });
    for (const primaryKeyName of createTablePrimaryKeyIndexNames(
      source,
      name,
    )) {
      addProbe(probes, seen, {
        kind: 'relation',
        relationKind: 'index',
        schema,
        name: primaryKeyName,
        description: `implicit primary-key index ${schema}.${primaryKeyName}`,
      });
    }
    const primaryKeyNames = new Set(
      createTablePrimaryKeyIndexNames(source, name),
    );
    for (const constraintIndexName of createTableNamedConstraintIndexNames(
      source,
    )) {
      if (primaryKeyNames.has(constraintIndexName)) {
        continue;
      }
      addProbe(probes, seen, {
        kind: 'relation',
        relationKind: 'index',
        schema,
        name: constraintIndexName,
        description: `implicit constraint index ${schema}.${constraintIndexName}`,
      });
    }
  }

  const indexPattern =
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|(?!ON\b)([a-z_][a-z0-9_$]*))/gi;
  while ((match = indexPattern.exec(expandedSource))) {
    const targetMatch =
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b[\s\S]*?\bON\s+(?:ONLY\s+)?(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/i.exec(
        expandedSource,
      );
    const schema =
      identifier(match[1], match[2]) ||
      schemaName(targetMatch?.[1], targetMatch?.[2]);
    const name = identifier(match[3], match[4]);
    addProbe(probes, seen, {
      kind: 'relation',
      relationKind: 'index',
      schema,
      name,
      description: `index ${schema}.${name}`,
    });
  }

  const columnPattern =
    /\bALTER\s+TABLE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?!(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b)(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = columnPattern.exec(expandedSource))) {
    const schema = schemaName(match[1], match[2]);
    const table = identifier(match[3], match[4]);
    const name = identifier(match[5], match[6]);
    addProbe(probes, seen, {
      kind: 'column',
      schema,
      table,
      name,
      description: `column ${schema}.${table}.${name}`,
    });
  }

  const constraintPattern =
    /\bALTER\s+TABLE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+ADD\s+CONSTRAINT\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+(PRIMARY\s+KEY|UNIQUE|EXCLUDE)?/gi;
  while ((match = constraintPattern.exec(expandedSource))) {
    const schema = schemaName(match[1], match[2]);
    const table = identifier(match[3], match[4]);
    const name = identifier(match[5], match[6]);
    addProbe(probes, seen, {
      kind: 'constraint',
      schema,
      table,
      name,
      description: `constraint ${schema}.${table}.${name}`,
    });
    if (match[7]) {
      addProbe(probes, seen, {
        kind: 'relation',
        relationKind: 'index',
        schema,
        name,
        parentSchema: schema,
        parentTable: table,
        description: `implicit constraint index ${schema}.${name}`,
      });
    }
  }

  const typePattern =
    /\bCREATE\s+TYPE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;
  while ((match = typePattern.exec(expandedSource))) {
    const schema = schemaName(match[1], match[2]);
    const name = identifier(match[3], match[4]);
    addProbe(probes, seen, {
      kind: 'type',
      schema,
      name,
      description: `type ${schema}.${name}`,
    });
    const arrayName = arrayTypeName(name);
    addProbe(probes, seen, {
      kind: 'type',
      schema,
      name: arrayName,
      description: `array type ${schema}.${arrayName}`,
    });
  }

  const enumValuePattern =
    /\bALTER\s+TYPE\s+(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'((?:''|[^'])+)'/gi;
  while ((match = enumValuePattern.exec(expandedLiteralSource))) {
    const schema = schemaName(match[1], match[2]);
    const type = identifier(match[3], match[4]);
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
    const name = identifier(match[1], match[2]);
    const schema = schemaName(match[3], match[4]);
    const table = identifier(match[5], match[6]);
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
    const schema = schemaName(match[1], match[2]);
    const table = identifier(match[3], match[4]);
    const name = identifier(match[5], match[6]);
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
    const schema = schemaName(match[1], match[2]);
    const table = identifier(match[3], match[4]);
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
    const name = identifier(match[1], match[2]);
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
    const schema = schemaName(match[3], match[4]);
    const name = identifier(match[5], match[6]);
    addProbe(probes, seen, {
      kind: 'relation',
      relationKind: objectKind,
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
    const schema = schemaName(match[2], match[3]);
    const name = identifier(match[4], match[5]);
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
    const name = identifier(match[2], match[3]);
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
    const schema = schemaName(match[1], match[2]);
    const table = identifier(match[3], match[4]);
    const name = identifier(match[6], match[7]);
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
    const schema = schemaName(match[1], match[2]);
    const table = identifier(match[3], match[4]);
    const name = identifier(match[6], match[7]);
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
    const name = identifier(match[2], match[3]);
    const schema = schemaName(match[4], match[5]);
    const table = identifier(match[6], match[7]);
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

function extractDdlProbeOperations(source) {
  const topLevelDdl = splitTopLevelSqlStatements(source)
    .filter((statement) => /^(?:CREATE|ALTER|DROP)\b/i.test(statement.trim()))
    .join('\n');
  const expandedSource = expandMultiTargetDrops(
    expandMultiActionAlterTables(topLevelDdl),
  );

  return splitTopLevelSqlStatements(expandedSource).flatMap((statement) =>
    extractDdlProbesFromStatement(statement).map((probe) => ({
      probe,
      source: statement,
    })),
  );
}

export function extractDdlProbes(source) {
  return extractDdlProbeOperations(source).map(({ probe }) => probe);
}

function normalizedStatement(statement) {
  return statement.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
}

function hasUnmodeledDependencyEffect(statement) {
  const alterTable = alterTableParts(statement);
  if (alterTable) {
    return alterTable.actions.some(
      (action) =>
        /^DROP\s+COLUMN\b/i.test(action) ||
        /^DROP\s+CONSTRAINT\b[\s\S]*\bCASCADE\b/i.test(action) ||
        /^ADD\s+(?:UNIQUE|EXCLUDE|PRIMARY\s+KEY)\b/i.test(action) ||
        /^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?!(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b)[\s\S]*\b(?:PRIMARY\s+KEY|UNIQUE)\b/i.test(
          action,
        ) ||
        /^ADD\s+CONSTRAINT\b[\s\S]*\b(?:PRIMARY\s+KEY|UNIQUE|EXCLUDE)\b/i.test(
          action,
        ) ||
        /\b(?:smallserial|serial|bigserial)\b/i.test(action) ||
        /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(action),
    );
  }
  return (
    /^DROP\s+(?:TABLE|INDEX|TYPE|EXTENSION)\b[\s\S]*\bCASCADE\b/i.test(
      statement,
    ) ||
    /^CREATE\s+TABLE\b[\s\S]*\b(?:UNIQUE|EXCLUDE)\b/i.test(statement) ||
    /^CREATE\s+TABLE\b[\s\S]*\bCONSTRAINT\b[\s\S]*\bPRIMARY\s+KEY\b/i.test(
      statement,
    ) ||
    /\b(?:smallserial|serial|bigserial)\b/i.test(statement) ||
    /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(
      statement,
    ) ||
    /\bPARTITION\s+OF\b/i.test(statement) ||
    /\bINHERITS\s*\(/i.test(statement) ||
    /\bLIKE\b[\s\S]*\bINCLUDING\s+(?:ALL|INDEXES|CONSTRAINTS|IDENTITY)\b/i.test(
      statement,
    ) ||
    /^CREATE\s+TYPE\b[\s\S]*\bAS\s+RANGE\b/i.test(statement) ||
    /^CREATE\s+TYPE\s+(?:(?:"[^"]+"|[a-z_][a-z0-9_$]*)\.)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s*$/i.test(
      statement,
    ) ||
    /^(?:CREATE|DROP)\s+EXTENSION\b/i.test(statement)
  );
}

function hasUnsupportedIdentifierSyntax(statement) {
  const masked = maskSqlLiteralBodies(statement);
  const outsideQuotedIdentifiers = masked.replace(/"[^"]*"/g, '');
  const quotedIdentifiers = [...masked.matchAll(/"([^"]*)"/g)].map(
    (match) => match[1],
  );
  return (
    /\bU&"/i.test(masked) ||
    /"[^"]*""/.test(masked) ||
    quotedIdentifiers.some(
      (name) =>
        !/^[a-z_][a-z0-9_$]*$/i.test(name) ||
        /^(?:unique|exclude|smallserial|serial|bigserial)$/i.test(name),
    ) ||
    /\s\.\s*|\.\s+/.test(masked) ||
    /\b[a-z_][a-z0-9_]*\$[a-z0-9_$]*/i.test(masked) ||
    [...outsideQuotedIdentifiers].some(
      (character) => character.codePointAt(0) > 0x7f,
    )
  );
}

function recordDroppedConstraintRelations(source, droppedConstraintRelations) {
  for (const { probe } of extractDdlProbeOperations(source)) {
    if (
      probe.kind === 'constraint' &&
      probe.expectedExists === true &&
      /^pre-drop constraint\b/.test(probe.description)
    ) {
      droppedConstraintRelations.add(`${probe.schema}\0${probe.name}`);
    }
  }
}

export function findUnsupportedDdlStatements(
  source,
  { appliedMigrations = [], priorPendingMigrations = [] } = {},
) {
  const unsupported = [];
  const statements = splitTopLevelSqlStatements(source);
  const droppedConstraintRelations = new Set();
  const classificationState = expectedMigrationState([
    ...appliedMigrations,
    ...priorPendingMigrations,
  ]);
  for (const migration of priorPendingMigrations) {
    recordDroppedConstraintRelations(migration.sql, droppedConstraintRelations);
  }

  for (const sourceStatement of statements) {
    const statement = normalizedStatement(sourceStatement);
    if (/^SET\s+(?:LOCAL\s+)?search_path\b/i.test(statement)) {
      unsupported.push(statement);
      continue;
    }
    if (!/^(?:CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT)\b/i.test(statement)) {
      continue;
    }
    const probeStatement = normalizedStatement(maskSqlLiteralBodies(statement));
    const alterTable = alterTableParts(probeStatement);
    const statementProbes = extractDdlProbes(statement);
    const establishedIdempotentExtension =
      /^CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\b/i.test(probeStatement) &&
      statementProbes.length > 0 &&
      statementProbes.every(
        (probe) =>
          probe.kind === 'extension' &&
          classificationState.get(effectIdentityKey(probe))?.state ===
            'present',
      );
    const supported =
      !hasUnsupportedIdentifierSyntax(statement) &&
      (!hasUnmodeledDependencyEffect(probeStatement) ||
        establishedIdempotentExtension) &&
      (alterTable
        ? alterTable.actions.every((action) => {
            const actionStatement = `ALTER TABLE ${alterTable.tableReference} ${action}`;
            return extractDdlProbes(actionStatement).length > 0;
          })
        : statementProbes.length > 0);
    if (!supported) {
      unsupported.push(statement);
    }

    if (supported) {
      for (const {
        probe,
        source: operationSource,
      } of extractDdlProbeOperations(statement)) {
        applyProbeEffect(classificationState, probe, operationSource);
      }
    }

    for (const { probe } of extractDdlProbeOperations(statement)) {
      if (
        probe.kind === 'constraint' &&
        probe.expectedExists === true &&
        /^pre-drop constraint\b/.test(probe.description)
      ) {
        droppedConstraintRelations.add(`${probe.schema}\0${probe.name}`);
      }
      if (
        probe.kind === 'relation' &&
        probe.expectedExists !== true &&
        droppedConstraintRelations.has(`${probe.schema}\0${probe.name}`)
      ) {
        unsupported.push(statement);
      }
    }
  }

  for (const statement of statements) {
    if (!/^DO\b/i.test(statement.trim())) {
      continue;
    }
    const doMatch =
      /^DO\s+(?:LANGUAGE\s+(?:"(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)\s+)?(\$(?:[a-z_][a-z0-9_]*)?\$)([\s\S]*?)\1$/i.exec(
        normalizedStatement(statement),
      );
    if (!doMatch) {
      unsupported.push(normalizedStatement(statement));
      continue;
    }
    const doBody = doMatch[2];
    const inspectableBody = maskSqlLiteralBodies(doBody);
    if (
      /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|EXECUTE)\b/i.test(inspectableBody)
    ) {
      unsupported.push(normalizedStatement(statement));
    }
  }

  return [...new Set(unsupported)];
}

function escapedPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function effectIdentityKey(probe) {
  const {
    description: _description,
    expectedExists: _expectedExists,
    optionalWhenUnestablished: _optionalWhenUnestablished,
    notNull: _notNull,
    enabled: _enabled,
    relationKind: _relationKind,
    parentSchema: _parentSchema,
    parentTable: _parentTable,
    hasUnmodeledConstraintIndexes: _hasUnmodeledConstraintIndexes,
    compatibleWhenAbsent: _compatibleWhenAbsent,
    ...identity
  } = probe;
  return JSON.stringify(identity);
}

function effectState(probe) {
  if (probe.kind === 'relation' && probe.expectedExists !== true) {
    return probe.relationKind;
  }
  if (probe.kind === 'column-nullability') {
    return probe.notNull ? 'not-null' : 'nullable';
  }
  if (probe.kind === 'row-level-security') {
    return probe.enabled ? 'enabled' : 'disabled';
  }
  return probe.expectedExists === true ? 'absent' : 'present';
}

function defaultState(probe) {
  if (
    probe.kind === 'column-nullability' ||
    probe.kind === 'row-level-security'
  ) {
    return undefined;
  }
  return 'absent';
}

function isTableRelationProbe(probe) {
  return (
    probe.kind === 'relation' &&
    (probe.relationKind === 'table' ||
      probe.relationKind === 'partitioned-table')
  );
}

function isExistingTableState(state) {
  return state === 'table' || state === 'partitioned-table';
}

function directParentIdentityKey(probe) {
  if (probe.parentSchema && probe.parentTable) {
    return effectIdentityKey({
      kind: 'relation',
      schema: probe.parentSchema,
      name: probe.parentTable,
    });
  }
  if (probe.schema && probe.table) {
    return effectIdentityKey({
      kind: 'relation',
      schema: probe.schema,
      name: probe.table,
    });
  }
  if (probe.kind === 'enum-value') {
    return effectIdentityKey({
      kind: 'type',
      schema: probe.schema,
      name: probe.type,
    });
  }
  return null;
}

function indexParentTableIdentityKey(source) {
  const match =
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|[a-z_][a-z0-9_$]*)\.)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+ON\s+(?:ONLY\s+)?(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/i.exec(
      maskSqlLiteralBodies(source),
    );
  if (match) {
    return effectIdentityKey({
      kind: 'relation',
      schema: schemaName(match[1], match[2]),
      name: identifier(match[3], match[4]),
    });
  }
  const tableMatch =
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\.)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/i.exec(
      maskSqlLiteralBodies(source),
    );
  return tableMatch
    ? effectIdentityKey({
        kind: 'relation',
        schema: schemaName(tableMatch[1], tableMatch[2]),
        name: identifier(tableMatch[3], tableMatch[4]),
      })
    : null;
}

function operationParentIdentityKey(probe, source, previousEntry) {
  return (
    directParentIdentityKey(probe) ??
    (probe.kind === 'relation' &&
    /^(?:index|implicit (?:primary-key|constraint) index)\b/.test(
      probe.description,
    )
      ? indexParentTableIdentityKey(source)
      : null) ??
    previousEntry?.parentKey ??
    null
  );
}

function applyProbeEffect(state, probe, source, invalidatedKeys) {
  const key = effectIdentityKey(probe);
  const previousEntry = state.get(key);
  const parentKey = operationParentIdentityKey(probe, source, previousEntry);
  const dropsParent =
    probe.expectedExists === true &&
    (isTableRelationProbe(probe) || probe.kind === 'type');
  if (dropsParent) {
    for (const [childKey, entry] of state) {
      if (entry.parentKey === key) {
        state.set(childKey, { ...entry, state: 'absent' });
        invalidatedKeys?.add(childKey);
      }
    }
  }
  if (probe.expectedExists === true && isTableRelationProbe(probe)) {
    for (const name of [probe.name, arrayTypeName(probe.name)]) {
      const typeKey = effectIdentityKey({
        kind: 'type',
        schema: probe.schema,
        name,
      });
      state.set(typeKey, {
        ...(state.get(typeKey) || {}),
        state: 'absent',
        parentKey: null,
      });
    }
  }
  if (probe.kind === 'type' && probe.expectedExists === true) {
    const arrayTypeKey = effectIdentityKey({
      kind: 'type',
      schema: probe.schema,
      name: arrayTypeName(probe.name),
    });
    state.set(arrayTypeKey, {
      ...(state.get(arrayTypeKey) || {}),
      state: 'absent',
      parentKey: null,
    });
  }
  state.set(key, {
    probe,
    state: effectState(probe),
    parentKey,
  });
  if (probe.expectedExists !== true && isTableRelationProbe(probe)) {
    const rlsProbe = {
      kind: 'row-level-security',
      schema: probe.schema,
      table: probe.name,
      enabled: false,
      description: `row-level security ${probe.schema}.${probe.name} disabled`,
    };
    state.set(effectIdentityKey(rlsProbe), {
      probe: rlsProbe,
      state: effectState(rlsProbe),
      parentKey: key,
    });
    const notNullColumns = new Set(createTableInlineNotNullColumns(source));
    for (const name of createTableColumnNames(source)) {
      const nullabilityProbe = {
        kind: 'column-nullability',
        schema: probe.schema,
        table: probe.name,
        name,
        notNull: notNullColumns.has(name),
        description: `${notNullColumns.has(name) ? 'not-null' : 'nullable'} column ${probe.schema}.${probe.name}.${name}`,
      };
      state.set(effectIdentityKey(nullabilityProbe), {
        probe: nullabilityProbe,
        state: effectState(nullabilityProbe),
        parentKey: key,
      });
    }
  }
  if (probe.kind === 'column' && probe.expectedExists !== true) {
    const structural = maskParenthesizedBodies(maskSqlLiteralBodies(source));
    const notNull =
      /\b(?:NOT\s+NULL|PRIMARY\s+KEY|smallserial|serial|bigserial|GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY)\b/i.test(
        structural,
      );
    const nullabilityProbe = {
      kind: 'column-nullability',
      schema: probe.schema,
      table: probe.table,
      name: probe.name,
      notNull,
      description: `${notNull ? 'not-null' : 'nullable'} column ${probe.schema}.${probe.table}.${probe.name}`,
    };
    state.set(effectIdentityKey(nullabilityProbe), {
      probe: nullabilityProbe,
      state: effectState(nullabilityProbe),
      parentKey,
    });
  }
}

function recordPendingMutation(pendingMutations, probe, currentState, source) {
  pendingMutations.add(effectIdentityKey(probe));
  if (
    probe.expectedExists !== true &&
    isTableRelationProbe(probe) &&
    isExistingTableState(currentState)
  ) {
    pendingMutations.add(
      effectIdentityKey({
        kind: 'type',
        schema: probe.schema,
        name: probe.name,
      }),
    );
    pendingMutations.add(
      effectIdentityKey({
        kind: 'type',
        schema: probe.schema,
        name: arrayTypeName(probe.name),
      }),
    );
    for (const primaryKeyName of createTablePrimaryKeyIndexNames(
      source,
      probe.name,
    )) {
      pendingMutations.add(
        effectIdentityKey({
          kind: 'relation',
          schema: probe.schema,
          name: primaryKeyName,
        }),
      );
    }
    for (const constraintIndexName of createTableNamedConstraintIndexNames(
      source,
    )) {
      pendingMutations.add(
        effectIdentityKey({
          kind: 'relation',
          schema: probe.schema,
          name: constraintIndexName,
        }),
      );
    }
  }
  if (
    probe.expectedExists === true &&
    isTableRelationProbe(probe) &&
    isExistingTableState(currentState)
  ) {
    pendingMutations.add(
      effectIdentityKey({
        kind: 'type',
        schema: probe.schema,
        name: probe.name,
      }),
    );
    pendingMutations.add(
      effectIdentityKey({
        kind: 'type',
        schema: probe.schema,
        name: arrayTypeName(probe.name),
      }),
    );
  }
  if (
    probe.kind === 'type' &&
    probe.expectedExists === true &&
    currentState === 'present'
  ) {
    pendingMutations.add(
      effectIdentityKey({
        kind: 'type',
        schema: probe.schema,
        name: arrayTypeName(probe.name),
      }),
    );
  }
}

function expectedMigrationState(appliedMigrations) {
  const state = new Map();
  for (const migration of appliedMigrations) {
    for (const { probe, source } of extractDdlProbeOperations(migration.sql)) {
      applyProbeEffect(state, probe, source);
    }
    recordAppliedUnmodeledConstraintIndexes(state, migration.sql);
  }
  return state;
}

function probeIsIdempotentlyGuarded(source, probe, previousEntry, parentKey) {
  const name = escapedPattern(probe.name || '');
  const sourceEstablishesSameEffect = () =>
    extractDdlProbesFromStatement(source).some(
      (candidate) =>
        effectIdentityKey(candidate) === effectIdentityKey(probe) &&
        effectState(candidate) === effectState(probe),
    );

  if (probe.kind === 'relation') {
    if (/^implicit primary-key index\b/.test(probe.description)) {
      return false;
    }
    if (
      probe.relationKind === 'index' &&
      previousEntry?.state !== undefined &&
      previousEntry.parentKey !== parentKey
    ) {
      return false;
    }
    return (
      /\bCREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\b/i.test(
        source,
      ) && sourceEstablishesSameEffect()
    );
  }

  if (probe.kind === 'column') {
    return (
      /\bADD\s+(?:COLUMN\s+)?IF\s+NOT\s+EXISTS\b/i.test(source) &&
      sourceEstablishesSameEffect()
    );
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
    return (
      /\bCREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\b/i.test(source) &&
      sourceEstablishesSameEffect()
    );
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
  priorPendingMigrations = [],
  pendingMigration,
}) {
  const state = expectedMigrationState(appliedMigrations);
  const pendingMutations = new Set();

  for (const migration of priorPendingMigrations) {
    for (const { probe, source } of extractDdlProbeOperations(migration.sql)) {
      const currentState =
        state.get(effectIdentityKey(probe))?.state ?? defaultState(probe);
      const parentKey = operationParentIdentityKey(
        probe,
        source,
        state.get(effectIdentityKey(probe)),
      );
      if (
        probe.kind === 'relation' &&
        probe.relationKind === 'index' &&
        parentKey &&
        state.get(parentKey)?.state === 'partitioned-table'
      ) {
        throw new Error(
          `Cannot safely model index effects on partitioned table: ${probe.description}`,
        );
      }
      applyProbeEffect(state, probe, source, pendingMutations);
      recordPendingMutation(pendingMutations, probe, currentState, source);
    }
  }

  const entryProbes = [];
  const preconditionKeys = new Set();
  for (const { probe, source } of extractDdlProbeOperations(
    pendingMigration.sql,
  )) {
    const key = effectIdentityKey(probe);
    const previousEntry = state.get(key);
    const parentKey = operationParentIdentityKey(probe, source, previousEntry);
    const entryIndependent =
      pendingMutations.has(key) ||
      (probe.kind !== 'relation' &&
        parentKey !== null &&
        pendingMutations.has(parentKey));
    const currentState = state.get(key)?.state ?? defaultState(probe);
    const parentEntry = parentKey ? state.get(parentKey) : null;
    if (
      parentKey &&
      pendingMutations.has(parentKey) &&
      parentEntry?.state === 'absent' &&
      !(
        probe.expectedExists === true &&
        probe.optionalWhenUnestablished === true &&
        currentState === 'absent' &&
        (probe.kind === 'relation' || probe.kind === 'type')
      )
    ) {
      throw new Error(
        `Pending migration targets an absent parent catalog object: ${probe.description}`,
      );
    }
    if (
      parentKey &&
      !pendingMutations.has(parentKey) &&
      parentEntry &&
      parentEntry.state !== 'absent' &&
      !preconditionKeys.has(parentKey)
    ) {
      const parentProbe = parentEntry.probe;
      entryProbes.push({
        ...parentProbe,
        expectedExists: true,
        description: `parent precondition ${parentProbe.schema}.${parentProbe.name}`,
      });
      preconditionKeys.add(parentKey);
    }
    if (
      probe.kind === 'column-nullability' &&
      parentEntry &&
      parentEntry.state !== 'absent'
    ) {
      const columnPrecondition = {
        kind: 'column',
        schema: probe.schema,
        table: probe.table,
        name: probe.name,
      };
      const columnPreconditionKey = effectIdentityKey(columnPrecondition);
      if (
        !pendingMutations.has(columnPreconditionKey) &&
        !preconditionKeys.has(columnPreconditionKey)
      ) {
        entryProbes.push({
          ...columnPrecondition,
          expectedExists: true,
          description: `column precondition ${probe.schema}.${probe.table}.${probe.name}`,
        });
        preconditionKeys.add(columnPreconditionKey);
      }
    }
    if (
      probe.expectedExists === true &&
      isTableRelationProbe(probe) &&
      (currentState === 'partitioned-table' ||
        [...state.values()].some(
          (entry) =>
            entry.parentKey === key &&
            isTableRelationProbe(entry.probe) &&
            isExistingTableState(entry.state),
        ))
    ) {
      throw new Error(
        `Cannot safely model partition-tree drop effects: ${probe.description}`,
      );
    }
    if (
      probe.expectedExists === true &&
      isTableRelationProbe(probe) &&
      previousEntry?.probe.hasUnmodeledConstraintIndexes
    ) {
      throw new Error(
        `Cannot safely model unnamed constraint-index drop effects: ${probe.description}`,
      );
    }
    if (
      probe.kind === 'relation' &&
      probe.relationKind === 'index' &&
      parentKey &&
      state.get(parentKey)?.state === 'partitioned-table'
    ) {
      throw new Error(
        `Cannot safely model index effects on partitioned table: ${probe.description}`,
      );
    }
    const optionalUnestablishedDrop =
      probe.expectedExists === true &&
      probe.optionalWhenUnestablished === true &&
      currentState === 'absent';
    if (
      probe.kind === 'relation' &&
      probe.relationKind === 'index' &&
      currentState === 'index' &&
      previousEntry?.parentKey &&
      parentKey &&
      previousEntry.parentKey !== parentKey
    ) {
      throw new Error(
        `Pending migration chain recreates established catalog effect: ${probe.description}`,
      );
    }
    const guardedNoOp =
      (probeIsIdempotentlyGuarded(source, probe, previousEntry, parentKey) ||
        (pendingMutations.has(key) &&
          /^(?:table row type|table array type|implicit primary-key index)\b/.test(
            probe.description,
          ) &&
          /\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(source))) &&
      currentState === effectState(probe);

    if (
      probe.expectedExists === true &&
      isTableRelationProbe(probe) &&
      !pendingMutations.has(key)
    ) {
      for (const entry of state.values()) {
        if (entry.parentKey !== key || entry.state !== 'index') {
          continue;
        }
        entryProbes.push({
          ...entry.probe,
          expectedExists: true,
          parentSchema: probe.schema,
          parentTable: probe.name,
          description: `index attachment ${entry.probe.schema}.${entry.probe.name} on ${probe.schema}.${probe.name}`,
        });
      }
    }
    if (
      pendingMutations.has(key) &&
      currentState !== undefined &&
      currentState !== 'absent' &&
      defaultState(probe) === 'absent' &&
      probe.expectedExists !== true &&
      !guardedNoOp
    ) {
      throw new Error(
        `Pending migration chain recreates established catalog effect: ${probe.description}`,
      );
    }

    if (guardedNoOp && probe.kind === 'relation') {
      const expectedParent = parentKey
        ? (state.get(parentKey)?.probe ?? JSON.parse(parentKey))
        : null;
      entryProbes.push({
        ...probe,
        expectedExists: true,
        compatibleWhenAbsent: true,
        ...(probe.relationKind === 'index' && expectedParent
          ? {
              parentSchema: expectedParent.schema,
              parentTable: expectedParent.name,
            }
          : {}),
        description: `guarded compatibility ${probe.schema}.${probe.name}`,
      });
    }

    const expectedIndexParent =
      probe.kind === 'relation' &&
      probe.relationKind === 'index' &&
      probe.expectedExists === true &&
      parentKey
        ? state.get(parentKey)?.probe
        : null;
    const entryProbe = expectedIndexParent
      ? {
          ...probe,
          parentSchema: expectedIndexParent.schema,
          parentTable: expectedIndexParent.name,
        }
      : probe;

    if (!entryIndependent && !guardedNoOp) {
      entryProbes.push(
        optionalUnestablishedDrop
          ? {
              ...entryProbe,
              expectedExists: false,
              description: entryProbe.description.replace(
                /^pre-drop /,
                'absence before optional drop ',
              ),
            }
          : entryProbe,
      );
    }

    applyProbeEffect(state, probe, source, pendingMutations);
    recordPendingMutation(pendingMutations, probe, currentState, source);
  }

  return entryProbes;
}
