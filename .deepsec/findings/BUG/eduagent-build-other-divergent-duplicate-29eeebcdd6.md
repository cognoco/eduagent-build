# [BUG] Two different `useRestoreConsent` hooks with incompatible signatures

**File:** [`apps/mobile/src/hooks/use-consent.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/hooks/use-consent.ts#L250) (lines 250)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-divergent-duplicate`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

`useRestoreConsent` is defined twice with divergent APIs. In `use-consent.ts:250` it takes `childProfileId` as a hook argument and returns `UseMutationResult<RestoreConsentResult, Error, void>`. In `use-restore-consent.ts:15` it takes no hook argument and accepts `{ childProfileId }` as the mutation variable, returning `UseMutationResult<ConsentActionResult, Error, RestoreConsentVariables>`. The `use-consent.ts` variant is consumed by `app/(app)/child/[profileId]/index.tsx`; the `use-restore-consent.ts` variant by `components/family/WithdrawalCountdownBanner.tsx`. Same name, same domain action, opposite calling conventions — a maintenance trap where a contributor importing the wrong one passes the id in the wrong place (hook arg vs mutate variable) and silently calls restore with an undefined/wrong id. Not a security issue: both ultimately send `childProfileId` to the server, which is the ownership authority. But it is exactly the kind of divergent-duplicate state the repo's 'Sweep when you fix' / 'clean up all artifacts' rules warn against.

## Recommendation

Consolidate to a single `useRestoreConsent` (and matching `useRevokeConsent`) hook with one signature, delete the duplicate, and update both call sites. If two ergonomics are genuinely needed, give them distinct names (e.g. `useRestoreConsentFor(childProfileId)` vs `useRestoreConsentMutation()`).

## Revalidation

**Verdict:** true-positive

Confirmed exactly as described, and it is a code-quality/maintenance defect, not a security issue. `use-consent.ts:250` defines `useRestoreConsent(childProfileId: string | undefined)` returning `UseMutationResult<RestoreConsentResult, Error, void>` (id passed as the HOOK argument, mutate takes void). `use-restore-consent.ts:15` defines `useRestoreConsent()` (no hook arg) returning `UseMutationResult<ConsentActionResult, Error, RestoreConsentVariables>` where the id is passed as the MUTATION VARIABLE (`{childProfileId}`). Same name, same domain action (PUT /consent/:childProfileId/restore), opposite calling conventions. Both are live: `app/(app)/child/[profileId]/index.tsx` imports the use-consent.ts variant (lines 23, 431, 648, passing the id as hook arg), while `components/family/WithdrawalCountdownBanner.tsx:5,23` imports the use-restore-consent.ts variant (no-arg). A contributor importing the wrong one would pass the id in the wrong position and silently restore with an undefined/wrong id. No security impact (the server is the ownership authority via assertOwnerProfile + familyLinks), but it is precisely the divergent-duplicate trap the repo's 'Sweep when you fix' rule warns against. Severity BUG is appropriate.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-26)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-19)
