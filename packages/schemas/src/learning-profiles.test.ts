/**
 * learning-profiles.test.ts
 *
 * F-152: break-test for the removed `childProfileId` field in
 * `tellMentorInputSchema`.
 *
 * The schema is `.strict()`. Before F-152 was fixed, the schema declared an
 * optional `childProfileId: z.string().uuid()`. That field was dead — no API
 * route handler reads `childProfileId` from the body (the child's profile comes
 * from the URL param). Keeping it in the schema was a latent footgun: a future
 * reader could have wired it to a DB write, creating a write-side IDOR.
 *
 * Red-green verification:
 *   1. Write test — passes (field is gone, schema rejects it).
 *   2. Add the field back temporarily — test FAILS (schema accepts it).
 *   3. Remove field again — test PASSES (guard restored).
 */

import { tellMentorInputSchema } from './learning-profiles.js';

describe('[F-152 break-test] tellMentorInputSchema — dead childProfileId field removed', () => {
  it('[BREAK F-152] rejects a body that includes childProfileId (strict schema)', () => {
    const result = tellMentorInputSchema.safeParse({
      text: 'I prefer visual explanations',
      childProfileId: '00000000-0000-0000-0000-000000000001',
    });
    // .strict() means unknown keys are rejected
    expect(result.success).toBe(false);
  });

  it('accepts a valid body with text only', () => {
    const result = tellMentorInputSchema.safeParse({
      text: 'I prefer visual explanations',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Confirm childProfileId is NOT part of the inferred type
      const data: { text: string } = result.data;
      expect(data.text).toBe('I prefer visual explanations');
      // @ts-expect-error — childProfileId must not exist on the parsed type
      expect(data.childProfileId).toBeUndefined();
    }
  });

  it('rejects an empty text (min-length guard)', () => {
    const result = tellMentorInputSchema.safeParse({ text: '' });
    expect(result.success).toBe(false);
  });

  it('rejects text exceeding 500 characters (max-length guard)', () => {
    const result = tellMentorInputSchema.safeParse({ text: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });
});
