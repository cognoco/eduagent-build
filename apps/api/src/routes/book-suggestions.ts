import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import {
  requireProfileId,
  type ProfileMeta,
} from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { assertLlmConsent } from '../services/identity-v2/consent-status-v2';
import {
  getUnpickedBookSuggestionsWithTopup,
  getUnpickedBookSuggestionsEnvelope,
  getAllBookSuggestions,
} from '../services/suggestions';
import {
  bookSuggestionsResponseSchema,
  bookSuggestionsArrayResponseSchema,
} from '@eduagent/schemas';
import { parseConversationLanguage } from '../services/llm';

type BookSuggestionsEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

// [BUG-392] Guard path params against non-UUID input reaching the DB layer.
const subjectParamSchema = z.object({
  subjectId: z.string().uuid(),
});

// [WI-258] The legacy GET ?topup=1 query parameter is preserved for one
// release for backwards compatibility but is treated as DB-only — the
// metering middleware allowlist (path-based) cannot distinguish a GET with
// ?topup=1 from a plain GET, so we removed the side-effecting topup branch
// from the GET handler and surface it only via the dedicated POST
// /subjects/:subjectId/book-suggestions/topup route below. Mobile clients
// must call the POST endpoint to trigger top-up generation.
export const bookSuggestionRoutes = new Hono<BookSuggestionsEnv>()
  .get(
    '/subjects/:subjectId/book-suggestions',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const { subjectId } = c.req.valid('param');

      const result = await getUnpickedBookSuggestionsEnvelope(
        db,
        profileId,
        subjectId,
      );
      return c.json(bookSuggestionsResponseSchema.parse(result), 200);
    },
  )
  // [WI-258] POST topup route — explicit, side-effecting, metered via the
  // path-based allowlist in middleware/metering.ts. Proxy mode is blocked
  // because top-up triggers LLM calls that must be billed against the
  // owner, not a proxied profile.
  .post(
    '/subjects/:subjectId/book-suggestions/topup',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const { subjectId } = c.req.valid('param');

      await assertNotProxyMode(c);

      // [WI-2396] Consent-withdrawal gate before LLM dispatch (canon R5).
      // Gated unconditionally — getUnpickedBookSuggestionsWithTopup only
      // dispatches the LLM when unpicked.length < 4, but this endpoint's
      // sole purpose is the top-up path.
      await assertLlmConsent(db, profileId);

      // i18n Phase 1 — forward the active profile's conversation_language.
      const profileMeta = c.get('profileMeta');
      const result = await getUnpickedBookSuggestionsWithTopup(
        db,
        profileId,
        subjectId,
        {
          conversationLanguage: parseConversationLanguage(
            profileMeta?.conversationLanguage,
          ),
        },
      );
      return c.json(bookSuggestionsResponseSchema.parse(result), 200);
    },
  )
  .get(
    '/subjects/:subjectId/book-suggestions/all',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');
      const suggestions = await getAllBookSuggestions(
        c.get('db'),
        profileId,
        subjectId,
      );
      return c.json(bookSuggestionsArrayResponseSchema.parse(suggestions), 200);
    },
  );
