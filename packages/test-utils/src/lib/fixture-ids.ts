/**
 * Canonical RFC 9562 v4 UUIDs for tests.
 *
 * Use these instead of hand-rolled sequential strings like
 * `'00000000-0000-0000-0000-000000000001'` (version=0, fails Zod's
 * `.uuid()` check) or `'test-profile-id'` (not a UUID at all, fails
 * any schema that validates `z.string().uuid()`).
 *
 * Each constant is a real v4 UUID (version=4, variant=8) so it passes
 * RFC 9562 validation. Trailing digits are intentionally stable across
 * runs so snapshot tests don't churn.
 *
 * `NIL_UUID` is the all-zero RFC 9562 nil UUID. Use it explicitly when
 * a test needs a sentinel "does not exist" identifier — never as a
 * placeholder for a real entity.
 */

export const TEST_PROFILE_ID = '00000000-0000-4000-8000-000000000001';
export const TEST_PROFILE_ID_2 = '00000000-0000-4000-8000-000000000002';
export const TEST_PROFILE_ID_3 = '00000000-0000-4000-8000-000000000003';

export const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-000000000099';

export const TEST_SESSION_ID = '00000000-0000-4000-8000-000000000101';
export const TEST_SESSION_ID_2 = '00000000-0000-4000-8000-000000000102';

export const TEST_SUBJECT_ID = '00000000-0000-4000-8000-000000000201';
export const TEST_SUBJECT_ID_2 = '00000000-0000-4000-8000-000000000202';

export const TEST_TOPIC_ID = '00000000-0000-4000-8000-000000000301';
export const TEST_TOPIC_ID_2 = '00000000-0000-4000-8000-000000000302';
export const TEST_TOPIC_ID_3 = '00000000-0000-4000-8000-000000000303';

export const TEST_BOOK_ID = '00000000-0000-4000-8000-000000000401';
export const TEST_SHELF_ID = '00000000-0000-4000-8000-000000000501';

export const TEST_VOCABULARY_ID = '00000000-0000-4000-8000-000000000601';

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';
