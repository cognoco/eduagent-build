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
