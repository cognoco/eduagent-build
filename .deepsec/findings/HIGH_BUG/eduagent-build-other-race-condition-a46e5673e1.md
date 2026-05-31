# [HIGH_BUG] Deletion cancellation/restoration checks are not atomic with final deletes

**File:** [`apps/api/src/services/deletion.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/deletion.ts#L162-L171) (lines 162, 171)
**Project:** eduagent-build
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

executeDeletion() and deleteProfile() delete solely by primary key. Their production call sites check cancellation or consent/archive state in separate steps and then call these helpers. If account deletion is cancelled, or consent is restored/archive status cleared, after the check but before the unconditional DELETE, the account/profile can still be deleted and cascade child records. The pending-consent path uses an atomic guarded delete, but these account/profile paths do not.

## Recommendation

Encode the still-valid deletion predicate in the DELETE WHERE clause, or run check and delete in a transaction with row locks. For accounts, require an active deletion schedule with no later cancellation. For profiles, require the profile is still withdrawn/archived and not restored.

## Revalidation

**Verdict:** true-positive

The finding is a compound claim and is now only half-accurate. The ACCOUNT path is fixed: executeDeletion (lines 233-245) no longer deletes solely by primary key — its WHERE carries the same cancellation predicate as isDeletionCancelled() (deletionScheduledAt IS NOT NULL AND (deletionCancelledAt IS NULL OR deletionCancelledAt <= deletionScheduledAt)), so a cancel racing the post-grace-period Inngest step cannot delete a cancelled account ([Fix Bug #494]). The PROFILE path, however, remains exactly as described. deleteProfile (lines 279-286) is still an unconditional `DELETE FROM profiles WHERE id = $1`. Its only production caller, archive-cleanup.ts, performs separate-step reads — getConsentStatus(), then getProfileForConsentRevocation() for archivedAt, then a retention-window check — and finally calls deleteProfile() with no predicate. restoreConsent() (consent.ts:1234-1256) atomically sets status=CONSENTED and clears profiles.archivedAt in one transaction. If a restore commits AFTER the archive-cleanup reads but BEFORE the DELETE, the unconditional delete still matches by id and hard-deletes the just-restored profile, cascading all child records via FK. The defence-in-depth getConsentStatus check narrows but does not close the window (it only catches restores that commit before that read). The codebase already proves the team treats this pattern as a real race: the consent-revocation path uses the atomic deleteProfileIfConsentWithdrawn (WHERE ... FOR UPDATE + EXISTS) and deleteProfileIfNoConsent (WHERE ... NOT EXISTS) — archive-cleanup is the one site that does not adopt an equivalent guard. The stale line numbers (162/171 now point inside getDeletionStatus) confirm the finding predates the executeDeletion hardening, but the deleteProfile/archive-cleanup race the finding names is genuinely unaddressed. Window is narrow (two sequential awaits, 30 days out, no attacker timing control) but the outcome — irreversible cascade deletion of a profile the parent explicitly restored — is regulatory-sensitive, so I leave severity at HIGH_BUG and recommend an atomic guarded delete (e.g. delete only if still archived and not CONSENTED).

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-24)
