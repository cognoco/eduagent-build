# Audit triage sheet — RULED 2026-07-14, captured to Cosmo as WI-1985..WI-2013

> **Final ruling (operator, 2026-07-14).** MoSCoW cut with low inclusion threshold:
> 8 must-have + 13 should-have = 21 MVP execution items (riders: #14 inside 009,
> #16 inside 006); 010 = first fast-follow (deferred by structure — spike, L effort —
> not severity); 6 backlog items; #12 = plain edit, no WI. Verification pass
> (2026-07-14): 013/014/015 adversarially CONFIRMED (HIGH), 021 verified,
> **019 downgraded P1→P2** (server independently enforces exact-date gate; client-only
> UX inconsistency). Nice-to-haves ruled IN under amended rule: #14, 001.
>
> **Cosmo capture (2026-07-14):** WI-1985..1992 = must-have P1 (order: 013, 014, 015,
> 021, 003, 004, 005, 002); WI-1993..2005 = should-have P2 (019, 017, 020, 022, 023,
> 009+#14, 006+#16, 007, 008, 016, 024, systemic-guard, 001); WI-2006 = 010 spike
> (fast-follow); WI-2007..2012 = backlog (011, 012, #11, #13, #17, #10);
> **WI-2013 = umbrella** (carries the roadmap-lockdown dedup/adjacency-pass
> requirement — known adjacency: WI-1986 vs Gemini legacy-path removal).
> Workstream/sprint placement (MVP holding pen) is triage's job — all items sit at
> Stage=Captured.

Original sheet as presented for ruling follows.

# Audit triage sheet — rule each row: ACCEPT / DEFER / REJECT

All 24 plans + 7 unplanned findings from the `/improve` audit (commit `8c049b93f`).
Verification status: **V✓** = independently adversarially verified at source (2026-07-14);
**A** = advisor-vetted only (auditor re-read source, no independent second check).

## Bucket A — Launch gates (confirmed child-safety/compliance P1s)

Recommendation: ACCEPT all four, MVP-blocking. These are statutory/child-safety
defects in a product for minors; there is no defensible "later."

| Plan | Finding | Verified | Rec | Ruling |
|------|---------|----------|-----|--------|
| 013 | GDPR/COPPA person-scoped erasure never completes (FK RESTRICT, no edge teardown; root cause: comment believes "FK cascades handle all data") | V✓ HIGH | MVP | |
| 014 | Under-18 Gemini ban bypassable on legacy fallback; Gemini *guaranteed* registered on that path; prod safe only via env flag (default 'false') | V✓ HIGH | MVP | |
| 015 | Minors' transcripts in plaintext AsyncStorage; sign-out purge is a racy accident (~2s window; crash → snapshot persists forever) | V✓ HIGH | MVP | |
| 021 | Homework photos of minors never deleted from device cache; `deleteAsync` = 0 occurrences in mobile src | V✓ | MVP | |

## Bucket B — Security/authz seam (quick-run P1s, advisor-vetted)

Recommendation: ACCEPT 003 + 004 for MVP (same minors-data class as Bucket A);
010 is the follow-on spike — fast-follow.

| Plan | Finding | Verified | Rec | Ruling |
|------|---------|----------|-----|--------|
| 003 | X-Profile-Id owner-gate IDOR on 7 un-swept routes | A | MVP | |
| 004 | Learner free-text sent to Sentry; promised scrubber absent | A | MVP | |
| 010 | Read-side profile-authority check (spike + fix; depends on 003) | A | fast-follow | |

## Bucket C — Correctness & money (P2)

Recommendation: ACCEPT as fast-follow; 005 is money-path and cheap — could ride MVP.

| Plan | Finding | Verified | Rec | Ruling |
|------|---------|----------|-----|--------|
| 005 | Billing month-overflow (Jan 31 → Mar 3) across 9 money-path sites | V✓ | MVP-or-FF | |
| 019 | Adult-owner gate year-only on client; server enforces correctly → **downgraded P1→P2** (UX inconsistency) | V✓ HIGH | fast-follow | |
| 009 | Two session idempotency gates, one fail-open | A | fast-follow | |
| 017 | `getSubjectProgress` reads arbitrary curriculum version | A | fast-follow | |
| 020 | One malformed signal field discards entire LLM envelope | A | fast-follow | |
| 022 | Blind metadata full-replace clobbers challenge-round write | A | fast-follow | |
| 023 | Swallowed dedup-log write → parent double-notified | A | fast-follow | |

## Bucket D — Test/CI infrastructure

Recommendation: ACCEPT 002 with Bucket A/B (it gates whether their break tests
run in CI at all); 016 early for leverage; rest fast-follow.

| Plan | Finding | Verified | Rec | Ruling |
|------|---------|----------|-----|--------|
| 002 | CI change-class router skips integration suite on service-only diffs | A | MVP (gate) | |
| 016 | CI runs ~483 mobile suites serially | A | early (leverage) | |
| 006 | Family-join route tests (fold finding #16 in here) | A | fast-follow | |
| 007 | Rate-limiter unit tests | A | fast-follow | |
| 008 | Webhook dispatcher + top-up money tests | A | fast-follow | |
| 011 | Inngest replay harness: adopt or delete | A | backlog | |

## Bucket E — Hygiene tail

Recommendation: 024 accept (one-line dep removal + doc fix); 001/012 backlog.

| Plan | Finding | Verified | Rec | Ruling |
|------|---------|----------|-----|--------|
| 024 | Remove unused `@naxodev/nx-cloudflare` (drags Next.js + 5 advisories) | A | accept | |
| 001 | Curriculum-adapt switch exhaustiveness (Fable run) | A | backlog | |
| 012 | `normalizeReplyText` corrupts escape-sequence prose | A | backlog | |

## Unplanned findings (#10–#17, vetted, deliberately no plan)

Recommendation: #12 just fix (one edit, no WI needed — or smallest possible WI);
#11 promote if LLM-cost work is ever scheduled; #16 fold into 006; rest backlog.

| # | Finding | Rec | Ruling |
|---|---------|-----|--------|
| 12 | AGENTS.md snapshot counts wrong (584 suites not 329; 74 Inngest not 69; verified) | fix now | |
| 11 | `review-calibration-grade` double-charges LLM call on retry | backlog (promote w/ cost work) | |
| 16 | Speaking-practice stale-response overwrite | fold into 006 | |
| 10 | Memory-consent toggle race (no row lock) | fix-on-touch | |
| 14 | `dispatchId` from `Date.now()` outside `step.run` | fix-on-touch | |
| 13 | Two runtime circular imports | backlog | |
| 17 | `.nullable().optional()` drift, ~10 internal-event sites | backlog | |

## Systemic item (new — proposed, not from the audit)

| Item | Rationale | Rec | Ruling |
|------|-----------|-----|--------|
| Guard for "safety gate on primary path only" class | All four confirmed P1s share the archetype: gate enforced on happy path, absent on fallback/secondary/teardown path. A review-rule + targeted guard tests would catch the class, not just these instances. | capture as WI | |
