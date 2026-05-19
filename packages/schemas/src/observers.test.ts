import {
  askGateDecisionEventSchema,
  askGateTimeoutEventSchema,
  emailBouncedEventSchema,
} from './observers.js';

// ---------------------------------------------------------------------------
// askGateDecisionEventSchema
// ---------------------------------------------------------------------------

describe('askGateDecisionEventSchema', () => {
  it('accepts a fully-populated valid event', () => {
    const result = askGateDecisionEventSchema.safeParse({
      sessionId: 'session-abc-123',
      meaningful: true,
      reason: 'sufficient_depth',
      method: 'heuristic',
      exchangeCount: 6,
      learnerWordCount: 120,
      topicCount: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionId).toBe('session-abc-123');
      expect(result.data.meaningful).toBe(true);
      expect(result.data.exchangeCount).toBe(6);
    }
  });

  it('accepts an empty object (all fields are optional)', () => {
    const result = askGateDecisionEventSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial payload with only some fields present', () => {
    const result = askGateDecisionEventSchema.safeParse({
      sessionId: 'session-xyz',
      meaningful: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.meaningful).toBe(false);
      expect(result.data.exchangeCount).toBeUndefined();
    }
  });

  it('rejects wrong type on meaningful (string instead of boolean)', () => {
    const result = askGateDecisionEventSchema.safeParse({
      meaningful: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type on exchangeCount (string instead of number)', () => {
    const result = askGateDecisionEventSchema.safeParse({
      exchangeCount: '6',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type on learnerWordCount (boolean instead of number)', () => {
    const result = askGateDecisionEventSchema.safeParse({
      learnerWordCount: true,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// askGateTimeoutEventSchema
// ---------------------------------------------------------------------------

describe('askGateTimeoutEventSchema', () => {
  it('accepts a fully-populated valid event', () => {
    const result = askGateTimeoutEventSchema.safeParse({
      sessionId: 'session-timeout-456',
      exchangeCount: 4,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionId).toBe('session-timeout-456');
      expect(result.data.exchangeCount).toBe(4);
    }
  });

  it('accepts an empty object (all fields are optional)', () => {
    const result = askGateTimeoutEventSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial payload with only sessionId', () => {
    const result = askGateTimeoutEventSchema.safeParse({
      sessionId: 'session-only',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exchangeCount).toBeUndefined();
    }
  });

  it('rejects wrong type on sessionId (number instead of string)', () => {
    const result = askGateTimeoutEventSchema.safeParse({
      sessionId: 12345,
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type on exchangeCount (string instead of number)', () => {
    const result = askGateTimeoutEventSchema.safeParse({
      exchangeCount: '4',
    });
    expect(result.success).toBe(false);
  });
});

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
      emailId: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emailId).toBeNull();
    }
  });

  it('accepts an empty object (all fields are optional)', () => {
    const result = emailBouncedEventSchema.safeParse({});
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
