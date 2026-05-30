# i18n Phase 1 — LLM Language Threading

**Status:** Draft (adversarial review applied 2026-05-26)
**Date:** 2026-05-26
**Owner:** zuzana.kopecna@zwizzly.com
**Related:** `docs/specs/2026-05-26-i18n-phase2-ui-strings-hygiene.md` (independent follow-up PR)

**Review log (2026-05-26):** Pass-1 findings folded in — ratchet glob expanded to cover `inngest/` + `routes/`; `post-session-suggestions.ts` added as a confirmed learner-prose call site outside `services/**`; tripwire upgraded from `flow:`-gated warn to mandatory same-PR `flow:` tagging rule; "ambiguous service" deferral resolved by classifying the 10 candidates against code (9 deny, 1 thread — `recall-bridge.ts`); eval-fixture coverage expanded from `session.recap` only to one fixture per learner-prose flow; child-from-parent signup race resolved by omit-and-let-DB-default instead of inheriting parent's locale; `pronouns:` parameter decision recorded.

**Second adversarial review (2026-05-26):** Pass-1 + Pass-2 findings folded in — schema step corrected (`profileCreateSchema`, not `createProfileInputSchema`; `conversationLanguage` already optional at line 67 — step downgraded to a verification); flow-tag set now uses **exact existing tag strings** (mixed dotted/hyphenated) so the runtime tripwire actually matches today's tags; ratchet handles the `quiz/generate-round.ts` wrapper via an explicit `IDENTIFIER_FORWARDING_FILES` allowlist (caller-chain trust); `book-generation.ts:117` and `book-suggestion-generation.ts:109` reclassified — neither passes `flow:` today; `session-recap.ts:358` and `session-highlights.ts:249` rows promoted from "verify" to "add"; mobile call-site paths corrected to the verified `(app)/_components/*` set; DI-via-function-reference invisibility to the ratchet documented; nb-locale integration smoke added to File Map; tripwire emits via `logger.warn` (project structured-logging convention) instead of `console.warn`; `findRouteAndCallSites` references `safe-non-core.guard.test.ts` as the canonical balanced-scan implementation.

**Third adversarial review (2026-05-27):** Three structural defects folded in — **(CRITICAL-A)** the mobile call-site inventory was sourced from `git grep -l createProfile` and was mostly false positives: three of the four `(app)/_components/*Gate.tsx` files only contain the i18n key `tabs.createProfile.*`, they do not POST. Verified via `grep -rn "client.profiles.\$post"` — real call sites are `apps/mobile/src/app/create-profile.tsx:209` and `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:104, 135`. List replaced. **(CRITICAL-B)** the ratchet regex `\brouteAndCall\s*\(` does NOT match `routeAndCallForQuiz(` (word boundary on the F-side), and `IDENTIFIER_FORWARDING_FILES` skipped the whole file — leaving the three real caller sites at `generate-round.ts:558, 626, 675` invisible to the ratchet. Replaced with an alternation regex `\b(routeAndCall|routeAndCallForQuiz)\s*\(` plus a per-site (file + line) `WRAPPER_FORWARDER_SITES` allowlist that exempts only the wrapper-internal line, not the whole file. **(HIGH-A)** WIP-coordination section added — the `fix-onboarding` branch is actively editing `create-profile.tsx` and adds a new `apps/mobile/src/app/ready.tsx` reflection screen between profile creation and the first session; spec changes must rebase onto the WIP, not into a competing branch. Rollback step 3 corrected to drop the `createProfileInputSchema` fossil; per-flow snapshot count corrected to "16 new + 1 verify"; comment added that `birthMonth`/`birthDay` are intentionally not persisted.

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

### Call sites to update — full inventory

Every `routeAndCall(` site in `apps/api/src/{services,inngest,routes}/**` is classified below. No "ambiguous, triage in PR" deferral — the 10 services originally flagged ambiguous have been read and assigned. The ratchet test in step 4 enforces these assignments.

**Learner-prose services (thread `conversationLanguage`):**

| File | Sites | Notes |
|---|---|---|
| `assessments.ts` | 283, 330, 431 | No `flow:` today — add per HIGH-2 rule. |
| `book-generation.ts` | 117 | Has options `{providerPolicy, responseFormat}` but NO `flow:` today — add per HIGH-2 rule. |
| `book-suggestion-generation.ts` | 109 | Has options `{responseFormat}` but NO `flow:` today — add per HIGH-2 rule. |
| `curriculum.ts` | 110, 157, 2296 | No `flow:` today — add per HIGH-2 rule. |
| `dictation/generate.ts` | 208 | No `flow:` today — add. |
| `dictation/prepare-homework.ts` | 78 | No `flow:` today — add. |
| `dictation/review.ts` | 216 | Already passes `flow: 'dictation.review'`. |
| `homework-summary.ts` | 286 | No `flow:` today — add. |
| `monthly-report.ts` | 206 | No `flow:` today — add. |
| `progress-summary.ts` | 172 | Already passes `flow: 'progress-summary-generation'` (existing hyphenated tag — preserved in `LEARNER_FACING_FLOWS`). |
| `quiz/generate-round.ts` | 92 | **Variable-forwarding wrapper** (`routeAndCallForQuiz(messages, rung, options)`). Caller must include both `conversationLanguage:` AND `flow:` in the options object. Listed in `IDENTIFIER_FORWARDING_FILES` (see ratchet) — ratchet trusts caller chain, not the wrapper line. |
| `session-highlights.ts` | 249 | Has options `{ageBracket}` but NO `flow:` today — add per HIGH-2 rule. |
| `session-llm-summary.ts` | 256 | Already passes `flow: 'session-llm-summary'` (existing hyphenated tag — preserved in `LEARNER_FACING_FLOWS`). |
| `session-recap.ts` | 358 | No options object at all today — add both `flow:` and `conversationLanguage:`. |
| `summaries.ts` | 119 | No `flow:` today — add. |
| `recall-bridge.ts` | 87 | **Reclassified from "ambiguous" → thread.** Output is recall-bridge prose questions delivered directly to the learner ("Generate recall bridge questions… Return ONLY the questions, one per line"). |

**Learner-prose call sites OUTSIDE `services/**` (also thread):**

| File | Site | Notes |
|---|---|---|
| `apps/api/src/inngest/functions/post-session-suggestions.ts` | 167 | Emits next-step topic titles ("Topic A / Topic B") shown to the learner. Inngest event payload carries `profileId`; load `profile.conversationLanguage` inside the step before the call. Add `flow: 'post.session.suggestions'`. |

### Services deliberately excluded (denylist) — internal classification, not prose

These produce internal-classification / extraction output, not learner-visible prose. Threading `conversationLanguage` would either be a no-op or actively wrong (instructing the model to write Norwegian when we're parsing JSON taxonomy slugs or numeric scores):

| File | Site | Why excluded |
|---|---|---|
| `apps/api/src/services/language-detect.ts` | 58 | Output is `{lang: "en"}` — language identification, not prose. |
| `apps/api/src/services/subject-classify.ts` | 120, 206 | Output is a fixed taxonomy slug. |
| `apps/api/src/services/subject-resolve.ts` | 95 | Output is a fixed taxonomy slug. |
| `apps/api/src/services/ocr.ts` | 130 | Output is text extracted from a source image in the image's own language; learner UI locale is irrelevant. |
| `apps/api/src/services/memory/dedup-llm.ts` | 32 | Output is a similarity decision (`{duplicate: bool, ...}`), not prose. |
| `apps/api/src/services/filing.ts` | 331 | **Reclassified from "ambiguous" → deny.** Output is JSON subject/topic categorization for filing into curriculum. |
| `apps/api/src/services/learner-input.ts` | 119 | **Reclassified → deny.** Output is JSON analysis of a learner/parent note (struggles/interests); not user-visible prose. |
| `apps/api/src/services/learner-profile.ts` | 1758 | **Reclassified → deny.** Output is JSON session analysis (resolved topics, signals) — internal inference. |
| `apps/api/src/services/parking-lot.ts` | 78 | **Reclassified → deny.** Output is the literal token `"tangential"` / `"ontopic"` — binary classifier. |
| `apps/api/src/services/retention-data.ts` | 165 | **Reclassified → deny.** Output is an integer 0-5 quality score. |
| `apps/api/src/services/session/session-crud.ts` | 582 | **Reclassified → deny.** Topic-intent matcher; output is JSON intent classification. Already passes `flow: 'topic-intent-matcher'`. |
| `apps/api/src/services/session/session-depth.ts` | 131 | **Reclassified → deny.** Depth-analysis JSON (topics array) — internal metric extraction. |
| `apps/api/src/services/session/topic-probe-extraction.ts` | 113 | **Reclassified → deny.** Signal extraction from transcript — internal JSON. |
| `apps/api/src/services/vocabulary-extract.ts` | 66 | **Reclassified → deny.** Vocabulary-item extraction; vocab terms are in the source-language anyway. |
| `apps/api/src/routes/test-seed.ts` | 265 | Test-seeding infrastructure, not learner-facing. |

Each excluded file gets a one-line marker comment on the same line as the `routeAndCall` call:

```ts
// conversationLanguage not threaded: output is taxonomy slug, not learner prose
const result = await routeAndCall(messages, 1, { flow: 'subject.classify' });
```

The marker exists so a future contributor sees an explicit "this is intentional" signal before "fixing" the omission.

### Signup-time fix for the first-render race

Today: a brand-new profile is created server-side with `conversation_language` defaulting to `'en'` (DB CHECK default). The mobile client then calls `useMentorLanguageSync` post-load, which patches the profile to the UI language. Between profile creation and the patch resolving, any LLM card triggered (e.g. by the welcome flow) uses `'en'`.

Fix:

1. **Schema — no change required (verified).** The schema is `profileCreateSchema` in `packages/schemas/src/profiles.ts:56-70` (not `createProfileInputSchema`); `conversationLanguage: conversationLanguageSchema.optional()` is already on line 67. Verify the wire path accepts the field through unchanged before moving to step 2.

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

3. **Mobile.** Every call site that POSTs `createProfile` reads `i18next.language`, clamps it through `conversationLanguageSchema.safeParse`, and includes the parsed value in the request body. If the parse fails (e.g. some edge-case `languageTag` that isn't one of the 10), the field is omitted and the server falls back to the DB default.

   **Verified call sites** (third-review CRITICAL-A fix — sourced from `grep -rn "client.profiles.\$post" apps/mobile/src`, not the loose `git grep -l createProfile` which produced false positives for files that only render the `tabs.createProfile.*` i18n key):

   - `apps/mobile/src/app/create-profile.tsx:209` — **PRIMARY self-and-child create surface.** Single screen that branches on `isAddingChild` (computed earlier in the file). Apply the rule per-branch: self-create includes `conversationLanguage: parsed.data`; child-create (i.e. `isAddingChild === true`) OMITS the field (see MED-2 rationale below).
   - `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:104` — first save-wizard POST.
   - `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:135` — second save-wizard POST (different code path in the same screen). Both call sites must apply the same self-vs-child branching rule used in `create-profile.tsx`. Confirm the surrounding code resolves `isAddingChild` (or equivalent flag) before editing.

   **The three `(app)/_components/*Gate.tsx` files (`CreateProfileGate`, `ConsentPendingGate`, `ConsentWithdrawnGate`) do NOT POST and need no change here.** They render i18n strings and route the user to one of the verified call sites above. Earlier drafts listed them based on i18n-key grep false positives.

   Re-run the verified-call-site grep before starting work in case a new surface lands between spec and implementation:

   ```bash
   grep -rn "client.profiles.\\\$post" apps/mobile/src
   ```

   **For child profiles created by a parent: OMIT the field** and let the DB default `'en'` apply. Rationale (MED-2): the parent's `i18next.language` does not reliably predict the child's language (cross-language families exist — Norwegian-speaking child on an English-UI parent account, or vice versa). The DB default is at least predictable; using parent's locale is silently-wrong-in-some-families. When the child first signs in on their own device, `useMentorLanguageSync` overwrites the row to match the child's UI choice. Until then, pre-sync LLM cards rendered for parent-initiated work (e.g. parent-triggered topic suggestion) render in English — the same fallback as adult solo signup before sync resolves.

### WIP coordination (third review — HIGH-A)

As of 2026-05-27 a `fix-onboarding` branch is in flight that (a) edits `apps/mobile/src/app/create-profile.tsx` (copy + button-label changes around the same `client.profiles.$post` call at line 209) and (b) adds a new `apps/mobile/src/app/ready.tsx` reflection screen between profile creation and the first session. Implementation order:

1. Land `fix-onboarding` (or rebase this spec's mobile edits on top of it). Do not open a competing branch that touches `create-profile.tsx:209` — the two diffs will conflict, and the WIP renames neighbouring strings.
2. After landing, the line number for the POST call may shift; re-verify with `grep -n "client.profiles.\\\$post" apps/mobile/src/app/create-profile.tsx` before editing.
3. The new `ready.tsx` screen lives OUTSIDE `(app)/` and therefore does NOT mount `useMentorLanguageSync`. The race window the signup-time fix targets is unchanged by WIP — and `create-subject.tsx` (also edited by WIP) can trigger `POST /sessions` with server-side curriculum-prep LLM calls before the user ever reaches `(app)/session`. The "thread `conversationLanguage` in the create-profile POST body" approach in this spec is still the correct fix; do not be tempted to defer it on the assumption that "ready.tsx adds a delay so the patch-after race resolves itself" — it doesn't, because the server-side LLM calls fire on `POST /sessions`, not on session-screen mount.

4. **`useMentorLanguageSync` unchanged.** It remains the steady-state path for UI language changes after the profile exists. No race for established profiles — the field is already persisted.

### Runtime tripwire (warn, not throw) + mandatory `flow:` threading rule

**Structural finding (HIGH-2):** the tripwire's predicate is `options.flow && LEARNER_FACING_FLOWS.has(options.flow)`. Most existing learner-prose call sites (`assessments.ts`, `curriculum.ts`, `dictation/generate.ts`, `dictation/prepare-homework.ts`, `homework-summary.ts`, `monthly-report.ts`, `summaries.ts`) currently pass NO options object. After threading `conversationLanguage:` alone, those call sites would still fail to trigger the warn — the tripwire would be effectively dead for half the target surface.

**Rule:** every call site touched by this PR adds `flow:` *and* `conversationLanguage:` together. The `LEARNER_FACING_FLOWS` set is **introduced by this PR** (verified: `grep -n LEARNER_FACING_FLOWS apps/api/src/services/llm/router.ts` returns 0 hits today). Adding `flow:` also closes the existing `llm.stop_reason` metric gap at `router.ts:710`, which today logs `flow: undefined` for most surfaces.

**Tag-string convention (CRITICAL-2):** existing flow tags in the codebase use mixed conventions — `exchange.process` and `dictation.review` are dotted; `progress-summary-generation` and `session-llm-summary` are hyphenated. The set below **preserves existing tag strings verbatim** so the runtime tripwire actually matches today's tags (no renames in this PR — renaming would silently break the `llm.stop_reason` dashboard queries that filter by these strings). New flow tags introduced by this PR adopt the dotted convention for consistency going forward; a follow-up PR may normalize the legacy hyphenated tags with a coordinated dashboard update.

```ts
// Inside routeAndCall, after option parsing, before the model call.
// IMPORTANT: tag strings are load-bearing — they appear in llm.stop_reason
// dashboards and Sentry breadcrumbs. Do not normalize without a paired
// dashboard sweep. Source of truth lives here in router.ts.
const LEARNER_FACING_FLOWS = new Set([
  // Pre-existing tags (verbatim — DO NOT rename in this PR):
  'exchange.process',                  // exchanges.ts:1313
  'dictation.review',                  // dictation/review.ts:216
  'progress-summary-generation',       // progress-summary.ts:173 (hyphenated — preserved)
  'session-llm-summary',               // session-llm-summary.ts:257 (hyphenated — preserved)

  // New tags introduced by this PR (dotted convention):
  'session.recap',                     // session-recap.ts:358
  'session.highlights',                // session-highlights.ts:249
  'monthly.report',                    // monthly-report.ts:206
  'book.generation',                   // book-generation.ts:117
  'book.suggestion',                   // book-suggestion-generation.ts:109
  'curriculum.generate',               // curriculum.ts:110, 157, 2296
  'dictation.generate',                // dictation/generate.ts:208
  'dictation.prepare-homework',        // dictation/prepare-homework.ts:78
  'homework.summary',                  // homework-summary.ts:286
  'quiz.generate',                     // quiz/generate-round.ts (via caller)
  'assessment.evaluate',               // assessments.ts:283, 330, 431
  'recall.bridge',                     // recall-bridge.ts:87
  'post.session.suggestions',          // inngest/functions/post-session-suggestions.ts:167
  'summaries.generate',                // summaries.ts:119
]);

if (
  options.flow &&
  LEARNER_FACING_FLOWS.has(options.flow) &&
  !options.conversationLanguage
) {
  // LOW-2: use the project's structured logger (matches the existing
  // llm.stop_reason emission at router.ts:81), not console.warn.
  // Structured fields bucket cleanly in Cloudflare logs / Sentry breadcrumbs.
  logger.warn('llm.language.missing', {
    flow: options.flow,
    sessionId: options.sessionId ?? null,
  });
}
```

No throw. The static ratchet is the primary defence; this warn is a secondary tripwire for call sites that pass `flow:` (so the ratchet would have caught them) but somehow shipped without `conversationLanguage:` — e.g. via a partial revert. Logs are scrapeable in Cloudflare logs / Sentry breadcrumbs.

### `pronouns:` parameter — explicit non-goal

The router's personalization preamble (`router.ts:184-208`) accepts BOTH `conversationLanguage` and `pronouns`. `exchanges.ts:1311-1312` threads both today. Phase 1 threads only `conversationLanguage` and explicitly defers `pronouns`. Rationale: pronoun-threading is a personalization feature with its own product decisions (when do we surface pronouns, how do they affect prose, do they apply to child profiles created by a parent, etc.) — not an i18n cleanup. Bundling it into Phase 1 widens scope; deferring to a dedicated PR (call it Phase 1.5 if needed) keeps i18n changes auditable in isolation. The same files will be touched again — accepted cost.

### Forward-only CI ratchet (denylist-based)

New test: `apps/api/src/services/llm/router.language-coverage.test.ts`.

Pattern (mirrors `apps/api/src/services/safe-non-core.guard.test.ts`).

**Glob (HIGH-1 fix):** the scan covers `apps/api/src/{services,inngest,routes}/**/*.ts`, not just `services/**`. This catches `inngest/functions/post-session-suggestions.ts:167` (currently a real production English-leak — emits topic-title suggestions to the learner) and any future learner-prose call site added under `routes/` or `inngest/`. Test infrastructure (`routes/test-seed.ts`) is in the denylist below.

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { globSync } from 'glob'; // or equivalent

// Exact file paths whose routeAndCall output is internal classification, not prose.
// Renaming any of these requires editing this denylist — visible diff.
const INTERNAL_NON_PROSE_FILES = new Set([
  'apps/api/src/services/language-detect.ts',
  'apps/api/src/services/subject-classify.ts',
  'apps/api/src/services/subject-resolve.ts',
  'apps/api/src/services/ocr.ts',
  'apps/api/src/services/memory/dedup-llm.ts',
  'apps/api/src/services/filing.ts',
  'apps/api/src/services/learner-input.ts',
  'apps/api/src/services/learner-profile.ts',
  'apps/api/src/services/parking-lot.ts',
  'apps/api/src/services/retention-data.ts',
  'apps/api/src/services/session/session-crud.ts',
  'apps/api/src/services/session/session-depth.ts',
  'apps/api/src/services/session/topic-probe-extraction.ts',
  'apps/api/src/services/vocabulary-extract.ts',
  'apps/api/src/routes/test-seed.ts',
]);

// Third-review CRITICAL-B — per-SITE (file + line) exemption for the
// wrapper-internal forward call only. Previous design exempted the whole
// file via `IDENTIFIER_FORWARDING_FILES` AND used a `\brouteAndCall\s*\(`
// regex that did NOT match `routeAndCallForQuiz(` (no word-boundary on the
// F side). The combined effect: the three real caller sites at
// generate-round.ts:558, 626, 675 were invisible to the ratchet. This fix
// (a) scans both the direct `routeAndCall(` AND the `routeAndCallForQuiz(`
// alternation, (b) exempts only the wrapper-internal forwarder line, not
// the whole file, so wrapper CALLERS still get the same `flow:` +
// `conversationLanguage:` checks every other learner-prose site does.
//
// Maintenance: if `routeAndCallForQuiz` is moved or its forwarder line
// shifts, update the line number below. CI will fail loudly because the
// wrapper's options-identifier forward would otherwise be flagged.
const WRAPPER_FORWARDER_SITES = new Set<string>([
  // routeAndCallForQuiz wrapper's internal forward to routeAndCall —
  // options is forwarded as an identifier, regex would always fail here.
  'apps/api/src/services/quiz/generate-round.ts:92',
]);

describe('routeAndCall sites must thread conversationLanguage + flow', () => {
  it('every learner-facing call site threads conversationLanguage AND flow in the same call', () => {
    const files = globSync('apps/api/src/{services,inngest,routes}/**/*.ts', {
      ignore: ['**/*.test.ts', '**/*.test.tsx'],
    });
    const violations: string[] = [];
    for (const f of files) {
      const rel = path.relative(process.cwd(), f).replaceAll('\\', '/');
      if (INTERNAL_NON_PROSE_FILES.has(rel)) continue;
      const src = fs.readFileSync(f, 'utf-8');
      const sites = findRouteAndCallSites(src);
      for (const site of sites) {
        // Third-review CRITICAL-B: per-site (file:line) exemption for
        // wrapper-internal forwarders only — not the whole file.
        if (WRAPPER_FORWARDER_SITES.has(`${rel}:${site.startLine}`)) continue;
        // LOW-1 fix: scan only inside the option-object braces (site.optionsText),
        // not the whole call expression, so a stray comment containing the
        // word "conversationLanguage" upstream doesn't satisfy the regex.
        if (!/\bconversationLanguage\s*:/.test(site.optionsText)) {
          violations.push(`${rel}:${site.startLine} — ${site.callName} without conversationLanguage`);
        }
        if (!/\bflow\s*:/.test(site.optionsText)) {
          violations.push(`${rel}:${site.startLine} — ${site.callName} without flow tag`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
```

**Wrapper-name coverage (third review — CRITICAL-B).** The regex below explicitly alternates `routeAndCall` and `routeAndCallForQuiz` so the three real caller sites at `quiz/generate-round.ts:558, 626, 675` are scanned the same way as direct call sites. Only the wrapper-internal forwarder line (`generate-round.ts:92`) is exempted, via `WRAPPER_FORWARDER_SITES` (file + line, not whole-file). If a new wrapper is introduced in the future, add its name to the alternation AND add only its forwarder line to `WRAPPER_FORWARDER_SITES` — do not whole-file-exempt.

**DI-via-function-reference is invisible to the ratchet (MEDIUM-2).** The regex `\brouteAndCall\s*\(` matches only direct invocation sites. Three files in the repo pass `routeAndCall` as a function reference into a downstream receiver:

- `apps/api/src/routes/filing.ts:156` → `fileToLibrary(..., routeAndCall)`
- `apps/api/src/inngest/functions/auto-file-session.ts:93` → same receiver
- `apps/api/src/inngest/functions/freeform-filing.ts:170` → same receiver

The receiver is `services/filing.ts:331` — denylisted as JSON classification. Today the DI pattern is safe. Going forward: **any new receiver of a `routeAndCall` reference must either (a) live in a file the ratchet scans (and that file must itself invoke `routeAndCall` so the scan picks it up), or (b) be explicitly added to `INTERNAL_NON_PROSE_FILES`**. The audit step below (`grep -rln "routeAndCall("` plus a second `grep -rln "routeAndCall," | grep -v "routeAndCall("` for DI handoffs) must run in the implementation PR to confirm no new DI receivers have been introduced.

**`findRouteAndCallSites` (LOW-2 — concrete sketch):**

```ts
type CallSite = { startLine: number; text: string; optionsText: string; callName: string };

function findRouteAndCallSites(src: string): CallSite[] {
  const sites: CallSite[] = [];
  // Third-review CRITICAL-B: alternation so wrapper-name callers (e.g.
  // routeAndCallForQuiz) are scanned. The capture group records WHICH
  // name matched so violation messages can name the actual call.
  const re = /\b(routeAndCall|routeAndCallForQuiz)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const callName = m[1];
    // Walk balanced parens from after the opening '(' to find the matching ')'.
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      // Production implementation MUST skip string/template/comment bodies
      // so that braces/parens inside strings don't unbalance the scan.
      // Copy the scanner from `apps/api/src/services/safe-non-core.guard.test.ts`
      // — it already handles single/double/backtick strings, line comments,
      // and block comments with the same balanced-walk approach. Do not
      // re-derive the state machine here; share the helper.
      i++;
    }
    const text = src.slice(m.index, i);
    // Extract the third arg — the options object — by finding the second top-level
    // comma after the opening paren and capturing through the matching '}'.
    const optionsText = extractThirdArgObject(text) ?? '';
    const startLine = src.slice(0, m.index).split('\n').length;
    sites.push({ startLine, text, optionsText, callName });
  }
  return sites;
}
```

We don't need ts-morph — it's a structural existence check, not deep AST analysis. The brace-balanced scan handles multi-line option objects and is consistent with the existing `safe-non-core.guard.test.ts` pattern.

A new service file added under any name in `{services,inngest,routes}/**` defaults to "must thread `conversationLanguage` AND `flow`." A rename of a denylisted file requires editing this list — visible diff in review.

### Behavioural regression test (eval harness, Tier 1)

`apps/api/eval-llm/` already supports building per-flow prompt snapshots.

**Coverage rule (MED-3):** one fixture per learner-prose flow at a single non-English locale (`nb` chosen as canonical — distinctive enough that an English-leak snapshot diff is immediately obvious). A single-flow fixture (the original `session.recap`-only plan) only proves the directive reaches `withSafetyPreamble` for that one flow — it doesn't prove `monthly-report`, `homework-summary`, `progress-summary`, etc. actually forward the param into `routeAndCall`. Per-flow snapshots close that gap.

Fixtures to add under `apps/api/eval-llm/fixtures/<flow>/nb-locale.fixture.ts`:

- `session-recap` — assert substring `"in Norwegian"` in the system prompt
- `session-highlights`
- `session-llm-summary`
- `monthly-report`
- `progress-summary`
- `book-generation`
- `book-suggestion`
- `curriculum-generate`
- `dictation-generate`
- `dictation-prepare-homework`
- `dictation-review`
- `homework-summary`
- `quiz-generate`
- `assessment-evaluate`
- `recall-bridge`
- `post-session-suggestions`
- `exchange-process` (existing — verify still covered)

Each fixture builds the flow's context with `conversationLanguage: 'nb'`, runs the prompt assembly, and snapshots the system prompt. Assertion: snapshot contains `"in Norwegian"` (exact substring from `CONVERSATION_LANGUAGE_NAMES` in `router.ts:151`). Tier 1 (no live LLM call) — we're testing prompt assembly. Tier 2 (live LLM) verification is not required — passing prompt-assembly across every learner-prose flow + the ratchet test together are sufficient evidence the directive reaches the model.

A second sweep (`de`, `es`, `ja`, `pl`, `pt`) for a single representative flow (`session-recap`) verifies that all six non-English locales produce the right directive text — six fixtures, one flow. Cross-product (every locale × every flow) is not necessary: the per-flow `nb` fixtures prove plumbing; the per-locale `session-recap` fixtures prove the language-name lookup table.

## File Map

**New:**
- `apps/api/src/services/llm/router.language-coverage.test.ts` — `{services,inngest,routes}/**` ratchet (HIGH-1 fix). Includes `INTERNAL_NON_PROSE_FILES` denylist AND `IDENTIFIER_FORWARDING_FILES` wrapper-allowlist (CRITICAL-3 fix).
- `apps/api/eval-llm/fixtures/<flow>/nb-locale.fixture.ts` — 16 new Tier-1 prompt snapshots + 1 verify of the existing `exchange-process` fixture (one per learner-prose flow).
- `apps/api/eval-llm/fixtures/session-recap/{de,es,ja,pl,pt}-locale.fixture.ts` — 5 additional locale snapshots for the recap flow (table-coverage check on `CONVERSATION_LANGUAGE_NAMES`).
- `apps/api/src/services/session-recap.nb-locale.integration.test.ts` — end-to-end smoke (HIGH-2 from review-2 fix): seeds a profile with `conversationLanguage: 'nb'`, drives `generateSessionRecap` via the real service path, and asserts the assembled system prompt contains the Norwegian directive substring. Single-locale, single-flow — the cross-flow coverage lives in the Tier-1 prompt-assembly snapshots above; this smoke proves the threading reaches the router under real wiring (route handler → service → router) for at least one flow.

**Edited:**
- `packages/schemas/src/profiles.ts` — **no change required** (HIGH-1 from review-2). `profileCreateSchema` (line 56-70) already has `conversationLanguage: conversationLanguageSchema.optional()` at line 67. Listed here for traceability only.
- `apps/api/src/services/profile.ts:307` — write field through to insert (the only schema-side gap).
- `apps/api/src/services/llm/router.ts` — `LEARNER_FACING_FLOWS` set + warn block, plus the two new flow tags (`recall.bridge`, `post.session.suggestions`).
- 16 learner-prose service files listed in the call-sites-to-update table — add `conversationLanguage` parameter AND `flow:` tag to every `routeAndCall` site (HIGH-2 mandatory pairing).
- `apps/api/src/inngest/functions/post-session-suggestions.ts` — load `profile.conversationLanguage` from event payload, add `flow:` + `conversationLanguage:` to the `routeAndCall` site.
- Corresponding Inngest functions / route handlers for the learner-prose services — load profile, pass `conversationLanguage` down to the service.
- 15 denylisted files — add `// conversationLanguage not threaded: <reason>` comment on the `routeAndCall` line.
- Mobile `client.profiles.$post` call sites (third-review CRITICAL-A — list re-verified): `apps/mobile/src/app/create-profile.tsx:209` (branch on `isAddingChild`), `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:104`, `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:135` — include `conversationLanguage` from `i18next.language` ONLY for the self-create branch. Parent-creates-child omits the field (MED-2 fix). The three `(app)/_components/*Gate.tsx` files do NOT POST and are NOT edited by this PR.

**Audit step:** before writing call-site changes, run THREE greps:

```bash
# 1. Direct routeAndCall(...) sites — must appear in the learner-prose table OR INTERNAL_NON_PROSE_FILES.
grep -rn "routeAndCall(" apps/api/src/{services,inngest,routes} --include="*.ts" | grep -v test

# 2. Wrapper-name call sites (third-review CRITICAL-B) — `routeAndCallForQuiz(...)`
# is the only wrapper today. Each call site must thread `flow:` + `conversationLanguage:`
# in its own options object (the ratchet alternates regex to cover this).
grep -rn "routeAndCallForQuiz(" apps/api/src/{services,inngest,routes} --include="*.ts" | grep -v test

# 3. DI-via-function-reference sites (MEDIUM-2 — invisible to the ratchet).
# Each match's receiver must itself either invoke routeAndCall directly
# (and thus appear in #1) or live in INTERNAL_NON_PROSE_FILES.
grep -rn "routeAndCall," apps/api/src/{services,inngest,routes} --include="*.ts" \
  | grep -v test | grep -v "routeAndCall("
```

Confirm both lists match what this spec inventories. If a new site has been added since this spec was written, add it to either the learner-prose table, `INTERNAL_NON_PROSE_FILES`, or `IDENTIFIER_FORWARDING_FILES` (with reason) in the same PR.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| `conversationLanguage` omitted at new call site | Developer adds a `routeAndCall` site in `{services,inngest,routes}/**` without the param | English LLM card | CI ratchet test fails the PR; developer adds the param + `flow:` tag, or adds the file to `INTERNAL_NON_PROSE_FILES` with reason |
| `flow:` omitted at new call site | Developer adds `conversationLanguage:` but forgets `flow:` | English LLM card slips through tripwire; `llm.stop_reason` metric loses dimension | CI ratchet test now checks both — fails the PR |
| New flow added to `LEARNER_FACING_FLOWS` but service doesn't thread param | Developer wires a new learner-facing flow tag without matching thread | English LLM card | Runtime warn `[llm.language.missing] flow=<flow>` in logs surfaces the gap (secondary defence; primary is the ratchet) |
| Signup with `i18next.language` not in `conversationLanguageSchema` | Edge-case device locale (e.g. `'mi'`) | DB default `'en'` used, learner sees English until they pick a UI language manually | Acceptable — UI shell wouldn't support that locale anyway; `useMentorLanguageSync` no-ops |
| Mobile fails to include `conversationLanguage` on `createProfile` (forgot a call site) | Mobile call site not updated | First few LLM cards in English until `useMentorLanguageSync` patches the profile | `useMentorLanguageSync` recovers within ms of profile load; surfaces in QA if a call site is missed |
| Parent creates child with parent's UI in language X, child's actual language is Y | Cross-language family signup | Child's pre-sync window LLM cards in English (DB default), not in Y or X | Acceptable per MED-2 — English default is predictable, child-on-own-device first sign-in triggers `useMentorLanguageSync` and overwrites |
| Inngest function omits the field when calling a service | Background recap/suggestion generated without language | English card delivered async | CI ratchet now covers `inngest/` per HIGH-1 fix — fails the PR. Runtime warn fires for any escape. Eval-harness Tier-1 per-flow snapshots catch missed plumbing pre-merge. |

## Rollback

Reversible. Each commit can be reverted independently:

1. Revert mobile call-site changes — server falls back to DB default `'en'`.
2. Revert API service-by-service threading — `routeAndCall` ignores undefined `conversationLanguage`, falls back to no directive (today's behaviour).
3. Schema — nothing to revert. Step 1 made no schema change; `profileCreateSchema` (verified `.strict()` at `packages/schemas/src/profiles.ts:70`) has `conversationLanguage: conversationLanguageSchema.optional()` already. If a future PR removes that field, revert mobile first or the `.strict()` parser will 400 the POST.
4. Drop the new test file (`router.language-coverage.test.ts`) and the per-flow eval-harness fixtures.

No data lost. No migration. No destructive operation.

## Validation

- `pnpm exec nx run api:test` passes (existing + new ratchet test + the per-flow Tier-1 snapshot fixtures).
- `pnpm exec nx test:integration api` passes — confirms the new `session-recap.nb-locale.integration.test.ts` (added in File Map) drives the threaded `conversationLanguage` through the real service path and into the assembled system prompt.
- `pnpm eval:llm` snapshots include all per-flow `nb-locale` fixtures (~17) plus the five additional `session-recap` locale fixtures (`de`, `es`, `ja`, `pl`, `pt`).
- Manual: change UI language to Norwegian on a fresh emulator profile, trigger a session recap, confirm the card prose is Norwegian.
