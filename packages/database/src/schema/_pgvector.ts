import { customType } from 'drizzle-orm/pg-core';

/** Voyage AI voyage-3.5 embeddings: 1024 dimensions. */
export const VECTOR_DIM = 1024;

const vectorConfig = {
  dataType() {
    return `vector(${VECTOR_DIM})`;
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

export function vectorFromDriver(value: string): number[] {
  return JSON.parse(value);
}

/** Custom pgvector type for Drizzle ORM. Apply `.notNull()` per column. */
export const vector = customType<{ data: number[]; driverData: string }>(
  vectorConfig
);

/** Nullable pgvector column with the same SQL type and nullable TS inference. */
export const vectorNullable = customType<{
  data: number[] | null;
  driverData: string | null;
  notNull: false;
}>({
  ...vectorConfig,
  toDriver(value: number[] | null): string | null {
    return value === null ? null : vectorToDriver(value);
  },
  fromDriver(value: string | null): number[] | null {
    return value === null ? null : vectorFromDriver(value);
  },
});
