# i18n Phase 1 — LLM Language Threading

**Status:** Draft
**Date:** 2026-05-26
**Owner:** zuzana.kopecna@zwizzly.com
**Related:** `docs/specs/2026-05-26-i18n-phase2-ui-strings-hygiene.md` (independent follow-up PR)

## Problem

LLM-generated cards (book suggestions, summaries, monthly reports, progress reports, session recaps, quizzes, homework summaries) render in English regardless of the learner's selected UI language. Reproduces on every non-English locale.

**Root cause.** The mobile client correctly persists the UI language to `profiles.conversation_language` via `useMentorLanguageSync` (`apps/mobile/src/hooks/use-mentor-language-sync.ts:10`), and the LLM router already accepts a `conversationLanguage` option that prepends a "write the learner-visible prose in {language}" directive to the safety preamble (`apps/api/src/services/llm/router.ts:184-208`).

The breakage is at the call sites: of the ~30 server-side `routeAndCall(...)` invocations in `apps/api/src/services/**`, **only one — `exchanges.ts:1304`** — passes the `conversationLanguage` option. Every other LLM-producing service calls the router with no language directive, and the model defaults to English.

## Goals

1. Every learner-facing LLM call threads `conversationLanguage` from the active profile through `routeAndCall`.
2. A forward-only CI ratchet test fails on any new `routeAndCall` call site in a non-excluded service file that omits `conversationLanguage`.
3. The first LLM call on a brand-new profile uses the device locale (no English flash on signup).
4. UI language changes after profile creation continue to flow through `useMentorLanguageSync` (unchanged from today).

## Non-Goals

- Regenerating LLM cards that were already cached in English. New cards in the new language; old cards stay as the learner already read them.
- Expanding `SUPPORTED_LANGUAGES` (UI shell) to match `conversationLanguageSchema` (LLM-prose). The 7-vs-10 asymmetry is intentional and documented in Phase 2.
- Per-card "Translate" affordance on existing English cards.
- UI strings (`en.json` and the six locale files) — that's Phase 2.

## Architecture

### Threading pattern (uniform across all services)

Every service function that calls `routeAndCall` to produce learner-visible prose accepts a `conversationLanguage?: ConversationLanguage` parameter and forwards it into the `routeAndCall` options object. Callers — route handlers and Inngest functions — load the active profile and pass the field down. This mirrors the existing pattern in `exchanges.ts:265, 1311`.

```ts
// Example — services/session-recap.ts (illustrative)
export async function generateSessionRecap(input: {
  sessionId: string;
  profileId: string;
  conversationLanguage?: ConversationLanguage; // NEW
}) {
  // …
  const result = await routeAndCall(messages, 2, {
    flow: 'session.recap',
    sessionId: input.sessionId,
    conversationLanguage: input.conversationLanguage, // NEW
  });
  // …
}
```

Route handlers read the active profile from `profileScope` middleware context (`apps/api/src/middleware/profile-scope.ts:199` already exposes `profile.conversationLanguage`). Inngest functions that operate on a `profileId` payload load the profile inside the step and pass `conversationLanguage` to the service call.

### Services to update (production code in `apps/api/src/services/**`)

The list below is **illustrative, not exhaustive**. A grep at implementation time (see "Audit step" below) will surface the full inventory of `routeAndCall` call sites; each file that's not in the denylist and produces learner-visible prose accepts and forwards `conversationLanguage`. Files whose role is ambiguous on first read (e.g. `filing.ts`, `learner-input.ts`, `learner-profile.ts`, `parking-lot.ts`, `recall-bridge.ts`, `retention-data.ts`, `session/session-crud.ts`, `session/session-depth.ts`, `session/topic-probe-extraction.ts`, `vocabulary-extract.ts`) are triaged during implementation — each lands in either "thread the param" or the denylist with a one-line reason. The ratchet test in step 4 enforces that decision.

Confirmed learner-prose services (illustrative):

- `assessments.ts` (3 `routeAndCall` sites at lines 283, 330, 431)
- `book-generation.ts` (1 site at 117)
- `book-suggestion-generation.ts` (1 site at 109)
- `curriculum.ts` (3 sites at 110, 157, 2296)
- `dictation/generate.ts` (1 site at 208)
- `dictation/prepare-homework.ts` (1 site at 78)
- `dictation/review.ts` (1 site at 216)
- `homework-summary.ts` (1 site at 286)
- `monthly-report.ts`
- `progress-summary.ts`
- `quiz/generate-round.ts`
- `session-highlights.ts`
- `session-llm-summary.ts`
- `session-recap.ts`
- `summaries.ts` (1 site at 75-area)

For services called from Inngest functions, the corresponding `apps/api/src/inngest/functions/**` files load `profile.conversationLanguage` and pass it to the service. For services called from Hono route handlers, the route reads from `profile-scope` middleware context.

### Services deliberately excluded (denylist)

These four services produce internal-classification output, not learner prose. Threading `conversationLanguage` would either be a no-op or actively wrong (instructing the model to write Norwegian when we're parsing JSON taxonomy slugs):

| File | Why excluded |
|---|---|
| `apps/api/src/services/language-detect.ts` | Output is `{lang: "en"}` — language identification, not prose. |
| `apps/api/src/services/subject-classify.ts` | Output is a fixed taxonomy slug. |
| `apps/api/src/services/subject-resolve.ts` | Output is a fixed taxonomy slug. |
| `apps/api/src/services/ocr.ts` | Output is text extracted from a source image in the image's own language; learner UI locale is irrelevant. |
| `apps/api/src/services/memory/dedup-llm.ts` | Output is a similarity decision (`{duplicate: bool, ...}`), not prose. |

Each excluded file gets a one-line marker comment on the same line as the `routeAndCall` call:

```ts
// conversationLanguage not threaded: output is taxonomy slug, not learner prose
const result = await routeAndCall(messages, 1, { flow: 'subject.classify' });
```

The marker exists so a future contributor sees an explicit "this is intentional" signal before "fixing" the omission.

### Signup-time fix for the first-render race

Today: a brand-new profile is created server-side with `conversation_language` defaulting to `'en'` (DB CHECK default). The mobile client then calls `useMentorLanguageSync` post-load, which patches the profile to the UI language. Between profile creation and the patch resolving, any LLM card triggered (e.g. by the welcome flow) uses `'en'`.

Fix:

1. **Schema.** Extend `createProfileInputSchema` in `packages/schemas/src/profiles.ts` with an optional `conversationLanguage?: ConversationLanguage` field (validated by existing `conversationLanguageSchema`). Already-validated values mean no new DB constraint required (migration 0087 already allows all 10).

2. **API.** `createProfile` in `apps/api/src/services/profile.ts:307` writes the field to the insert when present:

   ```ts
   const [row] = await db
     .insert(profiles)
     .values({
       accountId,
       displayName: input.displayName,
       avatarUrl: input.avatarUrl ?? null,
       birthYear,
       location: input.location ?? null,
       isOwner: isOwner ?? false,
       conversationLanguage: input.conversationLanguage, // NEW — undefined falls through to DB default 'en'
     })
     .returning();
   ```

3. **Mobile.** Every call site that POSTs `createProfile` reads `i18next.language`, clamps it through `conversationLanguageSchema.safeParse`, and includes the parsed value in the request body. If the parse fails (e.g. some edge-case `languageTag` that isn't one of the 10), the field is omitted and the server falls back to the DB default. Call sites to update:

   - `apps/mobile/src/app/onboarding/profile-setup.tsx` (or equivalent — the first profile is created during onboarding)
   - `apps/mobile/src/app/(app)/more/children/add.tsx` (parent adding a child)
   - Any other `createProfile`-shaped POST surface; an exhaustive `git grep` for the route's mutation hook will find them.

   For child profiles created by a parent, use the **parent's** current `i18next.language` — children inherit the device locale at creation, then can be edited from `more/children/[id]/edit.tsx` later.

4. **`useMentorLanguageSync` unchanged.** It remains the steady-state path for UI language changes after the profile exists. No race for established profiles — the field is already persisted.

### Runtime tripwire (warn, not throw)

Inside `routeAndCall`, after option parsing, before the model call:

```ts
const LEARNER_FACING_FLOWS = new Set([
  'exchange.process',
  'session.recap',
  'session.highlights',
  'session.llm.summary',
  'monthly.report',
  'progress.summary',
  'book.generation',
  'book.suggestion',
  'curriculum.generate',
  'dictation.generate',
  'dictation.review',
  'homework.summary',
  'homework.prepare',
  'quiz.generate',
  'assessment.evaluate',
  // …source of truth lives next to LEARNER_FACING_FLOWS in router.ts
]);

if (
  options.flow &&
  LEARNER_FACING_FLOWS.has(options.flow) &&
  !options.conversationLanguage
) {
  console.warn(
    `[llm.language.missing] flow=${options.flow} sessionId=${options.sessionId ?? 'n/a'}`,
  );
}
```

No throw. Surfaces accidental new call sites that escape the static ratchet (e.g. a `flow:` tag added to the allowlist without the matching `conversationLanguage:` thread). Logs are scrapeable in Cloudflare logs / Sentry breadcrumbs.

### Forward-only CI ratchet (denylist-based)

New test: `apps/api/src/services/llm/router.language-coverage.test.ts`.

Pattern (mirrors `apps/api/src/services/safe-non-core.guard.test.ts`):

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { globSync } from 'glob'; // or equivalent

// Exact file paths whose routeAndCall output is internal classification, not prose.
const INTERNAL_NON_PROSE_FILES = new Set([
  'apps/api/src/services/language-detect.ts',
  'apps/api/src/services/subject-classify.ts',
  'apps/api/src/services/subject-resolve.ts',
  'apps/api/src/services/ocr.ts',
  'apps/api/src/services/memory/dedup-llm.ts',
]);

describe('routeAndCall sites must thread conversationLanguage', () => {
  it('every learner-facing service that calls routeAndCall threads conversationLanguage in the same call', () => {
    const files = globSync('apps/api/src/services/**/*.ts', {
      ignore: ['**/*.test.ts', '**/*.test.tsx'],
    });
    const violations: string[] = [];
    for (const f of files) {
      const rel = path.relative(process.cwd(), f).replaceAll('\\', '/');
      if (INTERNAL_NON_PROSE_FILES.has(rel)) continue;
      const src = fs.readFileSync(f, 'utf-8');
      // Find every routeAndCall( ... ) — multi-line aware via balanced-paren scan.
      const sites = findRouteAndCallSites(src);
      for (const site of sites) {
        if (!/\bconversationLanguage\s*:/.test(site.text)) {
          violations.push(`${rel}:${site.startLine} — routeAndCall without conversationLanguage`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
```

Critically: the test enumerates **every** file under `services/**`, and the only files allowed to skip the check are the five in `INTERNAL_NON_PROSE_FILES`. A new service file added under any name defaults to "must thread." A rename of an excluded file requires updating the denylist — visible diff.

`findRouteAndCallSites` walks the source string finding `routeAndCall(` and capturing through the matched closing paren so multi-line option objects are caught. (We don't need ts-morph here — it's a structural existence check, not a deep AST analysis.)

### Behavioural regression test (eval harness, Tier 1)

`apps/api/eval-llm/` already supports building per-flow prompt snapshots. Add one fixture per non-English UI locale (de, es, ja, nb, pl, pt) for the `session.recap` flow:

```
apps/api/eval-llm/fixtures/session-recap/nb-locale.fixture.ts
```

Each fixture builds the recap context with `conversationLanguage: 'nb'` (etc.), runs the prompt assembly, and snapshots the system prompt. The snapshot is asserted to contain the substring `"in Norwegian"` (the exact directive from `CONVERSATION_LANGUAGE_NAMES` in `router.ts:151`). Tier 1 (no live LLM call) — we're testing prompt assembly, not the model.

Six fixtures total, one per non-English UI locale. Tier 2 (live LLM) verification is not required — the prompt-assembly test is sufficient evidence that the directive reaches the model.

## File Map

**New:**
- `apps/api/src/services/llm/router.language-coverage.test.ts` — denylist ratchet.
- `apps/api/eval-llm/fixtures/session-recap/{de,es,ja,nb,pl,pt}-locale.fixture.ts` — six Tier-1 prompt snapshots.

**Edited:**
- `packages/schemas/src/profiles.ts` — add `conversationLanguage?` to `createProfileInputSchema`.
- `apps/api/src/services/profile.ts:307` — write field through to insert.
- `apps/api/src/services/llm/router.ts` — `LEARNER_FACING_FLOWS` set + warn block.
- ~14 service files listed in "Services to update" — add parameter + forward to `routeAndCall`.
- ~14 corresponding Inngest functions / route handlers — load profile, pass `conversationLanguage` down.
- 5 service files listed in "Services deliberately excluded" — add `// conversationLanguage not threaded: <reason>` comment.
- Mobile `createProfile` POST call sites — include `conversationLanguage` from `i18next.language`.

**Audit step:** before writing call-site changes, run:

```bash
grep -rln "routeAndCall(" apps/api/src/services --include="*.ts" | grep -v test
```

Confirm the file list matches the spec. If a service was added since this spec was written, add it to either "Services to update" or `INTERNAL_NON_PROSE_FILES` (with reason) in the same PR.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| `conversationLanguage` omitted at new call site | Developer adds a `routeAndCall` site without the param | English LLM card | CI ratchet test fails the PR; developer adds the param or adds the file to `INTERNAL_NON_PROSE_FILES` with reason |
| New flow added to `LEARNER_FACING_FLOWS` but service doesn't thread param | Developer wires a new learner-facing flow tag | English LLM card | Runtime warn `[llm.language.missing] flow=<flow>` in logs surfaces the gap |
| Signup with `i18next.language` not in `conversationLanguageSchema` | Edge-case device locale (e.g. `'mi'`) | DB default `'en'` used, learner sees English until they pick a UI language manually | Acceptable — UI shell wouldn't support that locale anyway; `useMentorLanguageSync` no-ops |
| Mobile fails to include `conversationLanguage` on `createProfile` (forgot a call site) | Mobile call site not updated | First few LLM cards in English until `useMentorLanguageSync` patches the profile | `useMentorLanguageSync` recovers within ms of profile load; surfaces in QA if a call site is missed |
| Inngest function omits the field when calling a service | Background recap generated without language | English card delivered async | Runtime warn fires; CI ratchet only covers `services/`, not `inngest/` — add a smoke integration test that triggers a recap for a `nb` profile and asserts the resulting card contains non-ASCII |

## Rollback

Reversible. Each commit can be reverted independently:

1. Revert mobile call-site changes — server falls back to DB default `'en'`.
2. Revert API service-by-service threading — `routeAndCall` ignores undefined `conversationLanguage`, falls back to no directive (today's behaviour).
3. Revert schema change — `createProfileInputSchema` no longer accepts the field; mobile sends are ignored as extra fields if `.strict()` isn't enabled, or rejected at the boundary if it is (verify before reverting).
4. Drop the new test file.

No data lost. No migration. No destructive operation.

## Validation

- `pnpm exec nx run api:test` passes (existing + new ratchet test).
- `pnpm exec nx test:integration api` passes (the integration smoke for `nb` recap).
- `pnpm eval:llm` snapshots include the six new locale fixtures.
- Manual: change UI language to Norwegian on a fresh emulator profile, trigger a session recap, confirm the card prose is Norwegian.
