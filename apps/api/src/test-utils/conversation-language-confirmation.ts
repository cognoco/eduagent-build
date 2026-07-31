import { eq } from 'drizzle-orm';
import { person, type Database } from '@eduagent/database';

/**
 * [WI-1556] The one canonical "this learner already confirmed their
 * conversation language" instant for tests. Suites must not inline their own
 * timestamp literal — a second literal is a second definition of the same
 * semantic, and they drift.
 */
export const CONFIRMED_CONVERSATION_LANGUAGE_AT = new Date(
  '2026-01-01T00:00:00Z',
);

/**
 * [WI-1556] Mark a seeded learner as an ordinary *confirmed existing user*.
 *
 * Fidelity note: a confirmed conversation language is the normal state for a
 * learner who has already been through first-run. Unconfirmed (`null`) is the
 * special first-run case that `prepareExchangeContext` fails closed on, so
 * suites that exercise ordinary session flows must confirm after creating
 * their profile — whether that profile came from `POST /v1/profiles` or a
 * direct `person` insert.
 *
 * Tests that assert the *rejection* must clear this back to `null`
 * explicitly rather than relying on the absence of this call, so the
 * assertion stays a real statement about the guard.
 */
export async function markConversationLanguageConfirmedForTest(
  db: Database,
  profileId: string,
): Promise<void> {
  await db
    .update(person)
    .set({
      conversationLanguageConfirmedAt: CONFIRMED_CONVERSATION_LANGUAGE_AT,
    })
    .where(eq(person.id, profileId));
}
