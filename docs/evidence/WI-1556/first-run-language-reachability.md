# WI-1556 — first-run reachability of the Mentor-language choice

Answers AC-1: which first-run identity variants reach the conversation-language
choice before their first Mentor exchange, and which strand on the database
default (`en`).

The extraction gap this item was raised for was real: before WI-1556 the
profile-wide `conversationLanguage` was set **silently from the device locale**
at profile creation and thereafter auto-synced from the app UI language, with no
learner-facing confirmation step anywhere in first run. A learner whose device
locale did not match their language — most sharply a parent-created child on a
parent's device — could reach their first Mentor exchange on a value nobody had
ever chosen.

## Reachability by variant

Gating predicate: `shouldRequireFirstMentorLanguageConfirmation`
(`apps/mobile/src/lib/first-mentor-language.ts`), mounted as a blocking gate
over the `(app)` routes in `apps/mobile/src/app/(app)/_layout.tsx`. It requires
`isCurrentUser === true`, strict `conversationLanguageConfirmed === false`, and
not-explicit-proxy.

| # | Variant | Reaches the choice before first Mentor? | Why |
|---|---|---|---|
| 1 | Self-created owner | **Yes** — gate blocks until confirmed | `isCurrentUser` true, unconfirmed |
| 2 | Parent-created child, before that child uses their own credential | **No — by design, not stranded** | The child is not the authenticated person (`isCurrentUser` false), so no self-write gate is raised. The parent's device locale is *not* inferred onto the child (see below). The child's own choice is deferred to variant 3. |
| 3 | Joined learner credential (the same child, once credentialed) | **Yes** — gate blocks until confirmed | `isCurrentUser` becomes true and the value is still unconfirmed, so the gate raises at their first run on their own credential |
| 4 | Existing learner revisiting settings | **No gate** — already confirmed; changes via More → Mentor language | `conversationLanguageConfirmed` true, so the blocking gate does not re-raise; the value stays editable |

Variant 2 is the one the item was raised about, and it is the subtle case: the
child never sees the picker *while acting as a parent-managed profile*, and that
is correct — they cannot legally write their own person yet. The stranding is
avoided not by showing a parent a picker for the child, but by (a) refusing to
infer the child's language from the parent's device, and (b) raising the gate at
variant 3, before that learner's own first Mentor exchange.

Reproduced as an executable table in
`apps/mobile/src/lib/first-mentor-language.test.ts` — one named case per variant
above, so a regression in any variant's reachability fails a test rather than
silently re-stranding a learner.

## Why variant 2 cannot inherit the parent's device locale

`useMentorLanguageSync` (`apps/mobile/src/hooks/use-mentor-language-sync.ts`)
returns early unless `activeProfile.isCurrentUser === true`, so a parent
switching to a managed child profile never syncs the parent's device locale onto
that child.

Server-side, `assertCallerIsActivePerson`
(`apps/api/src/services/family-access.ts`) requires the caller to be the exact
target person *and* to have nominated themselves explicitly, so no proxy or
sibling identity can write another person's conversation language.

## The fail-closed backstop

The mobile gate is UX, not authority — an older installed client can call the
API directly. `prepareExchangeContext`
(`apps/api/src/services/session/session-exchange.ts`) therefore rejects
`exchangeCount === 0` with `ConflictError` when the profile-bound person has no
`conversationLanguageConfirmedAt`, before any state mutation or LLM dispatch.
That is what makes "reaches the choice before the first Mentor exchange" a
property of the system rather than of the client build.

## What consumes the confirmed value

- The first Mentor exchange: the confirmed language is threaded into exchange 0
  by `prepareExchangeContext`.
- Voice: the Mentor input bar derives its speech locale from the learner's
  `conversationLanguage` via `getVoiceLocaleForLanguage`
  (`apps/mobile/src/lib/language-locales.ts`), wired in
  `apps/mobile/src/app/(app)/mentor.tsx`, so a non-English choice changes how
  the first exchange is spoken, not merely what is stored.

## Scope preserved

All ten `conversationLanguageSchema` values remain available at the gate, and
they stay deliberately separate from the seven-locale UI shell — a
conversation-only locale (cs, fr, it) is selectable for tutor prose while the UI
falls back to English. No new language list and no new identity authority were
introduced.
