# Plan — WI-874 ([ACCOUNT-06/09/10/11] Complete account settings provider and native branch coverage)

## Goal

Each pass-with-issues row gets deterministic branch coverage OR an explicit,
honest blocked rationale (only where a branch genuinely cannot run in jest).
Master flow plan rows (`docs/flows/plans/flow-revision-plan-2026-06-17.md`)
already reference WI-874 on origin/main — update Notes to reflect the new
deterministic coverage where added.

## Investigation findings (code is ground truth)

- There is **no avatar upload / image-picker UI** anywhere in the account flow
  (`profiles.tsx` uses initials only; no `expo-image-picker`). ACCOUNT-06's
  "avatar/media branch" = the **render branch** in
  `apps/mobile/src/components/account/AccountAvatar.tsx`
  (`activeProfile.avatarUrl ? <Image> : initials`). That file has **no test**.
- ACCOUNT-09 age-gate boundary logic lives in
  `packages/schemas/src/age.ts` (`isAdultOwner`, `computeAgeBracket`,
  `isUnambiguouslyAdult`) — **already exhaustively boundary-tested**
  (`age.test.ts` covers ages 12/13/17/18/19, null/undefined birthYear, role
  gating) and in `navigation-contract.test.ts` (incl. #807 null-birthYear
  regression). The screen-level gate (`more/account.tsx`
  `showAccountSecurity`) is owner/non-owner tested in `account.test.tsx`.
- ACCOUNT-10 export: `more/privacy.tsx` `handleExport` has a
  `Platform.OS === 'web'` (Blob/anchor download) vs **native `Share.share`**
  branch. `privacy.test.tsx` covers the native Share path + the
  dismissed/error paths but **not the web download branch**.
- ACCOUNT-11 delete-account: `delete-account.tsx` confirmation state machine is
  thoroughly tested. The "email-delivery branch" (deletion-confirmation email
  via Inngest/provider) is a true external boundary — no client code path.

## Per-row decisions + acceptance check

### ACCOUNT-06 — avatar/media render branch  → ADD COVERAGE
**Action:** new `apps/mobile/src/components/account/AccountAvatar.test.tsx`.
Assert: (a) with `avatarUrl` set → an `<Image>` renders with that `uri`, no
initials; (b) with `avatarUrl` null → initials fallback renders (e.g. "AB" from
"Alex Brown", "?" from empty); (c) `activeProfile === null` → component returns
null; (d) press routes to `/(app)/account`.
**Boundary mocks only:** `expo-router` (native), `react-i18next` (i18n), and
`useProfile` shaped via the real `lib/profile` context provider through
`renderScreen` where possible — but AccountAvatar imports `useProfile`
directly; use the established `renderScreen({ profile })` util which provides
the real ProfileContext (no internal mock).
**Acceptance:** test passes; both render branches + null + nav asserted.

### ACCOUNT-09 — age/security boundary  → COVERED (cite existing) + 1 screen assertion
**Finding:** boundary math fully covered in `packages/schemas/src/age.test.ts`
and `navigation-contract.test.ts`. The remaining screen-level assertion worth
adding: `more/account.tsx` shows AccountSecurity for an adult owner and hides
it for a non-owner — `account.test.tsx` already has both
(`renders profile and security rows for owner`,
`hides account security section ... for non-owner`).
**Action:** No new test needed — branch is genuinely already covered. Document
the citations in the flow-plan Notes (change "source-checked" → name the
deterministic suites). This is "covered", not "blocked".
**Acceptance:** flow-plan ACCOUNT-09 Note cites `age.test.ts` +
`navigation-contract.test.ts` + `account.test.tsx`.

### ACCOUNT-10 — export web/native branch  → ADD COVERAGE
**Action:** add a test to `privacy.test.tsx` exercising the
`Platform.OS === 'web'` download branch: set `Platform.OS = 'web'`, stub a
minimal `globalThis.document.createElement` returning a fake anchor + stub
`URL.createObjectURL`/`revokeObjectURL`, press export, assert the anchor's
`download` is `mentomate-data-export.json`, `click()` was called, and the
export endpoint was hit. Restore `Platform.OS` after. Also assert the
**web `document` absent** guard (`if (!doc) return`) — early return, no throw.
**Acceptance:** new web-branch test passes; existing native Share test
unchanged.

### ACCOUNT-11 — delete confirmation/provider branch  → COVERED + email-delivery DOCUMENTED-BLOCKED
**Finding:** confirmation state machine, typed-DELETE gate, family-pool +
subscription advisories, double-tap guard, error path, scheduled/keep/sign-out
all tested in `delete-account.test.tsx`. The deletion-confirmation **email**
is dispatched server-side (Inngest/email provider) — no client branch exists to
exercise; it is a true external boundary.
**Action:** No new client test (confirmation branch already covered). Document
the email-delivery branch as blocked-external in the flow-plan Note (it already
says "email-delivery branch covered separately as blocked").
**Acceptance:** flow-plan ACCOUNT-11 Note cites `delete-account.test.tsx` for
the confirmation/provider branch and names email delivery as external.

## Files to touch

1. `apps/mobile/src/components/account/AccountAvatar.test.tsx` (NEW) — ACCOUNT-06
2. `apps/mobile/src/app/(app)/more/privacy.test.tsx` — ACCOUNT-10 web branch
3. `docs/flows/plans/flow-revision-plan-2026-06-17.md` — update ACCOUNT-06/09/10/11
   Notes to cite the deterministic suites / name the genuine external boundary.

## Validation

- `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/account/AccountAvatar.tsx "src/app/(app)/more/privacy.tsx" --no-coverage`
- `cd apps/mobile && pnpm exec tsc --noEmit`
- `pnpm exec nx lint mobile` (or eslint on touched files)
- i18n / no internal-mock guards (no new internal jest.mock added).
