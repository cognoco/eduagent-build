## Completion Summary — WI-871 (deterministic consent-handoff coverage, ACCOUNT-17/19-27 + QA-09/12)

**What was done:** Added CI-stable jest coverage for the 11 P1 consent-handoff flow
IDs and promoted their flow-plan rows to ✅ Pass with exact test cites. No real
mailbox/SMTP was used; DB-backed paths stay authoritative in the existing
`consent-web.integration.test.ts`.

**What changed:** New deterministic suites — `apps/api/src/routes/consent-web.test.ts`
(ACCOUNT-27 + QA-12 deny-confirmation web route), `consent.test.ts` additions
(ACCOUNT-19 + QA-09 URL builder), `apps/mobile/src/app/(app)/_components/ConsentPendingGate.test.tsx`
(ACCOUNT-21/22), `ConsentWithdrawnGate.test.tsx` (ACCOUNT-25),
`apps/mobile/src/app/(app)/_hooks/use-post-approval-landing.test.ts` (ACCOUNT-24),
`apps/mobile/src/components/memory-consent-prompt.test.tsx` (ACCOUNT-17); ACCOUNT-20/26
cite the pre-existing `consent.test.tsx`. Flow-plan + inventory rows promoted with
cites. Mid-flight fix: typed the consent-web test's Hono env (`Variables: { db }`)
so `tsc --build` passes (the bare `new Hono()` gave `c.set('db')` a `never` key).

**Verification:** API consent suites 99 pass / 0 fail; mobile consent suites 40 pass /
0 fail; `tsc --build` clean (api + mobile); GC1 ratchet clean (0 new internal
jest.mock; the one secure-storage boundary mock uses gc1-allow + requireActual).
PR #1270: all 9 checks green (5 required + claude-review + CodeRabbit), CLEAN.
Squash-merged to `main` as `5d782593` (PR-head SHA `e333467a0`).

**Caveats / Follow-ups:** Real email/SMTP delivery and external OAuth/SSO provider
completion remain true external boundaries (out of unit scope). A separate
pre-existing `apps/api/src/inngest/functions/consent-reminders.test.ts` identity-v2
`resolveOrgId` defect was observed during this work (16 failures) — outside WI-871
scope, untouched; warrants its own tracked item.
