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
  // [WI-2416] The authenticated caller's own person id, resolved server-side
  // by accountMiddleware — required by assertCanReadProfile.
  callerPersonId: string | undefined;
  profileId: string | undefined;
  profileMeta: ProfileMeta | undefined;
  /**
   * [BUG-502 / BUG-487] Set by profileScopeMiddleware when auto-resolve throws
   * a transient error. Downstream consent middleware reads this to fail closed.
   */
  profileScopeError: Error | undefined;
  subscriptionId: string | undefined;
  subscriptionTier: SubscriptionTier | undefined;
  llmTier: LLMTier | undefined;
};
