# [MEDIUM] GET /account/deletion-status lacks the owner gate its three sibling routes enforce

**File:** [`apps/api/src/routes/account.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/routes/account.ts#L38-L44) (lines 38, 42, 44)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The three mutating/exporting account routes — POST /account/delete (L59), POST /account/cancel-deletion (L123), GET /account/export (L150) — all call assertOwnerProfile(c, ...) so only the account owner can use them. GET /account/deletion-status (L38-52) does NOT. Any non-owner profile active on the same account (e.g. a child on a parent's family account, who can legitimately resolve X-Profile-Id to their own profile) can therefore read getDeletionStatus(db, account.id), which returns {scheduled, deletionScheduledAt, gracePeriodEnds}. This is a same-account information read (no cross-tenant boundary is crossed) of low-sensitivity scheduling state, and the asymmetry may be intentional (so the client can render a 'your account will be deleted in N days' banner to any member). Flagged only because the deliberate owner-gating of every adjacent route makes the omission on this one worth a conscious decision rather than an accident.

## Recommendation

If account-deletion scheduling state is meant to be owner-only (parity with the other three routes), add assertOwnerProfile(c, 'Only the account owner can view deletion status.') at the top of the handler. If non-owner visibility is intentional, add a one-line comment documenting that the omission is deliberate so future reviewers don't 'fix' it inconsistently.

## Revalidation

**Verdict:** uncertain

The factual claim is verified: GET /account/deletion-status (account.ts:38-52) calls only `requireAccount()` and `getDeletionStatus(db, account.id)`, with no `assertOwnerProfile()`, whereas the three sibling routes — POST /account/delete (59), POST /account/cancel-deletion (123), GET /account/export (150) — all gate on it. `assertOwnerProfile` (family-access.ts:145-157) throws unless `profileMeta.isOwner === true`, so a non-owner profile on the same account can read `{scheduled, deletionScheduledAt, gracePeriodEnds}`. However, whether this is a vulnerability hinges entirely on undocumented product intent that the code cannot reveal: the disclosure is same-account (no cross-tenant boundary crossed) and of low-sensitivity scheduling state, and there is a principled reading where the asymmetry is deliberate — the three gated routes are all destructive mutations or data exports, while deletion-status is a read of state every family member arguably should see (a 'your account is being deleted in N days' banner). The finding itself is low-confidence and explicitly requests 'a conscious decision rather than an accident.' I cannot confirm from code alone whether owner-only was intended; the actionable item is documentation, and the security impact if it is a gap is minimal. Hence uncertain, leaning by-design.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-29)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-24)
