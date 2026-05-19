// ---------------------------------------------------------------------------
// progress.ts — runtime jsonb validation (BUG-220)
//
// The coaching_card_cache table stores its UI state as JSONB. Drizzle's
// $type<…>() is TypeScript-only; the column will happily accept any shape
// at runtime. The break tests below pin the runtime validation contract:
// the parser must REJECT malformed jsonb so consumers fall back to a fresh
// default rather than crashing several call sites later.
// ---------------------------------------------------------------------------

import {
  HOME_SURFACE_CACHE_KIND,
  coachingCardCacheDataSchema,
  coachingCardPendingCelebrationsSchema,
  parseCoachingCardCacheData,
} from '@eduagent/schemas';
import { coachingCardCache } from './progress.js';

describe('coachingCardCache schema (BUG-220)', () => {
  it('declares cardData as jsonb', () => {
    expect(coachingCardCache).toHaveProperty('cardData');
    // Drizzle pgTable columns expose `.dataType`; jsonb resolves to 'json'.
    const column = coachingCardCache.cardData as unknown as {
      dataType: string;
    };
    expect(column.dataType).toBe('json');
  });

  it('declares pendingCelebrations as jsonb', () => {
    expect(coachingCardCache).toHaveProperty('pendingCelebrations');
    const column = coachingCardCache.pendingCelebrations as unknown as {
      dataType: string;
    };
    expect(column.dataType).toBe('json');
  });
});

describe('parseCoachingCardCacheData (BUG-220)', () => {
  const validData = {
    kind: HOME_SURFACE_CACHE_KIND,
    cachedAt: new Date().toISOString(),
    rankedHomeCards: [],
    interactionStats: {
      tapsByCardId: {},
      dismissalsByCardId: {},
      events: [],
    },
  };

  it('accepts a well-formed payload', () => {
    const parsed = parseCoachingCardCacheData(validData);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe(HOME_SURFACE_CACHE_KIND);
  });

  // ---------------------------------------------------------------------------
  // BREAK TEST — malformed jsonb must be rejected (parser returns null).
  // Reverting the schema to a permissive `z.unknown()` would flip these to
  // green, signalling the fix has been removed.
  // ---------------------------------------------------------------------------

  it('rejects payload missing the kind discriminator', () => {
    const { kind: _kind, ...withoutKind } = validData;
    void _kind;
    expect(parseCoachingCardCacheData(withoutKind)).toBeNull();
  });

  it('rejects payload with the wrong kind literal', () => {
    expect(
      parseCoachingCardCacheData({ ...validData, kind: 'home_surface_v0' }),
    ).toBeNull();
  });

  it('rejects payload where cachedAt is a number instead of a string', () => {
    expect(
      parseCoachingCardCacheData({ ...validData, cachedAt: 1700000000000 }),
    ).toBeNull();
  });

  it('rejects null / primitive / array payloads', () => {
    expect(parseCoachingCardCacheData(null)).toBeNull();
    expect(parseCoachingCardCacheData('not-an-object')).toBeNull();
    expect(parseCoachingCardCacheData([])).toBeNull();
  });

  it('accepts payload that omits the optional legacyCoachingCard', () => {
    const parsed = parseCoachingCardCacheData(validData);
    expect(parsed?.legacyCoachingCard).toBeUndefined();
  });
});

describe('coachingCardPendingCelebrationsSchema (BUG-220)', () => {
  it('accepts an empty array', () => {
    expect(coachingCardPendingCelebrationsSchema.safeParse([]).success).toBe(
      true,
    );
  });

  it('rejects a non-array payload', () => {
    expect(coachingCardPendingCelebrationsSchema.safeParse({}).success).toBe(
      false,
    );
    expect(
      coachingCardPendingCelebrationsSchema.safeParse('celebration').success,
    ).toBe(false);
  });

  it('rejects a celebration row missing required fields', () => {
    const result = coachingCardPendingCelebrationsSchema.safeParse([
      { celebration: 'polar_star' }, // missing reason + queuedAt
    ]);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Schema export shape — guarantees parseCoachingCardCacheData stays exported
// from the schemas barrel so consumers cannot deep-import and miss the
// parser refactor.
// ---------------------------------------------------------------------------

describe('coachingCardCacheDataSchema export shape', () => {
  it('exposes the schema and the parser from @eduagent/schemas', () => {
    expect(coachingCardCacheDataSchema).toBeDefined();
    expect(typeof parseCoachingCardCacheData).toBe('function');
  });
});
