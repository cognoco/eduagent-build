// ---------------------------------------------------------------------------
// learner-profile routes — IDOR, GDPR self-delete, toggle, and consent guards
// ---------------------------------------------------------------------------
// Covers the four critical paths called out by the Epic 16 code review:
// (1) cross-family parent cannot access another family's child (403)
// (2) self delete-all triggers the hard-delete service and returns 200
// (3) memory-enabled toggle persists via the service
// (4) parent-only /:profileId/consent and /:profileId/item guards fire on
//     unauthorized access, and succeed only with a valid family link
// ---------------------------------------------------------------------------

// Mock JWT module so auth middleware passes with a valid token.
jest.mock('../middleware/jwt', () =>
  require('../test-utils/auth-fixture').createJwtModuleMock()
);

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
    createFunction: jest.fn().mockReturnValue(jest.fn()),
  },
}));

// Minimal database stub — middleware creates it per request.
import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });
const mockFindFamilyLink = jest.fn().mockResolvedValue({
  parentProfileId: '770e8400-e29b-41d4-a716-446655440000',
  childProfileId: '770e8400-e29b-41d4-a716-446655440001',
});
const familyLinksQuery = {
  findFirst: (...args: unknown[]) => mockFindFamilyLink(...args),
  findMany: jest.fn().mockResolvedValue([]),
};

mockDatabaseModule.db.query = new Proxy(mockDatabaseModule.db.query, {
  get(target, prop, receiver) {
    if (prop === 'familyLinks') return familyLinksQuery;
    return Reflect.get(target, prop, receiver);
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

// profile-scope middleware calls getProfile(...) to resolve X-Profile-Id to
// a verified profileId on the account. We return a profile owned by the
// account regardless of which id is sent so the middleware accepts the
// header and writes it to the context.
jest.mock('../services/profile', () => ({
  findOwnerProfile: jest.fn().mockResolvedValue(null),
  getProfile: jest
    .fn()
    .mockImplementation(async (_db: unknown, profileId: string) => ({
      id: profileId,
      birthYear: null,
      location: null,
      consentStatus: 'CONSENTED',
    })),
}));

// Learner-profile service mocks — record calls so assertions can verify
// the route reached the service with the right (parent/child) profileId.
const mockGetOrCreateLearningProfile = jest.fn();
const mockDeleteAllMemory = jest.fn();
const mockDeleteMemoryItem = jest.fn();
const mockToggleMemoryEnabled = jest.fn();
const mockToggleMemoryCollection = jest.fn();
const mockToggleMemoryInjection = jest.fn();
const mockGrantMemoryConsent = jest.fn();
const mockUnsuppressInference = jest.fn();
const mockBuildHumanReadableMemoryExport = jest.fn();
const mockUpdateAccommodationMode = jest.fn();

jest.mock('../services/learner-profile', () => ({
  getOrCreateLearningProfile: (...args: unknown[]) =>
    mockGetOrCreateLearningProfile(...args),
  deleteAllMemory: (...args: unknown[]) => mockDeleteAllMemory(...args),
  deleteMemoryItem: (...args: unknown[]) => mockDeleteMemoryItem(...args),
  toggleMemoryEnabled: (...args: unknown[]) => mockToggleMemoryEnabled(...args),
  toggleMemoryCollection: (...args: unknown[]) =>
    mockToggleMemoryCollection(...args),
  toggleMemoryInjection: (...args: unknown[]) =>
    mockToggleMemoryInjection(...args),
  grantMemoryConsent: (...args: unknown[]) => mockGrantMemoryConsent(...args),
  unsuppressInference: (...args: unknown[]) => mockUnsuppressInference(...args),
  buildHumanReadableMemoryExport: (...args: unknown[]) =>
    mockBuildHumanReadableMemoryExport(...args),
  updateAccommodationMode: (...args: unknown[]) =>
    mockUpdateAccommodationMode(...args),
}));

jest.mock('../services/learner-input', () => ({
  parseLearnerInput: jest.fn().mockResolvedValue({
    success: true,
    message: 'Got it!',
    fieldsUpdated: ['interests'],
  }),
}));

import { app } from '../index';
import { BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const PARENT_PROFILE_ID = '770e8400-e29b-41d4-a716-446655440000';
const OWN_CHILD_PROFILE_ID = '770e8400-e29b-41d4-a716-446655440001';
const OTHER_FAMILY_CHILD_ID = '770e8400-e29b-41d4-a716-446655440099';

const PARENT_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': PARENT_PROFILE_ID,
};

const MINIMAL_PROFILE = {
  id: 'learning-profile-id',
  profileId: OWN_CHILD_PROFILE_ID,
  learningStyle: null,
  interests: [],
  strengths: [],
  struggles: [],
  communicationNotes: [],
  suppressedInferences: [],
  interestTimestamps: {},
  effectivenessSessionCount: 0,
  memoryEnabled: true,
  memoryCollectionEnabled: false,
  memoryInjectionEnabled: true,
  memoryConsentStatus: 'pending',
  consentPromptDismissedAt: null,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('learner-profile routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindFamilyLink.mockResolvedValue({
      parentProfileId: PARENT_PROFILE_ID,
      childProfileId: OWN_CHILD_PROFILE_ID,
    });
    mockGetOrCreateLearningProfile.mockResolvedValue(MINIMAL_PROFILE);
    mockDeleteAllMemory.mockResolvedValue(undefined);
    mockDeleteMemoryItem.mockResolvedValue(undefined);
    mockToggleMemoryEnabled.mockResolvedValue(undefined);
    mockToggleMemoryCollection.mockResolvedValue(undefined);
    mockToggleMemoryInjection.mockResolvedValue(undefined);
    mockGrantMemoryConsent.mockResolvedValue(undefined);
    mockUnsuppressInference.mockResolvedValue(undefined);
    mockBuildHumanReadableMemoryExport.mockReturnValue('Memory export text');
    mockUpdateAccommodationMode.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // IDOR — parent-only child routes must 403 without a family link
  // -------------------------------------------------------------------------

  describe('IDOR protection on /learner-profile/:profileId/* routes', () => {
    beforeEach(() => {
      mockFindFamilyLink.mockResolvedValue(undefined);
    });

    it('returns 403 on GET /learner-profile/:profileId for another family', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}`,
        { headers: PARENT_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(403);
      expect(mockGetOrCreateLearningProfile).not.toHaveBeenCalled();
      expect(mockFindFamilyLink).toHaveBeenCalledTimes(1);
    });

    it('returns 403 on DELETE /learner-profile/:profileId/all for another family', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}/all`,
        { method: 'DELETE', headers: PARENT_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(403);
      expect(mockDeleteAllMemory).not.toHaveBeenCalled();
    });

    it('returns 403 on DELETE /learner-profile/:profileId/item for another family', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}/item`,
        {
          method: 'DELETE',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ category: 'interests', value: 'space' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(403);
      expect(mockDeleteMemoryItem).not.toHaveBeenCalled();
    });

    it('returns 403 on PATCH /learner-profile/:profileId/memory-enabled for another family', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}/memory-enabled`,
        {
          method: 'PATCH',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ memoryEnabled: false }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(403);
      expect(mockToggleMemoryEnabled).not.toHaveBeenCalled();
    });

    it('returns 403 on POST /learner-profile/:profileId/consent for another family', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}/consent`,
        {
          method: 'POST',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(403);
      expect(mockGrantMemoryConsent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Happy path — valid family link lets the parent reach the service
  // -------------------------------------------------------------------------

  describe('parent with valid family link', () => {
    beforeEach(() => {
      mockFindFamilyLink.mockResolvedValue({
        parentProfileId: PARENT_PROFILE_ID,
        childProfileId: OWN_CHILD_PROFILE_ID,
      });
    });

    it('returns 200 and the child profile on GET /learner-profile/:profileId', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}`,
        { headers: PARENT_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockGetOrCreateLearningProfile).toHaveBeenCalledWith(
        expect.anything(),
        OWN_CHILD_PROFILE_ID
      );
      const body = (await res.json()) as { profile: { id: string } };
      expect(body.profile.profileId).toBe(OWN_CHILD_PROFILE_ID);
    });

    it('persists consent grant on POST /learner-profile/:profileId/consent', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}/consent`,
        {
          method: 'POST',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockGrantMemoryConsent).toHaveBeenCalledWith(
        expect.anything(),
        OWN_CHILD_PROFILE_ID,
        undefined,
        'granted'
      );
    });

    it('includes human-readable text on GET /learner-profile/:profileId/export-text', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}/export-text`,
        { headers: PARENT_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { text: string };
      expect(body.text).toBe('Memory export text');
      expect(mockBuildHumanReadableMemoryExport).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Self-scoped routes — learner acts on their own profile (no family check)
  // -------------------------------------------------------------------------

  describe('self-scoped /learner-profile/* routes', () => {
    it('calls deleteAllMemory with the authenticated profileId on DELETE /learner-profile/all', async () => {
      const res = await app.request(
        '/v1/learner-profile/all',
        { method: 'DELETE', headers: PARENT_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockDeleteAllMemory).toHaveBeenCalledWith(
        expect.anything(),
        PARENT_PROFILE_ID,
        'test-account-id'
      );
      // Family-link check is not required for self-scoped routes.
      expect(mockFindFamilyLink).not.toHaveBeenCalled();
    });

    it('persists self-consent on POST /learner-profile/consent', async () => {
      const res = await app.request(
        '/v1/learner-profile/consent',
        {
          method: 'POST',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockGrantMemoryConsent).toHaveBeenCalledWith(
        expect.anything(),
        PARENT_PROFILE_ID,
        'test-account-id',
        'granted'
      );
      expect(mockFindFamilyLink).not.toHaveBeenCalled();
    });

    it('calls toggleMemoryEnabled on PATCH /learner-profile/memory-enabled', async () => {
      const res = await app.request(
        '/v1/learner-profile/memory-enabled',
        {
          method: 'PATCH',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ memoryEnabled: false }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockToggleMemoryEnabled).toHaveBeenCalledWith(
        expect.anything(),
        PARENT_PROFILE_ID,
        'test-account-id',
        false
      );
    });

    it('calls deleteMemoryItem with suppress flag on DELETE /learner-profile/item', async () => {
      const res = await app.request(
        '/v1/learner-profile/item',
        {
          method: 'DELETE',
          headers: PARENT_HEADERS,
          body: JSON.stringify({
            category: 'interests',
            value: 'dinosaurs',
            suppress: true,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockDeleteMemoryItem).toHaveBeenCalledWith(
        expect.anything(),
        PARENT_PROFILE_ID,
        'test-account-id',
        'interests',
        'dinosaurs',
        true,
        undefined
      );
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/learner-profile',
        { headers: { 'X-Profile-Id': PARENT_PROFILE_ID } },
        TEST_ENV
      );

      expect(res.status).toBe(401);
      expect(mockGetOrCreateLearningProfile).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // accommodation-mode self route
  // -------------------------------------------------------------------------

  describe('PATCH /learner-profile/accommodation-mode (self)', () => {
    it('returns 200 and calls updateAccommodationMode with valid mode', async () => {
      const res = await app.request(
        '/v1/learner-profile/accommodation-mode',
        {
          method: 'PATCH',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ accommodationMode: 'short-burst' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockUpdateAccommodationMode).toHaveBeenCalledWith(
        expect.anything(),
        PARENT_PROFILE_ID,
        'test-account-id',
        'short-burst'
      );
      expect(mockFindFamilyLink).not.toHaveBeenCalled();
    });

    it('returns 400 when accommodationMode is not a valid enum value', async () => {
      const res = await app.request(
        '/v1/learner-profile/accommodation-mode',
        {
          method: 'PATCH',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ accommodationMode: 'invalid-mode' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
      expect(mockUpdateAccommodationMode).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // accommodation-mode parent route
  // -------------------------------------------------------------------------

  describe('PATCH /learner-profile/:profileId/accommodation-mode (parent)', () => {
    it('returns 200 and calls updateAccommodationMode for linked child', async () => {
      mockFindFamilyLink.mockResolvedValue({
        parentProfileId: PARENT_PROFILE_ID,
        childProfileId: OWN_CHILD_PROFILE_ID,
      });

      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}/accommodation-mode`,
        {
          method: 'PATCH',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ accommodationMode: 'audio-first' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(mockUpdateAccommodationMode).toHaveBeenCalledWith(
        expect.anything(),
        OWN_CHILD_PROFILE_ID,
        undefined,
        'audio-first'
      );
    });

    it('returns 403 for non-linked child', async () => {
      mockFindFamilyLink.mockResolvedValue(undefined);

      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}/accommodation-mode`,
        {
          method: 'PATCH',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ accommodationMode: 'predictable' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(403);
      expect(mockUpdateAccommodationMode).not.toHaveBeenCalled();
    });
  });
});
