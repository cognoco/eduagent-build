/**
 * Test Data Factory Package
 *
 * Provides builder functions for creating typed test data.
 * All builders accept optional overrides and return objects
 * that satisfy the corresponding @eduagent/schemas types.
 *
 * @packageDocumentation
 */

// Profile factories
export {
  buildProfile,
  buildProfileList,
  resetProfileCounter,
} from './profiles.js';

// Auth factories
export { buildRegisterInput, resetAuthCounter } from './auth.js';

// Consent factories
export {
  buildConsentRequest,
  buildConsentResponse,
  resetConsentCounter,
} from './consent.js';

// Session factories
export {
  buildSession,
  buildSessionSummary,
  resetSessionCounter,
} from './sessions.js';

// Subject & curriculum factories
export {
  buildSubject,
  buildCurriculum,
  buildCurriculumTopic,
  resetSubjectCounter,
} from './subjects.js';

// Assessment & retention factories
export {
  buildAssessment,
  buildRetentionCard,
  buildEvaluateAssessment,
  buildTeachBackAssessment,
  resetAssessmentCounter,
} from './assessments.js';

// Billing factories
export {
  buildSubscription,
  buildQuotaPool,
  buildTopUpCredits,
  resetBillingCounter,
} from './billing.js';

// Progress factories
export {
  buildStreak,
  buildXpLedgerEntry,
  resetProgressCounter,
} from './progress.js';
