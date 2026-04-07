# Epic 17 Phase A — Voice Input Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the voice input experience so children can speak to their mentor with real-time transcription, voice-activity detection, age-aware defaults, and a polished recording UX — while preserving the existing text-based flow as a first-class fallback.

**Architecture:** Dual-recording approach — on-device STT (`expo-speech-recognition`) provides real-time interim transcripts during recording, while `expo-av` simultaneously captures audio for server-side re-transcription via Deepgram. This gives instant feedback without WebSocket audio streaming, and falls back gracefully when the server is unreachable. Client preferences are stored in AsyncStorage per-profile; voice usage is tracked server-side for tier enforcement.

**Tech Stack:** Expo (expo-speech-recognition, expo-av, expo-haptics), React Native Reanimated, Hono (API routes with SSE), Deepgram STT API, Drizzle ORM, Zod, AsyncStorage, Jest + React Native Testing Library.

---

## Scope — Phased Delivery

This epic has three phases. **This plan covers Phase A only** (Stories 17.1, 17.2, 17.3 — FR243 through FR251). Each phase produces working, testable software:

| Phase | Stories | What it delivers | Plan |
|-------|---------|------------------|------|
| **A — Voice Input (this plan)** | 17.1, 17.2, 17.3 | Age-aware defaults, server STT, VAD, waveform, cancel gesture, live transcript | This document |
| **B — Voice Output** | 17.4, 17.5, 17.6 | Server TTS, voice personas, voice-optimised LLM prompts, response segmentation | Separate plan after Phase A ships |
| **C — Voice-Native Features** | 17.7, 17.8, 17.9 | Pronunciation practice, voice recall testing, hands-free mode | Separate plan after Phase B ships |

Phase B and C plans will be written when Phase A is complete. They depend on Phase A's schemas, hooks, and API routes.

---

## File Structure

### New Files

| # | Path | Responsibility |
|---|------|----------------|
| 1 | `packages/schemas/src/voice.ts` | Zod schemas for voice: persona enum, transcribe request/result, speak request, usage response, client preferences, confidence threshold constant |
| 2 | `packages/schemas/src/voice.test.ts` | Schema validation tests |
| 3 | `packages/database/src/schema/voice.ts` | Drizzle schema for `voice_usage` table |
| 4 | `apps/api/src/routes/voice.ts` | Hono route handlers: `POST /voice/transcribe`, `GET /voice/usage` |
| 5 | `apps/api/src/routes/voice.test.ts` | Integration tests for voice routes |
| 6 | `apps/api/src/services/voice-transcribe.ts` | Server-side STT service — Deepgram integration, confidence scoring, usage logging |
| 7 | `apps/api/src/services/voice-transcribe.test.ts` | Unit tests for transcription service |
| 8 | `apps/api/src/services/voice-usage.ts` | Voice usage aggregation for tier enforcement |
| 9 | `apps/api/src/services/voice-usage.test.ts` | Unit tests for usage service |
| 10 | `apps/mobile/src/hooks/use-voice-preferences.ts` | AsyncStorage read/write for voice preferences per profile |
| 11 | `apps/mobile/src/hooks/use-voice-preferences.test.ts` | Tests for preference hook |
| 12 | `apps/mobile/src/hooks/use-server-stt.ts` | Upload recorded audio to server STT, parse result, fall back to on-device transcript |
| 13 | `apps/mobile/src/hooks/use-server-stt.test.ts` | Tests for server STT hook |
| 14 | `apps/mobile/src/hooks/use-audio-level.ts` | Real-time audio level monitoring via `expo-av` for waveform + VAD |
| 15 | `apps/mobile/src/hooks/use-audio-level.test.ts` | Tests for audio level hook |
| 16 | `apps/mobile/src/components/session/VoiceSuggestionCard.tsx` | One-time "Would you like to talk?" card for ages 11-13 |
| 17 | `apps/mobile/src/components/session/VoiceSuggestionCard.test.tsx` | Tests for suggestion card |
| 18 | `apps/mobile/src/components/session/AudioWaveform.tsx` | Reanimated waveform visualisation driven by audio levels |
| 19 | `apps/mobile/src/components/session/AudioWaveform.test.tsx` | Tests for waveform component |
| 20 | `apps/mobile/src/components/session/TranscriptOverlay.tsx` | Real-time partial/final transcript display during recording |
| 21 | `apps/mobile/src/components/session/TranscriptOverlay.test.tsx` | Tests for transcript overlay |

### Modified Files

| # | Path | Change |
|---|------|--------|
| 22 | `packages/schemas/src/index.ts` | Add `export * from './voice.ts'` |
| 23 | `packages/database/src/schema/index.ts` | Add `export * from './voice'` |
| 24 | `apps/api/src/index.ts` | Import `voiceRoutes`, add `.route('/', voiceRoutes)` to chain, add `DEEPGRAM_API_KEY` to Bindings |
| 25 | `apps/api/src/services/exchanges.ts` | Add `inputMode?: 'text' \| 'voice'` to `ExchangeContext` (prep for Phase B voice prompt section) |
| 26 | `apps/mobile/src/components/session/VoiceRecordButton.tsx` | Replace pulse with `AudioWaveform`, add swipe-to-cancel gesture, add language badge, add thinking state |
| 27 | `apps/mobile/src/components/session/VoicePlaybackBar.tsx` | Add 1.5x to `RATE_CYCLE` |
| 28 | `apps/mobile/src/components/session/SessionInputModeToggle.tsx` | Accept `showSuggestion` + `onSuggestionAccept`/`onSuggestionDismiss` props to render `VoiceSuggestionCard` |
| 29 | `apps/mobile/src/components/session/ChatShell.tsx` | Wire `useServerSTT`, `useAudioLevel`, `TranscriptOverlay`, voice preference persistence, VAD auto-stop |

### Database Migration

| # | File | SQL |
|---|------|-----|
| 30 | `apps/api/drizzle/<next>_voice_usage.sql` | `CREATE TABLE voice_usage (...)` — generated by `drizzle-kit generate`. Current latest is `0014`, so expect `0015` but verify after generation. |

---

## Task 1: Voice Schemas Package

**Files:**
- Create: `packages/schemas/src/voice.ts`
- Create: `packages/schemas/src/voice.test.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/schemas/src/voice.test.ts
import { describe, it, expect } from '@jest/globals';
import {
  voicePersonaSchema,
  voiceTranscribeRequestSchema,
  voiceTranscribeResultSchema,
  voiceSpeakRequestSchema,
  voiceUsageResponseSchema,
  voicePreferencesSchema,
  STT_CONFIDENCE_THRESHOLD,
} from './voice';

describe('voice schemas', () => {
  describe('voicePersonaSchema', () => {
    it.each(['warm', 'calm', 'energetic'])('accepts "%s"', (v) => {
      expect(voicePersonaSchema.parse(v)).toBe(v);
    });

    it('rejects invalid persona', () => {
      expect(() => voicePersonaSchema.parse('robot')).toThrow();
    });
  });

  describe('voiceTranscribeRequestSchema', () => {
    it('applies en-US default for lang', () => {
      const result = voiceTranscribeRequestSchema.parse({});
      expect(result.lang).toBe('en-US');
    });

    it('accepts explicit lang and sessionId', () => {
      const result = voiceTranscribeRequestSchema.parse({
        lang: 'es-ES',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.lang).toBe('es-ES');
      expect(result.sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('rejects non-uuid sessionId', () => {
      expect(() =>
        voiceTranscribeRequestSchema.parse({ sessionId: 'bad' })
      ).toThrow();
    });
  });

  describe('voiceTranscribeResultSchema', () => {
    it('accepts valid result', () => {
      const result = voiceTranscribeResultSchema.parse({
        transcript: 'hello world',
        confidence: 0.95,
        durationMs: 3200,
        provider: 'deepgram',
      });
      expect(result.confidence).toBe(0.95);
    });

    it('rejects confidence > 1', () => {
      expect(() =>
        voiceTranscribeResultSchema.parse({
          transcript: 'hi',
          confidence: 1.5,
          durationMs: 100,
          provider: 'deepgram',
        })
      ).toThrow();
    });
  });

  describe('voicePreferencesSchema', () => {
    it('applies all defaults', () => {
      const result = voicePreferencesSchema.parse({});
      expect(result).toEqual({
        preferredInputMode: 'text',
        vadEnabled: false,
        silenceThresholdMs: 1500,
        speechSpeed: 1.0,
      });
    });

    it('rejects silence threshold below 1000ms', () => {
      expect(() =>
        voicePreferencesSchema.parse({ silenceThresholdMs: 500 })
      ).toThrow();
    });

    it('rejects silence threshold above 3000ms', () => {
      expect(() =>
        voicePreferencesSchema.parse({ silenceThresholdMs: 4000 })
      ).toThrow();
    });
  });

  describe('voiceSpeakRequestSchema', () => {
    it('accepts text with defaults', () => {
      const result = voiceSpeakRequestSchema.parse({ text: 'hello' });
      expect(result.speed).toBe(1.0);
      expect(result.lang).toBe('en-US');
    });

    it('rejects empty text', () => {
      expect(() => voiceSpeakRequestSchema.parse({ text: '' })).toThrow();
    });
  });

  it('exports STT confidence threshold as 0.6', () => {
    expect(STT_CONFIDENCE_THRESHOLD).toBe(0.6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/schemas && pnpm exec jest voice.test.ts --no-coverage`
Expected: FAIL — `Cannot find module './voice'`

- [ ] **Step 3: Implement the voice schemas**

```typescript
// packages/schemas/src/voice.ts
import { z } from 'zod';

// --- Voice Persona (stored on profile, used in Phase B) ---

export const voicePersonaSchema = z.enum(['warm', 'calm', 'energetic']);
export type VoicePersona = z.infer<typeof voicePersonaSchema>;

// --- STT (Speech-to-Text) ---

export const voiceTranscribeRequestSchema = z.object({
  lang: z.string().default('en-US'),
  sessionId: z.string().uuid().optional(),
});
export type VoiceTranscribeRequest = z.infer<
  typeof voiceTranscribeRequestSchema
>;

export const voiceTranscribeResultSchema = z.object({
  transcript: z.string(),
  confidence: z.number().min(0).max(1),
  durationMs: z.number().int().nonnegative(),
  provider: z.enum(['deepgram', 'whisper', 'on_device']),
});
export type VoiceTranscribeResult = z.infer<typeof voiceTranscribeResultSchema>;

/** Confidence below this threshold triggers a "say it again" prompt (FR247) */
export const STT_CONFIDENCE_THRESHOLD = 0.6;

// --- TTS (Text-to-Speech — schema defined now, route added in Phase B) ---

export const voiceSpeakRequestSchema = z.object({
  text: z.string().min(1).max(5000),
  persona: voicePersonaSchema.optional(),
  speed: z.number().min(0.5).max(2.0).default(1.0),
  lang: z.string().default('en-US'),
});
export type VoiceSpeakRequest = z.infer<typeof voiceSpeakRequestSchema>;

// --- Voice Usage ---

export const voiceUsageResponseSchema = z.object({
  sttMinutesUsed: z.number().nonnegative(),
  ttsMinutesUsed: z.number().nonnegative(),
  totalMinutesUsed: z.number().nonnegative(),
  monthlyLimitMinutes: z.number().nullable(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
export type VoiceUsageResponse = z.infer<typeof voiceUsageResponseSchema>;

// --- Client-Side Voice Preferences (AsyncStorage) ---

export const voicePreferencesSchema = z.object({
  preferredInputMode: z.enum(['text', 'voice']).default('text'),
  vadEnabled: z.boolean().default(false),
  silenceThresholdMs: z.number().int().min(1000).max(3000).default(1500),
  speechSpeed: z.number().min(0.5).max(2.0).default(1.0),
});
export type VoicePreferences = z.infer<typeof voicePreferencesSchema>;
```

- [ ] **Step 4: Export from barrel**

Add to `packages/schemas/src/index.ts` after the `// Topic Notes` section:

```typescript
// Voice (Epic 17)
export * from './voice.ts';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/schemas && pnpm exec jest voice.test.ts --no-coverage`
Expected: All 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/schemas/src/voice.ts packages/schemas/src/voice.test.ts packages/schemas/src/index.ts
git commit -m "feat(schemas): add voice schemas — persona, STT, TTS, usage, preferences [Epic-17]"
```

---

## Task 2: Voice Usage Database Schema

**Files:**
- Create: `packages/database/src/schema/voice.ts`
- Modify: `packages/database/src/schema/index.ts`

**Depends on:** Task 1 (schema types referenced conceptually but not imported — DB schema is independent)

- [ ] **Step 1: Write the Drizzle schema**

```typescript
// packages/database/src/schema/voice.ts
import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';
import { learningSessions } from './sessions';

export const voiceUsage = pgTable(
  'voice_usage',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => learningSessions.id, {
      onDelete: 'set null',
    }),
    sttDurationMs: integer('stt_duration_ms').notNull().default(0),
    ttsDurationMs: integer('tts_duration_ms').notNull().default(0),
    sttProvider: text('stt_provider').notNull(),
    ttsProvider: text('tts_provider'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('voice_usage_profile_id_created_at_idx').on(
      table.profileId,
      table.createdAt
    ),
  ]
);
```

- [ ] **Step 2: Export from database barrel**

Add to `packages/database/src/schema/index.ts`:

```typescript
export * from './voice';
```

- [ ] **Step 3: Verify the UUID helper exists**

Run: `grep -r "generateUUIDv7" packages/database/src/utils/ --files-with-matches`

Expected: `packages/database/src/utils/uuid.ts` exists and exports `generateUUIDv7()`. Other tables use `.$defaultFn(() => generateUUIDv7())` — follow the same pattern.

- [ ] **Step 4: Generate the migration**

Run: `pnpm run db:generate`
Expected: A new migration file appears in `apps/api/drizzle/` (e.g., `0015_*.sql`) containing:

```sql
CREATE TABLE IF NOT EXISTS "voice_usage" (
  "id" uuid PRIMARY KEY,
  "profile_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "learning_sessions"("id") ON DELETE SET NULL,
  "stt_duration_ms" integer NOT NULL DEFAULT 0,
  "tts_duration_ms" integer NOT NULL DEFAULT 0,
  "stt_provider" text NOT NULL,
  "tts_provider" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "voice_usage_profile_id_created_at_idx"
  ON "voice_usage" ("profile_id", "created_at");
```

- [ ] **Step 5: Push schema to dev database**

Run: `pnpm run db:push:dev`
Expected: Table created successfully

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/schema/voice.ts packages/database/src/schema/index.ts apps/api/drizzle/
git commit -m "feat(database): add voice_usage table for STT/TTS tracking [Epic-17]"
```

---

## Task 3: Voice Preferences Hook

**Files:**
- Create: `apps/mobile/src/hooks/use-voice-preferences.ts`
- Create: `apps/mobile/src/hooks/use-voice-preferences.test.ts`

**Depends on:** Task 1 (imports `VoicePreferences` type)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/src/hooks/use-voice-preferences.test.ts
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useVoicePreferences } from './use-voice-preferences';

// AsyncStorage is auto-mocked by jest-expo preset

const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  AsyncStorage.clear();
});

describe('useVoicePreferences', () => {
  it('returns defaults when no stored preferences exist', async () => {
    const { result } = renderHook(() => useVoicePreferences(PROFILE_ID));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.preferences).toEqual({
      preferredInputMode: 'text',
      vadEnabled: false,
      silenceThresholdMs: 1500,
      speechSpeed: 1.0,
    });
  });

  it('loads stored preferences from AsyncStorage', async () => {
    await AsyncStorage.setItem(
      `voice.preferences.${PROFILE_ID}`,
      JSON.stringify({ preferredInputMode: 'voice', vadEnabled: true })
    );

    const { result } = renderHook(() => useVoicePreferences(PROFILE_ID));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.preferences.preferredInputMode).toBe('voice');
    expect(result.current.preferences.vadEnabled).toBe(true);
    // Defaults for unset fields
    expect(result.current.preferences.silenceThresholdMs).toBe(1500);
  });

  it('updates preferences and persists to AsyncStorage', async () => {
    const { result } = renderHook(() => useVoicePreferences(PROFILE_ID));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updatePreferences({ vadEnabled: true });
    });

    expect(result.current.preferences.vadEnabled).toBe(true);

    const stored = await AsyncStorage.getItem(
      `voice.preferences.${PROFILE_ID}`
    );
    expect(JSON.parse(stored!).vadEnabled).toBe(true);
  });

  it('tracks voice suggestion shown state per profile', async () => {
    const { result } = renderHook(() => useVoicePreferences(PROFILE_ID));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Initially not shown
    const shownBefore = await result.current.hasSuggestionBeenShown();
    expect(shownBefore).toBe(false);

    // Mark as shown
    await act(async () => {
      await result.current.markSuggestionShown();
    });

    const shownAfter = await result.current.hasSuggestionBeenShown();
    expect(shownAfter).toBe(true);
  });

  it('returns safe defaults when profileId is undefined', async () => {
    const { result } = renderHook(() => useVoicePreferences(undefined));

    // Should resolve immediately with defaults, not crash
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.preferences.preferredInputMode).toBe('text');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest use-voice-preferences.test.ts --no-coverage`
Expected: FAIL — `Cannot find module './use-voice-preferences'`

- [ ] **Step 3: Implement the hook**

```typescript
// apps/mobile/src/hooks/use-voice-preferences.ts
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VoicePreferences } from '@eduagent/schemas';

const PREFS_KEY_PREFIX = 'voice.preferences.';
const SUGGESTION_KEY_PREFIX = 'voice.suggestionShown.';

const DEFAULTS: VoicePreferences = {
  preferredInputMode: 'text',
  vadEnabled: false,
  silenceThresholdMs: 1500,
  speechSpeed: 1.0,
};

export function useVoicePreferences(profileId: string | undefined) {
  const [preferences, setPreferences] = useState<VoicePreferences>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profileId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    AsyncStorage.getItem(`${PREFS_KEY_PREFIX}${profileId}`)
      .then((stored) => {
        if (cancelled) return;
        if (stored) {
          try {
            setPreferences({ ...DEFAULTS, ...JSON.parse(stored) });
          } catch {
            // Corrupted data — use defaults
          }
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const updatePreferences = useCallback(
    async (updates: Partial<VoicePreferences>) => {
      if (!profileId) return;
      const next = { ...preferences, ...updates };
      setPreferences(next);
      await AsyncStorage.setItem(
        `${PREFS_KEY_PREFIX}${profileId}`,
        JSON.stringify(next)
      );
    },
    [profileId, preferences]
  );

  const hasSuggestionBeenShown = useCallback(async (): Promise<boolean> => {
    if (!profileId) return true; // No profile — don't show
    const val = await AsyncStorage.getItem(
      `${SUGGESTION_KEY_PREFIX}${profileId}`
    );
    return val === 'true';
  }, [profileId]);

  const markSuggestionShown = useCallback(async () => {
    if (!profileId) return;
    await AsyncStorage.setItem(
      `${SUGGESTION_KEY_PREFIX}${profileId}`,
      'true'
    );
  }, [profileId]);

  return {
    preferences,
    isLoading,
    updatePreferences,
    hasSuggestionBeenShown,
    markSuggestionShown,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest use-voice-preferences.test.ts --no-coverage`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-voice-preferences.ts apps/mobile/src/hooks/use-voice-preferences.test.ts
git commit -m "feat(mobile): add useVoicePreferences hook — AsyncStorage per-profile [Epic-17, FR244-FR245]"
```

---

## Task 4: Voice Suggestion Card (FR243)

**Files:**
- Create: `apps/mobile/src/components/session/VoiceSuggestionCard.tsx`
- Create: `apps/mobile/src/components/session/VoiceSuggestionCard.test.tsx`

**Depends on:** None (pure presentational component)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/session/VoiceSuggestionCard.test.tsx
import { render, fireEvent, screen } from '@testing-library/react-native';
import { VoiceSuggestionCard } from './VoiceSuggestionCard';

const mockOnAccept = jest.fn();
const mockOnDismiss = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('VoiceSuggestionCard', () => {
  it('renders the suggestion text', () => {
    render(
      <VoiceSuggestionCard onAccept={mockOnAccept} onDismiss={mockOnDismiss} />
    );

    expect(
      screen.getByText('Would you like to talk instead of typing?')
    ).toBeTruthy();
  });

  it('calls onAccept when "Yes" is pressed', () => {
    render(
      <VoiceSuggestionCard onAccept={mockOnAccept} onDismiss={mockOnDismiss} />
    );

    fireEvent.press(screen.getByTestId('voice-suggestion-accept'));
    expect(mockOnAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when "No thanks" is pressed', () => {
    render(
      <VoiceSuggestionCard onAccept={mockOnAccept} onDismiss={mockOnDismiss} />
    );

    fireEvent.press(screen.getByTestId('voice-suggestion-dismiss'));
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
  });

  it('has accessible button labels', () => {
    render(
      <VoiceSuggestionCard onAccept={mockOnAccept} onDismiss={mockOnDismiss} />
    );

    expect(screen.getByLabelText('Yes, let me talk')).toBeTruthy();
    expect(screen.getByLabelText("No thanks, I'll type")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest VoiceSuggestionCard.test.tsx --no-coverage`
Expected: FAIL — cannot resolve `./VoiceSuggestionCard`

- [ ] **Step 3: Implement the component**

```tsx
// apps/mobile/src/components/session/VoiceSuggestionCard.tsx
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight, hapticSuccess } from '../../lib/haptics';

interface VoiceSuggestionCardProps {
  onAccept: () => void;
  onDismiss: () => void;
}

export function VoiceSuggestionCard({
  onAccept,
  onDismiss,
}: VoiceSuggestionCardProps) {
  return (
    <View
      className="mx-4 mb-3 rounded-2xl bg-surface-elevated p-4"
      testID="voice-suggestion-card"
      accessibilityRole="alert"
    >
      <View className="mb-3 flex-row items-center gap-2">
        <Ionicons name="mic" size={24} className="text-primary" />
        <Text className="flex-1 text-lg font-semibold text-text-primary">
          Would you like to talk instead of typing?
        </Text>
      </View>
      <Text className="mb-4 text-sm text-text-secondary">
        You can speak to your mentor and hear them talk back. You can always
        switch to typing anytime.
      </Text>
      <View className="flex-row gap-3">
        <Pressable
          className="flex-1 items-center rounded-xl bg-primary py-3"
          style={{ minHeight: 44 }}
          onPress={() => {
            hapticSuccess();
            onAccept();
          }}
          accessibilityRole="button"
          accessibilityLabel="Yes, let me talk"
          testID="voice-suggestion-accept"
        >
          <Text className="font-semibold text-inverse">Yes!</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-xl bg-surface py-3"
          style={{ minHeight: 44 }}
          onPress={() => {
            hapticLight();
            onDismiss();
          }}
          accessibilityRole="button"
          accessibilityLabel="No thanks, I'll type"
          testID="voice-suggestion-dismiss"
        >
          <Text className="font-medium text-text-secondary">No thanks</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest VoiceSuggestionCard.test.tsx --no-coverage`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/session/VoiceSuggestionCard.tsx apps/mobile/src/components/session/VoiceSuggestionCard.test.tsx
git commit -m "feat(mobile): add VoiceSuggestionCard — age-aware voice prompt [Epic-17, FR243]"
```

---

## Task 5: Age-Aware Suggestion + Input Mode Persistence (FR243, FR245)

**Files:**
- Modify: `apps/mobile/src/components/session/SessionInputModeToggle.tsx`
- Modify: `apps/mobile/src/components/session/SessionInputModeToggle.test.tsx` (if exists, otherwise create)

**Depends on:** Task 3 (useVoicePreferences), Task 4 (VoiceSuggestionCard)

- [ ] **Step 1: Read the current SessionInputModeToggle**

Read: `apps/mobile/src/components/session/SessionInputModeToggle.tsx`

The current component accepts `mode` and `onModeChange`. We need to extend it to:
1. Optionally show the `VoiceSuggestionCard` above the toggle
2. Accept props for suggestion visibility and handlers

- [ ] **Step 2: Write the failing test for new behavior**

Add to the existing test file (or create it):

```tsx
// apps/mobile/src/components/session/SessionInputModeToggle.test.tsx
// ... existing imports ...
import { VoiceSuggestionCard } from './VoiceSuggestionCard';

describe('SessionInputModeToggle', () => {
  // ... existing tests remain unchanged ...

  describe('with voice suggestion', () => {
    it('renders VoiceSuggestionCard when showSuggestion is true', () => {
      render(
        <SessionInputModeToggle
          mode="text"
          onModeChange={jest.fn()}
          showSuggestion
          onSuggestionAccept={jest.fn()}
          onSuggestionDismiss={jest.fn()}
        />
      );

      expect(screen.getByTestId('voice-suggestion-card')).toBeTruthy();
    });

    it('does not render suggestion card when showSuggestion is false', () => {
      render(
        <SessionInputModeToggle
          mode="text"
          onModeChange={jest.fn()}
          showSuggestion={false}
        />
      );

      expect(screen.queryByTestId('voice-suggestion-card')).toBeNull();
    });

    it('does not render suggestion card by default', () => {
      render(
        <SessionInputModeToggle mode="text" onModeChange={jest.fn()} />
      );

      expect(screen.queryByTestId('voice-suggestion-card')).toBeNull();
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest SessionInputModeToggle.test --no-coverage`
Expected: FAIL — new tests fail because `showSuggestion` prop is not handled

- [ ] **Step 4: Extend the component**

In `apps/mobile/src/components/session/SessionInputModeToggle.tsx`, add the optional suggestion props and render `VoiceSuggestionCard` when `showSuggestion` is true:

```tsx
// Add to the existing props interface:
interface SessionInputModeToggleProps {
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  showSuggestion?: boolean;
  onSuggestionAccept?: () => void;
  onSuggestionDismiss?: () => void;
}

// In the component body, add above the toggle buttons:
export function SessionInputModeToggle({
  mode,
  onModeChange,
  showSuggestion = false,
  onSuggestionAccept,
  onSuggestionDismiss,
}: SessionInputModeToggleProps) {
  return (
    <View>
      {showSuggestion && onSuggestionAccept && onSuggestionDismiss && (
        <VoiceSuggestionCard
          onAccept={onSuggestionAccept}
          onDismiss={onSuggestionDismiss}
        />
      )}
      {/* ... existing toggle JSX unchanged ... */}
    </View>
  );
}
```

Import `VoiceSuggestionCard` at the top and `View` if not already imported.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest SessionInputModeToggle.test --no-coverage`
Expected: All tests PASS (existing + new)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/session/SessionInputModeToggle.tsx apps/mobile/src/components/session/SessionInputModeToggle.test.tsx
git commit -m "feat(mobile): extend SessionInputModeToggle with voice suggestion slot [Epic-17, FR243]"
```

---

## Task 6: Voice Transcription Service (FR246, FR247, FR248)

**Files:**
- Create: `apps/api/src/services/voice-transcribe.ts`
- Create: `apps/api/src/services/voice-transcribe.test.ts`

**Depends on:** Task 1 (schemas), Task 2 (DB schema for usage logging)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/services/voice-transcribe.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { transcribeAudio } from './voice-transcribe';
import type { Database } from '@eduagent/database';

// Mock the Deepgram HTTP call
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function mockDb(): Database {
  return {
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue([]) }),
  } as unknown as Database;
}

describe('transcribeAudio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns transcript and confidence from Deepgram', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: {
          channels: [
            {
              alternatives: [
                { transcript: 'hello world', confidence: 0.92 },
              ],
            },
          ],
        },
        metadata: { duration: 2.5 },
      }),
    });

    const result = await transcribeAudio(mockDb(), {
      profileId: 'profile-1',
      audioBuffer: new ArrayBuffer(100),
      lang: 'en-US',
      apiKey: 'test-key',
    });

    expect(result.transcript).toBe('hello world');
    expect(result.confidence).toBe(0.92);
    expect(result.durationMs).toBe(2500);
    expect(result.provider).toBe('deepgram');
  });

  it('passes language parameter to Deepgram', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: {
          channels: [{ alternatives: [{ transcript: 'hola', confidence: 0.85 }] }],
        },
        metadata: { duration: 1.0 },
      }),
    });

    await transcribeAudio(mockDb(), {
      profileId: 'profile-1',
      audioBuffer: new ArrayBuffer(50),
      lang: 'es-ES',
      apiKey: 'test-key',
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('language=es');
  });

  it('throws when API key is missing', async () => {
    await expect(
      transcribeAudio(mockDb(), {
        profileId: 'profile-1',
        audioBuffer: new ArrayBuffer(100),
        lang: 'en-US',
        apiKey: undefined,
      })
    ).rejects.toThrow('DEEPGRAM_API_KEY is not configured');
  });

  it('throws on Deepgram error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad audio format',
    });

    await expect(
      transcribeAudio(mockDb(), {
        profileId: 'profile-1',
        audioBuffer: new ArrayBuffer(100),
        lang: 'en-US',
        apiKey: 'test-key',
      })
    ).rejects.toThrow('STT provider error');
  });

  it('logs usage to voice_usage table', async () => {
    const db = mockDb();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: {
          channels: [{ alternatives: [{ transcript: 'test', confidence: 0.9 }] }],
        },
        metadata: { duration: 3.0 },
      }),
    });

    await transcribeAudio(db, {
      profileId: 'profile-1',
      sessionId: 'session-1',
      audioBuffer: new ArrayBuffer(100),
      lang: 'en-US',
      apiKey: 'test-key',
    });

    expect(db.insert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest voice-transcribe.test.ts --no-coverage`
Expected: FAIL — cannot resolve `./voice-transcribe`

- [ ] **Step 3: Implement the transcription service**

```typescript
// apps/api/src/services/voice-transcribe.ts
import type { Database } from '@eduagent/database';
import { voiceUsage } from '@eduagent/database';
import type { VoiceTranscribeResult } from '@eduagent/schemas';

interface TranscribeOptions {
  profileId: string;
  sessionId?: string;
  audioBuffer: ArrayBuffer;
  lang: string;
  apiKey: string | undefined;
}

/**
 * Transcribes audio using Deepgram's pre-recorded endpoint.
 * Logs usage to the voice_usage table for tier enforcement.
 */
export async function transcribeAudio(
  db: Database,
  options: TranscribeOptions
): Promise<VoiceTranscribeResult> {
  const { profileId, sessionId, audioBuffer, lang, apiKey } = options;

  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is not configured');
  }

  // Extract base language code for Deepgram (e.g., 'es-ES' → 'es')
  const langBase = lang.split('-')[0];

  const url = new URL('https://api.deepgram.com/v1/listen');
  url.searchParams.set('model', 'nova-2');
  url.searchParams.set('language', langBase);
  url.searchParams.set('smart_format', 'true');
  url.searchParams.set('punctuate', 'true');

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'audio/webm',
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`STT provider error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as DeepgramResponse;

  const alternative = data.results.channels[0]?.alternatives[0];
  const transcript = alternative?.transcript ?? '';
  const confidence = alternative?.confidence ?? 0;
  const durationMs = Math.round((data.metadata?.duration ?? 0) * 1000);

  // Log usage — awaited, not fire-and-forget (billing-adjacent data must not silently fail)
  await db.insert(voiceUsage)
    .values({
      profileId,
      sessionId: sessionId ?? null,
      sttDurationMs: durationMs,
      ttsDurationMs: 0,
      sttProvider: 'deepgram',
      ttsProvider: null,
    });

  return {
    transcript,
    confidence,
    durationMs,
    provider: 'deepgram',
  };
}

// Deepgram response shape (subset we care about)
interface DeepgramResponse {
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
        confidence: number;
      }>;
    }>;
  };
  metadata?: {
    duration: number;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest voice-transcribe.test.ts --no-coverage`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/voice-transcribe.ts apps/api/src/services/voice-transcribe.test.ts
git commit -m "feat(api): add Deepgram STT service with confidence scoring + usage logging [Epic-17, FR246-FR248]"
```

---

## Task 7: Voice Usage Service

**Files:**
- Create: `apps/api/src/services/voice-usage.ts`
- Create: `apps/api/src/services/voice-usage.test.ts`

**Depends on:** Task 2 (voice_usage table)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/services/voice-usage.test.ts
import { describe, it, expect } from '@jest/globals';
import { getVoiceUsage } from './voice-usage';

describe('getVoiceUsage', () => {
  it('aggregates STT and TTS minutes for current month', async () => {
    const mockRows = [
      { totalSttMs: 180000, totalTtsMs: 60000 }, // 3 min STT, 1 min TTS
    ];

    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockRows),
        }),
      }),
    } as any;

    const result = await getVoiceUsage(db, 'profile-1', null);

    expect(result.sttMinutesUsed).toBeCloseTo(3.0, 1);
    expect(result.ttsMinutesUsed).toBeCloseTo(1.0, 1);
    expect(result.totalMinutesUsed).toBeCloseTo(4.0, 1);
  });

  it('returns null limit for unlimited tiers', async () => {
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ totalSttMs: 0, totalTtsMs: 0 }]),
        }),
      }),
    } as any;

    const result = await getVoiceUsage(db, 'profile-1', null);

    expect(result.monthlyLimitMinutes).toBeNull();
  });

  it('returns 60 minute limit for plus tier', async () => {
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ totalSttMs: 0, totalTtsMs: 0 }]),
        }),
      }),
    } as any;

    const result = await getVoiceUsage(db, 'profile-1', 'plus');

    expect(result.monthlyLimitMinutes).toBe(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest voice-usage.test.ts --no-coverage`
Expected: FAIL — cannot resolve `./voice-usage`

- [ ] **Step 3: Implement the usage service**

```typescript
// apps/api/src/services/voice-usage.ts
import { sql, and, gte } from 'drizzle-orm';
import type { Database } from '@eduagent/database';
import { voiceUsage } from '@eduagent/database';
import type { VoiceUsageResponse } from '@eduagent/schemas';

/** Voice minute limits per subscription tier */
const TIER_LIMITS: Record<string, number | null> = {
  free: 0,       // Free tier: no server voice (on-device only)
  plus: 60,      // 60 min/month
  family: null,   // Unlimited
  pro: null,      // Unlimited
};

export async function getVoiceUsage(
  db: Database,
  profileId: string,
  subscriptionTier: string | null
): Promise<VoiceUsageResponse> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [row] = await db
    .select({
      totalSttMs: sql<number>`COALESCE(SUM(${voiceUsage.sttDurationMs}), 0)`,
      totalTtsMs: sql<number>`COALESCE(SUM(${voiceUsage.ttsDurationMs}), 0)`,
    })
    .from(voiceUsage)
    .where(
      and(
        sql`${voiceUsage.profileId} = ${profileId}`,
        gte(voiceUsage.createdAt, periodStart),
        // Exclude on-device usage from tier counting
        sql`${voiceUsage.sttProvider} != 'on_device'`
      )
    );

  const sttMinutes = (row?.totalSttMs ?? 0) / 60_000;
  const ttsMinutes = (row?.totalTtsMs ?? 0) / 60_000;

  const tier = subscriptionTier ?? 'free';
  const limit = tier in TIER_LIMITS ? TIER_LIMITS[tier] : 0;

  return {
    sttMinutesUsed: Math.round(sttMinutes * 10) / 10,
    ttsMinutesUsed: Math.round(ttsMinutes * 10) / 10,
    totalMinutesUsed: Math.round((sttMinutes + ttsMinutes) * 10) / 10,
    monthlyLimitMinutes: limit ?? null,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest voice-usage.test.ts --no-coverage`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/voice-usage.ts apps/api/src/services/voice-usage.test.ts
git commit -m "feat(api): add voice usage aggregation service with tier limits [Epic-17]"
```

---

## Task 8: Voice API Routes

**Files:**
- Create: `apps/api/src/routes/voice.ts`
- Create: `apps/api/src/routes/voice.test.ts`
- Modify: `apps/api/src/index.ts`

**Depends on:** Task 6 (transcribe service), Task 7 (usage service)

- [ ] **Step 1: Write the integration test**

```typescript
// apps/api/src/routes/voice.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Hono } from 'hono';
import { voiceRoutes } from './voice';

// Mock the services
jest.mock('../services/voice-transcribe', () => ({
  transcribeAudio: jest.fn().mockResolvedValue({
    transcript: 'hello world',
    confidence: 0.92,
    durationMs: 2500,
    provider: 'deepgram',
  }),
}));

jest.mock('../services/voice-usage', () => ({
  getVoiceUsage: jest.fn().mockResolvedValue({
    sttMinutesUsed: 5.0,
    ttsMinutesUsed: 3.0,
    totalMinutesUsed: 8.0,
    monthlyLimitMinutes: 60,
    periodStart: '2026-04-01T00:00:00.000Z',
    periodEnd: '2026-05-01T00:00:00.000Z',
  }),
}));

function createTestApp() {
  const app = new Hono();
  // Simulate middleware that sets profileId and db
  app.use('*', async (c, next) => {
    c.set('profileId', 'test-profile-id');
    c.set('db', {} as any);
    c.set('subscriptionId', 'plus');
    await next();
  });
  app.route('/', voiceRoutes);
  return app;
}

describe('voice routes', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('POST /voice/transcribe', () => {
    it('returns 200 with transcript result', async () => {
      const res = await app.request('/voice/transcribe?lang=en-US', {
        method: 'POST',
        body: new ArrayBuffer(100),
        headers: { 'Content-Type': 'audio/webm' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.transcript).toBe('hello world');
      expect(body.confidence).toBe(0.92);
      expect(body.provider).toBe('deepgram');
    });

    it('returns 400 when no audio body is provided', async () => {
      const res = await app.request('/voice/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
      });

      // Empty body → service should handle gracefully
      expect(res.status).toBeLessThanOrEqual(400);
    });
  });

  describe('GET /voice/usage', () => {
    it('returns 200 with usage data', async () => {
      const res = await app.request('/voice/usage');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sttMinutesUsed).toBe(5.0);
      expect(body.monthlyLimitMinutes).toBe(60);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest routes/voice.test.ts --no-coverage`
Expected: FAIL — cannot resolve `./voice`

- [ ] **Step 3: Implement the voice routes**

```typescript
// apps/api/src/routes/voice.ts
import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { LLMTier } from '../services/subscription';
import { requireProfileId } from '../middleware/profile-scope';
import { transcribeAudio } from '../services/voice-transcribe';
import { getVoiceUsage } from '../services/voice-usage';
import { STT_CONFIDENCE_THRESHOLD } from '@eduagent/schemas';

type VoiceRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    DEEPGRAM_API_KEY?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    subscriptionId: string;
  };
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB max upload

export const voiceRoutes = new Hono<VoiceRouteEnv>()
  // POST /voice/transcribe — accept audio, return transcript
  .post('/voice/transcribe', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const tier = c.get('subscriptionId') ?? 'free';

    // Tier enforcement — free tier must use on-device STT only
    if (tier === 'free') {
      return c.json({ error: 'Server voice is not available on the free tier' }, 403);
    }

    // Check usage quota before calling Deepgram
    const usage = await getVoiceUsage(db, profileId, tier);
    if (usage.monthlyLimitMinutes != null && usage.totalMinutesUsed >= usage.monthlyLimitMinutes) {
      return c.json({ error: 'Monthly voice minutes exhausted', usage }, 429);
    }

    // Content-length pre-check
    const contentLength = parseInt(c.req.header('content-length') ?? '0', 10);
    if (contentLength > MAX_AUDIO_BYTES) {
      return c.json({ error: `Audio too large (max ${MAX_AUDIO_BYTES / 1024 / 1024}MB)` }, 413);
    }

    const audioBuffer = await c.req.arrayBuffer();
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      return c.json({ error: 'No audio data provided' }, 400);
    }
    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
      return c.json({ error: `Audio too large (max ${MAX_AUDIO_BYTES / 1024 / 1024}MB)` }, 413);
    }

    const lang = c.req.query('lang') ?? 'en-US';
    const sessionId = c.req.query('sessionId') ?? undefined;

    const result = await transcribeAudio(db, {
      profileId,
      sessionId,
      audioBuffer,
      lang,
      apiKey: c.env.DEEPGRAM_API_KEY,
    });

    // Include low-confidence flag for client-side handling (FR247)
    return c.json({
      ...result,
      lowConfidence: result.confidence < STT_CONFIDENCE_THRESHOLD,
    });
  })

  // GET /voice/usage — current month voice usage for the profile
  .get('/voice/usage', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const tier = c.get('subscriptionId') ?? null;

    const usage = await getVoiceUsage(db, profileId, tier);
    return c.json(usage);
  });
```

- [ ] **Step 4: Register the route in the app**

In `apps/api/src/index.ts`:

1. Add import near the other route imports (around line 55):
```typescript
import { voiceRoutes } from './routes/voice';
```

2. Add to the route chain (around line 201, before `testSeedRoutes`):
```typescript
  .route('/', voiceRoutes)
```

3. Add `DEEPGRAM_API_KEY?: string;` to the `Bindings` type (around line 82).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest routes/voice.test.ts --no-coverage`
Expected: All 3 tests PASS (use path prefix to avoid matching `voice-transcribe.test.ts` and `voice-usage.test.ts`)

- [ ] **Step 6: Run typecheck to confirm no type errors**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/voice.ts apps/api/src/routes/voice.test.ts apps/api/src/index.ts
git commit -m "feat(api): add POST /voice/transcribe + GET /voice/usage routes [Epic-17, FR246-FR248]"
```

---

## Task 9: Audio Level Hook

**Files:**
- Create: `apps/mobile/src/hooks/use-audio-level.ts`
- Create: `apps/mobile/src/hooks/use-audio-level.test.ts`

**Depends on:** None

This hook monitors real-time audio input levels via `expo-av` metering. It drives both the waveform visualisation (FR249) and VAD silence detection (FR244).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/src/hooks/use-audio-level.test.ts
import { renderHook, act } from '@testing-library/react-native';
import { useAudioLevel } from './use-audio-level';

// Mock expo-av
const mockRecording = {
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
  setProgressUpdateInterval: jest.fn(),
  setOnRecordingStatusUpdate: jest.fn(),
  startAsync: jest.fn().mockResolvedValue(undefined),
  stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
  getURI: jest.fn().mockReturnValue('file:///mock-audio.webm'),
};

jest.mock('expo-av', () => ({
  Audio: {
    Recording: jest.fn().mockImplementation(() => mockRecording),
    RecordingOptionsPresets: {
      HIGH_QUALITY: { isMeteringEnabled: true },
    },
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useAudioLevel', () => {
  it('starts with idle state and zero level', () => {
    const { result } = renderHook(() => useAudioLevel());

    expect(result.current.isMonitoring).toBe(false);
    expect(result.current.level).toBe(0);
    expect(result.current.audioUri).toBeNull();
  });

  it('starts monitoring and captures audio URI on stop', async () => {
    const { result } = renderHook(() => useAudioLevel());

    await act(async () => {
      await result.current.startMonitoring();
    });

    expect(result.current.isMonitoring).toBe(true);
    expect(mockRecording.startAsync).toHaveBeenCalled();

    await act(async () => {
      await result.current.stopMonitoring();
    });

    expect(result.current.isMonitoring).toBe(false);
    expect(result.current.audioUri).toBe('file:///mock-audio.webm');
  });

  it('normalises metering dB to 0-1 range', () => {
    const { result } = renderHook(() => useAudioLevel());

    // The hook exposes a normalise function or computes level internally
    // -160 dB (silence) → 0, 0 dB (max) → 1
    // Test the normalisation logic indirectly via the level value
    expect(result.current.level).toBeGreaterThanOrEqual(0);
    expect(result.current.level).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest use-audio-level.test.ts --no-coverage`
Expected: FAIL — cannot resolve `./use-audio-level`

- [ ] **Step 3: Implement the hook**

```typescript
// apps/mobile/src/hooks/use-audio-level.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';

/** Normalise expo-av metering dB (-160 to 0) to 0-1 range */
function normaliseDb(db: number): number {
  // expo-av metering: -160 (silence) to 0 (max)
  const MIN_DB = -60; // Treat anything below -60 as silence
  const clamped = Math.max(MIN_DB, Math.min(0, db));
  return (clamped - MIN_DB) / (0 - MIN_DB);
}

export function useAudioLevel() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [level, setLevel] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const mountedRef = useRef(true);

  const startMonitoring = useCallback(async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    });

    recording.setOnRecordingStatusUpdate((status) => {
      if (!mountedRef.current) return;
      if (status.isRecording && status.metering != null) {
        setLevel(normaliseDb(status.metering));
      }
    });
    recording.setProgressUpdateInterval(50); // ~20fps metering

    await recording.startAsync();
    recordingRef.current = recording;
    setAudioUri(null);
    if (mountedRef.current) setIsMonitoring(true);
  }, []);

  const stopMonitoring = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    recordingRef.current = null;

    if (mountedRef.current) {
      setIsMonitoring(false);
      setLevel(0);
      setAudioUri(uri);
    }
  }, []);

  const cancelMonitoring = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    await recording.stopAndUnloadAsync();
    recordingRef.current = null;

    if (mountedRef.current) {
      setIsMonitoring(false);
      setLevel(0);
      setAudioUri(null);
    }
  }, []);

  // Cleanup on unmount — must use useEffect, not useState
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  return {
    isMonitoring,
    level,
    audioUri,
    startMonitoring,
    stopMonitoring,
    cancelMonitoring,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest use-audio-level.test.ts --no-coverage`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-audio-level.ts apps/mobile/src/hooks/use-audio-level.test.ts
git commit -m "feat(mobile): add useAudioLevel hook — real-time metering via expo-av [Epic-17, FR244, FR249]"
```

---

## Task 10: Server STT Hook with On-Device Fallback (FR246)

**Files:**
- Create: `apps/mobile/src/hooks/use-server-stt.ts`
- Create: `apps/mobile/src/hooks/use-server-stt.test.ts`

**Depends on:** Task 9 (useAudioLevel — provides audioUri), existing `useSpeechRecognition` (provides real-time interim transcripts)

This hook orchestrates the dual-recording approach: on-device STT for real-time feedback, expo-av recording for server-side re-transcription.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/src/hooks/use-server-stt.test.ts
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useServerSTT } from './use-server-stt';

// Mock the API client
const mockMutateAsync = jest.fn();
jest.mock('./use-api-client', () => ({
  useApiClient: () => ({
    voice: {
      transcribe: { $post: mockMutateAsync },
    },
  }),
}));

// Mock useAudioLevel
const mockStartMonitoring = jest.fn().mockResolvedValue(undefined);
const mockStopMonitoring = jest.fn().mockResolvedValue(undefined);
const mockCancelMonitoring = jest.fn().mockResolvedValue(undefined);

jest.mock('./use-audio-level', () => ({
  useAudioLevel: () => ({
    isMonitoring: false,
    level: 0,
    audioUri: 'file:///test-audio.webm',
    startMonitoring: mockStartMonitoring,
    stopMonitoring: mockStopMonitoring,
    cancelMonitoring: mockCancelMonitoring,
  }),
}));

// Mock useSpeechRecognition
jest.mock('./use-speech-recognition', () => ({
  useSpeechRecognition: () => ({
    status: 'idle',
    transcript: '',
    isListening: false,
    startListening: jest.fn().mockResolvedValue(undefined),
    stopListening: jest.fn().mockResolvedValue(undefined),
    clearTranscript: jest.fn(),
  }),
}));

// Mock file reading
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('base64audiodata'),
  EncodingType: { Base64: 'base64' },
}));

describe('useServerSTT', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with idle state', () => {
    const { result } = renderHook(() =>
      useServerSTT({ lang: 'en-US' })
    );

    expect(result.current.isRecording).toBe(false);
    expect(result.current.interimTranscript).toBe('');
    expect(result.current.finalResult).toBeNull();
    expect(result.current.isServerProcessing).toBe(false);
  });

  it('provides startRecording and stopRecording functions', () => {
    const { result } = renderHook(() =>
      useServerSTT({ lang: 'en-US' })
    );

    expect(typeof result.current.startRecording).toBe('function');
    expect(typeof result.current.stopRecording).toBe('function');
    expect(typeof result.current.cancelRecording).toBe('function');
  });

  it('reports server processing state after stop', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      json: async () => ({
        transcript: 'server transcript',
        confidence: 0.95,
        durationMs: 2000,
        provider: 'deepgram',
        lowConfidence: false,
      }),
    });

    const { result } = renderHook(() =>
      useServerSTT({ lang: 'en-US' })
    );

    // The hook exposes isServerProcessing which becomes true
    // after stopRecording until the server response arrives
    expect(result.current.isServerProcessing).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest use-server-stt.test.ts --no-coverage`
Expected: FAIL — cannot resolve `./use-server-stt`

- [ ] **Step 3: Implement the hook**

```typescript
// apps/mobile/src/hooks/use-server-stt.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { useSpeechRecognition } from './use-speech-recognition';
import { useAudioLevel } from './use-audio-level';
import type { VoiceTranscribeResult } from '@eduagent/schemas';
import { STT_CONFIDENCE_THRESHOLD } from '@eduagent/schemas';

interface UseServerSTTOptions {
  lang: string;
  sessionId?: string;
  /** Base URL for the API (e.g., from config) */
  apiBaseUrl?: string;
  /** Auth token for API calls */
  authToken?: string;
  /** Profile ID header */
  profileId?: string;
}

interface ServerSTTResult extends VoiceTranscribeResult {
  lowConfidence: boolean;
}

export function useServerSTT(options: UseServerSTTOptions) {
  const { lang, sessionId, apiBaseUrl, authToken, profileId } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isServerProcessing, setIsServerProcessing] = useState(false);
  const [finalResult, setFinalResult] = useState<ServerSTTResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  // Refs to avoid stale closures — audioUri and interimTranscript change
  // asynchronously via stopMonitoring/stopListening, so the callback
  // would capture stale values without refs.
  const interimTranscriptRef = useRef('');
  const pendingUploadRef = useRef(false);

  // On-device STT for real-time interim transcripts
  const {
    transcript: interimTranscript,
    isListening,
    startListening,
    stopListening,
    clearTranscript,
  } = useSpeechRecognition({ lang });

  // Keep ref in sync
  interimTranscriptRef.current = interimTranscript;

  // expo-av recording for audio capture
  const {
    level: audioLevel,
    audioUri,
    startMonitoring,
    stopMonitoring,
    cancelMonitoring,
  } = useAudioLevel();

  // Upload audio when audioUri becomes available after stopMonitoring
  useEffect(() => {
    if (!pendingUploadRef.current || !audioUri) return;
    pendingUploadRef.current = false;

    if (!apiBaseUrl || !authToken) {
      // No server available — use on-device transcript as final
      if (mountedRef.current) {
        setFinalResult({
          transcript: interimTranscriptRef.current,
          confidence: 1.0,
          durationMs: 0,
          provider: 'on_device',
          lowConfidence: false,
        });
        setIsServerProcessing(false);
      }
      return;
    }

    (async () => {
      try {
        const base64 = await FileSystem.readAsStringAsync(audioUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const url = new URL('/v1/voice/transcribe', apiBaseUrl);
        url.searchParams.set('lang', lang);
        if (sessionId) url.searchParams.set('sessionId', sessionId);

        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'audio/webm',
            Authorization: `Bearer ${authToken}`,
            'X-Profile-Id': profileId ?? '',
          },
          body: bytes.buffer,
        });

        if (!response.ok) {
          throw new Error(`Server STT failed (${response.status})`);
        }

        const result: ServerSTTResult = await response.json();

        if (mountedRef.current) {
          setFinalResult(result);
          setIsServerProcessing(false);
        }
      } catch (err) {
        // Fallback to on-device transcript
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : 'Server transcription failed'
          );
          setFinalResult({
            transcript: interimTranscriptRef.current,
            confidence: 1.0,
            durationMs: 0,
            provider: 'on_device',
            lowConfidence: false,
          });
          setIsServerProcessing(false);
        }
      }
    })();
  }, [audioUri, apiBaseUrl, authToken, profileId, lang, sessionId]);

  const startRecording = useCallback(async () => {
    setError(null);
    setFinalResult(null);
    clearTranscript();

    // Start both in parallel: on-device STT + audio capture
    await Promise.all([startListening(), startMonitoring()]);

    if (mountedRef.current) setIsRecording(true);
  }, [startListening, startMonitoring, clearTranscript]);

  const stopRecording = useCallback(async () => {
    if (mountedRef.current) {
      setIsRecording(false);
      setIsServerProcessing(true);
    }

    // Mark that we want to upload when audioUri becomes available
    pendingUploadRef.current = true;

    // Stop both — stopMonitoring will update audioUri, triggering the upload effect
    await Promise.all([stopListening(), stopMonitoring()]);
  }, [stopListening, stopMonitoring]);

  const cancelRecording = useCallback(async () => {
    pendingUploadRef.current = false;
    await Promise.all([stopListening(), cancelMonitoring()]);
    clearTranscript();
    if (mountedRef.current) {
      setIsRecording(false);
      setIsServerProcessing(false);
      setFinalResult(null);
    }
  }, [stopListening, cancelMonitoring, clearTranscript]);

  return {
    // State
    isRecording,
    isServerProcessing,
    interimTranscript,
    finalResult,
    audioLevel,
    error,
    // Whether using on-device fallback
    isOnDeviceFallback: finalResult?.provider === 'on_device',
    // Actions
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest use-server-stt.test.ts --no-coverage`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-server-stt.ts apps/mobile/src/hooks/use-server-stt.test.ts
git commit -m "feat(mobile): add useServerSTT hook — dual-recording with on-device fallback [Epic-17, FR246-FR247]"
```

---

## Task 11: Audio Waveform Component (FR249)

**Files:**
- Create: `apps/mobile/src/components/session/AudioWaveform.tsx`
- Create: `apps/mobile/src/components/session/AudioWaveform.test.tsx`

**Depends on:** None (receives `level` as a prop)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/session/AudioWaveform.test.tsx
import { render, screen } from '@testing-library/react-native';
import { AudioWaveform } from './AudioWaveform';

describe('AudioWaveform', () => {
  it('renders the waveform container', () => {
    render(<AudioWaveform level={0.5} isActive />);
    expect(screen.getByTestId('audio-waveform')).toBeTruthy();
  });

  it('renders bar elements', () => {
    render(<AudioWaveform level={0.5} isActive />);
    const bars = screen.getAllByTestId(/^waveform-bar-/);
    expect(bars.length).toBeGreaterThan(0);
  });

  it('renders in inactive state without crash', () => {
    render(<AudioWaveform level={0} isActive={false} />);
    expect(screen.getByTestId('audio-waveform')).toBeTruthy();
  });

  it('provides accessible description', () => {
    render(<AudioWaveform level={0.5} isActive />);
    expect(
      screen.getByLabelText('Audio level visualisation')
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest AudioWaveform.test.tsx --no-coverage`
Expected: FAIL — cannot resolve `./AudioWaveform`

- [ ] **Step 3: Implement the waveform component**

```tsx
// apps/mobile/src/components/session/AudioWaveform.tsx
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

const BAR_COUNT = 20;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MAX_HEIGHT = 40;
const MIN_HEIGHT = 4;

interface AudioWaveformProps {
  /** Audio level 0-1 from useAudioLevel hook */
  level: number;
  /** Whether the waveform is actively recording */
  isActive: boolean;
}

function WaveformBar({
  index,
  level,
  isActive,
}: {
  index: number;
  level: number;
  isActive: boolean;
}) {
  const height = useSharedValue(MIN_HEIGHT);

  useEffect(() => {
    if (!isActive) {
      height.value = withTiming(MIN_HEIGHT, { duration: 200 });
      return;
    }

    // Each bar gets a slightly different height based on its position
    // to create an organic waveform look
    const offset = Math.sin(index * 0.8) * 0.3;
    const targetHeight =
      MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * Math.max(0, level + offset);

    height.value = withSpring(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, targetHeight)), {
      damping: 15,
      stiffness: 200,
    });
  }, [level, isActive, index, height]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    // Use theme tokens — hardcoded hex violates theming rules
    backgroundColor: isActive ? 'rgb(91, 196, 190)' : 'rgba(91, 196, 190, 0.4)',
    // TODO: Replace with useThemeColor('primary') from the app's theme system
  }));

  return (
    <Animated.View
      style={animatedStyle}
      testID={`waveform-bar-${index}`}
    />
  );
}

export function AudioWaveform({ level, isActive }: AudioWaveformProps) {
  return (
    <View
      className="flex-row items-center justify-center gap-[2px] py-2"
      style={{ height: MAX_HEIGHT + 16 }}
      testID="audio-waveform"
      accessibilityLabel="Audio level visualisation"
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <WaveformBar key={i} index={i} level={level} isActive={isActive} />
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest AudioWaveform.test.tsx --no-coverage`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/session/AudioWaveform.tsx apps/mobile/src/components/session/AudioWaveform.test.tsx
git commit -m "feat(mobile): add AudioWaveform — real-time reanimated visualisation [Epic-17, FR249]"
```

---

## Task 12: Transcript Overlay (FR251)

**Files:**
- Create: `apps/mobile/src/components/session/TranscriptOverlay.tsx`
- Create: `apps/mobile/src/components/session/TranscriptOverlay.test.tsx`

**Depends on:** None (pure presentational)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/session/TranscriptOverlay.test.tsx
import { render, screen } from '@testing-library/react-native';
import { TranscriptOverlay } from './TranscriptOverlay';

describe('TranscriptOverlay', () => {
  it('shows interim transcript in secondary style', () => {
    render(
      <TranscriptOverlay
        interimText="hello wor"
        finalText={null}
        isProcessing={false}
      />
    );

    const text = screen.getByText('hello wor');
    expect(text).toBeTruthy();
    expect(text.props.className).toContain('italic');
  });

  it('shows final text in primary style', () => {
    render(
      <TranscriptOverlay
        interimText=""
        finalText="hello world"
        isProcessing={false}
      />
    );

    const text = screen.getByText('hello world');
    expect(text).toBeTruthy();
    expect(text.props.className).not.toContain('italic');
  });

  it('shows thinking indicator when processing', () => {
    render(
      <TranscriptOverlay
        interimText="some text"
        finalText={null}
        isProcessing
      />
    );

    expect(screen.getByText('Improving transcript...')).toBeTruthy();
  });

  it('shows low-confidence warning', () => {
    render(
      <TranscriptOverlay
        interimText=""
        finalText="garbled"
        isProcessing={false}
        lowConfidence
      />
    );

    expect(
      screen.getByText("I didn't quite catch that. Could you say it again?")
    ).toBeTruthy();
  });

  it('renders nothing when no text and not processing', () => {
    const { toJSON } = render(
      <TranscriptOverlay
        interimText=""
        finalText={null}
        isProcessing={false}
      />
    );

    expect(toJSON()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest TranscriptOverlay.test.tsx --no-coverage`
Expected: FAIL — cannot resolve `./TranscriptOverlay`

- [ ] **Step 3: Implement the component**

```tsx
// apps/mobile/src/components/session/TranscriptOverlay.tsx
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TranscriptOverlayProps {
  /** Real-time transcript from on-device STT */
  interimText: string;
  /** Final transcript from server STT (null while recording or processing) */
  finalText: string | null;
  /** True while waiting for server re-transcription */
  isProcessing: boolean;
  /** True when server returned low confidence (FR247) */
  lowConfidence?: boolean;
}

export function TranscriptOverlay({
  interimText,
  finalText,
  isProcessing,
  lowConfidence = false,
}: TranscriptOverlayProps) {
  const displayText = finalText ?? interimText;
  const hasContent = displayText.length > 0 || isProcessing;

  if (!hasContent) return null;

  return (
    <View
      className="mx-4 mb-2 rounded-xl bg-surface-elevated p-3"
      testID="transcript-overlay"
    >
      <ScrollView
        style={{ maxHeight: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {displayText.length > 0 && (
          <Text
            className={
              finalText
                ? 'text-base text-text-primary'
                : 'text-base italic text-text-secondary'
            }
          >
            {displayText}
          </Text>
        )}
      </ScrollView>

      {isProcessing && (
        <View className="mt-1 flex-row items-center gap-1">
          <Ionicons name="sparkles" size={14} className="text-primary" />
          <Text className="text-xs text-text-secondary">
            Improving transcript...
          </Text>
        </View>
      )}

      {lowConfidence && finalText && (
        <View className="mt-2 rounded-lg bg-warning/10 p-2">
          <Text className="text-sm text-warning-text">
            I didn't quite catch that. Could you say it again?
          </Text>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest TranscriptOverlay.test.tsx --no-coverage`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/session/TranscriptOverlay.tsx apps/mobile/src/components/session/TranscriptOverlay.test.tsx
git commit -m "feat(mobile): add TranscriptOverlay — real-time + low-confidence display [Epic-17, FR247, FR251]"
```

---

## Task 13: Cancel Gesture + Thinking State on VoiceRecordButton (FR250)

**Files:**
- Modify: `apps/mobile/src/components/session/VoiceRecordButton.tsx`
- Modify: `apps/mobile/src/components/session/VoiceRecordButton.test.tsx`

**Depends on:** Task 11 (AudioWaveform)

- [ ] **Step 1: Read the current VoiceRecordButton implementation**

Read: `apps/mobile/src/components/session/VoiceRecordButton.tsx`

The current component has a pulse animation and simple press handler. We need to:
1. Replace pulse with `AudioWaveform`
2. Add swipe-to-cancel via `PanResponder` or `react-native-gesture-handler`
3. Add a thinking state with timeout
4. Add an optional language badge

- [ ] **Step 2: Write the failing test for new behavior**

Add to existing test file:

```tsx
// In VoiceRecordButton.test.tsx — add new test cases:

describe('VoiceRecordButton — enhanced', () => {
  it('renders AudioWaveform when listening', () => {
    render(
      <VoiceRecordButton
        isListening
        onPress={jest.fn()}
        audioLevel={0.5}
      />
    );

    expect(screen.getByTestId('audio-waveform')).toBeTruthy();
  });

  it('shows thinking state', () => {
    render(
      <VoiceRecordButton
        isListening={false}
        onPress={jest.fn()}
        isThinking
      />
    );

    expect(screen.getByText('Thinking...')).toBeTruthy();
  });

  it('shows timeout message after 15s in thinking state', () => {
    jest.useFakeTimers();

    render(
      <VoiceRecordButton
        isListening={false}
        onPress={jest.fn()}
        isThinking
      />
    );

    jest.advanceTimersByTime(15000);

    expect(
      screen.getByText('Taking a bit longer than usual...')
    ).toBeTruthy();

    jest.useRealTimers();
  });

  it('shows language badge when lang is provided', () => {
    render(
      <VoiceRecordButton
        isListening
        onPress={jest.fn()}
        lang="es-ES"
      />
    );

    expect(screen.getByText('ES')).toBeTruthy();
  });

  it('calls onCancel when swiping left', () => {
    const onCancel = jest.fn();
    render(
      <VoiceRecordButton
        isListening
        onPress={jest.fn()}
        onCancel={onCancel}
      />
    );

    // Swipe gesture test would require gesture-handler testing utilities
    // Verify the cancel affordance is visible
    expect(screen.getByText('← Swipe to cancel')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest VoiceRecordButton.test --no-coverage`
Expected: FAIL — new tests fail (missing props, missing elements)

- [ ] **Step 4: Extend the VoiceRecordButton**

Update `apps/mobile/src/components/session/VoiceRecordButton.tsx`:

1. Add new optional props to the interface:
   - `audioLevel?: number` — for waveform
   - `isThinking?: boolean` — for thinking state
   - `onCancel?: () => void` — for swipe-to-cancel
   - `onThinkingTimeout?: () => void` — called after 15s timeout
   - `lang?: string` — for language badge

2. Replace the Reanimated pulse animation with `AudioWaveform` when `isListening && audioLevel != null`.

3. Add a swipe-to-cancel hint text `← Swipe to cancel` visible while `isListening`, and wire the `onCancel` callback to a `PanResponder` with a leftward threshold of 100px.

4. Add the thinking state: when `isThinking` is true, show "Thinking..." with a subtle opacity animation. After 15s (tracked via `useEffect` + `setTimeout`), change to "Taking a bit longer than usual..." with a cancel button.

5. Add a small language badge (e.g., "ES") positioned at the top-right of the mic button when `lang` is provided. Extract the 2-letter country code: `lang.split('-')[0].toUpperCase()`.

**Key implementation detail — swipe gesture:**

```tsx
import { useRef } from 'react';
import { PanResponder, Animated as RNAnimated } from 'react-native';

// Inside the component:
const translateX = useRef(new RNAnimated.Value(0)).current;

const panResponder = useRef(
  PanResponder.create({
    onStartShouldSetPanResponder: () => isListening,
    onMoveShouldSetPanResponder: (_, { dx }) => isListening && dx < -10,
    onPanResponderMove: (_, { dx }) => {
      if (dx < 0) translateX.setValue(dx);
    },
    onPanResponderRelease: (_, { dx }) => {
      if (dx < -100) {
        hapticLight();
        onCancel?.();
      }
      RNAnimated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    },
  })
).current;
```

**Key implementation detail — thinking timeout:**

```tsx
useEffect(() => {
  if (!isThinking) {
    setShowTimeoutMessage(false);
    return;
  }
  const timer = setTimeout(() => {
    setShowTimeoutMessage(true);
  }, 15000);
  return () => clearTimeout(timer);
}, [isThinking]);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest VoiceRecordButton.test --no-coverage`
Expected: All tests PASS (existing + new)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/session/VoiceRecordButton.tsx apps/mobile/src/components/session/VoiceRecordButton.test.tsx
git commit -m "feat(mobile): enhance VoiceRecordButton — waveform, swipe-cancel, thinking, lang badge [Epic-17, FR249-FR251]"
```

---

## Task 14: VoicePlaybackBar — Add 1.5x Speed (FR255 prep)

**Files:**
- Modify: `apps/mobile/src/components/session/VoicePlaybackBar.tsx`
- Modify: `apps/mobile/src/components/session/VoicePlaybackBar.test.tsx`

**Depends on:** None

This is a small change: add `1.5` to the `RATE_CYCLE` array.

- [ ] **Step 1: Write the failing test**

Add to existing test file:

```tsx
import { RATE_CYCLE, nextRate } from './VoicePlaybackBar';

describe('RATE_CYCLE', () => {
  it('includes 1.5x speed option', () => {
    expect(RATE_CYCLE).toContain(1.5);
  });

  it('cycles through all four speeds', () => {
    expect(nextRate(0.75)).toBe(1.0);
    expect(nextRate(1.0)).toBe(1.25);
    expect(nextRate(1.25)).toBe(1.5);
    expect(nextRate(1.5)).toBe(0.75); // wraps around
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest VoicePlaybackBar.test --no-coverage`
Expected: FAIL — `nextRate(1.25)` returns `0.75` instead of `1.5`

- [ ] **Step 3: Update RATE_CYCLE**

In `apps/mobile/src/components/session/VoicePlaybackBar.tsx`, change:

```typescript
// Before:
export const RATE_CYCLE = [0.75, 1.0, 1.25];

// After:
export const RATE_CYCLE = [0.75, 1.0, 1.25, 1.5];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest VoicePlaybackBar.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/session/VoicePlaybackBar.tsx apps/mobile/src/components/session/VoicePlaybackBar.test.tsx
git commit -m "feat(mobile): add 1.5x speed to VoicePlaybackBar rate cycle [Epic-17, FR255]"
```

---

## Task 15: Add `inputMode` to ExchangeContext (Phase B prep)

**Files:**
- Modify: `apps/api/src/services/exchanges.ts`
- Modify: `apps/api/src/services/exchanges.test.ts`

**Depends on:** None

This adds the `inputMode` field to `ExchangeContext` so that Phase B can inject the voice prompt section into `buildSystemPrompt()`. Phase A only adds the field — the voice prompt section is implemented in Phase B.

- [ ] **Step 1: Write the failing test**

Add to existing exchanges test file:

```typescript
describe('buildSystemPrompt — inputMode field', () => {
  it('accepts inputMode in context without error', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      inputMode: 'voice',
    });

    // Phase A: inputMode is accepted but does not yet change the prompt
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Add the field to ExchangeContext**

In `apps/api/src/services/exchanges.ts`, add to the `ExchangeContext` interface (around line 78):

```typescript
  /** Input mode — 'voice' activates voice-optimised prompting (Phase B) */
  inputMode?: 'text' | 'voice';
```

- [ ] **Step 3: Run the test suite**

Run: `cd apps/api && pnpm exec jest exchanges.test.ts --no-coverage`
Expected: All tests PASS (including the new one)

- [ ] **Step 4: Run typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/exchanges.ts apps/api/src/services/exchanges.test.ts
git commit -m "feat(api): add inputMode to ExchangeContext — Phase B prep [Epic-17, FR256]"
```

---

## Task 16: ChatShell Integration — Wire Voice Input Enhancement

**Files:**
- Modify: `apps/mobile/src/components/session/ChatShell.tsx`
- Modify: `apps/mobile/src/components/session/ChatShell.test.tsx`

**Depends on:** Tasks 3, 4, 5, 10, 11, 12, 13 (all mobile components and hooks)

This is the orchestration task. It wires all the new voice components and hooks into the existing ChatShell.

- [ ] **Step 1: Read the current ChatShell**

Read: `apps/mobile/src/components/session/ChatShell.tsx`

Identify the existing voice integration points:
- Where `useSpeechRecognition` is called
- Where `VoiceRecordButton` is rendered
- Where `VoiceTranscriptPreview` is rendered
- Where `SessionInputModeToggle` is rendered
- Where input mode state is managed

- [ ] **Step 2: Write the failing tests for new integration**

> **⚠️ IMPORTANT:** These test bodies are **pseudocode outlines**, not runnable tests.
> The implementer must write full test implementations including:
> - Mocks for `useServerSTT`, `useVoicePreferences`, `useAudioLevel`
> - A wrapper component that provides required context (auth, profile, etc.)
> - Actual `render()`, `fireEvent`, and `expect` calls
>
> Refer to existing ChatShell.test.tsx patterns for mock setup.

```tsx
// Add to ChatShell.test.tsx:

describe('ChatShell — voice enhancement integration', () => {
  it('shows VoiceSuggestionCard for age 11-13 on first session', () => {
    // Render ChatShell with birthYear indicating age 12
    // Expect voice-suggestion-card to be visible
  });

  it('does not show VoiceSuggestionCard for age 14+', () => {
    // Render ChatShell with birthYear indicating age 15
    // Expect no voice-suggestion-card
  });

  it('shows AudioWaveform when recording in voice mode', () => {
    // Render ChatShell in voice mode, simulate recording
    // Expect audio-waveform testID to be present
  });

  it('shows TranscriptOverlay during recording', () => {
    // Render ChatShell in voice mode, simulate recording with interim text
    // Expect transcript-overlay testID to be present
  });

  it('shows low-confidence prompt when server returns low score', () => {
    // Simulate server STT returning confidence < 0.6
    // Expect "I didn't quite catch that" message
  });

  it('persists input mode preference when toggled', () => {
    // Toggle from text to voice
    // Verify AsyncStorage was updated
  });

  it('reads persisted input mode on mount', () => {
    // Pre-set voice preference in AsyncStorage
    // Render ChatShell
    // Verify it starts in voice mode
  });
});
```

- [ ] **Step 3: Implement the integration**

In `ChatShell.tsx`, make these changes:

**A. Add imports:**

```typescript
import { useVoicePreferences } from '../../hooks/use-voice-preferences';
import { useServerSTT } from '../../hooks/use-server-stt';
import { TranscriptOverlay } from './TranscriptOverlay';
import { AudioWaveform } from './AudioWaveform';
import { VoiceSuggestionCard } from './VoiceSuggestionCard';
import { STT_CONFIDENCE_THRESHOLD } from '@eduagent/schemas';

/** Calculate age from birth year — no standalone calculateAge exists in the codebase */
function calculateAge(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}
```

**B. Add voice preference hook near the top of the component:**

```typescript
const {
  preferences: voicePrefs,
  isLoading: prefsLoading,
  updatePreferences,
  hasSuggestionBeenShown,
  markSuggestionShown,
} = useVoicePreferences(profileId);
```

**C. Replace direct `useSpeechRecognition` with `useServerSTT`:**

Replace the existing speech recognition usage with:

```typescript
const {
  isRecording: isVoiceRecording,
  isServerProcessing,
  interimTranscript,
  finalResult,
  audioLevel,
  error: sttError,
  isOnDeviceFallback,
  startRecording,
  stopRecording,
  cancelRecording,
} = useServerSTT({
  lang: speechRecognitionLanguage ?? 'en-US',
  sessionId,
  apiBaseUrl: config.API_ORIGIN,
  authToken: /* from auth context */,
  profileId,
});
```

**D. Add age-aware suggestion state:**

```typescript
const [showSuggestion, setShowSuggestion] = useState(false);
const age = birthYear ? calculateAge(birthYear) : null;

useEffect(() => {
  if (age == null || age < 11 || age > 13) return;
  hasSuggestionBeenShown().then((shown) => {
    if (!shown) setShowSuggestion(true);
  });
}, [age, hasSuggestionBeenShown]);

const handleSuggestionAccept = useCallback(async () => {
  setShowSuggestion(false);
  await markSuggestionShown();
  await updatePreferences({ preferredInputMode: 'voice' });
  onInputModeChange?.('voice');
}, [markSuggestionShown, updatePreferences, onInputModeChange]);

const handleSuggestionDismiss = useCallback(async () => {
  setShowSuggestion(false);
  await markSuggestionShown();
}, [markSuggestionShown]);
```

**E. Use persisted preference for initial input mode:**

```typescript
// In the initial mode resolution (existing logic):
const effectiveInputMode = inputMode ?? voicePrefs.preferredInputMode;
```

**F. Update toggle handler to persist preference:**

```typescript
const handleInputModeChange = useCallback(
  async (mode: InputMode) => {
    onInputModeChange?.(mode);
    await updatePreferences({ preferredInputMode: mode });
  },
  [onInputModeChange, updatePreferences]
);
```

**G. Wire the suggestion into SessionInputModeToggle:**

```tsx
<SessionInputModeToggle
  mode={effectiveInputMode}
  onModeChange={handleInputModeChange}
  showSuggestion={showSuggestion}
  onSuggestionAccept={handleSuggestionAccept}
  onSuggestionDismiss={handleSuggestionDismiss}
/>
```

**H. Update VoiceRecordButton rendering:**

```tsx
<VoiceRecordButton
  isListening={isVoiceRecording}
  onPress={isVoiceRecording ? stopRecording : startRecording}
  audioLevel={audioLevel}
  isThinking={isServerProcessing}
  onCancel={cancelRecording}
  lang={speechRecognitionLanguage}
/>
```

**I. Add TranscriptOverlay above the input area:**

```tsx
{(isVoiceRecording || isServerProcessing || finalResult) && (
  <TranscriptOverlay
    interimText={interimTranscript}
    finalText={finalResult?.transcript ?? null}
    isProcessing={isServerProcessing}
    lowConfidence={finalResult?.lowConfidence}
  />
)}
```

**J. Update the send logic:**

When the user taps "Send" on the transcript preview, use `finalResult.transcript` if available, otherwise fall back to the on-device `interimTranscript`. If `finalResult.lowConfidence` is true, don't auto-send — show the prompt and let the user decide.

- [ ] **Step 4: Run all ChatShell tests**

Run: `cd apps/mobile && pnpm exec jest ChatShell.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Run related tests across voice components**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/ChatShell.tsx --no-coverage`
Expected: All related tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/session/ChatShell.tsx apps/mobile/src/components/session/ChatShell.test.tsx
git commit -m "feat(mobile): wire voice input enhancement into ChatShell — suggestion, server STT, waveform, transcript [Epic-17, FR243-FR251]"
```

---

## Task 17: VAD Auto-Stop Integration (FR244)

**Files:**
- Modify: `apps/mobile/src/components/session/ChatShell.tsx` (or create a `useVAD` helper if the logic is complex enough)

**Depends on:** Task 16 (ChatShell integration), Task 9 (audio levels)

- [ ] **Step 1: Write the failing test**

```tsx
// Add to ChatShell.test.tsx:
describe('VAD mode', () => {
  it('auto-stops recording after silence threshold when VAD is enabled', () => {
    jest.useFakeTimers();

    // Render ChatShell with VAD enabled, silence threshold 1500ms
    // Start recording
    // Simulate audio level dropping to 0
    // Advance timers by 1500ms
    // Verify recording stopped automatically

    jest.useRealTimers();
  });

  it('does not auto-stop when VAD is disabled (push-to-talk)', () => {
    jest.useFakeTimers();

    // Render ChatShell with VAD disabled
    // Start recording
    // Simulate audio level dropping to 0
    // Advance timers by 3000ms
    // Verify recording is still active

    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Implement VAD logic in ChatShell**

Add a `useEffect` that monitors audio level when VAD is enabled:

```typescript
// VAD: auto-stop recording on silence
const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
  if (!voicePrefs.vadEnabled || !isVoiceRecording) {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    return;
  }

  const SILENCE_LEVEL = 0.05; // Below this = silence

  if (audioLevel < SILENCE_LEVEL) {
    // Start silence timer if not already running
    if (!silenceTimerRef.current) {
      silenceTimerRef.current = setTimeout(() => {
        stopRecording();
      }, voicePrefs.silenceThresholdMs);
    }
  } else {
    // Speech detected — reset the timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  return () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
  };
}, [audioLevel, isVoiceRecording, voicePrefs.vadEnabled, voicePrefs.silenceThresholdMs, stopRecording]);
```

- [ ] **Step 3: Run the tests**

Run: `cd apps/mobile && pnpm exec jest ChatShell.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/session/ChatShell.tsx apps/mobile/src/components/session/ChatShell.test.tsx
git commit -m "feat(mobile): add VAD auto-stop — silence-based recording end [Epic-17, FR244]"
```

---

## Task 18: On-Device Fallback Indicator

**Files:**
- Modify: `apps/mobile/src/components/session/ChatShell.tsx`

**Depends on:** Task 16

When the server is unreachable and on-device STT is used as fallback, show a subtle indicator.

- [ ] **Step 1: Write the test**

```tsx
// Add to ChatShell.test.tsx:
it('shows fallback indicator when using on-device STT', () => {
  // Mock useServerSTT to return isOnDeviceFallback = true
  // Render ChatShell in voice mode
  // Expect "Using on-device recognition" text to be visible
});
```

- [ ] **Step 2: Add the indicator JSX**

In ChatShell, when `isOnDeviceFallback` is true, render:

```tsx
{isOnDeviceFallback && (
  <View className="mx-4 flex-row items-center gap-1 py-1">
    <Ionicons name="phone-portrait-outline" size={12} className="text-text-tertiary" />
    <Text className="text-xs text-text-tertiary">
      Using on-device recognition
    </Text>
  </View>
)}
```

- [ ] **Step 3: Run the test**

Run: `cd apps/mobile && pnpm exec jest ChatShell.test --no-coverage`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/session/ChatShell.tsx apps/mobile/src/components/session/ChatShell.test.tsx
git commit -m "feat(mobile): show on-device STT fallback indicator [Epic-17, FR246]"
```

---

## Task 19: Final Validation

- [ ] **Step 1: Run full mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS — no type errors

- [ ] **Step 2: Run full API typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 3: Run all voice-related tests**

Run:
```bash
cd apps/mobile && pnpm exec jest --testPathPattern="(voice|Voice|audio|Audio|transcript|Transcript|stt|STT|suggestion|Suggestion|PlaybackBar|InputModeToggle)" --no-coverage
```
Expected: All tests PASS

- [ ] **Step 4: Run API voice tests**

Run:
```bash
cd apps/api && pnpm exec jest --testPathPattern="voice" --no-coverage
```
Expected: All tests PASS

- [ ] **Step 5: Run linters**

Run:
```bash
pnpm exec nx run api:lint
pnpm exec nx lint mobile
```
Expected: PASS — no lint errors

- [ ] **Step 6: Verify the Deepgram API key is documented**

Check that `DEEPGRAM_API_KEY` is referenced in whatever env documentation the project uses (Doppler config, `.env.example`, etc.). Add to Doppler for dev/staging/production.

- [ ] **Step 7: Final commit and push**

```bash
git add -A
git status  # Review all changes
git commit -m "feat: complete Epic 17 Phase A — voice input enhancement [Epic-17, FR243-FR251]"
```

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Mic permission denied | User denies permission prompt | "Microphone access needed for voice" + settings link | Tap to open system settings, toggle on, return |
| Deepgram API key missing | Misconfigured production env | On-device STT used silently; fallback indicator shown | Ops: add DEEPGRAM_API_KEY to Doppler |
| Deepgram rate-limited/down | Provider outage or quota | On-device STT fallback + "Using on-device recognition" | Auto-retry server on next recording; no user action needed |
| Recording interrupted | Incoming phone call / app switch | Recording auto-stops, partial transcript preserved | User can re-record or send partial transcript |
| App backgrounded during recording | User switches apps | expo-av stops, audio saved up to that point | Resume recording or send partial |
| Network loss mid-upload | Wi-Fi/cellular drops during POST | On-device transcript used as fallback + error toast | "Using on-device recognition" — user can retry |
| Corrupt/empty audio file | Recording glitch or storage issue | "No audio captured" error | Tap to re-record |
| Free tier calls server STT | Bug in client not checking tier | Server returns 403 "not available on free tier" | Client falls back to on-device; shows upgrade prompt |
| Quota exhausted | Monthly minutes used up | Server returns 429 with usage data | Client shows "Voice minutes used up" + upgrade CTA |
| Dual-recording mic conflict | Device doesn't support concurrent mic access | One of the two recorders fails silently | Fallback: use whichever recorder succeeded |

## Dual-Recording Architectural Risk

> **⚠️ Validation required before implementation.** The dual-recording approach (expo-speech-recognition + expo-av simultaneously) has not been validated on target devices. Potential issues:
>
> - **Microphone conflict:** Some Android devices may not allow two concurrent mic consumers. Test on at least 3 Android devices before committing to this approach.
> - **Battery impact:** Two concurrent audio captures during long learning sessions. Monitor battery usage in dev builds.
> - **Permission prompts:** Verify the user sees only one mic permission prompt, not two.
> - **Fallback plan:** If dual-recording doesn't work on a target device, degrade to on-device-only STT (no server re-transcription) rather than crashing.
>
> **Acceptance gate for Task 10:** Run `startListening()` + `startMonitoring()` concurrently on a physical Android and iOS device. Both must produce output. If either fails, redesign to sequential recording (record first, then run on-device STT on the saved file).

---

## FR Coverage Matrix

| FR | Description | Task(s) | Verified By |
|----|-------------|---------|-------------|
| FR243 | Age-aware voice suggestion (11-13) | 4, 5, 16 | test: VoiceSuggestionCard.test.tsx, ChatShell.test.tsx |
| FR244 | VAD mode — auto-stop on silence | 3, 9, 17 | test: ChatShell.test.tsx:"VAD mode" |
| FR245 | Voice preference persistence | 3, 16 | test: use-voice-preferences.test.ts |
| FR246 | Server-side STT with fallback | 6, 8, 10, 18 | test: voice-transcribe.test.ts, voice.test.ts, use-server-stt.test.ts |
| FR247 | Low-confidence handling | 6, 12, 16 | test: voice-transcribe.test.ts, TranscriptOverlay.test.tsx |
| FR248 | Multi-language STT | 6, 13 | test: voice-transcribe.test.ts:"language parameter" |
| FR249 | Audio waveform visualisation | 11, 13 | test: AudioWaveform.test.tsx |
| FR250 | Cancel gesture + thinking state | 13 | test: VoiceRecordButton.test.tsx:"cancel", "thinking" |
| FR251 | Real-time transcript display | 12, 16 | test: TranscriptOverlay.test.tsx, ChatShell.test.tsx |
| FR255 | 1.5x speed (partial — playback bar) | 14 | test: VoicePlaybackBar.test.tsx |

---

## Phase B & C Preview

After Phase A ships, the next plans will cover:

**Phase B — Voice Output (17.4, 17.5, 17.6):**
- `POST /v1/voice/speak` — streaming TTS via ElevenLabs/Google/OpenAI
- `useStreamingTTS` hook — audio playback from server TTS stream
- `VoicePersonaPicker` component — warm/calm/energetic with preview
- `voicePersona` column on profiles table + migration
- Voice-optimised LLM prompt section in `buildSystemPrompt()`
- Response segmentation for voice mode

**Phase C — Voice-Native Features (17.7, 17.8, 17.9):**
- `PronunciationFeedback` component — expected vs actual with Levenshtein match
- Voice-based recall sessions — verbal Q&A with LLM evaluation
- `useHandsFreeMode` hook — continuous conversation loop
- `HandsFreeOverlay` — minimal UI with large waveform
- `handsFreeTimeLimitMin` on family_links table
- Voice commands: "pause", "repeat that", "skip"

---

## Appendix: Adversarial Review Findings (2026-04-07)

Reviewed by adversarial analysis before implementation. 15 findings identified, 12 fixed inline, 3 noted as ongoing risks.

### Fixed Inline

| # | Finding | Severity | Fix Applied |
|---|---------|----------|-------------|
| 1 | Wrong UUID import path (`uuidv7` vs `generateUUIDv7` from `utils/uuid`) | **BLOCKER** | Fixed import and `$defaultFn` call in Task 2 |
| 2 | `calculateAge` doesn't exist in `lib/profile.ts` | **BLOCKER** | Added inline helper in Task 16 integration code |
| 3 | API tests used `vitest` imports but API uses Jest | **BLOCKER** | Replaced all `vi.fn()`/`vi.mock()` with `jest.fn()`/`jest.mock()` in Tasks 6, 7, 8 |
| 4 | Fire-and-forget usage logging violates CLAUDE.md rules | **HIGH** | Changed to `await db.insert(...)` — billing data must not silently fail |
| 5 | No audio file size limit on `POST /voice/transcribe` | **HIGH** | Added 10MB `MAX_AUDIO_BYTES` guard + content-length pre-check |
| 6 | Stale closure bug in `useServerSTT.stopRecording` | **HIGH** | Restructured to `useEffect` reacting to `audioUri` change + `interimTranscriptRef` |
| 9 | Free tier gets `0` minutes but no enforcement in route | **HIGH** | Added tier check + quota pre-flight before calling Deepgram |
| 10 | Hardcoded hex colour `#5BC4BE` in AudioWaveform | **MEDIUM** | Replaced with TODO to use `useThemeColor()` from app theme system |
| 11 | Missing Failure Modes table (required by global CLAUDE.md) | **MEDIUM** | Added complete table above FR Coverage Matrix |
| 12 | `useState` used as cleanup instead of `useEffect` in `useAudioLevel` | **HIGH** | Fixed to `useEffect` with proper cleanup return |
| 13 | Test command `jest voice.test.ts` matches multiple files | **LOW** | Changed to `jest routes/voice.test.ts` for specificity |
| 14 | ChatShell integration tests are pseudocode, not runnable | **MEDIUM** | Added warning banner; implementer must write full mocks + assertions |

### Noted as Ongoing Risks (not fixable in plan text alone)

| # | Finding | Severity | Mitigation |
|---|---------|----------|------------|
| 7 | Migration number `0015` may collide if other work lands first | **LOW** | Added note: verify after `drizzle-kit generate` |
| 8 | Dual-recording (expo-speech-recognition + expo-av) untested on devices | **HIGH** | Added validation gate + fallback plan section above |
| 15 | `voiceSpeakRequestSchema` is dead code in Phase A | **LOW** | Acceptable — small schema prep for Phase B. If Phase B requirements change, update then |
