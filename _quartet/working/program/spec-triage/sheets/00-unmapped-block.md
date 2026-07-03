PROVENANCE: No standalone audit artifact found on disk (checked `docs/audit/`, `docs/flows/`, `_quartet/working/`, git log 2026-07-02..04 for "coverage"). Titles/Found-In fields use per-item code-anchor citations (file:line, "verified 2026-07-03") rather than a shared doc — the audit appears to have been captured straight into Cosmo (no durable markdown report to link back to). WI-1437/1438/1439/1473 are separately-sourced code-anchored orphans (doc-hygiene / model-vetting / re-home / spec follow-on), not test-coverage items, but share the "no spec/plan row" trait.

CLASSIFICATION:
- WI-1399 Billing silent-failure escalation gaps — engineering-quality (billing canon violation) → MVP flag
- WI-1400 V2 shell zero Maestro e2e (mentor/subjects/journal) — engineering-quality/ship-relevant → MVP flag
- WI-1401 Retire/fix stale+placeholder e2e yamls (false coverage signal) → coverage-debt backlog
- WI-1402 S0 /now route coverage gaps → coverage-debt backlog
- WI-1403 S4 /now supporter artifact-exclusion negative test missing → coverage-debt backlog
- WI-1404 S5 visibility HTTP route-boundary tests missing → coverage-debt backlog
- WI-1405 Billing v2 live-path/child-facing/top-up coverage gaps → coverage-debt backlog (billing-adjacent; watch for overlap w/ 1399)
- WI-1406 AUTH e2e + resilience-branch coverage gaps → MVP flag (auth/session integrity)
- WI-1407 Consent/profile gate coverage gaps → coverage-debt backlog
- WI-1408 Learning session resilience coverage gaps → coverage-debt backlog
- WI-1409 S2 subject hub + assessment coverage gaps → coverage-debt backlog
- WI-1410 Library/progress write-gating + data-isolation coverage gaps → coverage-debt backlog (data-isolation flavor — watch for RLS overlap, row 23)
- WI-1411 Practice/Quiz coverage gaps → coverage-debt backlog
- WI-1412 Dictation/Homework coverage gaps → coverage-debt backlog
- WI-1413 S3 avatar-admin parity coverage → coverage-debt backlog (time-boxed: S6 deletes this surface — verify before investing)
- WI-1414 Mobile cross-cutting seam coverage gaps → coverage-debt backlog
- WI-1416 V2 open rulings (4 product/architecture decisions) → design-fork → product ruling
- WI-1437 Surface milestone_reached as /now cards → ship-relevant candidate (feature gap, not test-debt) → MVP flag or backlog per product call
- WI-1438 Record challenge-grader model vetting + reconcile GRADER_MODEL → doc-hygiene → docs lane
- WI-1439 Fix stale status headers across shipped specs/plans → doc-hygiene → docs lane
- WI-1473 Spec+execute retrieval_events follow-ons (relearn nextAction, eval-corpus reader) → design-fork (reserved enum, not yet activated) → product ruling / backlog

SHIP-RELEVANT SHORTLIST:
- WI-1400 CONFIRMED — no V2-shell-specific Maestro yamls found. `apps/mobile/e2e/flows/` has 213 yaml flows total but none scoped to mentor/subjects/journal V2 tabs (checked `subjects/`, `account/`, `parent/`, `onboarding/` dirs — all legacy-surface or cross-cutting, zero `/now` or NowCard-stack flows). Claim holds.
- WI-1406 PARTIALLY CONFIRMED — MFA e2e yamls DO exist (`sign-in-mfa-{backup-code,email-code,phone,totp}.yaml`), so "zero MFA e2e" would be false; but the WI title says "MFA stubs" (i.e., thin/non-resilience-branch coverage), which is consistent with what exists — happy-path flows, not the resilience branches (session-revoked, sessionStorage replay, gate timeouts) the title calls out. Claim narrows to "resilience branches uncovered," not "no e2e at all" — still a legitimate gap, keep on shortlist but note the scope correction.
- WI-1399 CONFIRMED — `apps/api/src/inngest/functions/billing-alias-merge.ts` has no `onFailure` handler, unlike sibling `billing-subscription-store-teardown.ts` which does declare one (with a dedicated test asserting it). Matches repo canon: "Silent recovery without escalation is banned in billing... code." Real gap, correctly flagged.
- No additional ship-relevant items found on this pass beyond the three above; WI-1437 (milestone cards) is a feature gap worth a product look but isn't a coverage/resilience item — kept separate, not added to this shortlist.

RECOMMENDATION: Route WI-1401–1414 (13 items, minus 1413/1410 flagged below) into a new coverage-debt workstream (candidate: INI under V2-finalization or a new "test-coverage-hardening" lane, echoing the archived 2026-05-17 plan pattern). Elevate WI-1399, WI-1400, WI-1406 into MVP consideration (billing-canon violation + zero V2 e2e + auth resilience gaps are the three with real launch-quality exposure). WI-1413 should be time-boxed against the S6 avatar-admin deletion (row 17/S6) — don't invest if the surface is being deleted. WI-1410 should be cross-checked against row 23 (RLS enforcement) before scoping, to avoid duplicate work. WI-1416 and WI-1473 go to product ruling (open decisions / unactivated enum, not backlog-shaped). WI-1438 and WI-1439 go to the docs lane as pure hygiene, no code risk. WI-1437 needs a product call on whether milestone cards are MVP-scope or post-launch polish — route as a design-fork alongside WI-1416, not into coverage-debt.
