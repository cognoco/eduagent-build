import { customType } from 'drizzle-orm/pg-core';

/** Voyage AI voyage-3.5 embeddings: 1024 dimensions. */
export const VECTOR_DIM = 1024;

/** Custom pgvector type for Drizzle ORM. Apply `.notNull()` per column. */
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${VECTOR_DIM})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});
