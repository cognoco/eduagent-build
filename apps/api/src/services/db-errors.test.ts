import { DrizzleQueryError } from 'drizzle-orm/errors';
import {
  isUniqueViolation,
  uniqueViolationConstraint,
  unwrapDbError,
} from './db-errors';

// A real Postgres unique-violation error in the shape the neon-serverless /
// node-postgres driver throws it: a string SQLSTATE `.code` plus `.constraint`.
function pgUniqueViolation(constraint?: string): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint'),
    constraint === undefined
      ? { code: '23505' }
      : { code: '23505', constraint },
  );
}

// A non-unique driver error (connection failure) for the negative path.
function pgConnectionError(): Error {
  return Object.assign(new Error('connection terminated'), { code: '08006' });
}

describe('db-errors', () => {
  describe('isUniqueViolation', () => {
    it('detects a bare driver unique violation (pre-0.44 shape)', () => {
      expect(isUniqueViolation(pgUniqueViolation('x'))).toBe(true);
    });

    // The regression guard: drizzle-orm >=0.44 wraps the driver error in a
    // DrizzleQueryError, moving `.code` onto `.cause`. A top-level-only check
    // returns false here and the handler throws a raw 500 instead of mapping
    // the conflict.
    it('detects a unique violation wrapped in DrizzleQueryError (0.44+ shape)', () => {
      const wrapped = new DrizzleQueryError(
        'insert into ...',
        [],
        pgUniqueViolation('x'),
      );
      expect(isUniqueViolation(wrapped)).toBe(true);
    });

    it('detects a doubly-wrapped unique violation', () => {
      const inner = new DrizzleQueryError('insert', [], pgUniqueViolation('x'));
      const outer = new DrizzleQueryError('tx', [], inner);
      expect(isUniqueViolation(outer)).toBe(true);
    });

    it('returns false for a wrapped non-unique DB error', () => {
      const wrapped = new DrizzleQueryError('insert', [], pgConnectionError());
      expect(isUniqueViolation(wrapped)).toBe(false);
    });

    it('returns false for non-error and code-less inputs', () => {
      expect(isUniqueViolation(null)).toBe(false);
      expect(isUniqueViolation(undefined)).toBe(false);
      expect(isUniqueViolation('boom')).toBe(false);
      expect(isUniqueViolation(new Error('plain'))).toBe(false);
    });
  });

  describe('uniqueViolationConstraint', () => {
    it('returns the constraint name from a wrapped unique violation', () => {
      const wrapped = new DrizzleQueryError(
        'insert',
        [],
        pgUniqueViolation('login_clerk_user_id_unique'),
      );
      expect(uniqueViolationConstraint(wrapped)).toBe(
        'login_clerk_user_id_unique',
      );
    });

    it('returns the constraint name from a bare unique violation', () => {
      expect(
        uniqueViolationConstraint(pgUniqueViolation('login_email_unique')),
      ).toBe('login_email_unique');
    });

    it('returns empty string when the unique violation carries no constraint', () => {
      const wrapped = new DrizzleQueryError('insert', [], pgUniqueViolation());
      expect(uniqueViolationConstraint(wrapped)).toBe('');
    });

    it('returns null when the error is not a unique violation', () => {
      expect(uniqueViolationConstraint(new Error('plain'))).toBeNull();
      expect(
        uniqueViolationConstraint(
          new DrizzleQueryError('insert', [], pgConnectionError()),
        ),
      ).toBeNull();
    });
  });

  describe('unwrapDbError', () => {
    it('returns the underlying driver error from a wrapper', () => {
      const driver = pgUniqueViolation('x');
      expect(unwrapDbError(new DrizzleQueryError('insert', [], driver))).toBe(
        driver,
      );
    });

    it('returns the input unchanged when no driver code is in the chain', () => {
      const plain = new Error('plain');
      expect(unwrapDbError(plain)).toBe(plain);
    });
  });
});
