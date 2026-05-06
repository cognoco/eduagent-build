# Mentor Language From UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the user-controlled "Mentor Language" axis. The mentor speaks whatever language the UI is currently in. UI language remains the single user-controlled axis; `profiles.conversation_language` becomes a derived cache that mobile keeps in sync with i18next.

**Architecture:** Keep the column (and the LLM router's preamble injection — no API contract change). Mobile syncs the column from i18next on app mount and on every `languageChanged` event. Delete the onboarding picker step, the Settings row, and the dormant suggest banner. Widen the DB CHECK constraint so every UI locale is a valid value.

**Tech Stack:** Drizzle (Postgres CHECK constraint), Zod (`conversationLanguageSchema` enum), i18next (mobile), Hono (API), React Query (mobile mutation hook).

**Out of scope:** Per-subject `nativeLanguage` for language-learning subjects (`onboarding/language-setup.tsx`) — that's a separate, legitimate concept. The `language-learning` pedagogy continues to use it untouched.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Mobile patches an unsupported language | i18next resolves to a locale not in the widened CHECK whitelist (theoretical — i18next falls back to `en` for unsupported locales) | No visible error. Mutation 400s; mobile retains old value. | Mutation hook logs, profile keeps prior value. LLM continues with last-known good value. No user-visible surface needed. |
| Existing rows hold a value no longer in UI locale set (`cs`, `fr`, `it`) | Older accounts whose mentor was set to `cs` / `fr` / `it` before unification | Their mentor still speaks the old language until UI language changes. | Acceptable. Whitelist widening keeps existing values valid. First time UI language differs from stored value, mobile syncs it. |
| Sync runs before profile is loaded | App mount race: i18next ready but `activeProfile` still loading | No visible effect; sync no-ops. | Effect re-runs when `activeProfile` becomes defined. |
| Sync fires repeatedly during initial render | `useEffect` dependency on `activeProfile.conversationLanguage` re-renders | Network spam. | Guard: only PATCH when `i18next.language !== profile.conversationLanguage` AND mutation is not in flight. |
| User signs out before mutation resolves | Race | None | Mutation cancels via React Query; no orphaned write. |

---

## File Structure

**Modify:**
- `apps/api/drizzle/<new-migration>.sql` — widen CHECK to include `ja`, `nb` (UI locales not currently in whitelist)
- `packages/database/src/schema/profiles.ts` — sync the inline CHECK constraint string to migration
- `packages/schemas/src/profiles.ts` — widen `conversationLanguageSchema` Zod enum
- `apps/mobile/src/app/_layout.tsx` (or wherever i18next is initialized at the app root) — add a `useMentorLanguageSync` hook call once profile is available
- `apps/mobile/src/app/(app)/onboarding/_layout.tsx` (or onboarding flow definition) — remove the language-picker step
- `apps/mobile/src/app/(app)/more.tsx:732-744` — remove the Mentor Language row from Settings

**Create:**
- `apps/mobile/src/hooks/use-mentor-language-sync.ts` — effect hook that PATCHes profile when i18next ≠ stored value
- `apps/mobile/src/hooks/use-mentor-language-sync.test.ts` — tests for the sync logic

**Delete:**
- `apps/mobile/src/app/(app)/onboarding/language-picker.tsx`
- `apps/mobile/src/hooks/use-conversation-language-suggest.ts`
- `apps/mobile/src/hooks/use-conversation-language-suggest.test.ts`
- The AsyncStorage key `i18n-auto-suggest-dismissed` from sign-out cleanup registration (grep for it; likely in `services/storage/cleanup.ts` or similar)
- Any `maybePromptUiSwap` alert in onboarding (referenced in language-picker; verify scope before deleting)

**Test (modify):**
- `apps/api/src/services/onboarding/onboarding.integration.test.ts:129,145` — keep, the PATCH endpoint stays
- `apps/api/src/services/llm/router.test.ts:555-630` — unchanged; preamble injection still works the same way
- `apps/mobile` test fixtures with `conversationLanguage: 'en'` — unchanged

---

## Task 1: Widen DB whitelist + Zod enum

**Files:**
- Create: `apps/api/drizzle/<NNNN>_widen_conversation_language.sql` (auto-generated)
- Modify: `packages/database/src/schema/profiles.ts:85-88` (table-level `check()` constraint)
- Modify: `packages/schemas/src/profiles.ts:9-19`

The current 8-language whitelist (`en, cs, es, fr, de, it, pt, pl`) doesn't include `ja` or `nb`, both of which the UI ships. Widen to the union of UI locales + currently-allowed mentor locales.

The constraint is a **table-level `check()`** from `drizzle-orm/pg-core`, defined at `profiles.ts:85-88` as:

```ts
check(
  'profiles_conversation_language_check',
  sql`${table.conversationLanguage} IN ('en','cs','es','fr','de','it','pt','pl')`
),
```

- [ ] **Step 1: Update schema CHECK constraint**

In `packages/database/src/schema/profiles.ts:85-88`, widen the IN list:

```ts
check(
  'profiles_conversation_language_check',
  sql`${table.conversationLanguage} IN ('en','cs','es','fr','de','it','pt','pl','ja','nb')`
),
```

Do **not** edit the column definition itself (`profiles.ts:66`); only the table-level `check()` array entry changes.

- [ ] **Step 2: Update Zod enum**

In `packages/schemas/src/profiles.ts`:

```ts
export const conversationLanguageSchema = z.enum([
  'en', 'cs', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'ja', 'nb',
]);
```

- [ ] **Step 3: Generate migration**

```bash
pnpm run db:generate
```

Drizzle should emit SQL of the form `ALTER TABLE "profiles" DROP CONSTRAINT "profiles_conversation_language_check"; ALTER TABLE "profiles" ADD CONSTRAINT "profiles_conversation_language_check" CHECK (...)`. If `db:generate` produces nothing, the schema edit didn't change the constraint signature — re-check Step 1. As a fallback, hand-write the migration based on the pattern in `apps/api/drizzle/0035_onboarding_dimensions.sql`.

- [ ] **Step 4: Apply to dev DB**

```bash
pnpm run db:push:dev
```

- [ ] **Step 5: Run integration tests**

```bash
pnpm exec nx run api:test -- onboarding.integration
```

Expected: PASS. Add a test case asserting `nb` and `ja` are accepted values.

- [ ] **Step 6: Commit via /commit**

---

## Task 1.5: Confirm `language-setup.tsx` does not write `conversation_language`

**Files (read-only):**
- `apps/mobile/src/app/(app)/onboarding/language-setup.tsx`
- Any service it calls into

The per-subject `nativeLanguage` flow is out of scope, but it shares vocabulary with the column we're collapsing. Before deleting the picker, confirm the language-learning subject setup does NOT also patch `conversation_language` as a side effect — if it does, removing the picker creates a hidden write path.

- [ ] **Step 1: Grep**

```
Grep: pattern="conversationLanguage|conversation_language", path="apps/mobile/src/app/(app)/onboarding/language-setup.tsx"
```

Expected: zero hits. If hits exist, document them and decide whether they should also be removed (likely yes — the whole point is "UI is the only axis").

- [ ] **Step 2: No commit needed unless code changed**

---

## Task 2: Build the sync hook (TDD)

**Files:**
- Create: `apps/mobile/src/hooks/use-mentor-language-sync.ts`
- Test: `apps/mobile/src/hooks/use-mentor-language-sync.test.ts`

The hook reads `i18next.language`, compares to `activeProfile.conversationLanguage`, and PATCHes when they differ. Reuses the existing `useUpdateConversationLanguage` mutation from `use-onboarding-dimensions.ts`.

- [ ] **Step 1: Write failing test**

```ts
// apps/mobile/src/hooks/use-mentor-language-sync.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import i18next from 'i18next';
import { useMentorLanguageSync } from './use-mentor-language-sync';

const mutate = jest.fn();
let isPending = false;
const useUpdateConversationLanguage = jest.fn(() => ({ mutate, isPending }));
const useActiveProfile = jest.fn(() => ({
  activeProfile: { profileId: 'p1', conversationLanguage: 'en' },
}));

jest.mock('./use-onboarding-dimensions', () => ({
  get useUpdateConversationLanguage() {
    return useUpdateConversationLanguage;
  },
}));
jest.mock('./use-active-profile', () => ({
  get useActiveProfile() {
    return useActiveProfile;
  },
}));

describe('useMentorLanguageSync', () => {
  beforeEach(() => {
    mutate.mockClear();
    isPending = false;
  });

  it('patches profile when i18next language differs from stored value', async () => {
    await i18next.changeLanguage('nb');
    renderHook(() => useMentorLanguageSync());
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ conversationLanguage: 'nb' }));
  });

  it('does not patch when languages already match', async () => {
    await i18next.changeLanguage('en');
    renderHook(() => useMentorLanguageSync());
    await waitFor(() => expect(mutate).not.toHaveBeenCalled());
  });

  it('does not patch when i18next language is not a supported mentor language', async () => {
    await i18next.changeLanguage('xx');
    renderHook(() => useMentorLanguageSync());
    await waitFor(() => expect(mutate).not.toHaveBeenCalled());
  });

  it('skips when mutation is already in flight', async () => {
    isPending = true; // toggled before render; the mocked hook closes over the live binding
    await i18next.changeLanguage('nb');
    renderHook(() => useMentorLanguageSync());
    await waitFor(() => expect(mutate).not.toHaveBeenCalled());
  });
});
```

**Why the `let isPending` indirection:** `jest.doMock` after the test file's top-level `import` does not retroactively rewrite the bound symbol — the hook under test has already imported the original mock factory. Using a mutable closure variable lets each test toggle the mock's return value before render without re-importing.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-mentor-language-sync.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module './use-mentor-language-sync'".

- [ ] **Step 3: Implement the hook**

```ts
// apps/mobile/src/hooks/use-mentor-language-sync.ts
import { useEffect } from 'react';
import i18next from 'i18next';
import { conversationLanguageSchema } from '@eduagent/schemas';
import { useActiveProfile } from './use-active-profile';
import { useUpdateConversationLanguage } from './use-onboarding-dimensions';

export function useMentorLanguageSync() {
  const { activeProfile } = useActiveProfile();
  const { mutate, isPending } = useUpdateConversationLanguage();

  useEffect(() => {
    if (!activeProfile || isPending) return;

    const sync = () => {
      const ui = i18next.language;
      const parsed = conversationLanguageSchema.safeParse(ui);
      if (!parsed.success) return;
      if (parsed.data === activeProfile.conversationLanguage) return;
      mutate({ conversationLanguage: parsed.data });
    };

    sync();
    i18next.on('languageChanged', sync);
    return () => i18next.off('languageChanged', sync);
  }, [activeProfile, isPending, mutate]);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-mentor-language-sync.test.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Commit via /commit**

---

## Task 3: Mount the hook at app root

**Files:**
- Modify: `apps/mobile/src/app/_layout.tsx` (or the closest layout that has access to `activeProfile`; `(app)/_layout.tsx` is more likely the right place since unauthenticated users shouldn't sync)

- [ ] **Step 1: Add the hook call**

```tsx
// apps/mobile/src/app/(app)/_layout.tsx
import { useMentorLanguageSync } from '@/hooks/use-mentor-language-sync';

export default function AppLayout() {
  useMentorLanguageSync();
  // ...rest of layout
}
```

- [ ] **Step 2: Read the existing layout test before editing**

`apps/mobile/src/app/(app)/_layout.test.tsx` is already modified (uncommitted) on this branch — `git status` shows it dirty. **Read it first** to understand the in-progress changes before adding mocks; do not overwrite. If it shallow-renders the layout, add a mock for `useMentorLanguageSync` returning `undefined` (the hook has no return value) so the test does not require a real `i18next`/profile mount. If it deep-renders, the hook should already be a no-op when `activeProfile` is undefined — confirm by reading the implementation.

- [ ] **Step 3: Run layout tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 4: Commit via /commit**

---

## Task 4: Delete the onboarding language-picker step

**Files:**
- Delete: `apps/mobile/src/app/(app)/onboarding/language-picker.tsx`
- Modify: the onboarding step list (search: `language-picker` references in `apps/mobile/src/app/(app)/onboarding/`)

- [ ] **Step 1: Find onboarding flow definition**

Use Grep for `language-picker` across `apps/mobile/src/app/(app)/onboarding/` to find every reference (router push, step list, navigation logic).

- [ ] **Step 2: Remove the step from the flow**

Delete the route reference, navigation path, and any step counter that includes it. The next step in the flow should now follow whatever previously preceded language-picker.

- [ ] **Step 3: Delete the file**

```bash
rm apps/mobile/src/app/\(app\)/onboarding/language-picker.tsx
```

(On Windows / git bash, the literal-bracket pathspec rule applies — see `feedback_git_pathspec_literal_brackets.md`.)

- [ ] **Step 4: Run onboarding tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/onboarding --no-coverage
```

Expected: PASS. If a test references `language-picker` directly, delete that test file or section.

- [ ] **Step 5: Commit via /commit**

---

## Task 5: Remove the Settings row

**Files:**
- Modify: `apps/mobile/src/app/(app)/more.tsx:732-744`

- [ ] **Step 1: Delete the Mentor Language row**

Remove the JSX block at lines 732–744 and any local imports it depended on (e.g., `MENTOR_LANGUAGE_KEYS` if no longer used). Run a follow-up grep to confirm nothing else in `more.tsx` references the deleted constants.

- [ ] **Step 2: Run more.tsx tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/more.tsx --no-coverage
```

Expected: PASS. If a test asserts the row exists, delete that assertion (it's no longer real behavior).

- [ ] **Step 3: Commit via /commit**

---

## Task 6: Delete the dormant suggest banner

**Files:**
- Delete: `apps/mobile/src/hooks/use-conversation-language-suggest.ts`
- Delete: `apps/mobile/src/hooks/use-conversation-language-suggest.test.ts`
- Modify: any sign-out cleanup file that registers `i18n-auto-suggest-dismissed`

- [ ] **Step 1: Locate the AsyncStorage cleanup registration**

Use Grep for `i18n-auto-suggest-dismissed` across `apps/mobile/src/`. Remove the registration entry.

- [ ] **Step 2: Delete the hook + test**

```bash
rm apps/mobile/src/hooks/use-conversation-language-suggest.ts
rm apps/mobile/src/hooks/use-conversation-language-suggest.test.ts
```

- [ ] **Step 3: Verify nothing imports the hook**

Use Grep for `useConversationLanguageSuggest` and `use-conversation-language-suggest`. Should return zero hits.

- [ ] **Step 4: Run cleanup-related tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/services/storage --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Commit via /commit**

---

## Task 7: Final verification + cleanup sweep

- [ ] **Step 1: Grep for orphaned references**

Use Grep for each of these across the entire monorepo:
- `conversation_language` — should remain in DB schema, migration, Zod, LLM router, profile mapper, GDPR export, sync hook, integration test fixtures. Should NOT remain in onboarding routes, more.tsx, suggest hook, or any deleted file.
- `useConversationLanguageSuggest` — zero hits
- `i18n-auto-suggest-dismissed` — zero hits
- `language-picker` — zero hits
- `MENTOR_LANGUAGE_KEYS` — zero hits if no longer used
- `maybePromptUiSwap` — zero hits

- [ ] **Step 2: Full mobile typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Full API typecheck + tests**

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
```

Expected: PASS.

- [ ] **Step 4: Run integration tests for onboarding + profile**

```bash
pnpm exec nx run api:test -- onboarding.integration
pnpm exec nx run api:test -- profile.integration
```

Expected: PASS.

- [ ] **Step 5: Manual smoke test (web preview)**

Launch mobile web preview, sign in, change UI language in Settings → "App Language" → confirm:
1. Mentor session continues in the new language on next exchange (verify by starting a new session).
2. No "Mentor Language" row appears in Settings.
3. Onboarding for a fresh account no longer prompts for mentor language.

If web smoke is impractical, document this as `manual: deferred to next device test` per the Verified-By column rule.

- [ ] **Step 6: Final commit if any sweep changes were made via /commit**

---

## Verified By

| Change | Verified By |
|--------|-------------|
| CHECK constraint accepts `ja`/`nb` | `test: onboarding.integration.test.ts:"accepts widened locales"` (add this case in Task 1) |
| Sync hook patches on language change | `test: use-mentor-language-sync.test.ts:"patches profile when i18next language differs"` |
| Sync hook no-ops on match | `test: use-mentor-language-sync.test.ts:"does not patch when languages already match"` |
| Sync hook rejects unsupported locales | `test: use-mentor-language-sync.test.ts:"does not patch when i18next language is not a supported mentor language"` |
| Onboarding step removed | `manual: fresh-account onboarding flow no longer shows the mentor-language step` |
| Settings row removed | `manual: more.tsx Settings panel no longer shows Mentor Language row` |
| Dead suggest banner removed | grep returns zero hits for `useConversationLanguageSuggest` (Task 7 step 1) |
| LLM still receives correct language | unchanged — `router.test.ts:555-630` already asserts the preamble |

---

## Rollback

This change is reversible. If a regression appears:
- Revert the mobile sync hook + onboarding/Settings deletions (single commit revert).
- Revert the migration: optional — the widened whitelist accepts a strict superset of values, so it can stay even if the rest is rolled back. No data loss either way.
- Existing rows are unaffected: `conversation_language` keeps its prior value until the user changes UI language.

Rollback is possible. No data loss.
