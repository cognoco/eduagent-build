import type { Database } from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import type { Account } from '../services/account';
import type { LLMTier } from '../services/subscription';

export type AppVariables = {
  user: AuthUser;
  db: Database;
  account: Account;
  profileId: string | undefined;
  profileMeta: ProfileMeta | undefined;
  subscriptionId: string | undefined;
  subscriptionTier: SubscriptionTier | undefined;
  llmTier: LLMTier | undefined;
};
