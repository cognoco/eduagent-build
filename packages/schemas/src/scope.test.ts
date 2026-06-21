import {
  scopeDescriptorSchema,
  scopeKindSchema,
  supporterColdStartSchema,
  supporterScopeListSchema,
} from './scope.js';

const personScope = {
  kind: 'person' as const,
  personId: '00000000-0000-4000-8000-000000000001',
  edgeId: '00000000-0000-4000-8000-000000000002',
  displayName: 'Emma',
};

describe('scope schemas', () => {
  it('defines the S4 scope kinds', () => {
    expect(scopeKindSchema.options).toEqual(['supporter-hub', 'person', 'me']);
  });

  it('parses hub, person, and me descriptors', () => {
    expect(scopeDescriptorSchema.parse({ kind: 'supporter-hub' })).toEqual({
      kind: 'supporter-hub',
    });
    expect(scopeDescriptorSchema.parse(personScope)).toEqual(personScope);
    expect(scopeDescriptorSchema.parse({ kind: 'me' })).toEqual({
      kind: 'me',
    });
  });

  it('keeps learner shape chipless with no default index', () => {
    expect(supporterScopeListSchema.parse({ shape: 'learner' })).toEqual({
      shape: 'learner',
    });
    expect(
      supporterScopeListSchema.parse({
        shape: 'learner',
        defaultScopeIndex: null,
      }),
    ).toEqual({ shape: 'learner', defaultScopeIndex: null });
    expect(() =>
      supporterScopeListSchema.parse({
        shape: 'learner',
        scopes: [{ kind: 'me' }],
        defaultScopeIndex: 0,
      }),
    ).toThrow();
  });

  it('requires supporter defaultScopeIndex to point inside scopes', () => {
    const scopes = [{ kind: 'supporter-hub' as const }, personScope];

    expect(
      supporterScopeListSchema.parse({
        shape: 'supporter',
        scopes,
        defaultScopeIndex: 1,
      }),
    ).toEqual({ shape: 'supporter', scopes, defaultScopeIndex: 1 });

    expect(() =>
      supporterScopeListSchema.parse({
        shape: 'supporter',
        scopes,
        defaultScopeIndex: 2,
      }),
    ).toThrow();
  });
});

describe('supporter cold-start schema', () => {
  it('parses the variant-zero add-child doorway', () => {
    expect(
      supporterColdStartSchema.parse({
        variant: 'variant-zero',
        cards: [{ state: 'none', anchor: 'add-child' }],
        selfLearningDoorway: true,
      }),
    ).toEqual({
      variant: 'variant-zero',
      cards: [{ state: 'none', anchor: 'add-child' }],
      selfLearningDoorway: true,
    });
  });

  it('parses accepted-edge cold-start cards', () => {
    expect(
      supporterColdStartSchema.parse({
        variant: 'per-child',
        cards: [
          {
            personId: '00000000-0000-4000-8000-000000000101',
            edgeId: '00000000-0000-4000-8000-000000000201',
            displayName: 'Emma',
            state: 'granted-idle',
            anchor: 'kickstart',
            staleIdleStep: 2,
          },
        ],
        selfLearningDoorway: true,
      }).cards[0],
    ).toEqual({
      personId: '00000000-0000-4000-8000-000000000101',
      edgeId: '00000000-0000-4000-8000-000000000201',
      displayName: 'Emma',
      state: 'granted-idle',
      anchor: 'kickstart',
      staleIdleStep: 2,
    });
  });

  it('keeps pending-link cards separate from accepted supportership edges', () => {
    expect(
      supporterColdStartSchema.parse({
        variant: 'per-child',
        cards: [
          {
            pendingLinkId: '00000000-0000-4000-8000-000000000301',
            displayName: 'Emma',
            state: 'consent-pending',
            anchor: 'approve',
          },
        ],
        selfLearningDoorway: true,
      }).cards[0],
    ).toEqual({
      pendingLinkId: '00000000-0000-4000-8000-000000000301',
      displayName: 'Emma',
      state: 'consent-pending',
      anchor: 'approve',
    });

    expect(() =>
      supporterColdStartSchema.parse({
        variant: 'per-child',
        cards: [
          {
            edgeId: '00000000-0000-4000-8000-000000000201',
            displayName: 'Emma',
            state: 'consent-pending',
            anchor: 'approve',
          },
        ],
        selfLearningDoorway: true,
      }),
    ).toThrow();
  });

  it('rejects stale-idle state on non-kickstart cards', () => {
    expect(() =>
      supporterColdStartSchema.parse({
        variant: 'per-child',
        cards: [
          {
            personId: '00000000-0000-4000-8000-000000000101',
            edgeId: '00000000-0000-4000-8000-000000000201',
            displayName: 'Emma',
            state: 'managed',
            anchor: 'handoff',
            staleIdleStep: 1,
          },
        ],
        selfLearningDoorway: true,
      }),
    ).toThrow();
  });
});
