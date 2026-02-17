import { uuidv7 } from 'uuidv7';

/** Generate a UUID v7 with embedded timestamp for chronological ordering (ARCH-3) */
export function generateUUIDv7(): string {
  return uuidv7();
}
