import { emailBouncedEventSchema } from './observers.js';

// ---------------------------------------------------------------------------
// emailBouncedEventSchema
// ---------------------------------------------------------------------------

describe('emailBouncedEventSchema', () => {
  it('accepts a fully-populated email.bounced event', () => {
    const result = emailBouncedEventSchema.safeParse({
      type: 'email.bounced',
      to: 'u***@example.com',
      emailId: 'email-id-789',
      timestamp: '2025-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('email.bounced');
      expect(result.data.to).toBe('u***@example.com');
      expect(result.data.emailId).toBe('email-id-789');
    }
  });

  it('accepts email.complained type', () => {
    const result = emailBouncedEventSchema.safeParse({
      type: 'email.complained',
      to: 'c***@example.com',
      emailId: null,
      timestamp: '2025-06-01T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('email.complained');
    }
  });

  it('accepts null emailId (nullable field)', () => {
    const result = emailBouncedEventSchema.safeParse({
      type: 'email.bounced',
      to: 'u***@example.com',
      emailId: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emailId).toBeNull();
    }
  });

  // [WI-989] `type` and `to` are now required — {} must be rejected.
  it('rejects an empty object (type and to are required)', () => {
    const result = emailBouncedEventSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  // [WI-989] Valid minimal payload — only required fields present.
  it('accepts a minimal valid payload with type and to', () => {
    const result = emailBouncedEventSchema.safeParse({
      type: 'email.bounced',
      to: 'u***@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type enum value', () => {
    const result = emailBouncedEventSchema.safeParse({
      type: 'email.delivered',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type on emailId (number instead of string/null)', () => {
    const result = emailBouncedEventSchema.safeParse({
      emailId: 42,
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type on timestamp (number instead of string)', () => {
    const result = emailBouncedEventSchema.safeParse({
      timestamp: 1234567890,
    });
    expect(result.success).toBe(false);
  });
});
