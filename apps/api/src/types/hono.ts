// ---------------------------------------------------------------------------
// Hono app type declarations — shared Variables type for tests and middleware.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import type { Account } from '../services/account';
import type { LLMTier } from '../services/subscription';

export type AppVariables = {
  user: AuthUser;
  db: Database;
  account: Account;
  profileId: string;
  profileMeta: ProfileMeta | undefined;
  subscriptionId: string;
  llmTier: LLMTier;
};

export type AppEnv = {
  Variables: AppVariables;
};
