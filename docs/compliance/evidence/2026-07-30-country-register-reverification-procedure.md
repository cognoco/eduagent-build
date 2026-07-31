# Country Register Re-Verification Procedure — v0.1 (Draft for DPO review, agent-drafted)

**Status:** Draft v0.1, 2026-07-30. For DPO review (Stephan Hartmann).
**Feeds:** DPO Action 3 — [`DPO exchanges/2026-07-26-action-register-tracker.md`](../DPO%20exchanges/2026-07-26-action-register-tracker.md) row 3: *"Re-verification procedure, residence-determination design, age-assurance design, technical blocking evidence."* This document covers the re-verification procedure only; see the companion documents [`2026-07-30-residence-determination-design.md`](2026-07-30-residence-determination-design.md) and [`2026-07-30-age-assurance-design.md`](2026-07-30-age-assurance-design.md) for the other two.
**Governs:** [`2026-07-23-13-plus-eea-launch-country-ruling.md`](../2026-07-23-13-plus-eea-launch-country-ruling.md) (the EEA Article 8 threshold register) and [`2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md`](../2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md) (the Route 1/Route 2 allowlist mechanism).

## 1. What is being re-verified

Two independent registers, currently maintained as **markdown documents** (not yet the DB-mastered `country_policy_registry` table described in the technical schema — see §4, [OPEN]):

1. **EEA Article 8 threshold register** — 30 rows, one per EEA country, each with a threshold age (13/14/15/16), a primary legal source, and a launch disposition. Two rows are explicitly flagged as unstable and required a launch-day recheck even before any re-verification cadence exists: **Norway** (pending proposal to raise the threshold from 13 to 15) and **Portugal** (Bill 398/XVII/1 in committee).
2. **Non-EEA screen records** (Route 2 of the perimeter ruling) — one dated screen document per admitted or evaluated non-EEA country, each concluding on age requirements, local-representative/licensing obligations, extra regulatory regimes, and a signed management risk acceptance. Only the United States has a screen record as of 2026-07-30, and it is explicitly **provisionally screened, not finally admitted** pending WI-1116 and launch-day rechecks.

## 2. When re-verification happens

| Trigger | Scope | Who acts |
|---|---|---|
| **Launch day** (each country's actual enablement date) | Full recheck of that country's row/screen against current law, regardless of how recently it was checked | Zuzana (operator), before flipping `launchStatus` to `enabled` |
| **Fixed cadence: every 6 months** from the country's last verified date | Full recheck of every *enabled* country's row/screen | Zuzana (operator) |
| **Named unstable-country trigger** | Norway (threshold-15 proposal) and Portugal (Bill 398/XVII/1) — recheck immediately before ANY country wave launches, not just their own, because both sit in Wave 0/Wave 1 | Zuzana (operator), per the 07-23 ruling's explicit instruction |
| **Named US revisit triggers** (perimeter ruling §"Revisit triggers") | KOSA/KIDS Act enactment; approaching ~25k US users (CA/SC consumer-count thresholds); Colorado AI Act effective 2027-01-01 | Zuzana (operator) |
| **Legal-change trigger (ad hoc)** | Any statutory amendment, DPA guidance update, or enacted bill affecting an enabled or candidate country's threshold, representative requirement, or child-safety regime | Whoever becomes aware first (product, legal counsel, or the DPO) escalates immediately — see §3 |
| **Expansion-wave entry** | Before any country moves from the "future support research perimeter" into the initial launch allowlist or a later wave, per the 07-23 ruling's Wave 0–3 sequence | Zuzana (operator) |

The 6-month cadence is this document's **[PROPOSED — confirm]** interval — neither source document states a fixed re-verification period; both state launch-day and legal-change triggers only. Six months is chosen to match the general pace of EU/EEA child-consent legislative activity observed in the underlying research (Denmark's 2024 threshold change, Norway's live proposal, Portugal's pending bill) without creating an unmanageable review burden for a pre-revenue team.

## 3. Who does it, and what sources are checked

**Owner:** Zuzana Kopecna (operator), as the person who ruled the original registers. External counsel input is required where the perimeter ruling's Route 2 condition (d) calls for it ("where material local-law questions remain").

**Per-country check, EEA (Route 1):**
1. Re-read the primary legal source cited in the 07-23 register's "Primary source" column for that country (a specific statute section, DPA guidance page, or consolidated-law portal).
2. Check for any pending bill or proposal at the same body that could change the threshold (as already done for Norway and Portugal — extend the same check to every enabled country, not just the two currently flagged).
3. Confirm the source URL still resolves and the cited text is unchanged; if the source moved or was superseded, find the current equivalent and record it.
4. Record the check in the `sourceProvenance` shape the technical schema expects (`title`, `url`, `checkedAt`) — see §4.

**Per-country check, non-EEA (Route 2):**
1. Re-confirm all four Route 2 conditions from the perimeter ruling: (a) age requirements still satisfied by the 13+ floor, (b) no new local-representative/registration/licensing requirement now applies, (c) no new material child-safety/AI/platform regime, (d) risk acceptance still current.
2. For the US specifically, check the three named revisit triggers above explicitly, not just generically.
3. Escalate any material change to the DPO before continuing to admit the country, per the DPO-agreement scope amendment (non-EEA substantive legal analysis is outside the DPO's statutory function, but GDPR-element implications — e.g., a change that undermines the Norwegian Article 8 reasoned-interpretation basis — are in scope for him).

## 4. How changes are recorded and escalated

**Recording:** update the relevant register document (the 07-23 ruling for EEA threshold changes, the perimeter ruling or a new dated screen record for non-EEA changes) with the new value, the date checked, and the source. Do not silently edit a historical ruling's conclusion — add a dated addendum or supersede with a new dated document, consistent with how the perimeter ruling itself explicitly "supersedes" and records DPO revisions inline rather than rewriting history.

**[OPEN — needs input]: today this re-verification procedure has nothing to write TO except markdown files.** The technical schema for a machine-enforced version of this register already exists — `packages/schemas/src/country-policy.ts` defines `countryPolicyRecordSchema` with exactly the fields a re-verification would update (`legalReviewedAt`, `legalReviewValidUntil`, `legalVerificationStatus`, `launchDayReviewRequired`, `sourceProvenance` array with `checkedAt` per source) — and a DB-mastered `country_policy_registry` table plus a loader (`apps/api/src/services/identity-v2/country-policy-loader.ts`) and a pure resolver function (`apps/api/src/services/identity-v2/country-policy.ts`, `resolveCountryPolicy()`) are built. **But as of this pass, `resolveJurisdiction()` — the one function that reads from that registry and produces a launch decision — is called only from test files** (`country-policy-loader.integration.test.ts`); a repo-wide search found no production route or service that calls it. This means: the country register that this procedure re-verifies is not yet the register the running application actually enforces against. Until that wiring exists, re-verification updates a compliance document, not a live gate. This is the single most important fact for the DPO to know about Action 3 — see the companion residence-determination-design document (§"Enforcement — code-verified state") for the full trace.

**Escalation:** any change discovered during re-verification that would newly block an enabled country, or that touches the Norwegian Article 8 reasoned-interpretation basis relied on for non-EEA minors, is escalated to Stephan Hartmann within 5 business days via the existing `dpo@zwizzly.com` forwarding channel (per Action Register Tracker P1), with the same package format already used for prior submissions (ruling doc + register attachment + a short summary of what changed and why).

## 5. Open items

- **[OPEN — needs input]** 6-month cadence is proposed, not confirmed by the DPO or management — needs a ruling.
- **[OPEN — needs input]** No production code path enforces the country register today (see §4) — this is an engineering gap, not a procedural one, but it means "technical blocking evidence" (the other half of DPO Action 3) cannot be produced until the resolver is wired into a route. Recommend surfacing this to engineering as a named work item before Action 3 can close.
- **[OPEN — needs input]** No named individual/role has been assigned as a backup to Zuzana for this procedure — a single-point-of-failure risk worth flagging given the DPO's emphasis on named responsible owners elsewhere in the action register.
