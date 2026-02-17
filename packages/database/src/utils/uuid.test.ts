import { generateUUIDv7 } from './uuid.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('generateUUIDv7', () => {
  it('returns a valid UUID format', () => {
    const id = generateUUIDv7();
    expect(id).toMatch(UUID_REGEX);
  });

  it('has version nibble set to 7', () => {
    const id = generateUUIDv7();
    // UUID format: xxxxxxxx-xxxx-Vxxx-xxxx-xxxxxxxxxxxx
    // The version nibble V is at character index 14
    expect(id[14]).toBe('7');
  });

  it('produces chronologically ordered UUIDs', () => {
    const first = generateUUIDv7();
    const second = generateUUIDv7();

    // UUID v7 embeds a Unix timestamp in the first 48 bits (first 12 hex chars).
    // Two sequential calls should produce UUIDs where the first is <= the second
    // when compared lexicographically on the timestamp portion.
    const firstTimestamp = first.replace(/-/g, '').slice(0, 12);
    const secondTimestamp = second.replace(/-/g, '').slice(0, 12);
    expect(firstTimestamp <= secondTimestamp).toBe(true);
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUUIDv7()));
    expect(ids.size).toBe(100);
  });
});
