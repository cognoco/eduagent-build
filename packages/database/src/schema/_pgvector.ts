import { customType } from 'drizzle-orm/pg-core';

/** Voyage AI voyage-3.5 embeddings: 1024 dimensions. */
export const VECTOR_DIM = 1024;

const dataType = () => `vector(${VECTOR_DIM})`;

const vectorConfig = {
  dataType() {
    return dataType();
  },
  toDriver(value: number[]): string {
    return vectorToDriver(value);
  },
  fromDriver(value: string): number[] {
    return vectorFromDriver(value);
  },
};

export function vectorToDriver(value: number[]): string {
  return `[${value.join(',')}]`;
}

/** Thrown when a raw driver value cannot be parsed as a vector. */
export class VectorParseError extends Error {
  constructor(raw: string, hint?: string) {
    const location = hint ? ` (column: ${hint})` : '';
    super(
      `VectorParseError: cannot parse driver value as vector${location}: ${JSON.stringify(raw)}`,
    );
    this.name = 'VectorParseError';
  }
}

export function vectorFromDriver(value: string, columnHint?: string): number[] {
  // Primary path: pgvector returns JSON-array format "[0.1,0.2,…]"
  try {
    return JSON.parse(value) as number[];
  } catch {
    // no-op — fall through to text-format fallback
  }

  // Fallback: pgvector native text format "(0.1,0.2,…)"
  const trimmed = value.trim();
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(1, -1);
    const parts = inner.split(',').map(Number);
    if (parts.length > 0 && parts.every((n) => !Number.isNaN(n))) {
      return parts;
    }
  }

  throw new VectorParseError(value, columnHint);
}

export function vectorNullableToDriver(value: number[] | null): string | null {
  return value === null ? null : vectorToDriver(value);
}

export function vectorNullableFromDriver(
  value: string | null,
): number[] | null {
  return value === null ? null : vectorFromDriver(value);
}

/** Custom pgvector type for Drizzle ORM. Apply `.notNull()` per column. */
export const vector = customType<{ data: number[]; driverData: string }>(
  vectorConfig,
);

/** Nullable pgvector column with the same SQL type and nullable TS inference. */
export const vectorNullable = customType<{
  data: number[] | null;
  driverData: string | null;
  notNull: false;
}>({
  dataType,
  toDriver: vectorNullableToDriver,
  fromDriver: vectorNullableFromDriver,
});
