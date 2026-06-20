import {
  scopeDescriptorSchema,
  scopeKindSchema,
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
